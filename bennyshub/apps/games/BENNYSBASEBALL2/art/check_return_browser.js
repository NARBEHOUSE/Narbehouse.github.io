const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.createTeams(false);s.ball.setVisible(false);s.gs.bases={first:'user',second:'user',third:'user'};s.syncRunners();
        s._walkReview={samples:0,bad:[]};
        for(const p of Object.values(s.fielders))p.setPosition(p.x+45,p.y-35);
        s.fielders.P.setPosition(270,220);
        // Finish a real pitching animation while already returning to position.
        s.fielders.P.playPitch(()=>{});s.returnFielders();
        s.events.on('postupdate',()=>{
            for(const [pos,p] of Object.entries(s.fielders)) {
                if(s.playerMotion().moves.has(p)&&!p._busy) {
                    s._walkReview.samples++;
                    if(!p._anim.startsWith('walk_'))s._walkReview.bad.push({pos,anim:p._anim});
                }
            }
        });})();`);
    await wait(450);await capture('browser-upright-return.png');
    const sizes=await evaluate(`[...Object.values(reviewScene.fielders),...Object.values(reviewScene.runnerDots),
        reviewScene.batter,reviewScene.onDeckBatter].map(p=>({scale:p.scaleX,display:p._spr.displayWidth}))`);
    assert(sizes.every(p=>p.scale===1&&p.display===84),'All players share the same model scale');
    // A late ready pose must not leave a moving fielder crouch-sliding.
    await evaluate(`reviewScene.bb2Anim(reviewScene.fielders.CF,'ready');void 0;`);
    await until('!reviewScene.fielders.P._busy',5000);
    assert((await evaluate('reviewScene.fielders.P._anim')).startsWith('walk_'),'Pitch follow-through returns to recovery jogging');
    await until('reviewScene.playerMotion().moves.size===0',20000);
    const walking=await evaluate('reviewScene._walkReview');
    assert(walking.samples>100);assert.equal(walking.bad.length,0,JSON.stringify(walking.bad.slice(0,5)));
    const settled=await evaluate(`Object.fromEntries(Object.entries(reviewScene.fielders).map(([pos,p])=>[pos,p._anim]))`);
    assert.equal(settled.CF,'ready');assert.equal(settled.P,'set');assert.equal(settled['1B'],'ready_at_bag');
    await capture('browser-equal-player-scale.png');
    const outfield=await evaluate(`['LF','CF','RF'].map(pos=>({pos,key:reviewScene.fielders[pos]._animKey}))`);
    assert(outfield[0].key.endsWith('|ready_right'));
    assert(outfield[1].key.endsWith('|ready'));
    assert(outfield[2].key.endsWith('|ready_left'));
    await evaluate('reviewScene.setDefenseReady(true);void 0;');
    assert(await evaluate(`['LF','CF','RF'].every(pos=>reviewScene.fielders[pos]._anim==='pitch_ready')`));
    await capture('browser-outfield-pitch-ready.png');
    for(const action of ['catch_fly','field_bounce','throw_relay']) {
        await evaluate(`reviewScene.bb2Anim(reviewScene.fielders.CF,'${action}');void 0;`);
        await until(`reviewScene.fielders.CF._anim==='pitch_ready'`,3000);
    }
    // Ending a play must not interrupt a catch, and its completion must stand tall.
    await evaluate(`reviewScene.bb2Anim(reviewScene.fielders.CF,'catch_fly');reviewScene.setDefenseReady(false);void 0;`);
    assert.equal(await evaluate('reviewScene.fielders.CF._anim'),'catch_fly');
    await until(`reviewScene.fielders.CF._anim==='ready'`,3000);
    assert(await evaluate(`['LF','CF','RF'].every(pos=>reviewScene.fielders[pos]._anim==='ready')`));
    await evaluate(`(() => {const s=reviewScene,p=s.fielders.CF,h=FIELD.FIELDER_HOMES.CF;
        s.jog(p,h.x+20,h.y,1500);p.setPosition(h.x+1,h.y);s.returnFielders();})();`);
    assert.equal(await evaluate('reviewScene.playerMotion().moves.has(reviewScene.fielders.CF)'),false);
    await wait(250);
    assert.equal(await evaluate('reviewScene.fielders.CF.x-FIELD.FIELDER_HOMES.CF.x'),1);
    await evaluate('reviewScene.startContactRunners();void 0;');await wait(350);
    assert(await evaluate('Object.values(reviewScene.playRunners).every(r=>r.sprite.scaleX===1)'), 'Live baserunners retain full scale');
    return {sizes,walking,settled,outfield};
};
