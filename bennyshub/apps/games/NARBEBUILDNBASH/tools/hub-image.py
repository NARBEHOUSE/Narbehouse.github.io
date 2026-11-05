"""NARBE Build n Bash - put the title on a hero render for the hub's game grid (dev-only).

    node tools/shot.cjs hero castle wreck --at 1.3 --out <tmp>/hero.png
    python tools/hub-image.py <tmp>/hero.png <hub>/bennyshub/images/games/narbebuildnbash.png

Draws, in the style of the NARBE Racer picture: a small blue NARBE pill, the
title in chunky letters with a dark outline, and a white tagline pill.
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT_BIG = 'C:/Windows/Fonts/seguibl.ttf'      # Segoe UI Black
FONT_PILL = 'C:/Windows/Fonts/ARLRDBD.TTF'     # Arial Rounded MT Bold


def text_with_outline(draw, xy, text, font, fill, outline, width):
    x, y = xy
    for dx in range(-width, width + 1, 2):
        for dy in range(-width, width + 1, 2):
            if dx * dx + dy * dy <= width * width:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y + width), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def main(src, dst):
    img = Image.open(src).convert('RGBA').resize((1280, 720), Image.LANCZOS)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # A soft dark wash behind the title so it reads on any background.
    wash = Image.new('RGBA', img.size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    wd.rounded_rectangle((20, 14, 640, 290), radius=60, fill=(10, 16, 40, 120))
    wash = wash.filter(ImageFilter.GaussianBlur(28))
    img = Image.alpha_composite(img, wash)

    pill = ImageFont.truetype(FONT_PILL, 34)
    d.rounded_rectangle((60, 34, 300, 92), radius=18, fill=(47, 111, 208, 255), outline=(16, 32, 70, 255), width=4)
    d.text((180, 63), 'N A R B E', font=pill, fill='white', anchor='mm')

    big = ImageFont.truetype(FONT_BIG, 104)
    text_with_outline(d, (52, 92), 'BUILD', big, (255, 216, 74, 255), (29, 26, 20, 255), 9)
    small = ImageFont.truetype(FONT_BIG, 60)
    text_with_outline(d, (392, 128), 'n', small, (255, 255, 255, 255), (29, 26, 20, 255), 7)
    text_with_outline(d, (452, 92), 'BASH', big, (255, 107, 94, 255), (29, 26, 20, 255), 9)

    tag = ImageFont.truetype(FONT_PILL, 30)
    d.rounded_rectangle((60, 232, 560, 284), radius=26, fill=(250, 246, 236, 255), outline=(29, 26, 20, 255), width=4)
    d.text((310, 258), 'BUILD IT UP. KNOCK IT DOWN.', font=tag, fill=(29, 36, 51, 255), anchor='mm')

    out = Image.alpha_composite(img, layer).convert('RGB')
    out.save(dst, optimize=True)
    print('wrote', dst, out.size)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
