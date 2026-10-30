'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const context = { window: {}, NSS: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../bennyshub/apps/games/NARBESWITCHSTORIES/js/sensory-actions.js'), 'utf8'), context);
const { sweepPose, dipPose, dipGrip } = context.NSS.SensoryActions;
const near = (a,b,message) => assert.ok(Math.abs(a-b)<1e-7,message);
for (const height of [110,240,720]) {
    const body = { x:34, y:106, w:height*.452, h:height }, water = { x:40,y:106,w:height,h:height };
    const start = sweepPose(body,0), dipStart = dipPose(water,0);
    let left=Infinity,right=-Infinity,highest=Infinity,lowest=-Infinity;
    for(let i=0;i<=600;i++) {
        const p=i/600, sweep=sweepPose(body,p), dip=dipPose(water,p);
        near(sweep.top.x+(sweep.tip.x-sweep.top.x)*.08,sweep.hand.x,'handle stays in the moving grip');
        near(sweep.top.y+(sweep.tip.y-sweep.top.y)*.08,sweep.hand.y,'handle stays in the moving grip');
        near(Math.hypot(sweep.hand.x-sweep.elbow.x,sweep.hand.y-sweep.elbow.y),Math.hypot(start.hand.x-start.elbow.x,start.hand.y-start.elbow.y),'forearm length stays constant');
        near(sweep.tip.y,start.tip.y,'cane tip stays on the ground while sweeping');
        left=Math.min(left,sweep.tip.x);right=Math.max(right,sweep.tip.x);
        near(dip.tip.x,dipStart.tip.x,'dipping cane keeps its horizontal position');
        near(dip.surface.y,dipStart.surface.y,'waterline stays fixed');
        near(dip.tip.y-dip.top.y,dipStart.tip.y-dipStart.top.y,'dipping cane never changes length');
        const grip=dipGrip(water,p),initialGrip=dipGrip(water,0);
        near(grip.x,initialGrip.x,'dipping hand does not slide across the grip');
        near(grip.y-initialGrip.y,dip.top.y-dipStart.top.y,'hand and forearm lift with the cane handle');
        highest=Math.min(highest,dip.tip.y);lowest=Math.max(lowest,dip.tip.y);
    }
    assert.ok(left<start.hand.x&&right>start.hand.x,'cane sweeps to both sides of the holding hand');
    assert.ok(right-left>height*.35,'sweep is visibly large');
    assert.ok(Math.abs(sweepPose(body,.125).hand.y-start.hand.y)>height*.01,'forearm and hand actually move');
    assert.ok(highest<dipStart.surface.y&&lowest>dipStart.surface.y,'cane lifts out of and dips into water');
    near(sweepPose(body,1).tip.x,start.tip.x,'sweep ends at rest');
    near(dipPose(water,1).tip.y,dipStart.tip.y,'dip ends at rest');
}
const grainSample=p=>{
    const grains=[],ctx={save(){},restore(){},drawImage(){},fillRect(...a){grains.push(a);}};
    context.NSS.SensoryActions.simple(ctx,()=>null,{action:'sandsift',spreadAction:{}},{},{x:100,y:60,w:200,h:240},p);
    return grains;
};
const early=grainSample(.11),later=grainSample(.15);
near(early[0][0],later[0][0],'sand keeps a vertical path from the fingers');
assert.ok(later[0][1]>early[0][1],'sand falls down');
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../bennyshub/apps/games/NARBESWITCHSTORIES/js/final-actions.js'), 'utf8'), context);
const final=context.NSS.FinalActions,r={x:30,y:80,w:240,h:160};
for(let i=0;i<=100;i++){
    const p=i/100,wave=final.wavePose(r,p),jump=final.jumpPose(r,p);
    near(wave.rect.y+wave.rect.h,r.y+r.h,'wave grows from the waterline');
    assert.ok(jump.lift>=0&&jump.lift<=r.h*.17,'controlled jump height');
}
assert.ok(final.jumpPose(r,.48).lift>r.h*.16,'jump rises clearly');
near(final.jumpPose(r,1).rect.y,r.y,'Sanja lands back at her starting position');
near(final.bookOpening(0),0,'book starts shut');near(final.bookOpening(1),1,'book finishes open');
console.log('Passed: connected moving arm/hand/whole cane, grounded sweep, fixed dipping waterline, vertical falling sand, rising wave, opening book, and grounded jump.');
