-- ============================================================
-- Chess Platform – Phase D  |  Function 1
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- fn_player_activity_score(p_player_id, p_days_back)
--
-- Computes an activity score (0..100) for a single player from three
-- sources: his login history, his active club memberships and his
-- accepted friendships.
--
-- PL/pgSQL elements demonstrated:
--   * implicit cursor  – SELECT ... INTO (player row, club count, friends)
--   * explicit cursor  – cur_logins, with parameters
--   * loop             – FETCH / EXIT WHEN NOT FOUND
--   * branching        – different scoring per login status / suspicion
--   * records          – player%ROWTYPE and RECORD
--   * exception        – RAISE EXCEPTION on bad input / unknown player
--
-- The function does NOT modify the database (it is STABLE).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_player_activity_score(
    p_player_id BIGINT,
    p_days_back INT DEFAULT 365
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- record holding the whole player row
    v_player        player%ROWTYPE;

    -- explicit, parameterised cursor over the player's logins
    cur_logins CURSOR (c_player_id BIGINT, c_from DATE) FOR
        SELECT login_status_code,
               is_suspicious,
               session_duration_sec
        FROM   login_log
        WHERE  player_id  = c_player_id
          AND  login_date >= c_from;

    v_log           RECORD;
    v_ref_date      DATE;
    v_from_date     DATE;
    v_login_points  NUMERIC := 0;
    v_clubs         INT     := 0;
    v_friends       INT     := 0;
    v_score         NUMERIC;
BEGIN
    ------------------------------------------------------------------
    -- 1. input validation
    ------------------------------------------------------------------
    IF p_days_back <= 0 THEN
        RAISE EXCEPTION 'p_days_back must be positive (got %)', p_days_back
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    ------------------------------------------------------------------
    -- 2. implicit cursor: load the player row into a record
    ------------------------------------------------------------------
    SELECT * INTO v_player
    FROM   player
    WHERE  player_id = p_player_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Player % does not exist', p_player_id
            USING ERRCODE = 'no_data_found';
    END IF;

    ------------------------------------------------------------------
    -- 3. the time window is measured backwards from the newest login in
    --    the database (2026-03-24), not from CURRENT_DATE, so that the
    --    existing data set is actually covered.
    ------------------------------------------------------------------
    SELECT MAX(login_date) INTO v_ref_date FROM login_log;
    v_from_date := v_ref_date - p_days_back;

    ------------------------------------------------------------------
    -- 4. explicit cursor + loop + branching: score the login history
    ------------------------------------------------------------------
    OPEN cur_logins(p_player_id, v_from_date);
    LOOP
        FETCH cur_logins INTO v_log;
        EXIT WHEN NOT FOUND;

        IF v_log.login_status_code = 'success' THEN
            v_login_points := v_login_points + 1;

            -- a long session means real activity, not just a ping
            IF v_log.session_duration_sec >= 1800 THEN
                v_login_points := v_login_points + 0.5;
            END IF;
        ELSE
            -- 'failed' / 'blocked' attempts hardly count as activity
            v_login_points := v_login_points + 0.1;
        END IF;

        IF v_log.is_suspicious THEN
            v_login_points := v_login_points - 0.5;
        END IF;
    END LOOP;
    CLOSE cur_logins;

    IF v_login_points < 0 THEN
        v_login_points := 0;
    END IF;

    ------------------------------------------------------------------
    -- 5. implicit cursors: community activity
    ------------------------------------------------------------------
    SELECT COUNT(*) INTO v_clubs
    FROM   club_membership
    WHERE  player_id   = p_player_id
      AND  status_code = 'active';

    SELECT COUNT(*) INTO v_friends
    FROM   social_connection
    WHERE  to_player_id         = p_player_id
      AND  connection_type_code = 'friend'
      AND  status_code          = 'accepted';

    ------------------------------------------------------------------
    -- 6. final score.
    --    Each of the three dimensions is capped separately so that no
    --    single dimension can dominate the result:
    --        logins  -> at most 40 points
    --        clubs   -> at most 30 points
    --        friends -> at most 30 points
    --    The caps were chosen from the real distribution in our data
    --    (a typical player has ~15 logins per year, ~30 active club
    --    memberships and ~16 accepted friends), so an average player
    --    lands around 50 and only the most active reach 100.
    ------------------------------------------------------------------
    v_score := LEAST(v_login_points, 50) * 0.8      -- 0 .. 40
             + LEAST(v_clubs,        40) * 0.75     -- 0 .. 30
             + LEAST(v_friends,      30) * 1.0;     -- 0 .. 30

    RETURN ROUND(LEAST(v_score, 100), 2);
END;
$$;


-- ============================================================
-- DEMO (no transaction needed – the function changes nothing)
-- ============================================================
-- Normal run: five active players get different scores
--
--   SELECT p.player_id, p.username, p.rating_classical,
--          fn_player_activity_score(p.player_id) AS activity_score
--   FROM   player p
--   WHERE  p.status_code = 'active'
--   ORDER  BY p.rating_classical DESC
--   LIMIT  5;
--
-- Exception 1 – unknown player:
--   SELECT fn_player_activity_score(999999);
--   -> ERROR: Player 999999 does not exist
--
-- Exception 2 – bad parameter:
--   SELECT fn_player_activity_score(1, -10);
--   -> ERROR: p_days_back must be positive (got -10)
-- ============================================================
