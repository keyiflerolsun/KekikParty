# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core   import Query, HTTPException
from .      import api_v1_router
from ..Libs import YTDLPService

@api_v1_router.get("/extract")
async def extract_video(url: str = Query(..., description="Video URL (YouTube, etc.)")):
    """
    yt-dlp ile video bilgisi çıkar
    """

    if not url:
        raise HTTPException(status_code=400, detail="URL parametresi gerekli")

    video_info = await YTDLPService.extract_video_info(url)

    if not video_info:
        raise HTTPException(status_code=500, detail="Video bilgisi alınamadı")

    return video_info
