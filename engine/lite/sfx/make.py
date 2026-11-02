# Synthesizes the scene's sound cues (48 kHz stereo, pure Python): whoosh, thud, tick, ping, error, shutter, click, type.
#   python3 sfx/make.py   → sfx/<name>.wav
import math, random, struct, wave
from pathlib import Path
SR = 48000
here = Path(__file__).parent
random.seed(7)

def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    with wave.open(str(here / f'{name}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<hh', v, v) for v in (int(s / peak * 0.9 * 32767) for s in samples)))

def env(i, n, a=0.005, r=None):
    t = i / SR; d = n / SR; r = r or d
    return min(1, t / a) * math.exp(-max(0, t - a) / (r / 5))

def lowpass(xs, k):
    y, out = 0.0, []
    for x in xs: y += k * (x - y); out.append(y)
    return out

def whoosh(d=0.55):
    n = int(SR * d); noise = [random.uniform(-1, 1) for _ in range(n)]; out, y = [], 0.0
    for i, x in enumerate(noise):
        u = i / n; k = 0.02 + 0.25 * math.sin(math.pi * u) ** 2   # filter opens and closes
        y += k * (x - y); out.append(y * math.sin(math.pi * u) ** 1.5)
    return out

def thud(d=0.5):
    n = int(SR * d)
    return [math.sin(2 * math.pi * (55 + 90 * math.exp(-i / SR * 25)) * i / SR) * math.exp(-i / SR * 9)
            + 0.25 * random.uniform(-1, 1) * math.exp(-i / SR * 60) for i in range(n)]

def tick(d=0.05):
    n = int(SR * d); hp = lowpass([random.uniform(-1, 1) for _ in range(n)], 0.6)
    return [(hp[i] * 0.6 + math.sin(2 * math.pi * 2400 * i / SR)) * math.exp(-i / SR * 140) for i in range(n)]

def ping(f=1318.5, d=0.9):
    n = int(SR * d)
    return [(math.sin(2 * math.pi * f * i / SR) + 0.4 * math.sin(2 * math.pi * f * 2 * i / SR) + 0.15 * math.sin(2 * math.pi * f * 3.01 * i / SR))
            * min(1, i / (SR * 0.003)) * math.exp(-i / SR * 5.5) for i in range(n)]

def error(d=0.42):
    n = int(SR * d); out = []
    for i in range(n):
        t = i / SR; f = 180 if t < 0.2 else 150
        v = (1 if math.sin(2 * math.pi * f * t) > 0 else -1) * 0.5 + math.sin(2 * math.pi * f * 2 * t) * 0.3
        out.append(v * (0 if 0.17 < t < 0.21 else 1) * math.exp(-((t % 0.21)) * 9))
    return lowpass(out, 0.18)

def shutter(d=0.16):
    n = int(SR * d); noise = lowpass([random.uniform(-1, 1) for _ in range(n)], 0.5); out = []
    for i in range(n):
        t = i / SR
        out.append(noise[i] * (math.exp(-t * 90) + 0.8 * math.exp(-max(0, t - 0.07) * 120) * (t > 0.07)))
    return out

def click(d=0.06):
    n = int(SR * d)
    return [(math.sin(2 * math.pi * 1800 * i / SR) * 0.5 + random.uniform(-1, 1) * 0.5) * math.exp(-i / SR * 180) for i in range(n)]

def typing(d=0.9, keys=11):
    n = int(SR * d); out = [0.0] * n; t1 = tick()
    for k in range(keys):
        s = int((k / keys * d + random.uniform(-0.015, 0.015)) * SR); g = random.uniform(0.5, 1)
        for i, v in enumerate(t1):
            if 0 <= s + i < n: out[s + i] += v * g
    return out

for name, fn in dict(whoosh=whoosh, thud=thud, tick=tick, ping=ping, error=error, shutter=shutter, click=click, type=typing).items():
    write(name, fn()); print(name)
