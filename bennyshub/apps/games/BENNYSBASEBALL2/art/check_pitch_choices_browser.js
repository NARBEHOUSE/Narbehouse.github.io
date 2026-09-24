const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture,call}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        window.resetPitchReview=()=>{const s=reviewScene;
            if(s.pitchTween){s.pitchTween.stop();s.pitchTween=null;}
            if(s._ballFlight)s._ballFlight.stop();s.stopChargeMonitor();
            s._receivingPitch=false;s._returnPending=false;s._ballBusy=0;
            s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
            s.gs.playerIsAway=true;s.gs.half='top';s.gs.inning=1;s.gs.outs=0;s.gs.balls=0;s.gs.strikes=0;
            s.gs.bases={first:null,second:null,third:null};s.createTeams(false);s.syncRunners();
            s.ball.setVisible(false);s.resetFieldCamera(0);s._calls=[];
            s.audio.speak=(text,interrupt,done)=>{s._calls.push(text);if(done)done();};};resetPitchReview();`);
    await evaluate(`window.watchSwingContact=()=>{const s=reviewScene,original=s.processInteractiveSwingOutcome;
        s._readImpact=null;s.processInteractiveSwingOutcome=function(){
            this._readImpact={x:this.ball.x,y:this.ball.y};this.ib.active=false;this.ib.outcomeProcessed=true;
            this.processInteractiveSwingOutcome=original;
        };};`);
    const reads=[];
    for(const [location,tier] of [['Middle','green'],['High Middle','yellow'],['Low Outside','red']]){
        await evaluate(`resetPitchReview();reviewScene.gs.selectedPitch='Fastball';reviewScene.gs.selectedPitchLocation=${JSON.stringify(location)};reviewScene.beginChoicePitch();`);
        await until('reviewScene.ib.awaitingChoice');
        assert.equal(await evaluate('reviewScene.pitchProfile().tier'),tier);
        assert(await evaluate('reviewScene.ball.glow.visible'));
        const point=await evaluate('({x:reviewScene.ball.x,y:reviewScene.ball.y})');reads.push(point);
        assert(await evaluate('reviewScene._calls.some(t=>/Favorable pitch|Neutral pitch|Difficult pitch/.test(t))'));
        assert(!await evaluate('reviewScene._calls.some(t=>/Yellow diamond|Green circle|Red triangle/.test(t))'));
        await capture('browser-pitch-'+tier+'.png');await wait(1200);
        assert.deepEqual(await evaluate('({x:reviewScene.ball.x,y:reviewScene.ball.y})'),point);
        await evaluate('reviewScene.menu.index=4;reviewScene.menu.select();');await wait(400);
        await evaluate("reviewScene.menu.onSelect({value:'resume'});");await wait(400);
        assert.deepEqual(await evaluate('({x:reviewScene.ball.x,y:reviewScene.ball.y})'),point);
        assert.equal(await evaluate('reviewScene.pitchProfile().tier'),tier);
        const swing={green:'normal',yellow:'power',red:'bunt'}[tier];
        await evaluate(`watchSwingContact();reviewScene.setMenu(null);reviewScene.beginSelectedPitch(${JSON.stringify(swing)});`);
        await until('!!reviewScene._readImpact',3000);
        assert.deepEqual(await evaluate('reviewScene._readImpact'),point,'Selected swing moved the judged pitch');
    }
    assert.equal(new Set(reads.map(p=>JSON.stringify(p))).size,3,'Pitch locations must have distinct endpoints');
    await evaluate(`resetPitchReview();const s=reviewScene;s.gs.selectedPitch='Slider';s.gs.selectedPitchLocation='Low Outside';s.beginInteractivePitch();`);
    await until('reviewScene.ib.pitchProgress>.12');await evaluate('reviewScene.onSwingStart();');
    await until('reviewScene.ib.pitchProgress>=.83',15000);await capture('browser-charge-red.png');
    assert.equal(await evaluate('reviewScene.ball.glow.strokeColor'),0xff6565);
    assert((await evaluate('reviewScene.meterTitle.text')).includes('Difficult pitch'));
    assert(!(await evaluate('reviewScene.meterTitle.text')).includes('GREEN'));
    await until('reviewScene.gs.balls===1',6000);
    assert.equal(await evaluate('reviewScene.gs.strikes'),0);
    await evaluate('reviewScene.onSwingRelease();');
    await evaluate(`resetPitchReview();reviewScene.gs.selectedPitch='Slider';reviewScene.gs.selectedPitchLocation='Low Outside';reviewScene.beginInteractivePitch();`);
    await until('reviewScene.ib.pitchProgress>=.86',15000);
    const chargeTarget=await evaluate('reviewScene.pitchReadPoint()');
    await evaluate('watchSwingContact();reviewScene.onSwingStart();reviewScene.ib.swingPressStart=Date.now()-5000;reviewScene.onSwingRelease();');
    await until('!!reviewScene._readImpact',3000);
    const chargedImpact=await evaluate('reviewScene._readImpact');
    assert(Math.hypot(chargedImpact.x-chargeTarget.x,chargedImpact.y-chargeTarget.y)<.001,'Charge swing redirected the pitch');
    await evaluate('resetPitchReview();reviewScene.gs.half="bottom";reviewScene.createTeams(false);reviewScene.startPitchingPhase();');
    const cards=await evaluate('reviewScene.pitchGrid');assert.equal(cards.filter(c=>c.risk).length,2);
    const zones=await evaluate('reviewScene.menu.zones.map(z=>({x:z.x,y:z.y,w:z.width,h:z.height}))');
    assert(zones.every(z=>z.x-z.w/2>=0&&z.y-z.h/2>=0&&z.y+z.h/2<=600));
    await evaluate('reviewScene.menu.next();');await capture('browser-pitch-selector.png');
    await evaluate("reviewScene.menu.index=5;reviewScene.menu.select();reviewScene.menu.onSelect({value:'resume'});");
    assert.deepEqual(await evaluate('reviewScene.pitchGrid'),cards);
    await evaluate('reviewScene.setMenu(null);reviewScene.gs.score.Red=12;reviewScene.gs.score.Blue=7;reviewScene.updateHUD();');
    await capture('browser-team-scores.png');
    for(const [player,cpu] of [['Black','White'],['Purple','Yellow']]){
        await evaluate(`setTeamColors(getColorByName(${JSON.stringify(player)}),getColorByName(${JSON.stringify(cpu)}));reviewScene.updateHUD();`);
        assert.equal(await evaluate('reviewScene.scoreAwayTxt.style.fontSize'),'60px');
        await capture('browser-score-'+player+'.png');
    }
    await evaluate("setTeamColors(getColorByName('Red'),getColorByName('Blue'));resetPitchReview();reviewScene.gs.hitBatters=2;reviewScene.gs.hbpEscalation=2;reviewScene.gs.selectedPitch='Fastball';reviewScene.gs.selectedPitchLocation='Wide Inside';reviewScene.beginChoicePitch();");
    await until('reviewScene.ib.awaitingChoice');
    await evaluate("reviewScene.ib.hitByPitch=true;reviewScene.menu.index=3;reviewScene.menu.select();");
    await until('reviewScene.batter._anim==="hit_by_pitch"',6000);await capture('browser-hit-by-pitch.png');
    await until('reviewScene._confrontation',6000);
    assert.equal(await evaluate('reviewScene._scufflePhase'),'fighting','No waiting for the benches');
    await evaluate(`(()=>{const s=reviewScene;s._scuffleChecks={punches:0,bad:[]};s._checkOpponent=()=>{
        if(s._scufflePhase!=='fighting')return;
        for(const p of s.playerMotion().players())if(p._anim==='scuffle'){
            const r=p._scuffleOpponent;s._scuffleChecks.punches++;
            if(!r||!r.active||Math.hypot(r.x-p.x,r.y-p.y)>30.01||Math.abs(r.y-p.y)>10.01||p._spr.flipX!==(r.x<p.x))
                s._scuffleChecks.bad.push({pos:p._label?.text,x:p.x,y:p.y,target:r&&{x:r.x,y:r.y},flip:p._spr.flipX});
        }
    };s.events.on('postupdate',s._checkOpponent);})();`);
    await wait(600);await capture('browser-scuffle-start.png');
    assert(await evaluate('reviewScene.playerMotion().players().some(p=>p._anim.startsWith("run_"))'),'Late arrivals are still running in');
    await evaluate('window.rumbleStart=reviewScene.playerMotion().players().map(p=>({p,x:p.x,y:p.y}));void 0;');
    await wait(3400);await capture('browser-scuffle.png');
    assert(await evaluate('rumbleStart.filter(a=>Math.hypot(a.p.x-a.x,a.p.y-a.y)>15).length>=8'));
    await wait(5300);assert.equal(await evaluate('reviewScene._scufflePhase'),'fighting');
    await until('reviewScene._scufflePhase==="dusting"',3000);await capture('browser-dust-off.png');
    const fights=await evaluate('reviewScene._scuffleChecks');
    assert(fights.punches>50,'Players must reach and engage opponents');
    assert.equal(fights.bad.length,0,JSON.stringify(fights.bad.slice(0,5)));
    await evaluate("reviewScene.events.off('postupdate',reviewScene._checkOpponent);void 0;");
    await until('!reviewScene._confrontation',35000);
    await until('reviewScene.gs.bases.first===\'user\'',12000);
    assert.equal(await evaluate('reviewScene.gs.hitBatters'),3);
    assert.equal(await evaluate('reviewScene.gs.outs'),0);
    await capture('browser-after-warning.png');
    return {reads,cards};
};
