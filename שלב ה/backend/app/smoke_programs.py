"""Smoke test for the queries and programs routers against the live database.

Run from the backend folder:  python -m app.smoke_programs
Every data-changing call runs in preview mode (rollback); nothing is persisted.
"""
from __future__ import annotations

import sys

from fastapi.testclient import TestClient

from .main import app
from .security import issue_token

PASSED = 0


def check(label: str, cond: bool, detail: str = "") -> None:
    global PASSED
    if not cond:
        print(f"FAIL  {label}  {detail}")
        sys.exit(1)
    PASSED += 1
    print(f"ok    {label}")


def has_notice(res: dict, text: str) -> bool:
    return any(text in n["message"] for n in res["notices"])


def count_of(grid: dict, status: str, col: str) -> int:
    return next((r[col] for r in grid["rows"] if r["status_code"] == status), 0)


def main() -> None:
    with TestClient(app) as c:
        c.headers["Authorization"] = f"Bearer {issue_token()}"

        def post(path: str, body: dict) -> dict:
            r = c.post(f"/api{path}", json=body)
            check(f"POST {path} -> {r.status_code}", r.status_code == 200, r.text[:300])
            return r.json()

        # ------------------------------------------------------------ queries
        r = c.get("/api/queries")
        check("GET /queries 200", r.status_code == 200, r.text[:200])
        catalog = r.json()
        check("catalog has 14 entries", len(catalog) == 14, str(len(catalog)))
        check("catalog hides internal keys", not any(k.startswith("_") for q in catalog for k in q))
        for q in catalog:
            if q["kind"] != "select":
                continue
            for v in q["variants"]:
                res = post(f"/queries/{q['id']}/run", {"variant": v["key"], "params": {}})
                check(f"{q['id']}{v['key']} returns rows", res["ok"] and res["rowcount"] > 0 and res["rows"], str(res)[:200])
                check(f"{q['id']}{v['key']} sql rendered", "%(" not in res["sql"])
        # q1 status filter reaches the SQL
        res = post("/queries/q1/run", {"params": {"status": "banned", "limit": 5}})
        check("q1 banned <= 5 rows", res["rowcount"] <= 5 and "'banned'" in res["sql"])
        # q5: every player is in >= 17 clubs, so compare 3 against 30
        low = post("/queries/q5/run", {"params": {"min_clubs": 3}})
        high = post("/queries/q5/run", {"params": {"min_clubs": 30}, "variant": "B"})
        check("q5 min_clubs 30 < 3", 0 < high["rowcount"] < low["rowcount"], f"{high['rowcount']} vs {low['rowcount']}")
        # validation
        check("q5 bad param -> 400", c.post("/api/queries/q5/run", json={"params": {"min_clubs": "x"}}).status_code == 400)
        check("q1 bad status -> 400", c.post("/api/queries/q1/run", json={"params": {"status": "nope"}}).status_code == 400)
        check("unknown query -> 404", c.post("/api/queries/q99/run", json={}).status_code == 404)
        check("unknown variant -> 400", c.post("/api/queries/q1/run", json={"variant": "B"}).status_code == 400)
        # DML preview: before/after present, nothing persisted
        for qid in ["u1", "u2", "u3", "d1", "d2", "d3"]:
            first = post(f"/queries/{qid}/run", {"mode": "preview"})
            check(f"{qid} preview shape", first["ok"] and first["mode"] == "preview" and "before" in first and "after" in first
                  and "sample" in first and isinstance(first["affected"], int), str(first)[:200])
            second = post(f"/queries/{qid}/run", {"mode": "preview"})
            check(f"{qid} not persisted", second["before"] == first["before"], f"{first['before']} != {second['before']}")
        u1 = post("/queries/u1/run", {"mode": "preview"})
        check("u1 affects rows", u1["affected"] > 0 and len(u1["sample"]["rows"]) <= 50)
        u3 = post("/queries/u3/run", {"mode": "preview"})
        b3, a3 = u3["before"]["rows"][0], u3["after"]["rows"][0]
        check("u3 promotes admins", u3["affected"] > 0 and a3["active_admins"] == b3["active_admins"] + u3["affected"]
              and a3["clubs_without_admin"] < b3["clubs_without_admin"], f"{b3} -> {a3}, affected {u3['affected']}")
        d1 = post("/queries/d1/run", {"mode": "preview"})
        check("d1 deletes declined", d1["affected"] > 0 and count_of(d1["before"], "declined", "connections")
              - count_of(d1["after"], "declined", "connections") == d1["affected"])

        # ------------------------------------------------------------ programs
        r = c.get("/api/programs/health")
        check("GET /programs/health 200", r.status_code == 200, r.text[:200])
        h = r.json()
        check("health ok", h["ok"] and not h["missing"], str(h))
        check("health 4 routines", len(h["routines"]) == 4, str(h["routines"]))
        check("health 2 triggers", len(h["triggers"]) == 2, str(h["triggers"]))

        res = post("/programs/activity-score", {"player_id": 1, "days_back": 365})
        check("activity-score numeric", res["ok"] and isinstance(res["score"], (int, float)) and res["player"]["player_id"] == 1, str(res))
        res = post("/programs/activity-score", {"player_id": 999999})
        check("activity-score unknown player", not res["ok"] and "does not exist" in res["error"]["message"], str(res))
        res = post("/programs/activity-score", {"player_id": 1, "days_back": -10})
        check("activity-score bad days", not res["ok"] and "must be positive" in res["error"]["message"], str(res))

        res = post("/programs/club-report", {"country": " il ", "min_members": 25})
        check("club-report IL/25", res["ok"] and res["rowcount"] > 0 and has_notice(res, "club(s) match country=IL"), str(res)[:300])
        check("club-report columns", res["columns"] == ["club_id", "club_name", "country_code", "is_official", "active_members", "avg_rating", "leaders"], str(res["columns"]))
        res = post("/programs/club-report", {"country": None, "min_members": 40})
        check("club-report ALL/40", res["ok"] and res["rowcount"] > 0 and has_notice(res, "country=ALL"), str(res)[:300])
        res = post("/programs/club-report", {"country": "IL", "min_members": -5})
        check("club-report negative", not res["ok"] and "cannot be negative" in res["error"]["message"], str(res))

        res = post("/programs/billing-cycle", {"as_of": "2026-08-18", "limit": 50, "mode": "preview"})
        check("billing preview counts", res["ok"] and res["renewed"] + res["expired"] == 50 and res["renewed"] > 0 and res["expired"] > 0, str(res)[:300])
        before_due, after_due = res["before"]["due"]["rows"], res["after"]["due"]["rows"]
        check("billing due same ids", [r["subscription_id"] for r in before_due] == [r["subscription_id"] for r in after_due])
        advanced = any(a["next_billing_date"] > b["next_billing_date"] for a, b in zip(after_due, before_due) if b["auto_renew"])
        expired = any(a["status_code"] == "expired" for a, b in zip(after_due, before_due) if not b["auto_renew"])
        check("billing after.due shows advanced dates", advanced, str(after_due)[:300])
        check("billing after.due shows expirations", expired or all(b["auto_renew"] for b in before_due))
        check("billing notices", has_notice(res, "Billing run finished"))
        again = post("/programs/billing-cycle", {"as_of": "2026-08-18", "limit": 50, "mode": "preview"})
        check("billing not persisted", again["before"] == res["before"])

        res = post("/programs/security-review", {"days_back": 3000, "min_logins": 20, "threshold_pct": 15.0, "mode": "preview"})
        check("security notices", res["ok"] and has_notice(res, "Security review finished"), str(res)[:300])
        check("security before/after", count_of(res["after"]["players"], "active", "players") < count_of(res["before"]["players"], "active", "players"))
        res = post("/programs/security-review", {"days_back": 0, "min_logins": 20, "threshold_pct": 15.0})
        check("security invalid params", not res["ok"] and "invalid parameters" in res["error"]["message"], str(res))

        res = post("/programs/trigger/rating-jump", {"player_id": 1, "delta": 500, "field": "rating_classical"})
        check("rating +500 rejected", not res["ok"] and "Rating change too large" in res["error"]["message"], str(res))
        res = post("/programs/trigger/rating-jump", {"player_id": 1, "delta": 50, "field": "rating_rapid", "mode": "preview"})
        check("rating +50 accepted", res["ok"] and res["after"]["rows"][0]["rating_rapid"] - res["before"]["rows"][0]["rating_rapid"] == 50, str(res))
        res = post("/programs/trigger/rating-jump", {"player_id": 999999, "delta": 50})
        check("rating unknown player", not res["ok"] and "does not exist" in res["error"]["message"], str(res))

        r = c.get("/api/programs/trigger/ban-candidates")
        cands = r.json()
        check("ban-candidates", r.status_code == 200 and len(cands) == 10 and cands[0]["active_memberships"] > 0, r.text[:200])
        res = post("/programs/trigger/ban-cascade", {"player_id": cands[0]["player_id"], "mode": "preview"})
        check("ban-cascade notice", res["ok"] and has_notice(res, "set to banned"), str(res)[:300])
        check("ban-cascade after", res["after"]["player"]["rows"][0]["status_code"] == "banned"
              and count_of(res["after"]["memberships"], "banned", "memberships") >= cands[0]["active_memberships"], str(res["after"]))

        r = c.get("/api/programs/trigger/login-candidates")
        lc = r.json()
        check("login-candidates", r.status_code == 200 and len(lc["active"]) == 5 and len(lc["banned"]) == 3, r.text[:200])
        res = post("/programs/trigger/login-insert", {"player_id": lc["active"][0]["player_id"], "mode": "preview"})
        check("login-insert active", res["ok"] and has_notice(res, "client_id filled") and res["row"]["client_id"] is not None
              and res["row"]["failure_reason"] is None and has_notice(res, "failure_reason cleared"), str(res)[:300])
        res = post("/programs/trigger/login-insert", {"player_id": lc["banned"][0]["player_id"], "mode": "preview"})
        check("login-insert banned", not res["ok"] and "is banned" in res["error"]["message"], str(res))
        res = post("/programs/trigger/login-insert", {"player_id": 999999, "mode": "preview"})
        check("login-insert unknown", not res["ok"] and "Unknown player" in res["error"]["message"], str(res))

        check("protected without token", c.get("/api/queries", headers={"Authorization": ""}).status_code == 401)

    print(f"\nall {PASSED} checks passed")


if __name__ == "__main__":
    main()
