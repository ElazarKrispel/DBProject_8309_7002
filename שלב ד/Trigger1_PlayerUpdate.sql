-- ============================================================
-- Chess Platform – Phase D  |  Trigger 1   (BEFORE UPDATE)
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- trg_player_update  –  BEFORE UPDATE ON player
--
-- Two responsibilities, both triggered by a change to a player row:
--
--   1. GUARD    – a rating may not move by more than 400 points in a
--                 single update. Such a jump is a data-entry or import
--                 error, so the update is rejected with an exception.
--
--   2. CASCADE  – when a player becomes 'banned', his active club
--                 memberships are marked 'banned' as well. A banned
--                 player must not stay an active club member.
--
-- PL/pgSQL elements demonstrated:
--   * records         – OLD and NEW
--   * branching       – rating check and status-transition check
--   * DML             – UPDATE club_membership
--   * exception       – RAISE EXCEPTION rejects the whole update
--   * GET DIAGNOSTICS – reports how many rows the cascade touched
-- ============================================================

CREATE OR REPLACE FUNCTION trg_fn_player_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_affected INT;
BEGIN
    ------------------------------------------------------------------
    -- 1. guard: no rating may jump by more than 400 points at once
    ------------------------------------------------------------------
    IF ABS(NEW.rating_classical - OLD.rating_classical) > 400
       OR ABS(NEW.rating_rapid  - OLD.rating_rapid)     > 400
       OR ABS(NEW.rating_blitz  - OLD.rating_blitz)     > 400 THEN

        RAISE EXCEPTION
            'Rating change too large for player % (max 400 points per update): classical %->%, rapid %->%, blitz %->%',
            OLD.player_id,
            OLD.rating_classical, NEW.rating_classical,
            OLD.rating_rapid,     NEW.rating_rapid,
            OLD.rating_blitz,     NEW.rating_blitz
            USING ERRCODE = 'check_violation';
    END IF;

    ------------------------------------------------------------------
    -- 2. cascade: a newly banned player loses his active memberships
    ------------------------------------------------------------------
    IF NEW.status_code = 'banned' AND OLD.status_code <> 'banned' THEN

        UPDATE club_membership
           SET status_code = 'banned'
         WHERE player_id   = NEW.player_id
           AND status_code = 'active';

        GET DIAGNOSTICS v_affected = ROW_COUNT;

        RAISE NOTICE 'Player % banned -> % active club membership(s) set to banned',
                     NEW.player_id, v_affected;
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_player_update ON player;

CREATE TRIGGER trg_player_update
    BEFORE UPDATE ON player
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_player_update();


-- ============================================================
-- DEMO – see Demo_Triggers.sql for the full runnable script
-- ============================================================
-- (a) illegal rating jump is rejected:
--       UPDATE player SET rating_classical = rating_classical + 500
--       WHERE player_id = 1;
--       -> ERROR: Rating change too large for player 1 ...
--
-- (b) a legal change passes:
--       UPDATE player SET rating_classical = rating_classical + 50
--       WHERE player_id = 1;
--       -> UPDATE 1
--
-- (c) the ban cascade:
--       SELECT status_code, COUNT(*) FROM club_membership
--       WHERE player_id = <id> GROUP BY 1;            -- before
--       UPDATE player SET status_code = 'banned' WHERE player_id = <id>;
--       -> NOTICE: Player <id> banned -> N active club membership(s) set to banned
--       SELECT status_code, COUNT(*) FROM club_membership
--       WHERE player_id = <id> GROUP BY 1;            -- after
-- ============================================================
