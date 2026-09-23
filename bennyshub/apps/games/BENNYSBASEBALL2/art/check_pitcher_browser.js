const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.createTeams(false);s.ball.setVisible(false);s.setBattingCamera(true);
        s._delivery={frames:[],releases:0,done:0,bad:[]};const p=s.fielders.P;
        const sample=(anim,frame)=>{
            if(!p._busy)return;
            s._delivery.frames.push({clip:p._anim,frame:frame.textureFrame});
            if(p._animKey!==anim.key)s._delivery.bad.push({expected:anim.key,actual:p._animKey});
        };
        p._spr.on('animationstart',sample);p._spr.on('animationupdate',sample);
        s._startPitch=()=>p.playPitch(()=>{
            s._delivery.releases++;s._delivery.releaseFrame=Number(p._spr.frame.name);
            const from=s.pitchReleasePoint(),hand=p.actionPoint('release','hand');
            s._delivery.handError=Math.hypot(from.x-hand.x,from.y-hand.y);
            s.ballArc(from,s.swingContactPoint('normal'),1300,12,()=>{});
        },()=>s._delivery.done++);
        })();`);
    await wait(750);await capture('browser-pitcher-set.png');
    await evaluate('reviewScene._startPitch();void 0;');
    await wait(560);await capture('browser-pitcher-sideways.png');
    // Repeated activation must not restart the windup or replace its callback.
    await evaluate('reviewScene.fielders.P.playPitch(()=>{throw Error("Duplicate pitch");});void 0;');
    await wait(650);await capture('browser-pitcher-stride.png');
    await until('reviewScene._delivery.releases===1');await capture('browser-pitcher-release.png');
    await wait(250);await capture('browser-pitcher-follow-through.png');
    await until('reviewScene._delivery.done===1');
    let result=await evaluate('reviewScene._delivery');
    assert.equal(result.releases,1);assert.equal(result.bad.length,0,JSON.stringify(result.bad));
    assert(result.handError<.1,JSON.stringify(result));
    assert.equal(await evaluate('reviewScene.fielders.P._anim'),'fielding_stance');
    const clips=await evaluate(`BB2_SHEETS['pitcher-actions'].anims`);
    for(const name of ['windup','release','follow_through']) {
        const used=new Set(result.frames.filter(f=>f.clip===name).map(f=>f.frame));
        assert.equal(used.size,clips[name].count,name+': every baked frame plays');
    }
    assert.equal(clips.release.contactFrame,6,'Release must use the forward extension pose');
    assert.equal(result.releaseFrame,clips.release.start+clips.release.contactFrame);
    await evaluate('reviewScene.fielders.P.idleAnim();reviewScene._startPitch();void 0;');
    await until('reviewScene._delivery.done===2');
    assert.equal(await evaluate('reviewScene._delivery.releases'),2);
    return result;
};
