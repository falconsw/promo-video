# Synthesizes the narration with Gemini TTS (example: the "Claude bu videoyu yaptı" studio video) and times every word with Whisper (local, MLX).
#   ./tts.py voices                → Turkish voices in the Gemini voice library
#   ./tts.py <voice> [0,1]         → narration/<voice>/l<i>.wav, words.json, voice.wav
#                                    (with a line list: only those lines, mixed into sample.mp3)
# Run through: uv run --no-project --python cpython-3.12-macos-aarch64-none --with mlx-whisper tts.py …
# (uv here is an x86_64 build; MLX needs the arm64 interpreter.)
# words.json is the timeline compose-tiktok.html follows; voice.wav is the lines mixed at those starts.
# API key: $GEMINI_API_KEY or ~/.config/gemini/api_key (aistudio.google.com/apikey). MODEL / STYLE env override.
import base64, difflib, json, os, re, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

LINES = [
    "Şu an izlediğin bu videoyu baştan sona Claude yaptı.",
    "Senaryoyu o yazdı, sesi yapay zekaya okuttu, kurgulayıp paylaşan da yine o.",
    "Nasıl? Beş adımda göstereyim.",  # "Nasıl mı" always came out "nası mı"
    "Bir: Claude önce tanıttığım uygulamanın kodunu ve belgelerini okuyor.",
    "Hangi özelliğin öne çıkacağına karar verip senaryoyu yazıyor.",
    "İki: Metni seslendirmesi için Gemini'ye gönderiyor.",
    "Yanlış okunan bir kelime olursa kendisi yakalayıp düzeltiyor. Mesela:",
    "PHP",   # 11a: Gemini's own first reading ("pehepe"), no hint
    "PHP",   # 11b: the fixed reading, with the pronunciation hint
    "Üç: Whisper her kelimenin hangi salisede söylendiğini çıkarıyor.",
    "Dört: Gördüğün bu sahne aslında bir web sayfası, Claude onu Chrome'da kare kare çiziyor.",
    "Beş: Kapak görselini de yapay zeka ile üretiyor.",
    "Açıklamaları yazıp videoyu dört platforma planlıyor.",
    "Bana kalan iş? Onay vermek. Hepsi bu.",
    "Bu sistemi nasıl kurduğumu bir sonraki videoda anlatıyorum.",
]
# silence before each line: longer before every step number and around the PHP demo
GAPS = [0.25, 0.3, 0.35, 0.6, 0.3, 0.6, 0.3, 0.45, 0.6, 0.6, 0.6, 0.6, 0.3, 0.5, 0.45]
TAIL = 1.6
MODEL = os.environ.get('MODEL', 'gemini-3.8-flash-tts')
STYLE = os.environ.get('STYLE', 'Confident, warm Turkish tech creator telling a behind-the-scenes story, with the careful, standard diction of a professional narrator. Pronounce every word fully, exactly as written: always say the final "r" of every "-yor" ending (yapıyor, not yapıyo; oluyor, not oluyo; diziyor, not diziyo), the final "l" of "nasıl", and every final consonant; no colloquial clipping, no swallowed syllables. Brisk but clear. "Claude" is said "Klod".')
STEP = STYLE + ' The step number at the start ("Bir", "İki", "Üç", "Dört", "Beş") lands as a short, punchy beat with a tiny pause after it.'
# per-line direction (the video claims "her cümleye ayrı bir ton veriyor", so it has to be true here)
STYLES = {
    0: STYLE + ' This opening line is a hook: intriguing, a little hushed, as if letting the listener in on a secret, with a hint of wonder.',
    2: STYLE + ' Inviting, upbeat, a quick lead-in.',
    3: STEP, 5: STEP, 9: STEP, 10: STEP, 11: STEP,
    # the PHP demo: same text, only the reading note differs (the video shows exactly this note)
    7: STYLE + ' Read the acronym with Turkish letter names, run together as one word: "pe-he-pe".',
    8: STYLE + ' Say only the acronym the English way, letter by letter: "pi, eyç, pi". Flat statement, not a question; say nothing else.',
    13: STYLE + ' Relaxed and smug, a satisfied grin: a short pause after "Bana kalan iş?", then "Onay vermek. Hepsi bu." dry and confident.',
    14: STYLE + ' Energetic teaser, building curiosity for the next video. Say "sistemi" (ends in -i, no "n"), not "sistemin".',
}
# what Gemini is given instead of the subtitle's spelling (one word for one word, so timings map back 1:1)
SAY = {'Claude': 'Klod', "Gemini'ye": "Ceminay'a", 'Whisper': 'Vispır', 'API': 'Ey-Pi-Ay', "Chrome'da": "Krom'da"}
WHISPER = 'mlx-community/whisper-large-v3-turbo'


def api(path, body=None):
    key = os.environ.get('GEMINI_API_KEY') or (Path.home() / '.config/gemini/api_key').read_text().strip()
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta' + path,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={'x-goog-api-key': key, 'content-type': 'application/json'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=180) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 5:  # free tier: a few requests per minute
                wait = int(e.headers.get('retry-after') or 20 * (attempt + 1))
                if wait > 300:  # the daily quota (e.g. 100 requests/day on Tier 1), not the per-minute one: waiting is pointless
                    sys.exit(f'{e.code}: daily quota used up, retry in {wait // 3600}h{wait % 3600 // 60:02d}m — {e.read().decode()[:300]}')
                print(f'{e.code}, retrying in {wait}s', file=sys.stderr)
                time.sleep(wait)
                continue
            sys.exit(f'{e.code} {path.split("?")[0]}: {e.read().decode()[:600]}')


def speak(voice, text, wav, style):
    r = api('/interactions', {
        'model': MODEL,
        'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': text,
                                                      'annotations': [{'type': 'speech_metadata', 'style': style}]}]}],
        'response_format': {'type': 'audio'},
        'generation_config': {'speech_config': [{'voice': voice}]}})
    audio = [c for s in r.get('steps', []) if s.get('type') == 'model_output' for c in s.get('content', []) if c.get('type') == 'audio']
    if not audio: sys.exit(f'no audio in response: {json.dumps(r)[:600]}')
    wav.write_bytes(base64.b64decode(audio[-1]['data']))


def norm(s):
    return re.sub(r'\W', '', s.replace('İ', 'i').replace('I', 'ı').lower())


def align(wav, words):
    """Whisper's word timestamps, matched onto the script's words (the script wins on spelling)."""
    import mlx_whisper
    r = mlx_whisper.transcribe(str(wav), path_or_hf_repo=WHISPER, language='tr', word_timestamps=True,
                               initial_prompt=' '.join(words))
    heard = [w for seg in r['segments'] for w in seg.get('words', [])]
    times = [None] * len(words)
    sm = difflib.SequenceMatcher(None, [norm(w) for w in words], [norm(h['word']) for h in heard], autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1): times[i1 + k] = (heard[j1 + k]['start'], heard[j1 + k]['end'])
        elif tag == 'replace':  # e.g. "26'yla" heard as "yirmi altıyla": spread the heard span over the script words
            a, b, n = heard[j1]['start'], heard[j2 - 1]['end'], i2 - i1
            for k in range(n): times[i1 + k] = (a + (b - a) * k / n, a + (b - a) * (k + 1) / n)
    for i, t in enumerate(times):  # words Whisper missed: squeeze them between their neighbours
        if t is None:
            a = times[i - 1][1] if i and times[i - 1] else 0.0
            b = next((x[0] for x in times[i + 1:] if x), a + .3)
            times[i] = (a, max(a + .05, b))
            print(f'{wav.name}: guessed timing for {words[i]!r}', file=sys.stderr)
    return [{'text': w, 'start': round(a, 3), 'end': round(b, 3)} for w, (a, b) in zip(words, times)]


def spoken(text):
    for k, v in SAY.items(): text = re.sub(rf'(?<!\w){re.escape(k)}(?!\w)', v, text)
    return text


def line(voice, i, out):
    text, raw, wav, cache = LINES[i], out / f'l{i}.raw.wav', out / f'l{i}.wav', out / f'l{i}.json'
    say = spoken(text)
    key = {'text': say, 'model': MODEL, 'style': STYLES.get(i, STYLE)}
    hit = json.loads(cache.read_text()) if cache.exists() and raw.exists() else {}
    if {k: hit.get(k) for k in key} != key:
        print(f'l{i}: synthesizing', file=sys.stderr)
        speak(voice, say, raw, key['style'])
        hit = dict(key)
    if 'words' not in hit or not wav.exists():
        # Gemini leaves ~0.2 s of air in front, which makes Whisper misplace the first word
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw),
                        '-af', 'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.03', str(wav)], check=True)
        hit['words'] = align(wav, say.split())
        cache.write_text(json.dumps(hit, ensure_ascii=False))
    if len(hit['words']) != len(text.split()): sys.exit(f'l{i}: SAY must swap one word for one word')
    for w, shown in zip(hit['words'], text.split()): w['text'] = shown  # the subtitle keeps the real spelling
    return {'file': wav.name, 'text': text, 'words': hit['words']}


def mix(out, lines, duration, target):
    inputs = [a for ln in lines for a in ('-i', str(out / ln['file']))]
    delays = ''.join(f"[{i}]adelay=delays={round(ln['start'] * 1000)}:all=1[a{i}];" for i, ln in enumerate(lines))
    chain = ''.join(f'[a{i}]' for i in range(len(lines))) + f'amix=inputs={len(lines)}:normalize=0,apad,atrim=0:{duration},loudnorm=I=-14:TP=-1.5:LRA=11'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', delays + chain,
                    '-ar', '48000', '-ac', '2', str(out / target)], check=True)


def narrate(voice, only=None):
    out = Path(__file__).parent / 'narration' / voice
    out.mkdir(parents=True, exist_ok=True)
    pick = only or range(len(LINES))
    lines = [line(voice, i, out) for i in pick]
    t = 0
    for i, ln in zip(pick, lines):
        ln['start'] = round(t + GAPS[i], 3)
        t = ln['start'] + ln['words'][-1]['end']
    duration = round(t + TAIL, 3)
    if only:
        mix(out, lines, duration, 'sample.mp3')
        print(out / 'sample.mp3')
        return
    (out / 'words.json').write_text(json.dumps({'voice': voice, 'duration': duration, 'lines': lines}, ensure_ascii=False, indent=1))
    mix(out, lines, duration, 'voice.wav')
    print(f'{voice}: {duration}s → {out}')


cmd = sys.argv[1] if len(sys.argv) > 1 else 'voices'
if cmd == 'voices':
    for v in api('/voices?language_code=tr-TR&page_size=100').get('voices', []):
        print(' | '.join(str(v.get(k) or '') for k in ('id', 'display_name', 'language_code', 'accent', 'gender', 'pitch', 'description')))
else:
    narrate(cmd, [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else None)
