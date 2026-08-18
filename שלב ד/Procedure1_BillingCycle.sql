-- ============================================================
-- Chess Platform – Phase D  |  Procedure 1
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- sp_process_billing_cycle(p_as_of, p_limit, INOUT p_renewed, INOUT p_expired)
--
-- Runs a billing cycle over the subscriptions whose next billing date has
-- already passed:
--   * auto_renew = TRUE  -> the subscription is renewed: next_billing_date
--                           is pushed forward by one month or one year,
--                           according to its billing_cycle_code.
--   * auto_renew = FALSE -> the subscription expires: status becomes
--                           'expired' and auto_renew is turned off.
--
-- Why next_billing_date and not end_date: in the Phase C data end_date is
-- NULL for all 14,013 active subscriptions, while next_billing_date is
-- populated and mostly in the past. It is the only column that can drive
-- a realistic billing run.
--
-- PL/pgSQL elements demonstrated:
--   * explicit cursor  – cur_due, with FOR UPDATE
--   * loop             – FETCH / EXIT WHEN NOT FOUND
--   * branching        – IF auto_renew ... plus a CASE on the billing cycle
--   * DML              – two different UPDATE statements
--   * exception        – per-row handler, so one bad row cannot abort the run
--   * records          – RECORD fetched from the cursor
--   * INOUT parameters – the caller receives the counters
--
-- p_limit exists because 13,227 subscriptions currently qualify; the demo
-- processes a bounded slice so the output stays readable.
-- ============================================================

CREATE OR REPLACE PROCEDURE sp_process_billing_cycle(
    p_as_of         DATE,
    p_limit         INT,
    INOUT p_renewed INT,
    INOUT p_expired INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    -- explicit cursor: the subscriptions that are due, oldest first.
    -- FOR UPDATE locks each row we are about to modify.
    cur_due CURSOR FOR
        SELECT subscription_id,
               player_id,
               billing_cycle_code,
               auto_renew,
               next_billing_date
        FROM   player_subscription
        WHERE  status_code       = 'active'
          AND  next_billing_date IS NOT NULL
          AND  next_billing_date <= p_as_of
        ORDER  BY next_billing_date
        LIMIT  p_limit
        FOR UPDATE;

    v_sub      RECORD;
    v_new_date DATE;
    v_errors   INT := 0;
BEGIN
    p_renewed := 0;
    p_expired := 0;

    RAISE NOTICE 'Billing run starting, as of %, limit % subscription(s)', p_as_of, p_limit;

    OPEN cur_due;
    LOOP
        FETCH cur_due INTO v_sub;
        EXIT WHEN NOT FOUND;

        -- Per-row exception block: a single problematic subscription is
        -- reported and skipped, the rest of the run continues.
        BEGIN
            IF v_sub.auto_renew THEN
                -- branching on the billing cycle
                v_new_date := CASE v_sub.billing_cycle_code
                                  WHEN 'monthly' THEN v_sub.next_billing_date + INTERVAL '1 month'
                                  WHEN 'annual'  THEN v_sub.next_billing_date + INTERVAL '1 year'
                                  ELSE                v_sub.next_billing_date + INTERVAL '1 month'
                              END;

                -- DML #1: renew
                UPDATE player_subscription
                   SET next_billing_date = v_new_date
                 WHERE subscription_id = v_sub.subscription_id;

                p_renewed := p_renewed + 1;
            ELSE
                -- DML #2: expire
                UPDATE player_subscription
                   SET status_code = 'expired',
                       auto_renew  = FALSE
                 WHERE subscription_id = v_sub.subscription_id;

                p_expired := p_expired + 1;
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                v_errors := v_errors + 1;
                RAISE WARNING 'subscription % skipped: %', v_sub.subscription_id, SQLERRM;
        END;
    END LOOP;
    CLOSE cur_due;

    RAISE NOTICE 'Billing run finished: % renewed, % expired, % error(s)',
                 p_renewed, p_expired, v_errors;
END;
$$;


-- ============================================================
-- DEMO  (wrapped in a transaction that is rolled back, so the Phase C
--        baseline data stays untouched - the change is fully visible
--        in the "after" query, before the ROLLBACK)
-- ============================================================
-- BEGIN;
--
-- -- state BEFORE
-- SELECT status_code, COUNT(*) FROM player_subscription GROUP BY 1 ORDER BY 1;
-- SELECT subscription_id, status_code, auto_renew, billing_cycle_code, next_billing_date
-- FROM   player_subscription
-- WHERE  status_code = 'active' AND next_billing_date <= DATE '2026-08-18'
-- ORDER  BY next_billing_date
-- LIMIT  10;
--
-- -- run
-- CALL sp_process_billing_cycle(DATE '2026-08-18', 50, 0, 0);
--
-- -- state AFTER  (same two queries: 'expired' grew, the dates moved forward)
-- SELECT status_code, COUNT(*) FROM player_subscription GROUP BY 1 ORDER BY 1;
-- SELECT subscription_id, status_code, auto_renew, billing_cycle_code, next_billing_date
-- FROM   player_subscription
-- WHERE  status_code = 'active' AND next_billing_date <= DATE '2026-08-18'
-- ORDER  BY next_billing_date
-- LIMIT  10;
--
-- ROLLBACK;
-- ============================================================
