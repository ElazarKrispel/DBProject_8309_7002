"""Generic list / row / create / update / delete / options over every registry table.

Identifiers are taken from the registry only and rendered with psycopg.sql.Identifier;
values always travel as bound parameters.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from psycopg import sql

from .. import db, registry
from ..registry import Column, Table
from ..security import require_token

router = APIRouter(prefix="/tables", tags=["tables"], dependencies=[Depends(require_token)])

RESERVED = {"page", "size", "q", "sort", "dir"}
MAX_SIZE = 200
TRUE_WORDS = {"true", "t", "1", "yes", "on"}


def bad(status: int, message: str, hint: str | None = None) -> HTTPException:
    return HTTPException(status_code=status, detail={"message": message, "code": str(status), "hint": hint})


def coerce(col: Column, value: Any) -> Any:
    """Normalise a JSON or query-string value: '' -> NULL, ints and bools parsed, the rest passed through."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "" and (col.nullable or col.type != "text"):
            return None
    if col.type == "int" and not isinstance(value, bool):
        try:
            return int(value)
        except (TypeError, ValueError):
            raise bad(400, f"Column '{col.name}' expects an integer, got {value!r}")
    if col.type == "bool" and isinstance(value, str):
        return value.lower() in TRUE_WORDS
    return value


def split_labels(row: dict[str, Any]) -> dict[str, Any]:
    out, labels = {}, {}
    for k, v in row.items():
        if k.startswith("_label_"):
            labels[k[7:]] = v
        else:
            out[k] = v
    out["_labels"] = labels
    return out


def writable(t: Table) -> None:
    if t.readonly:
        raise bad(400, f"'{t.label}' is a read-only view")


def tcol(name: str) -> sql.Identifier:
    return sql.Identifier("t", name)


def select_parts(t: Table) -> tuple[sql.Composable, sql.Composable, list[sql.Composable]]:
    """(select list, LEFT JOINs, label expressions) for reading t with FK labels resolved."""
    select: list[sql.Composable] = [sql.SQL("t.*")]
    joins: list[sql.Composable] = []
    label_exprs: list[sql.Composable] = []
    for i, c in enumerate(t.fk_columns):
        target = registry.get_table(c.fk["table"])
        alias = f"f{i}"
        expr = sql.SQL(registry.display_expr(target, alias))
        select.append(sql.SQL("{} AS {}").format(expr, sql.Identifier(f"_label_{c.name}")))
        joins.append(sql.SQL(" LEFT JOIN {} AS {} ON {} = {}").format(
            sql.Identifier(target.key), sql.Identifier(alias), sql.Identifier(alias, c.fk["column"]), tcol(c.name)))
        label_exprs.append(expr)
    return sql.SQL(", ").join(select), sql.SQL("").join(joins), label_exprs


def where_clause(t: Table, q: str, filters: dict[str, str], label_exprs: list[sql.Composable]) -> tuple[sql.Composable, list[Any]]:
    conds: list[sql.Composable] = []
    params: list[Any] = []
    if q:
        like = [sql.SQL("{}::text ILIKE %s").format(tcol(c)) for c in t.search_columns]
        like += [sql.SQL("({})::text ILIKE %s").format(e) for e in label_exprs]
        if like:
            conds.append(sql.SQL("(") + sql.SQL(" OR ").join(like) + sql.SQL(")"))
            params += [f"%{q}%"] * len(like)
    for name, value in filters.items():
        if value == "null":
            conds.append(sql.SQL("{} IS NULL").format(tcol(name)))
        else:
            conds.append(sql.SQL("{} = %s").format(tcol(name)))
            params.append(coerce(t.by_name[name], value))
    if not conds:
        return sql.SQL(""), params
    return sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conds), params


def pk_values(t: Table, request: Request) -> dict[str, Any]:
    if not t.pk:
        raise bad(400, f"'{t.label}' has no primary key")
    vals = {}
    for p in t.pk:
        raw = request.query_params.get(p)
        vals[p] = coerce(t.by_name[p], raw) if raw is not None else None
        if vals[p] is None:
            raise bad(400, f"Missing key parameter '{p}'", hint=f"Pass every key column as a query parameter: {', '.join(t.pk)}")
    return vals


def pk_where(vals: dict[str, Any]) -> tuple[sql.Composable, list[Any]]:
    return sql.SQL(" AND ").join(sql.SQL("{} = %s").format(tcol(k)) for k in vals), list(vals.values())


def fetch_row(cur, t: Table, vals: dict[str, Any]) -> dict[str, Any] | None:
    select, joins, _ = select_parts(t)
    where, params = pk_where(vals)
    cur.execute(sql.SQL("SELECT ") + select + sql.SQL(" FROM {} AS t").format(sql.Identifier(t.key)) + joins + sql.SQL(" WHERE ") + where, params)
    row = cur.fetchone()
    return split_labels(row) if row else None


@router.get("/{key}")
def list_rows(
    key: str,
    request: Request,
    page: int = 1,
    size: int = 25,
    q: str = "",
    sort: str | None = None,
    direction: str | None = Query(default=None, alias="dir"),
):
    t = registry.get_table(key)
    page = max(page, 1)
    size = min(max(size, 1), MAX_SIZE)
    sort_col = sort or t.default_sort[0]
    if sort_col not in t.by_name:
        raise bad(400, f"Unknown sort column '{sort_col}'")
    direction = direction or (t.default_sort[1] if sort is None else "asc")
    if direction not in ("asc", "desc"):
        raise bad(400, "dir must be 'asc' or 'desc'")
    filters = {k: v for k, v in request.query_params.items() if k not in RESERVED and k in t.by_name}

    select, joins, label_exprs = select_parts(t)
    where, params = where_clause(t, q.strip(), filters, label_exprs)
    base = sql.SQL(" FROM {} AS t").format(sql.Identifier(t.key)) + joins + where
    order = [sql.SQL("{} {} NULLS LAST").format(tcol(sort_col), sql.SQL("DESC" if direction == "desc" else "ASC"))]
    order += [tcol(p) for p in t.pk if p != sort_col]
    rows_q = sql.SQL("SELECT ") + select + base + sql.SQL(" ORDER BY ") + sql.SQL(", ").join(order) + sql.SQL(" LIMIT %s OFFSET %s")

    with db.get_conn() as (conn, _):
        with conn.cursor() as cur:
            cur.execute(sql.SQL("SELECT count(*) AS n") + base, params)
            total = cur.fetchone()["n"]
            cur.execute(rows_q, params + [size, (page - 1) * size])
            rows = cur.fetchall()
        conn.commit()
    return {"rows": [split_labels(r) for r in rows], "total": total, "page": page, "size": size}


@router.get("/{key}/row")
def get_row(key: str, request: Request):
    t = registry.get_table(key)
    vals = pk_values(t, request)
    with db.get_conn() as (conn, _):
        with conn.cursor() as cur:
            row = fetch_row(cur, t, vals)
        conn.commit()
    if row is None:
        raise bad(404, "Row not found")
    return row


@router.get("/{key}/options")
def options(key: str, q: str = "", limit: int = 50):
    t = registry.get_table(key)
    if len(t.pk) != 1:
        raise bad(400, f"'{t.label}' has a composite key and cannot be used as a picker",
                  hint="Pick each key column from its own table instead")
    q = q.strip()
    pk = t.pk[0]
    label = sql.SQL(t.display_sql)
    conds: list[sql.Composable] = []
    params: list[Any] = []
    if t.padding and not q:
        conds.append(sql.SQL("{} !~ %s").format(tcol(t.padding[0])))
        params.append(t.padding[1])
    if q:
        conds.append(sql.SQL("(({})::text ILIKE %s OR {}::text ILIKE %s)").format(label, tcol(pk)))
        params += [f"%{q}%", f"%{q}%"]
    where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conds) if conds else sql.SQL("")
    order: list[sql.Composable] = []
    if t.padding:
        order.append(sql.SQL("({} ~ %s)").format(tcol(t.padding[0])))
        params.append(t.padding[1])
    order.append(sql.SQL("label"))
    params.append(min(max(limit, 1), 200))
    query = sql.SQL("SELECT {} AS value, {} AS label FROM {} AS t{} ORDER BY {} LIMIT %s").format(
        tcol(pk), label, sql.Identifier(t.key), where, sql.SQL(", ").join(order))
    with db.get_conn() as (conn, _):
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
        conn.commit()
    return rows


@router.post("/{key}")
def create_row(key: str, body: dict[str, Any]):
    t = registry.get_table(key)
    writable(t)
    values = {c.name: coerce(c, body[c.name]) for c in t.columns if c.name in body}
    auto = next((c for c in t.columns if c.auto), None)
    with db.get_conn() as (conn, notices):
        with conn.cursor() as cur:
            if auto and values.get(auto.name) is None:
                cur.execute(sql.SQL("SELECT COALESCE(MAX({}), 0) + 1 AS next_id FROM {}").format(sql.Identifier(auto.name), sql.Identifier(t.key)))
                values[auto.name] = cur.fetchone()["next_id"]
            if not values:
                raise bad(400, "Empty row")
            cur.execute(sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
                sql.Identifier(t.key),
                sql.SQL(", ").join(map(sql.Identifier, values)),
                sql.SQL(", ").join(sql.Placeholder() * len(values)),
            ), list(values.values()))
            inserted = cur.fetchone()
            row = fetch_row(cur, t, {p: inserted[p] for p in t.pk})
        conn.commit()
    return {"row": row, "notices": notices.items}


@router.put("/{key}")
def update_row(key: str, request: Request, body: dict[str, Any]):
    t = registry.get_table(key)
    writable(t)
    vals = pk_values(t, request)
    changes = {c.name: coerce(c, body[c.name]) for c in t.columns if c.name in body and not c.pk}
    if not changes:
        raise bad(400, "No updatable columns in body")
    where, wparams = pk_where(vals)
    with db.get_conn() as (conn, notices):
        with conn.cursor() as cur:
            cur.execute(sql.SQL("UPDATE {} AS t SET {} WHERE {} RETURNING *").format(
                sql.Identifier(t.key),
                sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in changes),
                where,
            ), list(changes.values()) + wparams)
            if cur.rowcount == 0:
                raise bad(404, "Row not found")
            row = fetch_row(cur, t, vals)
        conn.commit()
    return {"row": row, "notices": notices.items}


@router.delete("/{key}")
def delete_row(key: str, request: Request):
    t = registry.get_table(key)
    writable(t)
    vals = pk_values(t, request)
    where, wparams = pk_where(vals)
    with db.get_conn() as (conn, notices):
        with conn.cursor() as cur:
            cur.execute(sql.SQL("DELETE FROM {} AS t WHERE {}").format(sql.Identifier(t.key), where), wparams)
            deleted = cur.rowcount
        if deleted == 0:
            raise bad(404, "Row not found")
        conn.commit()
    return {"deleted": deleted, "notices": notices.items}
