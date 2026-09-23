const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,capture}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.createTeams(false);
        s.resetInteractiveBatting();s.ib.active=true;s.ib.waitingForSwing=true;s.setBattingCamera(true);
        window.chargeFrames=[];s.events.on('postupdate',()=>{
            if(s.batter._anim==='load_charge')chargeFrames.push(Number(s.batter._spr.frame.name));
        });})();`);
    await wait(700);await capture('browser-shoulder-stance.png');
    await evaluate('reviewScene.onSwingStart();void 0;');
    await wait(1250);await capture('browser-bunt-load.png');
    await wait(1750);await capture('browser-normal-load.png');
    await wait(3500);await capture('browser-power-load.png');
    const result=await evaluate(`({frames:[...new Set(chargeFrames)],clip:BB2_SHEETS['batter-actions'].anims.load_charge,
        sequence:chargeFrames.filter((v,i)=>!i||v!==chargeFrames[i-1]),playing:reviewScene.batter._spr.anims.isPlaying,
        announced:reviewScene.ib.announcedSwingType})`);
    assert.equal(result.playing,false);
    assert.equal(result.sequence[0],result.clip.start+Math.round(.78*(result.clip.count-1)));
    const forwardPose=result.sequence.indexOf(result.clip.start);
    assert(forwardPose>0,'Bat moves from the shoulder to the forward bunt pose');
    assert(result.sequence.slice(1,forwardPose+1).every((v,i)=>v<result.sequence[i]),'Opening motion moves forward smoothly');
    assert(result.sequence.slice(forwardPose+1).every((v,i)=>v>result.sequence[forwardPose+i]),'Remaining charge draws the bat back');
    assert.equal(result.frames.length,result.clip.count);assert.equal(result.announced,'power');
    assert.equal(result.frames.at(-1),result.clip.start+result.clip.count-1);
    await evaluate('reviewScene.stopChargeMonitor();void 0;');
    assert.equal(await evaluate('reviewScene.batter._anim'),'stance');
    for(const type of ['bunt','normal','power']) {
        await evaluate(`reviewScene.bb2Anim(reviewScene.batter,'load_${type}');void 0;`);await wait(150);
        assert.equal(await evaluate('reviewScene.batter._anim'),'load_'+type);
        await evaluate(`reviewScene.animateBatterSwing('${type}');void 0;`);await wait(100);
        assert.equal(await evaluate('reviewScene.batter._anim'),type==='bunt'?'bunt':'swing_'+type);
        await capture('browser-'+type+'-swing.png');
        await wait(800);
    }
    return result;
};
