const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.gs.bases={first:null,second:null,third:null};s.createTeams(false);s.audio.speak=()=>{};
        s._catchSamples=[];
        const action=s.defensiveAction;
        s.defensiveAction=function(p,name,contact,done,hold){
            return action.call(this,p,name,resume=>{
                const glove=p.ballPoint('glove');
                this._contactError=Math.hypot(this.ball.x-glove.x,this.ball.y-glove.y);
                if(contact)contact(resume);
            },done,hold);
        };
        const arc=s.ballArc;
        s.ballArc=function(from,to,ms,height,done){return arc.call(this,from,to,ms,height,()=>{
            if(this._airReceiver){const glove=this._airReceiver.ballPoint('glove');
                this._contactError=Math.hypot(this.ball.x-glove.x,this.ball.y-glove.y);}
            if(done)done();
        });};
        s._prepCatch=()=>{s.time.removeAllEvents();s._caught=false;
            s._airReceiver=null;s._contactError=null;
            for(const p of s.playerMotion().players())s.stopPlayerMovement(p);
            for(const [pos,p] of Object.entries(s.fielders)){
                p._fieldAction?.cancel();p._busy=false;p._spr.anims.resume();
                p.setPosition(FIELD.FIELDER_HOMES[pos].x,FIELD.FIELDER_HOMES[pos].y);p.idleAnim();
            }
        };
        s._sampleCatch=p=>{const glove=p.ballPoint('glove'),clip=s.fieldingClip(p,p._anim).clip;
            s._catchSamples.push({pos:p._label.text,anim:p._anim,frame:Number(p._spr.frame.name),
                expected:clip.start+clip.contactFrame,error:Math.hypot(s.ball.x-glove.x,s.ball.y-glove.y),contactError:s._contactError,
                gloveY:glove.y-p.y,hidden:s.ball.alpha===0,owner:s._ballHolder===p});
            s._caught=true;s.scene.pause();
        };
        })();`);
    for(const kind of ['fly','line','ground'])for(const pos of ['SS','2B','3B','1B','P','LF','CF','RF']) {
        await evaluate(`(()=>{const s=reviewScene;s._prepCatch();const p=s.fielders['${pos}'];
            if('${kind}'==='ground'){
                const spot={x:p.x+30,y:p.y+18};
                s.chaseGroundBall(p,FIELD.HOME,spot,650,12,()=>s._sampleCatch(p));
                s._zoomOnPoint(spot.x,spot.y,2,0);
            }else{
                s._airReceiver=p;
                const plan=s.chaseFlyBall(FIELD.HOME,'${pos}',()=>s._sampleCatch(p),'${kind}');
                s._zoomOnPoint(plan.spot.x,plan.spot.y,2,0);
            }
        })();`);
        await until('reviewScene._caught',7000);
        const sample=await evaluate('reviewScene._catchSamples.at(-1)');
        assert.equal(sample.frame,sample.expected,JSON.stringify(sample));
        assert(sample.error<.1 && sample.hidden && sample.owner,JSON.stringify(sample));
        assert(sample.contactError!==null && sample.contactError<1,JSON.stringify(sample));
        assert.equal(sample.anim,kind==='fly'?'catch_fly':kind==='line'?'catch_line':['LF','CF','RF'].includes(pos)?'field_bounce':'field_grounder');
        if(pos==='SS'||pos==='CF')await capture('browser-catch-'+kind+'-'+pos+'.png');
        await evaluate('reviewScene.scene.resume();void 0;');
        await wait(650);
        assert(!await evaluate(`reviewScene.fielders['${pos}']._busy`),'Catch must recover');
    }
    const samples=await evaluate('reviewScene._catchSamples');
    for(const pos of ['SS','2B','3B','1B','P','LF','CF','RF']) {
        const [fly,line,ground]=['catch_fly','catch_line',['LF','CF','RF'].includes(pos)?'field_bounce':'field_grounder']
            .map(anim=>samples.find(s=>s.pos===pos&&s.anim===anim));
        assert(fly.gloveY<line.gloveY-5 && line.gloveY<ground.gloveY-12,JSON.stringify({fly,line,ground}));
    }
};
