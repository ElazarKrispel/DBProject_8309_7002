-- ============================================================
-- Chess Platform – Phase B  |  Queries.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
-- ============================================================

-- ============================================================
-- SELECT QUERIES (Regular) – Q1 to Q4
-- ============================================================

-- ------------------------------------------------------------
-- Q1: Active players with ratings and active-club count
-- Screen: Player Dashboard
-- Tables: player, club_membership
-- Techniques: LEFT JOIN, GROUP BY, COUNT DISTINCT, ORDER BY
-- ------------------------------------------------------------
SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name   AS full_name,
    p.country_code,
    p.rating_classical,
    p.rating_rapid,
    p.rating_blitz,
    p.registration_date,
    COUNT(DISTINCT cm.club_id)            AS active_clubs_count
FROM player p
LEFT JOIN club_membership cm
       ON cm.player_id    = p.player_id
      AND cm.status_code  = 'active'
WHERE p.status_code = 'active'
GROUP BY
    p.player_id, p.username, p.first_name, p.last_name,
    p.country_code, p.rating_classical, p.rating_rapid,
    p.rating_blitz, p.registration_date
ORDER BY p.rating_classical DESC
LIMIT 20;


-- ------------------------------------------------------------
-- Q2: Monthly login activity report
-- Screen: Security Dashboard / Reports
-- Tables: login_log
-- Techniques: EXTRACT(YEAR/MONTH), GROUP BY, SUM(CASE WHEN), AVG
-- ------------------------------------------------------------
SELECT
    EXTRACT(YEAR  FROM login_date)::INTEGER             AS login_year,
    EXTRACT(MONTH FROM login_date)::INTEGER             AS login_month,
    COUNT(*)                                            AS total_logins,
    SUM(CASE WHEN login_status_code = 'success' THEN 1 ELSE 0 END) AS successful_logins,
    SUM(CASE WHEN login_status_code = 'failed'  THEN 1 ELSE 0 END) AS failed_logins,
    SUM(CASE WHEN is_suspicious = TRUE          THEN 1 ELSE 0 END) AS suspicious_count,
    ROUND(AVG(session_duration_sec), 0)                AS avg_session_sec
FROM login_log
GROUP BY
    EXTRACT(YEAR  FROM login_date),
    EXTRACT(MONTH FROM login_date)
ORDER BY login_year DESC, login_month DESC;


-- ------------------------------------------------------------
-- Q3: Most popular subscription tiers
-- Screen: Subscription Analytics / Admin Dashboard
-- Tables: player_subscription, subscription_tier
-- Techniques: JOIN, GROUP BY, COUNT, SUM(CASE WHEN), ORDER BY
-- ------------------------------------------------------------
SELECT
    st.tier_name,
    COUNT(ps.subscription_id)                                        AS total_subscribers,
    SUM(CASE WHEN ps.status_code = 'active'    THEN 1 ELSE 0 END)   AS active_subscribers,
    st.price_monthly,
    st.price_annual,
    st.has_analytics,
    st.has_puzzles,
    st.has_engine,
    SUM(CASE WHEN ps.status_code = 'cancelled' THEN 1 ELSE 0 END)   AS cancelled_subscribers
FROM subscription_tier st
JOIN player_subscription ps ON ps.tier_id = st.tier_id
GROUP BY
    st.tier_id, st.tier_name, st.price_monthly, st.price_annual,
    st.has_analytics, st.has_puzzles, st.has_engine
ORDER BY active_subscribers DESC, total_subscribers DESC
LIMIT 15;


-- ------------------------------------------------------------
-- Q4: Players with most social connections (friends + followers)
-- Screen: Social Leaderboard
-- Tables: player, social_connection
-- Techniques: LEFT JOIN, COUNT(CASE WHEN), GROUP BY, ORDER BY
-- ------------------------------------------------------------
SELECT
    p.username,
    p.first_name || ' ' || p.last_name   AS full_name,
    p.country_code,
    p.rating_classical,
    COUNT(CASE WHEN sc.connection_type_code = 'friend'
               AND  sc.status_code          = 'accepted' THEN 1 END) AS accepted_friends,
    COUNT(CASE WHEN sc.connection_type_code = 'follow'   THEN 1 END) AS followers,
    COUNT(sc.connection_id)                                           AS total_connections
FROM player p
LEFT JOIN social_connection sc ON sc.to_player_id = p.player_id
WHERE p.status_code = 'active'
GROUP BY
    p.player_id, p.username, p.first_name, p.last_name,
    p.country_code, p.rating_classical
ORDER BY total_connections DESC
LIMIT 15;


-- ============================================================
-- SELECT QUERIES (Dual versions) – Q5 to Q8
-- Both versions of each query return the same logical result.
-- ============================================================

-- ------------------------------------------------------------
-- Q5: Players who belong to at least 3 active clubs
-- Screen: Club Management – High Engagement Players
-- Tables: player, club_membership
-- ------------------------------------------------------------

-- Q5 – Version A: GROUP BY + HAVING
SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    COUNT(DISTINCT cm.club_id)              AS club_count
FROM player p
JOIN club_membership cm
  ON cm.player_id   = p.player_id
 AND cm.status_code = 'active'
GROUP BY p.player_id, p.username, p.first_name, p.last_name, p.country_code
HAVING COUNT(DISTINCT cm.club_id) >= 3
ORDER BY club_count DESC;

-- Q5 – Version B: IN + subquery (also returns club_count via correlated subquery)
SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    (SELECT COUNT(DISTINCT cm2.club_id)
       FROM club_membership cm2
      WHERE cm2.player_id   = p.player_id
        AND cm2.status_code = 'active')     AS club_count
FROM player p
WHERE p.player_id IN (
    SELECT cm.player_id
    FROM   club_membership cm
    WHERE  cm.status_code = 'active'
    GROUP  BY cm.player_id
    HAVING COUNT(DISTINCT cm.club_id) >= 3
)
ORDER BY club_count DESC;

-- Difference explanation:
-- Version A scans club_membership once and filters with HAVING.
-- Version B first builds the qualifying player_id list, then retrieves
-- full player rows. The correlated subquery in Version B adds a second
-- scan per row to compute club_count, making Version A generally more efficient.


-- ------------------------------------------------------------
-- Q6: Players who have an active subscription
-- Screen: Subscription Management
-- Tables: player, player_subscription
-- Both versions return: player_id, username, full_name, country_code, status_code
-- ------------------------------------------------------------

-- Q6 – Version A: JOIN + DISTINCT
SELECT DISTINCT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    p.status_code
FROM player p
JOIN player_subscription ps
  ON ps.player_id   = p.player_id
 AND ps.status_code = 'active'
ORDER BY p.player_id
LIMIT 20;

-- Q6 – Version B: WHERE EXISTS
SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.country_code,
    p.status_code
FROM player p
WHERE EXISTS (
    SELECT 1
    FROM   player_subscription ps
    WHERE  ps.player_id   = p.player_id
      AND  ps.status_code = 'active'
)
ORDER BY p.player_id
LIMIT 20;

-- Difference explanation:
-- Version A (JOIN) may produce duplicate rows when a player has multiple
-- active subscriptions; DISTINCT removes them but adds a sort step.
-- Version B (EXISTS) stops scanning player_subscription after the first
-- match and never generates duplicates, making it generally faster for
-- large tables.


-- ------------------------------------------------------------
-- Q7: Players who have never logged in to the system
-- Screen: Inactive Users / Security Monitoring
-- Tables: player, login_log
-- Both versions return: player_id, username, full_name, registration_date, status_code
-- ------------------------------------------------------------

-- Q7 – Version A: LEFT JOIN + IS NULL
SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.registration_date,
    p.status_code
FROM player p
LEFT JOIN login_log ll ON ll.player_id = p.player_id
WHERE ll.log_id IS NULL
ORDER BY p.registration_date;

-- Q7 – Version B: NOT EXISTS
SELECT
    p.player_id,
    p.username,
    p.first_name || ' ' || p.last_name     AS full_name,
    p.registration_date,
    p.status_code
FROM player p
WHERE NOT EXISTS (
    SELECT 1
    FROM   login_log ll
    WHERE  ll.player_id = p.player_id
)
ORDER BY p.registration_date;

-- Difference explanation:
-- Version A performs a full LEFT JOIN and then discards matched rows.
-- Version B (NOT EXISTS) stops at the first matching log row and never
-- materialises the join result. With an index on login_log.player_id,
-- NOT EXISTS is typically faster for this "no-match" pattern.


-- ------------------------------------------------------------
-- Q8: Clubs with active-member statistics
-- Screen: Club Management Dashboard
-- Tables: club, club_membership
-- Both versions return: club_id, club_name, country_code, city,
--   is_official, founded_date, active_members, owner_count, admin_count, oldest_member_date
-- ------------------------------------------------------------

-- Q8 – Version A: CTE
WITH club_stats AS (
    SELECT
        club_id,
        COUNT(*)                                                AS active_members,
        SUM(CASE WHEN role_code = 'owner' THEN 1 ELSE 0 END)  AS owner_count,
        SUM(CASE WHEN role_code = 'admin' THEN 1 ELSE 0 END)  AS admin_count,
        MIN(join_date)                                          AS oldest_member_date
    FROM  club_membership
    WHERE status_code = 'active'
    GROUP BY club_id
)
SELECT
    c.club_id,
    c.club_name,
    cs.active_members,
    c.country_code,
    c.city,
    c.is_official,
    c.founded_date,
    cs.owner_count,
    cs.admin_count,
    cs.oldest_member_date
FROM club c
JOIN club_stats cs ON cs.club_id = c.club_id
ORDER BY cs.active_members DESC
LIMIT 20;

-- Q8 – Version B: Inline subquery (no CTE)

SELECT
    c.club_id, c.club_name,
    sub.active_members, c.country_code, c.city,
    c.is_official, c.founded_date, sub.owner_count, sub.admin_count, sub.oldest_member_date
FROM club c
JOIN (
    SELECT
        club_id,
        COUNT(*)                                                AS active_members,
        SUM(CASE WHEN role_code = 'owner' THEN 1 ELSE 0 END)  AS owner_count,
        SUM(CASE WHEN role_code = 'admin' THEN 1 ELSE 0 END)  AS admin_count,
        MIN(join_date)                                          AS oldest_member_date
    FROM  club_membership
    WHERE status_code = 'active'
    GROUP BY club_id
) sub ON sub.club_id = c.club_id
ORDER BY sub.active_members DESC
LIMIT 20;

-- Difference explanation:
-- Version A (CTE) makes the aggregation readable and named; in modern
-- PostgreSQL (v12+) the CTE is treated as an optimisation fence only
-- when marked MATERIALIZED. By default the planner can inline it.
-- Version B (inline subquery) is functionally equivalent. The planner
-- usually produces the same execution plan for both.


-- ============================================================
-- UPDATE QUERIES – wrapped in BEGIN/ROLLBACK for safe demo
-- To apply permanently: replace ROLLBACK with COMMIT.
-- ============================================================

-- ------------------------------------------------------------
-- U1: Suspend active players who had suspicious logins in the
--     last 180 days.
-- Logical screen: Security / Player Management
-- ------------------------------------------------------------

-- State BEFORE:
SELECT player_id, username, status_code
FROM   player
WHERE  status_code = 'active'
  AND  player_id IN (
           SELECT DISTINCT player_id
           FROM   login_log
           WHERE  is_suspicious = TRUE
             AND  login_date   >= CURRENT_DATE - INTERVAL '180 days'
       )
ORDER  BY player_id;

BEGIN;

UPDATE player
SET    status_code = 'suspended'
WHERE  status_code = 'active'
  AND  player_id IN (
           SELECT DISTINCT player_id
           FROM   login_log
           WHERE  is_suspicious = TRUE
             AND  login_date   >= CURRENT_DATE - INTERVAL '180 days'
       );

-- State AFTER (still inside transaction):
SELECT player_id, username, status_code
FROM   player
WHERE  player_id IN (
           SELECT DISTINCT player_id
           FROM   login_log
           WHERE  is_suspicious = TRUE
             AND  login_date   >= CURRENT_DATE - INTERVAL '180 days'
       )
ORDER  BY player_id;

ROLLBACK; -- Change to COMMIT when you want to persist the change.


-- ------------------------------------------------------------
-- U2: Expire active subscriptions whose end_date has already passed.
-- Logical screen: Subscription Management / Billing
-- ------------------------------------------------------------

-- State BEFORE:
SELECT subscription_id, player_id, status_code, end_date, auto_renew
FROM   player_subscription
WHERE  status_code = 'active'
  AND  end_date   <  CURRENT_DATE
ORDER  BY end_date DESC
LIMIT  10;

BEGIN;

UPDATE player_subscription
SET    status_code = 'expired',
       auto_renew  = FALSE
WHERE  status_code = 'active'
  AND  end_date   <  CURRENT_DATE;

-- State AFTER:
SELECT subscription_id, player_id, status_code, end_date, auto_renew
FROM   player_subscription
WHERE  status_code = 'expired'
  AND  end_date   <  CURRENT_DATE
ORDER  BY end_date DESC
LIMIT  10;

ROLLBACK;


-- ------------------------------------------------------------
-- U3: Promote the longest-serving active member to 'admin' in
--     every club that currently has no admin.
-- Logical screen: Club Management
-- ------------------------------------------------------------

-- State BEFORE – clubs with no admin:
SELECT cm.club_id, c.club_name, COUNT(*) AS active_members
FROM   club_membership cm
JOIN   club c ON c.club_id = cm.club_id
WHERE  cm.status_code = 'active'
GROUP  BY cm.club_id, c.club_name
HAVING SUM(CASE WHEN cm.role_code = 'admin' THEN 1 ELSE 0 END) = 0
ORDER  BY active_members DESC
LIMIT  10;

BEGIN;

UPDATE club_membership upd
SET    role_code = 'admin'
WHERE  upd.status_code = 'active'
  AND  upd.role_code   = 'member'
  AND  upd.membership_id = (
           SELECT inner_cm.membership_id
           FROM   club_membership inner_cm
           WHERE  inner_cm.club_id     = upd.club_id
             AND  inner_cm.status_code = 'active'
           ORDER  BY inner_cm.join_date ASC
           LIMIT  1
       )
  AND  NOT EXISTS (
           SELECT 1
           FROM   club_membership chk
           WHERE  chk.club_id     = upd.club_id
             AND  chk.status_code = 'active'
             AND  chk.role_code   = 'admin'
       );

-- State AFTER – newly promoted admins:
SELECT cm.membership_id, cm.player_id, p.username,
       cm.club_id, cm.role_code, cm.join_date
FROM   club_membership cm
JOIN   player p ON p.player_id = cm.player_id
WHERE  cm.role_code   = 'admin'
  AND  cm.status_code = 'active'
ORDER  BY cm.join_date ASC
LIMIT  10;

ROLLBACK;


-- ============================================================
-- DELETE QUERIES – wrapped in BEGIN/ROLLBACK for safe demo
-- To apply permanently: replace ROLLBACK with COMMIT.
-- ============================================================

-- ------------------------------------------------------------
-- D1: Delete declined social connections older than 365 days.
-- Logical screen: Social Network cleanup
-- ------------------------------------------------------------

-- State BEFORE:
SELECT connection_id, from_player_id, to_player_id,
       connection_type_code, status_code, created_date
FROM   social_connection
WHERE  status_code   = 'declined'
  AND  created_date  < CURRENT_DATE - INTERVAL '365 days'
ORDER  BY created_date ASC
LIMIT  10;

-- Row count before:
SELECT COUNT(*) AS declined_old_count
FROM   social_connection
WHERE  status_code  = 'declined'
  AND  created_date < CURRENT_DATE - INTERVAL '365 days';

BEGIN;

DELETE FROM social_connection
WHERE  status_code  = 'declined'
  AND  created_date < CURRENT_DATE - INTERVAL '365 days';

-- Row count AFTER:
SELECT COUNT(*) AS declined_old_remaining
FROM   social_connection
WHERE  status_code  = 'declined'
  AND  created_date < CURRENT_DATE - INTERVAL '365 days';

ROLLBACK;


-- ------------------------------------------------------------
-- D2: Delete failed login log entries older than 730 days (2 years).
-- Logical screen: Security Log Maintenance
-- ------------------------------------------------------------

-- State BEFORE – count old failed logs:
SELECT COUNT(*) AS old_failed_logs
FROM   login_log
WHERE  login_status_code = 'failed'
  AND  login_date        < CURRENT_DATE - INTERVAL '730 days';

-- Sample of rows to be deleted:
SELECT log_id, player_id, ip_address, login_date, login_status_code
FROM   login_log
WHERE  login_status_code = 'failed'
  AND  login_date        < CURRENT_DATE - INTERVAL '730 days'
ORDER  BY login_date ASC
LIMIT  5;

BEGIN;

DELETE FROM login_log
WHERE  login_status_code = 'failed'
  AND  login_date        < CURRENT_DATE - INTERVAL '730 days';

-- State AFTER:
SELECT COUNT(*) AS old_failed_logs_remaining
FROM   login_log
WHERE  login_status_code = 'failed'
  AND  login_date        < CURRENT_DATE - INTERVAL '730 days';

ROLLBACK;


-- ------------------------------------------------------------
-- D3: Delete pending memberships for suspended/banned players.
-- Logical screen: Membership Management
-- ------------------------------------------------------------

-- State BEFORE:
SELECT cm.membership_id, cm.player_id, p.username,
       p.status_code  AS player_status,
       cm.club_id, cm.status_code AS membership_status, cm.join_date
FROM   club_membership cm
JOIN   player p ON p.player_id = cm.player_id
WHERE  cm.status_code = 'pending'
  AND  p.status_code  IN ('suspended', 'banned')
ORDER  BY cm.join_date;

-- Row count before:
SELECT COUNT(*) AS pending_blocked_players
FROM   club_membership cm
JOIN   player p ON p.player_id = cm.player_id
WHERE  cm.status_code = 'pending'
  AND  p.status_code  IN ('suspended', 'banned');

BEGIN;

DELETE FROM club_membership
WHERE  status_code = 'pending'
  AND  player_id  IN (
           SELECT player_id FROM player
           WHERE  status_code IN ('suspended', 'banned')
       );

-- State AFTER:
SELECT COUNT(*) AS pending_blocked_remaining
FROM   club_membership cm
JOIN   player p ON p.player_id = cm.player_id
WHERE  cm.status_code = 'pending'
  AND  p.status_code  IN ('suspended', 'banned');

ROLLBACK;
