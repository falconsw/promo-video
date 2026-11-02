# Builds tap.wav, the built-in soft "pop" of a button being tapped (the outro's like / comment / share / save / follow):
# a short sine that drops from ~1.1 kHz to ~380 Hz with a 2 ms attack and a ~70 ms decay, plus a faint click on top.
# Pure Python: python3 tap.py
import math, random, struct, wave
from pathlib import Path

RATE, LENGTH = 48000, .16
random.seed(11)
out, phase = [], 0.0
for i in range(int(RATE * LENGTH)):
    t = i / RATE
    f = 380 + 720 * math.exp(-t / .018)
    phase += 2 * math.pi * f / RATE
    env = min(1, t / .002) * math.exp(-t / .045)
    click = random.uniform(-1, 1) * math.exp(-t / .0025) * .35
    s = math.sin(phase) * env + click
    out.append((s, s * .94))
peak = max(max(abs(l), abs(r)) for l, r in out)
k = 10 ** (-3 / 20) / peak
with wave.open(str(Path(__file__).with_name('tap.wav')), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b''.join(struct.pack('<hh', int(l * k * 32767), int(r * k * 32767)) for l, r in out))
print('tap.wav', round(LENGTH, 2), 's')
