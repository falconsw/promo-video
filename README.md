# promo-video

Claude Code için bir skill. Uygulamanız ya da aracınız için tanıtım videosunu Claude baştan sona kendisi hazırlar:
dikey TikTok / Reels / Shorts videosu (yapay zeka sesi ve kelimesi kelimesine senkron altyazı) ya da sessiz yatay
demo. Sahneler HTML olarak yazılır, Chrome kare kare render eder.

Siz komut çalıştırmazsınız. Claude metni sizin onayınıza sunar, sesi dinletir, videoyu render eder; kapağı ve
YouTube / TikTok / X paylaşım metinlerini de hazırlar.

## Kurulum

```sh
git clone https://github.com/<kullanici>/promo-video ~/.claude/skills/promo-video
cd ~/.claude/skills/promo-video/engine && npm install
```

Gerekenler:

- macOS, Apple Silicon (Whisper MLX üzerinde çalışır)
- Node 22+, Google Chrome, ffmpeg, [uv](https://docs.astral.sh/uv/)
- Gemini API anahtarı ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)): `$GEMINI_API_KEY`
  ortam değişkenine ya da `~/.config/gemini/api_key` dosyasına yazın. Ücretsiz katmanda Google gönderilen metni
  kullanabilir, bu yüzden yalnızca herkese açık tanıtım metinleri gönderilir.

## Kullanım

Uygulamanızın klasöründe Claude Code'a şunu yazmanız yeterli: "Bu uygulama için TikTok tanıtım videosu yap", "ses
ekle", "arka plan sarı olsun" ...

Varsayılanlar Türkçedir: Gemini `sadachbia` sesi ve Türkçe kapanış kayıtları ("Beğen, yorumla, paylaş, kaydet…").
Başka bir dil ya da ses isterseniz Claude'a söyleyin.

Ayrıntılar: [SKILL.md](SKILL.md) (Claude'un izlediği adımlar) ve [engine/README.md](engine/README.md) (motorun
komutları ve sahne API'si).
