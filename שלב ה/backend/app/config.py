"""Runtime configuration. Values come from the repository root .env (the same file docker-compose uses)."""
import os
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent          # .../backend/app
BACKEND_DIR = APP_DIR.parent                        # .../backend
STAGE_DIR = BACKEND_DIR.parent                      # .../stage 5 folder
REPO_ROOT = STAGE_DIR.parent                        # repository root

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env", override=True)   # optional local override

DB_HOST = os.getenv("DB_HOST", "localhost").strip()
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME_SECRET", "chess_db").strip()
DB_USER = os.getenv("DB_USER_SECRET", "admin_chess").strip()
DB_PASSWORD = os.getenv("DB_PASSWORD_SECRET", "admin_chess123").strip()

APP_USER = os.getenv("APP_USER", "admin").strip()
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin").strip()

FRONTEND_DIST = STAGE_DIR / "frontend" / "dist"

CONNINFO = (
    f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} "
    f"user={DB_USER} password={DB_PASSWORD} application_name=chess_admin_ui"
)
