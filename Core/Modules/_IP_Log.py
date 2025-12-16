# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from curl_cffi import AsyncSession
import ipaddress

async def ip_log(hedef_ip:str) -> dict[str, str]:
    try:
        try:
            ip = ipaddress.ip_address(hedef_ip)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
                return {"hata": "Local/özel IP - dış API çağrısı atlanıyor"}
        except ValueError:
            pass

        async with AsyncSession(timeout=3) as oturum:
            
            istek = await oturum.get(f"http://ip-api.com/json/{hedef_ip}")
            veri  = istek.json()

            if veri["status"] != "fail":
                return {
                    "ulke"   : veri["country"] or "",
                    "il"     : veri["regionName"] or "",
                    "ilce"   : veri["city"] or "",
                    "isp"    : veri["isp"] or "",
                    "sirket" : veri["org"] or "",
                    "host"   : veri["as"] or ""
                }
            else:
                return {"hata": "Veri Bulunamadı.."}
    except Exception as hata:
        return {"hata": f"{type(hata).__name__} » {hata}"}
