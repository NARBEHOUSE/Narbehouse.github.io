"""NARBE Space Explorer - put the title on the hero render for the hub's game grid (dev-only).

    node tools/hero.cjs <hero.png>
    python tools/hub-image.py <hero.png> <hub>/bennyshub/images/games/narbespaceexplorer.png

In the style of the other NARBE pictures (from NARBE Build n Ride's hub-image.py): a small blue
NARBE pill, the title in chunky letters with a dark outline, and a white tagline pill.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_BIG = 'C:/Windows/Fonts/seguibl.ttf'      # Segoe UI Black
FONT_PILL = 'C:/Windows/Fonts/ARLRDBD.TTF'     # Arial Rounded MT Bold
INK = (12, 10, 30, 255)


def text_with_outline(draw, xy, text, font, fill, outline, width):
    x, y = xy
    for dx in range(-width, width + 1, 2):
        for dy in range(-width, width + 1, 2):
            if dx * dx + dy * dy <= width * width:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y + width), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def pill(d, x, y, text, font, bg, fg, pad=(22, 10)):
    w = d.textlength(text, font=font)
    box = font.getbbox(text)
    h = box[3] - box[1]
    d.rounded_rectangle((x, y, x + w + pad[0] * 2, y + h + pad[1] * 2 + 6), radius=(h + pad[1] * 2) // 2, fill=bg)
    d.text((x + pad[0], y + pad[1] - box[1] + 3), text, font=font, fill=fg)


def main(src, dst):
    img = Image.open(src).convert('RGBA').resize((1280, 720), Image.LANCZOS)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pill(d, 52, 40, 'NARBE', ImageFont.truetype(FONT_PILL, 34), (47, 107, 255, 255), (255, 255, 255, 255))
    big = ImageFont.truetype(FONT_BIG, 96)
    text_with_outline(d, (48, 104), 'SPACE', big, (255, 216, 74, 255), INK, 9)
    text_with_outline(d, (48, 214), 'EXPLORER', big, (157, 240, 255, 255), INK, 9)
    pill(d, 54, 352, 'Somewhere new, every time', ImageFont.truetype(FONT_PILL, 30), (255, 255, 255, 240), INK)
    Image.alpha_composite(img, layer).convert('RGB').save(dst)
    print(dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
