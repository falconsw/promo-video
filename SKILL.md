---
name: promo-video
description: Make, change or add a voiceover to a promo / tanıtım video for the user's app or tool — a narrated vertical TikTok/Reels/Shorts cut (AI voice + word-synced subtitles) and/or a silent landscape demo of the app, rendered from HTML scenes. Use when the user asks for a promo, demo, tanıtım or TikTok/Reels video, says "ses ekle" / "seslendirme ekle" / add a voice, wants a change to such a video (script, voice, timing, visuals), or wants the cover and posting texts for YouTube, TikTok or X. Claude does all of it; the user runs nothing.
---

# Promo videos

Claude makes the whole video in the user's project — capture, script, voice, scene, render, cover, posting texts —
without the user running tools. They watch the result and give notes.

- Engine (yours, not a user command): `node ~/.claude/skills/promo-video/engine/promo.mjs <command>` — below `$P`
  (zsh does not split `$P`: write the node command out). `engine/README.md` has the commands, promo.json fields and
  the scene runtime API. Run `npm install` in `engine/` once (playwright-core).
- Everything that is the same for every app is an engine command — don't redo it by hand: `script` (approval text),
  `check` (post-render QA), `cover` (Shorts thumbnail), `publish` (yayin-metinleri.txt), `appstore` (App Store icon,
  screenshots, listing), `ios` (build + film an iPhone app). Per project you only write promo.json fields, the
  scene, and for apps the PromoDirector that drives them.
- Examples: `engine/templates/project/scenes/` (what `$P new` copies) and the full hand-choreographed scenes in
  `templates/` — read one before writing a new scene.
- `engine/lite/` is a simpler pipeline (`tts.py` → `build.sh`, scenes driven through
  `window.renderAt(t)`). New videos use `promo.mjs`. See §7.

Requirements: macOS on Apple Silicon (Whisper runs on MLX), Node 22+, Google Chrome, ffmpeg, uv, the Whisper model
and a Gemini API key in `$GEMINI_API_KEY` or `~/.config/gemini/api_key`. Set them up yourself, don't send the user
to install things:

- First video on this machine, or a tool failing as missing: `$P doctor`. Anything ✗ → `$P setup` installs it
  (Homebrew formulas and Chrome cask, npm, uv's arm64 Python, the ~1.6 GB Whisper model) and asks for the key last.
- No `node` at all: `bash ~/.claude/skills/promo-video/install.sh` (installs Node, then runs setup).
- No Homebrew: its installer needs the user's password, so ask them to type the line `setup` prints, with `!` in
  front, then run `setup` again.
- No Gemini key: tell the user in one sentence that a free key from aistudio.google.com/apikey is needed and that a
  macOS dialog will ask for it, then run `$P key` (a hidden-field dialog with an "Anahtar al" button that opens the
  page; it verifies the key and saves it with mode 600). If they already copied it: `$P key --clipboard`. Never ask
  for the key in the chat and never print it. `$P key --check` tests the stored one (e.g. after 400/403 errors).

Steps: project → frames → script → **user approves the script** → voice → **user approves the voice** → scene →
preview → render → hand-off.

## The user approves the narration text first — always

Before any synthesis (a new video, "ses ekle", a changed or added line, voice samples), show the user the exact text
to be spoken and stop until they approve it:

- `$P script` prints exactly that message: numbered plain lines (no cues, no â/î/û), seconds per line and in
  total, and each line's `screen` note (promo.json, not spoken). Paste it; add nothing but a question.
- When they correct it, apply their wording exactly, show the corrected lines again if anything is unclear, and
  synthesize only after a clear yes ("onaylıyorum", "tamam", "olur" …).
- When the voice comes out different from the text (Gemini rephrasing), propose the matching text change and get it
  approved too; never edit the spoken text silently.
- Cues, gaps and visuals can change without asking — they are not spoken.
- Check every claim against the code/README first; soften what isn't strictly true ("çoğu araçta API anahtarı bile
  gerekmez", not "API anahtarı istemez" when some providers have a key field).
- Ask whether the project is the user's own work. If it isn't (a fork, someone else's tool), never say "yazdım /
  yazdığım" anywhere — video or posting texts — and follow their call on attribution.
- If the voice must read something differently from the subtitle (say "Klod", show "Claude"), say so in one short
  sentence under the list (promo.json `voice.say`, below).

**Then the voice:** synthesize only the voice, Whisper-check every line, hand over the audio
(`! open promo/narration/sadachbia/voice.tiktok.wav`) and flag doubtful words (Gemini flips "X ile" ↔ "X'la";
"Claude" transcribed as "Cloud" is normal). Stop and wait; render only after both approvals.

## Never write circumflex letters (â, î, û)

No â/î/û anywhere written — not in the approval text, subtitles, cover question, end card, captions or any scene
text. Write "kar", "hala", "zeka", "dahili", never "kâr", "hâlâ", "zekâ", "dahilî". The voice should still say the
word the circumflexed way. Gemini usually gets it from context; where the plain spelling is ambiguous ("kar"
profit/snow, "hala" still/aunt), put the circumflex in promo.json's `text` as a pronunciation hint only. `voice.py`
strips â/î/û from every subtitle word it writes (and from Whisper matching), so the screen stays plain. Show the user
the plain spelling for approval, and Whisper-check that the take sounds right. (If the user wants circumflexes, follow
them.)

## Voice defaults — "ses ekle" means exactly this (don't ask again)

Use these for every voiceover unless the user says otherwise:

- Gemini TTS, free tier, model `gemini-3.8-flash-tts`, voice **`sadachbia`**, Turkish (`lang: "tr"`). For another
  language, set `lang` and write the script and style in it.
- Style: the professional narrator's full diction in `engine/templates/project/promo.json` (every final "r" of
  "-yor", the "l" of "nasıl", no clipping). Don't ask for "natural, conversational Istanbul Turkish": Gemini then
  clips everywhere ("yapıyo", "oluyo", "nası mı"). Whisper writes "yapıyor" either way, so the user's ear is the only
  check — ask at the voice step. "Nasıl mı?" may stay "nası mı" even then; "Nasıl?" is the fix. Existing projects keep
  the style in their promo.json (changing it re-voices every line).
- Spoken ≠ shown: promo.json `voice.say` {"Claude": "Klod", "Whisper": "Vispır", "API": "Ey-Pi-Ay",
  "Chrome'da": "Krom'da", "Gemini'ye": "Ceminay'a"} — each key is swapped wherever it stands as a whole word
  ("Claude'un" → "Klod'un"), one word for one word, so the subtitles keep the real spelling.
- Word timings from local Whisper (MLX, large-v3-turbo); leading silence trimmed; narration normalised to −14 LUFS.
- Word-by-word subtitles: up to 3 words / 17 characters per chunk, white 78 px weight 800 with a dark 14 px stroke,
  the spoken word in a light tint of the backdrop's hue (blue `#aab6ff`, yellow `#ffe08a`, green `#a6f0c4`, red `#ffb4a6`,
  orange `#ffd0a1` — the preset's `hi` sets it), centred at y ≈ 1330 on 1080×1920.
- 9:16 1080×1920, 60 fps, h264 + AAC 192k; copied to promo.json `output` (default `~/Movies/<App> Promo/`).

All of this is already in `engine/templates/project/promo.json` and the scene templates, so `$P new` starts there.
Never print the API key. Free tier: Google may use the text — only public promo copy. Avoid edge-tts and other
robotic TTS. Paid voices (ElevenLabs) only if the user asks. To try other voices, `$P voice --voice puck,kore
--lines 0,1` writes a `sample.mp3` per voice; play it for them with `open`.

Delivery notes ("bıkkın başlasın", "burada enerjik", "'tek tıkla'ya vurgu") go in that line's own `style` (a full
English style that replaces the default for the line); they don't change the words, so they need no new approval.
A transition sound ("whoosh") goes in promo.json `sfx` (built-in `whoosh`), and the scene lands its transition on
`N.sfx`. Sound design that works: notification `ping`/`ping2` scattered under a stressed hook, a `breath` in a 1.5 s
gap before the reveal line, then the warm `pad` from the reveal to the end (`until`, `fade`, gain ≈ −24) — the noise
stops dead when the app appears. Or: a weary questioning hook, a whoosh into an energetic reveal, and a stressed
"tek tıkla". Check every new take with Whisper: a restyled take can say "Maps'tan" instead of "Maps'ten".

"Ses ekle" to a silent video made here: add a narrated format to its promo.json (script + `"voice": true`) and key
the scene to the narration. To a video from elsewhere: write the script to its timeline, `$P voice`, then mux
`narration/<voice>/voice.wav` in with ffmpeg; for subtitles, make a scene that plays the mp4 under `#sub`.

## 1. Project

`$P new` in the app's repo makes `promo/` (it never overwrites existing files). Keep `promo/` out of git
(add it to the repo's `.gitignore`). Copy the app icon to `promo/icon.png`.

## 2. Frames

Screenshots of the app's window at 2× in `promo/frames/` (01.png, 02.png, …); the templates read the window size
from `frames/01.png`, so keep one window size.

- **macOS app**: a `patch.py` copies the app sources into `promo/src` and patches the copy (its own bundle id,
  throwaway data folders, side effects in memory, curated sample data so nothing personal shows);
  `Promo/PromoDirector.swift` drives the UI and saves a frame after each step plus `frames/timeline.json` and
  `manifest.json`; `film.sh` builds it (xcodegen + xcodebuild) and runs it. Put `"capture": "./film.sh"` in
  promo.json and run `$P capture`. Never touch the user's real Dock, /Applications or preferences.
- **iPhone app**: `$P appstore <bundleId>` fetches icon.png, the store screenshots (frames/appstore/) and
  appstore.json (listing, version). For motion, promo.json `ios` + `$P ios record`: the engine copies the repo to
  promo/src, runs `prepare` (a prepare.sh that adds `engine/templates/ios/PromoDirector.swift` to the copy and hooks
  it into the App struct, then xcodegen), builds for its own "Promo iPhone" simulator (9:41, full battery, Turkish),
  films each take while the app drives itself, and writes frames/ios/<take>/ + marks. Scenes play takes with
  promokit `clip()` and key them to the narration with `follow(c, t, [[N.cue('x'), 'x'], …])`.
- **Web app**: Playwright screenshots of each step with `deviceScaleFactor: 2`.
- **Chrome extension / live page motion**: a `capture.mjs` with Chrome for Testing (`npx playwright-core install
  chromium`; branded Chrome refuses `--load-extension`) with the extension loaded, CDP `Page.startScreencast` on each
  tab saving JPEGs named by ms (30 fps around clicks, a few fps otherwise), `run.json` marks; the scene maps video
  time to capture time. Screencast frames are 1× even with `deviceScaleFactor: 2`: launch with
  `--force-device-scale-factor=2 --window-size=W,H`, and size extra tabs' windows with CDP `Browser.setWindowBounds`.
  Mask phone numbers and other personal data in the pages.
- **CLI / Claude Code tool**: draw the terminal in the scene (dark window, monospace, the command typed letter by
  letter, output appearing on cues) — no screenshots.
- Shooting other apps' windows with `screencapture -l` needs Screen Recording permission, which the terminal may
  lack; prefer the ways above, or ask the user for screenshots.

## 3. Script

In promo.json `script`. A shape that works (≈ 27 s, 8 lines):

- ≤ 30 s. Line 1 is the hook — the problem in the first 2 s ("macOS 26 ile Launchpad gitti, klasörleri de.").
  Then "Ben de … bir uygulama yazdım: {brand}Name.", 2–4 feature lines each tied to something on screen, and last
  the call to action ("Ücretsiz. GitHub'da Name diye arat.").
- Write it as spoken. Gemini may rephrase ("26'yla" came out "26 ile"): if a subtitle shows a word the voice
  didn't say, propose changing the script to what it says (and get it approved).
- `{cue}` right before every word something should happen on (kebab-case, unique). Cues are not spoken; moving them
  never re-synthesizes.
- If a line's visuals need time (a click, a menu, an app being added), give the next line a longer `gap`
  (1.0–1.2 s) rather than rushing the visuals.

Then present it for approval (see above) — nothing is synthesized before the user's yes.

## 4. Scene

- Start from `promo/scenes/tiktok.html` (narrated) or `landscape.html` (silent). `demo()` covers plain shot lists;
  hand-write the hero moments (e.g. a page falling apart, the Dock).
- Narrated scenes take every time from `N.cue / N.start / N.end`, never fixed seconds, so a new take or an edited
  line re-times everything. `render(t)` depends on `t` alone (frames render out of order, in parallel).
- TikTok covers the top ~200 px, the bottom ~420 px and a right rail (x > 960, y 800–1500): action in y 200–1200,
  subtitles at y ≈ 1330, the window fades out above them (`#winwrap` mask 1120→1250 px).
- Positions are window points (half the frame pixels). System fonts only; everything loads from the project.
- Background: `backdrop($('stage'), BACKDROPS.portrait)` (blue/purple, the default; `landscape` for 16:9).
  **"Sarı olsun" / sarı arka plan** means the same drifting gradient in yellows: `BACKDROPS.portraitYellow`
  (`landscapeYellow` for 16:9), which also sets the warm near-black base. Use the preset as is — don't mix other
  yellows — and leave windows, chips and subtitles as they are. **AI tools are green**: Claude Code mods, agent
  tooling, anything for AI coding assistants use `BACKDROPS.portraitGreen` (`landscapeGreen`) without being asked;
  apps stay on the blue default unless the user picks another. **"Çok yakında" announcements are red**:
  `BACKDROPS.portraitRed` (`landscapeRed`). **Orange**: `BACKDROPS.portraitOrange` (`landscapeOrange`) — Claude's
  oranges over `#120703`, spoken-word subtitle colour `#ffd0a1` (the presets' optional `hi`). Same rule for all: the
  preset as is, the rest of the scene unchanged.
- End card: the app's icon, name, tagline / links.
- No spoken sign-off: every cut ends on the end card (the tiktok/youtube/x formats differ only where the user
  asks).

## 5. Check, render, hand off

- `$P preview <format>` and Read `promo/shots/<format>/sheet.png`; for a change, preview the exact times around it
  (`$P preview tiktok 5.2,5.4,5.6`). Look for visuals lagging the words, text under the subtitles or in a safe zone,
  half-entered frames, overlaps.
- `$P render` → `promo/out/<slug>-<format>.mp4` + the copy, then `$P check`: size, fps, yuv420p, tv range,
  BT.709 tags, −14 LUFS, â/î/û on screen, and `shots/<format>/check.png` (6 frames of the mp4) to Read. A ✗ means
  fix it.
- `$P play <format>` opens a live player in Chrome if the user wants to scrub through it.
- Cover (1080×1920 JPEG, the same file for YouTube, TikTok and Instagram). **Default: the "UI shot" made from the
  finished video** (`tools/covers-from-video/`): take 8 candidates of the TikTok cut at `3 + (duration − 9) · k / 7` s
  (k = 0…7), contact-sheet them and pick the clearest UI (not a logo screen, not a half-built transition); that frame
  in the lower half (`top: 800px`, shifted up 170 px so the subtitles stay out) over a blurred copy of itself, a dark
  shade over the top 1000 px, a `#FFC23A` pill naming the kind ("macOS uygulaması", "iPhone uygulaması", "Chrome
  eklentisi", "Claude Code") and three lines of one full question with a verb in Bricolage Grotesque 800 (176 px,
  shrunk to fit 960 px), last line in the **video's subtitle colour, i.e. its backdrop's `hi`** — the HTML in
  `tools/covers-from-video/make.py`, rendered with `node engine/lite/cover.mjs <cover.html> <out.jpg>`. Offer two
  title options. A fragment without a verb ("MÜŞTERİ LİSTESİ TEK TEK Mİ?") reads badly. If the scene itself shows
  "the cover being made", show this real process, never generated art that will not be the cover. A Gemini-drawn
  background is available on request: promo.json `cover` {pill, `lines`, `scene` in English} → `$P cover`
  (`--again` for a new one). Read it before showing it.
- Posting texts: promo.json `publish` {date, title, description, tiktok, hashtags, links, x, x_date, x_reason,
  x_reply, x_handle} → `$P publish` → `<output>/yayin-metinleri.txt` with the YouTube/TikTok/X fields and settings
  (AI disclosure on, category, schedule time).
- Tell the user (in their language): the path and `! open "<path>"`, the cover, and where the posting texts are. Ask
  what to change after they watch.

## 6. Uploading

Uploading and scheduling is the user's call; do it only when asked, and never press the final Publish / Schedule
button without their go-ahead. If they want help in the browser:

- Compress under the browser tool's upload limit if there is one (copies in `promo/upload/`, a folder the session can
  read): YouTube/TikTok `libx265 -crf 22 -tag:v hvc1`, X 720p/30 two-pass H.264 (~2200k).
- YouTube Studio: title, description, cover, not made for kids, altered/synthetic content = yes (AI voice), category,
  schedule with date, time and time zone.
- TikTok Studio: cover (Edit cover › Upload cover › Save), schedule, AI-generated content on. Insert the description
  as one paragraph (a `\n` can crash the editor) and read it back: the editor may insert hashtags twice.
- X: Content disclosure › Made with AI, the video, an optional reply with the links, schedule.
- Replacing an already scheduled video: no platform swaps the file of a scheduled post. Schedule the new one first,
  check it, then take the old one out reversibly (YouTube: set it private) and tell the user what is left to delete.

## Pitfalls already hit

- uv may be an x86_64 build; MLX needs the arm64 interpreter — the engine passes `--python cpython-3.12-macos-aarch64-none`.
- Gemini puts ~0.2 s of silence before each line; `voice.py` trims it, otherwise Whisper misplaces the first word.
- Whisper writes numbers as words; the aligner spreads such spans over the script's words.
- The free tier allows a few requests a minute; `voice.py` waits and retries on 429.
- Takes vary between calls: a line is only re-synthesized when its words, the style or the model change. To re-roll
  one line, delete `narration/<voice>/l<i>.json`. Re-roll a line at most 3 times until Whisper hears the words that
  matter, and keep every take (copy the wav aside) so the user can pick an earlier one. If the voice says "'la" where
  the text says "ile", fix the text to what was said (same words → no re-synthesis) rather than re-rolling.
- Never run two renders at once: both write the same voice file and ffmpeg hangs at 100 % CPU.
- Render time: blurs and many layers are slow. `render` gives each extra job its own Chrome (pages of one browser
  all wait on its main process; ~3× faster). Avoid `backdrop-filter` and full-frame `mix-blend-mode` layers.
- Colour: frames must go RGB → limited-range BT.709 explicitly (`format=gbrp,scale=out_color_matrix=bt709:out_range=tv`);
  ffmpeg's default matrix is BT.601 while the file says BT.709. `render.mjs` does it.
- Colour tags: the scaler leaves primaries/transfer "unknown" on every frame, overriding `-color_primaries`, and
  re-encoding apps (WhatsApp) then wash the video out. `render.mjs` sets them with `setparams` + x264 VUI and `check`
  fails without bt709/bt709/bt709. To fix an old file: re-encode at 30 fps, level 4.1, `setparams=…` +
  `-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709`, or send it as a document (no re-encode).
- A script named like a stdlib module (`platform.py`) breaks Whisper's imports.
- Sample data is always fake: made-up people and businesses ("Kırıntı Mutfak", "Örnek Kafe"), blurred photos, masked
  phones, personal paths covered. Real accounts and data never appear.

## 7. The lite engine (`engine/lite/`)

A simpler, self-contained pipeline. Each project gets its own copy (`cp -R engine/lite/* <project>/promo/`).

- `tts.py` (`LINES`, `GAPS`, `STYLE`, per-line `STYLES[i]`, `SAY`; run with
  `uv run --no-project --python cpython-3.12-macos-aarch64-none --with mlx-whisper tts.py sadachbia`) → `build.sh [tiktok youtube x]`
  (`SLUG`, `DEST` env; `render.mjs` over `window.renderAt(t)`, `JOBS` Chrome processes, `SPLIT=<frame>` draws the
  part every cut shares once as `out/common.mp4` — delete it after changing anything before SPLIT; sound cues from
  the scene's `window.SFX`, per-cue volumes in a `case`). `build.sh` is zsh: `${ms}`, `[s${n}]` inside strings.
- Example scenes: `templates/scene-studio-example.html` (orange, a wall of promo videos with a focus pull, a 5-step
  rail, one window whose panes change, slamming step numerals) and `templates/scene-leftover-example.html`; both end
  with `cta.js`. URL params `?voice=sadachbia&p=tiktok|youtube|x`.
