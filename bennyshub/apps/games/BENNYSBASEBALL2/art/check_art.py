"""Verify shipped frame geometry, silhouettes and contact anchors."""
import json,subprocess
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
script="const fs=require('fs'),vm=require('vm'),c={};vm.createContext(c);for(const f of ['player-art','sprites'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),c);console.log(vm.runInContext('JSON.stringify({art:BASEBALL_ART,sheets:BB2_SHEETS,cell:BB2_CELL})',c));"
data=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True))
cell=data['cell'];frames=0
for key,art in data['art'].items():
    atlas=Image.open(ROOT/data['sheets'][key]['file']).convert('RGBA')
    materials=Image.open(ROOT/art['materialFile']).convert('RGB')
    assert materials.size==atlas.size,(key,'material dimensions')
    assert max(atlas.size)<=4096,(key,atlas.size)
    assert atlas.width%cell==0 and atlas.height%cell==0
    for i,anchors in enumerate(art['anchors']):
        x=(i%8)*cell;y=(i//8)*cell;frame=np.array(atlas.crop((x,y,x+cell,y+cell)));a=frame[...,3]
        assert a.max()==255,(key,i,'empty')
        assert not np.any(a[[0,-1],:]) and not np.any(a[:,[0,-1]]),(key,i,'cropped')
        assert not np.any((frame[...,1]>230)&(frame[...,0]<3)&(frame[...,2]<3)&(a>0)),(key,i,'chroma leak')
        m=np.array(materials.crop((x,y,x+cell,y+cell)))
        assert not np.any(m[[0,-1],:]) and not np.any(m[:,[0,-1]]),(key,i,'halo cropped')
        assert not np.any(m[...,:2][a==0]),(key,i,'material outside body')
        assert np.all(m[...,2]>=a),(key,i,'halo erases body')
        assert not np.any(frame[...,:3][a==0]),(key,i,'RGB outside silhouette')
        p=frame[...,:3].astype(float)
        assert not np.any((p[...,2]>p[...,1]*1.25)&(p[...,1]>p[...,0]*3)),(key,i,'jersey encoding leaked')
        assert not np.any((p[...,0]>p[...,1]*3)&(p[...,2]>p[...,1]*3)),(key,i,'skin encoding leaked')
        for part,point in anchors.items():assert all(np.isfinite(v) and 0<v<cell for v in point),(key,i,part)
        frames+=1
    for name,c in art['anims'].items():
        assert c['start']+c['count']<=len(art['anchors'])
        assert 0<=c['contactFrame']<c['count']
print('Verified',frames,'frames: clean transparency, separate material/halo masks, no chroma leaks or cropping, contact anchors and complete clips.')
