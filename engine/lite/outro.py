# Appends the platform's fixed outro (outro/<platform>.wav + .json, recovered from the promo-video skill's
# engine/outro/sadachbia) after the last narration line, 0.6 s after it ends, as the skill did.
#   python3 outro.py sadachbia     → narration/<voice>/words.{tiktok,youtube}.json, voice.{tiktok,youtube}.wav
# The X cut has no outro: it uses words.json and voice.wav as they are.
import json, subprocess, sys
from pathlib import Path

GAP = 0.6
here = Path(__file__).parent
voice = sys.argv[1] if len(sys.argv) > 1 else 'sadachbia'
out = here / 'narration' / voice
base = json.loads((out / 'words.json').read_text())
last = base['lines'][-1]
end = last['start'] + last['words'][-1]['end']

for plat in ('tiktok', 'youtube'):
    o = json.loads((here / 'outro' / voice / f'{plat}.json').read_text())
    wav = here / 'outro' / voice / f'{plat}.wav'
    length = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(wav)],
                                  capture_output=True, text=True, check=True).stdout)
    start = round(end + GAP, 3)
    duration = round(start + length, 3)
    words = dict(base, duration=duration, lines=base['lines'] + [{'file': str(wav), 'text': o['text'], 'start': start, 'words': o['words']}])
    (out / f'words.{plat}.json').write_text(json.dumps(words, ensure_ascii=False, indent=1))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(out / 'voice.wav'), '-i', str(wav), '-filter_complex',
                    f'[0]atrim=0:{start},apad[a];[1]adelay=delays={round(start * 1000)}:all=1[b];'
                    f'[a][b]amix=inputs=2:normalize=0,atrim=0:{duration},loudnorm=I=-14:TP=-1.5:LRA=11',
                    '-ar', '48000', '-ac', '2', str(out / f'voice.{plat}.wav')], check=True)
    print(f'{plat}: outro at {start}s, {duration}s')
