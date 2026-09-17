from fastapi import APIRouter, Depends

from .. import registry
from ..security import require_token

router = APIRouter(prefix="/meta", tags=["meta"], dependencies=[Depends(require_token)])


@router.get("/tables")
def list_tables():
    return [registry.to_meta(t) for t in registry.get_tables()]


@router.get("/tables/{key}")
def one_table(key: str):
    return registry.to_meta(registry.get_table(key))
