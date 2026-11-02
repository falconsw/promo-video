// Setting up the machine for the skill: `doctor` lists what is missing, `setup` installs it (Homebrew, npm, uv's
// arm64 Python, mlx-whisper and its model) and `key` stores the Gemini API key. Nothing here is user-specific: every
// path comes from the home folder or from where the skill is installed.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE = dirname(fileURLToPath(import.meta.url))
const KEY_FILE = join(homedir(), '.config/gemini/api_key')
const KEY_PAGE = 'https://aistudio.google.com/apikey'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'  // where playwright's channel "chrome" looks
export const PYTHON = 'cpython-3.12-macos-aarch64-none'  // MLX needs the arm64 interpreter, even under an x86_64 uv
const WHISPER = 'mlx-community/whisper-large-v3-turbo'
const BREW_INSTALL = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'

const has = (bin) => spawnSync('/bin/sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }).status === 0
const run = (bin, args, opts = {}) => spawnSync(bin, args, { stdio: 'inherit', ...opts }).status === 0
const quiet = (bin, args) => spawnSync(bin, args, { stdio: 'ignore' }).status === 0
const uvRun = (code) => ['run', '--quiet', '--no-project', '--python', PYTHON, '--with', 'mlx-whisper', 'python', '-c', code]
const whisperCached = () => existsSync(join(process.env.HF_HOME ?? join(homedir(), '.cache/huggingface'), 'hub',
  `models--${WHISPER.replace('/', '--')}`))

export function storedKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim()
  try { return readFileSync(KEY_FILE, 'utf8').trim() } catch { return '' }
}

// Every requirement: ok, what it is for, and how setup fixes it (brew formula / cask, or a function).
function checks() {
  const node = Number(process.versions.node.split('.')[0])
  return [
    { name: 'macOS', ok: platform() === 'darwin', why: 'the engine uses macOS tools (open, osascript, Simulator); Windows and Linux support is coming soon', fatal: true },
    { name: 'Apple Silicon', ok: platform() === 'darwin' && (arch() === 'arm64' || quiet('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64'])),
      why: 'Whisper runs on MLX; without it only silent videos work', fatal: true },
    { name: 'Homebrew', ok: has('brew'), why: 'installs everything below', manual: BREW_INSTALL },
    { name: 'Node 22+', ok: node >= 22, why: `running ${process.versions.node}`, brew: 'node' },
    { name: 'ffmpeg', ok: has('ffmpeg'), why: 'encodes the video and the audio', brew: 'ffmpeg' },
    { name: 'uv', ok: has('uv'), why: 'runs voice.py with mlx-whisper', brew: 'uv' },
    { name: 'Google Chrome', ok: existsSync(CHROME), why: 'renders the scenes', cask: 'google-chrome' },
    { name: 'playwright-core', ok: existsSync(join(ENGINE, 'node_modules/playwright-core')), why: 'drives Chrome',
      fix: () => run('npm', ['install', '--no-audit', '--no-fund'], { cwd: ENGINE }) },
    { name: `Python (${PYTHON})`, ok: has('uv') && quiet('uv', ['python', 'find', PYTHON]), why: 'for mlx-whisper',
      fix: () => run('uv', ['python', 'install', PYTHON]) },
    { name: 'Whisper model', ok: whisperCached(), why: `${WHISPER}, ~1.6 GB, times every spoken word`,
      fix: () => run('uv', uvRun(`from huggingface_hub import snapshot_download; snapshot_download(${JSON.stringify(WHISPER)})`)) },
    { name: 'Gemini API key', ok: !!storedKey(), why: `the voice and the cover backgrounds (${KEY_PAGE})`, fix: () => key({}) },
  ]
}

function report(list) {
  for (const c of list) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` — ${c.why}`}`)
}

export function doctor() {
  const list = checks()
  report(list)
  const missing = list.filter((c) => !c.ok)
  if (missing.length) console.log(`\n${missing.length} missing: \`promo.mjs setup\` installs them.`)
  return missing.length === 0
}

export async function setup() {
  for (const c of checks()) {
    if (c.ok) continue
    if (c.fatal) { console.log(`! ${c.name}: ${c.why}`); continue }
    if (c.manual) {
      // Homebrew's installer asks for the user's password, so it can't run here.
      console.log(`✗ ${c.name} is missing. Run it in a terminal (in Claude Code: type ! and this line), then setup again:\n  ${c.manual}`)
      return false
    }
    console.log(`→ ${c.name}`)
    const done = c.brew ? run('brew', ['install', c.brew]) : c.cask ? run('brew', ['install', '--cask', c.cask]) : await c.fix()
    if (!done) console.log(`✗ ${c.name} could not be installed`)
  }
  console.log('')
  return doctor()
}

// ── key: store the Gemini key without it passing through the chat or the terminal output ──────────────────────
// Sources, first that applies: --clipboard (the user copied it), a hidden prompt when there is a terminal, otherwise
// a macOS dialog with a hidden field (what Claude uses: the user types into the dialog, not into the chat).
function ask() {
  if (process.stdin.isTTY) {
    process.stdout.write(`Gemini API key (${KEY_PAGE}, input hidden): `)
    spawnSync('/bin/stty', ['-echo'], { stdio: 'inherit' })
    const r = spawnSync('/bin/sh', ['-c', 'read -r k && printf %s "$k"'], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' })
    spawnSync('/bin/stty', ['echo'], { stdio: 'inherit' })
    process.stdout.write('\n')
    return r.stdout.trim()
  }
  const script = [
    'set r to display dialog "promo-video: Gemini API anahtarını yapıştırın.\\n\\nAnahtarınız yoksa \\"Anahtar al\\" ile ' +
      'ücretsiz alın, sonra buraya dönün." default answer "" with hidden answer with title "Gemini API" ' +
      'buttons {"Anahtar al", "İptal", "Kaydet"} default button "Kaydet" cancel button "İptal" giving up after 600',
    'if button returned of r is "Anahtar al" then',
    `  open location "${KEY_PAGE}"`,
    '  set r to display dialog "Anahtarı kopyaladıktan sonra buraya yapıştırın." default answer "" with hidden answer ' +
      'with title "Gemini API" buttons {"İptal", "Kaydet"} default button "Kaydet" cancel button "İptal" giving up after 900',
    'end if',
    'return text returned of r',
  ]
  const r = spawnSync('/usr/bin/osascript', script.flatMap((l) => ['-e', l]), { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

async function valid(key) {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key } })
    return r.ok ? true : r.status === 400 || r.status === 401 || r.status === 403 ? false : null
  } catch { return null }  // offline: can't tell
}

export async function key({ clipboard = false, check = false } = {}) {
  if (check) {
    const k = storedKey()
    if (!k) { console.log(`no Gemini key: \`promo.mjs key\` asks for one (${KEY_PAGE})`); return false }
    const v = await valid(k)
    console.log(v === true ? '✓ Gemini key works' : v === false ? '✗ Gemini key rejected: `promo.mjs key` replaces it' : '? could not reach Gemini')
    return v !== false
  }
  const k = (clipboard ? spawnSync('/usr/bin/pbpaste', { encoding: 'utf8' }).stdout ?? '' : ask()).trim()
  if (!k) { console.log(`no key entered (get one at ${KEY_PAGE})`); return false }
  if (!/^[\w-]{30,}$/.test(k)) { console.log('that does not look like a Gemini API key (letters, digits, - and _, ~39 characters)'); return false }
  const v = await valid(k)
  if (v === false) { console.log('✗ Gemini rejected this key; nothing saved'); return false }
  mkdirSync(dirname(KEY_FILE), { recursive: true })
  writeFileSync(KEY_FILE, k + '\n', { mode: 0o600 })
  chmodSync(KEY_FILE, 0o600)
  console.log(`✓ Gemini key saved to ~/.config/gemini/api_key${v === null ? ' (not verified: offline)' : ''}`)
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== k) console.log('! $GEMINI_API_KEY is set and takes precedence over the file')
  return true
}
