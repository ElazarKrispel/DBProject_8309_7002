-- ============================================================
-- Chess Platform – Phase D  |  Function 2
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- fn_club_report(p_country, p_min_members) RETURNS REFCURSOR
--
-- Returns a REF CURSOR over a club report: club name, country, whether
-- the club is official, how many active members it has, the average
-- classical rating of those members and how many of them are leaders
-- (owner / admin).
--
-- Returning a cursor lets the caller stream the report row by row
-- instead of materialising it - the main program Main2 does exactly that.
--
-- PL/pgSQL elements demonstrated:
--   * REF CURSOR       – declared, opened and returned
--   * branching        – a different OPEN statement per parameter case
--   * implicit cursor  – SELECT COUNT(*) INTO for the pre-check
--   * exception        – RAISE EXCEPTION on a negative threshold
--
-- The cursor is given a fixed name so it can also be fetched directly
-- from psql with:  FETCH ALL IN club_report_cur;
-- ============================================================

CREATE OR REPLACE FUNCTION fn_club_report(
    p_country     CHAR(2),
    p_min_members INT
)
RETURNS REFCURSOR
LANGUAGE plpgsql
AS $$
DECLARE
    v_cur   REFCURSOR := 'club_report_cur';
    v_count INT;
BEGIN
    ------------------------------------------------------------------
    -- 1. input validation
    ------------------------------------------------------------------
    IF p_min_members < 0 THEN
        RAISE EXCEPTION 'p_min_members cannot be negative (got %)', p_min_members
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    ------------------------------------------------------------------
    -- 2. implicit cursor: how many clubs will the report contain?
    ------------------------------------------------------------------
    SELECT COUNT(*) INTO v_count
    FROM (
        SELECT cm.club_id
        FROM   club_membership cm
        JOIN   club c ON c.club_id = cm.club_id
        WHERE  cm.status_code = 'active'
          AND (p_country IS NULL OR c.country_code = p_country)
        GROUP  BY cm.club_id
        HAVING COUNT(*) >= p_min_members
    ) s;

    IF v_count = 0 THEN
        RAISE NOTICE 'No club matches country=%, min_members=% - returning an empty cursor',
                     COALESCE(p_country, 'ALL'), p_min_members;
    ELSE
        RAISE NOTICE '% club(s) match country=%, min_members=%',
                     v_count, COALESCE(p_country, 'ALL'), p_min_members;
    END IF;

    ------------------------------------------------------------------
    -- 3. branching: the cursor is opened over a different query
    --    depending on whether a country filter was supplied
    ------------------------------------------------------------------
    IF p_country IS NULL THEN
        OPEN v_cur FOR
            SELECT c.club_id,
                   c.club_name,
                   c.country_code,
                   c.is_official,
                   COUNT(*)::INT                                              AS active_members,
                   ROUND(AVG(p.rating_classical))::INT                        AS avg_rating,
                   COUNT(*) FILTER (WHERE cm.role_code IN ('owner','admin'))::INT AS leaders
            FROM   club c
            JOIN   club_membership cm ON cm.club_id   = c.club_id
                                     AND cm.status_code = 'active'
            JOIN   player p           ON p.player_id  = cm.player_id
            GROUP  BY c.club_id, c.club_name, c.country_code, c.is_official
            HAVING COUNT(*) >= p_min_members
            ORDER  BY active_members DESC, c.club_name;
    ELSE
        OPEN v_cur FOR
            SELECT c.club_id,
                   c.club_name,
                   c.country_code,
                   c.is_official,
                   COUNT(*)::INT                                              AS active_members,
                   ROUND(AVG(p.rating_classical))::INT                        AS avg_rating,
                   COUNT(*) FILTER (WHERE cm.role_code IN ('owner','admin'))::INT AS leaders
            FROM   club c
            JOIN   club_membership cm ON cm.club_id   = c.club_id
                                     AND cm.status_code = 'active'
            JOIN   player p           ON p.player_id  = cm.player_id
            WHERE  c.country_code = p_country
            GROUP  BY c.club_id, c.club_name, c.country_code, c.is_official
            HAVING COUNT(*) >= p_min_members
            ORDER  BY active_members DESC, c.club_name;
    END IF;

    RETURN v_cur;
END;
$$;


-- ============================================================
-- DEMO
-- ============================================================
-- A cursor only lives inside a transaction, so the demo is wrapped in
-- BEGIN / COMMIT. Nothing is modified, so COMMIT is safe here.
--
--   BEGIN;
--   SELECT fn_club_report('IL', 25);   -- returns the cursor name
--   FETCH ALL IN club_report_cur;      -- the actual report
--   COMMIT;
--
-- Without a country filter:
--   BEGIN;
--   SELECT fn_club_report(NULL, 40);
--   FETCH ALL IN club_report_cur;
--   COMMIT;
--
-- Exception - negative threshold:
--   SELECT fn_club_report('IL', -5);
--   -> ERROR: p_min_members cannot be negative (got -5)
--
-- Note: the cursor name is fixed, so calling the function twice inside
-- the same transaction raises "cursor already in use". Use one call per
-- transaction, or CLOSE club_report_cur in between.
-- ============================================================
