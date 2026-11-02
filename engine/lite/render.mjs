// Renders the scene frame by frame in headless Chrome and pipes PNGs to ffmpeg.
// node render.mjs preview 0.5,2.3,...   → shots/p_<t>.png
// node render.mjs video out.mp4 [fps]   → JOBS Chrome processes (default 4) each encode a slice of the frames, then the slices are joined
//                                         (one browser per job: pages inside one browser share its main process and do not scale)
//                                         FROM / TO (frame numbers, TO exclusive) render only part of the timeline
// node render.mjs sfx                  → the scene's [[time, name], …] sound cues as JSON
// SIZE=1080x1920 PAGE='compose-tiktok.html?voice=…' for the vertical cut
import { createReadStream, statSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { extname, join, resolve } from 'node:path'

const root = import.meta.dirname
const require = createRequire(join(import.meta.dirname, 'package.json'))
const { chromium } = require('playwright-core')
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }
const server = createServer((req, res) => {
  const file = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!file.startsWith(root)) return res.writeHead(403).end()
  try { statSync(file) } catch { return res.writeHead(404).end() }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const browsers = []
const [W, H] = (process.env.SIZE ?? '1920x1080').split('x').map(Number)
async function open() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  browsers.push(browser)
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.error('page error', e))
  await page.goto(`http://127.0.0.1:${server.address().port}/${process.env.PAGE ?? 'compose.html'}`)
  await page.evaluate(() => window.ready)
  await page.evaluate(() => document.fonts.ready)
  return page
}
const run = (args) => new Promise((r, j) => spawn('ffmpeg', args, { stdio: 'inherit' }).on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))))

const [mode, arg, fpsArg] = process.argv.slice(2)
try {
  const page = await open()
  if (mode === 'sfx') {
    console.log(JSON.stringify(await page.evaluate(() => window.SFX ?? [])))
  } else if (mode === 'preview') {
    for (const t of arg.split(',').map(Number)) {
      await page.evaluate((t) => window.renderAt(t), t)
      await page.screenshot({ path: join(root, 'shots', `p_${t.toFixed(2)}.png`) })
    }
  } else {
    const fps = Number(fpsArg ?? 60), total = Math.round(((await page.evaluate(() => window.DURATION)) ?? 10) * fps)
    const from = Number(process.env.FROM ?? 0), to = Math.min(total, Number(process.env.TO ?? total))
    const jobs = Math.max(1, Math.min(Number(process.env.JOBS ?? 4), to - from))
    const out = resolve(arg), parts = Array.from({ length: jobs }, (_, i) => `${out}.part${i}.mp4`)
    const pages = [page, ...(await Promise.all(Array.from({ length: jobs - 1 }, open)))]
    const t0 = Date.now()
    let done = 0
    await Promise.all(pages.map(async (pg, i) => {
      const a = from + Math.floor((to - from) * i / jobs), b = from + Math.floor((to - from) * (i + 1) / jobs)
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
        // RGB → limited-range BT.709 explicitly (ffmpeg's default matrix is BT.601 while the file says BT.709)
        '-vf', 'format=gbrp,scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', parts[i]], { stdio: ['pipe', 'inherit', 'inherit'] })
      for (let f = a; f < b; f++) {
        await pg.evaluate((t) => window.renderAt(t), f / fps)
        const buf = await pg.screenshot({ type: 'png' })
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
        if (++done % 300 === 0) console.log(`frame ${done}/${to - from} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
      }
      ff.stdin.end()
      await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))))
    }))
    // the slices share every encoder setting, so they join without re-encoding
    writeFileSync(`${out}.list`, parts.map((f) => `file '${f}'`).join('\n'))
    await run(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${out}.list`, '-c', 'copy', '-movflags', '+faststart', out])
    for (const f of [...parts, `${out}.list`]) rmSync(f)
    console.log(`${to - from} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
} finally {
  await Promise.all(browsers.map((b) => b.close())); server.close()
}
