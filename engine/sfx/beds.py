# Builds the built-in sounds other than whoosh (promo.json "sfx": [{"file": "<name>", ...}]), all synthesized here,
# so there is nothing to license:
#   ping.wav, ping2.wav  a soft glassy notification ding (two pitches, to scatter several over a "noisy" hook)
#   breath.wav           a slow deep inhale and exhale (~3 s), for the moment the chaos clears
#   pad.wav              a warm ambient pad (64 s, four slow chords twice), a music bed under the narration:
#                        {"file": "pad", "cue": "reveal", "until": "end", "fade": 1.5, "gain": -24}
# uv run --with numpy python beds.py
from pathlib import Path
import numpy as np

RATE = 48000
HERE = Path(__file__).parent
rng = np.random.default_rng(7)


def save(name, stereo, peak_db=-3.0):
    stereo = stereo / np.max(np.abs(stereo)) * 10 ** (peak_db / 20)
    pcm = (stereo * 32767).astype('<i2')
    import wave
    with wave.open(str(HERE / f'{name}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    print(f'{name}.wav {len(stereo) / RATE:.2f} s')


def ping(f0, length=0.9):
    t = np.arange(int(RATE * length)) / RATE
    # a struck glass: fundamental plus inharmonic partials that die faster, a 4 ms attack
    tone = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t * d) for r, a, d in [(1, 1, 5), (2.76, .35, 9), (5.4, .12, 16)])
    tone *= np.minimum(1, t / .004)
    return np.stack([tone, tone * .92], 1)


def band(noise, lo, hi):
    spec = np.fft.rfft(noise)
    f = np.fft.rfftfreq(len(noise), 1 / RATE)
    shape = np.clip((f - lo * .6) / (lo * .4), 0, 1) * np.clip((hi * 1.6 - f) / (hi * .6), 0, 1)
    return np.fft.irfft(spec * shape, len(noise))


def breath():
    def part(length, lo, hi, rise):
        n = int(RATE * length)
        t = np.linspace(0, 1, n)
        env = np.sin(np.pi * t ** (.6 if rise else 1.4)) ** 1.5
        return band(rng.uniform(-1, 1, n), lo, hi) * env
    inhale, exhale = part(1.35, 500, 3200, True) * .8, part(1.7, 250, 1500, False)
    gap = np.zeros(int(RATE * .18))
    mono = np.concatenate([inhale, gap, exhale])
    return np.stack([mono, mono * .95], 1)


def pad(chord_len=8.0):
    n4 = lambda m: 440 * 2 ** ((m - 69) / 12)  # midi → Hz
    chords = [[53, 57, 60, 64, 67], [57, 60, 64, 67, 72], [48, 55, 59, 62, 64], [55, 60, 62, 64, 67]]  # Fmaj9 Am7 Cmaj9 G6sus
    seq = chords * 2
    total = int(RATE * chord_len * len(seq))
    t = np.arange(total) / RATE
    out = np.zeros((total, 2))
    xf = 2.5  # crossfade between chords
    for k, chord in enumerate(seq):
        a, b = k * chord_len - xf, (k + 1) * chord_len + xf
        env = np.clip(np.minimum((t - a) / (2 * xf), (b - t) / (2 * xf)), 0, 1)
        env = np.sin(env * np.pi / 2) ** 2
        live = env > 0
        tt = t[live]
        for i, m in enumerate(chord + [chord[0] - 12]):  # plus the root an octave down
            f, level = n4(m), (.55 if i == len(chord) else 1) / (1 + i * .18)
            for ch, cents in ((0, -6), (1, 6)):  # slow chorus: each side a touch detuned
                fd = f * 2 ** (cents / 1200)
                # ±0.15 % vibrato at 0.13 Hz, integrated into the phase so the pitch never drifts
                ph = 2 * np.pi * fd * (tt - .0015 / (2 * np.pi * .13) * np.cos(2 * np.pi * .13 * tt + i))
                v = np.sin(ph) + .18 * np.sin(2 * ph)
                out[live, ch] += v * level * env[live]
    shimmer = .05 * np.sin(2 * np.pi * n4(84) * t) * (.5 + .5 * np.sin(2 * np.pi * .07 * t))
    out += np.stack([shimmer, shimmer * .8], 1)
    out[: int(RATE * 2)] *= np.linspace(0, 1, int(RATE * 2))[:, None] ** 2
    return out


save('ping', ping(1318.5))
save('ping2', ping(1760.0), -5)
save('breath', breath())
save('pad', pad(), -6)
