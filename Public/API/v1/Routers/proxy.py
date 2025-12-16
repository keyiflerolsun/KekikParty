# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI                  import konsol
from fastapi              import Request, Response
from starlette.background import BackgroundTask
from fastapi.responses    import StreamingResponse
from .                    import api_v1_router
from ..Libs.helpers       import prepare_request_headers, prepare_response_headers, detect_hls_from_url, stream_wrapper, process_subtitle_content, CORS_HEADERS
from urllib.parse         import unquote
import httpx

@api_v1_router.get("/proxy/video")
@api_v1_router.head("/proxy/video")
async def video_proxy(request: Request, url: str, referer: str = None, user_agent: str = None):
    """Video proxy endpoint'i"""
    decoded_url     = unquote(url)
    request_headers = prepare_request_headers(request, decoded_url, referer, user_agent)

    # Client oluştur
    client = httpx.AsyncClient(
        follow_redirects = True,
        timeout          = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
    )
    
    try:
        # GET isteğini başlat
        req = client.build_request("GET", decoded_url, headers=request_headers)
        response = await client.send(req, stream=True)
        
        if response.status_code >= 400:
            await response.aclose()
            await client.aclose()
            return Response(status_code=response.status_code, content=f"Upstream Error: {response.status_code}")

        # Response headerlarını hazırla
        # HLS Tahmini (URL'den)
        detected_content_type = "application/vnd.apple.mpegurl" if detect_hls_from_url(decoded_url) else None
        
        final_headers = prepare_response_headers(dict(response.headers), decoded_url, detected_content_type)
        
        # HEAD isteği ise stream yapma, kapat ve dön
        if request.method == "HEAD":
            await response.aclose()
            await client.aclose()
            return Response(
                content     = b"",
                status_code = response.status_code,
                headers     = final_headers,
                media_type  = final_headers.get("Content-Type")
            )

        # GET isteği - StreamingResponse döndür
        return StreamingResponse(
            stream_wrapper(response),
            status_code = response.status_code,
            headers     = final_headers,
            media_type  = final_headers.get("Content-Type"),
            background  = BackgroundTask(client.aclose)
        )
        
    except Exception as e:
        await client.aclose()
        konsol.print(f"[red]Proxy başlatma hatası: {str(e)}[/red]")
        return Response(status_code=502, content=f"Proxy Error: {str(e)}")


@api_v1_router.get("/proxy/subtitle")
async def subtitle_proxy(request: Request, url: str, referer: str = None, user_agent: str = None):
    """Altyazı proxy endpoint'i"""
    try:
        decoded_url     = unquote(url)
        request_headers = prepare_request_headers(request, decoded_url, referer, user_agent)
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            response = await client.get(decoded_url, headers=request_headers)
            
            if response.status_code >= 400:
                return Response(
                    content     = f"Altyazı hatası: {response.status_code}", 
                    status_code = response.status_code
                )
            
            processed_content = process_subtitle_content(
                response.content, 
                response.headers.get("content-type", ""), 
                decoded_url
            )
            
            return Response(
                content     = processed_content,
                status_code = 200,
                headers     = {"Content-Type": "text/vtt; charset=utf-8", **CORS_HEADERS},
                media_type  = "text/vtt"
            )
            
    except Exception as e:
        return Response(
            content     = f"Proxy hatası: {str(e)}", 
            status_code = 500
        )
