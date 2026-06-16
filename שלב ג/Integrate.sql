-- ============================================================
-- Chess Platform – Phase C  |  Integrate.sql
-- Integration method A (full integration)
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- Partner project integrated: DBProject_7783_4478
--   "Chess Tournament Management" – chess engines / bots /
--   hardware nodes / UI clients (the technological back-end).
-- ============================================================
--
-- PREREQUISITE (performed ONCE, before this script):
--   The partner's 12 tables + their data were restored from their
--   Stage_1/Backup.sql into our chess_db. Their table names
--     uiclient, engine, bot, localengine, cloudengine, hardwarenode,
--     servercomponent, hardwaretelemetry, openingposition,
--     engineevaluation, engine_ui_support, installed_on
--   do NOT collide with any of our 15 tables, so the two schemas
--   coexist cleanly in one database (27 tables total).
--
--   NOTE (method A): we do NOT recreate any existing table. The partner
--   tables arrive as "existing tables" from their backup, and we change
--   the database ONLY with table-design (ALTER) commands.
--
-- THE BRIDGE (integration point):
--   In real life a login is always performed THROUGH a client app.
--   Our login_log already records device_type / browser / OS; the
--   partner's uiclient is the catalog of the actual client applications.
--   => connect them:   login_log.client_id  --(FK)-->  uiclient.client_id
-- ============================================================


-- ------------------------------------------------------------
-- 1) Add the bridge column.
--    INT  -> matches uiclient.client_id (INT).
--    NULL -> optional participation: every existing login_log row
--            stays valid, and NO fabricated data is required.
-- ------------------------------------------------------------
ALTER TABLE login_log ADD COLUMN IF NOT EXISTS client_id INT;


-- ------------------------------------------------------------
-- 2) Add the foreign key that realises the bridge.
--    (DROP IF EXISTS first so the script is safely re-runnable.)
-- ------------------------------------------------------------
ALTER TABLE login_log DROP CONSTRAINT IF EXISTS fk_login_client;
ALTER TABLE login_log
    ADD CONSTRAINT fk_login_client
    FOREIGN KEY (client_id) REFERENCES uiclient(client_id);


-- ------------------------------------------------------------
-- 3) Backfill client_id by LINKING existing rows only
--    (no invented data – we only connect data that already exists):
--      * map the device that performed each login to a client of the
--        matching type:   mobile / tablet  -> 'Mobile'  app
--                         laptop / desktop -> 'Web'     app
--      * spread the logins across the available clients of that type
--        deterministically by player_id, so every client shows real
--        activity (Web has 3 clients, Mobile has 2).
-- ------------------------------------------------------------
WITH typed AS (
    SELECT u.client_id,
           u.client_type,
           ROW_NUMBER() OVER (PARTITION BY u.client_type ORDER BY u.client_id) - 1 AS idx,
           COUNT(*)     OVER (PARTITION BY u.client_type)                          AS cnt
    FROM uiclient u
)
UPDATE login_log ll
SET    client_id = t.client_id
FROM   typed t
WHERE  t.client_type = CASE WHEN ll.device_type IN ('mobile', 'tablet')
                            THEN 'Mobile' ELSE 'Web' END
  AND  t.idx = (ll.player_id % t.cnt);


-- ------------------------------------------------------------
-- 4) Verification of the integration.
-- ------------------------------------------------------------
-- 4a) How many logins are now linked to a client?
SELECT COUNT(*)                      AS total_logins,
       COUNT(client_id)              AS linked_logins,
       COUNT(*) - COUNT(client_id)   AS unlinked_logins
FROM   login_log;

-- 4b) Logins per client application (proves the bridge is populated):
SELECT u.client_id,
       u.name        AS client_name,
       u.client_type,
       COUNT(ll.log_id) AS logins
FROM   uiclient u
LEFT JOIN login_log ll ON ll.client_id = u.client_id
GROUP  BY u.client_id, u.name, u.client_type
ORDER  BY logins DESC;
