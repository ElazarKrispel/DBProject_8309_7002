-- ============================================================
-- Chess Platform – Phase D  |  Screenshots_pgAdmin.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- One block = one screenshot for the Phase D report.
--
-- HOW TO USE (pgAdmin 4):
--   1. Open the Query Tool on chess_db.
--   2. Open this file.
--   3. For each block below: select the block with the mouse and press F5.
--   4. Save the screenshot under the file name written in the block header.
--
-- Blocks marked [DATA] -> screenshot the "Data Output" tab.
-- Blocks marked [MSG]  -> screenshot the "Messages" tab.
-- Blocks marked [DATA+MSG] -> two screenshots, one of each tab.
--
-- Every block that changes data is wrapped in BEGIN ... ROLLBACK, so the
-- database is left exactly as it was. The change is fully visible in the
-- result grid, which is produced before the ROLLBACK.
-- ============================================================


-- ============================================================
-- BLOCK 01  [DATA]   ->  01_install.png
-- Proof that all Phase D programs are installed.
-- ============================================================
SELECT p.proname AS name,
       CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' END AS kind
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname IN ('fn_player_activity_score', 'fn_club_report',
                     'sp_process_billing_cycle', 'sp_security_review',
                     'trg_fn_player_update', 'trg_fn_login_log_insert')
UNION ALL
SELECT t.tgname, 'trigger on ' || c.relname
FROM   pg_trigger t
JOIN   pg_class   c ON c.oid = t.tgrelid
WHERE  NOT t.tgisinternal
ORDER  BY 2, 1;


-- ============================================================
-- FUNCTION 1 – fn_player_activity_score
-- ============================================================

-- ============================================================
-- BLOCK 02  [DATA]   ->  02_fn1_run.png
-- Normal run: different players get different scores.
-- ============================================================
SELECT p.player_id,
       p.username,
       p.rating_classical,
       fn_player_activity_score(p.player_id) AS activity_score
FROM   player p
WHERE  p.status_code = 'active'
ORDER  BY p.rating_classical DESC, p.player_id
LIMIT  10;


-- ============================================================
-- BLOCK 03  [MSG]    ->  03_fn1_err_player.png
-- Exception: the player does not exist.
-- Expected: ERROR: Player 999999 does not exist
-- ============================================================
SELECT fn_player_activity_score(999999);


-- ============================================================
-- BLOCK 04  [MSG]    ->  04_fn1_err_param.png
-- Exception: illegal parameter.
-- Expected: ERROR: p_days_back must be positive (got -10)
-- ============================================================
SELECT fn_player_activity_score(1, -10);


-- ============================================================
-- FUNCTION 2 – fn_club_report  (REF CURSOR)
-- ============================================================

-- ============================================================
-- BLOCK 05  [DATA]   ->  05_fn2_israel.png
-- Ref cursor with a country filter. Select ALL FOUR lines together.
-- ============================================================
BEGIN;
SELECT fn_club_report('IL', 25);
FETCH ALL IN club_report_cur;
COMMIT;


-- ============================================================
-- BLOCK 06  [DATA]   ->  06_fn2_all.png
-- Ref cursor without a country filter (the other IF branch).
-- ============================================================
BEGIN;
SELECT fn_club_report(NULL, 40);
FETCH ALL IN club_report_cur;
COMMIT;


-- ============================================================
-- BLOCK 07  [MSG]    ->  07_fn2_err_param.png
-- Exception: negative threshold.
-- Expected: ERROR: p_min_members cannot be negative (got -5)
-- ============================================================
SELECT fn_club_report('IL', -5);


-- ============================================================
-- PROCEDURE 1 – sp_process_billing_cycle
-- ============================================================

-- ============================================================
-- BLOCK 08  [DATA+MSG] -> 08_sp1_proof.png  +  08_sp1_messages.png
-- One grid that proves the update: for every subscription the procedure
-- renewed, the billing date before and after, side by side.
-- ============================================================
BEGIN;

DROP TABLE IF EXISTS snap_sub;
CREATE TEMP TABLE snap_sub AS
SELECT subscription_id, billing_cycle_code, auto_renew,
       next_billing_date AS date_before, status_code AS status_before
FROM   player_subscription
WHERE  status_code       = 'active'
  AND  next_billing_date IS NOT NULL
  AND  next_billing_date <= DATE '2026-08-18'
ORDER  BY next_billing_date, subscription_id
LIMIT  50;

-- wrapped in a DO block so that only the proof table below appears in the
-- result grid (a bare CALL with INOUT parameters returns a row of its own)
DO $$
DECLARE v_renewed INT := 0; v_expired INT := 0;
BEGIN
    CALL sp_process_billing_cycle(DATE '2026-08-18', 50, v_renewed, v_expired);
END $$;

SELECT s.subscription_id,
       s.billing_cycle_code,
       s.auto_renew,
       s.date_before,
       ps.next_billing_date AS date_after,
       s.status_before,
       ps.status_code       AS status_after
FROM   snap_sub s
JOIN   player_subscription ps ON ps.subscription_id = s.subscription_id
ORDER  BY s.date_before, s.subscription_id
LIMIT  15;

ROLLBACK;


-- ============================================================
-- BLOCK 09  [DATA]   ->  09_sp1_counts.png
-- The same run, summarised: how each status count changed.
-- ============================================================
BEGIN;

DROP TABLE IF EXISTS snap_cnt;
CREATE TEMP TABLE snap_cnt AS
SELECT status_code, COUNT(*) AS c FROM player_subscription GROUP BY status_code;

DO $$
DECLARE v_renewed INT := 0; v_expired INT := 0;
BEGIN
    CALL sp_process_billing_cycle(DATE '2026-08-18', 50, v_renewed, v_expired);
END $$;

SELECT status_code,
       b.c AS before_count,
       a.c AS after_count,
       a.c - b.c AS delta
FROM   snap_cnt b
FULL JOIN (SELECT status_code, COUNT(*) AS c
           FROM player_subscription GROUP BY status_code) a USING (status_code)
ORDER  BY status_code;

ROLLBACK;


-- ============================================================
-- PROCEDURE 2 – sp_security_review
-- ============================================================

-- ============================================================
-- BLOCK 10  [DATA+MSG] -> 10_sp2_proof.png  +  10_sp2_messages.png
-- One grid that proves three effects at once:
--   * player                    - status changed by the procedure (UPDATE)
--   * club_membership 'pending' - rows deleted by the procedure (DELETE)
--   * club_membership 'active'  - changed by TRIGGER 1, cascading the ban
-- ============================================================
BEGIN;

DROP TABLE IF EXISTS snap_pl;
DROP TABLE IF EXISTS snap_cm;
CREATE TEMP TABLE snap_pl AS
SELECT status_code, COUNT(*) AS c FROM player GROUP BY status_code;
CREATE TEMP TABLE snap_cm AS
SELECT status_code, COUNT(*) AS c FROM club_membership GROUP BY status_code;

CALL sp_security_review(3000, 20, 15.0);

SELECT 'player' AS table_name, status_code,
       b.c AS before_count, a.c AS after_count, a.c - b.c AS delta
FROM   snap_pl b
FULL JOIN (SELECT status_code, COUNT(*) AS c FROM player GROUP BY status_code) a
       USING (status_code)
UNION ALL
SELECT 'club_membership', status_code,
       b.c, a.c, a.c - b.c
FROM   snap_cm b
FULL JOIN (SELECT status_code, COUNT(*) AS c FROM club_membership GROUP BY status_code) a
       USING (status_code)
ORDER  BY table_name, status_code;

ROLLBACK;


-- ============================================================
-- BLOCK 11  [MSG]    ->  11_sp2_err_param.png
-- Exception: illegal parameters.
-- Expected: ERROR: invalid parameters: days_back=0, min_logins=20, threshold=15.0
-- ============================================================
CALL sp_security_review(0, 20, 15.0);


-- ============================================================
-- TRIGGER 1 – trg_player_update  (BEFORE UPDATE ON player)
-- ============================================================

-- ============================================================
-- BLOCK 12  [MSG]    ->  12_trg1_reject.png
-- The guard rejects a rating jump of +500.
-- Expected: ERROR: Rating change too large for player 1 ...
-- No transaction is needed: the statement fails, so nothing is changed.
-- ============================================================
UPDATE player SET rating_classical = rating_classical + 500 WHERE player_id = 1;


-- ============================================================
-- BLOCK 13  [DATA]   ->  13_trg1_pass.png
-- A legal change of +50 passes: before and after in one row.
-- ============================================================
BEGIN;

DROP TABLE IF EXISTS snap_rating;
CREATE TEMP TABLE snap_rating AS
SELECT player_id, username, rating_classical AS value_before
FROM   player WHERE player_id = 1;

UPDATE player SET rating_classical = rating_classical + 50 WHERE player_id = 1;

SELECT s.player_id, s.username, s.value_before, p.rating_classical AS value_after
FROM   snap_rating s
JOIN   player p ON p.player_id = s.player_id;

ROLLBACK;


-- ============================================================
-- BLOCK 14  [DATA+MSG] -> 14_trg1_cascade.png  +  14_trg1_cascade_messages.png
-- The ban cascade: all active memberships of the banned player become
-- 'banned'. before_count / after_count in one grid, and the trigger's
-- NOTICE in the Messages tab.
-- ============================================================
BEGIN;

DROP TABLE IF EXISTS snap_target;
DROP TABLE IF EXISTS snap_ms;

CREATE TEMP TABLE snap_target AS
SELECT p.player_id, p.username
FROM   player p
JOIN   club_membership cm ON cm.player_id   = p.player_id
                         AND cm.status_code = 'active'
WHERE  p.status_code = 'active'
GROUP  BY p.player_id, p.username
ORDER  BY COUNT(*) DESC, p.player_id
LIMIT  1;

CREATE TEMP TABLE snap_ms AS
SELECT cm.status_code, COUNT(*) AS c
FROM   club_membership cm
JOIN   snap_target t USING (player_id)
GROUP  BY cm.status_code;

UPDATE player
   SET status_code = 'banned'
 WHERE player_id = (SELECT player_id FROM snap_target);

SELECT (SELECT username FROM snap_target) AS banned_player,
       status_code,
       COALESCE(b.c, 0) AS before_count,
       COALESCE(a.c, 0) AS after_count
FROM   snap_ms b
FULL JOIN (SELECT cm.status_code, COUNT(*) AS c
           FROM club_membership cm JOIN snap_target t USING (player_id)
           GROUP BY cm.status_code) a USING (status_code)
ORDER  BY status_code;

ROLLBACK;


-- ============================================================
-- TRIGGER 2 – trg_login_log_insert  (BEFORE INSERT ON login_log)
-- ============================================================

-- ============================================================
-- BLOCK 15  [DATA+MSG] -> 15_trg2_complete.png  +  15_trg2_complete_messages.png
-- The INSERT supplies log_id but leaves client_id empty and wrongly puts
-- a failure_reason on a successful login. The trigger fills client_id and
-- clears failure_reason.
-- ============================================================
BEGIN;

INSERT INTO login_log
    (log_id, player_id, ip_address, country_detected, city_detected,
     device_type, operating_system, browser, login_status_code,
     failure_reason, session_duration_sec, is_suspicious, login_date)
SELECT
    (SELECT MAX(log_id) + 1 FROM login_log),
    (SELECT MIN(player_id) FROM player WHERE status_code = 'active'),
    '10.0.0.7', 'IL', 'Jerusalem',
    'mobile', 'Android 14', 'Chrome', 'success',
    'wrong password',
    900, FALSE, DATE '2026-03-25';

SELECT log_id, player_id, device_type, client_id, login_status_code,
       failure_reason, session_duration_sec, login_date
FROM   login_log
ORDER  BY log_id DESC
LIMIT  1;

ROLLBACK;


-- ============================================================
-- BLOCK 16  [MSG]    ->  16_trg2_reject.png
-- A banned player cannot record a login.
-- Expected: ERROR: Player 79 is banned - login cannot be recorded
-- No transaction is needed: the statement fails, so nothing is changed.
-- ============================================================
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


-- ============================================================
-- MAIN PROGRAM 1
-- Open Main1_BillingAndActivity.sql in the Query Tool.
--
--   17_main1_messages.png   [MSG]
--       Select the whole file (Ctrl+A) and press F5.
--       Screenshot the Messages tab: the procedure output plus the five
--       activity scores printed by the function.
--
--   18_main1_proof.png      [DATA]
--       Select STEP 1 up to and including STEP 5 and press F5.
--       Screenshot the grid: subscription 5050, monthly,
--       date_before 2018-02-20 -> date_after 2018-03-20.
-- ============================================================


-- ============================================================
-- MAIN PROGRAM 2
-- Open Main2_SecurityAndClubs.sql in the Query Tool.
--
--   19_main2_messages.png   [MSG]
--       Select the whole file (Ctrl+A) and press F5.
--       Screenshot the Messages tab: the security review decisions plus
--       the ten club rows fetched from the returned REF CURSOR.
--
--   20_main2_after.png      [DATA]
--       Select STEP 1 up to and including STEP 5 and press F5.
--       Screenshot the grid: club memberships by status after the run
--       (active 14909 / banned 637) - changed by Trigger 1.
-- ============================================================
