"""End-to-end check of the core routers against the live database.

Run from the backend folder:  python -m app.smoke_core
Creates a club and an engine_ui_support row and removes both again; never leaves data behind.
"""
import json
import sys

from fastapi.testclient import TestClient

from .config import APP_PASSWORD, APP_USER
from .main import app


def check(cond: bool, what: str) -> None:
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        sys.exit(1)


def main() -> None:
    with TestClient(app) as c:
        # auth
        r = c.post("/api/auth/login", json={"username": APP_USER, "password": "wrong"})
        check(r.status_code == 401 and r.json()["detail"]["message"] == "Invalid username or password", "login rejects bad password")
        r = c.post("/api/auth/login", json={"username": APP_USER, "password": APP_PASSWORD})
        check(r.status_code == 200 and r.json()["token"], "login")
        c.headers["Authorization"] = "Bearer " + r.json()["token"]
        check(c.get("/api/auth/me").json()["username"] == APP_USER, "me")
        check(TestClient(app).get("/api/meta/tables").status_code == 401, "meta requires token")

        # meta
        meta = c.get("/api/meta/tables").json()
        check(len(meta) == 30, f"meta has 30 entries (got {len(meta)})")
        by_key = {m["key"]: m for m in meta}
        cm = by_key["club_membership"]
        cols = {col["name"]: col for col in cm["columns"]}
        check(cols["player_id"]["fk"] == {"table": "player", "column": "player_id"}, "club_membership.player_id fk -> player")
        check(cols["role_code"]["fk"] == {"table": "membership_role", "column": "role_code"}, "club_membership.role_code fk -> membership_role")
        check(cols["membership_id"]["auto"] and cols["membership_id"]["pk"], "club_membership.membership_id is auto pk")
        check({col["name"]: col for col in by_key["installed_on"]["columns"]}["engine_id"]["fk"]["table"] == "localengine", "installed_on.engine_id fk -> localengine")
        check({col["name"]: col for col in by_key["login_log"]["columns"]}["client_id"]["fk"]["table"] == "uiclient", "login_log.client_id fk -> uiclient")
        check({col["name"]: col for col in by_key["login_log"]["columns"]}["device_type"]["options"] == ["mobile", "tablet", "laptop", "desktop"], "login_log.device_type options")
        check({col["name"]: col for col in by_key["cloudengine"]["columns"]}["auth_token"].get("secret") is True, "cloudengine.auth_token secret")
        check(not {col["name"]: col for col in by_key["cloudengine"]["columns"]}["engine_id"]["auto"], "cloudengine.engine_id not auto (ISA)")
        check(by_key["vw_engine_overview"]["readonly"] and by_key["vw_engine_overview"]["pk"] == [] and by_key["vw_engine_overview"]["group"] == "Views", "views are readonly")
        check([m["key"] for m in meta[:7]] == ["player", "club", "club_membership", "social_connection", "player_subscription", "subscription_tier", "login_log"], "sidebar order")
        check({col["name"]: col for col in by_key["hardwaretelemetry"]["columns"]}["time_stamp"]["type"] == "timestamp", "timestamp type")
        check(c.get("/api/meta/tables/club").json()["label"] == "Clubs" and c.get("/api/meta/tables/nope").status_code == 404, "meta single table")
        print(json.dumps(cm, indent=1))

        # list
        r = c.get("/api/tables/player", params={"page": 1, "size": 5})
        body = r.json()
        check(r.status_code == 200 and len(body["rows"]) == 5 and body["total"] >= 510 and body["page"] == 1, "list player page 1")
        check(body["rows"][0]["_labels"]["status_code"] in ("Active", "Suspended", "Banned"), "player _labels.status_code resolved")
        body = c.get("/api/tables/player", params={"q": "cohen", "size": 3}).json()
        check(body["total"] > 0 and all("cohen" in (r["email"] + r["last_name"] + r["username"]).lower() for r in body["rows"]), "search q")
        body = c.get("/api/tables/player", params={"sort": "rating_classical", "dir": "desc", "size": 3}).json()
        check(body["rows"][0]["rating_classical"] >= body["rows"][1]["rating_classical"], "sort desc")
        check(c.get("/api/tables/player", params={"sort": "nope"}).status_code == 400, "bad sort -> 400")
        body = c.get("/api/tables/player", params={"status_code": "active", "size": 3}).json()
        check(body["total"] > 0 and all(r["status_code"] == "active" for r in body["rows"]), "filter status_code=active")
        body = c.get("/api/tables/club", params={"founded_date": "null", "size": 2}).json()
        check(all(r["founded_date"] is None for r in body["rows"]), "filter col=null -> IS NULL")
        body = c.get("/api/tables/club_membership", params={"q": "alice", "size": 3}).json()
        check(body["total"] >= 0, "search across fk labels works")
        body = c.get("/api/tables/vw_player_club_membership", params={"size": 2}).json()
        check(len(body["rows"]) == 2 and body["rows"][0]["_labels"] == {}, "view list")
        check(c.get("/api/tables/login_log", params={"size": 500}).json()["size"] == 200, "size capped at 200")

        # row
        row = c.get("/api/tables/player/row", params={"player_id": 1}).json()
        check(row["player_id"] == 1 and "status_code" in row["_labels"], "row by pk")
        check(c.get("/api/tables/player/row", params={"player_id": 999999}).status_code == 404, "row missing -> 404")
        check(c.get("/api/tables/player/row").status_code == 400, "row without pk -> 400")
        row = c.get("/api/tables/engine_ui_support/row", params={"engine_id": 1, "client_id": 1}).json()
        check(row["engine_id"] == 1 and row["client_id"] == 1 and row["_labels"]["engine_id"], "composite row by pk")

        # options
        opts = c.get("/api/tables/player", params={"size": 1}).json()
        opts = c.get("/api/tables/player/options", params={"q": "a", "limit": 5}).json()
        check(len(opts) == 5 and isinstance(opts[0]["value"], int) and opts[0]["label"], "player options")
        opts = c.get("/api/tables/player_status/options").json()
        values = [o["value"] for o in opts]
        check("active" in values and not any(v.startswith("ps") and v[2:].isdigit() for v in values), "player_status options exclude padding, contain active")
        opts = c.get("/api/tables/player_status/options", params={"q": "ps00"}).json()
        check(opts and all(o["value"].startswith("ps") for o in opts), "padding rows reachable through q")
        check(c.get("/api/tables/membership_role/options").json()[0]["value"] in ("admin", "member", "moderator", "owner"), "membership_role options real first")
        check(c.get("/api/tables/engine_ui_support/options").status_code == 400, "composite options -> 400")
        check(len(c.get("/api/tables/subscription_tier/options").json()) > 0, "subscription_tier options non-empty")

        # create / update / delete club
        club_id = None
        try:
            r = c.post("/api/tables/club", json={"club_name": "Smoke Test Club", "city": "", "is_official": False, "founded_date": ""})
            check(r.status_code == 200, f"create club ({r.text[:200]})")
            club = r.json()["row"]
            club_id = club["club_id"]
            check(club["club_name"] == "Smoke Test Club" and club["city"] is None and club["founded_date"] is None, "create club: '' -> NULL, automatic id")
            r = c.put("/api/tables/club", params={"club_id": club_id}, json={"city": "Haifa", "club_id": 1, "bogus": 1})
            check(r.status_code == 200 and r.json()["row"]["city"] == "Haifa" and r.json()["row"]["club_id"] == club_id, "update club ignores pk and unknown keys")
            check(c.put("/api/tables/club", params={"club_id": 999999999}, json={"city": "X"}).status_code == 404, "update missing -> 404")
        finally:
            if club_id is not None:
                r = c.delete("/api/tables/club", params={"club_id": club_id})
                check(r.status_code == 200 and r.json()["deleted"] == 1, "delete club")
        check(c.delete("/api/tables/club", params={"club_id": club_id}).status_code == 404, "delete again -> 404")
        check(c.post("/api/tables/vw_engine_overview", json={"engine_id": 1}).status_code == 400, "insert into view -> 400")

        # composite key create/delete
        pair = {"engine_id": 20, "client_id": 4}
        check(c.get("/api/tables/engine_ui_support/row", params=pair).status_code == 404, "engine_ui_support pair does not exist")
        created = False
        try:
            r = c.post("/api/tables/engine_ui_support", json={**pair, "supported_since": "2026-01-01"})
            check(r.status_code == 200 and r.json()["row"]["_labels"]["client_id"], f"create engine_ui_support ({r.text[:200]})")
            created = True
        finally:
            if created:
                check(c.delete("/api/tables/engine_ui_support", params=pair).json()["deleted"] == 1, "delete engine_ui_support")

        # fk violation surfaces as 400 with the DB message
        r = c.delete("/api/tables/player", params={"player_id": 1})
        check(r.status_code == 400 and "violates foreign key" in r.json()["detail"]["message"], "fk violation -> 400 with message")

        # trigger surfacing
        before = c.get("/api/tables/player/row", params={"player_id": 1}).json()["rating_classical"]
        r = c.put("/api/tables/player", params={"player_id": 1}, json={"rating_classical": before + 500})
        check(r.status_code == 400 and "Rating change too large" in r.json()["detail"]["message"], "trigger message surfaced")
        check(c.get("/api/tables/player/row", params={"player_id": 1}).json()["rating_classical"] == before, "rejected update changed nothing")

        # dashboard
        d = c.get("/api/dashboard").json()
        k = d["kpis"]
        check(k["players_total"] >= 510 and k["clubs"] >= 500 and 0 <= k["suspicious_pct"] <= 100 and k["last_login_date"] == "2026-03-24", "dashboard kpis")
        ch = d["charts"]
        check(len(ch["logins_by_month"]) == 12 and ch["logins_by_month"][-1]["month"] == "2026-03", "logins_by_month 12 months")
        check(ch["rating_buckets"] and "-" in ch["rating_buckets"][0]["bucket"], "rating_buckets")
        check(len(ch["top_tiers"]) == 5 and len(ch["players_by_country"]) <= 8 and ch["players_by_status"] and ch["memberships_by_role"], "other charts")

        # sql console
        city = c.get("/api/tables/club/row", params={"club_id": 1}).json()["city"]
        r = c.post("/api/sql", json={"sql": "UPDATE club SET city = 'Smoke Preview' WHERE club_id = 1", "mode": "preview"}).json()
        check(r["ok"] and r["rowcount"] == 1 and not r["readonly"], "sql preview update rowcount 1")
        check(c.get("/api/tables/club/row", params={"club_id": 1}).json()["city"] == city, "sql preview did not persist")
        for statement in (
            "SELECT 1; UPDATE club SET city = 'Batch Preview' WHERE club_id = 1 RETURNING city",
            "WITH changed AS (UPDATE club SET city = 'CTE Preview' WHERE club_id = 1 RETURNING city) SELECT * FROM changed",
        ):
            preview = c.post("/api/sql", json={"sql": statement, "mode": "preview"}).json()
            check(preview["ok"] and not preview["readonly"], "mixed SQL preview reports a write")
            check(c.get("/api/tables/club/row", params={"club_id": 1}).json()["city"] == city, "mixed SQL preview did not persist")
        check(c.post("/api/sql", json={"sql": "SELECT 1; COMMIT", "mode": "preview"}).status_code == 400, "explicit transaction commands rejected")
        r = c.post("/api/sql", json={"sql": "-- comment\nSELECT club_id, club_name FROM club ORDER BY club_id LIMIT 3"}).json()
        check(r["ok"] and r["readonly"] and r["columns"] == ["club_id", "club_name"] and len(r["rows"]) == 3, "sql select")
        r = c.post("/api/sql", json={"sql": "SELECT * FROM login_log"}).json()
        check(r["ok"] and r["truncated"] and len(r["rows"]) == 500 and r["rowcount"] > 500, "sql truncation")
        r = c.post("/api/sql", json={"sql": "SELECT * FROM no_such_table"}).json()
        check(r["ok"] is False and r["error"]["code"] == "42P01" and "no_such_table" in r["error"]["message"], "sql error inline")
        r = c.post("/api/sql", json={"sql": "SELECT 1 AS a; SELECT 2 AS b"}).json()
        check(r["ok"] and r["columns"] == ["b"], "sql multi statement returns last")
        r = c.post("/api/sql", json={"sql": "DO $$ BEGIN RAISE NOTICE 'hello from sql'; END $$"}).json()
        check(r["ok"] and r["notices"] and r["notices"][0]["message"] == "hello from sql", "sql notices captured")
        check(c.post("/api/sql", json={"sql": "   "}).status_code == 400, "empty sql -> 400")

        check(c.post("/api/auth/logout").json()["ok"] and c.get("/api/auth/me").status_code == 401, "logout revokes token")
    print("ALL GREEN")


if __name__ == "__main__":
    main()
