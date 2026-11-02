// The fixed platform sign-off ("Beğen, yorumla, paylaş, kaydet; … takip et! / abone ol!") — the original outroCta()
// of the old promokit, as a plain script: <script src="cta.js"></script>, then
//
//   const cta = outroCta($('stage'), { platform: 'tiktok' | 'youtube', start, taps: [like, comment, share, save],
//                                      follow, lift: $('end') })      // times in seconds from the words file
//   SFX.push(...cta.sfx)                                                // a soft "tap" on each verb and the follow
//   cta(t)                                                              // every frame, before the subtitles
//
// The four buttons rise in one after another, each is tapped on its word (a ring spreads out, the like button also
// throws 8 dots), then the follow button — as wide as the row — pops on "takip" / "abone". TikTok: bare white glyphs,
// heart turns red, bookmark yellow, red "+ Takip et". YouTube: round translucent buttons with outline icons that fill
// in, "Yorum", Kaydet's ≡+ turns into ≡✓, red "🔔 Abone ol". Platform colours stay the same on any backdrop.
// `lift` (an end card without a transform of its own) slides up `liftBy` px and shrinks to `liftScale`; `top` is
// where the row starts (row + follow fill top … top + 330). Insert before #sub so the subtitles stay on top.
// Every class is cta-prefixed: a scene's own `.btn { padding: 18px 32px }` once turned the round buttons into
// ellipses and pushed the row past the frame.
(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, k) => a + (b - a) * k
  const E = {
    out: (k) => 1 - Math.pow(1 - k, 3),
    inOut: (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outBack: (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2) }
  }
  const p = (t, a, b, e = E.out) => e(clamp((t - a) / (b - a)))

  // [key, label, colour once tapped, svg (64×64)]; class .cta-mark = drawn only once tapped, .cta-plus = only before
  const HEART = '<path d="M32 55C15 43 6 33 6 21.5 6 13.5 12 7.5 19.8 7.5c5 0 9.3 2.6 12.2 6.7 2.9-4.1 7.2-6.7 12.2-6.7C52 7.5 58 13.5 58 21.5 58 33 49 43 32 55Z"/>'
  const ARROW = '<path d="M36 9 58 29.5 36 50V38.5C22 38.5 12.5 43 6 55c2-18 12.5-29.5 30-31.5Z"/>'
  const SETS = {
    tiktok: { follow: ['<path d="M16 6v20M6 16h20"/>', 'Takip et'], buttons: [
      ['like', 'Beğen', '#fe2c55', HEART],
      ['comment', 'Yorumla', '#ffffff', '<path d="M32 8c15 0 26 9.5 26 21.5S47 51 32 51c-3 0-6-.4-8.6-1.2L12 56l2.6-10.2C9.3 41.9 6 36 6 29.5 6 17.5 17 8 32 8Z"/><g class="cta-dots"><circle cx="21" cy="30" r="3.8"/><circle cx="32" cy="30" r="3.8"/><circle cx="43" cy="30" r="3.8"/></g>'],
      ['share', 'Paylaş', '#ffffff', ARROW],
      ['save', 'Kaydet', '#face15', '<path d="M17 6h30a5 5 0 0 1 5 5v47L32 45 12 58V11a5 5 0 0 1 5-5Z"/>']] },
    youtube: { follow: ['<path d="M16 4.5c-5 0-8.2 3.8-8.2 8.8v5.4L5 23h22l-2.8-4.3v-5.4c0-5-3.2-8.8-8.2-8.8ZM12.8 26.5a3.3 3.3 0 0 0 6.4 0"/>', 'Abone ol'], buttons: [
      ['like', 'Beğen', '#ffffff', '<path d="M21 27 30.5 7.5c4.2 0 7.3 3.4 6.6 7.8L35.6 25H51c4 0 7 3.6 6.2 7.5l-3.8 18.3c-.6 3-3.2 5.2-6.2 5.2H21ZM7 27h9v29H7Z"/>'],
      ['comment', 'Yorum', '#ffffff', '<path d="M13 9h38a7 7 0 0 1 7 7v25a7 7 0 0 1-7 7H25l-11 9v-9h-1a7 7 0 0 1-7-7V16a7 7 0 0 1 7-7Z"/><g class="cta-dots"><rect x="17" y="21" width="30" height="5" rx="2.5"/><rect x="17" y="31" width="20" height="5" rx="2.5"/></g>'],
      ['share', 'Paylaş', '#ffffff', ARROW],
      ['save', 'Kaydet', '#ffffff', '<path class="cta-line" d="M8 15h34M8 27h34M8 39h20"/><path class="cta-line cta-plus" d="M47 32v22M36 43h22"/><path class="cta-line cta-mark" d="M37 44l7 7 14-15"/>']] }
  }

  const CSS = `
#cta { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; opacity: 0;
  font-family: -apple-system, "SF Pro Display", system-ui, sans-serif; }
#cta .cta-box { display: flex; flex-direction: column; }
#cta .cta-acts { display: flex; gap: 46px; }
#cta .cta-act { display: flex; flex-direction: column; align-items: center; }
#cta .cta-btn { position: relative; width: 150px; height: 150px; border-radius: 50%; display: grid; place-items: center; }
#cta .cta-btn svg { position: relative; overflow: visible; }
#cta .cta-btn .cta-dots, #cta .cta-btn .cta-mark { opacity: 0; }
#cta .cta-ring { position: absolute; inset: -4px; border-radius: 50%; border: 4px solid var(--c); opacity: 0; }
#cta .cta-btn b { position: absolute; left: 50%; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
  background: var(--c); opacity: 0; }
#cta .cta-act span { margin-top: 14px; color: #fff; font-size: 34px; font-weight: 750; letter-spacing: -.3px;
  text-shadow: 0 2px 10px rgba(0,0,0,.55); }
#cta .cta-follow { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 40px; padding: 20px 0; border-radius: 999px;
  color: #fff; font-size: 46px; font-weight: 800; letter-spacing: -.5px; opacity: 0; }
#cta .cta-follow svg { width: 38px; height: 38px; }
#cta .cta-follow svg path { fill: none; stroke: #fff; stroke-width: 3.6; stroke-linecap: round; stroke-linejoin: round; }
#cta.cta-tiktok .cta-btn svg { width: 104px; height: 104px; filter: drop-shadow(0 3px 8px rgba(0,0,0,.45)); }
#cta.cta-tiktok .cta-btn svg path { fill: #fff; }
#cta.cta-tiktok .cta-btn .cta-dots { fill: #161616; opacity: 1; }
#cta.cta-tiktok .cta-act.cta-on .cta-btn svg path { fill: var(--c); }
#cta.cta-tiktok .cta-follow { background: #fe2c55; box-shadow: 0 0 50px rgba(254,44,85,.45), 0 18px 44px rgba(0,0,0,.45); }
#cta.cta-tiktok .cta-follow svg path { stroke-width: 4.5; }
#cta.cta-youtube .cta-btn { background: rgba(255,255,255,.14); box-shadow: 0 18px 44px rgba(0,0,0,.35); }
#cta.cta-youtube .cta-btn svg { width: 72px; height: 72px; }
#cta.cta-youtube .cta-btn svg path { fill: none; stroke: #fff; stroke-width: 4.5; stroke-linejoin: round; stroke-linecap: round; }
#cta.cta-youtube .cta-btn .cta-dots { fill: #0f0f0f; }
#cta.cta-youtube .cta-act.cta-on .cta-btn { background: rgba(255,255,255,.26); }
#cta.cta-youtube .cta-act.cta-on .cta-btn svg path:not(.cta-line) { fill: #fff; }
#cta.cta-youtube .cta-act.cta-on .cta-btn .cta-dots { opacity: 1; }
#cta.cta-youtube .cta-act.cta-on .cta-btn .cta-plus { opacity: 0; }
#cta.cta-youtube .cta-act.cta-on .cta-btn .cta-mark { opacity: 1; }
#cta.cta-youtube .cta-follow { background: #ff0033; box-shadow: 0 0 50px rgba(255,0,51,.4), 0 18px 44px rgba(0,0,0,.45); }`

  window.outroCta = function (parent, { platform = 'tiktok', start, taps, follow: f, lift, liftBy = 110, liftScale = .8, top = 860 }) {
    const set = SETS[platform] ?? SETS.tiktok
    if (!document.getElementById('cta-css')) {
      const st = document.createElement('style')
      st.id = 'cta-css'
      st.textContent = CSS
      document.head.append(st)
    }
    const el = document.createElement('div')
    el.id = 'cta'
    el.className = `cta-${platform}`
    el.style.top = `${top}px`
    el.innerHTML = `<div class="cta-box"><div class="cta-acts">${set.buttons.map(([k, label, c, svg]) => `<div class="cta-act ${k}" style="--c:${c}"><div class="cta-btn">` +
      `<i class="cta-ring"></i>${k === 'like' ? '<b></b>'.repeat(8) : ''}<svg viewBox="0 0 64 64">${svg}</svg></div><span>${label}</span></div>`).join('')}</div>` +
      `<div class="cta-follow"><svg viewBox="0 0 32 32">${set.follow[0]}</svg>${set.follow[1]}</div></div>`
    parent.insertBefore(el, document.getElementById('sub'))
    if (lift) lift.style.transformOrigin = '50% 0'
    const acts = [...el.querySelectorAll('.cta-act')], follow = el.querySelector('.cta-follow'), a = start

    const render = (t) => {
      const k = p(t, a - .55, a + .15, E.inOut)
      if (lift) lift.style.transform = `translateY(${-liftBy * k}px) scale(${lerp(1, liftScale, k)})`
      el.style.opacity = p(t, a - .4, a)
      acts.forEach((n, j) => {
        const c = taps[j], d = (t - c) / .55
        n.style.opacity = p(t, a - .35 + j * .07, a + .05 + j * .07)
        n.style.transform = `translateY(${(1 - p(t, a - .35 + j * .07, a + .25 + j * .07, E.outBack)) * 46}px)`
        const press = clamp(1 - Math.abs(t - c) / .07), pop = t > c ? Math.sin(clamp((t - c) / .34) * Math.PI) : 0
        n.querySelector('.cta-btn').style.transform = `scale(${1 - .1 * press + .16 * pop})`
        n.classList.toggle('cta-on', t >= c)
        const ring = n.querySelector('.cta-ring')
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
    // the old outro json: a soft tap .05 s after each verb (−9 dB) and the follow word (−7 dB) — build.sh: tap / tapf
    render.sfx = [...taps.map((c) => [c + .05, 'tap']), [f + .05, 'tapf']]
    return render
  }
})()
