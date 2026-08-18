-- ============================================================
-- Chess Platform – Phase D  |  Procedure 2
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- sp_security_review(p_days_back, p_min_logins, p_threshold_pct)
--
-- Security sweep. For every active player with enough logins inside the
-- review window it computes the percentage of suspicious logins and acts:
--
--     ratio >= threshold * 1.5   ->  player is banned
--     ratio >= threshold         ->  player is suspended
--     otherwise                  ->  reported only, nothing changes
--
-- The window is measured backwards from MAX(login_log.login_date)
-- (2026-03-24 in our data) and not from CURRENT_DATE, otherwise every
-- recent window would be empty.
--
-- A player who is suspended or banned also loses the club membership
-- requests that are still waiting for approval. This is the business rule
-- already written in Phase B (Queries.sql, DELETE D3), applied here at the
-- moment the player is blocked instead of as a periodic cleanup.
--
-- Note the interaction with Trigger 1: this procedure updates
-- player.status_code, and trg_player_update then cascades a ban to the
-- player's ACTIVE club memberships. That is exactly why the trigger exists.
-- The two effects are complementary: the trigger handles 'active'
-- memberships, the DELETE below handles 'pending' ones.
--
-- PL/pgSQL elements demonstrated:
--   * explicit cursor  – cur_risky, parameterised, over an aggregate query
--   * implicit cursors – MAX(login_date), and the client lookup that
--                        crosses the Phase C bridge (login_log -> uiclient)
--   * loop             – FETCH / EXIT WHEN NOT FOUND
--   * branching        – three-way decision on the suspicious ratio
--   * DML              – UPDATE player, DELETE club_membership
--   * exception        – parameter validation raises
--   * records          – RECORD fetched from the cursor
-- ============================================================

CREATE OR REPLACE PROCEDURE sp_security_review(
    p_days_back     INT,
    p_min_logins    INT,
    p_threshold_pct NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    -- explicit cursor: per-player login statistics inside the window
    cur_risky CURSOR (c_from DATE, c_min INT) FOR
        SELECT ll.player_id,
               p.username,
               COUNT(*)                                      AS total_logins,
               COUNT(*) FILTER (WHERE ll.is_suspicious)      AS suspicious_logins,
               ROUND(100.0 * COUNT(*) FILTER (WHERE ll.is_suspicious)
                           / COUNT(*), 2)                    AS suspicious_pct
        FROM   login_log ll
        JOIN   player p ON p.player_id = ll.player_id
        WHERE  ll.login_date  >= c_from
          AND  p.status_code   = 'active'
        GROUP  BY ll.player_id, p.username
        HAVING COUNT(*) >= c_min
        ORDER  BY 5 DESC;

    v_row        RECORD;
    v_ref_date   DATE;
    v_from_date  DATE;
    v_client     VARCHAR(100);
    v_new_status VARCHAR(30);
    v_checked    INT := 0;
    v_clean      INT := 0;
    v_suspended  INT := 0;
    v_banned     INT := 0;
    v_del_rows   INT := 0;   -- rows removed by the current DELETE
    v_deleted    INT := 0;   -- pending memberships removed in total
BEGIN
    ------------------------------------------------------------------
    -- 1. parameter validation
    ------------------------------------------------------------------
    IF p_days_back <= 0 OR p_min_logins <= 0 OR p_threshold_pct <= 0 THEN
        RAISE EXCEPTION
            'invalid parameters: days_back=%, min_logins=%, threshold=%',
            p_days_back, p_min_logins, p_threshold_pct
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    ------------------------------------------------------------------
    -- 2. implicit cursor: build the review window from the data itself
    ------------------------------------------------------------------
    SELECT MAX(login_date) INTO v_ref_date FROM login_log;
    v_from_date := v_ref_date - p_days_back;

    RAISE NOTICE 'Security review window: % .. %  (threshold % percent)',
                 v_from_date, v_ref_date, p_threshold_pct;

    ------------------------------------------------------------------
    -- 3. explicit cursor + loop + three-way branching
    ------------------------------------------------------------------
    OPEN cur_risky(v_from_date, p_min_logins);
    LOOP
        FETCH cur_risky INTO v_row;
        EXIT WHEN NOT FOUND;

        v_checked := v_checked + 1;

        -- three-way decision
        IF v_row.suspicious_pct >= p_threshold_pct * 1.5 THEN
            v_new_status := 'banned';
        ELSIF v_row.suspicious_pct >= p_threshold_pct THEN
            v_new_status := 'suspended';
        ELSE
            v_new_status := NULL;
        END IF;

        IF v_new_status IS NULL THEN
            -- below the threshold: counted only, nothing is changed and
            -- nothing is printed (the review scans hundreds of players)
            v_clean := v_clean + 1;
        ELSE
            -- implicit cursor crossing the Phase C bridge: which client
            -- application did this player mostly log in from?
            SELECT u.name INTO v_client
            FROM   login_log ll
            JOIN   uiclient  u ON u.client_id = ll.client_id
            WHERE  ll.player_id  = v_row.player_id
              AND  ll.login_date >= v_from_date
            GROUP  BY u.name
            ORDER  BY COUNT(*) DESC
            LIMIT  1;

            -- DML: this UPDATE also fires trg_player_update
            UPDATE player
               SET status_code = v_new_status
             WHERE player_id = v_row.player_id;

            -- second DML: a blocked player cannot keep waiting for club
            -- approval, so the pending requests are removed (Phase B rule D3)
            DELETE FROM club_membership
             WHERE player_id   = v_row.player_id
               AND status_code = 'pending';

            GET DIAGNOSTICS v_del_rows = ROW_COUNT;
            v_deleted := v_deleted + v_del_rows;

            IF v_new_status = 'banned' THEN
                v_banned := v_banned + 1;
            ELSE
                v_suspended := v_suspended + 1;
            END IF;

            RAISE NOTICE '  player % (%) -> % : % of % logins suspicious (% percent), main client: %, % pending membership(s) removed',
                         v_row.player_id, v_row.username, v_new_status,
                         v_row.suspicious_logins, v_row.total_logins,
                         v_row.suspicious_pct, COALESCE(v_client, 'unknown'),
                         v_del_rows;
        END IF;
    END LOOP;
    CLOSE cur_risky;

    RAISE NOTICE 'Security review finished: % player(s) checked, % below threshold, % suspended, % banned, % pending membership(s) deleted',
                 v_checked, v_clean, v_suspended, v_banned, v_deleted;
END;
$$;


-- ============================================================
-- DEMO  (transaction rolled back at the end; the change is fully
--        visible in the "after" queries)
-- ============================================================
-- BEGIN;
--
-- -- state BEFORE
-- SELECT status_code, COUNT(*) FROM player          GROUP BY 1 ORDER BY 1;
-- SELECT status_code, COUNT(*) FROM club_membership GROUP BY 1 ORDER BY 1;
--
-- -- run
-- -- 3000 days covers the whole login history in our data (2018-01 .. 2026-03),
-- -- 20 = minimum logins to judge a player, 15% = suspicious ratio threshold
-- -- (the platform average is 8.8%, so 15% really is an outlier).
-- CALL sp_security_review(3000, 20, 15.0);
--
-- -- state AFTER: 'active' dropped, 'suspended'/'banned' grew, and
-- -- club_membership changed twice over: 'active' -> 'banned' by Trigger 1,
-- -- and the 'pending' rows of the blocked players were deleted here.
-- SELECT status_code, COUNT(*) FROM player          GROUP BY 1 ORDER BY 1;
-- SELECT status_code, COUNT(*) FROM club_membership GROUP BY 1 ORDER BY 1;
--
-- ROLLBACK;
--
-- Exception:
--   CALL sp_security_review(0, 20, 25.0);
--   -> ERROR: invalid parameters: days_back=0, min_logins=20, threshold=25.0
-- ============================================================
