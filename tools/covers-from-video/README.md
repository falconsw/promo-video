# Covers from finished videos

Remakes Shorts covers in the "UI shot" style : a real product frame from the video in the lower
half, a blurred copy of the same frame as the background (so the colour family matches the video), the pill and the 3-line
question on top (Bricolage Grotesque 800, last line in the backdrop's subtitle colour, pill #FFC23A).

1. `covers.json`: `[no, "<Name>" (→ ~/Movies/<Name> Promo/*-tiktok.mp4), youtubeId, k, pill, [lines…], backdrop]` — backdrop `blue` (default), `yellow`, `green`, `red`, `orange` or a hex: the last line takes that backdrop's subtitle colour. `k` (0–7) picks the frame
   at `3 + (duration − 9) · k / 7` s; build a contact sheet of the 8 candidates first and choose the clearest UI (not a logo screen,
   not a half-cropped fragment).
2. `python3 make.py` → `/tmp/cov/work/<no>.html` + frame PNG (paths are hard-coded to /tmp/cov; copy this folder there).
3. `node render.mjs "<output dir>"` (uses playwright-core from `engine/`: `npm install` there once) → `<no>-<slug>-<youtubeId>.jpg`, 1080×1920.
