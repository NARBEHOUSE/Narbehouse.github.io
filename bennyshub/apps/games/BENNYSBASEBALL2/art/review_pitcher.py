"""Recreate the pitcher storyboard and game-speed GIF from the shipped atlas."""
import json
from PIL import Image, ImageDraw
from build_players import ROOT, colorize

meta=json.loads((ROOT/'js/player-art.js').read_text().split('const BASEBALL_ART = ')[1].split(';')[0])['pitcher-actions']
atlas=Image.open(ROOT/'images/sprites/pitcher-actions.png').convert('RGBA')
materials=Image.open(ROOT/meta['materialFile']).convert('RGB')
out=ROOT/'art/out';out.mkdir(exist_ok=True)

def frame(name,index):
    cell=meta['anims'][name]['start']+index
    x,y=(cell%8)*256,(cell//8)*256
    box=(x,y,x+256,y+256)
    return colorize(atlas.crop(box),materials.crop(box))

samples=[('Set','set',0),('Turn onto right leg','windup',4),
         ('Left knee lift / side profile','windup',11),('Stride toward home','windup',17),
         ('Front foot planted','windup',23),('Forward release','release',6),
         ('Trailing leg follows through','follow_through',5),('Step back to ready','follow_through',12)]
board=Image.new('RGB',(1280,640),'#20372e');draw=ImageDraw.Draw(board)
for i,(label,name,index) in enumerate(samples):
    x,y=i%4*320,i//4*320
    im=frame(name,index);board.paste(im,(x,y+32),im)
    small=im.resize((84,84),Image.Resampling.LANCZOS);board.paste(small,(x+230,y+180),small)
    draw.text((x+10,y+12),label,fill='white')
board.save(out/'pitcher-sequence-review.png')
frames=[];durations=[]
for name in ['set','windup','release','follow_through','fielding_stance']:
    clip=meta['anims'][name]
    for i in range(1 if clip['repeat']==-1 else clip['count']):
        page=Image.new('RGB',(384,300),'#20372e');draw=ImageDraw.Draw(page)
        label=name.replace('_',' ').title()
        if name=='release' and i==clip['contactFrame']:label+=' / ball leaves hand'
        draw.text((12,12),label,fill='white')
        im=frame(name,i);page.paste(im,(0,30),im)
        small=im.resize((84,84),Image.Resampling.LANCZOS);page.paste(small,(285,115),small)
        draw.text((285,210),'Game size',fill='white')
        frames.append(page);durations.append(600 if clip['repeat']==-1 else round(1000/clip['rate']))
frames[0].save(out/'pitching-motion.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0)
print('Updated pitcher storyboard and game-speed motion preview.')
