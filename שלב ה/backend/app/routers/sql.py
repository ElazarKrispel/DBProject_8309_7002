"""Ad-hoc SQL console: one statement batch, one transaction, preview (rollback) or apply (commit)."""
import re
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
import psycopg
import sqlparse
from pydantic import BaseModel

from .. import db
from ..security import require_token

router = APIRouter(prefix="/sql", tags=["sql"], dependencies=[Depends(require_token)])

READ_KEYWORDS = {"SELECT", "WITH", "EXPLAIN", "SHOW", "TABLE", "VALUES"}
MAX_ROWS = 500
_LEADING_COMMENTS = re.compile(r"^\s*(?:--[^\n]*\n|/\*.*?\*/\s*)*", re.S)


class SqlBody(BaseModel):
    sql: str
    mode: Literal["preview", "apply"] = "preview"


def first_keyword(text: str) -> str:
    m = re.match(r"\s*([A-Za-z]+)", _LEADING_COMMENTS.sub("", text, count=1))
    return m.group(1).upper() if m else ""


@router.post("")
def run_sql(body: SqlBody):
    text = body.sql.strip()
    if not text:
        raise HTTPException(status_code=400, detail={"message": "SQL is empty", "code": "400", "hint": None})
    statements = sqlparse.parse(text)
    transaction_commands = {"BEGIN", "START", "COMMIT", "END", "ROLLBACK", "ABORT", "SAVEPOINT", "RELEASE", "PREPARE"}
    for statement in statements:
        normalized = sqlparse.format(str(statement), strip_comments=True).strip()
        if first_keyword(normalized) in transaction_commands:
            raise HTTPException(status_code=400, detail={"message": "Use Preview or Apply to control the transaction; explicit transaction commands are not supported.", "code": "400", "hint": "Remove BEGIN, COMMIT or ROLLBACK and run the SQL again."})
    readonly = all(
        first_keyword(sqlparse.format(str(statement), strip_comments=True)) in READ_KEYWORDS
        and not any(token.normalized in {"INSERT", "UPDATE", "DELETE", "MERGE", "CALL"} for token in statement.flatten())
        for statement in statements
    )
    started = time.perf_counter()
    result = {"ok": True, "columns": [], "rows": [], "rowcount": 0, "elapsed_ms": 0.0,
              "notices": [], "truncated": False, "readonly": readonly}
    with db.get_conn() as (conn, notices):
        try:
            with conn.cursor() as cur:
                cur.execute(text)
                while True:  # multiple statements: report the last result set
                    if cur.description:
                        rows = cur.fetchmany(MAX_ROWS + 1)
                        result.update(columns=db.columns_of(cur), rows=rows[:MAX_ROWS], truncated=len(rows) > MAX_ROWS)
                    result["rowcount"] = cur.rowcount if cur.rowcount >= 0 else len(result["rows"])
                    if not cur.nextset():
                        break
            if body.mode == "apply":
                conn.commit()
            else:
                conn.rollback()
        except psycopg.Error as exc:
            conn.rollback()
            result.update(ok=False, error=db.error_payload(exc), columns=[], rows=[], rowcount=0)
        result["notices"] = notices.items
    result["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result
