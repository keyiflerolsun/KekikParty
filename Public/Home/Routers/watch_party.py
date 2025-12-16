# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from Core                  import Request, HTMLResponse
from .                     import home_router, home_template
from Public.WebSocket.Libs import watch_party_manager

@home_router.get("/watch-party/{room_id}", response_class=HTMLResponse)
async def watch_party_room(request: Request, room_id: str):
    """Watch Party odası sayfası"""
    room_id = room_id.upper()

    # Mevcut oda varsa bilgilerini al
    room = await watch_party_manager.get_room(room_id)

    context = {
        "request"     : request,
        "site_name"   : "Watch Party",
        "title"       : f"Watch Party - Oda: {room_id}",
        "description" : "Birlikte video izle! YouTube, M3U/HLS ve daha fazlası.",
        "room_id"     : room_id,
        "room"        : room,
    }

    return home_template.TemplateResponse("pages/index.html.j2", context)
