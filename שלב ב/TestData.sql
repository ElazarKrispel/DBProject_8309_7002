-- ============================================================
-- Chess Platform – Phase B  |  TestData.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
-- ============================================================
-- This file documents the test-data insertions that were
-- executed to enable specific Phase-B queries and updates.
--
-- BLOCK A: 10 new players with no login history → for Q7
-- BLOCK B: Subscriptions with expired end_date  → for U2
--
-- Both blocks were committed to the DB during testing.
-- To re-apply them on a fresh restore, run this file once.
-- ============================================================


-- ============================================================
-- BLOCK A: Players with no login history (for Q7)
-- ============================================================
-- Q7 asks: "which players have never logged in?"
-- The original 500 players all had login_log entries, so the
-- query returned 0 rows.  We added 10 new suspended players
-- (player_id 501-510) and intentionally inserted NO rows in
-- login_log for them.  This lets Q7 demonstrate a real result.
-- ============================================================

BEGIN;

INSERT INTO player
    (player_id, username, email,
     first_name, last_name, country_code, city, language_code,
     status_code, rating_classical, rating_rapid, rating_blitz,
     birth_date, registration_date)
VALUES
    (501, 'inactiveplayer501', 'inactiveplayer501@example.com',
     'Noam',   'Cohen',    'IL', 'Tel Aviv',  'he', 'suspended',
     1200, 1250, 1180, '1998-04-12', '2024-01-15'),
    (502, 'inactiveplayer502', 'inactiveplayer502@example.com',
     'Maya',   'Levi',     'US', 'New York',  'en', 'suspended',
     1350, 1300, 1280, '1995-08-21', '2023-11-03'),
    (503, 'inactiveplayer503', 'inactiveplayer503@example.com',
     'Eitan',  'Mizrahi',  'CA', 'Toronto',   'en', 'suspended',
     1420, 1390, 1410, '1992-02-17', '2022-06-20'),
    (504, 'inactiveplayer504', 'inactiveplayer504@example.com',
     'Tamar',  'Malka',    'DE', 'Berlin',    'de', 'suspended',
     1100, 1150, 1090, '2001-10-05', '2024-03-12'),
    (505, 'inactiveplayer505', 'inactiveplayer505@example.com',
     'Daniel', 'Peretz',   'FR', 'Paris',     'fr', 'suspended',
     1600, 1550, 1500, '1989-12-30', '2021-09-18'),
    (506, 'inactiveplayer506', 'inactiveplayer506@example.com',
     'Shira',  'Avraham',  'IL', 'Haifa',     'he', 'suspended',
      980, 1020,  990, '2000-05-14', '2025-01-10'),
    (507, 'inactiveplayer507', 'inactiveplayer507@example.com',
     'Ariel',  'Dahan',    'ES', 'Madrid',    'es', 'suspended',
     1750, 1680, 1720, '1993-07-09', '2020-12-01'),
    (508, 'inactiveplayer508', 'inactiveplayer508@example.com',
     'Lior',   'Shalom',   'IT', 'Rome',      'it', 'suspended',
     1250, 1210, 1190, '1997-03-27', '2023-04-22'),
    (509, 'inactiveplayer509', 'inactiveplayer509@example.com',
     'Yael',   'Haddad',   'JP', 'Tokyo',     'en', 'suspended',
     1450, 1480, 1430, '1996-11-11', '2022-02-14'),
    (510, 'inactiveplayer510', 'inactiveplayer510@example.com',
     'Omer',   'Biton',    'GB', 'London',    'en', 'suspended',
     1320, 1290, 1310, '1994-09-19', '2024-08-08');

-- No rows inserted into login_log for player_id 501-510.
-- Q7 will now return these 10 players as "never logged in".

COMMIT;


-- ============================================================
-- BLOCK B: Active subscriptions with past end_date (for U2)
-- ============================================================
-- U2 asks: expire subscriptions where status='active' but
-- end_date < CURRENT_DATE.
-- In the original data many active subscriptions had NULL
-- end_date (open-ended), so U2 returned 0 updated rows.
-- We added 8 subscriptions for the new players (502-509) with
-- end_date in the past, allowing U2 to update them visibly.
-- ============================================================

BEGIN;

INSERT INTO player_subscription
    (subscription_id, player_id, tier_id,
     status_code, billing_cycle_code, auto_renew,
     start_date, end_date, next_billing_date)
WITH base AS (
    SELECT COALESCE(MAX(subscription_id), 0) AS max_id
    FROM player_subscription
),
tier AS (
    SELECT tier_id FROM subscription_tier ORDER BY tier_id LIMIT 1
),
new_rows(player_id, billing_cycle_code, start_offset, end_offset) AS (
    VALUES
        (502::BIGINT, 'monthly', INTERVAL '120 days', INTERVAL '5 days'),
        (503::BIGINT, 'monthly', INTERVAL '200 days', INTERVAL '15 days'),
        (504::BIGINT, 'annual',  INTERVAL '400 days', INTERVAL '30 days'),
        (505::BIGINT, 'monthly', INTERVAL '90 days',  INTERVAL '2 days'),
        (506::BIGINT, 'monthly', INTERVAL '180 days', INTERVAL '45 days'),
        (507::BIGINT, 'annual',  INTERVAL '500 days', INTERVAL '60 days'),
        (508::BIGINT, 'monthly', INTERVAL '75 days',  INTERVAL '7 days'),
        (509::BIGINT, 'monthly', INTERVAL '150 days', INTERVAL '20 days')
)
SELECT
    base.max_id + ROW_NUMBER() OVER (ORDER BY new_rows.player_id),
    new_rows.player_id,
    tier.tier_id,
    'active',
    new_rows.billing_cycle_code,
    TRUE,
    CURRENT_DATE - new_rows.start_offset,
    CURRENT_DATE - new_rows.end_offset,   -- end_date in the past!
    CURRENT_DATE - new_rows.end_offset
FROM new_rows
CROSS JOIN base
CROSS JOIN tier;

-- U2 will now find these 8 rows (status='active', end_date < today)
-- and update them to status='expired', auto_renew=FALSE.

COMMIT;
