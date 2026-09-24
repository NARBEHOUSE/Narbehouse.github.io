const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture}){
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');void 0;`);
    const races=[];
    const checkUntil=async(expression,timeout)=>{
        try {await until(expression,timeout);}catch(e){
            throw new Error(e.message+' '+JSON.stringify(await evaluate(`({result:reviewScene._result,busy:reviewScene._ballBusy,returnPending:reviewScene._returnPending,
                race:reviewScene._extraBaseRun&&{ready:reviewScene._extraBaseRun.ready,arrived:reviewScene._extraBaseRun.arrivedAt},
                players:reviewScene.playerMotion().players().map(p=>({pos:p._label?.text,x:p.x,y:p.y,anim:p._anim,busy:p._busy,action:!!p._fieldAction})),
                moves:[...reviewScene.playerMotion().moves.values()].map(m=>({pos:m.p._label?.text,goal:m.goal}))})`)));
        }
    };
    for(const [side,outcome,loaded] of [['cpu','Double',false],['cpu','Double',true],['player','Double',false],['player','Double',true],['cpu','Triple',false],['player','Triple',false]]){
        console.log('Full play:',side,outcome,loaded?'loaded':'empty');
        await evaluate(`(()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
            for(const p of s.playerMotion().players()){s.stopPlayerMovement(p);p.destroy();}
            s.fielders={};s.batter=null;s.onDeckBatter=null;s.runnerDots={};s._advanceSprites=null;s._settledRunners=null;
            s._extraBaseRun=null;s._returnPending=false;s._ballBusy=0;
            s.gs.playerIsAway=true;s.gs.half=${JSON.stringify(side==='player'?'top':'bottom')};s.gs.outs=0;
            s.gs.bases=${JSON.stringify(loaded?{first:side==='player'?'user':'comp',second:side==='player'?'user':'comp',third:side==='player'?'user':'comp'}:{first:null,second:null,third:null})};s.createTeams(false);s.syncRunners();s.resetFieldCamera(0);
            s.gs.firstPitch=false;s._result=null;s.audio.speak=(text,interrupt,done)=>{if(done)done();};
            if(!s._reviewPickup){s._reviewPickup=s.chaseGroundBall;s.chaseGroundBall=function(p,from,to,ms,arc,cb,bounce){
                this._reviewRoll=bounce?{from,bounce,to}:null;return this._reviewPickup(p,from,to,ms,arc,cb,bounce);
            };}
            if(!s._reviewFinish)s._reviewFinish=s.finishPlay;
            s.finishPlay=function(o){this._result=o;return this._reviewFinish(o);};

        })();`);
        await until('reviewScene.playerMotion().moves.size===0',15000);
        await evaluate(`reviewScene.setMenu(null);reviewScene.${side==='cpu'?'processCpuOutcome':'processBattingOutcome'}(${JSON.stringify(outcome)});`);
        if(side==='cpu'&&outcome==='Double'&&!loaded){await wait(1500);await capture('browser-double-outfield-flight.png');}
        const roll=await evaluate('reviewScene._reviewRoll');
        assert(roll&&roll.to.y<=roll.bounce.y,'The bounce must continue into the outfield');
        await checkUntil('reviewScene._extraBaseRun?.move?.progress>.45',20000);
        await capture('browser-close-'+side+'-'+outcome+'.png');
        await checkUntil('!!reviewScene._result',16000);
        const race=await evaluate('reviewScene._lastExtraBaseRace');races.push({...race,side,outcome,loaded});
        assert(race.runnerAt!=null&&race.calledAt>=race.runnerAt&&race.calledAt>=race.ballAt,JSON.stringify(races));
        assert.equal(await evaluate('reviewScene._result'),outcome);
        try {await until('!!reviewScene.menu && !reviewScene._returnPending && !reviewScene._ballBusy',16000);}
        catch(e){throw new Error(e.message+' '+JSON.stringify(await evaluate(`({busy:reviewScene._ballBusy,returnPending:reviewScene._returnPending,
            holder:reviewScene._ballHolder?._label?.text,lineup:reviewScene._lineupBusy,
            fielders:Object.entries(reviewScene.fielders).map(([pos,p])=>({pos,anim:p._anim,busy:p._busy,action:!!p._fieldAction,playing:p._spr.anims.isPlaying})),
            moves:[...reviewScene.playerMotion().moves.values()].map(m=>({pos:m.p._label?.text,x:m.p.x,y:m.p.y,goal:m.goal}))})`)));}

    }
    return races;
};
