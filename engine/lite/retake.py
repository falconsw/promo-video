# python -I retake.py 3,7 (through uv … --with mlx-whisper). Re-voices the given lines until Whisper hears every word the subtitle has (max 3 takes), keeping each take.
import shutil, sys
from pathlib import Path
src = Path(__file__).with_name('tts.py').read_text()
exec(src[:src.index('\ncmd = ')])
import mlx_whisper
out = Path(__file__).parent / 'narration' / 'sadachbia'
takes = out.parent / 'takes'; takes.mkdir(exist_ok=True)
# per project: line → words Whisper must hear for the take to pass
need = {3: ['nasıl'], 7: ['diziyor']}
for i in map(int, sys.argv[1].split(',')):
    for n in range(1, 4):
        (out / f'l{i}.json').unlink(missing_ok=True)
        line('sadachbia', i, out)
        shutil.copy(out / f'l{i}.raw.wav', takes / f'l{i}-fix{n}.raw.wav')
        heard = mlx_whisper.transcribe(str(out / f'l{i}.wav'), path_or_hf_repo=WHISPER, language='tr')['text'].strip()
        ok = all(w in [norm(x) for x in heard.split()] for w in map(norm, need[i]))
        print(f'l{i} take {n}: {"OK " if ok else "≠  "} {heard}', flush=True)
        if ok: break
