"""Chasing Rainbows - web copies of Inclusive Imagination's card art, and the hub thumbnail.

The masters in REFERENCE DATA/Game Art stay untouched. This writes:
  img/cards/<type>.webp   480 px wide, one per card type, plus back.webp
  ../../../images/games/chasingrainbows.png   the hub's 1366x768 thumbnail

Run from anywhere:  python tools/make-card-art.py
Each file is written to a temp name and moved into place, so a failure never leaves a
half-written image behind.
"""
import math
import os
import shutil

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'REFERENCE DATA', 'Game Art')
OUT = os.path.join(GAME, 'img', 'cards')
THUMB = os.path.normpath(os.path.join(GAME, '..', '..', '..', 'images', 'games', 'chasingrainbows.png'))

SOURCES = {
    'red': 'Color Combo Cards/Red.png', 'orange': 'Color Combo Cards/Orange.png',
    'yellow': 'Color Combo Cards/Yellow.png', 'green': 'Color Combo Cards/Green.png',
    'blue': 'Color Combo Cards/Blue.png', 'indigo': 'Color Combo Cards/Indigo.png',
    'violet': 'Color Combo Cards/Violet.png', 'wild': 'Color Combo Cards/Wild.png',
    'sun': 'Core Combo Cards/Sun.png', 'rain': 'Core Combo Cards/Rain.png',
    'day': 'Legend Combo Cards/Day.png', 'night': 'Legend Combo Cards/Night.png',
    'cloud': 'Weather Action Cards/Cloud.png', 'double': 'Weather Action Cards/Double Rainbow.png',
    'fog': 'Weather Action Cards/Fog.png', 'storm': 'Weather Action Cards/Storm.png',
    'wind': 'Weather Action Cards/Wind.png', 'back': 'Card Back.png',
}
WIDTH = 480


def save(img, path, **kw):
    tmp = path + '.tmp'
    img.save(tmp, **kw)
    shutil.move(tmp, path)


def load(name):
    return Image.open(os.path.join(ART, SOURCES[name])).convert('RGBA')


def card_copies():
    os.makedirs(OUT, exist_ok=True)
    for name in SOURCES:
        img = load(name)
        h = round(img.height * WIDTH / img.width)
        small = img.resize((WIDTH, h), Image.LANCZOS)
        path = os.path.join(OUT, name + '.webp')
        save(small, path, format='WEBP', quality=88, method=6)
        print('%-8s %4d KB' % (name, os.path.getsize(path) // 1024))


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius, fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


def thumbnail():
    W, H = 1366, 768
    # Sky: deep azure to a pale horizon.
    sky = Image.new('RGB', (W, H))
    px = sky.load()
    for y in range(H):
        t = y / H
        r, g, b = (int(30 + 150 * t), int(110 + 120 * t), int(220 + 30 * t))
        for x in range(W):
            px[x, y] = (r, g, b)
    sky = sky.convert('RGBA')
    # A soft rainbow arc behind everything.
    bow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(bow)
    bands = [(255, 10, 60), (255, 128, 0), (255, 222, 0), (146, 216, 0), (0, 180, 232), (122, 74, 216), (213, 72, 214)]
    cx, cy, r0, band = W // 2, int(H * 1.05), 640, 26
    for i, col in enumerate(bands):
        r = r0 - i * band
        d.arc([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=col + (150,), width=band)
    bow = bow.filter(ImageFilter.GaussianBlur(3))
    sky.alpha_composite(bow)
    # Soft clouds.
    clouds = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(clouds)
    for (x, y, s) in [(160, 120, 1.0), (1180, 90, 0.8), (1040, 210, 0.6), (300, 250, 0.55)]:
        for dx, dy, rr in [(-60, 10, 50), (0, -15, 65), (60, 5, 52), (110, 20, 38), (-110, 22, 36)]:
            rr = int(rr * s)
            cd.ellipse([x + dx * s - rr, y + dy * s - rr, x + dx * s + rr, y + dy * s + rr], fill=(255, 255, 255, 230))
    clouds = clouds.filter(ImageFilter.GaussianBlur(6))
    sky.alpha_composite(clouds)
    # A fan of cards: the seven colors, then Sun and Rain, with a few weather cards behind.
    fan = ['storm', 'wind', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'sun', 'rain', 'fog']
    cw = 190
    ch = round(cw * 1547 / 1016)
    n = len(fan)
    for i, name in enumerate(fan):
        img = rounded(load(name).resize((cw, ch), Image.LANCZOS), 14)
        angle = (i - (n - 1) / 2) * 7.5
        rot = img.rotate(-angle, resample=Image.BICUBIC, expand=True)
        # Shadow.
        shadow = Image.new('RGBA', rot.size, (0, 0, 0, 0))
        shadow.putalpha(rot.getchannel('A').point(lambda a: int(a * 0.35)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(8))
        rad = math.radians(angle)
        x = int(W / 2 + math.sin(rad) * 900 - rot.width / 2)
        y = int(H - 330 + (1 - math.cos(rad)) * 900 - rot.height / 2 + 75)
        sky.alpha_composite(shadow, (x + 6, y + 10))
        sky.alpha_composite(rot, (x, y))
    # Title.
    font_path = os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts', 'ARLRDBD.TTF')
    font = ImageFont.truetype(font_path, 112) if os.path.exists(font_path) else ImageFont.load_default()
    title = 'Chasing Rainbows'
    td = ImageDraw.Draw(sky)
    box = td.textbbox((0, 0), title, font=font)
    tx, ty = (W - (box[2] - box[0])) // 2, 70
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text((tx, ty), title, font=font, fill=(0, 0, 0, 200), stroke_width=10, stroke_fill=(0, 0, 0, 200))
    sky.alpha_composite(glow.filter(ImageFilter.GaussianBlur(6)))
    td.text((tx, ty), title, font=font, fill=(255, 255, 255, 255), stroke_width=6, stroke_fill=(20, 20, 40, 255))
    save(sky.convert('RGB'), THUMB, format='PNG', optimize=True)
    print('thumbnail', THUMB, os.path.getsize(THUMB) // 1024, 'KB')


if __name__ == '__main__':
    card_copies()
    thumbnail()
