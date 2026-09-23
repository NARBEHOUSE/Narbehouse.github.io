const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture,call}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.gs.playerIsAway=true;s.gs.half='top';s.gs.inning=1;s.gs.outs=0;s.gs.strikes=0;s.gs.balls=0;
        s.gs.bases={first:'user',second:null,third:null};s.createTeams(false);s.syncRunners();
        s.ball.setVisible(false);s.gs.selectedPitch='Curveball';s.gs.selectedPitchLocation='Middle';
        s._calls=[];s._pitchCount=0;s._catchSamples=[];
        s.audio.speak=(text,interrupt,done)=>{s._calls.push(text);if(done)window.finishPitchCall=done;};
        const play=s.fielders.P.playPitch;s.fielders.P.playPitch=(...a)=>{s._pitchCount++;return play(...a);};
        const sound=s.audio.play.bind(s.audio);s.audio.play=k=>{
            if(k==='catch'&&s._receivingPitch){const p=s.fielders.C.ballPoint('glove');
                s._catchSamples.push({error:Math.hypot(s.ball.x-p.x,s.ball.y-p.y),anim:s.fielders.C._anim});}
            sound(k);
        };
        s.showBattingMenu();})();`);
    assert.deepEqual(await evaluate('reviewScene.menu.options.map(o=>o.value)'),['bat','steal2','pause']);
    assert.equal(await evaluate('reviewScene.onDeckBatter._anim'),'on_deck');
    await wait(500);await capture('browser-ballpark.png');
    await evaluate('reviewScene.menu.next();void 0;');await wait(450);
    assert.equal(await evaluate('reviewScene.cameras.main.zoom/reviewScene._renderScale'),1,'Ready highlight stays wide');
    await evaluate('reviewScene.menu.next();void 0;');await wait(450);
    assert.equal(await evaluate('reviewScene._viewRequest.x'),500);
    assert.equal(await evaluate('reviewScene._viewRequest.y'),await evaluate('FIELD.SECOND.y'));
    await capture('browser-steal-focus.png');
    await evaluate('reviewScene.menu.next();void 0;');await wait(450);
    assert.equal(await evaluate('reviewScene.cameras.main.zoom/reviewScene._renderScale'),1,'Pause highlight restores wide field');
    // Mouse hover must not move any of the targets away from the pointer.
    for(const index of [0,1,2,0]) {
        const point=await evaluate(`(() => {const s=reviewScene,z=s.menu.zones[${index}];
            const p=s.cameras.main.matrix.transformPoint(z.x,z.y),r=s.game.canvas.getBoundingClientRect();
            return {x:r.left+p.x/s.game.canvas.width*r.width,y:r.top+p.y/s.game.canvas.height*r.height};})()`);
        await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await wait(450);
        assert.equal(await evaluate('reviewScene.menu.index'),index);
        assert.equal(await evaluate('reviewScene.cameras.main.zoom/reviewScene._renderScale'),1,'Pointer highlight must stay wide');
    }
    await capture('browser-ready-wide.png');
    await evaluate(`reviewScene.menu.index=0;reviewScene.menu.select();void 0;`);
    await wait(600);
    assert.equal(await evaluate('reviewScene._pitchCount'),0,'Pitch must wait for spoken call completion');
    assert.equal(await evaluate('reviewScene.menu'),null);
    await evaluate('finishPitchCall();void 0;');await wait(480);await capture('browser-pitcher-windup.png');
    await until('reviewScene.ib.awaitingChoice');
    assert.equal(await evaluate('reviewScene._pitchCount'),1);
    assert.deepEqual(await evaluate('reviewScene.menu.options.map(o=>o.value)'),['normal','power','bunt','take','pause']);
    assert.equal(await evaluate('reviewScene.cameras.main.zoom/reviewScene._renderScale'),1.9);
    const frozen=await evaluate('({x:reviewScene.ball.x,y:reviewScene.ball.y,angle:reviewScene.ball.seams.angle})');
    await wait(3000);
    assert.deepEqual(await evaluate('({x:reviewScene.ball.x,y:reviewScene.ball.y,angle:reviewScene.ball.seams.angle})'),frozen);
    await capture('browser-frozen-pitch.png');
    const bounds=await evaluate(`reviewScene.menu.zones.map(z=>{const p=reviewScene.cameras.main.matrix.transformPoint(z.x,z.y);
        return{x:p.x/reviewScene._renderScale,y:p.y/reviewScene._renderScale};})`);
    assert(bounds.every(p=>p.x>560&&p.x<850&&p.y>340&&p.y<590),JSON.stringify(bounds));
    await evaluate('reviewScene.menu.index=4;reviewScene.menu.select();void 0;');await wait(500);
    assert.equal(await evaluate('reviewScene.cameras.main.zoom/reviewScene._renderScale'),1);
    await evaluate('reviewScene.menu.index=0;reviewScene.menu.select();void 0;');await wait(750);
    assert.equal(await evaluate('reviewScene._pitchCount'),1,'Pause/resume must keep this delivered pitch');
    assert.deepEqual(await evaluate('({x:reviewScene.ball.x,y:reviewScene.ball.y,angle:reviewScene.ball.seams.angle})'),frozen);
    // Force a called third strike, retaining the real catch, finish and walk-up.
    await evaluate(`window.beforeBatter=reviewScene.batter;window.beforeDeck=reviewScene.onDeckBatter;
        reviewScene.gs.strikes=2;reviewScene.gs.selectedPitchLocation='Middle';
        window.savedRandom=Math.random;Math.random=()=>.5;reviewScene.menu.index=3;void 0;`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await until('reviewScene._catchSamples.length>0');
    const caught=await evaluate('reviewScene._catchSamples[0]');
    assert.equal(caught.anim,'receive');assert(caught.error<1,JSON.stringify(caught));
    await capture('browser-catcher-receive.png');
    assert.equal(await evaluate('reviewScene._pitchCount'),1,'Take Pitch must not throw a second pitch');
    await until('reviewScene.batter===beforeDeck');
    await capture('browser-batter-walkup.png');
    assert(await evaluate('reviewScene.onDeckBatter!==beforeDeck && reviewScene.playerMotion().moves.has(reviewScene.onDeckBatter)'));
    await until('!reviewScene._lineupBusy',15000);
    assert.equal(await evaluate('reviewScene.batter._anim'),'stance');
    assert(await evaluate('Math.hypot(reviewScene.batter.x-FIELD.BATTER_BOX.x,reviewScene.batter.y-FIELD.BATTER_BOX.y)<2'));
    await until('!reviewScene.playerMotion().moves.has(reviewScene.onDeckBatter)',15000);
    assert.equal(await evaluate('reviewScene.onDeckBatter._anim'),'on_deck');
    await evaluate(`Math.random=savedRandom;reviewScene.time.removeAllEvents();reviewScene.setMenu(null);
        window.currentBatter=reviewScene.batter;window.currentDeck=reviewScene.onDeckBatter;
        reviewScene.resetBatter('Ball');reviewScene.resetBatter('Strike');reviewScene.resetBatter('Foul');void 0;`);
    assert(await evaluate('reviewScene.batter===currentBatter && reviewScene.onDeckBatter===currentDeck'));
    await evaluate(`reviewScene.gs.outs=3;reviewScene.resetBatter('Strike Out');void 0;`);
    assert.equal(await evaluate('reviewScene.onDeckBatter'),null);
    assert.equal(await evaluate('reviewScene.batter'),null);
    // Check actual on-screen movement during a full half-inning change.
    await evaluate(`(() => {const s=reviewScene;s.createTeams(false);s.gs.half='bottom';
        s._swapReview={done:0,maxSpeed:0};const previous=new Map();
        s._sampleSwap=(time,delta)=>{
            for(const p of s.playerMotion().players()) {
                const last=previous.get(p);
                if(last&&last.delta>0)s._swapReview.maxSpeed=Math.max(s._swapReview.maxSpeed,Math.hypot(p.x-last.x,p.y-last.y)/last.delta*1000);
                previous.set(p,{x:p.x,y:p.y,delta});
            }
        };
        s.events.on('update',s._sampleSwap);s.swapSides(()=>s._swapReview.done++);
    })();`);
    await wait(1200);await capture('browser-sides-jog-off.png');
    assert.equal(await evaluate('reviewScene._swapReview.done'),0);
    await until('!!reviewScene._teamEntry',20000);
    assert(await evaluate('reviewScene.playerMotion().moves.has(reviewScene.onDeckBatter)'));
    assert(await evaluate('reviewScene.onDeckBatter._anim.startsWith("walk_")'));
    await wait(1300);await capture('browser-sides-jog-on.png');
    await until('reviewScene._swapReview.done===1',25000);
    const sideChange=await evaluate(`(() => {const s=reviewScene;s.events.off('update',s._sampleSwap);
        return {...s._swapReview,arrived:Object.entries(s.fielders).every(([pos,p])=>Math.hypot(p.x-FIELD.FIELDER_HOMES[pos].x,p.y-FIELD.FIELDER_HOMES[pos].y)<1)};})()`);
    assert(sideChange.maxSpeed<=135,JSON.stringify(sideChange));assert(sideChange.arrived);
    assert.equal(await evaluate('reviewScene.onDeckBatter._anim'),'on_deck');
    return {frozen,bounds,caught,sideChange};
};
