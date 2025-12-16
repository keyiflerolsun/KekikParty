# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from urllib.parse import urlparse, urljoin, quote
import re

async def rewrite_uri_attribute(line: str, base_url: str, base_origin: str, user_agent: str, referer: str) -> str:
    """
    EXT-X-KEY, EXT-X-MAP gibi satırlardaki URI attribute'unu proxy URL'sine dönüştür
    """
    pattern = r'URI="([^"]+)"'
    match = re.search(pattern, line)

    if not match:
        return line

    uri = match.group(1)

    if uri.startswith("http://") or uri.startswith("https://"):
        full_url = uri
    elif uri.startswith("/"):
        full_url = base_origin + uri
    else:
        full_url = urljoin(base_url, uri)

    proxy_url = f"/api/v1/proxy?url={quote(full_url, safe='')}"
    if user_agent:
        proxy_url += f"&user_agent={quote(user_agent, safe='')}"
    if referer:
        proxy_url += f"&referer={quote(referer, safe='')}"

    return re.sub(pattern, f'URI="{proxy_url}"', line)

async def rewrite_m3u8_urls(content: str, base_url: str, user_agent: str, referer: str) -> str:
    """
    M3U8 içindeki URL'leri proxy URL'lerine dönüştür
    """
    lines = content.split("\n")
    result = []

    parsed_base = urlparse(base_url)
    base_origin = f"{parsed_base.scheme}://{parsed_base.netloc}"

    for line in lines:
        line = line.strip()

        if not line or line.startswith("#"):
            # Eğer EXT-X-KEY veya EXT-X-MAP gibi URI içeren satırsa, URI'yi dönüştür
            if "URI=" in line:
                line = await rewrite_uri_attribute(line, base_url, base_origin, user_agent, referer)
            result.append(line)
            continue

        # URL satırı
        if line.startswith("http://") or line.startswith("https://"):
            segment_url = line
        elif line.startswith("/"):
            segment_url = base_origin + line
        else:
            segment_url = urljoin(base_url, line)

        # Proxy URL oluştur
        proxy_url = f"/api/v1/proxy?url={quote(segment_url, safe='')}"
        if user_agent:
            proxy_url += f"&user_agent={quote(user_agent, safe='')}"
        if referer:
            proxy_url += f"&referer={quote(referer, safe='')}"

        result.append(proxy_url)

    return "\n".join(result)
