"""FastAPI entry point. Run from the backend folder:  uvicorn app.main:app --port 8000"""
from contextlib import asynccontextmanager
import importlib
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import psycopg

from . import config, db

ROUTERS = ["auth", "meta", "crud", "dashboard", "sql", "queries", "programs"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.pool.open()
    yield
    db.pool.close()


app = FastAPI(title="Chess Platform Admin API", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(psycopg.Error)
async def handle_pg_error(_: Request, exc: psycopg.Error):
    return JSONResponse(status_code=400, content={"detail": db.error_payload(exc)})


for _name in ROUTERS:
    try:
        _mod = importlib.import_module(f".routers.{_name}", __package__)
        app.include_router(_mod.router, prefix="/api")
    except Exception:  # a router that is still being written must not take the API down
        print(f"[main] router '{_name}' not loaded:")
        traceback.print_exc()


@app.get("/api/health")
def health():
    return {"ok": True, "database": config.DB_NAME}


# Static SPA (built frontend). Registered last so /api routes win.
if (config.FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def spa(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": {"message": f"Unknown API route: /{full_path}", "code": "404"}})
    index = config.FRONTEND_DIST / "index.html"
    if not index.is_file():
        return JSONResponse(status_code=404, content={"detail": "frontend not built yet: run npm run build in the frontend folder"})
    candidate = config.FRONTEND_DIST / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(index)
