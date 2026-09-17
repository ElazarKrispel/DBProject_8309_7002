"""Database access helpers shared by every router.

Usage pattern:

    with get_conn() as (conn, notices):
        with conn.cursor() as cur:
            cur.execute("SELECT ...", params)
            rows = cur.fetchall()          # list[dict] (dict_row)
        conn.commit()                       # or conn.rollback() for preview mode
    notices.items -> [{"severity": "NOTICE", "message": "..."}]

If the block exits without commit, the transaction is rolled back (never auto-committed).
psycopg.Error raised inside a request is converted to HTTP 400 by main.py using error_payload().
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
import time
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import CONNINFO

pool = ConnectionPool(
    CONNINFO,
    min_size=1,
    max_size=8,
    kwargs={"row_factory": dict_row, "autocommit": False},
    open=False,
)


@dataclass
class Notices:
    items: list[dict[str, str]] = field(default_factory=list)

    def handler(self, diag: psycopg.errors.Diagnostic) -> None:
        self.items.append({
            "severity": diag.severity_nonlocalized or diag.severity or "NOTICE",
            "message": diag.message_primary or "",
        })


def _in_transaction(conn: psycopg.Connection) -> bool:
    return conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE


@contextmanager
def get_conn() -> Iterator[tuple[psycopg.Connection, Notices]]:
    """Yield (connection, notices). The caller decides commit vs rollback."""
    with pool.connection() as conn:
        notices = Notices()
        conn.add_notice_handler(notices.handler)
        try:
            yield conn, notices
            if _in_transaction(conn):
                conn.rollback()
        except Exception:
            if _in_transaction(conn):
                conn.rollback()
            raise
        finally:
            conn.remove_notice_handler(notices.handler)


def columns_of(cur: psycopg.Cursor) -> list[str]:
    return [d.name for d in cur.description] if cur.description else []


def fetch_all(sql: str, params: Any = None) -> dict[str, Any]:
    """Run one read-only statement and return {columns, rows, rowcount, elapsed_ms, notices}."""
    started = time.perf_counter()
    with get_conn() as (conn, notices):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = columns_of(cur)
            rows = cur.fetchall() if cur.description else []
            rowcount = cur.rowcount
        conn.commit()
    return {
        "columns": cols,
        "rows": rows,
        "rowcount": rowcount if rowcount >= 0 else len(rows),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
        "notices": notices.items,
    }


def fetch_one(sql: str, params: Any = None) -> dict[str, Any] | None:
    with get_conn() as (conn, _notices):
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
    return row


def scalar(sql: str, params: Any = None) -> Any:
    row = fetch_one(sql, params)
    if not row:
        return None
    return next(iter(row.values()))


def error_payload(exc: psycopg.Error) -> dict[str, Any]:
    """Uniform DB error shape for the UI: {message, code, hint, detail, constraint}."""
    diag = getattr(exc, "diag", None)
    message = (diag.message_primary if diag and diag.message_primary else str(exc)).strip()
    return {
        "message": message,
        "code": getattr(exc, "sqlstate", None),
        "hint": (diag.message_hint if diag else None),
        "detail": (diag.message_detail if diag else None),
        "constraint": (diag.constraint_name if diag else None),
    }
