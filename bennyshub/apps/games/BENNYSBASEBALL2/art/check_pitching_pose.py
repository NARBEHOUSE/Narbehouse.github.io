import numpy as np
from build_players import pose

parts=['hip','chest','lf','rf','lk','rk','lh','rh','le','re']
for before,after in [('set','windup'),('windup','release'),('release','follow_through'),('follow_through','fielding_stance')]:
    a,b=pose(before,1,'pitcher'),pose(after,0,'pitcher')
    for key in parts:assert np.allclose(a[key],b[key]),(before,after,key)
assert pose('windup',.46,'pitcher')['lf'][1]>.35
for t in np.linspace(0,1,101):
    p=pose('release',t,'pitcher')
    assert np.allclose(p['lf'],[.12,.045,.50]),'Stride foot slides during release'
    for name in ['windup','release','follow_through']:
        p=pose(name,t,'pitcher')
        assert np.isfinite(np.concatenate([p[k] for k in parts])).all()
        assert p['hip'][1]>.47
assert pose('release',6/9,'pitcher')['rh'][2]>.5
assert pose('follow_through',.34,'pitcher')['rf'][1]>.25
print('Pitching: continuous delivery joins, knee lift, planted stride, forward release and trailing-leg recovery passed.')

# A readable sideways load, hips leading the shoulders at plant, then a full uncoil.
load=pose('windup',.46,'pitcher');plant=pose('windup',1,'pitcher')
assert load['twist'] < -1.35
assert plant['hip_angle']-plant['twist'] > .8
assert pose('release',6/9,'pitcher')['twist'] > .2
assert pose('follow_through',.34,'pitcher')['twist'] > 1
for name in ['set','windup','release','follow_through','fielding_stance']:
    for t in np.linspace(0,1,101):
        p=pose(name,t,'pitcher');height=p['chest'][1]-p['hip'][1]
        for side,sign in [('l',1),('r',-1)]:
            shoulder=p['hip']+p['rot']@np.array([sign*.168,height-.047,0])+(p['chest']-p['hip']-[0,height,0])*((height-.047)/height)
            a=float(p['hip_angle']);thigh=p['hip']+[sign*.074*np.cos(a),-.023,-sign*.074*np.sin(a)]
            for root,joint,tip,upper,lower in [(shoulder,p[side+'e'],p[side+'h'],.235,.25),(thigh,p[side+'k'],p[side+'f'],.26,.26)]:
                assert abs(np.linalg.norm(joint-root)-upper)<1e-6,(name,t,side,'upper bone stretches')
                assert abs(np.linalg.norm(tip-joint)-lower)<1e-6,(name,t,side,'lower bone stretches')
print('Pitcher rotation and fixed arm/leg lengths passed.')

# The lifted left thigh must face the same side as the torso/pelvis. Merely
# asserting torso yaw and foot height missed a forward-facing knee before.
a=float(load['hip_angle']);forward=np.array([np.sin(a),0,np.cos(a)])
root=load['hip']+np.array([.074*np.cos(a),-.023,-.074*np.sin(a)])
raised=load['lk']-root;raised[1]=0;raised/=np.linalg.norm(raised)
assert np.dot(raised,forward)>.98,'Lifted knee opposes body turn'
assert load['lk'][1]>load['hip'][1]+.08,'Left thigh must reach belt height'
assert load['lk'][0]<load['hip'][0]-.20,'Side-profile knee silhouette missing'
assert np.linalg.norm((load['lf']-load['lk'])[[0,2]])<.06,'Shin should hang below lifted knee'
assert abs(load['hip_angle']-load['twist'])<.10,'Pelvis and torso must turn together at balance'
for t in np.linspace(0,1,101):
    assert np.allclose(pose('windup',t,'pitcher')['rf'],[-.115,.045,.015]),'Pivot foot drifts during lift'
for t in np.linspace(0,.56,60):
    assert np.allclose(pose('follow_through',t,'pitcher')['lf'],[.12,.045,.50]),'Front foot slides before rear landing'
assert pose('follow_through',.78,'pitcher')['lf'][1]>.12,'Recovery needs a step, not a ground slide'
print('Sideways left-leg lift, stable pivot and stepping recovery passed.')
