"""Check the authored charge and bunt geometry before it is baked."""
import numpy as np
from build_players import pose, project

for name in ['stance', 'load_charge', 'load_bunt', 'load_normal', 'load_power', 'bunt', 'swing_normal', 'swing_power']:
    for t in np.linspace(0, 1, 101):
        p = pose(name, t)
        a, b = p['bat']
        assert np.dot(p['rh']-p['lh'],b-a)>0, (name,t,'Left hand must be nearest the knob')
        assert abs(np.linalg.norm(b-a)-.57) < 1e-8, (name, t, 'bat length')
        head=p['chest']+[0,.18,.007]
        for start,end in [p['bat'],(p['le'],p['lh']),(p['re'],p['rh'])]:
            delta=end-start;u=np.clip(np.dot(head-start,delta)/np.dot(delta,delta),0,1)
            assert np.linalg.norm(start+u*delta-head)>.18, (name,t,'bat/forearm crosses helmet')
        if name in ['bunt','load_bunt']:
            assert np.linalg.norm(np.array(project(b,270))-project(a,270))>45, 'Bunt barrel must read from game camera'
        for side in ['l', 'r']:
            assert np.linalg.norm(np.cross(p[side+'h']-a, b-a)) < 1e-8, (name, t, 'grip')
        height = p['chest'][1]-p['hip'][1]
        for side, sign in [('l', 1), ('r', -1)]:
            shoulder = p['hip']+p['rot']@np.array([sign*.168, height-.047, 0])+(p['chest']-p['hip']-[0,height,0])*((height-.047)/height)
            assert abs(np.linalg.norm(shoulder-p[side+'e'])-.235) < 1e-8, (name, t, side, 'upper arm')
            assert abs(np.linalg.norm(p[side+'e']-p[side+'h'])-.25) < 1e-8, (name, t, side, 'forearm')
            # Sample the limb interiors in the rotating chest's coordinates.
            # Leave the upper sleeve's shoulder attachment outside this check.
            for a,b,start in [(shoulder,p[side+'e'],.4),(p[side+'e'],p[side+'h'],0)]:
                for u in np.linspace(start,1,31):
                    point=a*(1-u)+b*u;y=point[1]-p['hip'][1]
                    local=p['rot'].T@(point-p['hip']-(p['chest']-p['hip']-[0,height,0])*y/height)
                    if .045<y<height+.015:
                        clearance=(local[0]/.19)**2+(local[2]/.13)**2
                        assert clearance>=1, (name,t,side,'arm intersects chest',clearance)
loads = [pose('load_charge', t) for t in np.linspace(0, 1, 101)]
stance=pose('stance',0);power=pose('load_power',0)
assert stance['bat'][1][1]>stance['rh'][1] and stance['bat'][1][2]<stance['rh'][2], 'Resting bat sits up and back over shoulder'
assert power['bat'][1][2]<stance['bat'][1][2], 'Full power draws farther back than resting stance'
assert all(a['rh'][2] >= b['rh'][2] for a,b in zip(loads,loads[1:])), 'Hands must pull back continuously'
assert np.linalg.norm(loads[0]['lh']-loads[0]['rh']) > .21, 'Bunt must support barrel'
assert np.linalg.norm(loads[-1]['lh']-loads[-1]['rh']) < .07, 'Swing hands must join at handle'
for name in ['load_charge','bunt','swing_normal','swing_power']:
    sequence=[pose(name,t) for t in np.linspace(0,1,201)]
    for a,b in zip(sequence,sequence[1:]):
        for side in ['l','r']:
            assert np.linalg.norm(a[side+'e']-b[side+'e'])<.025, (name,side,'elbow flips')
for name in ['swing_normal','swing_power']:
    start,early,plant,contact,finish=[pose(name,t) for t in [0,.2,.30,5/11,1]]
    assert early['lf'][1]>.04 and abs(plant['lf'][1]-.04)<1e-8, 'Stride lands before contact'
    assert np.allclose(plant['lf'],contact['lf']) and np.allclose(contact['lf'],finish['lf']), 'Front foot stays planted'
    assert contact['hip'][2]>start['hip'][2]+.08, 'Weight transfers toward front leg'
    assert contact['heel_lift']>.3 and contact['foot_turn']['r']>start['foot_turn']['r']+.8, 'Rear foot pivots through contact'
    hip_progress=(early['hip_angle']-start['hip_angle'])/(contact['hip_angle']-start['hip_angle'])
    angles=[np.arctan2(p['rot'][0,2],p['rot'][0,0]) for p in [start,early,contact]]
    shoulder_progress=(angles[1]-angles[0])/(angles[2]-angles[0])
    assert hip_progress>shoulder_progress, 'Hips lead shoulders'
print('Batting poses: helmet/torso clearance, visible bunt length, continuous elbows, constant bat/arm lengths and both hands on bat passed.')
