# Builds whoosh.wav, the built-in transition sound (promo.json "sfx": [{"file": "whoosh", ...}]): filtered noise whose
# band and level swell and fade while it pans left to right, peaking ~0.4 s in. Pure Python: python3 whoosh.py
import math, random, struct, wave
from pathlib import Path

RATE, LENGTH, PEAK = 48000, .85, .42
random.seed(7)
n = int(RATE * LENGTH)
out, b1 = [], [0.0] * 4
lp = hp = 0.0
for i in range(n):
    t = i / RATE
    # envelope: quick swell to PEAK, longer tail
    x = t / PEAK if t < PEAK else 1 + (t - PEAK) / (LENGTH - PEAK)
    env = math.sin(math.pi / 2 * x) ** 2 if x <= 1 else math.cos(math.pi / 2 * (x - 1)) ** 2.4
    # the noise band rises with the swell (air rushing past)
    lo, hi = 150 + 900 * env, 600 + 5200 * env
    a_lp, a_hp = 1 - math.exp(-2 * math.pi * hi / RATE), 1 - math.exp(-2 * math.pi * lo / RATE)
    noise = random.uniform(-1, 1)
    lp += a_lp * (noise - lp)
    hp += a_hp * (lp - hp)
    s = (lp - hp) * env
    pan = min(1, t / LENGTH * 1.2)
    out.append((s * math.cos(pan * math.pi / 2), s * math.sin(pan * math.pi / 2)))
peak = max(max(abs(l), abs(r)) for l, r in out)
k = 10 ** (-3 / 20) / peak
with wave.open(str(Path(__file__).with_name('whoosh.wav')), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b''.join(struct.pack('<hh', int(l * k * 32767), int(r * k * 32767)) for l, r in out))
print('whoosh.wav', n / RATE, 's')
