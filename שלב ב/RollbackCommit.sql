-- ============================================================
-- Chess Platform – Phase B  |  RollbackCommit.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
-- ============================================================
-- Demonstrates two transaction scenarios:
--   Scenario 1: Change a player's classical rating → ROLLBACK
--   Scenario 2: Enable auto-renew on a subscription → COMMIT
-- ============================================================


-- ============================================================
-- SCENARIO 1: ROLLBACK
-- Goal: Update a player's classical rating, then cancel the
--       change to show the database returns to its original state.
-- ============================================================

-- Step 1 – State BEFORE the transaction:
SELECT player_id, username, first_name, last_name, rating_classical
FROM   player
WHERE  player_id = 1;

-- Step 2 – Begin transaction and apply change:
BEGIN;

UPDATE player
SET    rating_classical = rating_classical + 50
WHERE  player_id = 1;

-- Step 3 – State AFTER UPDATE (still inside the open transaction):
SELECT player_id, username, first_name, last_name, rating_classical
FROM   player
WHERE  player_id = 1;

-- Step 4 – Cancel the change:
ROLLBACK;

-- Step 5 – State AFTER ROLLBACK (must equal Step 1):
SELECT player_id, username, first_name, last_name, rating_classical
FROM   player
WHERE  player_id = 1;

-- Expected: rating_classical in Step 5 equals Step 1 (no change).


-- ============================================================
-- SCENARIO 2: COMMIT
-- Goal: Enable auto-renew on subscription #4, then commit to
--       show the change is permanently saved.
-- ============================================================

-- Step 1 – State BEFORE the transaction:
SELECT subscription_id, player_id, tier_id, status_code, auto_renew
FROM   player_subscription
WHERE  subscription_id = 4;

-- Step 2 – Begin transaction and apply change:
BEGIN;

UPDATE player_subscription
SET    auto_renew = TRUE
WHERE  subscription_id = 4;

-- Step 3 – State AFTER UPDATE (still inside the open transaction):
SELECT subscription_id, player_id, tier_id, status_code, auto_renew
FROM   player_subscription
WHERE  subscription_id = 4;

-- Step 4 – Commit the change permanently:
COMMIT;

-- Step 5 – State AFTER COMMIT (auto_renew must be TRUE):
SELECT subscription_id, player_id, tier_id, status_code, auto_renew
FROM   player_subscription
WHERE  subscription_id = 4;

-- Expected: auto_renew = TRUE in Steps 3, 4, and 5.
