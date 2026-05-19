-- ============================================================
-- Chess Platform – Phase B  |  Index.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
-- ============================================================
-- Creates 3 indexes and measures query performance
-- before and after each one using EXPLAIN ANALYZE.
--
-- Pattern for each index:
--   1. EXPLAIN ANALYZE the target query (before)
--   2. CREATE INDEX
--   3. EXPLAIN ANALYZE the same query again (after)
--   4. Compare "Execution Time" in the two outputs.
-- ============================================================


-- ============================================================
-- INDEX 1: idx_login_log_date
-- Table  : login_log
-- Column : login_date
-- Rationale:
--   Q2 (Monthly Login Activity Report) filters on login_date
--   with a range condition (>= '2024-01-01') and then groups by
--   EXTRACT(YEAR/MONTH FROM login_date).  Without an index the
--   planner must perform a sequential scan of all 20,000 rows.
--   A B-tree index on login_date lets the planner use an index
--   range scan to retrieve only the rows in the target date range.
-- ============================================================

-- Step 1 – EXPLAIN ANALYZE BEFORE index:
EXPLAIN ANALYZE
SELECT
    EXTRACT(YEAR  FROM login_date)::INTEGER             AS login_year,
    EXTRACT(MONTH FROM login_date)::INTEGER             AS login_month,
    COUNT(*)                                            AS total_logins,
    SUM(CASE WHEN is_suspicious = TRUE THEN 1 ELSE 0 END) AS suspicious_count,
    ROUND(AVG(session_duration_sec), 0)                AS avg_session_sec
FROM login_log
WHERE login_date >= '2024-01-01'
GROUP BY
    EXTRACT(YEAR  FROM login_date),
    EXTRACT(MONTH FROM login_date)
ORDER BY login_year DESC, login_month DESC;

-- Step 2 – Create the index:
CREATE INDEX idx_login_log_date
    ON login_log(login_date);

-- Step 3 – EXPLAIN ANALYZE AFTER index:
EXPLAIN ANALYZE
SELECT
    EXTRACT(YEAR  FROM login_date)::INTEGER             AS login_year,
    EXTRACT(MONTH FROM login_date)::INTEGER             AS login_month,
    COUNT(*)                                            AS total_logins,
    SUM(CASE WHEN is_suspicious = TRUE THEN 1 ELSE 0 END) AS suspicious_count,
    ROUND(AVG(session_duration_sec), 0)                AS avg_session_sec
FROM login_log
WHERE login_date >= '2024-01-01'
GROUP BY
    EXTRACT(YEAR  FROM login_date),
    EXTRACT(MONTH FROM login_date)
ORDER BY login_year DESC, login_month DESC;

-- Note on results:
--   If the table is small relative to the filter selectivity, the
--   planner may still choose a Seq Scan (cheaper for wide coverage).
--   A clear speed improvement is typically visible when the date
--   filter selects < ~20% of rows.  Either outcome should be
--   explained in the report.


-- ============================================================
-- INDEX 2: idx_player_subscription_status_tier  (composite)
-- Table  : player_subscription
-- Columns: (status_code, tier_id)
-- Rationale:
--   Q3 (Most Popular Subscription Tiers) filters on
--   status_code = 'active' AND joins on tier_id.
--   A composite index starting with status_code satisfies the
--   WHERE clause first (equality filter) and then provides the
--   tier_id value needed for the join without a separate lookup.
--   Q6-A (players with active subscription, JOIN version) also
--   benefits from this index.
-- ============================================================

-- Step 1 – EXPLAIN ANALYZE BEFORE index:
EXPLAIN ANALYZE
SELECT
    st.tier_name,
    COUNT(ps.subscription_id)                                        AS total_subscribers,
    SUM(CASE WHEN ps.status_code = 'active' THEN 1 ELSE 0 END)      AS active_subscribers
FROM player_subscription ps
JOIN subscription_tier st ON st.tier_id = ps.tier_id
WHERE ps.status_code = 'active'
GROUP BY st.tier_id, st.tier_name
ORDER BY active_subscribers DESC;

-- Step 2 – Create the composite index:
CREATE INDEX idx_player_subscription_status_tier
    ON player_subscription(status_code, tier_id);

-- Step 3 – EXPLAIN ANALYZE AFTER index:
EXPLAIN ANALYZE
SELECT
    st.tier_name,
    COUNT(ps.subscription_id)                                        AS total_subscribers,
    SUM(CASE WHEN ps.status_code = 'active' THEN 1 ELSE 0 END)      AS active_subscribers
FROM player_subscription ps
JOIN subscription_tier st ON st.tier_id = ps.tier_id
WHERE ps.status_code = 'active'
GROUP BY st.tier_id, st.tier_name
ORDER BY active_subscribers DESC;

-- Note on results:
--   The composite index (status_code, tier_id) allows the planner
--   to use an Index Scan for the WHERE status_code = 'active' filter
--   and retrieve tier_id directly from the index entry.  The degree
--   of improvement depends on how selective 'active' is among all
--   subscription rows.


-- ============================================================
-- INDEX 3: idx_social_connection_to_player  (composite)
-- Table  : social_connection
-- Columns: (to_player_id, connection_type_code, status_code)
-- Rationale:
--   Q4 (Social Leaderboard) joins social_connection on
--   to_player_id and then groups by connection_type_code and
--   status_code.  The index starts with to_player_id (the join
--   column), allowing the planner to look up each player's
--   incoming connections efficiently.  Including
--   connection_type_code and status_code in the index may allow
--   the planner to satisfy the COUNT(CASE WHEN ...) expressions
--   directly from the index without visiting the heap (this
--   depends on PostgreSQL version and query form; inspect
--   EXPLAIN ANALYZE output to confirm).
-- ============================================================

-- Step 1 – EXPLAIN ANALYZE BEFORE index:
EXPLAIN ANALYZE
SELECT
    p.username,
    COUNT(CASE WHEN sc.connection_type_code = 'friend'
               AND  sc.status_code          = 'accepted' THEN 1 END) AS accepted_friends,
    COUNT(CASE WHEN sc.connection_type_code = 'follow'   THEN 1 END) AS followers,
    COUNT(sc.connection_id)                                           AS total_connections
FROM player p
LEFT JOIN social_connection sc ON sc.to_player_id = p.player_id
WHERE p.status_code = 'active'
GROUP BY p.player_id, p.username
ORDER BY total_connections DESC
LIMIT 10;

-- Step 2 – Create the composite index:
CREATE INDEX idx_social_connection_to_player
    ON social_connection(to_player_id, connection_type_code, status_code);

-- Step 3 – EXPLAIN ANALYZE AFTER index:
EXPLAIN ANALYZE
SELECT
    p.username,
    COUNT(CASE WHEN sc.connection_type_code = 'friend'
               AND  sc.status_code          = 'accepted' THEN 1 END) AS accepted_friends,
    COUNT(CASE WHEN sc.connection_type_code = 'follow'   THEN 1 END) AS followers,
    COUNT(sc.connection_id)                                           AS total_connections
FROM player p
LEFT JOIN social_connection sc ON sc.to_player_id = p.player_id
WHERE p.status_code = 'active'
GROUP BY p.player_id, p.username
ORDER BY total_connections DESC
LIMIT 10;

-- Note on results:
--   With 20,000 rows in social_connection and 500 players, this
--   index is most likely to show improvement when the planner
--   chooses a nested-loop join (one index lookup per player).
--   If the planner selects a Hash Join instead, the sequential
--   scan of social_connection may still be preferred, and the
--   improvement will be smaller.  Both outcomes are valid and
--   should be explained in the report.
