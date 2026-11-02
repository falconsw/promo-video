import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(new URL('../../engine/package.json', import.meta.url))  // playwright-core from the engine (npm install there)
const { chromium } = require('playwright-core')
const items = JSON.parse(readFileSync('/tmp/cov/covers.json', 'utf8'))
const out = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
for (const [no, name, yt] of items) {
  await page.goto(`file:///tmp/cov/work/${no}.html`)
  await page.waitForFunction(() => window.done)
  const slug = name.toLowerCase().replace(/ /g, '-')
  await page.screenshot({ path: `${out}/${no}-${slug}-${yt}.jpg`, type: 'jpeg', quality: 92 })
  console.log(no, slug)
}
await browser.close()
