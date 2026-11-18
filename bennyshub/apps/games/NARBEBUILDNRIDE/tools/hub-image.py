"""NARBE Build n Ride - put the title on a hero render for the hub's game grid (dev-only).

    node tools/shot.cjs hero        (prints the path of the PNG it wrote)
    python tools/hub-image.py <that PNG> <hub>/bennyshub/images/games/narbebuildnride.png

Draws, in the style of the NARBE Build n Bash picture: a small blue NARBE pill, the
title in chunky letters with a dark outline, and a white tagline pill.
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT_BIG = 'C:/Windows/Fonts/seguibl.ttf'      # Segoe UI Black
FONT_PILL = 'C:/Windows/Fonts/ARLRDBD.TTF'     # Arial Rounded MT Bold
INK = (29, 26, 20, 255)


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

    big = ImageFont.truetype(FONT_BIG, 104)
    small = ImageFont.truetype(FONT_BIG, 60)
    w_build = d.textlength('BUILD', font=big)
    w_n = d.textlength('n', font=small)
    x_n = 52 + w_build + 18
    x_ride = x_n + w_n + 18
    w_ride = d.textlength('RIDE', font=big)
    right = int(x_ride + w_ride)

    # A soft dark wash behind the title so it reads on the bright sky.
    wash = Image.new('RGBA', img.size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    wd.rounded_rectangle((20, 14, right + 40, 290), radius=60, fill=(10, 16, 40, 120))
    wash = wash.filter(ImageFilter.GaussianBlur(28))
    img = Image.alpha_composite(img, wash)

    pill = ImageFont.truetype(FONT_PILL, 34)
    d.rounded_rectangle((60, 34, 300, 92), radius=18, fill=(47, 111, 208, 255), outline=(16, 32, 70, 255), width=4)
    d.text((180, 63), 'N A R B E', font=pill, fill='white', anchor='mm')

    text_with_outline(d, (52, 92), 'BUILD', big, (255, 216, 74, 255), INK, 9)
    text_with_outline(d, (x_n, 128), 'n', small, (255, 255, 255, 255), INK, 7)
    text_with_outline(d, (x_ride, 92), 'RIDE', big, (126, 217, 87, 255), INK, 9)

    tag = ImageFont.truetype(FONT_PILL, 30)
    words = 'BUILD A TRACK. TAKE A RIDE.'
    tw = d.textlength(words, font=tag)
    d.rounded_rectangle((60, 232, 60 + tw + 50, 284), radius=26, fill=(250, 246, 236, 255), outline=INK, width=4)
    d.text((60 + (tw + 50) / 2, 258), words, font=tag, fill=(29, 36, 51, 255), anchor='mm')

    out = Image.alpha_composite(img, layer).convert('RGB')
    out.save(dst, optimize=True)
    print('wrote', dst, out.size)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
