from fastapi import APIRouter, Depends

from .. import db
from ..security import require_token

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_token)])

KPI_SQL = """
SELECT
  (SELECT count(*) FROM player)                                              AS players_total,
  (SELECT count(*) FROM player WHERE status_code = 'active')                 AS players_active,
  (SELECT count(*) FROM club)                                                AS clubs,
  (SELECT count(*) FROM club_membership WHERE status_code = 'active')        AS active_memberships,
  (SELECT count(*) FROM player_subscription WHERE status_code = 'active')    AS active_subscriptions,
  (SELECT count(*) FROM login_log)                                           AS logins_total,
  (SELECT round(100.0 * count(*) FILTER (WHERE is_suspicious) / NULLIF(count(*), 0), 1)
     FROM login_log)                                                         AS suspicious_pct,
  (SELECT count(*) FROM engine)                                              AS engines,
  (SELECT count(*) FROM hardwarenode)                                        AS nodes,
  (SELECT max(login_date) FROM login_log)                                    AS last_login_date
"""

# Last 12 months ending at the newest login (the data window is fixed, not "today").
LOGINS_BY_MONTH_SQL = """
WITH mx AS (SELECT date_trunc('month', max(login_date))::date AS m FROM login_log)
SELECT to_char(date_trunc('month', login_date), 'YYYY-MM')          AS month,
       count(*)                                                     AS total,
       count(*) FILTER (WHERE login_status_code <> 'success')       AS failed,
       count(*) FILTER (WHERE is_suspicious)                        AS suspicious
FROM login_log, mx
WHERE login_date >= mx.m - interval '11 months'
GROUP BY 1 ORDER BY 1
"""

RATING_BUCKETS_SQL = """
SELECT (rating_classical / 200) * 200 AS lo, count(*) AS players
FROM player GROUP BY 1 ORDER BY 1
"""

TOP_TIERS_SQL = """
SELECT st.tier_name AS tier, count(*) AS active
FROM player_subscription ps JOIN subscription_tier st ON st.tier_id = ps.tier_id
WHERE ps.status_code = 'active'
GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5
"""

PLAYERS_BY_COUNTRY_SQL = """
SELECT coalesce(country_code, '??') AS country, count(*) AS players
FROM player GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8
"""

PLAYERS_BY_STATUS_SQL = """
SELECT s.status_name AS status, count(*) AS players
FROM player p JOIN player_status s ON s.status_code = p.status_code
GROUP BY 1 ORDER BY 2 DESC, 1
"""

MEMBERSHIPS_BY_ROLE_SQL = """
SELECT r.role_name AS role, count(*) AS members
FROM club_membership cm JOIN membership_role r ON r.role_code = cm.role_code
WHERE cm.status_code = 'active'
GROUP BY 1 ORDER BY 2 DESC, 1
"""


@router.get("")
def dashboard():
    with db.get_conn() as (conn, _):
        with conn.cursor() as cur:
            cur.execute(KPI_SQL)
            kpis = cur.fetchone()
            cur.execute(LOGINS_BY_MONTH_SQL)
            months = cur.fetchall()
            cur.execute(RATING_BUCKETS_SQL)
            buckets = cur.fetchall()
            cur.execute(TOP_TIERS_SQL)
            tiers = cur.fetchall()
            cur.execute(PLAYERS_BY_COUNTRY_SQL)
            countries = cur.fetchall()
            cur.execute(PLAYERS_BY_STATUS_SQL)
            statuses = cur.fetchall()
            cur.execute(MEMBERSHIPS_BY_ROLE_SQL)
            roles = cur.fetchall()
        conn.commit()
    kpis["suspicious_pct"] = float(kpis["suspicious_pct"] or 0)
    return {
        "kpis": kpis,
        "charts": {
            "logins_by_month": months,
            "rating_buckets": [{"bucket": f"{b['lo']}-{b['lo'] + 199}", "players": b["players"]} for b in buckets],
            "top_tiers": tiers,
            "players_by_country": countries,
            "players_by_status": statuses,
            "memberships_by_role": roles,
        },
    }
