-- ============================================================
-- Chess Platform – Phase D  |  Trigger demonstration script
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- Proves that both triggers work. Every scenario is a self-contained
-- transaction that ends with ROLLBACK, so the database is left unchanged.
--
-- Pure SQL - no psql meta-commands - so it runs both in psql and in the
-- pgAdmin Query Tool. Run ONE SCENARIO at a time (highlight it and press
-- F5), because two of the scenarios end with a deliberate error.
-- ============================================================


-- ============================================================
-- TRIGGER 1  (BEFORE UPDATE ON player)
-- ============================================================

-- ------------------------------------------------------------
-- SCENARIO 1A - GUARD: a rating jump of +500 must be REJECTED
-- Expected: ERROR "Rating change too large for player 1 ..."
-- ------------------------------------------------------------
BEGIN;

SELECT player_id, username, rating_classical
FROM   player
WHERE  player_id = 1;

UPDATE player
   SET rating_classical = rating_classical + 500
 WHERE player_id = 1;

ROLLBACK;


-- ------------------------------------------------------------
-- SCENARIO 1B - GUARD: a rating change of +50 must PASS
-- Expected: the value goes from 956 to 1006
-- ------------------------------------------------------------
BEGIN;

SELECT player_id, username, rating_classical AS value_before
FROM   player
WHERE  player_id = 1;

UPDATE player
   SET rating_classical = rating_classical + 50
 WHERE player_id = 1;

SELECT player_id, username, rating_classical AS value_after
FROM   player
WHERE  player_id = 1;

ROLLBACK;


-- ------------------------------------------------------------
-- SCENARIO 1C - CASCADE: banning a player bans his active memberships
-- Expected: a NOTICE from the trigger, and all 'active' memberships of
--           that player become 'banned'
-- ------------------------------------------------------------
BEGIN;

-- pick the active player who has the most active memberships
DROP TABLE IF EXISTS demo_target;

CREATE TEMP TABLE demo_target AS
SELECT p.player_id
FROM   player p
JOIN   club_membership cm ON cm.player_id = p.player_id
                         AND cm.status_code = 'active'
WHERE  p.status_code = 'active'
GROUP  BY p.player_id
ORDER  BY COUNT(*) DESC, p.player_id
LIMIT  1;

-- the target player
SELECT p.player_id, p.username, p.status_code
FROM   player p
JOIN   demo_target d ON d.player_id = p.player_id;

-- BEFORE: his memberships by status
SELECT cm.status_code, COUNT(*) AS memberships
FROM   club_membership cm
JOIN   demo_target d ON d.player_id = cm.player_id
GROUP  BY cm.status_code
ORDER  BY cm.status_code;

-- ban him (the trigger prints a NOTICE in the Messages tab)
UPDATE player
   SET status_code = 'banned'
 WHERE player_id = (SELECT player_id FROM demo_target);

-- AFTER: his memberships by status - 'active' is gone
SELECT cm.status_code, COUNT(*) AS memberships
FROM   club_membership cm
JOIN   demo_target d ON d.player_id = cm.player_id
GROUP  BY cm.status_code
ORDER  BY cm.status_code;

ROLLBACK;


-- ============================================================
-- TRIGGER 2  (BEFORE INSERT ON login_log)
-- ============================================================

-- ------------------------------------------------------------
-- SCENARIO 2A - COMPLETE + CLEAN
-- The INSERT supplies log_id (as the schema requires) but leaves
-- client_id empty and wrongly sets a failure_reason on a successful
-- login. The trigger fills client_id and clears failure_reason.
-- Expected: two NOTICEs, and the stored row has client_id = 2 and
--           failure_reason = NULL
-- ------------------------------------------------------------
BEGIN;

INSERT INTO login_log
    (log_id, player_id, ip_address, country_detected, city_detected,
     device_type, operating_system, browser, login_status_code,
     failure_reason, session_duration_sec, is_suspicious, login_date)
SELECT
    (SELECT MAX(log_id) + 1 FROM login_log),                              -- supplied by the caller
    (SELECT MIN(player_id) FROM player WHERE status_code = 'active'),
    '10.0.0.7', 'IL', 'Jerusalem',
    'mobile', 'Android 14', 'Chrome', 'success',
    'wrong password',                                                      -- must be cleared
    900, FALSE, DATE '2026-03-25';

-- the row that was actually stored
SELECT log_id, player_id, device_type, client_id, login_status_code,
       failure_reason, session_duration_sec, login_date
FROM   login_log
ORDER  BY log_id DESC
LIMIT  1;

ROLLBACK;


-- ------------------------------------------------------------
-- SCENARIO 2B - REJECT: a banned player cannot record a login
-- Expected: ERROR "Player 79 is banned - login cannot be recorded"
-- ------------------------------------------------------------
BEGIN;

-- the banned player we are about to use
SELECT player_id, username, status_code
FROM   player
WHERE  status_code = 'banned'
ORDER  BY player_id
LIMIT  1;

INSERT INTO login_log
    (log_id, player_id, ip_address, country_detected, city_detected,
     device_type, operating_system, browser, login_status_code,
     failure_reason, session_duration_sec, is_suspicious, login_date)
SELECT
    (SELECT MAX(log_id) + 1 FROM login_log),
    (SELECT MIN(player_id) FROM player WHERE status_code = 'banned'),
    '10.0.0.8', 'IL', 'Tel Aviv',
    'desktop', 'Windows 11', 'Edge', 'success',
    NULL, 120, FALSE, DATE '2026-03-25';

ROLLBACK;
