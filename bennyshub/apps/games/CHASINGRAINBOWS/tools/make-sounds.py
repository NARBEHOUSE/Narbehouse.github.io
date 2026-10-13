"""Chasing Rainbows - synthesise the game's sounds (no recordings, no downloads).

Writes sound/*.wav, mono 16-bit 22.05 kHz. Played through the hub's SafeAudio (plain
HTML5 audio - never the Web Audio API, which can crash the Electron renderer).

House rules for sound (bennyshub feedback): anything heard every turn is short (< 0.4 s),
soft-attacked, quiet and below about 2.5 kHz. Bright sounds are saved for rare moments
(a rainbow, a win). Weather is low and breathy, never shrill.

Run from anywhere:  python tools/make-sounds.py
"""
import math
import os
import random
import shutil
import struct
import wave

RATE = 22050
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'sound')
rng = random.Random(20261012)


def write(name, samples, peak=0.5):
    """Normalise to `peak` (0..1 of full scale) and write atomically."""
    top = max(1e-9, max(abs(s) for s in samples))
    k = peak / top
    path = os.path.join(OUT, name + '.wav')
    tmp = path + '.tmp'
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s * k)) * 32767)) for s in samples))
    shutil.move(tmp, path)
    print('%-10s %5.2f s %4d KB' % (name, len(samples) / RATE, os.path.getsize(path) // 1024))


def n(sec):
    return int(sec * RATE)


def noise(count):
    return [rng.uniform(-1, 1) for _ in range(count)]


def lowpass(xs, cutoff):
    a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    y, out = 0.0, []
    for x in xs:
        y += a * (x - y)
        out.append(y)
    return out


def highpass(xs, cutoff):
    lp = lowpass(xs, cutoff)
    return [x - l for x, l in zip(xs, lp)]


def bandpass(xs, lo, hi):
    return lowpass(highpass(xs, lo), hi)


def env(count, attack, release, shape=2.0):
    """Attack/release envelope over `count` samples (seconds for attack, release)."""
    a, r = max(1, n(attack)), max(1, n(release))
    out = []
    for i in range(count):
        v = 1.0
        if i < a:
            v = (i / a) ** 1.5
        if i > count - r:
            v *= max(0.0, (count - i) / r) ** shape
        out.append(v)
    return out


def mul(xs, ys):
    return [x * y for x, y in zip(xs, ys)]


def mix(*tracks):
    size = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(size)]


def tone(freq, sec, decay=4.0, attack=0.01, harmonics=((1, 1.0), (2, 0.25), (3, 0.08))):
    count = n(sec)
    out = []
    for i in range(count):
        t = i / RATE
        e = min(1, t / attack) * math.exp(-decay * t)
        out.append(e * sum(a * math.sin(2 * math.pi * freq * h * t) for h, a in harmonics))
    return out


def at(track, sec, total):
    pad = [0.0] * n(sec)
    return (pad + track + [0.0] * total)[:n(sec) + len(track)]


def card():
    # A soft card slide: a short burst of filtered noise with a quick fall.
    count = n(0.16)
    xs = bandpass(noise(count), 500, 1900)
    return mul(xs, env(count, 0.008, 0.13, 2.5))


def shuffle():
    # A riffle: a run of tiny card clicks.
    total = n(0.75)
    out = [0.0] * total
    t = 0.02
    while t < 0.68:
        click = mul(bandpass(noise(n(0.03)), 700, 2200), env(n(0.03), 0.002, 0.025))
        start = n(t)
        for i, v in enumerate(click):
            if start + i < total:
                out[start + i] += v * rng.uniform(0.6, 1.0)
        t += rng.uniform(0.018, 0.034)
    return mul(out, env(total, 0.05, 0.2))


def chime():
    # A gentle rainbow arpeggio, C major, all below 2.1 kHz.
    notes = [523.25, 659.25, 783.99, 1046.5]
    total = n(1.6)
    parts = [at(tone(f, 1.2, decay=3.2), i * 0.11, total) for i, f in enumerate(notes)]
    return mix(*parts)


def turn():
    # "Your turn": two soft notes, G4 then C5, very short.
    total = n(0.36)
    return mix(at(tone(392.0, 0.25, decay=9), 0, total), at(tone(523.25, 0.25, decay=9), 0.1, total))


def whoosh():
    # A gust: band-passed noise that swells and passes.
    count = n(1.3)
    xs = noise(count)
    out, y1, y2 = [], 0.0, 0.0
    for i, x in enumerate(xs):
        p = i / count
        cutoff = 300 + 900 * math.sin(math.pi * p)
        a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
        y1 += a * (x - y1)
        y2 += a * (y1 - y2)
        out.append(y2)
    out = highpass(out, 120)
    return mul(out, [math.sin(math.pi * i / count) ** 1.6 for i in range(count)])


def thunder():
    # Distant thunder: brown noise, low-passed hard, rolling in two swells.
    count = n(2.8)
    b, xs = 0.0, []
    for _ in range(count):
        b = 0.985 * b + rng.uniform(-1, 1) * 0.15
        xs.append(b)
    xs = lowpass(lowpass(xs, 180), 220)
    shape = []
    for i in range(count):
        t = i / RATE
        shape.append(min(1, t / 0.25) * (0.55 * math.exp(-1.6 * t) + 0.6 * math.exp(-((t - 0.9) ** 2) / 0.18)))
    return mul(xs, shape)


def fog():
    # A soft breath of low noise with a faint hum underneath.
    count = n(1.6)
    xs = lowpass(lowpass(noise(count), 500), 700)
    hum = [0.18 * math.sin(2 * math.pi * 110 * i / RATE) for i in range(count)]
    return mul(mix(xs, hum), env(count, 0.5, 0.8, 1.5))


def puff():
    # A cloud puff: a short soft thump of filtered noise.
    count = n(0.45)
    xs = lowpass(noise(count), 600)
    return mul(xs, env(count, 0.02, 0.4, 2.0))


def night():
    # "Night, night": a slow falling lullaby, three notes.
    notes = [783.99, 659.25, 523.25]
    total = n(2.2)
    return mix(*[at(tone(f, 1.4, decay=2.2, attack=0.04), i * 0.42, total) for i, f in enumerate(notes)])


def sparkle():
    # The win: a rising run of light bell notes (rare, so it may be brighter).
    notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0, 2093.0]
    total = n(2.0)
    parts = [at(tone(f, 1.0, decay=3.5, harmonics=((1, 1.0), (2, 0.15))), i * 0.09, total) for i, f in enumerate(notes)]
    return mix(*parts)


def rain_loop():
    # A gentle rain bed that loops seamlessly: hissing noise plus scattered drops,
    # with the last second cross-faded into the first.
    sec, fade = 6.0, 1.0
    count = n(sec + fade)
    hiss = lowpass(highpass(noise(count), 900), 2400)
    drops = [0.0] * count
    for _ in range(int(55 * (sec + fade))):
        start = rng.randrange(count - n(0.04))
        f = rng.uniform(900, 2200)
        for i in range(n(0.03)):
            t = i / RATE
            drops[start + i] += 0.25 * math.sin(2 * math.pi * f * t) * math.exp(-160 * t)
    xs = mix([h * 0.6 for h in hiss], drops)
    body, tail = xs[:n(sec)], xs[n(sec):]
    for i in range(len(tail)):
        w = i / len(tail)
        body[i] = body[i] * w + tail[i] * (1 - w)
    return body


def note(i):
    # One soft bell for each card of a Rainbow as it lands: C major from C5 up, all below 1.1 kHz.
    freqs = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5]
    return tone(freqs[i], 0.5, decay=6.5, harmonics=((1, 1.0), (2, 0.18), (3, 0.05)))


def slam():
    # A played card landing in the spotlight: a short, low, soft thump.
    count = n(0.26)
    body = [0.8 * math.sin(2 * math.pi * (140 - 60 * i / count) * i / RATE) for i in range(count)]
    air = lowpass(noise(count), 400)
    return mul(mix(body, [a * 0.5 for a in air]), env(count, 0.004, 0.22, 2.5))


def pop():
    # A player's reaction bubble: a tiny, soft pop.
    count = n(0.12)
    return mul([math.sin(2 * math.pi * (420 + 500 * i / count) * i / RATE) for i in range(count)], env(count, 0.003, 0.1, 2.0))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    write('card', card(), 0.32)
    write('shuffle', shuffle(), 0.32)
    write('turn', turn(), 0.30)
    write('chime', chime(), 0.45)
    write('whoosh', whoosh(), 0.45)
    write('thunder', thunder(), 0.60)
    write('fog', fog(), 0.35)
    write('puff', puff(), 0.40)
    write('night', night(), 0.45)
    write('sparkle', sparkle(), 0.50)
    write('rain', rain_loop(), 0.30)
    for i in range(8):
        write('note%d' % i, note(i), 0.30)
    write('slam', slam(), 0.40)
    write('pop', pop(), 0.22)
