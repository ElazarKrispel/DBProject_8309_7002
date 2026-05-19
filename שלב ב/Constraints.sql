-- ============================================================
-- Chess Platform – Phase B  |  Constraints.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
-- ============================================================
-- Adds 3 new CHECK constraints via ALTER TABLE.
--
-- IMPORTANT (PostgreSQL behaviour):
--   ALTER TABLE ADD CONSTRAINT ... CHECK validates ALL existing rows
--   by default.  If any existing row violates the condition, the
--   command fails.  Run the "violation check" query before each
--   ALTER TABLE to confirm zero violations first.
--   If violations exist, fix the data or use NOT VALID and then
--   VALIDATE CONSTRAINT separately.
-- ============================================================


-- ============================================================
-- CONSTRAINT 1: birth_date must be earlier than registration_date
-- Table: player
-- Rationale: A player cannot register on the platform before
--            they were born.  Prevents obvious data-entry errors.
-- ============================================================

-- Step 1 – Check for existing violations:
SELECT COUNT(*) AS violations
FROM   player
WHERE  birth_date IS NOT NULL
  AND  birth_date >= registration_date;
-- Expected: 0 rows (safe to add constraint).

-- Step 2 – Add the constraint:
ALTER TABLE player
ADD CONSTRAINT chk_birth_before_registration
CHECK (birth_date IS NULL OR birth_date < registration_date);

-- Step 3 – Verify constraint was created:
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM   pg_constraint
WHERE  conrelid = 'player'::regclass
  AND  conname  = 'chk_birth_before_registration';

-- Step 4 – Attempt to INSERT a row that violates the constraint:
--          birth_date (2025-01-01) is AFTER registration_date (2020-06-01)
INSERT INTO player (
    player_id, username, email, first_name, last_name, status_code,
    rating_classical, rating_rapid, rating_blitz,
    birth_date, registration_date
) VALUES (
    9901, 'test_birth_bad', 'test_birth_bad@example.com',
    'Test', 'BirthBad', 'active',
    1200, 1200, 1200,
    '2025-01-01',   -- birth_date is AFTER registration_date → violation
    '2020-06-01'
);
-- Expected result: ERROR – new row violates check constraint
--                 "chk_birth_before_registration"
-- Screenshot this error to prove the constraint works.

-- Cleanup – remove the test row if the INSERT somehow succeeded:
DELETE FROM player WHERE player_id = 9901;


-- ============================================================
-- CONSTRAINT 2: session_duration_sec cannot exceed 86400 (24 hours)
-- Table: login_log
-- Rationale: A single login session lasting more than 24 hours
--            is technically impossible (tokens expire, etc.) and
--            indicates corrupt data.
-- ============================================================

-- Step 1 – Check for existing violations:
SELECT COUNT(*) AS violations
FROM   login_log
WHERE  session_duration_sec > 86400;
-- Expected: 0 rows (safe to add constraint).

-- Step 2 – Add the constraint:
ALTER TABLE login_log
ADD CONSTRAINT chk_session_max_duration
CHECK (session_duration_sec <= 86400);

-- Step 3 – Verify:
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM   pg_constraint
WHERE  conrelid = 'login_log'::regclass
  AND  conname  = 'chk_session_max_duration';

-- Step 4 – Attempt to INSERT a row with duration > 86400:
INSERT INTO login_log (
    log_id, player_id, ip_address, device_type, operating_system,
    browser, login_status_code, session_duration_sec, is_suspicious, login_date
) VALUES (
    99901, 1, '192.168.1.100', 'desktop', 'Windows 11',
    'Chrome', 'success',
    100000,  -- 100 000 seconds ≈ 27.8 hours → violation
    FALSE, CURRENT_DATE
);
-- Expected result: ERROR – new row violates check constraint
--                 "chk_session_max_duration"

-- Cleanup:
DELETE FROM login_log WHERE log_id = 99901;


-- ============================================================
-- CONSTRAINT 3: price_annual >= price_monthly
-- Table: subscription_tier
-- Rationale: The annual plan price (paid as one lump sum) must
--            be at least as large as the monthly price.  A tier
--            where the annual cost is less than a single monthly
--            payment would be a pricing configuration error.
-- ============================================================

-- Step 1 – Check for existing violations:
SELECT COUNT(*) AS violations
FROM   subscription_tier
WHERE  price_annual < price_monthly;
-- Expected: 0 rows (safe to add constraint).

-- Step 2 – Add the constraint:
ALTER TABLE subscription_tier
ADD CONSTRAINT chk_annual_gte_monthly
CHECK (price_annual >= price_monthly);

-- Step 3 – Verify:
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM   pg_constraint
WHERE  conrelid = 'subscription_tier'::regclass
  AND  conname  = 'chk_annual_gte_monthly';

-- Step 4 – Attempt to INSERT a tier where annual < monthly:
INSERT INTO subscription_tier (
    tier_id, tier_name, price_monthly, price_annual,
    max_daily_games, has_analytics, has_puzzles, has_engine
) VALUES (
    9901, 'Bad Pricing Tier',
    100.00,   -- monthly price
     50.00,   -- annual price < monthly → violation
    10, FALSE, FALSE, FALSE
);
-- Expected result: ERROR – new row violates check constraint
--                 "chk_annual_gte_monthly"

-- Cleanup:
DELETE FROM subscription_tier WHERE tier_id = 9901;
