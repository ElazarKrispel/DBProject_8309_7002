-- ============================================================
-- Chess Platform – Phase D  |  Trigger 2   (BEFORE INSERT)
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- trg_login_log_insert  –  BEFORE INSERT ON login_log
--
-- Completes and validates a new login row before it is stored:
--
--   1. REJECT   – a banned player cannot record a login at all.
--   2. COMPLETE – if client_id was not supplied, it is derived from
--                 device_type using the same mapping as the Phase C
--                 integration (mobile/tablet -> a Mobile app,
--                 desktop/laptop -> a Web app).
--   3. CLEAN    – a successful login cannot carry a failure_reason;
--                 this keeps the row consistent with the Phase B
--                 constraint chk_login_failure_reason.
--
-- log_id is deliberately NOT generated here. The schema has no sequence
-- and computing MAX(log_id)+1 inside a trigger is unsafe under concurrent
-- inserts, so the caller supplies log_id exactly as the schema requires.
--
-- PL/pgSQL elements demonstrated:
--   * implicit cursors – player status lookup, uiclient lookup
--   * branching        – three independent conditions
--   * exception        – banned player / unknown player are rejected
--   * records          – NEW is modified and returned
-- ============================================================

CREATE OR REPLACE FUNCTION trg_fn_login_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_player_status VARCHAR(30);
BEGIN
    ------------------------------------------------------------------
    -- 1. a banned player may not log in
    ------------------------------------------------------------------
    SELECT status_code INTO v_player_status
    FROM   player
    WHERE  player_id = NEW.player_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown player % - login cannot be recorded', NEW.player_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_player_status = 'banned' THEN
        RAISE EXCEPTION 'Player % is banned - login cannot be recorded', NEW.player_id
            USING ERRCODE = 'check_violation';
    END IF;

    ------------------------------------------------------------------
    -- 2. complete the Phase C bridge column when it was not supplied
    ------------------------------------------------------------------
    IF NEW.client_id IS NULL THEN
        SELECT client_id INTO NEW.client_id
        FROM   uiclient
        WHERE  client_type = CASE
                                 WHEN NEW.device_type IN ('mobile', 'tablet') THEN 'Mobile'
                                 ELSE 'Web'
                             END
        ORDER  BY client_id
        LIMIT  1;

        RAISE NOTICE 'login_log: client_id filled with % for device_type %',
                     NEW.client_id, NEW.device_type;
    END IF;

    ------------------------------------------------------------------
    -- 3. a successful login has no failure reason
    ------------------------------------------------------------------
    IF NEW.login_status_code = 'success' AND NEW.failure_reason IS NOT NULL THEN
        RAISE NOTICE 'login_log: failure_reason cleared for successful login of player %',
                     NEW.player_id;
        NEW.failure_reason := NULL;
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_login_log_insert ON login_log;

CREATE TRIGGER trg_login_log_insert
    BEFORE INSERT ON login_log
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_login_log_insert();


-- ============================================================
-- DEMO – see Demo_Triggers.sql for the full runnable script
-- ============================================================
-- (a) client_id is completed and failure_reason is cleared:
--       INSERT INTO login_log
--           (log_id, player_id, ip_address, device_type, operating_system,
--            browser, login_status_code, failure_reason,
--            session_duration_sec, is_suspicious, login_date)
--       VALUES
--           (<max+1>, <active player>, '10.0.0.7', 'mobile', 'Android 14',
--            'Chrome', 'success', 'wrong password', 900, FALSE, DATE '2026-03-25');
--       -> NOTICE: client_id filled with 2 for device_type mobile
--       -> NOTICE: failure_reason cleared ...
--
-- (b) a banned player is rejected:
--       INSERT INTO login_log (...) VALUES (..., <banned player>, ...);
--       -> ERROR: Player <id> is banned - login cannot be recorded
-- ============================================================
