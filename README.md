# promo-video

Claude Code için bir skill. Uygulamanız ya da aracınız için tanıtım videosunu Claude baştan sona kendisi hazırlar:
dikey TikTok / Reels / Shorts videosu (yapay zeka sesi ve kelimesi kelimesine senkron altyazı) ya da sessiz yatay
demo. Sahneler HTML olarak yazılır, Chrome kare kare render eder.

Siz komut çalıştırmazsınız. Claude metni sizin onayınıza sunar, sesi dinletir, videoyu render eder; kapağı ve
YouTube / TikTok / X paylaşım metinlerini de hazırlar.

## Kurulum

Terminale tek satır:

```sh
curl -fsSL https://raw.githubusercontent.com/falconsw/promo-video/main/install.sh | bash
```

Kurulum betiği eksik olanı kendisi kurar ve var olana dokunmaz: Homebrew (şifrenizi bir kez sorar), Node 22+,
ffmpeg, uv, Google Chrome, Playwright, Whisper için arm64 Python ve Whisper modeli (~1,6 GB). En sonda Gemini API
anahtarını gizli bir alanda ister. Anahtarınız yoksa çıkan pencerede "Anahtar al" düğmesi
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) sayfasını açar (ücretsiz). Anahtar doğrulanır ve
yalnızca sizin okuyabileceğiniz `~/.config/gemini/api_key` dosyasına yazılır (`$GEMINI_API_KEY` de olur).
Güncellemek için aynı satırı yeniden çalıştırın.

Repoyu klonladıysanız klasörde `./install.sh` çalıştırın; klonunuz `~/.claude/skills/promo-video` altına bağlanır.
Kurulumu hiç yapmasanız da sorun olmaz: Claude ilk videoda eksikleri `promo.mjs doctor` ile görür, `setup` ile
kurar, anahtar eksikse sizden bir pencereyle ister.

Gerekenler: macOS ve Apple Silicon (Whisper MLX üzerinde çalışır). **Windows ve Linux desteği yakında.** Ücretsiz katmanda Google gönderilen metni
kullanabilir, bu yüzden yalnızca herkese açık tanıtım metinleri gönderilir.

## Kullanım

Uygulamanızın klasöründe Claude Code'a şunu yazmanız yeterli: "Bu uygulama için TikTok tanıtım videosu yap", "ses
ekle", "arka plan sarı olsun" ...

Varsayılanlar Türkçedir: Gemini `sadachbia` sesi.
Başka bir dil ya da ses isterseniz Claude'a söyleyin.

Ayrıntılar: [SKILL.md](SKILL.md) (Claude'un izlediği adımlar) ve [engine/README.md](engine/README.md) (motorun
komutları ve sahne API'si).
