const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture,call}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.gs.bases={first:null,second:null,third:null};s.gs.outs=0;s.createTeams(false);
        s.ball.setVisible(false);s.audio.speak=()=>{};s._throws=[];s._releaseChecks=[];s._catchChecks=[];s._landChecks=[];
        const arc=s.ballArc;s.ballArc=function(from,to,ms,height,cb){
            const p=this._throwReviewActor;
            if(p){const a=this.fieldingClip(p,this.throwAction(p)).clip,hand=p.ballPoint('hand');
                this._releaseChecks.push({pos:p._fieldPosition||p._label.text,anim:p._anim,
                    frame:Number(p._spr.frame.name),expected:a.start+a.contactFrame,
                    handError:Math.hypot(from.x-hand.x,from.y-hand.y),windup:this.time.now-this._throwStart});}
            const receiver=this._throwReviewReceiver;
            return arc.call(this,from,to,ms,height,()=>{
                if(p&&receiver){const glove=receiver.ballPoint('glove');this._landChecks.push({
                    error:Math.hypot(this.ball.x-glove.x,this.ball.y-glove.y),anim:receiver._anim});}
                if(cb)cb();});
        };
        const toss=s.throwToPlayer;s.throwToPlayer=function(p,r,opts,cb){
            this._throwReviewActor=p;this._throwReviewReceiver=r;this._throwStart=this.time.now;this._throws.push([p._label.text,r._label.text]);
            return toss.call(this,p,r,opts,()=>{const glove=r.ballPoint('glove');
                this._catchChecks.push({anim:r._anim,error:Math.hypot(this.ball.x-glove.x,this.ball.y-glove.y),
                    frame:Number(r._spr.frame.name),hidden:this.ball.alpha===0,owner:this._ballHolder===r});
                if(cb)cb();});
        };
        s.finishPlay=outcome=>{s._outcome=outcome;s.returnBallToPitcher(outcome);};
        s._prep=()=>{s.time.removeAllEvents();for(const p of Object.values(s.fielders)){
            if(p._fieldAction)p._fieldAction.cancel();p._returnAfterAction=false;s.stopPlayerMovement(p);
        }
            s._outcome=null;s._done=false;s._throwReviewActor=null;s._ballBusy=0;s._ballHolder=null;
            for(const [pos,p] of Object.entries(s.fielders)){p.setPosition(FIELD.FIELDER_HOMES[pos].x,FIELD.FIELDER_HOMES[pos].y);p.idleAnim();}
        };
        })();`);
    // Actual return path, from each defensive position, including a pitcher off the mound.
    for(const pos of ['CF','LF','RF','SS','2B','3B','1B','C']) {
        await evaluate(`(()=>{const s=reviewScene;s._prep();const p=s.fielders['${pos}'];
            s.fielders.P.setPosition(520,390);const glove=p.ballPoint('glove');
            s.ball.setPosition(glove.x,glove.y).setVisible(true);s.hideHeldBall(p);s.returnBallToPitcher('Single');})();`);
        await wait(180);
        assert.equal(await evaluate(`reviewScene.fielders['${pos}']._anim`),pos==='C'?'rise_throw':['CF','LF','RF'].includes(pos)?'throw_relay':'throw');
        assert(await evaluate('reviewScene._ballBusy>0 && reviewScene.ball.alpha===0'),'Ball is held throughout transfer');
        if(pos==='CF'||pos==='C')await capture('browser-throw-windup-'+pos+'.png');
        await until('!reviewScene._returnPending && !reviewScene.ball.visible',5000);
        await until('!Object.values(reviewScene.fielders).some(p=>p._busy) && reviewScene.playerMotion().moves.size===0',12000);
    }
    // A cutoff really catches and throws onward; a routine toss follows the relay.
    await evaluate(`(()=>{const s=reviewScene;s._prep();s.chaseDownExtraBaseHit('Triple',()=>s.finishPlay('Triple'));})();`);
    await until('reviewScene._outcome=== "Triple" && !reviewScene._returnPending && !reviewScene.ball.visible',20000);
    await until('!Object.values(reviewScene.fielders).some(p=>p._busy)',5000);
    const relay=await evaluate('reviewScene._throws.slice(-3)');
    assert.deepEqual(relay,[['RF','2B'],['2B','3B'],['3B','P']]);
    // Base race and catcher throw-down use the same rendered release contract.
    await evaluate(`(()=>{const s=reviewScene;s._prep();s.animateThrowRace({fromXY:s.fielders.SS,throwerPos:'SS',
        targetBase:'first',out:true,throwTimeMs:650},()=>{s._done=true;s.returnBallToPitcher('Ground Out');});})();`);
    await until('reviewScene._done && !reviewScene._returnPending && !reviewScene.ball.visible',7000);
    await until('!Object.values(reviewScene.fielders).some(p=>p._busy)',5000);
    await evaluate(`(()=>{const s=reviewScene;s._prep();s.processStealAttempt('second');})();`);
    await until('reviewScene._outcome && !reviewScene._returnPending && !reviewScene.ball.visible',7000);
    await until('!Object.values(reviewScene.fielders).some(p=>p._busy)',5000);
    // Regression: first baseman fields it and flips to a pitcher covering
    // first. A 220ms toss must never turn the pitcher's run into a teleport.
    await evaluate(`(()=>{const s=reviewScene;s._prep();window.coverPitcher=s.fielders.P;
        window.coverStart={x:coverPitcher.x,y:coverPitcher.y};s._coverageSteps=[];
        let previous={...coverStart};s._coverageWatch=(time,delta)=>{
            s._coverageSteps.push({step:Math.hypot(coverPitcher.x-previous.x,coverPitcher.y-previous.y),delta});
            previous={x:coverPitcher.x,y:coverPitcher.y};};s.events.on('postupdate',s._coverageWatch);
        s.animateThrowRace({throwerPos:'1B',targetBase:'first',out:true,throwTimeMs:220},()=>s._done=true);
    })();`);
    await wait(450);assert(!await evaluate('reviewScene._done'),'Out called before pitcher ran to first');
    assert(await evaluate('Math.hypot(coverPitcher.x-coverStart.x,coverPitcher.y-coverStart.y)<70'));
    await capture('browser-pitcher-covering-first.png');
    await until('reviewScene._done',9000);
    assert(await evaluate('Math.hypot(coverPitcher.x-FIELD.FIRST.x-9,coverPitcher.y-FIELD.FIRST.y-9)<.1'));
    const steps=await evaluate('reviewScene._coverageSteps');
    assert(steps.every(s=>s.step<=130*Math.min(s.delta,100)/1000+.02),JSON.stringify(steps.filter(s=>s.step>13.02)));
    await evaluate("reviewScene.events.off('postupdate',reviewScene._coverageWatch);reviewScene.returnBallToPitcher('Ground Out');");
    await until('!reviewScene._returnPending && !reviewScene.ball.visible',7000);
    // Called pitches include the catcher's full rise/throw and a pitcher catch.
    await evaluate(`(()=>{const s=reviewScene;s._prep();s.ball.setPosition(FIELD.HOME.x,FIELD.HOME.y-10).setVisible(true);s.catchAtPlate();})();`);
    await until('!reviewScene._receivingPitch && !reviewScene.ball.visible',5000);
    await until('!Object.values(reviewScene.fielders).some(p=>p._busy)',5000);
    const result=await evaluate('({throws:reviewScene._throws,releases:reviewScene._releaseChecks,catches:reviewScene._catchChecks,landings:reviewScene._landChecks,busy:reviewScene._ballBusy})');
    assert(result.releases.length>=13,JSON.stringify(result));
    for(const release of result.releases) {
        assert.equal(release.frame,release.expected,JSON.stringify(release));
        assert(release.handError<.1,JSON.stringify(release));assert(release.windup>200,JSON.stringify(release));
    }
    assert(result.catches.every(c=>c.error<.1&&c.hidden&&c.owner),JSON.stringify(result.catches));
    assert(result.landings.every(c=>c.error<.1),JSON.stringify(result.landings));
    assert.equal(result.busy,0);assert.equal(result.releases.length,result.catches.length);
    await capture('browser-throw-recovered.png');
    // Loaded-base outfield pickup offers all live targets through switch input.
    await evaluate(`(()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s._prep();
        s._throwReviewReceiver=null;s.gs.half='bottom';s.gs.playerIsAway=true;
        s.gs.bases={first:'comp',second:'comp',third:'comp'};s.createTeams(false);s.syncRunners();
        s.resetFieldCamera(0);s.startCpuSingle();})();`);
    await until('!!reviewScene.menu',10000);
    assert.deepEqual(await evaluate('reviewScene.menu.options.map(o=>o.value)'),['first','second','third','home','hold']);
    await capture('browser-outfield-throw-choices.png');await wait(2000);
    for(let i=0;i<5;i++){
        await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
        await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
        await wait(250);
    }
    assert.equal(await evaluate('reviewScene.menu.options[reviewScene.menu.index].value'),'hold');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await until('reviewScene._outcome==="Single" && !reviewScene._returnPending',10000);
    assert.equal(await evaluate('reviewScene._throws.at(-1)[1]'),'P');
    return result;
};
