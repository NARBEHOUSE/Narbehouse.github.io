"""Render the actual simulation record, not a hand-authored animation mockup.
Run node art/check_game.js --record first, then python art/render_replay.py.
"""
import json,subprocess
from pathlib import Path
import numpy as np
from build_players import colorize
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
record=json.loads((ROOT/'art/out/replay.json').read_text())
probe="const fs=require('fs'),vm=require('vm'),c={};vm.createContext(c);for(const f of ['player-art','sprites'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),c);console.log(vm.runInContext('JSON.stringify({foot:BASEBALL_ART_FOOT,display:BB2_DISPLAY,cell:BB2_CELL})',c));"
art=json.loads(subprocess.check_output(['node','-e',probe],cwd=ROOT,text=True))
display=art['display'];cell=art['cell'];offset=display*(.5-art['foot']/cell)
sheets={}
for path in (ROOT/'images/sprites').glob('*.png'):
    if path.stem.endswith('-materials'):continue
    for team,rgb in [('red',[210,55,45]),('blue',[40,92,192])]:
        material_path=path.with_stem(path.stem+'-materials')
        if material_path.exists():
            sheets[path.stem,team]=colorize(Image.open(path).convert('RGBA'),Image.open(material_path),team=rgb)
            continue
        a=np.array(Image.open(path).convert('RGBA'));p=a[...,:3].astype(float)
        jersey=(p[...,2]>p[...,1]*1.25)&(p[...,1]>p[...,0]*3)
        skin=(p[...,0]>p[...,1]*3)&(p[...,2]>p[...,1]*3)
        rim=np.all(p==74,axis=2);a[rim,3]=0
        p[jersey]=np.minimum(255,p[...,2][jersey,None]/195*np.array(rgb))
        p[skin]=np.minimum(255,p[...,0][skin,None]/240*np.array([227,169,125]));a[...,:3]=p
        sheets[path.stem,team]=Image.fromarray(a)
font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',15)
frames=[]
for f in record['frames']:
    im=Image.new('RGBA',(1000,600),'#1a4b36');d=ImageDraw.Draw(im)
    for y in range(50,540,40):d.rectangle((0,y,1000,y+20),fill='#20563a')
    d.polygon([(500,535),(296,399),(500,246),(704,399)],fill='#a9835c')
    d.polygon([(500,484),(370,398),(500,301),(630,398)],fill='#2e6d46')
    d.line([(90,210),(500,520),(910,210)],fill='#e5e4d5',width=2)
    d.ellipse((483,410,517,431),fill='#b7936a')
    for x,y in [(500,520),(665,398),(500,276),(335,398)]:d.polygon([(x-7,y),(x,y-5),(x+7,y),(x,y+5)],fill='#f8f5e9')
    for p in sorted(f['players'],key=lambda p:p['y']):
        team='red' if p['pos']=='B' else 'blue';idx=p['frame'];x=(idx%8)*cell;y=(idx//8)*cell
        sprite=sheets[p['sheet'],team].crop((x,y,x+cell,y+cell)).resize((display,display),Image.Resampling.LANCZOS)
        if p['flip']:sprite=sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        d.ellipse((p['x']-12,p['y']-3,p['x']+12,p['y']+5),fill='#163a29')
        im.alpha_composite(sprite,(round(p['x']-display/2),round(p['y']+offset-display/2)))
    ball=f['ball']
    if ball['visible'] and ball['alpha']>.1:d.ellipse((ball['x']-3,ball['y']-3,ball['x']+3,ball['y']+3),fill='white',outline='#c5cabf')
    d.text((22,20),'BASEBALL · %.2fs'%(f['time']/1000),font=font,fill='white')
    frames.append(im.convert('RGB'))
frames[0].save(ROOT/'art/out/baseball-replay.gif',save_all=True,append_images=frames[1:],duration=33,loop=0)
indices=[0,int(len(frames)*.2),int(len(frames)*.34),int(len(frames)*.5),int(len(frames)*.7),len(frames)-1]
review=Image.new('RGB',(1500,600))
for i,k in enumerate(indices):review.paste(frames[k].resize((500,300)),((i%3)*500,(i//3)*300))
review.save(ROOT/'art/out/baseball-play-review.png')
print('Rendered',len(frames),'recorded frames;',record['result'])
