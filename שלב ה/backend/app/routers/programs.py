"""Stage 4 programs: the two functions, two procedures and the trigger demos.

Every endpoint runs on one connection inside one transaction. `mode` decides
commit (apply) or rollback (preview). Demo endpoints answer HTTP 200 with
{ok:false, error:{message, code}} when the database raises, because those
errors are the expected outcome of several demos.
"""
from __future__ import annotations

import datetime as dt
import time
from typing import Any, Callable, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
import psycopg
from psycopg import sql

from ..db import columns_of, error_payload, get_conn
from ..security import require_token

router = APIRouter(prefix="/programs", tags=["programs"], dependencies=[Depends(require_token)])

Mode = Literal["preview", "apply"]

EXPECTED_ROUTINES = ["fn_player_activity_score", "fn_club_report", "sp_process_billing_cycle", "sp_security_review"]
EXPECTED_TRIGGERS = ["trg_player_update", "trg_login_log_insert"]


class DemoError(Exception):
    """A demo precondition failed (e.g. unknown player); reported like a DB error."""


def _grid(cur: psycopg.Cursor) -> dict[str, Any]:
    return {"columns": columns_of(cur), "rows": cur.fetchall()}


def _q(cur: psycopg.Cursor, query: str, params: Any = None) -> dict[str, Any]:
    cur.execute(query, params)
    return _grid(cur)


def _run(work: Callable[[psycopg.Cursor], dict[str, Any]], mode: Mode | None = None) -> dict[str, Any]:
    """Run work(cur) in one transaction. mode None or 'preview' rolls back, 'apply' commits."""
    started = time.perf_counter()
    with get_conn() as (conn, notices):
        try:
            with conn.cursor() as cur:
                payload = {"ok": True, **work(cur)}
            if mode == "apply":
                conn.commit()
            else:
                conn.rollback()
        except psycopg.Error as exc:
            payload = {"ok": False, "error": error_payload(exc)}
        except DemoError as exc:
            payload = {"ok": False, "error": {"message": str(exc), "code": None}}
    if mode is not None:
        payload["mode"] = mode
    payload["notices"] = notices.items
    payload["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return payload


# ---------------------------------------------------------------- health

@router.get("/health")
def health():
    with get_conn() as (conn, _notices):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.proname AS name,
                       CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' END AS type
                FROM   pg_proc p
                JOIN   pg_namespace n ON n.oid = p.pronamespace
                WHERE  n.nspname = 'public' AND p.proname = ANY(%s)
                ORDER  BY 1
                """,
                (EXPECTED_ROUTINES,),
            )
            routines = cur.fetchall()
            cur.execute(
                """
                SELECT trigger_name AS name, event_object_table AS "table", event_manipulation AS event
                FROM   information_schema.triggers
                WHERE  trigger_schema = 'public'
                ORDER  BY 1
                """
            )
            triggers = cur.fetchall()
        conn.commit()
    found = {r["name"] for r in routines} | {t["name"] for t in triggers}
    missing = [n for n in EXPECTED_ROUTINES + EXPECTED_TRIGGERS if n not in found]
    return {"ok": not missing, "routines": routines, "triggers": triggers, "missing": missing}


# ---------------------------------------------------------------- function 1

class ActivityScoreIn(BaseModel):
    player_id: int
    days_back: int = 365


@router.post("/activity-score")
def activity_score(body: ActivityScoreIn):
    def work(cur: psycopg.Cursor) -> dict[str, Any]:
        cur.execute("SELECT fn_player_activity_score(%s, %s) AS score", (body.player_id, body.days_back))
        score = cur.fetchone()["score"]
        cur.execute(
            """
            SELECT player_id, username, first_name || ' ' || last_name AS full_name, status_code AS status
            FROM   player WHERE player_id = %s
            """,
            (body.player_id,),
        )
        return {"score": score, "player": cur.fetchone()}

    return _run(work)


# ---------------------------------------------------------------- function 2

class ClubReportIn(BaseModel):
    country: str | None = None
    min_members: int = 0


@router.post("/club-report")
def club_report(body: ClubReportIn):
    country = (body.country or "").strip().upper() or None

    def work(cur: psycopg.Cursor) -> dict[str, Any]:
        cur.execute("SELECT fn_club_report(%s::char(2), %s)", (country, body.min_members))
        grid = _q(cur, "FETCH ALL IN club_report_cur")
        return {**grid, "rowcount": len(grid["rows"]), "country": country}

    return _run(work)


# ---------------------------------------------------------------- procedure 1

SUBSCRIPTIONS_BY_STATUS = """
SELECT status_code, COUNT(*) AS subscriptions
FROM   player_subscription
GROUP  BY status_code
ORDER  BY status_code
"""

DUE_SUBSCRIPTIONS = """
SELECT ps.subscription_id, p.username, ps.billing_cycle_code, ps.auto_renew,
       ps.next_billing_date, ps.status_code
FROM   player_subscription ps
JOIN   player p ON p.player_id = ps.player_id
WHERE  ps.status_code = 'active'
  AND  ps.next_billing_date IS NOT NULL
  AND  ps.next_billing_date <= %s
ORDER  BY ps.next_billing_date, ps.subscription_id
LIMIT  10
"""

SUBSCRIPTIONS_BY_ID = """
SELECT ps.subscription_id, p.username, ps.billing_cycle_code, ps.auto_renew,
       ps.next_billing_date, ps.status_code
FROM   player_subscription ps
JOIN   player p ON p.player_id = ps.player_id
WHERE  ps.subscription_id = ANY(%s)
"""


class BillingCycleIn(BaseModel):
    as_of: dt.date = dt.date(2026, 8, 18)
    limit: int = Field(50, ge=0)
    mode: Mode = "preview"


@router.post("/billing-cycle")
def billing_cycle(body: BillingCycleIn):
    def work(cur: psycopg.Cursor) -> dict[str, Any]:
        before_status = _q(cur, SUBSCRIPTIONS_BY_STATUS)
        before_due = _q(cur, DUE_SUBSCRIPTIONS, (body.as_of,))
        ids = [r["subscription_id"] for r in before_due["rows"]]
        cur.execute("CALL sp_process_billing_cycle(%s, %s, %s, %s)", (body.as_of, body.limit, 0, 0))
        out = cur.fetchone()
        after_status = _q(cur, SUBSCRIPTIONS_BY_STATUS)
        after_due = _q(cur, SUBSCRIPTIONS_BY_ID, (ids,))
        after_due["rows"].sort(key=lambda r: ids.index(r["subscription_id"]))  # same order as before
        return {
            "renewed": out["p_renewed"],
            "expired": out["p_expired"],
            "before": {"status": before_status, "due": before_due},
            "after": {"status": after_status, "due": after_due},
        }

    return _run(work, body.mode)


# ---------------------------------------------------------------- procedure 2

PLAYERS_BY_STATUS = """
SELECT status_code, COUNT(*) AS players
FROM   player
GROUP  BY status_code
ORDER  BY status_code
"""

MEMBERSHIPS_BY_STATUS = """
SELECT status_code, COUNT(*) AS memberships
FROM   club_membership
GROUP  BY status_code
ORDER  BY status_code
"""


class SecurityReviewIn(BaseModel):
    days_back: int = 3000
    min_logins: int = 20
    threshold_pct: float = 15.0
    mode: Mode = "preview"


@router.post("/security-review")
def security_review(body: SecurityReviewIn):
    def snapshot(cur: psycopg.Cursor) -> dict[str, Any]:
        return {"players": _q(cur, PLAYERS_BY_STATUS), "memberships": _q(cur, MEMBERSHIPS_BY_STATUS)}

    def work(cur: psycopg.Cursor) -> dict[str, Any]:
        before = snapshot(cur)
        cur.execute(
            "CALL sp_security_review(%s, %s, %s::numeric)",
            (body.days_back, body.min_logins, body.threshold_pct),
        )
        return {"before": before, "after": snapshot(cur)}

    return _run(work, body.mode)


# ---------------------------------------------------------------- trigger 1: rating guard

PLAYER_RATINGS = """
SELECT player_id, username, rating_classical, rating_rapid, rating_blitz
FROM   player WHERE player_id = %s
"""


class RatingJumpIn(BaseModel):
    player_id: int
    delta: int
    field: Literal["rating_classical", "rating_rapid", "rating_blitz"] = "rating_classical"
    mode: Mode = "preview"


@router.post("/trigger/rating-jump")
def trigger_rating_jump(body: RatingJumpIn):
    def work(cur: psycopg.Cursor) -> dict[str, Any]:
        before = _q(cur, PLAYER_RATINGS, (body.player_id,))
        if not before["rows"]:
            raise DemoError(f"Player {body.player_id} does not exist")
        cur.execute(
            sql.SQL("UPDATE player SET {f} = {f} + %s WHERE player_id = %s").format(f=sql.Identifier(body.field)),
            (body.delta, body.player_id),
        )
        return {"before": before, "after": _q(cur, PLAYER_RATINGS, (body.player_id,))}

    return _run(work, body.mode)


# ---------------------------------------------------------------- trigger 1: ban cascade

PLAYER_STATUS = "SELECT player_id, username, status_code FROM player WHERE player_id = %s"

PLAYER_MEMBERSHIPS_BY_STATUS = """
SELECT status_code, COUNT(*) AS memberships
FROM   club_membership
WHERE  player_id = %s
GROUP  BY status_code
ORDER  BY status_code
"""


class BanCascadeIn(BaseModel):
    player_id: int
    mode: Mode = "preview"


@router.post("/trigger/ban-cascade")
def trigger_ban_cascade(body: BanCascadeIn):
    def snapshot(cur: psycopg.Cursor) -> dict[str, Any]:
        return {
            "player": _q(cur, PLAYER_STATUS, (body.player_id,)),
            "memberships": _q(cur, PLAYER_MEMBERSHIPS_BY_STATUS, (body.player_id,)),
        }

    def work(cur: psycopg.Cursor) -> dict[str, Any]:
        before = snapshot(cur)
        if not before["player"]["rows"]:
            raise DemoError(f"Player {body.player_id} does not exist")
        cur.execute("UPDATE player SET status_code = 'banned' WHERE player_id = %s", (body.player_id,))
        return {"before": before, "after": snapshot(cur)}

    return _run(work, body.mode)


@router.get("/trigger/ban-candidates")
def ban_candidates():
    with get_conn() as (conn, _notices):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.player_id, p.username, COUNT(*) AS active_memberships
                FROM   player p
                JOIN   club_membership cm ON cm.player_id = p.player_id AND cm.status_code = 'active'
                WHERE  p.status_code = 'active'
                GROUP  BY p.player_id, p.username
                ORDER  BY active_memberships DESC, p.player_id
                LIMIT  10
                """
            )
            rows = cur.fetchall()
        conn.commit()
    return rows


# ---------------------------------------------------------------- trigger 2: login insert

class LoginInsertIn(BaseModel):
    player_id: int
    device_type: str = "mobile"
    login_status_code: str = "success"
    failure_reason: str | None = "wrong password"
    session_duration_sec: int = Field(900, ge=0, le=86400)
    ip_address: str = "10.0.0.7"
    country_detected: str | None = "IL"
    city_detected: str | None = "Jerusalem"
    operating_system: str = "Android 14"
    browser: str = "Chrome"
    is_suspicious: bool = False
    login_date: dt.date = dt.date(2026, 3, 25)
    mode: Mode = "preview"


@router.post("/trigger/login-insert")
def trigger_login_insert(body: LoginInsertIn):
    def work(cur: psycopg.Cursor) -> dict[str, Any]:
        cur.execute(
            """
            INSERT INTO login_log
                (log_id, player_id, ip_address, country_detected, city_detected,
                 device_type, operating_system, browser, login_status_code,
                 failure_reason, session_duration_sec, is_suspicious, login_date, client_id)
            VALUES
                ((SELECT COALESCE(MAX(log_id), 0) + 1 FROM login_log),
                 %(player_id)s, %(ip_address)s, %(country_detected)s, %(city_detected)s,
                 %(device_type)s, %(operating_system)s, %(browser)s, %(login_status_code)s,
                 %(failure_reason)s, %(session_duration_sec)s, %(is_suspicious)s, %(login_date)s, NULL)
            RETURNING *
            """,
            body.model_dump(exclude={"mode"}),
        )
        return {"row": cur.fetchone()}

    return _run(work, body.mode)


@router.get("/trigger/login-candidates")
def login_candidates():
    with get_conn() as (conn, _notices):
        with conn.cursor() as cur:
            cur.execute(
                "SELECT player_id, username FROM player WHERE status_code = 'active' ORDER BY player_id LIMIT 5"
            )
            active = cur.fetchall()
            cur.execute(
                "SELECT player_id, username FROM player WHERE status_code = 'banned' ORDER BY player_id LIMIT 3"
            )
            banned = cur.fetchall()
        conn.commit()
    return {"active": active, "banned": banned}
