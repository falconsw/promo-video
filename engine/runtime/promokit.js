// promokit runtime: the helpers and components every scene shares.
// A scene is an HTML page (see templates/project/scenes) that
//   - has <base href="/">, so its relative URLs resolve against the project root (frames/…, icon.png, promokit/…),
//   - has <meta name="size" content="1080x1920">, which sizes both the stage and the render viewport,
//   - calls scene(setup, render): setup() loads what it needs and sets window.DURATION,
//     render(t) draws time t. Frames are rendered in any order, so render must depend on t alone.

export const $ = (id) => document.getElementById(id)
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, k) => a + (b - a) * k
export const E = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2) },
  in: (k) => k * k * k
}
// progress of t through [a, b], eased
export const p = (t, a, b, e = E.out) => e(clamp((t - a) / (b - a)))
// in over [a, b], out over [c, d]
export const life = (t, a, b, c, d, e = E.out) => Math.min(p(t, a, b, e), 1 - p(t, c, d, E.inOut))
// deterministic noise in [0, 1)
export const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }

// Piecewise path through [time, ...values] keys, eased between neighbours.
// Values at the indices in `log` are zoom factors and move in log space, so a zoom feels even all the way.
export function track(keys, t, log = []) {
  const i = keys.findIndex(([kt]) => kt > t)
  if (i === -1) return keys.at(-1).slice(1)
  if (i === 0) return keys[0].slice(1)
  const a = keys[i - 1], b = keys[i], k = E.inOut(clamp((t - a[0]) / (b[0] - a[0])))
  return a.slice(1).map((v, j) => typeof v !== 'number' ? v
    : log.includes(j) ? Math.exp(lerp(Math.log(v), Math.log(b[j + 1]), k)) : lerp(v, b[j + 1], k))
}

const [W, H] = (document.querySelector('meta[name=size]')?.content ?? '1920x1080').split('x').map(Number)
document.documentElement.style.setProperty('--w', `${W}px`)
document.documentElement.style.setProperty('--h', `${H}px`)
window.SIZE = { width: W, height: H }

export function scene(setup, render) {
  window.renderAt = render
  window.ready = (async () => {
    await setup()
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
    await document.fonts.ready
    if (!(window.DURATION > 0)) throw new Error('setup() has to set window.DURATION')
  })()
}

export async function json(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.json()
}
let config
export const project = () => (config ??= json('promo.json'))

// ---------- narration ----------

// The timeline `promo voice` wrote: lines (by index or "id") → words with times, plus the script's {cue} marks.
//   N.cue('gone') → when the word marked {gone} starts;  N.start('hook') / N.end('hook') → a line's speech;
//   N.at(line, 'Folder') → first word of the line that starts with the text;  N.duration → video length.
export async function narration(voice = new URLSearchParams(location.search).get('voice'), outro = new URLSearchParams(location.search).get('outro')) {
  voice ??= (await project()).voice?.voice
  const N = await json(`narration/${voice}/words${outro ? `.${outro}` : ''}.json`)  // N.outro: which sign-off this cut ends with
  const L = N.lines
  const line = (x) => {
    const i = typeof x === 'number' ? x : L.findIndex((l) => l.id === x)
    if (!L[i]) throw new Error(`the script has no line ${JSON.stringify(x)}`)
    return i
  }
  const marks = {}
  L.forEach((l, i) => l.words.forEach((x, j) => { if (x.cue) marks[x.cue] = [i, j] }))
  N.w = (i, j) => L[i].start + L[i].words[j].start
  N.start = (x) => L[line(x)].start
  N.end = (x) => { const l = L[line(x)]; return l.start + l.words.at(-1).end }
  N.cue = (name) => {
    if (!marks[name]) throw new Error(`the script has no {${name}} cue`)
    return N.w(...marks[name])
  }
  N.at = (x, text) => {
    const i = line(x), j = L[i].words.findIndex((w) => w.text.startsWith(text))
    if (j < 0) throw new Error(`line ${x} has no word starting with ${text}`)
    return N.w(i, j)
  }
  return N
}

// Word-by-word subtitles into el (#sub): chunks of up to `words` words / `chars` characters, always breaking
// after punctuation; the word being spoken gets .on. Returns render(t).
export function subtitles(el, N, { words = 3, chars = 17, hold = .45 } = {}) {
  const chunks = []
  for (const line of N.lines) {
    let cur = []
    const flush = () => { if (cur.length) chunks.push(cur); cur = [] }
    for (const wd of line.words) {
      const word = { text: wd.text, a: line.start + wd.start, b: line.start + wd.end }
      if (cur.length && (cur.length >= words || [...cur, word].map((x) => x.text).join(' ').length > chars)) flush()
      cur.push(word)
      if (/[.,:;!?]$/.test(wd.text)) flush()
    }
    flush()
  }
  chunks.forEach((c, i) => { c.a = c[0].a; c.b = Math.min(chunks[i + 1]?.[0].a ?? Infinity, c.at(-1).b + hold) })

  return (t) => {
    const chunk = chunks.find((c) => t >= c.a - .02 && t < c.b)
    if (!chunk) { el.innerHTML = ''; return }
    if (el.dataset.id !== String(chunk.a)) {
      el.dataset.id = String(chunk.a)
      el.innerHTML = chunk.map((x) => `<span>${x.text}</span>`).join(' ')
    }
    const k = p(t, chunk.a - .02, chunk.a + .16, E.outBack)
    el.style.transform = `translateY(-50%) scale(${lerp(.82, 1, k)})`
    el.style.opacity = clamp((t - chunk.a + .02) / .08)
    el.querySelectorAll('span').forEach((s, i) => {
      s.classList.toggle('on', t >= chunk[i].a && (i === chunk.length - 1 || t < chunk[i + 1].a))
    })
  }
}

// ---------- backdrop ----------

export const COS = Math.PI / 2
// Each blob drifts as x0 + amplitude · sin(t · speed + phase): x: [x0, amplitude, speed, phase].
export const BACKDROPS = {
  landscape: { grid: '50% 45%', blobs: [
    { size: 900, color: '#3340d6', opacity: .5, x: [-260, 90, .3], y: [-320, 60, .25, COS] },
    { size: 760, color: '#8a2fc7', opacity: .38, x: [1300, 80, .28, COS], y: [520, 70, .3] },
    { size: 620, color: '#1e7fbf', opacity: .3, x: [700, 120, .2], y: [-480, 40, .35] }] },
  portrait: { grid: '50% 40%', blobs: [
    { size: 900, color: '#3340d6', opacity: .5, x: [-380, 80, .3], y: [-260, 70, .25, COS] },
    { size: 760, color: '#8a2fc7', opacity: .4, x: [480, 70, .28, COS], y: [1050, 80, .3] },
    { size: 620, color: '#1e7fbf', opacity: .3, x: [160, 110, .2], y: [420, 60, .35] }] },
  // Every coloured preset sets `hi`, the spoken-word subtitle colour, as a light tint of its own hue (user, 2026-10-31);
  // blue keeps the default #aab6ff from promokit.css.
  // "sarı olsun": the same drift in yellows (#FFC23A family) over a warm near-black
  portraitYellow: { hi: '#ffe08a', bg: '#120d03', grid: '50% 40%', blobs: [
    { size: 900, color: '#ffc23a', opacity: .62, x: [-380, 80, .3], y: [-260, 70, .25, COS] },
    { size: 760, color: '#ffa000', opacity: .46, x: [480, 70, .28, COS], y: [1050, 80, .3] },
    { size: 620, color: '#ffe066', opacity: .34, x: [160, 110, .2], y: [420, 60, .35] }] },
  landscapeYellow: { hi: '#ffe08a', bg: '#120d03', grid: '50% 45%', blobs: [
    { size: 900, color: '#ffc23a', opacity: .62, x: [-260, 90, .3], y: [-320, 60, .25, COS] },
    { size: 760, color: '#ffa000', opacity: .46, x: [1300, 80, .28, COS], y: [520, 70, .3] },
    { size: 620, color: '#ffe066', opacity: .34, x: [700, 120, .2], y: [-480, 40, .35] }] },
  // AI tools (Claude Code mods, agent tooling): the same drift in greens over a cool near-black
  portraitGreen: { hi: '#a6f0c4', bg: '#03100a', grid: '50% 40%', blobs: [
    { size: 900, color: '#1fbf6e', opacity: .5, x: [-380, 80, .3], y: [-260, 70, .25, COS] },
    { size: 760, color: '#0b8f62', opacity: .44, x: [480, 70, .28, COS], y: [1050, 80, .3] },
    { size: 620, color: '#6ee7a8', opacity: .28, x: [160, 110, .2], y: [420, 60, .35] }] },
  landscapeGreen: { hi: '#a6f0c4', bg: '#03100a', grid: '50% 45%', blobs: [
    { size: 900, color: '#1fbf6e', opacity: .5, x: [-260, 90, .3], y: [-320, 60, .25, COS] },
    { size: 760, color: '#0b8f62', opacity: .44, x: [1300, 80, .28, COS], y: [520, 70, .3] },
    { size: 620, color: '#6ee7a8', opacity: .28, x: [700, 120, .2], y: [-480, 40, .35] }] },
  // "Çok yakında" (coming soon) announcements: top-left #6d1919, bottom-right #210403.
  portraitRed: { hi: '#ffb4a6', bg: '#100203', grid: '50% 40%', blobs: [
    { size: 900, color: '#e93836', opacity: .5, x: [-380, 80, .3], y: [-260, 70, .25, COS] },
    { size: 760, color: '#d91a03', opacity: .36, x: [480, 70, .28, COS], y: [1050, 80, .3] },
    { size: 620, color: '#ff7a5c', opacity: .28, x: [160, 110, .2], y: [420, 60, .35] }] },
  landscapeRed: { hi: '#ffb4a6', bg: '#100203', grid: '50% 45%', blobs: [
    { size: 900, color: '#e93836', opacity: .5, x: [-260, 90, .3], y: [-320, 60, .25, COS] },
    { size: 760, color: '#d91a03', opacity: .36, x: [1300, 80, .28, COS], y: [520, 70, .3] },
    { size: 620, color: '#ff7a5c', opacity: .28, x: [700, 120, .2], y: [-480, 40, .35] }] },
  // the same drift in Claude's oranges over a warm near-black, subtitle highlight #ffd0a1
  portraitOrange: { bg: '#120703', hi: '#ffd0a1', grid: '50% 40%', blobs: [
    { size: 900, color: '#ff6a1f', opacity: .5, x: [-380, 80, .3], y: [-260, 70, .25, COS] },
    { size: 760, color: '#d97757', opacity: .4, x: [480, 70, .28, COS], y: [1050, 80, .3] },
    { size: 620, color: '#ffb347', opacity: .3, x: [160, 110, .2], y: [420, 60, .35] }] },
  landscapeOrange: { bg: '#120703', hi: '#ffd0a1', grid: '50% 45%', blobs: [
    { size: 900, color: '#ff6a1f', opacity: .5, x: [-260, 90, .3], y: [-320, 60, .25, COS] },
    { size: 760, color: '#d97757', opacity: .4, x: [1300, 80, .28, COS], y: [520, 70, .3] },
    { size: 620, color: '#ffb347', opacity: .3, x: [700, 120, .2], y: [-480, 40, .35] }] }
}

// Drifting colour blobs over a faint grid, put behind everything else in parent. Returns render(t).
// `bg` (optional) replaces the page's base colour behind the blobs, `hi` the subtitles' spoken-word colour.
export function backdrop(parent, { blobs, grid = '50% 45%', bg, hi }) {
  if (bg) document.documentElement.style.setProperty('--bg', bg)
  if (hi) document.documentElement.style.setProperty('--hi', hi)
  const els = blobs.map((b) => {
    const el = document.createElement('div')
    el.className = 'blob'
    el.style.cssText = `width:${b.size}px;height:${b.size}px;background:${b.color};opacity:${b.opacity}`
    return el
  })
  const g = document.createElement('div')
  g.className = 'grid'
  g.style.setProperty('-webkit-mask-image', `radial-gradient(ellipse at ${grid}, #000 20%, transparent 75%)`)
  parent.prepend(...els, g)
  const wave = ([v, a = 0, f = 0, ph = 0], t) => v + a * Math.sin(t * f + ph)
  return (t) => blobs.forEach((b, i) => { els[i].style.transform = `translate(${wave(b.x, t)}px, ${wave(b.y, t)}px)` })
}

// ---------- the app window ----------

// The file of a screenshot sequence [[t, file], …] that is up at time t.
export function frameAt(frames, t) {
  let f = frames[0][1]
  for (const [ft, file] of frames) if (ft <= t) f = file
  return f
}

// Points img at src and waits until it can be painted.
export async function show(img, src) {
  if (img.dataset.src === src) return
  img.dataset.src = src
  img.src = src
  await img.decode()
}

// Camera view [s, fx, fy, px, py]: window point (fx, fy) lands on stage point (px, py) at s stage px per window pt.
// k scales on top of the view (entrances, exits), dy shifts down. Returns the final scale.
export function place(el, [s, fx, fy, px, py], { k = 1, dy = 0, opacity = 1, blur = 0 } = {}) {
  const sc = s * k
  el.style.transform = `translate(${px - fx * sc}px, ${py - fy * sc + dy}px) scale(${sc})`
  el.style.opacity = opacity
  el.style.filter = blur > 0 ? `blur(${blur}px)` : 'none'
  return sc
}

// A cursor along [t, x, y, visible] keys that presses at each click [t, {x, y}] and leaves a ripple there.
// Coordinates are the cursor's parent's (window points when it lives in #win).
export function pointer(t, { cursor, ripples = [], path, clicks = [], scale = 1, ripple = .55, rippleTo = 1.6, rippleScale = 1 }) {
  const [x, y, o] = track(path, t)
  let press = 0
  for (const [ct] of clicks) press = Math.max(press, 1 - Math.abs(t - ct) / .09)
  cursor.style.transform = `translate(${x - 3}px, ${y - 3}px) scale(${scale * (1 - .16 * clamp(press))})`
  cursor.style.opacity = o
  let ri = 0
  for (const [ct, pt] of clicks) {
    const k = (t - ct) / ripple
    if (k < 0 || k > 1 || ri >= ripples.length) continue
    const r = ripples[ri++]
    r.style.opacity = (1 - k) * .9
    r.style.transform = `translate(${pt.x}px, ${pt.y}px) scale(${lerp(.3, rippleTo, E.out(k)) * rippleScale})`
  }
  for (; ri < ripples.length; ri++) ripples[ri].style.opacity = 0
}

// A window demo from a shot list, for scenes that don't need hand-made choreography:
//   [{ t, file, view: [zoom, fx, fy], click: [x, y] }, …]  (seconds; window points; view and click optional)
// Each shot's frame shows from t (just after its click), the camera eases to its view (zoom over `fit`, focus
// fx, fy) around t, and a cursor glides from click to click. Returns { frames, views, path, clicks } for
// frameAt, track(views, t, [0]), place and pointer.
export function demo(shots, { fit = 1, at = [W / 2, H / 2], win = [1280, 800] } = {}) {
  const base = [fit, win[0] / 2, win[1] / 2, ...at]
  const frames = [], views = [[0, ...base]], clicks = []
  let last = base
  for (const s of [...shots].sort((a, b) => a.t - b.t)) {
    frames.push([frames.length ? s.t + (s.click ? .08 : 0) : 0, s.file])
    const v = s.view ? [fit * s.view[0], s.view[1], s.view[2], ...at] : base
    if (v !== last) {
      views.push([Math.max(s.t - .35, views.at(-1)[0]), ...last], [Math.max(s.t + .15, views.at(-1)[0] + .01), ...v])
      last = v
    }
    if (s.click) clicks.push([s.t, { x: s.click[0], y: s.click[1] }])
  }
  const path = []
  clicks.forEach(([t, pt], i) => {
    if (!i || t - clicks[i - 1][0] > 2.5) path.push([t - .75, pt.x - 160, pt.y - 90, 0], [t - .6, pt.x - 160, pt.y - 90, 1])
    path.push([t - .1, pt.x, pt.y, 1], [t + .2, pt.x, pt.y, 1])
    if (i === clicks.length - 1 || clicks[i + 1][0] - t > 2.5) path.push([t + .45, pt.x, pt.y, 0])
  })
  if (!path.length) path.push([0, 0, 0, 0])
  return { frames, views, path, clicks }
}

// The window size in points from a 2× screenshot of it, or `fallback` while the project has none yet.
export async function windowSize(file, fallback = [1280, 800]) {
  const img = new Image()
  img.src = file
  try { await img.decode() } catch { return fallback }
  return [img.naturalWidth / 2, img.naturalHeight / 2]
}

// file if the project has it, else a placeholder the size of the window that names it
export async function orPlaceholder(file, [w, h] = [1280, 800]) {
  if ((await fetch(file, { method: 'HEAD' })).ok) return file
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}"><rect width="100%" height="100%" rx="32" fill="#1b1d33"/>` +
    `<text x="50%" y="50%" fill="#8890c0" font-family="Menlo, monospace" font-size="56" text-anchor="middle">${file}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ---------- macOS Dock ----------

export function tile(dock, src, { run = false } = {}) {
  const el = document.createElement('div')
  el.className = 'tile'
  el.innerHTML = `<img src="${src}" alt="">${run ? '<div class="run"></div>' : ''}`
  dock.append(el)
  return el
}

// ---------- text ----------

// Fades in over `fade` s from a, sliding up `dist` px over `move` s.
export function rise(el, t, a, dist = 36, fade = .4, move = .5) {
  el.style.cssText = `opacity:${p(t, a, a + fade)};transform:translateY(${(1 - p(t, a, a + move)) * dist}px)`
}

// Title cards for silent cuts:
//   <div class="cap"><div class="eyebrow">ONE CLICK</div><h1 data-words="Sort every app| |<g>into groups</g>"></h1></div>
// Words split on |, <g>…</g> gets the gradient. Call titleCards() once, then titleCard(el, t, in, out) every frame.
export function titleCards(root = document) {
  for (const h of root.querySelectorAll('h1[data-words]')) {
    h.innerHTML = h.dataset.words.split('|').map((w) => w === '<br>' ? '<br>' :
      w.startsWith('<g>') ? `<span class="grad">${w.slice(3, -4)}</span>` : `<span>${w}</span>`).join('')
  }
}

export function titleCard(el, t, a, b) {
  el.style.opacity = life(t, a, a + .6, b, b + .35)
  el.style.transform = `translateY(${lerp(-10, 0, p(t, a, a + .7)) - 14 * p(t, b, b + .35, E.in)}px)`
  el.querySelectorAll('h1 span').forEach((s, i) => {
    const k = p(t, a + .1 + i * .08, a + .75 + i * .08, E.out)
    s.style.opacity = k
    s.style.transform = `translateY(${(1 - k) * 34}px)`
  })
  el.querySelector('.eyebrow').style.transform = `scale(${lerp(.85, 1, p(t, a, a + .6, E.outBack))})`
}

// ---------- filmed takes (promo ios record) ----------

// clip('frames/ios/tour') → { src(t), mark(name), duration, fps, size, marks }; t is the take's own time in seconds.
export async function clip(base) {
  const info = await json(`${base}.json`), n = info.frames
  const src = (t) => `${base}/${String(Math.min(n, Math.max(1, Math.floor(t * info.fps) + 1))).padStart(4, '0')}.jpg`
  return { ...info, duration: n / info.fps, src, mark: (name) => info.marks[name] ?? 0 }
}

// Take time for scene time t, keyed to the narration by [sceneTime, mark] pairs (e.g. [N.cue('breath'), 'breath']):
// from each pair the take plays in real time, then holds the next mark's frame until that pair's scene time comes.
export function follow(c, t, pairs) {
  const k = pairs.map(([at, m]) => [at, c.mark(m)])
  const i = k.findLastIndex(([at]) => at <= t)
  if (i < 0) return Math.max(0, k[0][1] - (k[0][0] - t))
  const [at, m] = k[i], next = k[i + 1]
  return Math.min(m + (t - at), next ? next[1] : c.duration - 1 / c.fps)
}

// ---------- the fixed outros (outro/<name>.json, appended by `promo voice`) ----------

// Each platform's own buttons, in the order the outro says them (like, comment, share, save) and its follow button.
// [key, label, colour when tapped, svg (64×64)]; class .mark = drawn only once tapped.
const HEART = '<path d="M32 55C15 43 6 33 6 21.5 6 13.5 12 7.5 19.8 7.5c5 0 9.3 2.6 12.2 6.7 2.9-4.1 7.2-6.7 12.2-6.7C52 7.5 58 13.5 58 21.5 58 33 49 43 32 55Z"/>'
const ARROW = '<path d="M36 9 58 29.5 36 50V38.5C22 38.5 12.5 43 6 55c2-18 12.5-29.5 30-31.5Z"/>'
const CTA = {
  tiktok: { follow: ['<path d="M16 6v20M6 16h20"/>', 'Takip et'], buttons: [
    ['like', 'Beğen', '#fe2c55', HEART],
    ['comment', 'Yorumla', '#ffffff', '<path d="M32 8c15 0 26 9.5 26 21.5S47 51 32 51c-3 0-6-.4-8.6-1.2L12 56l2.6-10.2C9.3 41.9 6 36 6 29.5 6 17.5 17 8 32 8Z"/><g class="dots"><circle cx="21" cy="30" r="3.8"/><circle cx="32" cy="30" r="3.8"/><circle cx="43" cy="30" r="3.8"/></g>'],
    ['share', 'Paylaş', '#ffffff', ARROW],
    ['save', 'Kaydet', '#face15', '<path d="M17 6h30a5 5 0 0 1 5 5v47L32 45 12 58V11a5 5 0 0 1 5-5Z"/>']] },
  youtube: { follow: ['<path d="M16 4.5c-5 0-8.2 3.8-8.2 8.8v5.4L5 23h22l-2.8-4.3v-5.4c0-5-3.2-8.8-8.2-8.8ZM12.8 26.5a3.3 3.3 0 0 0 6.4 0"/>', 'Abone ol'], buttons: [
    ['like', 'Beğen', '#ffffff', '<path d="M21 27 30.5 7.5c4.2 0 7.3 3.4 6.6 7.8L35.6 25H51c4 0 7 3.6 6.2 7.5l-3.8 18.3c-.6 3-3.2 5.2-6.2 5.2H21ZM7 27h9v29H7Z"/>'],
    ['comment', 'Yorum', '#ffffff', '<path d="M13 9h38a7 7 0 0 1 7 7v25a7 7 0 0 1-7 7H25l-11 9v-9h-1a7 7 0 0 1-7-7V16a7 7 0 0 1 7-7Z"/><g class="dots"><rect x="17" y="21" width="30" height="5" rx="2.5"/><rect x="17" y="31" width="20" height="5" rx="2.5"/></g>'],
    ['share', 'Paylaş', '#ffffff', ARROW],
    ['save', 'Kaydet', '#ffffff', '<path class="line" d="M8 15h34M8 27h34M8 39h20"/><path class="line plus" d="M47 32v22M36 43h22"/><path class="line mark" d="M37 44l7 7 14-15"/>']] }
}

// The sign-off a cut ends with (N.outro: "tiktok" or "youtube"; X cuts have none): the four buttons rise in, each is
// tapped on its word ({outro-like} …), then the follow button ("Takip et" / "Abone ol", as wide as the row) pops on
// {outro-follow}. `lift` (the scene's end card, with no transform of its own) slides up by `liftBy` px and shrinks to
// `liftScale` to make room; `top` is where the row starts. Goes in before #sub. Returns render(t); a no-op when
// the narration has no "outro" line.
export function outroCta(parent, N, { lift, liftBy = 110, liftScale = .8, top = 860 } = {}) {
  if (!N.lines.some((l) => l.id === 'outro')) return () => {}
  const set = CTA[N.outro] ?? CTA.tiktok
  const el = document.createElement('div')
  el.id = 'cta'
  el.className = `cta-${N.outro ?? 'tiktok'}`
  el.style.top = `${top}px`
  el.innerHTML = `<div class="box"><div class="acts">${set.buttons.map(([k, label, c, svg]) => `<div class="act ${k}" style="--c:${c}"><div class="btn">` +
    `<i class="ring"></i>${k === 'like' ? '<b></b>'.repeat(8) : ''}<svg viewBox="0 0 64 64">${svg}</svg></div><span>${label}</span></div>`).join('')}</div>` +
    `<div class="follow"><svg viewBox="0 0 32 32">${set.follow[0]}</svg>${set.follow[1]}</div></div>`
  parent.insertBefore(el, document.getElementById('sub'))
  if (lift) lift.style.transformOrigin = '50% 0'
  const acts = [...el.querySelectorAll('.act')], follow = el.querySelector('.follow')
  const a = N.start('outro'), taps = set.buttons.map(([k]) => N.cue(`outro-${k}`)), f = N.cue('outro-follow')

  return (t) => {
    const k = p(t, a - .55, a + .15, E.inOut)
    if (lift) lift.style.transform = `translateY(${-liftBy * k}px) scale(${lerp(1, liftScale, k)})`
    el.style.opacity = p(t, a - .4, a)
    acts.forEach((n, j) => {
      const c = taps[j], d = (t - c) / .55
      n.style.opacity = p(t, a - .35 + j * .07, a + .05 + j * .07)
      n.style.transform = `translateY(${(1 - p(t, a - .35 + j * .07, a + .25 + j * .07, E.outBack)) * 46}px)`
      const press = clamp(1 - Math.abs(t - c) / .07), pop = t > c ? Math.sin(clamp((t - c) / .34) * Math.PI) : 0
      n.querySelector('.btn').style.transform = `scale(${1 - .1 * press + .16 * pop})`
      n.classList.toggle('on', t >= c)
      const ring = n.querySelector('.ring')
      ring.style.opacity = d > 0 && d < 1 ? (1 - d) * .9 : 0
      ring.style.transform = `scale(${lerp(.95, 1.4, E.out(clamp(d)))})`
      n.querySelectorAll('b').forEach((b, i) => {
        const ang = i / 8 * Math.PI * 2 - Math.PI / 2, r = lerp(40, 118, E.out(clamp(d)))
        b.style.opacity = d > 0 && d < 1 ? 1 - d : 0
        b.style.transform = `translate(${Math.cos(ang) * r}px, ${Math.sin(ang) * r}px) scale(${lerp(1, .4, clamp(d))})`
      })
    })
    const fk = p(t, f - .12, f + .38, E.outBack)
    follow.style.opacity = p(t, f - .12, f + .1)
    follow.style.transform = `scale(${lerp(.6, 1, fk) * (1 + (t > f + .5 ? .035 * Math.sin((t - f - .5) * 6) : 0))})`
  }
}
