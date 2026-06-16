-- ============================================================
-- Chess Platform – Phase C  |  Views.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- 3 views:
--   View 1  – our original department  (Players & Clubs)
--   View 2  – the received department   (Chess Engines)
--   View 3  – INTEGRATION view: crosses the bridge and proves
--             the two systems are now connected.
-- Each view is followed by 2 meaningful queries.
-- All views are fan-out safe (each entity aggregated separately).
-- ============================================================


-- ============================================================
-- VIEW 1  |  vw_player_club_membership      (our department)
-- Joins player + club_membership + club (3 tables).
-- Useful & stable: the current active club memberships with the
-- player's details, role and the club's details. This is data the
-- platform reads constantly (club pages, member lists, dashboards).
-- ============================================================
CREATE OR REPLACE VIEW vw_player_club_membership AS
SELECT p.player_id,
       p.username,
       p.first_name || ' ' || p.last_name AS full_name,
       p.country_code,
       p.rating_classical,
       p.status_code           AS player_status,
       c.club_id,
       c.club_name,
       c.is_official,
       cm.role_code,
       cm.join_date
FROM player p
JOIN club_membership cm ON cm.player_id = p.player_id AND cm.status_code = 'active'
JOIN club c             ON c.club_id    = cm.club_id;

-- Query 1.1: the 10 largest clubs by number of active members.
SELECT club_name,
       is_official,
       COUNT(*)                     AS active_members,
       COUNT(DISTINCT country_code) AS member_countries
FROM vw_player_club_membership
GROUP BY club_name, is_official
ORDER BY active_members DESC
LIMIT 10;

-- Query 1.2: leaders (owner/admin) of official clubs, strongest first.
SELECT full_name,
       role_code,
       club_name,
       rating_classical
FROM vw_player_club_membership
WHERE is_official = TRUE
  AND role_code IN ('owner', 'admin')
ORDER BY rating_classical DESC
LIMIT 10;


-- ============================================================
-- VIEW 2  |  vw_engine_overview            (received department)
-- Joins engine + localengine + cloudengine + bot + engineevaluation.
-- Each 1:N child (bots, evaluations) is aggregated in its OWN CTE
-- BEFORE joining to engine, so there is no cartesian fan-out and
-- avg_search_depth stays correct.
-- Useful & stable: a catalog of every engine, its deployment type
-- (Local / Cloud) and how heavily it is used.
-- ============================================================
CREATE OR REPLACE VIEW vw_engine_overview AS
WITH bot_counts AS (
    SELECT engine_id, COUNT(*) AS bot_count
    FROM bot
    GROUP BY engine_id
),
eval_stats AS (
    SELECT engine_id,
           COUNT(*)                    AS evaluation_count,
           ROUND(AVG(search_depth), 1) AS avg_search_depth
    FROM engineevaluation
    GROUP BY engine_id
)
SELECT e.engine_id,
       e.name      AS engine_name,
       e.version,
       CASE WHEN le.engine_id IS NOT NULL THEN 'Local'
            WHEN ce.engine_id IS NOT NULL THEN 'Cloud'
            ELSE 'Generic' END          AS engine_type,
       COALESCE(bc.bot_count, 0)        AS bot_count,
       COALESCE(es.evaluation_count, 0) AS evaluation_count,
       es.avg_search_depth
FROM engine e
LEFT JOIN localengine le ON le.engine_id = e.engine_id   -- 1:1 (ISA)
LEFT JOIN cloudengine ce ON ce.engine_id = e.engine_id   -- 1:1 (ISA)
LEFT JOIN bot_counts  bc ON bc.engine_id = e.engine_id   -- pre-aggregated
LEFT JOIN eval_stats  es ON es.engine_id = e.engine_id;  -- pre-aggregated

-- Query 2.1: the 10 engines powering the most bots.
SELECT engine_name,
       version,
       engine_type,
       bot_count,
       evaluation_count,
       avg_search_depth
FROM vw_engine_overview
ORDER BY bot_count DESC, evaluation_count DESC
LIMIT 10;

-- Query 2.2: deployment summary – Local vs Cloud engines.
SELECT engine_type,
       COUNT(*)                        AS engines,
       SUM(bot_count)                  AS total_bots,
       SUM(evaluation_count)           AS total_evaluations,
       ROUND(AVG(avg_search_depth), 1) AS avg_depth
FROM vw_engine_overview
GROUP BY engine_type
ORDER BY engines DESC;


-- ============================================================
-- VIEW 3  |  vw_client_login_activity     (INTEGRATION / bridge)
-- Crosses the bridge: uiclient (their table) + login_log + player
-- (our tables), connected through the new login_log.client_id FK.
-- This view only exists because the two systems are integrated, so
-- it is the living proof that the integration works.
-- Useful & stable: per client application – how much it is used,
-- by how many distinct players, from how many countries, and how
-- many of those logins were flagged suspicious.
-- ============================================================
CREATE OR REPLACE VIEW vw_client_login_activity AS
SELECT u.client_id,
       u.name        AS client_name,
       u.client_type,
       COUNT(ll.log_id)                                  AS total_logins,
       COUNT(DISTINCT ll.player_id)                      AS distinct_players,
       COUNT(DISTINCT p.country_code)                    AS player_countries,
       SUM(CASE WHEN ll.is_suspicious THEN 1 ELSE 0 END) AS suspicious_logins,
       MAX(ll.login_date)                                AS last_login_date
FROM uiclient u
LEFT JOIN login_log ll ON ll.client_id = u.client_id     -- THE BRIDGE
LEFT JOIN player    p  ON p.player_id  = ll.player_id     -- N:1, no fan-out
GROUP BY u.client_id, u.name, u.client_type;

-- Query 3.1: which client applications are used the most.
SELECT client_name,
       client_type,
       total_logins,
       distinct_players,
       player_countries,
       suspicious_logins
FROM vw_client_login_activity
ORDER BY total_logins DESC;

-- Query 3.2: activity summary by client type (Web vs Mobile) –
--            a single number that spans BOTH integrated systems.
SELECT client_type,
       COUNT(*)              AS client_apps,
       SUM(total_logins)     AS logins,
       SUM(distinct_players) AS players,
       SUM(suspicious_logins) AS suspicious
FROM vw_client_login_activity
GROUP BY client_type
ORDER BY logins DESC;
