"""Stage 2 query catalog: 8 SELECT queries (Q5-Q8 in two forms), 3 UPDATE and 3 DELETE.

The SQL is the Stage 2 text with each literal replaced by a named psycopg
placeholder. Execution always binds parameters; the `sql` returned by a run
is a display-only rendering with the values substituted.
"""
from __future__ import annotations

import datetime as dt
import re
import time
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import columns_of, get_conn
from ..security import require_token

router = APIRouter(prefix="/queries", tags=["queries"], dependencies=[Depends(require_token)])

MAX_ROWS = 500
SAMPLE_ROWS = 50


def _limit(default: int) -> dict[str, Any]:
    return {"name": "limit", "label": "Max rows", "type": "int", "default": default, "min": 1, "max": MAX_ROWS}


def _days(default: int, help_text: str) -> dict[str, Any]:
    return {"name": "days", "label": "Days", "type": "int", "default": default, "min": 1, "max": 5000, "help": help_text}


def _select(name: str, label: str, default: str, codes: list[str]) -> dict[str, Any]:
    return {
        "name": name,
        "label": label,
        "type": "select",
        "default": default,
        "options": [{"value": c, "label": c.capitalize()} for c in codes],
    }


PLAYER_STATUS = _select("status", "Player status", "active", ["active", "suspended", "banned"])
SUBSCRIPTION_STATUS = _select("status", "Subscription status", "active", ["active", "cancelled", "expired", "paused"])

Q5_HAVING = "HAVING COUNT(DISTINCT cm.club_id) >= %(min_clubs)s"

QUERIES: list[dict[str, Any]] = [
    {
        "id": "q1",
        "title": "Active players with ratings",
        "description": (
            "Lists players in the chosen status with their three ratings and the number of clubs they are "
            "active in, strongest classical rating first. Joins player to club_membership with a LEFT JOIN "
            "so players without any club still appear."
        ),
        "screen": "Player Dashboard",
        "kind": "select",
        "tables": ["player", "club_membership"],
        "params": [PLAYER_STATUS, _limit(20)],
        "variants": [
            {
                "key": "A",
                "label": "LEFT JOIN + GROUP BY",
                "note": "The original filters status 'active' and uses LIMIT 20; both are parameters here.",
                "sql": """SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name   AS full_name,
    p.country_code,
    p.rating_classical,
    p.rating_rapid,
    p.rating_blitz,
    p.registration_date,
    COUNT(DISTINCT cm.club_id)            AS active_clubs_count
FROM player p
LEFT JOIN club_membership cm
       ON cm.player_id    = p.player_id
      AND cm.status_code  = 'active'
WHERE p.status_code = %(status)s
GROUP BY
    p.player_id, p.username, p.first_name, p.last_name,
    p.country_code, p.rating_classical, p.rating_rapid,
    p.rating_blitz, p.registration_date
ORDER BY p.rating_classical DESC
LIMIT %(limit)s""",
            }
        ],
    },
    {
        "id": "q2",
        "title": "Monthly login activity",
        "description": (
            "Aggregates the login log per calendar month: total, successful and failed logins, suspicious "
            "logins and the average session length. Single table login_log, grouped by EXTRACT(YEAR) and "
            "EXTRACT(MONTH)."
        ),
        "screen": "Security Dashboard / Reports",
        "kind": "select",
        "tables": ["login_log"],
        "params": [
            {"name": "year_from", "label": "From year", "type": "int", "default": 2018, "min": 2000, "max": 2100},
            {"name": "year_to", "label": "To year", "type": "int", "default": 2026, "min": 2000, "max": 2100},
        ],
        "chart": {"type": "line", "x": ["login_year", "login_month"], "series": ["total_logins", "failed_logins", "suspicious_count"]},
        "variants": [
            {
                "key": "A",
                "label": "EXTRACT + GROUP BY",
                "note": (
                    "The original has no WHERE clause; the year range is an added filter on login_date "
                    "(served by idx_login_log_date). Rows come newest month first, as in the original."
                ),
                "sql": """SELECT
    EXTRACT(YEAR  FROM login_date)::INTEGER             AS login_year,
    EXTRACT(MONTH FROM login_date)::INTEGER             AS login_month,
    COUNT(*)                                            AS total_logins,
    SUM(CASE WHEN login_status_code = 'success' THEN 1 ELSE 0 END) AS successful_logins,
    SUM(CASE WHEN login_status_code = 'failed'  THEN 1 ELSE 0 END) AS failed_logins,
    SUM(CASE WHEN is_suspicious = TRUE          THEN 1 ELSE 0 END) AS suspicious_count,
    ROUND(AVG(session_duration_sec), 0)                AS avg_session_sec
FROM login_log
WHERE login_date >= make_date(%(year_from)s, 1, 1)
  AND login_date <  make_date(%(year_to)s + 1, 1, 1)
GROUP BY
    EXTRACT(YEAR  FROM login_date),
    EXTRACT(MONTH FROM login_date)
ORDER BY login_year DESC, login_month DESC""",
            }
        ],
    },
    {
        "id": "q3",
        "title": "Most popular subscription tiers",
        "description": (
            "Ranks subscription tiers by active subscribers, showing prices, feature flags and cancelled "
            "subscribers. Joins subscription_tier to player_subscription."
        ),
        "screen": "Subscription Analytics",
        "kind": "select",
        "tables": ["subscription_tier", "player_subscription"],
        "params": [_limit(15)],
        "chart": {"type": "bar", "x": "tier_name", "series": ["active_subscribers"]},
        "variants": [
            {
                "key": "A",
                "label": "JOIN + GROUP BY",
                "note": "The original uses LIMIT 15; it is a parameter here.",
                "sql": """SELECT
    st.tier_name,
    COUNT(ps.subscription_id)                                        AS total_subscribers,
    SUM(CASE WHEN ps.status_code = 'active'    THEN 1 ELSE 0 END)   AS active_subscribers,
    st.price_monthly,
    st.price_annual,
    st.has_analytics,
    st.has_puzzles,
    st.has_engine,
    SUM(CASE WHEN ps.status_code = 'cancelled' THEN 1 ELSE 0 END)   AS cancelled_subscribers
FROM subscription_tier st
JOIN player_subscription ps ON ps.tier_id = st.tier_id
GROUP BY
    st.tier_id, st.tier_name, st.price_monthly, st.price_annual,
    st.has_analytics, st.has_puzzles, st.has_engine
ORDER BY active_subscribers DESC, total_subscribers DESC
LIMIT %(limit)s""",
            }
        ],
    },
    {
        "id": "q4",
        "title": "Social leaderboard",
        "description": (
            "Active players ranked by incoming social connections: accepted friends, followers and the "
            "total. LEFT JOIN from player to social_connection on the target player."
        ),
        "screen": "Social Leaderboard",
        "kind": "select",
        "tables": ["player", "social_connection"],
        "params": [_limit(15)],
        "chart": {"type": "bar", "x": "username", "series": ["total_connections"]},
        "variants": [
            {
                "key": "A",
                "label": "LEFT JOIN + COUNT(CASE)",
                "note": "The original uses LIMIT 15; it is a parameter here.",
                "sql": """SELECT
    p.username,
    p.first_name || ' ' || p.last_name   AS full_name,
    p.country_code,
    p.rating_classical,
    COUNT(CASE WHEN sc.connection_type_code = 'friend'
               AND  sc.status_code          = 'accepted' THEN 1 END) AS accepted_friends,
    COUNT(CASE WHEN sc.connection_type_code = 'follow'   THEN 1 END) AS followers,
    COUNT(sc.connection_id)                                           AS total_connections
FROM player p
LEFT JOIN social_connection sc ON sc.to_player_id = p.player_id
WHERE p.status_code = 'active'
GROUP BY
    p.player_id, p.username, p.first_name, p.last_name,
    p.country_code, p.rating_classical
ORDER BY total_connections DESC
LIMIT %(limit)s""",
            }
        ],
    },
    {
        "id": "q5",
        "title": "Players in at least N active clubs",
        "description": (
            "Finds players who are active members of at least N clubs, most clubs first. Uses player and "
            "club_membership. No LIMIT in the original; results are capped at 500 rows."
        ),
        "screen": "Club Management - High Engagement Players",
        "kind": "select",
        "tables": ["player", "club_membership"],
        "params": [
            {
                "name": "min_clubs",
                "label": "Minimum active clubs",
                "type": "int",
                "default": 3,
                "min": 1,
                "max": 100,
                "help": "On the current data every player is in at least 17 active clubs; try 30 or 40 to narrow the list.",
            }
        ],
        "variants": [
            {
                "key": "A",
                "label": "JOIN + GROUP BY + HAVING",
                "note": "Version A scans club_membership once and filters the groups with HAVING.",
                "sql": f"""SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    COUNT(DISTINCT cm.club_id)              AS club_count
FROM player p
JOIN club_membership cm
  ON cm.player_id   = p.player_id
 AND cm.status_code = 'active'
GROUP BY p.player_id, p.username, p.first_name, p.last_name, p.country_code
{Q5_HAVING}
ORDER BY club_count DESC""",
            },
            {
                "key": "B",
                "label": "IN subquery + correlated count",
                "note": (
                    "Version B builds the qualifying player list with IN, then a correlated subquery recomputes "
                    "club_count for every row: club_membership is scanned again per player, so A is generally faster."
                ),
                "sql": f"""SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    (SELECT COUNT(DISTINCT cm2.club_id)
       FROM club_membership cm2
      WHERE cm2.player_id   = p.player_id
        AND cm2.status_code = 'active')     AS club_count
FROM player p
WHERE p.player_id IN (
    SELECT cm.player_id
    FROM   club_membership cm
    WHERE  cm.status_code = 'active'
    GROUP  BY cm.player_id
    {Q5_HAVING}
)
ORDER BY club_count DESC""",
            },
        ],
    },
    {
        "id": "q6",
        "title": "Players with an active subscription",
        "description": (
            "Players holding at least one subscription in the chosen status, each listed once. Uses player "
            "and player_subscription."
        ),
        "screen": "Subscription Management",
        "kind": "select",
        "tables": ["player", "player_subscription"],
        "params": [SUBSCRIPTION_STATUS, _limit(20)],
        "variants": [
            {
                "key": "A",
                "label": "JOIN + DISTINCT",
                "note": (
                    "Version A's JOIN duplicates a player who has several matching subscriptions; DISTINCT removes "
                    "them at the cost of an extra sort."
                ),
                "sql": """SELECT DISTINCT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    p.status_code
FROM player p
JOIN player_subscription ps
  ON ps.player_id   = p.player_id
 AND ps.status_code = %(status)s
ORDER BY p.player_id
LIMIT %(limit)s""",
            },
            {
                "key": "B",
                "label": "WHERE EXISTS",
                "note": (
                    "Version B's EXISTS stops at the first matching subscription and never produces duplicates, "
                    "so it is generally faster on large tables."
                ),
                "sql": """SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    p.status_code
FROM player p
WHERE EXISTS (
    SELECT 1
    FROM   player_subscription ps
    WHERE  ps.player_id   = p.player_id
      AND  ps.status_code = %(status)s
)
ORDER BY p.player_id
LIMIT %(limit)s""",
            },
        ],
    },
    {
        "id": "q7",
        "title": "Players who never logged in",
        "description": (
            "Players with no row at all in login_log, oldest registration first. Uses player and login_log; "
            "the anti-join pattern in two forms."
        ),
        "screen": "Inactive Users / Security Monitoring",
        "kind": "select",
        "tables": ["player", "login_log"],
        "params": [],
        "variants": [
            {
                "key": "A",
                "label": "LEFT JOIN + IS NULL",
                "note": "Version A materialises the full LEFT JOIN and then discards every matched row.",
                "sql": """SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.registration_date,
    p.status_code
FROM player p
LEFT JOIN login_log ll ON ll.player_id = p.player_id
WHERE ll.log_id IS NULL
ORDER BY p.registration_date""",
            },
            {
                "key": "B",
                "label": "NOT EXISTS",
                "note": (
                    "Version B stops at the first log row of each player and never builds the join result; "
                    "typically faster with an index on login_log.player_id."
                ),
                "sql": """SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.registration_date,
    p.status_code
FROM player p
WHERE NOT EXISTS (
    SELECT 1
    FROM   login_log ll
    WHERE  ll.player_id = p.player_id
)
ORDER BY p.registration_date""",
            },
        ],
    },
    {
        "id": "q8",
        "title": "Club membership statistics",
        "description": (
            "Clubs ranked by active members, with owner and admin counts and the earliest join date. "
            "Aggregates club_membership per club and joins to club."
        ),
        "screen": "Club Management Dashboard",
        "kind": "select",
        "tables": ["club", "club_membership"],
        "params": [_limit(20)],
        "chart": {"type": "bar", "x": "club_name", "series": ["active_members"]},
        "variants": [
            {
                "key": "A",
                "label": "CTE",
                "note": (
                    "Version A names the aggregate in a CTE for readability. PostgreSQL 12+ inlines a "
                    "non-MATERIALIZED CTE, so the plan is the same as version B."
                ),
                "sql": """WITH club_stats AS (
    SELECT
        club_id,
        COUNT(*)                                                AS active_members,
        SUM(CASE WHEN role_code = 'owner' THEN 1 ELSE 0 END)  AS owner_count,
        SUM(CASE WHEN role_code = 'admin' THEN 1 ELSE 0 END)  AS admin_count,
        MIN(join_date)                                          AS oldest_member_date
    FROM  club_membership
    WHERE status_code = 'active'
    GROUP BY club_id
)
SELECT
    c.club_id,
    c.club_name,
    cs.active_members,
    c.country_code,
    c.city,
    c.is_official,
    c.founded_date,
    cs.owner_count,
    cs.admin_count,
    cs.oldest_member_date
FROM club c
JOIN club_stats cs ON cs.club_id = c.club_id
ORDER BY cs.active_members DESC
LIMIT %(limit)s""",
            },
            {
                "key": "B",
                "label": "Inline derived table",
                "note": "Version B puts the same aggregate inline in FROM; identical plan, less readable.",
                "sql": """SELECT
    c.club_id, c.club_name,
    sub.active_members, c.country_code, c.city,
    c.is_official, c.founded_date, sub.owner_count, sub.admin_count, sub.oldest_member_date
FROM club c
JOIN (
    SELECT
        club_id,
        COUNT(*)                                                AS active_members,
        SUM(CASE WHEN role_code = 'owner' THEN 1 ELSE 0 END)  AS owner_count,
        SUM(CASE WHEN role_code = 'admin' THEN 1 ELSE 0 END)  AS admin_count,
        MIN(join_date)                                          AS oldest_member_date
    FROM  club_membership
    WHERE status_code = 'active'
    GROUP BY club_id
) sub ON sub.club_id = c.club_id
ORDER BY sub.active_members DESC
LIMIT %(limit)s""",
            },
        ],
    },
    # ---------------------------------------------------------------- UPDATE
    {
        "id": "u1",
        "title": "Suspend players with suspicious logins",
        "description": (
            "Sets status 'suspended' for active players who had a suspicious login in the last N days of "
            "the data window. Updates player from a subquery on login_log; fires trg_player_update."
        ),
        "screen": "Security / Player Management",
        "kind": "update",
        "tables": ["player", "login_log"],
        "params": [_days(180, "Window measured back from the latest login in the data (2026-03-24).")],
        "_snapshot": "SELECT status_code, COUNT(*) AS players FROM player GROUP BY status_code ORDER BY status_code",
        "_returning": "player_id, username, status_code",
        "variants": [
            {
                "key": "A",
                "label": "UPDATE with IN subquery",
                "note": (
                    "The original uses CURRENT_DATE - 180 days, which matches nothing on this data window "
                    "(latest login 2026-03-24), so the window is anchored on MAX(login_date) instead."
                ),
                "sql": """UPDATE player
SET    status_code = 'suspended'
WHERE  status_code = 'active'
  AND  player_id IN (
           SELECT DISTINCT player_id
           FROM   login_log
           WHERE  is_suspicious = TRUE
             AND  login_date   >= (SELECT MAX(login_date) FROM login_log) - %(days)s * INTERVAL '1 day'
       )""",
            }
        ],
    },
    {
        "id": "u2",
        "title": "Expire overdue subscriptions",
        "description": (
            "Marks active subscriptions whose end_date is before the given date as expired and switches "
            "auto-renew off. Single table player_subscription. On the current data active subscriptions "
            "have no end_date, so 0 rows are affected."
        ),
        "screen": "Subscription Management / Billing",
        "kind": "update",
        "tables": ["player_subscription"],
        "params": [
            {
                "name": "as_of",
                "label": "As of date",
                "type": "date",
                "default": "2026-03-24",
                "help": "Replaces CURRENT_DATE in the original.",
            }
        ],
        "_snapshot": "SELECT status_code, COUNT(*) AS subscriptions FROM player_subscription GROUP BY status_code ORDER BY status_code",
        "_returning": "subscription_id, player_id, status_code, end_date, auto_renew",
        "variants": [
            {
                "key": "A",
                "label": "UPDATE with date filter",
                "note": "CURRENT_DATE from the original is the as_of parameter. Active subscriptions currently have a NULL end_date, so the statement affects 0 rows.",
                "sql": """UPDATE player_subscription
SET    status_code = 'expired',
       auto_renew  = FALSE
WHERE  status_code = 'active'
  AND  end_date   <  %(as_of)s""",
            }
        ],
    },
    {
        "id": "u3",
        "title": "Promote an admin in admin-less clubs",
        "description": (
            "In every club that has active members but no active admin, promotes the longest-serving active "
            "member to admin. Updates club_membership using a correlated LIMIT 1 subquery and a NOT EXISTS guard."
        ),
        "screen": "Club Management",
        "kind": "update",
        "tables": ["club_membership"],
        "params": [],
        "_snapshot": """SELECT
    (SELECT COUNT(*) FROM (
        SELECT club_id FROM club_membership
        WHERE  status_code = 'active'
        GROUP  BY club_id
        HAVING SUM(CASE WHEN role_code = 'admin' THEN 1 ELSE 0 END) = 0) s) AS clubs_without_admin,
    (SELECT COUNT(*) FROM club_membership
     WHERE  status_code = 'active' AND role_code = 'admin')                  AS active_admins""",
        "_returning": "membership_id, player_id, club_id, role_code, join_date",
        "variants": [
            {
                "key": "A",
                "label": "UPDATE with correlated subquery",
                "note": "No parameters; runs exactly as in the original.",
                "sql": """UPDATE club_membership upd
SET    role_code = 'admin'
WHERE  upd.status_code = 'active'
  AND  upd.role_code   = 'member'
  AND  upd.membership_id = (
           SELECT inner_cm.membership_id
           FROM   club_membership inner_cm
           WHERE  inner_cm.club_id     = upd.club_id
             AND  inner_cm.status_code = 'active'
           ORDER  BY inner_cm.join_date ASC
           LIMIT  1
       )
  AND  NOT EXISTS (
           SELECT 1
           FROM   club_membership chk
           WHERE  chk.club_id     = upd.club_id
             AND  chk.status_code = 'active'
             AND  chk.role_code   = 'admin'
       )""",
            }
        ],
    },
    # ---------------------------------------------------------------- DELETE
    {
        "id": "d1",
        "title": "Purge old declined connections",
        "description": (
            "Deletes declined social connections created more than N days ago. Single table "
            "social_connection."
        ),
        "screen": "Social Network cleanup",
        "kind": "delete",
        "tables": ["social_connection"],
        "params": [_days(365, "Measured back from today (CURRENT_DATE), as in the original.")],
        "_snapshot": "SELECT status_code, COUNT(*) AS connections FROM social_connection GROUP BY status_code ORDER BY status_code",
        "_returning": "connection_id, from_player_id, to_player_id, connection_type_code, status_code, created_date",
        "variants": [
            {
                "key": "A",
                "label": "DELETE with date filter",
                "note": "CURRENT_DATE is kept from the original; the 365-day interval is a parameter.",
                "sql": """DELETE FROM social_connection
WHERE  status_code  = 'declined'
  AND  created_date < CURRENT_DATE - %(days)s * INTERVAL '1 day'""",
            }
        ],
    },
    {
        "id": "d2",
        "title": "Purge old failed logins",
        "description": "Deletes failed login rows older than N days. Single table login_log.",
        "screen": "Security Log Maintenance",
        "kind": "delete",
        "tables": ["login_log"],
        "params": [_days(730, "Measured back from today (CURRENT_DATE), as in the original.")],
        "_snapshot": "SELECT login_status_code, COUNT(*) AS logins FROM login_log GROUP BY login_status_code ORDER BY login_status_code",
        "_returning": "log_id, player_id, ip_address, login_date, login_status_code",
        "variants": [
            {
                "key": "A",
                "label": "DELETE with date filter",
                "note": "CURRENT_DATE is kept from the original; the 730-day interval is a parameter.",
                "sql": """DELETE FROM login_log
WHERE  login_status_code = 'failed'
  AND  login_date        < CURRENT_DATE - %(days)s * INTERVAL '1 day'""",
            }
        ],
    },
    {
        "id": "d3",
        "title": "Remove pending memberships of blocked players",
        "description": (
            "Deletes pending club memberships whose player is suspended or banned. club_membership with an "
            "IN subquery on player. On the current data this matches 0 rows."
        ),
        "screen": "Membership Management",
        "kind": "delete",
        "tables": ["club_membership", "player"],
        "params": [],
        "_snapshot": "SELECT status_code, COUNT(*) AS memberships FROM club_membership GROUP BY status_code ORDER BY status_code",
        "_returning": "membership_id, player_id, club_id, status_code, join_date",
        "variants": [
            {
                "key": "A",
                "label": "DELETE with IN subquery",
                "note": "No parameters; runs exactly as in the original. Currently no pending membership belongs to a suspended or banned player.",
                "sql": """DELETE FROM club_membership
WHERE  status_code = 'pending'
  AND  player_id  IN (
           SELECT player_id FROM player
           WHERE  status_code IN ('suspended', 'banned')
       )""",
            }
        ],
    },
]

BY_ID = {q["id"]: q for q in QUERIES}


def _public(q: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in q.items() if not k.startswith("_")}


def _coerce(spec: dict[str, Any], raw: Any) -> Any:
    """Validate one parameter against its catalog spec (400 on failure)."""
    if raw is None or raw == "":
        raw = spec["default"]
    kind = spec["type"]
    try:
        if kind == "int":
            value = int(raw)
        elif kind == "date":
            value = raw if isinstance(raw, dt.date) else dt.date.fromisoformat(str(raw))
        elif kind == "select":
            value = str(raw)
            if value not in {o["value"] for o in spec["options"]}:
                raise ValueError(value)
        else:
            value = str(raw)
    except (TypeError, ValueError):
        raise HTTPException(400, {"message": f"Invalid value for '{spec['name']}': {raw!r}", "code": "400"})
    if kind == "int" and not spec.get("min", value) <= value <= spec.get("max", value):
        raise HTTPException(
            400, {"message": f"'{spec['name']}' must be between {spec.get('min')} and {spec.get('max')}", "code": "400"}
        )
    return value


def _literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dt.date):
        return f"DATE '{value.isoformat()}'"
    return "'" + str(value).replace("'", "''") + "'"


def _render(query: str, params: dict[str, Any]) -> str:
    """Display-only: substitute the bound values into the placeholder SQL."""
    return re.sub(r"%\((\w+)\)s", lambda m: _literal(params[m.group(1)]), query).replace("%%", "%")


class RunIn(BaseModel):
    params: dict[str, Any] = {}
    variant: str = "A"
    mode: Literal["preview", "apply"] = "preview"


@router.get("")
def catalog():
    return [_public(q) for q in QUERIES]


@router.post("/{query_id}/run")
def run_query(query_id: str, body: RunIn):
    q = BY_ID.get(query_id)
    if q is None:
        raise HTTPException(404, {"message": f"Unknown query '{query_id}'", "code": "404"})
    variant = next((v for v in q["variants"] if v["key"] == body.variant.upper()), None)
    if variant is None:
        raise HTTPException(400, {"message": f"Query {query_id} has no variant '{body.variant}'", "code": "400"})
    params = {p["name"]: _coerce(p, body.params.get(p["name"])) for p in q["params"]}

    started = time.perf_counter()
    with get_conn() as (conn, notices):
        with conn.cursor() as cur:
            if q["kind"] == "select":
                cur.execute(variant["sql"], params or None)
                rows = cur.fetchmany(MAX_ROWS)
                result = {
                    "ok": True,
                    "kind": "select",
                    "columns": columns_of(cur),
                    "rows": rows,
                    "rowcount": cur.rowcount,
                    "truncated": cur.rowcount > MAX_ROWS,
                }
                conn.commit()
            else:
                cur.execute(q["_snapshot"])
                before = {"columns": columns_of(cur), "rows": cur.fetchall()}
                cur.execute(variant["sql"] + "\nRETURNING " + q["_returning"], params or None)
                affected = cur.fetchall()
                sample = {"columns": columns_of(cur), "rows": affected[:SAMPLE_ROWS]}
                cur.execute(q["_snapshot"])
                after = {"columns": columns_of(cur), "rows": cur.fetchall()}
                result = {
                    "ok": True,
                    "kind": q["kind"],
                    "mode": body.mode,
                    "affected": len(affected),
                    "sample": sample,
                    "before": before,
                    "after": after,
                }
                if body.mode == "apply":
                    conn.commit()
                else:
                    conn.rollback()
    result["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
    result["sql"] = _render(variant["sql"], params)
    result["notices"] = notices.items
    return result
