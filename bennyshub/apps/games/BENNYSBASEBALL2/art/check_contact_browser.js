const assert=require('node:assert/strict');
module.exports=async function({evaluate,wait,until,capture}) {
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        (()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
        s.audio.speak=()=>{};const sound=s.audio.play.bind(s.audio);
        s.audio.play=k=>{const nested=s._insideAudio;if(s._contactReview&&!nested)s._contactReview.sounds.push(k);
            s._insideAudio=true;try{return sound(k);}finally{s._insideAudio=nested;}};
        s.finishPlay=result=>{s._contactReview.result=result;};
        s.events.on('update',()=>{
            const r=s._contactReview;if(!r||r.result||!s.ball.visible||s.ball.alpha<=0)return;
            const p=s.cameras.main.matrix.transformPoint(s.ball.x,s.ball.y);
            if(p.x>=0&&p.x<=s.game.canvas.width&&p.y>=0&&p.y<=s.game.canvas.height&&Math.hypot(s.ball.x-r.start.x,s.ball.y-r.start.y)>20)r.visibleTravel++;
        });})();`);
    const results=[];
    for(const outcome of ['Foul','Strike','Home Run']) {
        await evaluate(`(()=>{const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);s.resetInteractiveBatting();
            s.gs.playerIsAway=true;s.gs.half='top';s.gs.outs=0;s.gs.strikes=0;s.gs.balls=0;
            s.gs.bases={first:null,second:null,third:null};s.createTeams(false);s.syncRunners();
            s.gs.selectedPitch='Fastball';s.gs.selectedPitchLocation='Middle';
            const start=s.swingContactPoint('normal');s.ball.setPosition(start.x,start.y).setVisible(true).setAlpha(1);
            s._contactReview={outcome:${JSON.stringify(outcome)},start,sounds:[],visibleTravel:0};
            s.calculateGoodTimingOutcome=s.calculateDecentTimingOutcome=()=>${JSON.stringify(outcome)};
            s.ib.awaitingChoice=true;s.beginSelectedPitch('normal');})();`);
        await until('reviewScene._contactReview.sounds.includes("swing")');await wait(700);
        await capture('browser-contact-'+outcome.toLowerCase().replaceAll(' ','-')+'.png');
        await until('!!reviewScene._contactReview.result',30000);
        const result=await evaluate('reviewScene._contactReview');results.push(result);
        await until('!reviewScene._receivingPitch && !reviewScene.ball.visible && (reviewScene._ballBusy||0)===0',15000);
        if(['Foul','Strike'].includes(outcome)) {
            assert(await evaluate(`reviewScene.msgText.visible && reviewScene.msgText.text.startsWith(${JSON.stringify(outcome.toUpperCase())})`));
            await capture('browser-call-'+outcome.toLowerCase()+'.png');
        }
        const hits=result.sounds.filter(k=>k==='hit'||k==='bigHit');
        assert.equal(hits.length,outcome==='Strike'?0:1,JSON.stringify(result));
        assert(result.visibleTravel>5,JSON.stringify(result));
        if(outcome==='Home Run') {
            assert.equal(result.sounds.filter(k=>k==='homer').length,1);
            assert(!result.sounds.some(k=>k==='crowd'||k==='crowd_big'));
        }
    }
    await evaluate(`reviewScene.resetFieldCamera(0);reviewScene.gs.balls=1;reviewScene.gs.strikes=2;reviewScene.showPitchCall('Ball');void 0;`);
    await wait(300);await capture('browser-call-ball.png');
    const text=await evaluate(`(()=>{const s=reviewScene,t=s.msgText,c=s.cameras.main,m=t.getWorldTransformMatrix(),p=c.matrix.transformPoint(m.tx,m.ty);
        return {text:t.text,x:p.x/c.width,y:p.y/c.height,visible:t.visible};})()`);
    assert(text.visible);assert.equal(text.text,'BALL');
    assert(Math.abs(text.x-.5)<.001&&Math.abs(text.y-.5)<.001,JSON.stringify(text));
    return results;
};
