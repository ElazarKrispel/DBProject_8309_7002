-- ============================================================
-- Chess Platform – Phase D  |  RunAll.sql
-- Students: Elazar Krispel (8309), Alon Greenstein (7002)
--
-- Installs every Phase D program into the database, in order.
--
--     psql -U admin_chess -d chess_db -f RunAll.sql
--
-- The files are included with \ir (include relative), so they are resolved
-- relative to THIS file and the command works from any directory.
--
-- NOTE: this is the only psql-specific file in Phase D. It uses psql
-- meta-commands and will NOT run in the pgAdmin Query Tool. In pgAdmin,
-- open and execute the seven program files one by one instead.
--
-- Nothing here modifies business data - it only creates functions,
-- procedures and triggers.
-- ============================================================

\set ON_ERROR_STOP on

\echo 'Installing Phase D programs...'

\ir AlterTable.sql
\ir Function1_PlayerActivityScore.sql
\ir Function2_ClubReportCursor.sql
\ir Procedure1_BillingCycle.sql
\ir Procedure2_SecurityReview.sql
\ir Trigger1_PlayerUpdate.sql
\ir Trigger2_LoginLogInsert.sql

\echo ''
\echo 'Installed routines:'
SELECT p.proname AS name,
       CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' END AS kind
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname IN ('fn_player_activity_score', 'fn_club_report',
                     'sp_process_billing_cycle', 'sp_security_review',
                     'trg_fn_player_update', 'trg_fn_login_log_insert')
ORDER  BY kind, name;

\echo ''
\echo 'Installed triggers:'
SELECT tgname AS trigger_name, relname AS on_table
FROM   pg_trigger t
JOIN   pg_class   c ON c.oid = t.tgrelid
WHERE  NOT t.tgisinternal
ORDER  BY relname, tgname;

\echo ''
\echo 'Phase D installation complete.'
\echo 'Demo scripts:  Main1_BillingAndActivity.sql, Main2_SecurityAndClubs.sql, Demo_Triggers.sql'
