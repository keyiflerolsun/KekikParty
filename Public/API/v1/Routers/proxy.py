# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core     import HTTPException, Response, Query
from .        import api_v1_router
from httpx    import AsyncClient as AsyncSession
from ..Libs   import rewrite_m3u8_urls
from Settings import PROXY_ENABLED

@api_v1_router.get("/proxy")
async def stream_proxy(
    url: str        = Query(..., description="Stream URL"),
    user_agent: str = Query("", description="Custom User-Agent header"),
    referer: str    = Query("", description="Custom Referer header")
):
    """
    M3U/HLS stream proxy - User-Agent ve Referer desteği ile
    """
    if not PROXY_ENABLED:
        raise HTTPException(status_code=503, detail="Proxy özelliği devre dışı")

    if not url:
        raise HTTPException(status_code=400, detail="URL parametresi gerekli")

    headers = {
        "Accept": "*/*",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    if user_agent:
        headers["User-Agent"] = user_agent
    else:
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    if referer:
        headers["Referer"] = referer

    try:
        async with AsyncSession() as session:
            response = await session.get(url, headers=headers, timeout=15)

            if response.status_code != 200:
                raise HTTPException(
                    status_code = response.status_code,
                    detail      = f"Upstream error: {response.status_code}"
                )

            content = response.content
            content_type = response.headers.get("content-type", "application/octet-stream")

            # M3U8 ise segment URL'lerini proxy URL'lerine dönüştür
            if "mpegurl" in content_type.lower() or url.endswith(".m3u8"):
                content = await rewrite_m3u8_urls(content.decode("utf-8"), url, user_agent, referer)
                content = content.encode("utf-8")
                content_type = "application/vnd.apple.mpegurl"

            return Response(
                content    = content,
                media_type = content_type,
                headers    = {
                    "Access-Control-Allow-Origin"  : "*",
                    "Access-Control-Allow-Methods" : "GET, OPTIONS",
                    "Access-Control-Allow-Headers" : "*",
                    "Cache-Control"                : "no-cache, no-store, must-revalidate",
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")
