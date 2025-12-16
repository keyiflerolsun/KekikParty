# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from fastapi import APIRouter

api_v1_router = APIRouter(prefix="/api/v1")

from . import health, extract, proxy
