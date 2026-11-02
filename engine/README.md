# promo-video engine

Part of the `promo-video` skill: Claude runs it, the user doesn't. Promo videos for apps, made from HTML scenes that
Chrome renders frame by frame. A video can be narrated (Gemini TTS voice, Whisper word timings, word-synced
subtitles, every visual keyed to a spoken word) or silent (title cards on fixed seconds).

```
P="node ~/.claude/skills/promo-video/engine/promo.mjs"
$P new [dir]                  start a project in dir (default ./promo); never overwrites existing files
$P capture                    run promo.json "capture" (a script that writes frames/, e.g. ./film.sh)
$P voices                     the Gemini voices
$P voice [--lines 0,2]        narrate the script; --lines (with --voice a,b) → sample.mp3 per voice to compare
$P preview <format> [t,…]     stills + one sheet.png (default: one per script line, or every 2 s)
$P play <format>              live player in Chrome with the narration: scrub, ticks for lines and cues
$P render [format|all]        → out/<slug>-<format>.mp4, copied to "output"
$P script                     the narration as the approval message (plain lines, seconds, "screen" notes)
$P check [format|all]         after render: size, fps, pix_fmt, range, loudness, â/î/û, shots/<format>/check.png
$P cover [--again]            "cover" → <output>/thumbnails/<slug>-short-thumb.jpg (Gemini background, cached)
$P publish                    "publish" → <output>/yayin-metinleri.txt (YouTube Shorts, TikTok, X)
$P appstore <id|bundleId>     icon.png, frames/appstore/*.png, appstore.json of an App Store app [--country tr]
$P ios build|record [take…]   iPhone app: copy to src/, prepare, build for a "Promo iPhone" simulator, film takes
                              → frames/ios/<take>/*.jpg + <take>.json; app side: templates/ios/PromoDirector.swift
  --voice <name>  --jobs <n>  --fps <n>  --png (lossless frames)
```

Needs Node 22+, Google Chrome, ffmpeg (`npm install` here once for playwright-core), and for narration uv, an Apple
Silicon Mac (Whisper runs on MLX) and the Gemini key in `$GEMINI_API_KEY` or `~/.config/gemini/api_key`.

## A project

```
promo/
  promo.json        name, slug, tagline, links, capture, output, voice, script, formats
  scenes/*.html     one scene per format
  frames/           app screenshots (2× pixels of the window) and anything else the scenes load
  icon.png
  narration/<voice>/  written by promo voice: l<i>.wav per line, words.json, voice.wav (keep it: takes vary per call)
  shots/, out/      previews and renders
```

```json
"script": [
  { "id": "hook", "gap": 0.25, "text": "macOS 26 ile {launchpad}Launchpad {gone}gitti, {folders}klasörleri de." }
],
"formats": {
  "tiktok": { "scene": "scenes/tiktok.html", "voice": true, "fps": 60 },
  "landscape": { "scene": "scenes/landscape.html" }
}
```

- `gap`: silence before the line. Give a line a longer gap when something has to happen on screen before it.
- `{name}` right before a word marks a cue; it is not spoken. Moving or adding cues never re-synthesizes; changing
  a line's words, the style or the model does (that line only).
- `voice`: `voice` (see `promo voices`), `model`, `lang` (Whisper), `style` (how to speak, in English), `say`
  ({"Claude": "Klod"}: spoken instead of a written word, one word for one word; subtitles keep the spelling), `tail`
  (seconds after the last word).
- A line's own `style` replaces the voice's for that line (a weary hook, a sudden energetic reveal, "strong emphasis on
  'tek tıkla'"); changing it re-synthesizes that line only.
- Outros: a narrated format ends with the fixed sign-off named like it (`outro/tiktok.json` "…takip et!",
  `outro/youtube.json` "…abone ol!"; cues `outro-like` … `outro-follow`, a built-in `tap` on each) or the one in its
  `"outro"` field; none for `x` or `"outro": false`. Takes are cached in `outro/<voice>/` so every video uses the same
  recordings. `promo voice` writes `words.json`/`voice.wav` (script only) and `words.<outro>.json`/`voice.<outro>.wav`;
  scenes get `?outro=` and draw it with `outroCta(stage, N, { lift: endCard })`.
- `sfx`: `[{ "file": "whoosh", "line": "intro", "offset": -0.5, "gain": -4 }]` mixes sound effects into voice.wav, at a
  line's start (`line`), a cue (`cue`) or a time (`at`), plus `offset`. `until` (a cue, a line id = its end, `"end"` or
  seconds) cuts it to a span and `fade` fades it in and out — a music bed. `file` is a project path or a built-in from
  `sfx/`: `whoosh` (0.85 s left-to-right swoosh peaking ~0.42 s in; `sfx/whoosh.py`), `ping` / `ping2` (soft glassy
  notification dings, scatter several under a "noisy" hook), `breath` (3.2 s deep inhale + exhale, the chaos clearing),
  `pad` (64 s warm ambient pad: `{"file": "pad", "line": "reveal", "until": "end", "fade": 1.8, "gain": -24}`);
  `sfx/beds.py` rebuilds those. Scenes get the times as `N.sfx` (e.g. land a transition on the whoosh).

## Scenes

A scene is a plain HTML page:

```html
<meta name="size" content="1080x1920">   <!-- stage and render viewport -->
<base href="/">                           <!-- relative URLs resolve against the project root -->
<link rel="stylesheet" href="promokit/promokit.css">
<script type="module">
import { scene, narration, subtitles, … } from './promokit/promokit.js'
scene(setup, render)   // setup(): load, set window.DURATION · render(t): draw time t
</script>
```

`render(t)` must depend on `t` alone: frames are rendered out of order, by several pages at once.

Runtime (`runtime/promokit.js`):

| | |
|---|---|
| `p(t, a, b, ease)`, `life(t, a, b, c, d)`, `lerp`, `clamp`, `E.out/inOut/outBack/in`, `rnd(i, k)` | timing and easing |
| `track(keys, t, log)` | eased path through `[time, ...values]` keys; `log` = indices that are zooms |
| `narration(voice?)` → `N` | `N.cue('gone')`, `N.start('hook')`, `N.end('hook')`, `N.at(line, 'Word')`, `N.duration` |
| `subtitles(el, N, opts)` | word-by-word subtitles into `#sub`, returns `render(t)` |
| `backdrop(parent, BACKDROPS.portrait \| landscape \| portrait/landscape + Yellow \| Green \| Red \| Orange)` | drifting blobs and grid, returns `render(t)`; blue is the default, yellow = "sarı olsun", green = AI tools, red = "çok yakında", orange = Claude Studio; the coloured presets also set their base colour (`bg`), orange also the subtitle highlight (`hi`) |
| `outroCta(stage, N, { lift, liftBy, liftScale, top })` | the fixed sign-off (like, comment, share, save, follow) on the outro line's cues; lifts the end card; no-op without an outro line |
| `demo(shots, { fit, at, win })` | shot list → frames, camera views, cursor path, clicks |
| `frameAt`, `show(img, src)`, `orPlaceholder(file, win)` | screenshot sequence |
| `place(win, view, { k, dy, opacity, blur })` | puts the window under a camera view `[s, fx, fy, px, py]` |
| `pointer(t, { cursor, ripples, path, clicks, … })` | cursor with presses and click ripples |
| `tile(dock, src, { run })` | a macOS Dock tile |
| `rise(el, t, a, dist)`, `titleCards()`, `titleCard(el, t, a, b)` | text entrances, silent-cut title cards |
| `project()` | promo.json |
| `clip(base)`, `follow(c, t, [[sceneTime, mark], …])` | a filmed take (`promo ios record`): frame for take time; take time keyed to the narration |

`runtime/promokit.css` styles the shared parts (window, cursor, ripples, Dock, grid stack, brand block, pills, title
cards, subtitles) at 1920×1080 sizes; scenes override sizes and positions. The templates in `templates/project/scenes`
are the starting points; `templates/` at the repo root has full example scenes with hand-made choreography.

## Rendering

`promo render` opens `--jobs` pages (default: half the cores, at most 4), each drawing every n-th frame, and pipes
them in order into one x264 encoder (CRF 15, 4:2:0, BT.709 limited range). Frames travel as JPEG q100, which is about
4× faster than PNG and loses less than the 4:2:0 encode does; `--png` for lossless frames. Narrated formats get the
narration muxed in as AAC; it is already loudness-normalised to −14 LUFS.
