import json, subprocess, pathlib, html, glob, unicodedata, re
W = pathlib.Path('/tmp/cov/work'); W.mkdir(exist_ok=True)
items = json.load(open('/tmp/cov/covers.json'))
HI = {'blue': '#aab6ff', 'yellow': '#ffe08a', 'green': '#a6f0c4', 'red': '#ffb4a6', 'orange': '#ffd0a1'}
for no, name, yt, k, pill, lines, *rest in items:
    hi = HI.get(rest[0], rest[0]) if rest else HI['blue']  # the backdrop's subtitle colour (name or hex)
    v = sorted(glob.glob(str(pathlib.Path.home() / 'Movies' / f'{name} Promo' / '*-tiktok.mp4')))[0]
    dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',v],capture_output=True,text=True).stdout)
    t = round(3 + (dur - 9) * k / 7, 2)
    frame = W / f'{no}.png'
    subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',v,'-frames:v','1',str(frame)],check=True)
    ls = ''.join(f'<div class="l{" l1" if i==0 else ""}{" lx" if i==len(lines)-1 else ""}">{html.escape(l)}</div>' for i,l in enumerate(lines))
    doc = f'''<!doctype html><html lang="tr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=block" rel="stylesheet">
<style>
html,body{{margin:0;width:1080px;height:1920px;overflow:hidden;background:#05060c;font-family:'Bricolage Grotesque',sans-serif}}
.bg{{position:absolute;inset:-80px;background:url({no}.png) center/cover;filter:blur(60px) saturate(1.25) brightness(.85)}}
.ui{{position:absolute;left:0;top:800px;width:1080px;height:1120px;background:url({no}.png) 0 -170px/1080px 1920px no-repeat;
  -webkit-mask-image:linear-gradient(transparent 0,#000 140px,#000 100%)}}
.shade{{position:absolute;left:0;right:0;top:0;height:1000px;background:linear-gradient(#05060cf0 0%,#05060cc8 60%,#05060c00 100%)}}
.t{{position:absolute;left:60px;right:60px;top:190px;text-align:center}}
.pill{{display:inline-block;background:#FFC23A;color:#111318;font-weight:800;font-size:46px;letter-spacing:2px;padding:12px 30px;border-radius:999px}}
.l{{white-space:nowrap;font-weight:800;font-size:176px;line-height:.98;letter-spacing:-3px;color:#F5F2EA;text-shadow:0 6px 30px #000a}}
.l1{{margin-top:34px}}.lx{{color:{hi}}}
</style></head><body><div class="bg"></div><div class="ui"></div><div class="shade"></div>
<div class="t"><div class="pill">{html.escape(pill)}</div>{ls}</div>
<script>document.fonts.ready.then(()=>{{let s=176;const ls=[...document.querySelectorAll('.l')];while(s>90&&ls.some(e=>e.scrollWidth>960)){{s-=4;ls.forEach(e=>e.style.fontSize=s+'px')}}window.done=1}})</script>
</body></html>'''
    (W / f'{no}.html').write_text(doc)
    print(no, name, f't={t}')
