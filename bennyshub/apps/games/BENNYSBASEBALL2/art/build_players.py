"""Author and bake a shared baseball rig, with contact anchors for the game.

Uses numpy, Pillow and wam.render (the same renderer as Football's art tools).
Run with the WAM virtualenv: python art/build_players.py
Materials are separated before antialiasing into fixed color, jersey/skin shading
and an optional outline mask; shipped color textures contain no chroma keys.
No downloaded models, generated bitmap inputs, or frame-by-frame painted limbs.
"""
import json, math, hashlib, re
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from wam.render import render_view, orbit_basis

ROOT = Path(__file__).resolve().parents[1]
SIZE, SS = 256, 3
CENTER, DIST, PITCH = np.array([0., .67, 0.]), 4.45, 24
COLORS = [[.04,.55,1.], [.91,.92,.89], [1.,.025,.60], [.045,.052,.068], [.48,.27,.115], [.84,.64,.38], [.65,.72,.77], [.21,.12,.055], [.035,.35,.64]]

def lerp(a,b,t): return np.array(a)*(1-t)+np.array(b)*t
def smooth(t): return t*t*(3-2*t)

def pitching_pose(name,t):
    """Connected delivery keys: balance, stride/plant, release, deceleration."""
    set_pose=dict(hip=[0,.53,0],chest=[0,.91,.015],lf=[.115,.045,.045],rf=[-.115,.045,.015],
                  lk=[.115,.28,.09],rk=[-.115,.28,.07],lh=[.025,.83,.21],rh=[-.025,.83,.21],
                  le=[.26,.74,.12],re=[-.26,.74,.12],twist=0.,hip_angle=0.,heel_lift=0.,lift_turn=0.,pivot_turn=0.,head_turn=0.)
    def key(**changes):return {**set_pose,**changes}
    gather=key(hip=[-.05,.54,-.015],chest=[-.05,.92,0],
               lf=[.06,.08,.035],lk=[.05,.34,.065],twist=-1.10,hip_angle=-.90,
               lift_turn=-.90,pivot_turn=-1.35,head_turn=-.35)
    balance=key(hip=[-.065,.55,-.01],chest=[-.065,.93,.005],
                lf=[.009,.38,.19],lk=[.009,.64,.24],rk=[-.115,.29,.07],
                lh=[.015,.89,.18],rh=[-.035,.89,.18],twist=-1.50,hip_angle=-1.50,lift_turn=-1.50,pivot_turn=-1.50,head_turn=-.55)
    separate=key(hip=[-.045,.515,.09],chest=[-.045,.895,.12],
                 lf=[.045,.17,.34],lk=[.045,.40,.31],rk=[-.10,.28,.10],
                 lh=[.12,.87,.43],le=[.24,.82,.25],rh=[-.31,.68,-.05],re=[-.32,.83,-.03],
                 twist=-1.38,hip_angle=-1.05,heel_lift=.15,lift_turn=-.55,pivot_turn=-1.50,head_turn=-.30)
    stride=key(hip=[-.015,.49,.22],chest=[-.015,.87,.25],
               lf=[.12,.045,.50],lk=[.12,.27,.39],rf=[-.115,.045,.015],rk=[-.10,.27,.12],
               lh=[.13,.85,.42],le=[.26,.79,.29],rh=[-.29,1.12,.03],re=[-.35,.91,.11],
               twist=-1.22,hip_angle=-.25,heel_lift=.38,pivot_turn=-1.50,head_turn=-.12)
    release=key(hip=[0,.49,.27],chest=[0,.84,.39],
                lf=[.12,.045,.50],lk=[.12,.27,.42],rf=[-.115,.045,.015],rk=[-.09,.26,.17],
                lh=[.15,.69,.42],le=[.26,.76,.28],rh=[-.36,1.02,.70],re=[-.36,.96,.46],
                twist=.28,hip_angle=.48,heel_lift=.68,pivot_turn=-1.20)
    extension=key(hip=[.01,.485,.29],chest=[.01,.79,.46],
                  lf=[.12,.045,.50],lk=[.12,.27,.43],rf=[-.12,.10,.025],rk=[-.09,.29,.20],
                  lh=[.17,.67,.43],le=[.27,.72,.32],rh=[.16,.69,.75],re=[-.10,.79,.59],
                  twist=.78,hip_angle=.68,heel_lift=.5,pivot_turn=-.60)
    finish=key(hip=[.015,.485,.28],chest=[.015,.78,.44],
               lf=[.12,.045,.50],lk=[.12,.27,.42],rf=[-.15,.27,.10],rk=[-.10,.43,.22],
               lh=[.17,.65,.42],le=[.27,.72,.30],rh=[.22,.53,.53],re=[-.01,.63,.52],
               twist=1.05,hip_angle=.80,heel_lift=0.)
    rear_land=key(hip=[.005,.49,.23],chest=[.005,.865,.31],
                  lf=[.12,.045,.50],lk=[.12,.27,.42],rf=[-.15,.045,.025],rk=[-.13,.28,.12],
                  lh=[.13,.65,.32],rh=[.08,.61,.37],le=[.26,.74,.20],re=[-.13,.74,.27],
                  twist=.45,hip_angle=.35)
    recover=key(hip=[0,.515,.11],chest=[0,.885,.16],
                lf=[.145,.14,.26],lk=[.14,.36,.31],rf=[-.15,.045,.025],rk=[-.14,.28,.08],
                lh=[.10,.64,.24],rh=[-.04,.65,.23],le=[.25,.76,.14],re=[-.22,.76,.14],
                twist=.12,hip_angle=.10)
    ready=key(hip=[0,.505,.02],chest=[0,.875,.07],
              lf=[.15,.045,.025],rf=[-.15,.045,.025],lk=[.135,.28,.075],rk=[-.135,.28,.075],
              lh=[.09,.64,.20],rh=[-.08,.66,.18],le=[.25,.76,.10],re=[-.24,.76,.09],twist=0.,hip_angle=0.)
    tracks={'set':[(0,set_pose),(1,set_pose)],
            'windup':[(0,set_pose),(.18,gather),(.46,balance),(.73,separate),(1,stride)],
            'release':[(0,stride),(6/9,release),(1,extension)],
            'follow_through':[(0,extension),(.34,finish),(.56,rear_land),(.78,recover),(1,ready)],
            'fielding_stance':[(0,ready),(1,ready)]}
    track=tracks[name]
    for (a,p),(b,q) in zip(track,track[1:]):
        if t<=b:
            u=smooth(np.clip((t-a)/(b-a),0,1))
            result={k:lerp(p[k],q[k],u) for k in p}
            # The free leg lifts in the pelvis' facing plane, not toward the
            # camera while the jersey turns away. Unwind that plane during
            # the stride; by foot plant both targets are in plateward space.
            a=float(result['lift_turn'])
            turn=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
            for part in ['lf','lk']:
                result[part]=result['hip']+turn@(result[part]-result['hip'])
            # The supporting knee follows the pelvis over a fixed pivot foot.
            a=float(result['hip_angle'])
            turn=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
            result['rk']=result['hip']+turn@(result['rk']-result['hip'])
            return result

class Mesh:
    def __init__(self): self.v=[]; self.t=[]; self.m=[]
    def ring_mesh(self,rings,mat):
        start=len(self.v); n=len(rings[0]); self.v.extend(np.concatenate(rings).tolist())
        for j in range(len(rings)-1):
            for i in range(n):
                a=start+j*n+i; b=start+j*n+(i+1)%n; c=a+n; d=b+n
                self.t.extend([[a,b,c],[b,d,c]]); self.m.extend([mat,mat])
        for j,reverse in [(0,True),(len(rings)-1,False)]:
            for i in range(1,n-1):
                tri=[start+j*n,start+j*n+i,start+j*n+i+1]
                self.t.append(tri[::-1] if reverse else tri); self.m.append(mat)
    def limb(self,a,b,r1,r2,mat,n=10):
        a=np.array(a); b=np.array(b); axis=b-a; axis/=max(np.linalg.norm(axis),1e-6)
        u=np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [0,1,0]); u/=np.linalg.norm(u); v=np.cross(axis,u)
        rings=[]
        for point,r in [(a,r1),(b,r2)]:
            rings.append(np.array([point+r*(math.cos(t)*u+math.sin(t)*v) for t in np.linspace(0,2*math.pi,n,endpoint=False)]))
        self.ring_mesh(rings,mat)
    def oval(self,c,r,mat,n=12):
        c=np.array(c); r=np.array(r)
        rings=[np.array([c+r*np.array([math.sin(p)*math.cos(t),math.cos(p),math.sin(p)*math.sin(t)])
                          for t in np.linspace(0,2*math.pi,n,endpoint=False)])
               for p in np.linspace(.025,math.pi-.025,7)]
        self.ring_mesh(rings,mat)
    def loft(self,sections,mat,transform=lambda x:x,n=16):
        """Elliptical cross-sections: tailored cloth instead of circular barrels."""
        self.ring_mesh([np.array([transform(np.array([rx*math.cos(a),y,z+rz*math.sin(a)]))
                         for a in np.linspace(0,2*math.pi,n,endpoint=False)])
                         for y,rx,rz,z in sections],mat)

def pose(name,t,role=None):
    """Shared joints in model space; ground remains at y=0 in every action."""
    if role=='outfielder':
        if name in ['ready','ready_left','ready_right']:name='outfield_ready'
        elif name.startswith('pitch_ready'):name='outfield_set'
    p={'hip':np.array([0,.53,0]), 'chest':np.array([0,.91,0]),
       'lf':np.array([.115,.045,.025]),'rf':np.array([-.115,.045,.025]),
       'lk':np.array([.115,.28,.025]),'rk':np.array([-.115,.28,.025]),
       'lh':np.array([.21,.60,.10]),'rh':np.array([-.21,.60,.10]),
       'le':np.array([.23,.75,.01]),'re':np.array([-.23,.75,.01]),'twist':0.,'bat':None}
    if name=='on_deck':
        # Relaxed hands below the waist, with space between forearms and jersey.
        p['lh']=np.array([.235,.43,.10]);p['rh']=np.array([-.225,.425,.085])
        p['le']=np.array([.26,.655,.065]);p['re']=np.array([-.235,.645,.065])
    if name.startswith('run') or name=='take_off':
        s=math.sin(t*2*math.pi); c=math.cos(t*2*math.pi)
        p['chest']+= [0,-.025,.10]
        for side,sign in [('l',1),('r',-1)]:
            p[side+'f']+= [0,max(0,sign*c)*.10,sign*s*.23]
            p[side+'k']+= [0,.045,sign*s*.13+.09]
            swing=-sign*s
            p[side+'h']=np.array([sign*.20,.68+.055*swing,.19+.13*swing])
            p[side+'e']=np.array([sign*.235,.66,.045+.09*swing])
    # Legacy walk clip names now carry a compact, athletic recovery jog.
    if name.startswith('walk'):
        s=math.sin(t*2*math.pi);c=math.cos(t*2*math.pi)
        bob=.009*(1-math.cos(t*4*math.pi))
        p['hip'] += [0,bob,0];p['chest'] += [0,bob,.055]
        for side,sign in [('l',1),('r',-1)]:
            lift=max(0,sign*c)*.075
            p[side+'f'] += [0,lift,sign*s*.20]
            p[side+'k'] += [0,lift*.5,sign*s*.11+.055]
            swing=-sign*s
            p[side+'h']=np.array([sign*.21,.62+bob+.04*swing,.22+.11*swing])
            p[side+'e']=np.array([sign*.24,.65+bob,.035+.07*swing])
            if role=='batter' and side=='r':
                p[side+'h']=np.array([-.22,.63+bob,.22+.025*swing])
                p[side+'e']=np.array([-.24,.68+bob,.065+.02*swing])
    if name in ['ready','fielding_stance','ready_at_bag','field_grounder','field_bounce']:
        low = .07 if name in ['ready','fielding_stance','ready_at_bag'] else .07+.15*math.sin(math.pi*t)
        p['hip'] += [0,-low,0]; p['chest'] += [0,-low,.10+low]
        p['lk'] += [.045,0,.12]; p['rk'] += [-.045,0,.12]
        p['lf'] += [.07,0,0]; p['rf'] += [-.07,0,0]
        p['lh']=np.array([.075,.45-low,.27]); p['rh']=np.array([-.045,.49-low,.25])
        p['le']=np.array([.25,.63-low,.15]); p['re']=np.array([-.23,.66-low,.12])
    if name in ['outfield_ready','outfield_set']:
        # Outfielders wait tall with soft knees and a waist-high glove. Only
        # the live-pitch set has a small forward lean, never an infielder squat.
        low=.025 if name=='outfield_set' else 0
        breath=.004*math.sin(2*math.pi*t)
        p['hip'] += [0,-low+breath,0];p['chest'] += [0,-low+breath,.045 if low else .015]
        p['lf'] += [.025,0,.012];p['rf'] += [-.025,0,-.012]
        p['lk'] += [.015,0,.035 if low else .012];p['rk'] += [-.015,0,.035 if low else .012]
        p['lh']=np.array([.10,.62-low+breath,.15]);p['rh']=np.array([-.09,.65-low+breath,.12])
        p['le']=np.array([.23,.77-low+breath,.055]);p['re']=np.array([-.22,.78-low+breath,.05])
    if role=='outfielder' and name=='field_bounce':
        weight=smooth(t*7/4) if t<=4/7 else 1-smooth((t-4/7)*7/3)
        standing=pose('outfield_set',0);gather=pose('field_grounder',.5)
        for key in ['hip','chest','lf','rf','lk','rk','lh','rh','le','re']:
            p[key]=lerp(standing[key],gather[key],weight)
    if name in ['set','windup','release','follow_through'] or (role=='pitcher' and name=='fielding_stance'):
        p.update(pitching_pose(name,t))
        if name=='windup':
            separation=np.clip((t-.46)/(.73-.46),0,1)
            p['rh'] += [-.13*math.sin(math.pi*separation),0,.06*math.sin(math.pi*separation)]
        p['foot_turn']={'l':float(p['lift_turn']),'r':float(p['pivot_turn'])}
    if name in ['crouch_idle','receive','block','tag_home','rise_throw']:
        rise=smooth(t) if name=='rise_throw' else 0
        low=.29*(1-rise);p['hip'] += [0,-low,-.035];p['chest'] += [0,-low,.04]
        p['lk']=np.array([.22,.22,.19]);p['rk']=np.array([-.22,.22,.19]);p['lf'] += [.09,0,.02];p['rf'] += [-.09,0,.02]
        p['lh']=np.array([.02,.57-low*.3,.33]);p['rh']=np.array([-.12,.51-low*.2,.12])
        p['le']=np.array([.22,.62-low*.3,.1]);p['re']=np.array([-.22,.55-low*.3,.06])
        if name=='receive':p['lh'] += [0,0,-.09*math.sin(math.pi*t)]
        if name=='rise_throw':p['rh']=np.array([-.18,.65+t*.37,.14+math.sin(t*math.pi)*.3])
    if name in ['throw','throw_relay','rise_throw']:
        # A glove transfer and planted step precede the overhand release.
        # The catcher rises out of his squat before cocking the throwing arm.
        ready=pose('outfield_ready' if role=='outfielder' else 'ready',0)
        def throwing_key(**changes):
            k={key:(value.copy() if isinstance(value,np.ndarray) else value) for key,value in ready.items()}
            k.update({key:np.array(value) if isinstance(value,list) else value for key,value in changes.items()})
            return k
        start=pose('crouch_idle',0) if name=='rise_throw' else ready
        transfer=throwing_key(lh=[.015,.80,.23],rh=[-.035,.79,.23],le=[.24,.77,.1],re=[-.23,.77,.1],twist=-.15)
        separate=throwing_key(rh=[-.38,.86,.16],re=[-.36,.83,.04],
            lh=[.10,.82,.25],le=[.26,.78,.14],twist=-.35)
        coil=throwing_key(hip=[-.025,.52,.025],chest=[-.025,.90,.035],
            lf=[.115,.10,.17],lk=[.115,.34,.17],lh=[.16,.85,.31],le=[.27,.79,.18],
            rh=[-.28,1.08,-.10],re=[-.36,.93,-.035],twist=-.62)
        release=throwing_key(hip=[0,.505,.12],chest=[0,.87,.20],
            lf=[.13,.045,.32],lk=[.125,.285,.24],rk=[-.10,.28,.08],
            lh=[.12,.70,.20],le=[.26,.77,.095],rh=[-.22,1.02,.58],re=[-.32,.94,.36],twist=.14)
        follow=throwing_key(hip=[.01,.50,.13],chest=[.01,.84,.24],
            lf=[.13,.045,.32],lk=[.125,.28,.24],rf=[-.105,.085,.04],rk=[-.10,.30,.12],
            lh=[.13,.68,.20],le=[.26,.76,.1],rh=[.08,.60,.40],re=[-.10,.75,.32],twist=.68)
        recover=throwing_key(lh=[.12,.64,.18],rh=[-.07,.65,.18],twist=.05)
        contact=12/19 if name=='rise_throw' else 9/15
        keys=[(0,start),(.20,transfer),(.32,separate),(.42,coil),(contact,release),(.80,follow),(1,recover)]
        for (a,first),(b,last) in zip(keys,keys[1:]):
            if t<=b:
                u=smooth((t-a)/(b-a))
                for key in ['hip','chest','lf','rf','lk','rk','lh','rh','le','re','twist']:
                    p[key]=lerp(first[key],last[key],u)
                break
        p['hip_angle']=float(p['twist'])*.45
    if name in ['stretch_catch','receive_at_bag','catch_fly','tag','tag_home']:
        height=1.13 if name=='catch_fly' else .68 if name in ['stretch_catch','receive_at_bag'] else .30
        p['lh']=np.array([.06,height,.37]);p['le']=np.array([.24,(height+.9)/2,.18])
        if name=='stretch_catch':p['lf'] += [.04,0,.25];p['chest'] += [0,-.05,.12]
        if name in ['catch_fly','stretch_catch','receive_at_bag']:
            # Raise/extend into the authored contact frame (4 of 7), secure
            # the ball, then lower the glove and recover the ready stance.
            weight=smooth(t*7/4) if t<=4/7 else 1-smooth((t-4/7)*7/3)
            ready=pose('outfield_set' if role=='outfielder' else 'ready',0)
            for key in ['hip','chest','lf','rf','lk','rk','lh','rh','le','re']:
                p[key]=lerp(ready[key],p[key],weight)
    if name in ['slide','dive']:
        p['hip']=np.array([0,.18,0]);p['chest']=np.array([0,.40,-.16]);p['lf']=np.array([.12,.05,.49]);p['rf']=np.array([-.16,.05,.21])
        p['lk']=np.array([.12,.10,.27]);p['rk']=np.array([-.23,.11,.02]);p['lh']=np.array([.28,.28,-.15]);p['rh']=np.array([-.28,.28,-.15])
        p['le']=np.array([.22,.35,-.2]);p['re']=np.array([-.22,.35,-.2])
    if name in ['scuffle','dust_off']:
        wave=math.sin(t*math.pi*2);other=math.sin(t*math.pi*2+math.pi)
        p['lf'] += [.04,0,.025];p['rf'] += [-.04,0,-.025]
        p['chest'] += [0,-.015,.045]
        if name=='scuffle':
            # Exaggerated alternating jabs and a duck: cartoon roughhousing.
            p['twist']=.20*wave
            p['chest'][1] -= .025*(1-math.cos(t*math.pi*4))
            for side,sign,beat in [('l',1,wave),('r',-1,other)]:
                reach=max(0,beat)
                p[side+'h']=np.array([sign*.18,.86+.035*beat,.17+.17*reach])
                p[side+'e']=np.array([sign*.26,.76,.055+.08*reach])
        else:
            # Brush down the jersey sleeves and trousers before returning.
            p['lh']=np.array([.19,.62+.12*wave,.19])
            p['rh']=np.array([-.19,.62+.12*other,.19])
            p['le']=np.array([.29,.73,.09]);p['re']=np.array([-.29,.73,.09])
    if name in ['celebrate','wall_watch']:
        p['lh']=np.array([.25,1.25,.05]);p['rh']=np.array([-.25,1.22,.05]);p['le']=np.array([.31,1.01,0]);p['re']=np.array([-.31,1.01,0])
    if name in ['dejected','out_walkoff','hit_by_pitch']:p['chest'] += [0,-.04,.08]
    a=float(p['twist']);rot=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
    for key in ['chest','lh','rh','le','re']:p[key]=p['hip']+rot@(p[key]-p['hip'])
    if p['bat'] is not None:p['bat']=tuple(p['hip']+rot@(v-p['hip']) for v in p['bat'])
    p['rot']=rot
    if name in ['stance','load_normal','load_power','load_bunt','load_charge','swing_normal','swing_power','bunt']:
        # The batter straddles the box along the pitch direction. Both cleats
        # remain visible from the side camera; front foot plants before contact.
        swing=name.startswith('swing'); power='power' in name
        phase=t if swing else 0.; contact=5/11
        # RBI '94 reference: stride/plant, hips opening, shoulders following,
        # then the barrel arriving at contact. Preserve the gameplay contact frame.
        stride=smooth(min(1,phase/.30))
        hip_turn=smooth(np.clip((phase-.04)/(contact-.04),0,1))
        turn=smooth(np.clip((phase-.09)/(contact-.09),0,1))
        attack=smooth(np.clip((phase-.14)/(contact-.14),0,1))
        finish=smooth(max(0,(phase-contact)/(1-contact)))
        charge=t if name=='load_charge' else .78 if name=='stance' else 0 if name in ['load_bunt','bunt'] else 1 if power else .5
        coil=smooth(charge)
        breathe=.006*math.sin(t*2*math.pi) if name=='stance' else 0
        # Load the rear leg, transfer weight onto the planted front foot, and
        # rise slightly into a balanced finish instead of swinging in place.
        p['hip']=np.array([0,.515+breathe-.015*coil*(1-stride)+.012*finish,-.035-.04*coil*(1-stride)+.085*stride])
        p['chest']=p['hip']+[-.02,.345,.018]
        p['lf']=np.array([.09,.04+.055*math.sin(stride*math.pi),.21+.075*stride])
        p['rf']=np.array([-.09,.04,-.22])
        p['lk']=np.array([-.02,.265+.018*finish,.20+.045*stride])
        p['rk']=np.array([-.17+.055*hip_turn,.26,-.16+.05*hip_turn])
        angle=(-1.2*coil)*(1-turn)+.10*turn+.6*finish
        p['hip_angle']=(-.45*coil)*(1-hip_turn)+.32*hip_turn+.18*finish
        p['foot_turn']={'l':-1.15+.30*stride,'r':-1.45+.9*hip_turn+.15*finish}
        p['heel_lift']=.38*hip_turn
        p['rot']=np.array([[math.cos(angle),0,math.sin(angle)],[0,1,0],[-math.sin(angle),0,math.cos(angle)]])
        # Author the grip in chest space so it follows the coil and stays
        # in front of the jersey, including the left forearm's cross-body path.
        loaded=lerp([-.08,-.10,.177],[0,.04,.26],coil)
        grip_local=lerp(loaded,[-.10,-.10,.23],attack)
        grip_local=lerp(grip_local,[0,.10,.30],finish)
        hands=p['chest']+p['rot']@grip_local
        # Rotate the same bat back with the hands; never stretch the barrel.
        load_direction=lerp([.30,.025,.95],[-.55,.35,-.75],coil)
        # Lift over the shoulder during the arc, then lay the barrel farther
        # back as the torso reaches its full power coil.
        load_direction[1]+=.70*math.sin(math.pi*coil)
        load_direction/=np.linalg.norm(load_direction)
        direction=lerp(load_direction,[-.22,-.04,.975],attack)
        # Keep the barrel above the hands as it comes around; an entirely
        # flat interpolation points it end-on at the camera midway through.
        direction[1]+=.32*math.sin(math.pi*attack)
        direction=lerp(direction,[-.78,.60,-.18],finish);direction/=np.linalg.norm(direction)
        length=.53
        if name in ['load_bunt','bunt']:
            # Square around, support the barrel, and cushion the incoming ball.
            hands=np.array([-.10,.76,.16]);direction=np.array([.30,.025,.95]);direction/=np.linalg.norm(direction)
            if name=='bunt':hands += [0,0,-.035*math.sin(math.pi*t)]
        grip=.065+.155*(1-smooth(min(1,charge/.45)))*(1-attack)
        # Right-handed hitter: left hand by the knob, right hand above it.
        p['lh']=hands;p['rh']=hands+direction*grip
        p['bat']=(hands-direction*.04,hands+direction*length)
        # Solve elbows from shoulder and grip, preserving both arm lengths.
        height=p['chest'][1]-p['hip'][1]
        for side,sign in [('l',1),('r',-1)]:
            shoulder=p['hip']+p['rot']@np.array([sign*.168,height-.047,0])+(p['chest']-p['hip']-[0,height,0])*((height-.047)/height)
            delta=p[side+'h']-shoulder;distance=np.linalg.norm(delta);axis=delta/distance
            upper,fore=.235,.25
            along=(upper*upper-fore*fore+distance*distance)/(2*distance)
            # Elbows bend forward/outward in the turning chest's coordinate
            # system, not toward a fixed world point behind the shoulder.
            pole=p['chest']+p['rot']@np.array([sign*.36,-.20,.24])-shoulder
            bend=pole-axis*np.dot(pole,axis);bend/=np.linalg.norm(bend)
            radius=math.sqrt(max(0,upper*upper-along*along))
            # Pick a forward elbow bend that also clears the chest. Checking
            # both arm segments prevents a valid wrist/elbow from hiding an
            # intersecting forearm between them.
            angles=np.linspace(-math.pi,math.pi,145)
            elbows=shoulder+axis*along+radius*(np.cos(angles)[:,None]*bend+np.sin(angles)[:,None]*np.cross(axis,bend))
            upper_points=lerp(shoulder,elbows[:,None,:],np.linspace(.35,1,15)[None,:,None])
            fore_points=lerp(elbows[:,None,:],p[side+'h'],np.linspace(0,1,15)[None,:,None])
            points=np.concatenate([upper_points,fore_points],axis=1)
            ys=points[...,1]-p['hip'][1]
            local=(points-p['hip']-(p['chest']-p['hip']-[0,height,0])*ys[...,None]/height)@p['rot']
            clearance=(local[...,0]/.195)**2+(local[...,2]/.135)**2
            clearance=np.where((ys>.045)&(ys<height+.015),clearance,10).min(axis=1)
            score=np.minimum(clearance-1.05,0)*100+np.cos(angles)-100*np.maximum(0,elbows[:,1]-p['chest'][1])
            p[side+'e']=elbows[np.argmax(score)]
    if name not in ['stance','load_normal','load_power','load_bunt','load_charge','swing_normal','swing_power','bunt']:
        # Field players use a more compact reach; preserve the delivery and
        # two-handed swing rig. Solve complete bones, never clip a forearm.
        def joint(root,target,hint,upper,lower):
            delta=target-root;distance=np.linalg.norm(delta);axis=delta/max(distance,1e-8)
            distance=np.clip(distance,abs(upper-lower)+.002,upper+lower-.002)
            target=root+axis*distance
            along=(upper*upper-lower*lower+distance*distance)/(2*distance)
            bend=hint-root-axis*np.dot(hint-root,axis)
            bend/=max(np.linalg.norm(bend),1e-8)
            return root+axis*along+bend*math.sqrt(max(0,upper*upper-along*along)),target
        height=p['chest'][1]-p['hip'][1]
        for side,sign in [('l',1),('r',-1)]:
            shoulder=p['hip']+p['rot']@np.array([sign*.168,height-.047,0])+(p['chest']-p['hip']-[0,height,0])*((height-.047)/height)
            # Keep the wrist outside the jersey before solving the elbow.
            # Tucked glove/transfer keys used to place a hand inside the torso.
            wrist=p[side+'h'];y=wrist[1]-p['hip'][1]
            lean=p['chest']-p['hip']-[0,height,0]
            local=p['rot'].T@(wrist-p['hip']-lean*y/height)
            if .045<y<height+.015:
                radial=math.hypot(local[0]/.205,local[2]/.15)
                if radial<1:
                    if radial<1e-6:local[2]=.15
                    else:local[[0,2]]/=radial
                    wrist=p['hip']+lean*y/height+p['rot']@local
            upper,fore=(.235,.25) if role in ['pitcher','batter'] and name!='on_deck' and not name.startswith('walk') else (.205,.22)
            elbow,wrist=joint(shoulder,wrist,p[side+'e'],upper,fore)
            # Rotate about the shoulder-to-wrist axis to clear both arm
            # segments while preserving bone lengths and the authored bend.
            axis=wrist-shoulder;axis/=np.linalg.norm(axis)
            along=np.dot(elbow-shoulder,axis);bend=elbow-shoulder-axis*along
            angles=np.linspace(-math.pi,math.pi,145)
            elbows=shoulder+axis*along+np.cos(angles)[:,None]*bend+np.sin(angles)[:,None]*np.cross(axis,bend)
            points=np.concatenate([lerp(shoulder,elbows[:,None,:],np.linspace(.60,1,15)[None,:,None]),
                lerp(elbows[:,None,:],wrist,np.linspace(0,1,15)[None,:,None])],axis=1)
            ys=points[...,1]-p['hip'][1]
            local=(points-p['hip']-lean*ys[...,None]/height)@p['rot']
            clearance=(local[...,0]/.195)**2+(local[...,2]/.135)**2
            clearance=np.where((ys>.045)&(ys<height+.015),clearance,10).min(axis=1)
            score=np.minimum(clearance-1.05,0)*100+np.cos(angles)
            chosen=np.argmax(score)
            p[side+'e']=elbows[chosen];p[side+'h']=wrist
            if (role=='pitcher' and name in ['set','windup','release','follow_through','fielding_stance']) or name in ['throw','throw_relay','rise_throw']:
                a=float(p['hip_angle'])
                thigh=p['hip']+[sign*.074*math.cos(a),-.023,-sign*.074*math.sin(a)]
                p[side+'k'],p[side+'f']=joint(thigh,p[side+'f'],p[side+'k'],.26,.26)
    if name=='on_deck':
        direction=np.array([-.60,-.70,.30]);direction/=np.linalg.norm(direction)
        p['bat']=(p['rh']-direction*.04,p['rh']+direction*.53)
    if role=='batter' and name.startswith('walk'):
        direction=np.array([-.18,-.98,0]);direction/=np.linalg.norm(direction)
        p['bat']=(p['rh']-direction*.04,p['rh']+direction*.53)
    return p

def build(name,t,role):
    p=pose(name,t,role);m=Mesh(); hip=p['hip'];chest=p['chest']
    rot=p['rot'];height=chest[1]-hip[1]
    def body(v):
        v=np.array(v);r=rot
        if 'hip_angle' in p:
            shoulder_angle=math.atan2(rot[0,2],rot[0,0])
            angle=p['hip_angle']+(shoulder_angle-p['hip_angle'])*np.clip(v[1]/(height-.06),0,1)
            r=np.array([[math.cos(angle),0,math.sin(angle)],[0,1,0],[-math.sin(angle),0,math.cos(angle)]])
        return hip+r@v+(chest-hip-np.array([0,height,0]))*(v[1]/height)
    # Broad shoulders, shaped chest, narrow waist and a tucked jersey hem.
    m.loft([(0,.125,.082,0),(.07,.133,.084,0),(.20,.164,.102,0),
            (height-.035,.193,.093,0),(height,.153,.077,0)],0,body)
    m.loft([(-.065,.123,.09,0),(.012,.132,.086,0)],1,body)
    m.loft([(.008,.134,.088,0),(.036,.136,.089,0)],3,body)
    m.limb(body([-.018,.023,.095]),body([.018,.023,.095]),.009,.009,6,6)
    # Placket, collar, shoulder piping and small sewn jersey marks.
    m.limb(body([0,.047,.088]),body([0,height-.028,.099]),.006,.006,1,6)
    for y in [.11,.17,.23]:m.oval(body([0,y,.107]),[.006,.006,.004],3,8)
    for side in [-1,1]:
        m.limb(body([side*.044,height+.003,.04]),body([0,height-.035,.086]),.009,.009,8,6)
        m.limb(body([side*.065,height+.004,0]),body([side*.182,height-.026,0]),.008,.008,1,6)
    # Number 7 on front and a larger 17 on the back, drawn as stitched strokes.
    for z,x,y,scale in [(.107,.067,.255,.065),(-.104,.02,.268,.105)]:
        for a,b in [([x-scale*.3,y,z],[x+scale*.3,y,z]),([x+scale*.3,y,z],[x-scale*.15,y-scale,z])]:
            m.limb(body(a),body(b),.009,.009,1,6)
        if z<0:m.limb(body([-.064,y,z]),body([-.064,y-scale,z]),.010,.010,1,6)
    neck=chest+[0,.052,0];head=chest+[0,.15,.007]
    m.limb(chest,neck,.045,.043,2)
    head_start=len(m.v)
    # A jaw and cheek silhouette, with a separate helmet/cap shell and visor.
    m.loft([(-.099,.038,.050,.022),(-.069,.070,.067,.008),(-.006,.080,.076,0),
            (.052,.078,.071,-.005),(.082,.047,.053,-.010)],2,lambda v:head+v)
    for side in [-1,1]:m.oval(head+[side*.079,-.008,0],[.017,.028,.016],2)
    m.oval(head+[0,-.020,.078],[.019,.029,.021],2)
    for x in [-.034,.034]:
        m.limb(head+[x-.012,.015,.072],head+[x+.009,.015,.073],.006,.006,3,6)
    m.limb(head+[-.022,-.062,.066],head+[.022,-.062,.066],.003,.003,7,6)
    helmet=role in ['batter','catcher','runner']
    m.loft([(.020,.088,.083,0),(.070,.089,.085,-.006),(.104,.064,.067,-.009),
            (.116,.012,.017,-.010)],0,lambda v:head+v)
    m.oval(head+[0,.027,.087],[.092,.011,.084],3)
    m.oval(head+[0,.035,.086],[.092,.008,.084],0)
    m.limb(head+[-.014,.069,.075],head+[.014,.069,.075],.007,.007,1,6)
    if helmet:
        for side in [-1,1]:
            m.oval(head+[side*.080,-.012,-.013],[.024,.068,.066],0)
            m.oval(head+[side*.103,-.009,.003],[.003,.012,.016],3,8)
    if 'head_turn' in p:
        a=float(p['head_turn'])
        turn=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
        for i in range(head_start,len(m.v)):
            m.v[i]=(head+turn@(np.array(m.v[i])-head)).tolist()
    for side,sign in [('l',1),('r',-1)]:
        shoulder=body([sign*.168,height-.047,0]);elbow=p[side+'e'];hand=p[side+'h']
        cuff=lerp(shoulder,elbow,.57)
        m.oval(shoulder,[.052,.041,.052],0)
        m.limb(shoulder,cuff,.054,.050,0)
        m.limb(lerp(shoulder,elbow,.53),lerp(shoulder,elbow,.60),.051,.050,1)
        m.limb(cuff,elbow,.044,.036,2);m.oval(elbow,[.037,.039,.038],2)
        m.limb(elbow,lerp(elbow,hand,.4),.040,.044,2)
        m.limb(lerp(elbow,hand,.4),hand,.044,.026,2)
        m.limb(lerp(elbow,hand,.82),lerp(elbow,hand,.97),.030,.027,8)
        m.oval(hand,[.031,.040,.030],1 if role in ['batter','runner'] else 2)
        knee=p[side+'k'];foot=p[side+'f']
        a=p.get('hip_angle',0)
        thigh=hip+np.array([sign*.074*math.cos(a),-.023,-sign*.074*math.sin(a)])
        m.limb(thigh,lerp(thigh,knee,.40),.073,.077,1)
        m.limb(lerp(thigh,knee,.40),knee,.077,.054,1)
        m.oval(knee,[.054,.048,.054],1)
        hem=lerp(knee,foot,.52)
        m.limb(knee,hem,.055,.043,1)
        m.limb(hem,foot,.039,.025,8)
        m.limb(lerp(hem,foot,.18),lerp(hem,foot,.30),.037,.035,1)
        # Side stripe follows the pant leg; separate toe, heel and light sole.
        outward=np.array([sign*math.cos(a),0,-sign*math.sin(a)]) if role=='pitcher' else np.array([sign,0,0])
        m.limb(thigh+outward*.07,knee+outward*.053,.006,.005,8,6)
        shoe_start=len(m.v)
        m.oval(foot+[0,-.019,.042],[.047,.013,.088],1)
        m.oval(foot+[0,.003,.030],[.045,.032,.080],3)
        m.oval(foot+[0,.007,-.019],[.035,.038,.034],3)
        for z in [.020,.037,.054]:
            m.limb(foot+[-.023,.030,z],foot+[.023,.030,z],.003,.003,1,6)
        if 'foot_turn' in p:
            a=p['foot_turn'][side];lift=p['heel_lift'] if side=='r' else 0
            yaw=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
            pitch=np.array([[1,0,0],[0,math.cos(lift),-math.sin(lift)],[0,math.sin(lift),math.cos(lift)]])
            toe=np.array([0,-.02,.10])
            for i in range(shoe_start,len(m.v)):
                local=np.array(m.v[i])-foot
                m.v[i]=(foot+yaw@(toe+pitch@(local-toe))).tolist()
    glove=p['lh']+[0,0,.044]
    if role not in ['batter','runner']:
        # Cupped palm, four separated fingers, thumb and cross-laced web.
        m.oval(glove,[.070,.078,.033],4)
        m.oval(glove+[0,.006,.027],[.051,.056,.013],7)
        for i in range(4):
            x=-.047+i*.027;tip=glove+[x,.084-abs(i-1.5)*.008,.029]
            m.limb(glove+[x,.027,.029],tip,.017,.015,4,8)
            m.limb(tip+[-.008,-.005,.014],tip+[.008,-.005,.014],.003,.003,5,6)
        m.limb(glove+[.045,-.045,.022],glove+[.082,.021,.032],.021,.021,4,8)
        for y in [.024,.040,.056]:
            m.limb(glove+[.025,y,.040],glove+[.071,y-.019,.038],.004,.004,5,6)
    if role=='catcher':
        m.oval(chest+[0,-.105,.093],[.152,.170,.041],3)
        for y in [-.02,-.075,-.13,-.185]:
            for x in [-.065,.065]:m.oval(chest+[x,y,.126],[.061,.022,.016],8)
        for sign in [-1,1]:
            m.limb(chest+[sign*.10,0,.08],chest+[sign*.12,-.19,-.098],.015,.015,3)
        for side in ['l','r']:
            knee=p[side+'k'];foot=p[side+'f']
            m.limb(knee+[0,0,.048],foot+[0,.050,.053],.061,.039,3)
            m.oval(knee+[0,0,.063],[.065,.061,.025],8)
            m.limb(knee+[0,-.055,.084],foot+[0,.062,.085],.029,.020,8)
        for dy in [-.062,-.02,.025,.066]:
            m.limb(head+[-.088,dy,.110],head+[0,dy-.009,.146],.005,.005,6,6)
            m.limb(head+[0,dy-.009,.146],head+[.088,dy,.110],.005,.005,6,6)
        for x in [-.08,0,.08]:m.limb(head+[x,-.075,.127],head+[x,.071,.127],.005,.005,6,6)
    if p['bat'] is not None and role=='batter':
        a,b=p['bat'];m.limb(a,lerp(a,b,.34),.013,.017,3)
        m.oval(a,[.022,.022,.022],5,8)
        m.limb(lerp(a,b,.34),lerp(a,b,.72),.017,.030,5)
        m.limb(lerp(a,b,.72),b,.030,.029,5)
        m.oval(b,[.029,.029,.029],5,8)
    # The sweet spot is on the barrel, not beyond its end.
    anchors={'hand':p['rh'],'glove':glove,'bat':lerp(*p['bat'],.86) if p['bat'] is not None else p['rh']}
    return np.array(m.v),np.array(m.t),np.array(m.m),anchors

def project(point,yaw):
    v=(np.array(point)-CENTER)@orbit_basis(yaw,PITCH).T;v[2]-=DIST
    f=1/math.tan(math.radians(28)/2)
    return [round((.5+v[0]*f/-v[2]*.5)*SIZE,2),round((.5-v[1]*f/-v[2]*.5)*SIZE,2)]

def render(name,t,role,yaw):
    v,tr,mat,anchors=build(name,t,role)
    rgb=render_view(v,tr,mat,COLORS,yaw_deg=yaw,pitch_deg=PITCH,width=SIZE*SS,height=SIZE*SS,
                    center=CENTER,dist=DIST,bg=(0,1,0),ambient=(.44,.52,.12))
    keep=(rgb[...,0]>.005)|(rgb[...,2]>.005)
    # Classify before filtering, when each sample belongs to one material.
    # Never infer materials from the blended colors of an antialiased pixel.
    jersey=keep&(rgb[...,2]>rgb[...,1]*1.25)&(rgb[...,1]>rgb[...,0]*3)
    skin=keep&(rgb[...,0]>rgb[...,1]*3)&(rgb[...,2]>rgb[...,1]*3)
    def area(channel):
        return channel.reshape(SIZE,SS,SIZE,SS).mean(axis=(1,3))
    coverage=area(keep.astype(float));denom=np.maximum(coverage,1e-8)
    fixed=rgb.copy();fixed[~keep|jersey|skin]=0
    pixels=np.zeros((SIZE,SIZE,4),dtype='uint8')
    for c in range(3):pixels[...,c]=np.round(area(fixed[...,c])/denom*255).clip(0,255)
    pixels[...,3]=np.round(coverage*255)
    materials=np.zeros((SIZE,SIZE,3),dtype='uint8')
    # R/G hold coverage-weighted jersey/skin shading, at half strength to
    # preserve highlights above 1. B is the optional accessibility halo.
    materials[...,0]=np.round(area(rgb[...,2]*jersey)*255/195/denom*.5*255).clip(0,255)
    materials[...,1]=np.round(area(rgb[...,0]*skin)*255/240/denom*.5*255).clip(0,255)
    alpha=Image.fromarray(pixels[...,3])
    materials[...,2]=np.array(alpha.filter(ImageFilter.MaxFilter(2*round(SIZE/64)+1)))
    return Image.fromarray(pixels),{k:project(x,yaw) for k,x in anchors.items()},Image.fromarray(materials)

def colorize(im,materials,team=(210,56,45),skin=(227,169,125)):
    a=np.array(im);m=np.array(materials).astype(float)/255
    a[...,:3]=np.round(a[...,:3].astype(float)+2*m[...,0,None]*team+2*m[...,1,None]*skin).clip(0,255)
    return Image.fromarray(a)

def main():
    # Preserve the existing clip names so all game paths get the new model.
    import subprocess
    source="const fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('js/sprites.js','utf8'),c);console.log(vm.runInContext('JSON.stringify(BB2_SHEETS)',c));"
    sheets=json.loads(subprocess.check_output(['node','-e',source],cwd=ROOT,text=True))
    import sys
    selected={'batter-actions'} if '--batter-only' in sys.argv else {arg for arg in sys.argv[sys.argv.index('--sheets')+1:] if not arg.startswith('--')} if '--sheets' in sys.argv else None
    preview='--preview' in sys.argv
    meta=json.loads((ROOT/'js/player-art.js').read_text().split('const BASEBALL_ART = ')[1].split(';')[0]) if selected else {}
    review=[];asset_files=[]
    for sheet,definition in sheets.items():
        if selected and sheet not in selected:
            asset_files.extend([ROOT/definition['file'],ROOT/meta[sheet]['materialFile']]);continue
        role='batter' if sheet in ['batter-actions','batter-walk'] else 'catcher' if sheet=='catcher' else 'runner' if sheet=='runner-actions' else 'outfielder' if sheet=='outfield-actions' else 'pitcher' if sheet=='pitcher-actions' else 'fielder'
        # Offensive players keep their helmets and bare hands while running.
        if sheet in ['batter-actions','runner-actions']:
            for name,clip in sheets['player-base']['anims'].items():
                if name.startswith('run_') or (role=='runner' and name.startswith('idle_')):
                    definition['anims'][name]=dict(clip)
        frames=[];mask_frames=[];anchors=[];anims={}
        for name,old in definition['anims'].items():
            count=12 if name.startswith('run') else 12 if name in ['swing_normal','swing_power','windup'] else 6 if old['repeat']==-1 else 8
            rate=18 if name.startswith('swing') else 14 if old['repeat']!=-1 else 12 if name.startswith('run') else 5
            if name=='windup':count=24;rate=20
            if name=='release':count=10;rate=30
            if name=='follow_through':count=16;rate=20
            contact=5 if name.startswith('swing') else 6 if name=='release' else 3 if name=='bunt' else 4
            if name in ['throw','throw_relay']:count=16;rate=20;contact=9
            if name=='rise_throw':count=20;rate=22;contact=12
            if name in ['load_bunt','load_normal','load_power']:count=1;contact=0
            if name=='load_charge':count=33;rate=6;contact=0
            if name=='on_deck':count=2;rate=1;contact=0
            if name in ['scuffle','dust_off']:count=8;rate=8;contact=0
            if name.startswith('walk'):count=12;rate=14
            # Batter is side-on to the pitch, catcher faces the mound.
            yaw=270 if role=='batter' else 180 if role=='catcher' else 0
            if name=='on_deck':yaw=25
            if name=='scuffle':yaw=270
            if name=='dust_off' and role=='batter':yaw=0
            if role=='outfielder' and name.endswith('_left'):yaw=25
            if role=='outfielder' and name.endswith('_right'):yaw=-25
            if name.endswith('_back'):yaw=180
            if name.endswith('_side'):yaw=270
            if name.endswith('_front'):yaw=0
            if role=='batter' and (name.startswith('run') or name=='take_off'):role_frame='runner'
            else:role_frame=role
            anims[name]={'start':len(frames),'count':count,'rate':rate,'repeat':old['repeat'],'contactFrame':contact}
            for i in range(count):
                phase=i/count if old['repeat']==-1 else i/max(1,count-1)
                im,a,materials=render(name,phase,role_frame,yaw);frames.append(im);mask_frames.append(materials);anchors.append(a)
            if preview and name in ['stance','swing_normal','swing_power','windup','release','receive','field_grounder','run_side','walk_side','on_deck','set','follow_through','ready','pitch_ready','catch_fly','field_bounce','throw_relay']:
                review.append((sheet+'/'+name,list(zip(frames,mask_frames))[anims[name]['start']:]))
        atlas=Image.new('RGBA',(SIZE*8,SIZE*math.ceil(len(frames)/8)))
        for i,im in enumerate(frames):atlas.paste(im,((i%8)*SIZE,(i//8)*SIZE))
        atlas.save(ROOT/definition['file'])
        mask_atlas=Image.new('RGB',atlas.size)
        for i,im in enumerate(mask_frames):mask_atlas.paste(im,((i%8)*SIZE,(i//8)*SIZE))
        material_file=definition['file'].replace('.png','-materials.png')
        mask_atlas.save(ROOT/material_file)
        asset_files.extend([ROOT/definition['file'],ROOT/material_file])
        meta[sheet]={'anims':anims,'anchors':anchors,'materialFile':material_file}
        print(sheet,len(frames),'frames',flush=True)
    version=hashlib.sha256(b''.join(p.read_bytes() for p in asset_files)).hexdigest()[:12]
    entry=ROOT/'index.html'
    html=entry.read_bytes().decode('utf8')
    html=re.sub(r'js/(player-art|sprites)\.js(?:\?v=[^"\s]*)?',lambda m:'js/'+m[1]+'.js?v='+version,html)
    entry.write_bytes(html.encode('utf8'))
    (ROOT/'js/player-art.js').write_text('// Generated by art/build_players.py. Do not edit frame tables by hand.\nconst BASEBALL_ART_VERSION = '+json.dumps(version)+';\nconst BASEBALL_ART_CELL = '+str(SIZE)+';\nconst BASEBALL_ART_FOOT = '+str(project([0,0,0],0)[1])+';\nconst BASEBALL_ART = '+json.dumps(meta,separators=(',',':'))+';\n',encoding='utf8')
    if preview:
        out=ROOT/'art/out';out.mkdir(parents=True,exist_ok=True)
        board=Image.new('RGB',(1152,len(review)*120),'#24352e');d=ImageDraw.Draw(board)
        for y,(label,frames) in enumerate(review):
            d.text((6,y*120+3),label,fill='white')
            for i,(im,materials) in enumerate(frames[:12]):
                tinted=colorize(im,materials).resize((96,96),Image.Resampling.LANCZOS)
                board.paste(tinted,(i*96,y*120+22),tinted)
        board.save(out/'players-review.png')

if __name__=='__main__':main()
