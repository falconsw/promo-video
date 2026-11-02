// Serving a project, opening its scenes in headless Chrome and turning them into stills and video.
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { extname, join, resolve, sep } from 'node:path'

export const KIT = import.meta.dirname
const require = createRequire(join(KIT, 'package.json'))
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf'
}

// The project at /, the promokit runtime at /promokit/. Never cached, so the player picks up edits on reload.
export async function serve(root) {
  const runtime = join(KIT, 'runtime')
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const [base, rel] = path.startsWith('/promokit/') ? [runtime, path.slice('/promokit/'.length)] : [root, path.slice(1)]
    const file = resolve(base, rel)
    if (file !== base && !file.startsWith(base + sep)) return res.writeHead(403).end()
    try { if (!statSync(file).isFile()) throw 0 } catch { return res.writeHead(404).end() }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

// <meta name="size" content="1080x1920"> of a scene file
export function sceneSize(file) {
  const m = readFileSync(file, 'utf8').match(/<meta\s+name="size"\s+content="(\d+)x(\d+)"/)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1920, height: 1080 }
}

export async function launch() {
  const { chromium } = require('playwright-core')
  return chromium.launch({ channel: 'chrome', headless: true })
}

// A scene in its own context (its own renderer process, so several render in parallel), ready to draw.
export async function openScene(browser, url, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url)
  try {
    await page.waitForFunction(() => window.ready !== undefined, null, { timeout: 15000 })
    await page.evaluate(() => window.ready)
  } catch (e) {
    throw new Error(`${url} did not get ready: ${[...errors, e.message.split('\n')[0]].join('\n  ')}`)
  }
  return page
}

const pad = (t) => t.toFixed(2).padStart(6, '0')

// One PNG per time into dir/t_<time>.png
export async function stills(page, times, dir) {
  const files = []
  for (const t of times) {
    await page.evaluate((t) => window.renderAt(t), t)
    const file = join(dir, `t_${pad(t)}.png`)
    await page.screenshot({ path: file })
    files.push(file)
  }
  return files
}

// The stills side by side with their times, as one PNG (served from the project, so paths are project-relative).
export async function sheet(browser, server, files, labels, out, { cols, width }) {
  const context = await browser.newContext({ viewport: { width: cols * (width + 12) + 12, height: 400 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const q = new URLSearchParams({ files: files.join(','), labels: labels.join(','), cols, w: width })
  await page.goto(`${server.url}/promokit/sheet.html?${q}`)
  await page.evaluate(() => window.ready)
  await page.screenshot({ path: out, fullPage: true })
  await context.close()
}

// Renders every frame with `jobs` pages working on interleaved frames and one ffmpeg encoding them in order. Each extra
// page gets its own Chrome: pages of one browser all wait on its main process (~3× faster).
// Frames travel as JPEG q100: Chrome encodes PNG about 5× slower and mostly on one thread, and x264's 4:2:0
// costs more than the JPEG step does (SSIM ≈ 0.997 either way). png: true for lossless frames anyway.
export async function video(browser, url, size, { fps = 60, jobs = 4, png = false, out, log = console.log }) {
  const first = await openScene(browser, url, size)
  const duration = await first.evaluate(() => window.DURATION)
  const total = Math.round(duration * fps)
  jobs = Math.max(1, Math.min(jobs, Math.floor(total / fps)))
  const extra = await Promise.all(Array.from({ length: jobs - 1 }, () => launch()))
  const pages = [first, ...await Promise.all(extra.map((b) => openScene(b, url, size)))]

  // JPEG frames are full-range BT.601: going through RGB lands them on limited-range BT.709 with the colours
  // a PNG frame gets (scaling the YUV directly drifts dark blues by 3–4 levels). The scaler leaves primaries and
  // transfer unset on every frame, which overrides -color_primaries/-color_trc: setparams and the x264 VUI write
  // them for real (with "unknown" there, WhatsApp's re-encode washed the colours out, 2026-11-02)
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-vf', 'format=gbrp,scale=out_color_matrix=bt709:out_range=tv,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high',
    '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] })
  const encoded = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited with ${c}`)))))

  const ready = new Map(), waiting = []
  let next = 0, shown = 0
  const t0 = Date.now()
  async function write(i, png) {
    ready.set(i, png)
    while (ready.has(next)) {
      const buf = ready.get(next)
      ready.delete(next)
      next++
      for (const w of waiting.splice(0)) w()
      if (next - shown >= fps * 2 || next === total) {
        shown = next
        log(`  frame ${next}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`)
      }
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    }
  }
  try {
    await Promise.all(pages.map(async (page, j) => {
      for (let i = j; i < total; i += jobs) {
        while (i - next > jobs * 4) await new Promise((r) => waiting.push(r))  // don't run far ahead of the encoder
        await page.evaluate((t) => window.renderAt(t), i / fps)
        await write(i, await page.screenshot(png ? { type: 'png' } : { type: 'jpeg', quality: 100 }))
      }
    }))
  } catch (e) {
    ff.kill('SIGKILL')
    encoded.catch(() => {})
    throw e
  } finally {
    await Promise.all(pages.map((p) => p.context().close()))
    await Promise.all(extra.map((b) => b.close()))
  }
  ff.stdin.end()
  await encoded
  return { duration, frames: total, seconds: (Date.now() - t0) / 1000 }
}
