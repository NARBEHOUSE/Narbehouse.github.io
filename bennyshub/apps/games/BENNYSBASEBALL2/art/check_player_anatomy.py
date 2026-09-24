"""Check every shipped pose for shortened arms, torso clipping and unreadable on-deck forearms."""
import json
from pathlib import Path
import numpy as np
import build_players as art

meta=json.loads((art.ROOT/'js/player-art.js').read_text().split('const BASEBALL_ART = ')[1].split(';')[0])
frames=0;issues=[];jumps=[]
for sheet,data in meta.items():
    role='batter' if sheet in ['batter-actions','batter-walk'] else 'catcher' if sheet=='catcher' else 'runner' if sheet=='runner-actions' else 'outfielder' if sheet=='outfield-actions' else 'pitcher' if sheet=='pitcher-actions' else 'fielder'
    for name,clip in data['anims'].items():
        actual_role='runner' if role=='batter' and (name.startswith('run') or name=='take_off') else role
        for i in range(clip['count']):
            t=i/(clip['count'] if clip['repeat']==-1 else max(1,clip['count']-1))
            p=art.pose(name,t,actual_role);height=p['chest'][1]-p['hip'][1];frames+=1
            assert all(np.isfinite(p[k]).all() for k in ['hip','chest','le','re','lh','rh','lk','rk','lf','rf']), (sheet,name,i,'non-finite joint')
            for side,sign in [('l',1),('r',-1)]:
                upper,fore=(.235,.25) if actual_role in ['pitcher','batter'] and name!='on_deck' and not name.startswith('walk') else (.205,.22)
                shoulder=p['hip']+p['rot']@np.array([sign*.168,height-.047,0])+(p['chest']-p['hip']-[0,height,0])*((height-.047)/height)
                assert abs(np.linalg.norm(shoulder-p[side+'e'])-upper)<1e-6,(sheet,name,i,side,'short upper arm')
                assert abs(np.linalg.norm(p[side+'e']-p[side+'h'])-fore)<1e-6,(sheet,name,i,side,'short forearm')
                for a,b,start in [(shoulder,p[side+'e'],.62),(p[side+'e'],p[side+'h'],0)]:
                    points=np.array([a+(b-a)*u for u in np.linspace(start,1,31)]);ys=points[:,1]-p['hip'][1]
                    local=(points-p['hip']-(p['chest']-p['hip']-[0,height,0])*ys[:,None]/height)@p['rot']
                    clearance=(local[:,0]/.19)**2+(local[:,2]/.13)**2
                    clearance=np.where((ys>.045)&(ys<height+.015),clearance,10).min()
                    if clearance<.99:issues.append((sheet,name,i,side,'upper' if start else 'fore',round(float(clearance),3)))
        previous=None
        for t in np.linspace(0,1,201):
            p=art.pose(name,t,actual_role)
            if previous is not None:
                step=max(np.linalg.norm(p[k]-previous[k]) for k in ['le','re','lh','rh'])
                if step>.06:jumps.append((sheet,name,round(float(t),3),round(float(step),3)))
            previous=p
assert not issues,issues
assert not jumps,jumps

# Render each on-deck forearm alone and against the whole model's depth buffer.
# A fully authored forearm can still disappear behind the jersey or point into
# the camera; both visible coverage and projected length matter here.
p=art.pose('on_deck',0,'batter');original=art.Mesh.limb

def marked_limb(mesh,a,b,r1,r2,material,n=10):
    if material==2:
        for side,identifier in [('l',9),('r',10)]:
            elbow=p[side+'e'];axis=p[side+'h']-elbow
            if all(np.linalg.norm(np.cross(np.array(v)-elbow,axis))<1e-7 for v in [a,b]):material=identifier
    return original(mesh,a,b,r1,r2,material,n)
art.Mesh.limb=marked_limb
try:vertices,triangles,materials,_=art.build('on_deck',0,'batter')
finally:art.Mesh.limb=original
coverage=[]
for side,identifier in [('l',9),('r',10)]:
    colors=[[0,0,0] for _ in range(11)];colors[identifier]=[1,1,1]
    view=dict(yaw_deg=25,pitch_deg=art.PITCH,width=256,height=256,center=art.CENTER,dist=art.DIST,bg=(0,0,0),ambient=(1,0,0))
    full=art.render_view(vertices,triangles,materials,colors,**view)
    selected=materials==identifier
    isolated=art.render_view(vertices,triangles[selected],materials[selected],colors,**view)
    expected=np.count_nonzero(isolated[...,0]>.01);visible=np.count_nonzero(full[...,0]>.01)
    assert expected>30,(side,'missing forearm geometry')
    assert visible/expected>.7,(side,'obscured forearm',visible/expected)
    projected=np.linalg.norm(np.array(art.project(p[side+'e'],25))-art.project(p[side+'h'],25))
    assert projected>14,(side,'forearm points into camera',projected)
    coverage.append(round(float(visible/expected*100),1))
assert p['bat'][1][1]>.02,'Resting bat clips through ground'
assert np.linalg.norm(np.cross(p['rh']-p['bat'][0],p['bat'][1]-p['bat'][0]))<1e-8,'Bat detached from hand'
print(f'Anatomy: {frames} shipped frames, consistent arm lengths, torso clearance, continuous joints; on-deck forearms {coverage}% visible.')
