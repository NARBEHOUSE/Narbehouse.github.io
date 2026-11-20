"""NARBE Space Explorer - draw Explore System's page over tools/explore-shot.cjs's render (dev-only).

    python tools/explore-overlay.py <out-dir>        (reads shot.png + shot.json, writes preview.png)

A mock-up of css/style.css's survey screen for checking the layout on a PC where browsers are
off-limits: the star's glow (sprites are not in the CPU render), a ring and name over each world
(the highlighted one in the hub's colour-and-band style with a big label), You, the title box top
left and the bottom panel (what the highlighted world is, and Back). Fonts are stand-ins for
Baloo 2.
"""
import json
import os
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

BOLD = 'C:/Windows/Fonts/ARLRDBD.TTF'      # Arial Rounded MT Bold, standing in for Baloo 2


def font(size):
    return ImageFont.truetype(BOLD, size)


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shadow_text(d, xy, text, f, fill, anchor='la'):
    x, y = xy
    for dx, dy in ((0, 2), (1, 1), (-1, 1), (0, 3)):
        d.text((x + dx, y + dy), text, font=f, fill=(0, 0, 0, 230), anchor=anchor)
    d.text((x, y), text, font=f, fill=fill, anchor=anchor)


def main(out):
    info = json.load(open(os.path.join(out, 'shot.json')))
    W, H = info['size']
    base = Image.open(os.path.join(out, 'shot.png')).convert('RGB')

    # The star's glow sprites (4.2 and 11 star radii across), added on top like WebGL does.
    st = info.get('star')
    if st:
        glow = Image.new('RGB', (W, H), (0, 0, 0))
        gd = ImageDraw.Draw(glow)
        c, li = hexrgb(st['color']), hexrgb(st['light'])
        for radius, col, k in ((st['r'] * 5.5, li, 0.22), (st['r'] * 2.1, c, 0.75)):
            for i in range(24, 0, -1):
                rr = radius * i / 24
                a = k * (1 - i / 24) ** 2.2
                gd.ellipse((st['x'] - rr, st['y'] - rr, st['x'] + rr, st['y'] + rr), fill=tuple(int(v * a) for v in col[:3]))
        base = ImageChops.add(base, glow.filter(ImageFilter.GaussianBlur(4)))

    img = base.convert('RGBA')
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    hl, ink = hexrgb(info['highlight']), hexrgb(info['ink'])

    # Rings and names (the highlighted one last, on top).
    pins = sorted([p for p in info['pins'] if p['on']], key=lambda p: p['focus'])
    for p in pins:
        x, y, R = p['x'], p['y'], p['R']
        if not p['focus']:
            d.ellipse((x - R - 2, y - R - 2, x + R + 2, y + R + 2), outline=(0, 0, 0, 128), width=2)
            d.ellipse((x - R, y - R, x + R, y + R), outline=(225, 238, 255, 153), width=3)
            if not p.get('quiet'):
                shadow_text(d, (x, y + R + 5), p['name'], font(19), (232, 240, 255, 255), anchor='mt')
        else:
            d.ellipse((x - R - 14, y - R - 14, x + R + 14, y + R + 14), outline=ink, width=14)
            d.ellipse((x - R - 12, y - R - 12, x + R + 12, y + R + 12), outline=hl, width=8)
            f = font(32)
            tw = d.textlength(p['name'], font=f)
            top = y + R + 22
            d.rounded_rectangle((x - tw / 2 - 19, top - 3, x + tw / 2 + 19, top + 45), radius=17, fill=ink)
            d.rounded_rectangle((x - tw / 2 - 16, top, x + tw / 2 + 16, top + 42), radius=14, fill=hl)
            d.text((x, top + 21), p['name'], font=f, fill=ink, anchor='mm')

    # You are here.
    you = info['you']
    if you['on']:
        x, y = you['x'], you['y']
        d.ellipse((x - 14, y - 14, x + 14, y + 14), fill=(16, 22, 42, 255))
        d.ellipse((x - 11, y - 11, x + 11, y + 11), fill=(255, 216, 74, 255))
        shadow_text(d, (x, y + 17), 'You', font(18), (255, 216, 74, 255), anchor='mt')

    # Title box, top left (.nse-info).
    name, sub = info['head']
    fn, fs = font(27), font(19)
    bw = max(d.textlength(name, font=fn), d.textlength(sub, font=fs)) + 36
    d.rounded_rectangle((16, 16, 16 + bw, 16 + 80), radius=20, fill=(10, 16, 40, 189), outline=(150, 190, 255, 61), width=2)
    d.text((34, 26), name, font=fn, fill=(255, 255, 255, 255))
    d.text((34, 60), sub, font=fs, fill=(207, 216, 240, 255))

    # The bottom panel (.nse-card-survey): the highlighted world, and Back.
    pw, ph = min(1000, int(W * 0.96)), 104
    px, py = (W - pw) // 2, H - 16 - ph
    d.rounded_rectangle((px, py, px + pw, py + ph), radius=30, fill=(10, 16, 40, 209), outline=(150, 190, 255, 71), width=2)
    cap = info['caption']
    tx = px + 22
    orb = info.get('orb')
    if orb:
        ox, oy = px + 22, py + ph // 2 - 32
        if 'star' in orb:
            d.ellipse((ox, oy, ox + 64, oy + 64), fill=hexrgb(orb['star']))
        else:
            d.ellipse((ox, oy, ox + 64, oy + 64), fill=hexrgb(orb['mid']))
            d.ellipse((ox + 10, oy + 8, ox + 40, oy + 34), fill=hexrgb(orb['high'], 150))
            if orb.get('rings'):
                d.ellipse((ox - 12, oy + 24, ox + 76, oy + 40), outline=(230, 210, 170, 220), width=3)
        tx = ox + 64 + 16
    d.text((tx, py + 12), cap[0], font=font(36), fill=(255, 255, 255, 255))
    d.text((tx, py + 54), cap[1], font=font(21), fill=(157, 240, 255, 255))
    if cap[2]:
        d.text((tx, py + 79), cap[2], font=font(18), fill=(255, 216, 74, 255))
    bx0, bx1, by0, by1 = px + pw - 16 - 190, px + pw - 16, py + 14, py + ph - 20
    d.rounded_rectangle((bx0, by0 + 6, bx1, by1 + 6), radius=20, fill=(46, 54, 68, 255))
    d.rounded_rectangle((bx0, by0, bx1, by1), radius=20, fill=(74, 85, 104, 255))
    d.rounded_rectangle((bx0 + 12, by0 + 9, bx0 + 64, by1 - 9), radius=15, fill=(255, 255, 255, 51))
    d.line((bx0 + 44, by0 + 22, bx0 + 32, (by0 + by1) // 2, bx0 + 44, by1 - 22), fill=(255, 255, 255, 255), width=5)
    d.text((bx0 + 80, (by0 + by1) // 2), 'Back', font=font(30), fill=(255, 255, 255, 255), anchor='lm')

    Image.alpha_composite(img, layer).convert('RGB').save(os.path.join(out, 'preview.png'))
    print(os.path.join(out, 'preview.png'))


if __name__ == '__main__':
    main(sys.argv[1])
