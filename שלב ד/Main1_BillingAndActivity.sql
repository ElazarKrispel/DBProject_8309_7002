-- ============================================================
-- Chess Platform – Phase D  |  Main program 1
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- "End of month" scenario. One main block that calls:
--     * PROCEDURE sp_process_billing_cycle   (billing run)
--     * FUNCTION  fn_player_activity_score   (per-player score)
--
-- The whole script runs inside a transaction that ends with ROLLBACK,
-- so the Phase C baseline is not modified. The effect of the procedure
-- is fully visible in the "AFTER" queries, which run before the ROLLBACK.
--
-- Pure SQL - no psql meta-commands - so it runs both in psql and in the
-- pgAdmin Query Tool. For screenshots, execute one STEP at a time.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- STEP 1 - pick one auto-renewing subscription that the billing run
--          will definitely process (the oldest due one), and remember
--          its current billing date so we can compare later.
-- ------------------------------------------------------------
DROP TABLE IF EXISTS demo_sub;

CREATE TEMP TABLE demo_sub AS
SELECT subscription_id,
       billing_cycle_code,
       next_billing_date AS date_before
FROM   player_subscription
WHERE  status_code       = 'active'
  AND  auto_renew        = TRUE
  AND  next_billing_date IS NOT NULL
  AND  next_billing_date <= DATE '2026-08-18'
ORDER  BY next_billing_date, subscription_id
LIMIT  1;

SELECT * FROM demo_sub;

-- ------------------------------------------------------------
-- STEP 2 - BEFORE: subscriptions by status
-- ------------------------------------------------------------
SELECT status_code, COUNT(*) AS subscriptions
FROM   player_subscription
GROUP  BY status_code
ORDER  BY status_code;

-- ------------------------------------------------------------
-- STEP 3 - BEFORE: the 10 oldest due subscriptions
-- ------------------------------------------------------------
SELECT subscription_id, status_code, auto_renew, billing_cycle_code, next_billing_date
FROM   player_subscription
WHERE  status_code = 'active'
  AND  next_billing_date <= DATE '2026-08-18'
ORDER  BY next_billing_date, subscription_id
LIMIT  10;

-- ------------------------------------------------------------
-- STEP 4 - run the main block.
--          It calls the PROCEDURE and then the FUNCTION.
--          All printed output appears in the "Messages" tab of pgAdmin.
-- ------------------------------------------------------------
DO $$
DECLARE
    v_renewed INT := 0;
    v_expired INT := 0;
    v_rec     RECORD;
    v_score   NUMERIC;
BEGIN
    ------------------------------------------------------------------
    -- part 1: call the PROCEDURE
    ------------------------------------------------------------------
    CALL sp_process_billing_cycle(DATE '2026-08-18', 50, v_renewed, v_expired);

    RAISE NOTICE '';
    RAISE NOTICE 'Procedure returned: renewed=%, expired=%', v_renewed, v_expired;
    RAISE NOTICE '';

    ------------------------------------------------------------------
    -- part 2: call the FUNCTION for the top rated active players
    ------------------------------------------------------------------
    RAISE NOTICE 'Activity score of the 5 highest rated active players:';

    FOR v_rec IN
        SELECT player_id, username, rating_classical
        FROM   player
        WHERE  status_code = 'active'
        ORDER  BY rating_classical DESC, player_id
        LIMIT  5
    LOOP
        v_score := fn_player_activity_score(v_rec.player_id, 365);

        RAISE NOTICE '  % (id=%, rating %) -> activity score %',
                     v_rec.username, v_rec.player_id, v_rec.rating_classical, v_score;
    END LOOP;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'MAIN 1 FAILED: % (%)', SQLERRM, SQLSTATE;
        RAISE;
END $$;

-- ------------------------------------------------------------
-- STEP 5 - PROOF: the same subscription, before and after, side by side.
--          date_after must be exactly one month / one year later.
-- ------------------------------------------------------------
SELECT d.subscription_id,
       d.billing_cycle_code,
       d.date_before,
       ps.next_billing_date AS date_after,
       ps.next_billing_date - d.date_before AS days_advanced,
       ps.status_code
FROM   demo_sub d
JOIN   player_subscription ps ON ps.subscription_id = d.subscription_id;

-- ------------------------------------------------------------
-- STEP 6 - AFTER: subscriptions by status ('expired' grew by 15)
-- ------------------------------------------------------------
SELECT status_code, COUNT(*) AS subscriptions
FROM   player_subscription
GROUP  BY status_code
ORDER  BY status_code;

-- ------------------------------------------------------------
-- STEP 7 - AFTER: the 10 oldest due subscriptions.
--          The auto-renewing rows moved one month forward; the rows
--          with auto_renew = false left the list entirely because they
--          are no longer 'active'.
-- ------------------------------------------------------------
SELECT subscription_id, status_code, auto_renew, billing_cycle_code, next_billing_date
FROM   player_subscription
WHERE  status_code = 'active'
  AND  next_billing_date <= DATE '2026-08-18'
ORDER  BY next_billing_date, subscription_id
LIMIT  10;

-- ------------------------------------------------------------
-- STEP 8 - undo everything: the database is left exactly as it was
-- ------------------------------------------------------------
ROLLBACK;
