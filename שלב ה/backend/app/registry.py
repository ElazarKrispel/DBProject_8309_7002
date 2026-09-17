"""Table metadata: live catalog introspection merged with hand-written overrides.

Loaded lazily on first use (the pool opens in the app lifespan) and cached for the
process lifetime. Every identifier the CRUD layer interpolates into SQL must come
from here, so a request can never reach an unknown table or column.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import functools
import re
from typing import Any

from fastapi import HTTPException

from . import db

PADDING_CODES = r"^(ps|mr|ms|ss|bc|ls|sct|scs)\d{4}$"

GROUP_PLAYERS = "Players & Clubs"
GROUP_BILLING = "Billing"
GROUP_SECURITY = "Security"
GROUP_REF = "Reference Data"
GROUP_ENGINES = "Engines & Infrastructure"
GROUP_VIEWS = "Views"

ENGINE_NAME_SQL = "(SELECT e.name || ' ' || e.version FROM engine e WHERE e.engine_id = t.engine_id)"


def _lookup(label: str, code: str, name: str) -> dict[str, Any]:
    return {
        "label": label, "group": GROUP_REF, "icon": "list-details", "lookup": True,
        "display_sql": f"t.{name}", "display_column": name, "search_columns": [code, name],
        "padding": (code, PADDING_CODES),
    }


# Dict order = sidebar order.
OVERRIDES: dict[str, dict[str, Any]] = {
    "player": {
        "label": "Players", "group": GROUP_PLAYERS, "icon": "users",
        "display_sql": "t.username || ' (' || t.first_name || ' ' || t.last_name || ')'",
        "display_column": "username",
        "search_columns": ["username", "email", "first_name", "last_name", "city", "country_code"],
        "column_labels": {"rating_classical": "Classical Rating", "rating_rapid": "Rapid Rating", "rating_blitz": "Blitz Rating"},
    },
    "club": {
        "label": "Clubs", "group": GROUP_PLAYERS, "icon": "building-community",
        "display_sql": "t.club_name || ' #' || t.club_id", "display_column": "club_name",
        "search_columns": ["club_name", "city", "country_code", "description"],
    },
    "club_membership": {
        "label": "Club Memberships", "group": GROUP_PLAYERS, "icon": "id-badge",
        "display_sql": "'Membership #' || t.membership_id", "display_column": "membership_id",
        "search_columns": ["role_code", "status_code"], "default_sort": ("membership_id", "desc"),
        "column_labels": {"invited_by_player_id": "Invited By"},
    },
    "social_connection": {
        "label": "Social Connections", "group": GROUP_PLAYERS, "icon": "share",
        "display_sql": "'Connection #' || t.connection_id", "display_column": "connection_id",
        "search_columns": ["connection_type_code", "status_code"], "default_sort": ("connection_id", "desc"),
        "column_labels": {"from_player_id": "From Player", "to_player_id": "To Player", "connection_type_code": "Type"},
    },
    "player_subscription": {
        "label": "Player Subscriptions", "group": GROUP_BILLING, "icon": "credit-card",
        "display_sql": "'Subscription #' || t.subscription_id", "display_column": "subscription_id",
        "search_columns": ["status_code", "billing_cycle_code"], "default_sort": ("subscription_id", "desc"),
        "column_labels": {"tier_id": "Tier", "billing_cycle_code": "Billing Cycle"},
    },
    "subscription_tier": {
        "label": "Subscription Tiers", "group": GROUP_BILLING, "icon": "receipt",
        "display_sql": "t.tier_name", "display_column": "tier_name",
        "search_columns": ["tier_name", "description"],
        "column_labels": {"price_monthly": "Monthly Price", "price_annual": "Annual Price"},
    },
    "login_log": {
        "label": "Login Logs", "group": GROUP_SECURITY, "icon": "login",
        "display_sql": "'Login #' || t.log_id || ' on ' || t.login_date", "display_column": "log_id",
        "search_columns": ["ip_address", "city_detected", "country_detected", "device_type", "operating_system", "browser", "failure_reason"],
        "default_sort": ("login_date", "desc"),
        "column_options": {"device_type": ["mobile", "tablet", "laptop", "desktop"]},
        "column_labels": {"login_status_code": "Login Status", "session_duration_sec": "Session (sec)", "is_suspicious": "Suspicious", "client_id": "UI Client"},
    },
    "player_status": _lookup("Player Statuses", "status_code", "status_name"),
    "membership_role": _lookup("Membership Roles", "role_code", "role_name"),
    "membership_status": _lookup("Membership Statuses", "status_code", "status_name"),
    "subscription_status": _lookup("Subscription Statuses", "status_code", "status_name"),
    "billing_cycle": _lookup("Billing Cycles", "billing_cycle_code", "billing_cycle_name"),
    "login_status": _lookup("Login Statuses", "status_code", "status_name"),
    "social_connection_type": _lookup("Social Connection Types", "type_code", "type_name"),
    "social_connection_status": _lookup("Social Connection Statuses", "status_code", "status_name"),
    "uiclient": {
        "label": "UI Clients", "group": GROUP_ENGINES, "icon": "device-desktop",
        "display_sql": "t.name || ' ' || t.version", "display_column": "name",
        "search_columns": ["name", "version", "client_type", "domain_url"],
        "column_options": {"client_type": ["Web", "Mobile"]},
    },
    "engine": {
        "label": "Engines", "group": GROUP_ENGINES, "icon": "cpu",
        "display_sql": "t.name || ' ' || t.version", "display_column": "name",
        "search_columns": ["name", "version"],
    },
    "localengine": {
        "label": "Local Engines", "group": GROUP_ENGINES, "icon": "plug",
        "display_sql": ENGINE_NAME_SQL, "display_column": "binary_path",
        "search_columns": ["binary_path"],
    },
    "cloudengine": {
        "label": "Cloud Engines", "group": GROUP_ENGINES, "icon": "link",
        "display_sql": ENGINE_NAME_SQL, "display_column": "api_url",
        "search_columns": ["api_url"], "secret_columns": ["auth_token"],
    },
    "bot": {
        "label": "Bots", "group": GROUP_ENGINES, "icon": "robot",
        "display_sql": "t.display_name", "display_column": "display_name",
        "search_columns": ["display_name"],
    },
    "openingposition": {
        "label": "Opening Positions", "group": GROUP_ENGINES, "icon": "chess",
        "display_sql": "t.opening_name || ' (' || t.eco_code || ')'", "display_column": "opening_name",
        "search_columns": ["opening_name", "eco_code", "fen_string"],
        "column_labels": {"fen_id": "FEN ID", "fen_string": "FEN", "eco_code": "ECO Code"},
    },
    "engineevaluation": {
        "label": "Engine Evaluations", "group": GROUP_ENGINES, "icon": "chart-bar",
        "display_sql": "'Eval #' || t.eval_id", "display_column": "eval_id",
        "search_columns": ["best_move_pgn"], "default_sort": ("eval_id", "desc"),
        "column_labels": {"fen_id": "Opening Position", "best_move_pgn": "Best Move", "eval_score_cp": "Score (cp)"},
    },
    "hardwarenode": {
        "label": "Hardware Nodes", "group": GROUP_ENGINES, "icon": "server",
        "display_sql": "t.host_name", "display_column": "host_name",
        "search_columns": ["host_name", "datacenter_zone", "ip_address", "os_version"],
    },
    "servercomponent": {
        "label": "Server Components", "group": GROUP_ENGINES, "icon": "components",
        "display_sql": "t.component_type || ' ' || t.component_sn", "display_column": "component_sn",
        "search_columns": ["component_sn", "component_type", "capacity"],
        "column_labels": {"component_sn": "Serial Number"},
    },
    "hardwaretelemetry": {
        "label": "Hardware Telemetry", "group": GROUP_ENGINES, "icon": "activity",
        "display_sql": "'Telemetry #' || t.telemetry_id", "display_column": "telemetry_id",
        "search_columns": [], "default_sort": ("time_stamp", "desc"),
        "column_labels": {"time_stamp": "Timestamp", "temp_celsius": "Temp (C)", "cpu_usage_pct": "CPU %", "ram_usage_pct": "RAM %", "disk_io_ops": "Disk IO Ops"},
    },
    "engine_ui_support": {
        "label": "Engine UI Support", "group": GROUP_ENGINES, "icon": "device-desktop",
        "display_sql": "'Engine ' || t.engine_id || ' / Client ' || t.client_id", "display_column": "engine_id",
        "search_columns": [], "column_labels": {"client_id": "UI Client"},
    },
    "installed_on": {
        "label": "Installed On", "group": GROUP_ENGINES, "icon": "map-pin",
        "display_sql": "'Engine ' || t.engine_id || ' / Node ' || t.node_id", "display_column": "engine_id",
        "search_columns": [], "column_labels": {"engine_id": "Local Engine"},
    },
    "vw_player_club_membership": {"label": "Player Club Memberships (view)", "group": GROUP_VIEWS, "icon": "eye", "display_column": "username"},
    "vw_engine_overview": {"label": "Engine Overview (view)", "group": GROUP_VIEWS, "icon": "eye", "display_column": "engine_name"},
    "vw_client_login_activity": {"label": "Client Login Activity (view)", "group": GROUP_VIEWS, "icon": "eye", "display_column": "client_name"},
}

_ACRONYMS = {"Id": "ID", "Url": "URL", "Ip": "IP", "Fen": "FEN", "Eco": "ECO", "Pgn": "PGN", "Os": "OS",
             "Ram": "RAM", "Cpu": "CPU", "Gb": "GB", "Sn": "S/N", "Pct": "%", "Io": "IO", "Sec": "(sec)"}


def pretty(name: str) -> str:
    return " ".join(_ACRONYMS.get(w, w) for w in name.replace("_", " ").title().split())


def _col_type(data_type: str) -> str:
    if data_type in ("bigint", "integer", "smallint"):
        return "int"
    if data_type in ("numeric", "real", "double precision"):
        return "number"
    if data_type == "date":
        return "date"
    if data_type.startswith("timestamp"):
        return "timestamp"
    if data_type == "boolean":
        return "bool"
    return "text"


@dataclass
class Column:
    name: str
    label: str
    type: str
    nullable: bool
    pk: bool = False
    auto: bool = False
    fk: dict[str, str] | None = None
    secret: bool = False
    max_length: int | None = None
    options: list[str] | None = None


@dataclass
class Table:
    key: str
    label: str
    group: str
    icon: str
    pk: list[str]
    readonly: bool
    display_sql: str
    display_column: str
    search_columns: list[str]
    default_sort: tuple[str, str]
    columns: list[Column]
    lookup: bool = False
    padding: tuple[str, str] | None = None   # (column, regex) marking synthetic filler rows
    by_name: dict[str, Column] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.by_name = {c.name: c for c in self.columns}

    @property
    def fk_columns(self) -> list[Column]:
        return [c for c in self.columns if c.fk]


_CATALOG_SQL = """
SELECT c.table_name, c.column_name, c.data_type, c.is_nullable = 'YES' AS nullable,
       c.character_maximum_length, cl.relkind = 'v' AS is_view
FROM information_schema.columns c
JOIN pg_class cl ON cl.relname = c.table_name
JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
WHERE c.table_schema = 'public' AND cl.relkind IN ('r', 'v')
ORDER BY c.table_name, c.ordinal_position
"""

_CONSTRAINT_SQL = """
SELECT conrelid::regclass::text AS tbl, contype,
       (SELECT array_agg(a.attname ORDER BY k.ord)
          FROM unnest(conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k.attnum) AS cols,
       CASE WHEN contype = 'f' THEN confrelid::regclass::text END AS ref_tbl,
       (SELECT array_agg(a.attname ORDER BY k.ord)
          FROM unnest(confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = confrelid AND a.attnum = k.attnum) AS ref_cols
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace AND contype IN ('p', 'f')
"""


@functools.cache
def _load() -> dict[str, Table]:
    with db.get_conn() as (conn, _):
        with conn.cursor() as cur:
            cur.execute(_CATALOG_SQL)
            catalog = cur.fetchall()
            cur.execute(_CONSTRAINT_SQL)
            constraints = cur.fetchall()
        conn.commit()

    pks: dict[str, list[str]] = {}
    fks: dict[str, dict[str, dict[str, str]]] = {}
    for c in constraints:
        if c["contype"] == "p":
            pks[c["tbl"]] = list(c["cols"])
        elif len(c["cols"]) == 1:  # every FK in this schema is single-column
            fks.setdefault(c["tbl"], {})[c["cols"][0]] = {"table": c["ref_tbl"], "column": c["ref_cols"][0]}

    raw_cols: dict[str, list[dict]] = {}
    is_view: dict[str, bool] = {}
    for r in catalog:
        raw_cols.setdefault(r["table_name"], []).append(r)
        is_view[r["table_name"]] = r["is_view"]

    tables: dict[str, Table] = {}
    ordered = list(OVERRIDES) + sorted(set(raw_cols) - set(OVERRIDES))
    for name in ordered:
        if name not in raw_cols:
            continue
        ov = OVERRIDES.get(name, {})
        pk = pks.get(name, [])
        tfk = fks.get(name, {})
        labels = ov.get("column_labels", {})
        options = ov.get("column_options", {})
        secrets = set(ov.get("secret_columns", []))
        columns = []
        for r in raw_cols[name]:
            cn = r["column_name"]
            ctype = _col_type(r["data_type"])
            columns.append(Column(
                name=cn, label=labels.get(cn, pretty(cn)), type=ctype, nullable=r["nullable"],
                pk=cn in pk, fk=tfk.get(cn), secret=cn in secrets,
                max_length=r["character_maximum_length"], options=options.get(cn),
            ))
        if len(pk) == 1:
            pkc = next(c for c in columns if c.name == pk[0])
            pkc.auto = pkc.type == "int" and pkc.fk is None
        text_cols = [c.name for c in columns if c.type == "text"]
        default_sort = ov.get("default_sort") or ((pk[0], "asc") if pk else (columns[0].name, "asc"))
        tables[name] = Table(
            key=name,
            label=ov.get("label", pretty(name)),
            group=ov.get("group", GROUP_VIEWS if is_view[name] else GROUP_ENGINES),
            icon=ov.get("icon", "eye" if is_view[name] else "table"),
            pk=pk,
            readonly=is_view[name],
            display_sql=ov.get("display_sql") or f"t.{ov.get('display_column') or (text_cols[0] if text_cols else columns[0].name)}",
            display_column=ov.get("display_column") or (text_cols[0] if text_cols else columns[0].name),
            search_columns=ov.get("search_columns", text_cols),
            default_sort=tuple(default_sort),
            columns=columns,
            lookup=ov.get("lookup", False),
            padding=ov.get("padding"),
        )
    return tables


def get_tables() -> list[Table]:
    return list(_load().values())


def get_table(key: str) -> Table:
    t = _load().get(key)
    if t is None:
        raise HTTPException(status_code=404, detail={"message": f"Unknown table '{key}'", "code": "404", "hint": None})
    return t


def display_expr(table: Table, alias: str) -> str:
    """The table's display_sql rewritten for another alias (used in FK label joins)."""
    return re.sub(r"\bt\.", f"{alias}.", table.display_sql)


def to_meta(t: Table) -> dict[str, Any]:
    cols = []
    for c in t.columns:
        d: dict[str, Any] = {"name": c.name, "label": c.label, "type": c.type, "nullable": c.nullable, "pk": c.pk, "auto": c.auto}
        if c.fk:
            d["fk"] = c.fk
        if c.secret:
            d["secret"] = True
        if c.max_length:
            d["maxLength"] = c.max_length
        if c.options:
            d["options"] = c.options
        cols.append(d)
    return {
        "key": t.key, "label": t.label, "group": t.group, "icon": t.icon, "pk": t.pk, "readonly": t.readonly,
        "displayColumn": t.display_column, "searchColumns": t.search_columns, "columns": cols,
    }
