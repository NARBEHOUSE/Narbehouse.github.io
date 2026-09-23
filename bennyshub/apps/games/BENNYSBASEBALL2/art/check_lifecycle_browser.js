const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.gs.playerIsAway=true;s.gs.half='top';s.gs.inning=1;s.gs.outs=0;s.gs.strikes=0;s.gs.balls=0;
        s.gs.firstPitch=false;s.gs.bases={first:null,second:null,third:null};s.createTeams(false);s.syncRunners();
        s.ball.setVisible(false);s.audio.speak=()=>{};s.resetFieldCamera(0);
        s._removals=[];s._watch=(p)=>{const destroy=p.destroy.bind(p);p.destroy=()=>{
            if(p.active)s._removals.push({x:p.x,y:p.y,visible:p.visible,alpha:p.alpha});destroy();};};
        window.retiredBatter=s.batter;window.promotedBatter=s.onDeckBatter;s._watch(retiredBatter);
        s.gs.strikes=2;s.gs.selectedPitchLocation='Middle';s.ib.outcomeProcessed=false;
        window.savedLifecycleRandom=Math.random;Math.random=()=>.5;s.processNoSwing();
    })();`);
    assert(await evaluate('retiredBatter.active && retiredBatter._leavingField'));
    assert(await evaluate('reviewScene.batter===promotedBatter'));
    await wait(1400);await capture('browser-retired-batter-exit.png');
    assert(await evaluate('retiredBatter.active && retiredBatter.visible && retiredBatter.alpha===1'));
    await until('!retiredBatter.active',18000);
    // Load the bases through the same visible entry path as a resumed game.
    await evaluate(`reviewScene.gs.bases={first:'user',second:'user',third:'user'};reviewScene.syncRunners();void 0;`);
    await until('Object.values(reviewScene.runnerDots).every(p=>p&&!reviewScene.playerMotion().moves.has(p))',18000);
    await until('!reviewScene._lineupBusy && !reviewScene.playerMotion().moves.has(reviewScene.onDeckBatter)',15000);
    await evaluate(`(()=>{const s=reviewScene;s.setMenu(null);
        window.outgoingRoster=[...Object.values(s.fielders),...Object.values(s.runnerDots),s.batter,s.onDeckBatter];
        outgoingRoster.forEach(s._watch);s.gs.outs=2;s.gs.strikes=2;s.gs.selectedPitchLocation='Middle';
        s.ib.outcomeProcessed=false;s.processNoSwing();})();`);
    assert(await evaluate('outgoingRoster.every(p=>p.active&&p.visible&&p.alpha===1)'));
    await wait(1000);await capture('browser-third-out-exits.png');
    await until('reviewScene._sidesChanging',10000);
    await until('!reviewScene._sidesChanging && !reviewScene._teamEntry && reviewScene.gs.half==="bottom"',35000);
    assert(await evaluate('outgoingRoster.every(p=>!p.active)'));
    const removals=await evaluate('reviewScene._removals');
    assert.equal(removals.length,15); // first retired hitter + 9 defenders + 3 runners + 2 hitters
    assert(removals.every(p=>p.x<=-35||p.x>=1035),JSON.stringify(removals));
    await capture('browser-after-side-change.png');
    await evaluate('Math.random=savedLifecycleRandom;void 0;');
    return {removals};
};
