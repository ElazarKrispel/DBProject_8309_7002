-- ============================================================
-- Chess Platform – Phase D  |  Main program 2
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- "Security audit" scenario. One main block that calls:
--     * PROCEDURE sp_security_review   (suspends / bans risky players)
--     * FUNCTION  fn_club_report       (returns a REF CURSOR)
--
-- The block also CONSUMES the ref cursor: it fetches row by row in a
-- loop and classifies every club, which is what a real client program
-- would do with a returned cursor.
--
-- The whole script runs inside a transaction that ends with ROLLBACK,
-- so the Phase C baseline is not modified.
--
-- Pure SQL - no psql meta-commands - so it runs both in psql and in the
-- pgAdmin Query Tool. For screenshots, execute one STEP at a time.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- STEP 1 - BEFORE: players by status
-- ------------------------------------------------------------
SELECT status_code, COUNT(*) AS players
FROM   player
GROUP  BY status_code
ORDER  BY status_code;

-- ------------------------------------------------------------
-- STEP 2 - BEFORE: club memberships by status
-- ------------------------------------------------------------
SELECT status_code, COUNT(*) AS memberships
FROM   club_membership
GROUP  BY status_code
ORDER  BY status_code;

-- ------------------------------------------------------------
-- STEP 3 - run the main block.
--          It calls the PROCEDURE and then the FUNCTION that returns a
--          REF CURSOR, and fetches from that cursor in a loop.
--          All printed output appears in the "Messages" tab of pgAdmin.
-- ------------------------------------------------------------
DO $$
DECLARE
    v_cur  REFCURSOR;
    v_rec  RECORD;
    v_size TEXT;
    v_n    INT := 0;
BEGIN
    ------------------------------------------------------------------
    -- part 1: call the PROCEDURE
    -- (its UPDATE on player also fires Trigger 1, which cascades bans
    --  down to club_membership)
    --
    -- 3000 days covers the whole login history (2018-01 .. 2026-03),
    -- 20 = minimum logins needed to judge a player,
    -- 15% = suspicious-ratio threshold (platform average is 8.8%).
    ------------------------------------------------------------------
    CALL sp_security_review(3000, 20, 15.0);

    RAISE NOTICE '';

    ------------------------------------------------------------------
    -- part 2: call the FUNCTION that returns a REF CURSOR,
    --         then fetch from it in a loop
    ------------------------------------------------------------------
    v_cur := fn_club_report(NULL, 40);

    RAISE NOTICE 'Club report (first 10 rows of the returned cursor):';

    LOOP
        FETCH v_cur INTO v_rec;
        EXIT WHEN NOT FOUND;

        v_n := v_n + 1;
        EXIT WHEN v_n > 10;

        -- branching: classify the club by its size
        IF v_rec.active_members >= 45 THEN
            v_size := 'Large';
        ELSIF v_rec.active_members >= 42 THEN
            v_size := 'Medium';
        ELSE
            v_size := 'Small';
        END IF;

        RAISE NOTICE '  % [%] - % members, avg rating %, % leader(s), country %',
                     v_rec.club_name, v_size, v_rec.active_members,
                     v_rec.avg_rating, v_rec.leaders, v_rec.country_code;
    END LOOP;

    CLOSE v_cur;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'MAIN 2 FAILED: % (%)', SQLERRM, SQLSTATE;
        RAISE;
END $$;

-- ------------------------------------------------------------
-- STEP 4 - AFTER: players by status.
--          'active' dropped by 21, 'suspended' grew by 20,
--          'banned' grew by 1.
-- ------------------------------------------------------------
SELECT status_code, COUNT(*) AS players
FROM   player
GROUP  BY status_code
ORDER  BY status_code;

-- ------------------------------------------------------------
-- STEP 5 - AFTER: club memberships by status. Two different effects:
--          'active' -> 'banned' was done by Trigger 1, cascading the
--          single ban; the drop in 'pending' is the procedure's own
--          DELETE of the blocked players' waiting membership requests.
-- ------------------------------------------------------------
SELECT status_code, COUNT(*) AS memberships
FROM   club_membership
GROUP  BY status_code
ORDER  BY status_code;

-- ------------------------------------------------------------
-- STEP 6 - undo everything: the database is left exactly as it was
-- ------------------------------------------------------------
ROLLBACK;
