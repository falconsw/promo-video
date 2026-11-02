// The parts of a promo that are the same for every app, so they need no thinking (or tokens) per project:
// the approval text of the script, the post-render checks, the Shorts cover, the publishing notes and App Store assets.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { launch, sceneSize } from './render.mjs'
import { storedKey } from './setup.mjs'

const expand = (p) => p.replace(/^~(?=$|\/)/, homedir())
const CIRCUMFLEX = /[âîûÂÎÛ]/
// The user never wants â/î/û written anywhere; in the script they are only pronunciation hints for the voice.
export const plain = (s) => s.replace(/[âîûÂÎÛ]/g, (c) => ({ â: 'a', î: 'i', û: 'u', Â: 'A', Î: 'İ', Û: 'U' })[c])
const spoken = (text) => text.replace(/\{[\w-]+\}/g, '').replace(/\s+/g, ' ').trim()
const outputDir = (root, cfg) => (cfg.output ? expand(cfg.output) : join(root, 'out'))

function geminiKey() {
  const key = storedKey()
  if (!key) throw new Error('no Gemini API key: `promo.mjs key` asks the user for it')
  return key
}

// ── script: the approval message, ready to paste ───────────────────────────────────────────────────────────────
// A line's optional "screen" (what is on screen meanwhile) is not spoken; it only goes into this message.
// The fixed sign-off a format ends with (outro/<name>.json, voice.py appends it): the one named like the format
// (tiktok, youtube) or in its "outro" field; null for none (x, "outro": false).
const OUTRO = new URL('./outro/', import.meta.url)
export function outroOf(cfg, name) {
  const f = cfg.formats?.[name] ?? {}, o = f.outro ?? name
  return cfg.outro === false || !f.voice || !o || !existsSync(new URL(`${o}.json`, OUTRO)) ? null : o
}
const outroText = (o) => JSON.parse(readFileSync(new URL(`${o}.json`, OUTRO), 'utf8'))

export function script(cfg) {
  const lines = cfg.script ?? []
  let total = 0
  const out = lines.map((l, i) => {
    // "5-4-3-2-1" is read as five words
    const text = spoken(l.text), words = text.split(' ').reduce((n, w) => n + (/^\d+(-\d+)+[.,]?$/.test(w) ? w.split('-').length : 1), 0)
    const secs = words / 2.5 + (l.gap ?? 0.3)
    total += secs
    return `${i + 1}. ${plain(text)}  (≈${secs.toFixed(1)} sn)${l.screen ? `\n   Ekranda: ${plain(l.screen)}` : ''}`
  })
  // the fixed sign-offs are already approved: listed so the user sees how each cut ends, not to approve again
  const ends = Object.keys(cfg.formats ?? {}).filter((k) => cfg.formats[k].voice)
    .map((k) => { const o = outroOf(cfg, k); return `   ${k}: ${o ? plain(spoken(outroText(o).text)) : 'kapanış yok'}` })
  if (ends.length) out.push(`Sabit kapanış (onaylı, her videoda aynı kayıt):\n${ends.join('\n')}`)
  const hints = lines.flatMap((l) => spoken(l.text).split(' ').filter((w) => CIRCUMFLEX.test(w)))
  console.log(out.join('\n'))
  console.log(`\nToplam ≈ ${Math.round(total + (cfg.voice?.tail ?? 1.6))} sn, ${lines.length} satır.`)
  if (hints.length) console.log(`Telaffuz ipucu (yazıda şapkasız görünür): ${hints.join(', ')}`)
}

// ── check: what used to be four hand-run commands after every render ─────────────────────────────────────────────
export function check(root, cfg, f) {
  const file = join(root, 'out', `${cfg.slug}-${f.name}.mp4`)
  if (!existsSync(file)) return console.log(`${f.name}: ${relative(process.cwd(), file)} yok, önce render`)
  const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).stdout)
  const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio')
  const size = sceneSize(join(root, f.scene)), [n, d] = v.r_frame_rate.split('/').map(Number), fps = n / d
  const rows = [
    [`${v.width}×${v.height}`, v.width === size.width && v.height === size.height],
    [`${fps.toFixed(2)} fps`, Math.abs(fps - f.fps) < 0.01],
    [v.pix_fmt, v.pix_fmt === 'yuv420p'],
    [`range ${v.color_range ?? '?'}`, v.color_range === 'tv'],
    // all three must be tagged, or re-encoders (WhatsApp) guess and wash the colours out
    [`bt709 ${v.color_primaries ?? '?'}/${v.color_transfer ?? '?'}/${v.color_space ?? '?'}`,
      [v.color_primaries, v.color_transfer, v.color_space].every((c) => c === 'bt709')],
    [`${Number(probe.format.duration).toFixed(2)} s`, true]
  ]
  if (f.voice) {
    const r = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
    const lufs = Number(r.stderr.match(/Integrated loudness:\s+I:\s+(-?[\d.]+)/)?.[1])
    rows.push([`${a?.codec_name ?? 'ses yok'} ${a ? Math.round(a.bit_rate / 1000) + 'k' : ''}`, a?.codec_name === 'aac'])
    rows.push([`${lufs} LUFS`, Math.abs(lufs + 14) <= 1.5])
  }
  // six frames of the actual mp4 in one sheet, to look at once
  const dir = join(root, 'shots', f.name), sheetFile = join(dir, 'check.png'), dur = Number(probe.format.duration)
  mkdirSync(dir, { recursive: true })
  const fpsPick = (6 / dur).toFixed(4)
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `fps=${fpsPick},scale=${size.height > size.width ? 270 : 480}:-2,tile=6x1`, '-frames:v', '1', sheetFile])
  // â/î/û anywhere that ends up on screen (the script may keep them as voice hints: voice.py strips its subtitles)
  const visible = [readFileSync(join(root, f.scene), 'utf8'), JSON.stringify({ ...cfg, script: undefined })]
  const marks = [...new Set(visible.join('\n').match(/\S*[âîûÂÎÛ]\S*/g) ?? [])]
  console.log(`${f.name}: ${rows.map(([t, ok]) => (ok ? t : `✗ ${t}`)).join(' · ')}`)
  if (marks.length) console.log(`  ✗ şapkalı harf ekranda/metinde: ${marks.slice(0, 8).join(' ')}`)
  console.log(`  kareler: ${relative(process.cwd(), sheetFile)}`)
  return rows.every(([, ok]) => ok) && !marks.length
}

// ── cover: the Shorts thumbnail, same look every time ───────────────────────────────────────────────────────────
// promo.json "cover": { "pill": "iPhone uygulaması", "lines": ["STRESİ", "HALA TEK BAŞINA MI", "YÖNETİYORSUN?"],
//                       "scene": "what the developer character is doing (English)", "image": "optional own background" }
// The title is always a complete question with a verb, never a fragment (the user's rule).
const ART = 'Light anime illustration with clean line art and soft cel shading. A young software developer with short dark hair and a dark hoodie '
const LOOK = ' Cool blue and purple room lighting with a warm golden glow from the screens. Vertical 9:16 YouTube Shorts cover illustration. ' +
  'Keep the top third of the frame calm and dark (deep navy night sky or wall) so a big title can be placed there later. ' +
  'Absolutely no text, letters, numbers, logos or watermarks anywhere in the image; the screens show only abstract glowing shapes and lines.'

async function background(c, dir, again) {
  if (c.image) return c.image
  const prompt = ART + c.scene.trim() + LOOK
  const file = join(dir, `bg-${createHash('sha1').update(prompt).digest('hex').slice(0, 8)}.jpeg`)
  if (existsSync(file) && !again) return file
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16', imageSize: '2K' } } }
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey() }, body: JSON.stringify(body)
  })
  const d = await r.json()
  const part = d.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part) throw new Error(`no image from Gemini: ${JSON.stringify(d).slice(0, 300)}`)
  writeFileSync(file, Buffer.from(part.inlineData.data, 'base64'))
  return file
}

// Cover accent = the subtitle highlight of the video's backdrop (user, 2026-10-31): same values as promokit's BACKDROPS `hi`.
export const COVER_HI = { blue: '#aab6ff', yellow: '#ffe08a', green: '#a6f0c4', red: '#ffb4a6', orange: '#ffd0a1' }
export function coverHi(root, cfg) {
  const want = cfg.cover?.color
  if (want) return COVER_HI[want] ?? want
  for (const f of Object.values(cfg.formats ?? {})) {
    if (!f.scene || !existsSync(join(root, f.scene))) continue
    const m = readFileSync(join(root, f.scene), 'utf8').match(/BACKDROPS\.(?:portrait|landscape)(Yellow|Green|Red|Orange)?\b/)
    if (m) return COVER_HI[(m[1] ?? 'blue').toLowerCase()]
  }
  return COVER_HI.blue
}

export async function cover(root, cfg, { again = false } = {}) {
  const c = cfg.cover
  if (!c?.lines?.length || (!c.scene && !c.image)) throw new Error('promo.json needs "cover": { "pill", "lines": [3 lines], "scene" or "image" }')
  const dir = join(outputDir(root, cfg), 'thumbnails')
  mkdirSync(dir, { recursive: true })
  const bg = await background(c, dir, again)
  if (c.image) copyFileSync(join(root, bg), join(dir, basename(bg)))
  const up = (s) => plain(s).toLocaleUpperCase('tr')
  const cls = (i) => ['l', i === 0 && 'l1', i === c.lines.length - 1 && 'l2'].filter(Boolean).join(' ')
  const lines = c.lines.map((l, i) => `<div class="${cls(i)}">${up(l)}</div>`).join('')
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#0b0f1e;font-family:'Bricolage Grotesque',sans-serif}
img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;left:0;right:0;top:0;height:900px;background:linear-gradient(#0b0c1ef2 0%,#0b0c1ecc 45%,#0b0c1e00 100%)}
.t{position:absolute;left:60px;right:60px;top:190px;text-align:center}
.pill{display:inline-block;background:#FFC23A;color:#111318;font-weight:800;font-size:46px;letter-spacing:2px;padding:12px 30px;border-radius:999px}
.l{white-space:nowrap;font-weight:800;font-size:176px;line-height:.98;letter-spacing:-3px;color:#F5F2EA;text-shadow:0 6px 30px #000a}
.l1{margin-top:34px}.l2{color:${coverHi(root, cfg)}}
</style></head><body><img src="${basename(bg)}"><div class="shade"></div>
<div class="t">${c.pill ? `<div class="pill">${plain(c.pill)}</div>` : ''}${lines}</div>
<script>document.fonts.ready.then(()=>{let s=176;const ls=[...document.querySelectorAll('.l')];while(s>90&&ls.some(e=>e.scrollWidth>960)){s-=4;ls.forEach(e=>e.style.fontSize=s+'px')}window.done=1})</script>
</body></html>`
  const htmlFile = join(dir, 'cover.html'), out = join(dir, `${cfg.slug}-short-thumb.jpg`)
  writeFileSync(htmlFile, html)
  const browser = await launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
    await page.goto('file://' + htmlFile)
    await page.waitForFunction(() => window.done, null, { timeout: 20000 })
    await page.screenshot({ path: out, type: 'jpeg', quality: 92 })
  } finally { await browser.close() }
  console.log(`kapak → ${out}\n  arka plan: ${basename(bg)}${again ? ' (yeniden üretildi)' : ''}`)
  return out
}

// ── publish: yayin-metinleri.txt with the settings the user always uses ─────────────────────────────────────────
// promo.json "publish": { "date": "2026-10-28 20:00", "title": "...", "description": "...", "tiktok": "...",
//   "hashtags": ["#..."], "links": { "App Store": "https://..." }, "note": "optional disclaimer",
//   "x": "main post (video uploaded, no link)", "x_date": "2026-11-01 11:00", "x_reason": "why that slot", "x_reply": "...",
//   "x_handle": "@you" (optional, shown in the X header) }
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
function when(s) {
  const [d, t] = s.split(' '), [y, m, day] = d.split('-').map(Number), wd = DAYS[new Date(y, m - 1, day).getDay()]
  return { long: `${day} ${MONTHS[m - 1]} ${y} ${wd} ${t}`, short: `${day} ${MONTHS[m - 1].slice(0, 3)} ${y}, ${t}`, day: `${day} ${MONTHS[m - 1].slice(0, 3)} ${y} ${wd}, ${t}` }
}

export function publish(root, cfg) {
  const p = cfg.publish
  if (!p?.date || !p.title) throw new Error('promo.json needs "publish": { "date": "YYYY-MM-DD HH:MM", "title", "description", "tiktok", "hashtags", "links" }')
  const w = when(p.date), slug = cfg.slug, thumb = `thumbnails/${slug}-short-thumb.jpg`
  const tags = (p.hashtags ?? []).join(' '), links = Object.entries(p.links ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')
  // each platform has its own cut when promo.json has a format for it (tiktok / youtube / x: their own outro)
  const fmt = Object.keys(cfg.formats ?? {}).find((k) => cfg.formats[k].voice) ?? 'tiktok'
  const video = (k) => `Video: ${slug}-${cfg.formats?.[k] ? k : fmt}.mp4`
  const parts = [
    `YAYIN: ${w.long} (Türkiye saati)`, `Kapak: ${thumb}`, '',
    '================ YOUTUBE SHORTS ================', video('youtube'), '', 'Başlık:', p.title, '', 'Açıklama:', p.description, '',
    links, ...(p.note ? ['', p.note] : []), '', tags, '',
    'Ayarlar:', `- Küçük resim: ${thumb}`, '- Çocuklar için yapılmadı', '- Değiştirilmiş veya yapay içerik (AI): Evet (Gemini sesi)',
    '- Kategori: Bilim ve Teknoloji', `- Görünürlük: Planla > ${w.short}, saat dilimi "(GMT+0300) Yerel Saat"`, '',
    '================ TIKTOK ================', video('tiktok'), '', 'Açıklama:', `${p.tiktok ?? p.description}`, tags, '',
    'Ayarlar:', `- Kapak: Kapağı düzenle > Yükle > ${thumb}`, '- AI-generated content: Açık', '- Disclose post content: Kapalı',
    '- Otomatik içerik kontrolleri önerisi çıkarsa: İptal', `- When to post: Schedule > ${w.short}`
  ]
  if (p.x) {
    const x = when(p.x_date ?? p.date)
    parts.push('', `================ X${p.x_handle ? ` (${p.x_handle})` : ''} ================`, video('x'), '', 'Ana gönderi (video doğrudan yüklenir, link yok):', p.x, '',
      'İlk yanıt (zincir):', p.x_reply ?? links, '',
      'Ayarlar:', '- Content disclosure › Made with AI: Açık (metinden ÖNCE aç)', `- Schedule › ${x.day}${p.x_reason ? ` (${p.x_reason})` : ''}`)
  }
  const text = plain(parts.join('\n')) + '\n'
  const dir = outputDir(root, cfg), file = join(dir, 'yayin-metinleri.txt')
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, text)
  console.log(`yayın metinleri → ${file}`)
}

// ── appstore: icon, screenshots and listing of a published App Store app ────────────────────────────────────────
export async function appstore(root, id, country = 'tr') {
  const q = /^\d+$/.test(id) ? `id=${id}` : `bundleId=${encodeURIComponent(id)}`
  const d = await (await fetch(`https://itunes.apple.com/lookup?${q}&country=${country}`)).json()
  const a = d.results?.[0]
  if (!a) throw new Error(`App Store'da bulunamadı: ${id} (${country})`)
  const big = (u, size) => u.replace(/\/[^/]+$/, `/${size}`)
  const get = async (u, file) => writeFileSync(file, Buffer.from(await (await fetch(u)).arrayBuffer()))
  if (!existsSync(join(root, 'icon.png'))) await get(big(a.artworkUrl512, '1024x1024bb.png'), join(root, 'icon.png'))
  const dir = join(root, 'frames', 'appstore')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const shots = [...(a.screenshotUrls ?? []), ...(a.ipadScreenshotUrls ?? [])]
  await Promise.all(shots.map((u, i) => get(big(u, '1290x2796bb.png'), join(dir, `${String(i + 1).padStart(2, '0')}.png`))))
  const info = { name: a.trackName, id: a.trackId, url: a.trackViewUrl.split('?')[0], version: a.version, released: a.currentVersionReleaseDate,
    price: a.formattedPrice, genre: a.primaryGenreName, rating: a.averageUserRating, ratings: a.userRatingCount, languages: a.languageCodesISO2A,
    minimumOs: a.minimumOsVersion, description: a.description, releaseNotes: a.releaseNotes }
  writeFileSync(join(root, 'appstore.json'), JSON.stringify(info, null, 2))
  console.log(`${info.name} ${info.version} (${info.price}, ${info.genre}) ${info.url}\n  icon.png, ${shots.length} ekran görüntüsü → frames/appstore/, bilgiler → appstore.json`)
  return info
}

export const listFrames = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort() : [])
