#!/usr/bin/env node
// Engine of the promo-video skill (Claude runs it; it is not a command for the user):
//   node ~/.claude/skills/promo-video/engine/promo.mjs <command>
// Promo videos for an app from HTML scenes, with optional AI narration and word-synced subtitles.
// Works on the project in the current folder: one with promo.json (or promo/promo.json under it). See README.md.
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { availableParallelism, homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { KIT, launch, openScene, sceneSize, serve, sheet, stills, video } from './render.mjs'
import { appstore, check, cover, outroOf, publish, script } from './tools.mjs'
import { ios } from './ios.mjs'
import { doctor, key, PYTHON, setup, storedKey } from './setup.mjs'

const HELP = `promo.mjs — promo videos from HTML scenes, optionally narrated

  doctor                     what this machine is missing (Node, Chrome, ffmpeg, uv, Whisper, the Gemini key)
  setup                      install what is missing (Homebrew formulas, npm, uv Python, Whisper model) and ask for the key
  key [--clipboard|--check]  store the Gemini key (hidden dialog / prompt, or the clipboard); --check tests the stored one

  new [dir]                  start a project in dir (default ./promo): promo.json, scenes/, frames/ (never overwrites)
  capture                    run promo.json "capture" (a script that writes frames/, e.g. ./film.sh)
  voices                     the Gemini voices
  voice [--lines 0,2]        narrate the script → narration/<voice>/ (only changed lines are re-synthesized);
                             --lines: just those lines → narration/<voice>/sample.mp3 (several --voice a,b to compare)
  preview <format> [t,…]     stills → shots/<format>/ and one sheet.png (default: one per script line, or every 2 s)
  play <format>              the scene live in Chrome, with its narration (for the user to watch)
  render [format|all]        → out/<slug>-<format>.mp4, copied to promo.json "output"
  script                     the narration as the approval message (numbered plain lines, seconds, "screen" notes)
  check [format|all]         after render: size, fps, pix_fmt, range, loudness, â/î/û on screen, a sheet of 6 frames
  cover [--again]            promo.json "cover" → <output>/thumbnails/<slug>-short-thumb.jpg (--again: new background)
  publish                    promo.json "publish" → <output>/yayin-metinleri.txt (YouTube Shorts, TikTok, X)
  appstore <id|bundleId>     icon.png, frames/appstore/*.png and appstore.json of a published App Store app
  ios build | record [take…] iPhone app (promo.json "ios"): copy + build for the Simulator, film takes the app's
                             PromoDirector drives → frames/ios/<take>/*.jpg + <take>.json (marks); see ios.mjs

  --voice <name>   use another voice than promo.json's     --jobs <n>   parallel render pages (default ${defaultJobs()})
  --fps <n>        frame rate (default: the format's, or 60)    --png        lossless frames (slower render)
`

function defaultJobs() { return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))) }
const fail = (msg) => { console.error(`promo: ${msg}`); process.exit(1) }

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { voice: { type: 'string' }, lines: { type: 'string' }, jobs: { type: 'string' }, fps: { type: 'string' }, png: { type: 'boolean' }, again: { type: 'boolean' }, clipboard: { type: 'boolean' }, check: { type: 'boolean' }, country: { type: 'string' }, help: { type: 'boolean', short: 'h' } }
})
const [cmd, ...args] = positionals
if (!cmd || opt.help || cmd === 'help') { console.log(HELP); process.exit(0) }

function findProject() {
  for (let d = process.cwd(); ; d = dirname(d)) {
    for (const dir of [d, join(d, 'promo')]) if (existsSync(join(dir, 'promo.json'))) return dir
    if (dirname(d) === d) fail('no promo.json in this folder or above it (`new` starts a project)')
  }
}

function load() {
  const root = findProject()
  let cfg
  try { cfg = JSON.parse(readFileSync(join(root, 'promo.json'), 'utf8')) } catch (e) { fail(`promo.json: ${e.message}`) }
  cfg.slug ??= cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { root, cfg }
}

function format(cfg, name) {
  const f = cfg.formats?.[name]
  if (!f) fail(`no format "${name}" in promo.json (formats: ${Object.keys(cfg.formats ?? {}).join(', ')})`)
  return { ...f, name, fps: Number(opt.fps ?? f.fps ?? 60), outro: outroOf(cfg, name) }
}

// The voice step runs under uv with the arm64 interpreter: MLX (Whisper) needs it, and uv may be an x86_64 build.
function voice(root, extra = []) {
  if (!storedKey()) fail('no Gemini API key: `promo.mjs key` asks the user for it (or `setup` for everything)')
  const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--python', PYTHON, '--with', 'mlx-whisper',
    join(KIT, 'voice.py'), ...extra], { cwd: root, stdio: 'inherit' })
  if (r.error) fail(`uv: ${r.error.message} (\`promo.mjs setup\` installs it)`)
  if (r.status !== 0) process.exit(r.status ?? 1)
}

// The narration a format follows, brought up to date with the script; null for silent formats.
function narrate(root, cfg, f) {
  if (!f.voice) return null
  const name = opt.voice ?? cfg.voice?.voice
  if (!name) fail('promo.json has no voice.voice')
  voice(root, [root, '--voice', name])
  return name
}

// a format's narration: words.json / voice.wav, or words.<outro>.json / voice.<outro>.wav when it ends with an outro
const cut = (f) => (f.outro ? `.${f.outro}` : '')
const sceneURL = (server, f, v) => `${server.url}/${f.scene}${v ? `?voice=${encodeURIComponent(v)}${f.outro ? `&outro=${f.outro}` : ''}` : ''}`
const expand = (p) => p.replace(/^~(?=$|\/)/, homedir())
const mb = (file) => (statSync(file).size / 1e6).toFixed(1)

async function preview(root, cfg, f, times) {
  const v = narrate(root, cfg, f)
  const size = sceneSize(join(root, f.scene))
  const server = await serve(root), browser = await launch()
  try {
    const page = await openScene(browser, sceneURL(server, f, v), size)
    const duration = await page.evaluate(() => window.DURATION)
    if (!times) {
      if (v) {  // a little into each line, where its visuals should be up
        const words = JSON.parse(readFileSync(join(root, 'narration', v, `words${cut(f)}.json`), 'utf8'))
        times = words.lines.map((l) => l.start + Math.min(.8, l.words.at(-1).end / 2))
      } else times = Array.from({ length: Math.ceil(duration / 2) }, (_, i) => i * 2 + 1).filter((t) => t < duration)
    }
    const dir = join(root, 'shots', f.name)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const files = await stills(page, times, dir)
    const out = join(dir, 'sheet.png'), portrait = size.height > size.width
    await sheet(browser, server, files.map((x) => relative(root, x)), times.map((t) => `${t.toFixed(2)} s`), out,
      { cols: Math.min(times.length, portrait ? 6 : 4), width: portrait ? 270 : 460 })
    console.log(`${files.length} stills → ${relative(process.cwd(), dir)}/\n${relative(process.cwd(), out)}`)
  } finally {
    await browser.close(); server.close()
  }
}

async function render(root, cfg, f) {
  const v = narrate(root, cfg, f)
  mkdirSync(join(root, 'out'), { recursive: true })
  const out = join(root, 'out', `${cfg.slug}-${f.name}.mp4`), picture = v ? join(root, 'out', `.${f.name}-picture.mp4`) : out
  const server = await serve(root), browser = await launch()
  console.log(`${f.name}: ${f.scene}${v ? ` + ${v}${f.outro ? ` + ${f.outro} outro` : ''}` : ''}`)
  let r
  try {
    r = await video(browser, sceneURL(server, f, v), sceneSize(join(root, f.scene)), { fps: f.fps, jobs: Number(opt.jobs ?? defaultJobs()), png: opt.png, out: picture })
  } finally {
    await browser.close(); server.close()
  }
  if (v) {
    const mux = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', picture, '-i', join(root, 'narration', v, `voice${cut(f)}.wav`),
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' })
    if (mux.status !== 0) fail('ffmpeg could not add the narration')
    rmSync(picture)
  }
  console.log(`→ ${relative(process.cwd(), out)}  (${r.duration.toFixed(2)} s, ${r.frames} frames, ${mb(out)} MB, rendered in ${r.seconds.toFixed(0)} s)`)
  if (cfg.output) {
    const dir = expand(cfg.output)
    mkdirSync(dir, { recursive: true })
    copyFileSync(out, join(dir, basename(out)))
    console.log(`  copied to ${join(dir, basename(out))}`)
  }
}

async function play(root, cfg, f) {
  const v = narrate(root, cfg, f)
  const server = await serve(root)
  const q = new URLSearchParams({ scene: `/${f.scene}`, ...(v ? { voice: v } : {}), ...(v && f.outro ? { outro: f.outro } : {}) })
  const url = `${server.url}/promokit/player.html?${q}`
  const chrome = spawnSync('open', ['-a', 'Google Chrome', url])
  if (chrome.status !== 0) spawnSync('open', [url])
  console.log(`${url}\nplaying ${f.scene}${v ? ` with ${v}` : ''}: reload the page after editing the scene. Ctrl+C to stop.`)
  await new Promise(() => {})
}

function scaffold(dir) {
  const dest = resolve(dir ?? 'promo')
  if (existsSync(join(dest, 'promo.json'))) fail(`${dest} already has a promo.json`)
  const name = basename(basename(dest) === 'promo' ? dirname(dest) : dest).replace(/(^|[-_ ])(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase())
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const tpl = join(KIT, 'templates', 'project'), written = []
  for (const rel of readdirSync(tpl, { recursive: true })) {
    const from = join(tpl, rel), to = join(dest, rel)
    if (statSync(from).isDirectory() || existsSync(to)) continue  // never overwrite what is already there
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, readFileSync(from, 'utf8').replaceAll('{{name}}', name).replaceAll('{{slug}}', slug))
    written.push(rel)
  }
  console.log(`${name} → ${relative(process.cwd(), dest) || '.'}/: ${written.sort().join(', ')}`)
}

const { root, cfg } = ['new', 'voices', 'doctor', 'setup', 'key'].includes(cmd) ? {} : load()
const formats = (name) => (!name || name === 'all' ? Object.keys(cfg.formats ?? {}) : [name]).map((n) => format(cfg, n))

switch (cmd) {
  case 'doctor': process.exit(doctor() ? 0 : 1)
  case 'setup': process.exit((await setup()) ? 0 : 1)
  case 'key': process.exit((await key({ clipboard: opt.clipboard, check: opt.check })) ? 0 : 1)
  case 'new': scaffold(args[0]); break
  case 'voices': voice(process.cwd(), ['--list']); break
  case 'capture': {
    if (!cfg.capture) fail('promo.json has no "capture" script: make frames/ as SKILL.md describes')
    const r = spawnSync(cfg.capture, { cwd: root, shell: true, stdio: 'inherit' })
    process.exit(r.status ?? 1)
  }
  case 'voice':
    voice(root, [root, '--voice', opt.voice ?? cfg.voice?.voice ?? 'sadachbia', ...(opt.lines ? ['--lines', opt.lines] : [])])
    break
  case 'preview':
    if (!args[0]) fail('which format? promo preview <format> [t,t,…]')
    await preview(root, cfg, format(cfg, args[0]), args[1]?.split(',').map(Number))
    break
  case 'play':
    if (!args[0]) fail('which format? promo play <format>')
    await play(root, cfg, format(cfg, args[0]))
    break
  case 'render':
    for (const f of formats(args[0])) await render(root, cfg, f)
    break
  case 'script': script(cfg); break
  case 'check': {
    let ok = true
    for (const f of formats(args[0])) ok = check(root, cfg, f) !== false && ok
    process.exit(ok ? 0 : 1)
  }
  case 'cover': await cover(root, cfg, { again: opt.again }); break
  case 'publish': publish(root, cfg); break
  case 'ios': await ios(root, cfg, args[0], args.slice(1)); break
  case 'appstore':
    if (!args[0]) fail('which app? promo appstore <id|bundleId> [--country tr]')
    await appstore(root, args[0], opt.country ?? 'tr')
    break
  default: fail(`unknown command ${cmd}\n\n${HELP}`)
}
