"""Render recorded gameplay positions and actual sprite frames for visual review.

Run node art/gameplaycheck.js --record, then python art/playback.py.
This is a simulation replay, not a screenshot of Phaser's renderer.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fieldmock import draw_field, sprite

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / 'images/players'
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 11)
title = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 21)
assets = {}
for key, stem in [('player_base', 'gridiron'), ('player_actions_base', 'gridiron_actions')]:
    meta = json.loads((ASSETS / (stem + '.json')).read_text())
    # fieldmock's sprite helper accepts an atlas row relative to run.
    meta['anims']['run'] = {'row': 0}
    assets[key] = (np.asarray(Image.open(ASSETS / (stem + '_base.png'))),
                   np.asarray(Image.open(ASSETS / (stem + '_jersey.png'))), meta)

record = json.loads((HERE / 'out/playback.json').read_text())
frames = []
for frame in record['frames']:
    img = Image.new('RGBA', (1000, 600), '#0b1512')
    d = ImageDraw.Draw(img); d._image = img; draw_field(d)
    d.text((80, 28), "OUTSIDE RUN / SIMULATION REPLAY", font=title, fill='white')
    d.text((80, 66), 'Handoff, lead blocks, pursuit angles and contact | %.2fs' % (frame['time']/1000), font=font, fill='#adcab7')
    d.line((360,120,360,500), fill='#62aeff', width=2)
    for i,p in sorted(enumerate(frame['players']), key=lambda pair: pair[1]['y']):
        base, jersey, meta = assets[p['sheet']]
        sprite(img,p['x'],p['y'],base,jersey,meta,'#d32f2f' if i<6 else '#1565c0',
               p['frame']%8,p['frame']//8,p['role'],font,i==frame['ball'])
    frames.append(img.convert('RGB'))
frames[0].save(HERE/'out/gameplay-replay.gif',save_all=True,append_images=frames[1:],duration=33,loop=0)
strip=Image.new('RGB',(1500,600),'#0b1512')
for i,index in enumerate([0,8,18,27,37,len(frames)-1]):
    strip.paste(frames[min(index,len(frames)-1)].resize((500,300)),((i%3)*500,(i//3)*300))
strip.save(HERE/'gameplay-motion-review.png')

# Every direction of the supplemental poses, at double the shipped cell size.
sheet=Image.new('RGBA',(1024,432),'#276b2c'); d=ImageDraw.Draw(sheet)
base, jersey, meta=assets['player_actions_base']
for row,(name,atlas_row) in enumerate([('BLOCK',11),('GET UP',4),('CELEBRATE',18)]):
    d.text((10,row*144+8),name,font=title,fill='white')
    for direction in range(8):
        b=Image.fromarray(base[atlas_row*64:(atlas_row+1)*64,direction*64:(direction+1)*64])
        j=jersey[atlas_row*64:(atlas_row+1)*64,direction*64:(direction+1)*64].astype(float)
        j[...,:3]*=np.array([211,47,47])/255
        cell=Image.fromarray(j.astype('uint8'));cell.alpha_composite(b)
        sheet.alpha_composite(cell.resize((112,112),Image.Resampling.NEAREST),(direction*128,row*144+30))
sheet.convert('RGB').save(HERE/'out/action-review.png')
print('Wrote gameplay-motion-review.png, out/gameplay-replay.gif and out/action-review.png')
