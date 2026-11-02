// iPhone apps: build a copy of the app for the Simulator and film "takes" of it driving itself.
// The same for every iOS app; only the app's PromoDirector (which screens, in which order) is per project.
//
// promo.json "ios": {
//   "source": "..",                    the app repo, copied to promo/src before every build (the repo is never touched)
//   "prepare": "./prepare.sh",          optional, runs after the copy: patch the copy, add Promo/, xcodegen generate
//   "project": "src/App.xcodeproj",     or "workspace"
//   "scheme": "App", "bundle": "com.you.app",
//   "device": "iPhone 16 Pro", "language": "tr", "appearance": "light", "clock": "9:41" | "now",
//   "args": [], "takes": ["tour"], "fps": 30, "width": 660, "timeout": 120
// }
// The app prints "PROMO mark <name>" when something happens and "PROMO end" when the take is over (see
// templates/ios/PromoDirector.swift). Each take becomes frames/ios/<take>/0001.jpg… and frames/ios/<take>.json
// { fps, frames, size, marks: { name: seconds } }; scenes play it with promokit's clip().
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')}…: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-8).join('\n')}`)
  return r.stdout
}
const simctl = (...a) => run('xcrun', ['simctl', ...a])

function config(cfg) {
  const c = { device: 'iPhone 16 Pro', language: 'tr', appearance: 'light', args: [], takes: ['tour'], fps: 30, width: 660, timeout: 120, ...cfg.ios }
  if (!c.scheme || !c.bundle || !(c.project || c.workspace)) throw new Error('promo.json "ios" needs "project" (or "workspace"), "scheme" and "bundle"')
  return c
}

// A simulator of our own ("Promo iPhone 16 Pro"), on the newest iOS runtime, so the user's devices stay untouched.
function device(c) {
  const runtimes = JSON.parse(simctl('list', 'runtimes', 'available', '-j')).runtimes.filter((r) => r.platform === 'iOS')
  const rt = runtimes.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })).at(-1)
  if (!rt) throw new Error('no iOS Simulator runtime: Xcode > Settings > Components')
  const name = `Promo ${c.device}`
  let dev = (JSON.parse(simctl('list', 'devices', 'available', '-j')).devices[rt.identifier] ?? []).find((d) => d.name === name)
  if (!dev) {
    const type = rt.supportedDeviceTypes.find((t) => t.name === c.device) ?? rt.supportedDeviceTypes.filter((t) => /iPhone/.test(t.name)).at(-1)
    dev = { udid: simctl('create', name, type.identifier, rt.identifier).trim(), name }
    console.log(`simülatör oluşturuldu: ${name} (iOS ${rt.version})`)
  }
  spawnSync('xcrun', ['simctl', 'boot', dev.udid])  // fails harmlessly when already booted
  simctl('bootstatus', dev.udid, '-b')
  // "clock": "now" when the app shows times that depend on the real clock; otherwise Apple's 9:41
  const now = new Date(), time = c.clock === 'now' ? `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}` : c.clock ?? '9:41'
  simctl('status_bar', dev.udid, 'override', '--time', time, '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
    '--cellularMode', 'active', '--cellularBars', '4', '--batteryState', 'charged', '--batteryLevel', '100')
  spawnSync('xcrun', ['simctl', 'ui', dev.udid, 'appearance', c.appearance])
  return dev.udid
}

export function build(root, cfg) {
  const c = config(cfg)
  if (c.source) {
    const src = resolve(root, c.source), dest = join(root, 'src')
    rmSync(dest, { recursive: true, force: true })
    run('rsync', ['-a', '--exclude', '.git', '--exclude', 'promo', '--exclude', 'build', '--exclude', 'DerivedData', '--exclude', '*.xcuserstate', src + '/', dest + '/'])
  }
  if (c.prepare) run('/bin/sh', ['-c', c.prepare], { cwd: root, stdio: 'inherit' })
  const udid = device(c), data = join(root, 'build', 'ios')
  console.log(`derleniyor: ${c.scheme}…`)
  run('xcodebuild', ['-quiet', ...(c.workspace ? ['-workspace', c.workspace] : ['-project', c.project]), '-scheme', c.scheme,
    '-configuration', 'Debug', '-destination', `id=${udid}`, '-derivedDataPath', data, 'CODE_SIGNING_ALLOWED=NO', 'build'], { cwd: root, maxBuffer: 1 << 26 })
  const products = join(data, 'Build', 'Products', 'Debug-iphonesimulator')
  const app = readdirSync(products).find((f) => f.endsWith('.app'))
  if (!app) throw new Error(`no .app in ${products}`)
  console.log(`→ ${relative(root, join(products, app))}`)
  return { udid, app: join(products, app) }
}

// One take: fresh install, start recording, launch with -promoTake <take>, collect the marks, stop on "PROMO end".
function take(root, c, udid, app, name) {
  const dir = join(root, 'frames', 'ios'), mov = join(dir, `${name}.mov`)
  mkdirSync(dir, { recursive: true })
  spawnSync('xcrun', ['simctl', 'terminate', udid, c.bundle])
  spawnSync('xcrun', ['simctl', 'uninstall', udid, c.bundle])
  simctl('install', udid, app)
  const lang = c.language, locale = { tr: 'tr_TR', en: 'en_US' }[lang] ?? lang
  return new Promise((done, fail) => {
    const rec = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', mov])
    let t0 = 0, app_ = null
    const marks = {}, stop = (why) => {
      marks['@end'] = +((performance.now() - t0) / 1000).toFixed(3)
      clearTimeout(timer)
      app_?.kill('SIGTERM')
      rec.kill('SIGINT')
      rec.on('exit', () => (why ? fail(new Error(why)) : done(marks)))
    }
    const timer = setTimeout(() => stop(`take "${name}": no "PROMO end" within ${c.timeout} s`), c.timeout * 1000)
    rec.stderr.on('data', (b) => {
      if (t0 || !/Recording started/.test(b)) return
      t0 = performance.now()
      app_ = spawn('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', udid, c.bundle,
        ...c.args, '-promoTake', name, '-AppleLanguages', `(${lang})`, '-AppleLocale', locale])
      let buf = ''
      app_.stdout.on('data', (d) => {
        buf += d
        for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) {
          const m = buf.slice(0, i).match(/PROMO (mark (\S+)|end)/)
          if (!m) continue
          const t = (performance.now() - t0) / 1000
          if (m[2]) { marks[m[2]] = +t.toFixed(3); console.log(`  ${name} ${t.toFixed(2)} s  ${m[2]}`) } else stop()
        }
      })
    })
  }).then((marks) => {
    const out = join(dir, name)
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out)
    // The Simulator writes a frame only when the screen changes, so a still ending is missing from the .mov; its start
    // is the recording's start, like the marks. Hold the last frame until "PROMO end".
    const end = marks['@end'], movLength = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mov]))
    delete marks['@end']
    const pad = Math.max(0, end - movLength).toFixed(3)
    run('ffmpeg', ['-v', 'error', '-y', '-i', mov, '-vf', `tpad=stop_mode=clone:stop_duration=${pad},fps=${c.fps},scale=${c.width}:-2`, '-q:v', '2', join(out, '%04d.jpg')])
    const frames = readdirSync(out).length
    const [w, h] = run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(out, '0001.jpg')]).trim().split(',').map(Number)
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ fps: c.fps, frames, size: [w, h], marks }, null, 2))
    console.log(`  → frames/ios/${name}/ (${frames} kare, ${(frames / c.fps).toFixed(1)} s), frames/ios/${name}.json`)
  })
}

export async function ios(root, cfg, sub, names) {
  const c = config(cfg)
  if (sub === 'build') return build(root, cfg)
  if (sub !== 'record') throw new Error('promo ios build | record [take…]')
  const { udid, app } = build(root, cfg)
  for (const name of names.length ? names : c.takes) await take(root, c, udid, app, name)
}

