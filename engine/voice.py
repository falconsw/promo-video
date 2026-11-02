# Narration for a promokit project: Gemini TTS (free tier) speaks the script, Whisper (local, MLX) times every word.
#   voice.py <project> [--voice v[,v…]] [--lines 0,2]   (--lines: only those lines, mixed into sample.mp3)
#   voice.py --list                                     the prebuilt Gemini voices
# Run by `promo voice` through uv with the arm64 interpreter MLX needs (see bin/promo.mjs).
#
# Reads promo.json: "voice" {voice, model, style, lang, tail}, "script" [{id, text, gap, style}] (a line's style
# replaces the voice's for that line: a tired hook, an energetic reveal, a stressed word) and "sfx"
# [{file, line | cue | at, offset, gain}] (sound effects mixed into voice.wav; file is a project path or a built-in
# name from sfx/, e.g. "whoosh").
# A {name} right before a word marks a cue; scenes ask for its time with N.cue('name'). Marks are not spoken.
# Writes narration/<voice>/: l<i>.raw.wav (as synthesized), l<i>.wav (leading air trimmed), l<i>.json (cache),
# words.json (the timeline scenes follow) and voice.wav (the lines mixed at their starts, -14 LUFS).
# A line is only re-synthesized when its spoken text, the model or the style changes: takes vary between calls,
# so a take you like stays until you change its words.
# Fixed sign-offs per platform: outro/<name>.json (tiktok: "…takip et!", youtube: "…abone ol!"; their own taps in
# "sfx"). Their takes live in outro/<voice>/, not in the project, so every video says them the same way. A format
# gets the outro named like it (formats.tiktok → tiktok) or the one in its "outro" field; false or no such outro
# (x) means none. words.json / voice.wav are the script alone; words.<outro>.json / voice.<outro>.wav add an outro.
# promo.json "outro": false leaves them all out.
# API key: $GEMINI_API_KEY or ~/.config/gemini/api_key (aistudio.google.com/apikey).
# Free tier: Google may use the text to improve its products, so only send public promo copy.
import base64, difflib, json, os, re, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

MODEL = 'gemini-3.8-flash-tts'
# Never ask for "natural, conversational Istanbul Turkish": Gemini then clips everywhere ("yapıyo", "nası mı"). The
# narrator's full diction keeps every final "r" of "-yor" and the "l" of "nasıl".
STYLE = ('Confident, warm Turkish tech creator narrating a short demo of their own app, with the careful, standard '
         'diction of a professional narrator. Pronounce every word fully, exactly as written: always say the final "r" '
         'of every "-yor" ending (yapıyor, not yapıyo; oluyor, not oluyo), the final "l" of "nasıl", and every final '
         'consonant; no colloquial clipping, no swallowed syllables. Brisk but clear.')
WHISPER = 'mlx-community/whisper-large-v3-turbo'
# prebuilt Gemini voices: they speak every supported language, Turkish included
VOICES = {
    'zephyr': 'Bright', 'puck': 'Upbeat', 'charon': 'Informative', 'kore': 'Firm', 'fenrir': 'Excitable',
    'leda': 'Youthful', 'orus': 'Firm', 'aoede': 'Breezy', 'callirrhoe': 'Easy-going', 'autonoe': 'Bright',
    'enceladus': 'Breathy', 'iapetus': 'Clear', 'umbriel': 'Easy-going', 'algieba': 'Smooth', 'despina': 'Smooth',
    'erinome': 'Clear', 'algenib': 'Gravelly', 'rasalgethi': 'Informative', 'laomedeia': 'Upbeat', 'achernar': 'Soft',
    'alnilam': 'Firm', 'schedar': 'Even', 'gacrux': 'Mature', 'pulcherrima': 'Forward', 'achird': 'Friendly',
    'zubenelgenubi': 'Casual', 'vindemiatrix': 'Gentle', 'sadachbia': 'Lively', 'sadaltager': 'Knowledgeable',
    'sulafat': 'Warm',
}
CUE = re.compile(r'\{([a-z][\w-]*)\}')
OUTRO = Path(__file__).parent / 'outro'


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
                print(f'{e.code}, retrying in {wait}s', file=sys.stderr)
                time.sleep(wait)
                continue
            sys.exit(f'{e.code} {path.split("?")[0]}: {e.read().decode()[:600]}')


def speak(cfg, voice, text, wav, style):
    r = api('/interactions', {
        'model': cfg.get('model', MODEL),
        'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': text,
                                                      'annotations': [{'type': 'speech_metadata', 'style': style}]}]}],
        'response_format': {'type': 'audio'},
        'generation_config': {'speech_config': [{'voice': voice}]}})
    audio = [c for s in r.get('steps', []) if s.get('type') == 'model_output' for c in s.get('content', []) if c.get('type') == 'audio']
    if not audio: sys.exit(f'no audio in response: {json.dumps(r)[:600]}')
    wav.write_bytes(base64.b64decode(audio[-1]['data']))


def parse(text):
    """'Launchpad {gone}gitti' → (['Launchpad', 'gitti'], {1: 'gone'}): the spoken words and their cues."""
    words, cues, pending = [], {}, None
    for tok in text.split():
        m = CUE.match(tok)
        if m and m.end() == len(tok):  # "{cue} word"
            pending = m[1]
            continue
        if m: pending, tok = m[1], tok[m.end():]
        if '{' in tok or '}' in tok: sys.exit(f'stray brace in {tok!r} (a cue goes right before a word: {{name}}word)')
        if pending: cues[len(words)] = pending
        pending = None
        words.append(tok)
    if pending: sys.exit(f'cue {{{pending}}} has no word after it in: {text}')
    return words, cues


def plain(s):
    """The user never wants â/î/û on screen: a circumflex in the script is only a pronunciation hint for the voice."""
    return s.translate(str.maketrans('âîûÂÎÛ', 'aiuAİU'))


def norm(s):
    return re.sub(r'\W', '', plain(s).replace('İ', 'i').replace('I', 'ı').lower())


def align(wav, words, lang):
    """Whisper's word timestamps, matched onto the script's words (the script wins on spelling)."""
    import mlx_whisper
    r = mlx_whisper.transcribe(str(wav), path_or_hf_repo=WHISPER, language=lang, word_timestamps=True,
                               initial_prompt=' '.join(words))
    heard = [w for seg in r['segments'] for w in seg.get('words', [])]
    times = [None] * len(words)
    sm = difflib.SequenceMatcher(None, [norm(w) for w in words], [norm(h['word']) for h in heard], autojunk=False)
    # where the voice said something else than the script (Gemini rephrasing, or just numbers read out)
    diffs = [(' '.join(words[i1:i2]), ''.join(h['word'] for h in heard[j1:j2]).strip())
             for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != 'equal'
             and norm(''.join(words[i1:i2])) != norm(''.join(h['word'] for h in heard[j1:j2]))]  # just split differently
    for want, got in diffs: print(f'{wav.name}: script "{want}" ≠ heard "{got}"', file=sys.stderr)
    align.diffs = diffs
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
    return [{'text': plain(w), 'start': round(a, 3), 'end': round(b, 3)} for w, (a, b) in zip(words, times)]


def spoken(words, say):
    """promo.json voice.say {"Claude": "Klod", "API": "Ey-Pi-Ay"}: what Gemini is sent instead of a written word, one
    word for one word (no spaces in a value), so the subtitles keep the real spelling. Only what the project lists."""
    out = []
    for w in words:  # "Claude'un" → "Klod'un": a key is swapped wherever it stands as a whole word
        for k, v in (say or {}).items(): w = re.sub(rf'(?<!\w){re.escape(k)}(?!\w)', v, w)
        out.append(w)
    return out


def line(cfg, voice, name, words, out, style=None):
    said = spoken(words, cfg.get('say'))
    text, raw, wav, cache = ' '.join(said), out / f'{name}.raw.wav', out / f'{name}.wav', out / f'{name}.json'
    key = {'text': text, 'model': cfg.get('model', MODEL), 'style': style or cfg.get('style', STYLE)}
    hit = json.loads(cache.read_text()) if cache.exists() and raw.exists() else {}
    if {k: hit.get(k) for k in key} != key:
        print(f'{voice} {name}: synthesizing', file=sys.stderr)
        speak(cfg, voice, text, raw, key['style'])
        hit = dict(key)
    if 'words' not in hit or not wav.exists():
        # Gemini leaves ~0.2 s of air in front, which makes Whisper misplace the first word
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw),
                        '-af', 'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.03', str(wav)], check=True)
        hit['words'] = align(wav, said, cfg.get('lang', 'tr'))
        hit['diffs'] = align.diffs
        cache.write_text(json.dumps(hit, ensure_ascii=False))
    shown = ' '.join(words)  # the subtitle keeps the written spelling even where the voice was sent another
    return {'file': wav.name, 'text': plain(shown), 'words': [dict(w, text=plain(x)) for w, x in zip(hit['words'], words)]}


def mix(out, lines, duration, target, sfx=()):
    clips = [(str(out / ln['file']), ln['start'], 0, None, 0) for ln in lines] + \
            [(s['path'], s['at'], s['gain'], s.get('dur'), s.get('fade', 0)) for s in sfx]
    inputs = [a for f, *_ in clips for a in ('-i', f)]

    def shape(dur, fade):  # a bed (music, room tone) cut to its span, faded in and out
        if not dur: return f'afade=t=in:d={fade},' if fade else ''
        return f'atrim=0:{dur},afade=t=in:d={fade},afade=t=out:st={max(0, dur - fade)}:d={fade},' if fade else f'atrim=0:{dur},'
    # one format for every input: amix fed 24 kHz mono voice and 48 kHz stereo sfx hung at 100 % CPU, not every time (cprov, 10-31)
    norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,'
    delays = ''.join(f"[{i}]{norm}{shape(dur, fade)}adelay=delays={max(0, round(at * 1000))}:all=1,volume={gain}dB[a{i}];"
                     for i, (_, at, gain, dur, fade) in enumerate(clips))
    chain = ''.join(f'[a{i}]' for i in range(len(clips))) + f'amix=inputs={len(clips)}:normalize=0,apad,atrim=0:{duration},loudnorm=I=-14:TP=-1.5:LRA=11'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', delays + chain,
                    '-ar', '48000', '-ac', '2', str(out / target)], check=True)


def outros(spec):
    """The fixed sign-offs the project's narrated formats end with: {name: outro/<name>.json}."""
    if spec.get('outro', True) is False: return {}
    names = {f.get('outro', key) for key, f in spec.get('formats', {}).items() if f.get('voice')}
    return {n: json.loads((OUTRO / f'{n}.json').read_text()) for n in sorted(x for x in names if x and (OUTRO / f'{x}.json').exists())}


def narrate(root, voice, only=None):
    spec = json.loads((root / 'promo.json').read_text())
    cfg, script, fixed = spec.get('voice', {}), spec['script'], outros(spec)
    parsed = [parse(ln['text']) for ln in script]
    seen = {}
    for i, (_, cues) in enumerate(parsed + [parse(o['text']) for o in fixed.values()][:1]):  # the outros share cue names
        for name in cues.values():
            if name in seen: sys.exit(f'cue {{{name}}} is used twice (lines {seen[name]} and {i})')
            seen[name] = i
    out = root / 'narration' / voice
    out.mkdir(parents=True, exist_ok=True)
    pick = only or range(len(script))
    lines = [line(cfg, voice, f'l{i}', parsed[i][0], out, script[i].get('style')) for i in pick]
    if only:
        placed, _, t = timeline(script, pick, parsed, lines)
        mix(out, placed, round(t + cfg.get('tail', 1.6), 3), 'sample.mp3')
        print(out / 'sample.mp3')
        return
    if script: write(root, out, voice, cfg, spec.get('sfx', []), script, parsed, lines, '')  # (an outro-only test has none)
    for name, o in fixed.items():  # the same take in every project
        (OUTRO / voice).mkdir(exist_ok=True)
        words = parse(o['text'])
        ln = line({**cfg, 'model': o['model']}, voice, name, words[0], OUTRO / voice, o['style'])
        ln = dict(ln, file=str(OUTRO / voice / ln['file']))  # mix() joins it onto out: an absolute path wins
        write(root, out, voice, cfg, spec.get('sfx', []) + o.get('sfx', []), script + [o], parsed + [words], lines + [ln], name)


def timeline(script, pick, parsed, lines):
    """Lines placed one after another (each after its gap), their cues, and when the last word ends."""
    t, cues = 0, {}
    lines = [dict(ln, words=[dict(w) for w in ln['words']]) for ln in lines]
    for i, ln in zip(pick, lines):
        if script[i].get('id'): ln['id'] = script[i]['id']
        ln['start'] = round(t + script[i].get('gap', .4), 3)
        t = ln['start'] + ln['words'][-1]['end']
        for j, name in parsed[i][1].items():
            ln['words'][j]['cue'] = name
            cues[name] = round(ln['start'] + ln['words'][j]['start'], 3)
    return lines, cues, t


def write(root, out, voice, cfg, specs, script, parsed, lines, outro):
    """words[.<outro>].json and voice[.<outro>].wav for one cut."""
    lines, cues, t = timeline(script, range(len(script)), parsed, lines)
    duration = round(t + cfg.get('tail', 1.6), 3)
    sfx = []
    for s in specs:
        at = (cues[s['cue']] if 'cue' in s else next(ln['start'] for ln in lines if ln.get('id') == s['line']) if 'line' in s
              else s.get('at', 0)) + s.get('offset', 0)
        path = root / s['file'] if (root / s['file']).exists() else Path(__file__).parent / 'sfx' / f"{s['file']}.wav"
        if not path.exists(): sys.exit(f"sfx {s['file']!r}: no such file in the project or in sfx/")
        item = {'file': s['file'], 'at': round(at, 3), 'gain': s.get('gain', 0), 'path': str(path)}
        if 'until' in s:  # a cue, a line id (its end), "end" or seconds
            u = s['until']
            end = duration if u == 'end' else cues[u] if u in cues else \
                next((ln['start'] + ln['words'][-1]['end'] for ln in lines if ln.get('id') == u), None) if isinstance(u, str) else u
            if end is None: sys.exit(f"sfx {s['file']!r}: until {u!r} is not a cue, a line id, \"end\" or seconds")
            item['dur'] = round(end + s.get('until_offset', 0) - at, 3)
        if 'fade' in s: item['fade'] = s['fade']
        sfx.append(item)
    suffix = f'.{outro}' if outro else ''
    (out / f'words{suffix}.json').write_text(json.dumps({'voice': voice, 'outro': outro or None, 'duration': duration, 'cues': cues,
                                                         'lines': lines, 'sfx': [{k: v for k, v in s.items() if k != 'path'} for s in sfx]},
                                                        ensure_ascii=False, indent=1))
    mix(out, lines, duration, f'voice{suffix}.wav', sfx)
    print(f'{voice}{" + " + outro if outro else ""}: {duration}s, {len(lines)} lines → {out.relative_to(root)}/words{suffix}.json')


def main(argv):
    if argv[:1] == ['--list']:
        for name, kind in VOICES.items(): print(f'{name:<14} {kind}')
        return
    if not argv or argv[0].startswith('-'): sys.exit('usage: voice.py <project> [--voice v[,v…]] [--lines 0,2] | voice.py --list')
    root, opts = Path(argv[0]).resolve(), dict(zip(argv[1::2], argv[2::2]))
    voices = (opts.get('--voice') or json.loads((root / 'promo.json').read_text()).get('voice', {}).get('voice') or 'sadachbia').split(',')
    only = [int(x) for x in opts['--lines'].split(',')] if '--lines' in opts else None
    for v in voices:
        if v.lower() not in VOICES: print(f'note: {v} is not a known prebuilt voice', file=sys.stderr)
        narrate(root, v, only)


main(sys.argv[1:])
