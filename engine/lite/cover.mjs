// Renders a cover page to the 1080×1920 Short cover.
//   node cover.mjs [thumbnails/cover.html] [thumbnails/<slug>-short-thumb.jpg]
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
const require = createRequire(join(import.meta.dirname, 'package.json'))
const { chromium } = require('playwright-core')
const [src = 'thumbnails/cover.html', out = 'thumbnails/short-thumb.jpg'] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
await page.goto('file://' + resolve(import.meta.dirname, src))
await page.waitForFunction(() => window.done)
await page.screenshot({ path: resolve(import.meta.dirname, out), type: 'jpeg', quality: 92 })
await browser.close()
