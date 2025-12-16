# KekikParty

Bu proje Keyifler Olsun / KekikAkademi için hazırlanmış bir Watch Party uygulamasıdır. Sunucu tarafı Python ile yazılmıştır; ön yüz statik dosyalar `Public` klasöründe yer alır.

## **Ana Özellikler**

- **Canlı/Senkron oynatma:** Çoklu kullanıcı ile video senkronizasyonu
- **Proxy video/subtitle:** Sunucu üzerinden proxy ile video ve altyazı akışı
- **WebSocket** tabanlı Watch Party yönetimi

## **Dosya Yapısı (kısaca)**

- **`[Public](Public)`**: Frontend dosyaları (HTML, CSS, JS)
- **`[Public/Home/Static/JS/modules/player.js](Public/Home/Static/JS/modules/player.js)`**: Player ve senkronizasyon mantığı
- **`[Core](Core)`**: Uygulama çekirdeği ve modülleri
- **`[WebSocket](WebSocket)`**: WebSocket yöneticileri ve modeller
- **`[basla.py](basla.py)`**: Uygulama başlatma giriş noktası
- **`[docker-compose.yml](docker-compose.yml)`**, **`[Dockerfile](Dockerfile)`**, **`[requirements.txt](requirements.txt)`**: Docker ve bağımlılıklar

## **Gereksinimler**

- Python 3.10+ (veya sisteminizdeki uygun Python 3 sürümü)
- `pip`
- (Opsiyonel) Docker & Docker Compose

## **Kurulum — Yerel (venv)**

1. Depoyu klonlayın:

```bash
git clone https://github.com/keyiflerolsun/KekikParty.git
cd KekikParty
```

2. Sanal ortam oluşturun ve aktif edin:

Windows:

```powershell
python -m venv .venv
powershell .\.venv\Scripts\Activate.ps1
```

Linux / macOS:

```bash
python -m venv .venv
source .venv/bin/activate
```

3. Bağımlılıkları yükleyin:

```bash
pip install -r requirements.txt
```

4. Ortam değişkenlerini ayarlayın:

- Proje `docker-compose.yml` içinde `.env` kullanıyor; yerelde çalıştırırken de `.env` oluşturarak gerekli değişkenleri ekleyin.

Örnek `.env` içeriği proje gereksinimlerine göre değişir — gerekli değişkenler proje boyunca kullanılan servislere bağlıdır.

## **Çalıştırma — Yerel**

- Uygulamayı doğrudan başlatmak için:

```bash
python basla.py
```

- Uygulama başlatıldıktan sonra tarayıcıdan erişim (Docker yoksa): `http://localhost:3310` (port yapılandırmanıza bağlı olarak değişebilir).

## **Çalıştırma — Docker**

- Docker kullanmak için:

```bash
docker compose -f "docker-compose.yml" up -d --build "kekikparty""
```

- `docker-compose.yml` dosyasında servis `kekikparty` için port yönlendirmesi `1221:3310` olarak tanımlıdır; bu durumda uygulamaya `http://localhost:1221` adresinden ulaşabilirsiniz.

## **Sağlık Kontrolü**

- Docker healthcheck endpoint: `http://localhost:3310/api/v1/health` (compose içindeki container içi health check için kullanılır).

## **Geliştirme Notları**

- Frontend dosyaları `Public` içinde yer alır; statik JS modülleri `Public/Home/Static/JS/modules` klasöründe yönetilir.
- WebSocket logic `WebSocket/` altında toplanmıştır; Watch Party yönetimi `WebSocket/Libs/WatchPartyManager.py` içinde olabilir.

## **API / Önemli Endpointler**

- Health: `/api/v1/health`
- Proxy video: `/api/v1/proxy/video`
- Proxy subtitle: `/api/v1/proxy/subtitle`

(Detaylı endpoint ve kullanımlar `Public/API` veya `Core` içindeki router dosyalarından incelenebilir.)

## **Katkıda Bulunma**

- Değişiklik yapmadan önce issue açıp görüşün veya doğrudan PR gönderin.

## **Lisans**

- Proje sahibinin lisans bilgisi repoda yoksa, lisans ekleyerek netleştirin.

---
Dosya referansları ve başlatma noktası için: [basla.py](basla.py), [docker-compose.yml](docker-compose.yml), [requirements.txt](requirements.txt)
