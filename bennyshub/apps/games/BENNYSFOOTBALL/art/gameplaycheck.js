// Run the real play methods with a deterministic clock and tween adapter.
// No browser or npm dependencies: node art/gameplaycheck.js
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
let seed = 7;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const math = Object.create(Math); math.random = random;
const context = { Math: math, console, localStorage: { getItem: () => null },
    Phaser: { Scene: class {}, Math: { Clamp: (x,a,b) => Math.max(a,Math.min(b,x)),
        Linear: (a,b,t) => a+(b-a)*t, Distance: { Between: (a,b,c,d) => Math.hypot(a-c,b-d) } },
        Utils: { Array: { Shuffle: a => a, GetRandom: a => a[Math.floor(random()*a.length)] } } } };
vm.createContext(context);
for (const name of ['constants.js','motion.js','game.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name),'utf8'),context);
const { GameScene, FIELD, PLAYS, DEF_PLAYS, P } = vm.runInContext('({ GameScene, FIELD, PLAYS, DEF_PLAYS, P: PLAYER_SPRITE })',context);
const layer = () => ({ setFrame(i){this.frame=i;return this;},setTexture(k,i){this.key=k;this.frame=i;return this;} });
function player(role) {
    return { x:0,y:0,role,angle:0,scaleX:1,scaleY:1,
        setPosition(x,y){this.x=x;this.y=y;return this;}, setScale(){return this;},setAngle(a){this.angle=a;return this;},setDepth(){return this;},
        _label:{setText(){}}, _spr:{ base:layer(),jersey:layer(),glow:layer(),dir:6,phase:0,idlePhase:0,lastX:null,lastY:null } };
}
function fixture(yard=25, defense=false, classic=false) {
    const s = new GameScene(), timers=[], tweens=[], events=[];
    s.events={once(){}};
    s.time={addEvent(config){const e={...config,elapsed:0,paused:false,active:true,remove(){this.active=false;this.callback=null;}};timers.push(e);return e;},
        delayedCall(delay,callback){return this.addEvent({delay,callback});}};
    s.tweens={paused:false,pauseAll(){this.paused=true;},resumeAll(){this.paused=false;},killTweensOf(p){tweens.filter(t=>t.config.targets===p).forEach(t=>t.stop());},
        add(config){const t={config,elapsed:0,active:true,started:false,handlers:[],from:{},
            stop(){this.active=false;}, on(name,fn){this.handlers.push(fn);return this;}};
            for(const key of ['x','y','t','angle','alpha','scaleX','scaleY']) if(typeof config[key]==='number') t.from[key]=config.targets[key]||0;
            tweens.push(t);return t;}};
    s.audio={play(key){events.push({kind:'audio',key,time:s.now});},speak(){}};
    s.cameras={main:{shake(){},pan(){},zoomTo(){}}};
    s._zoomOut=()=>{};s._zoomOnPoint=()=>{};s.updateHUD=()=>{};s.showPlayers=()=>{};
    s.offense=['QB','RB','WR','WR','TE','OL'].map(player);
    s.defense=['DL','DL','LB','CB','CB','S'].map(player);
    if(classic) s.offense.concat(s.defense).forEach(p=>delete p._spr);
    s.gs={ballPosition:yard,score:{us:0,them:0},down:1,firstDownTarget:yard+10,yardsToGo:10,timeRemaining:120};
    s.opp={yard,down:1,toGo:10,fdTarget:yard-10};
    s.playerColor={name:'Red'};s.oppColor={name:'Blue'};s.ball={x:0,y:0,visible:true};
    s.onDefense=defense;s.phase='anim';s.now=0;
    const formation=defense?s.defenseFormationPositions(yard):s.formationPositions(yard);
    s.offense.forEach((p,i)=>Object.assign(p,defense?formation.ourDef[i]:formation.off[i]));
    s.defense.forEach((p,i)=>Object.assign(p,defense?formation.oppOff[i]:formation.def[i]));
    s.ball.carrier=defense?s.defense[0]:s.offense[0];
    s.endPlay=(yards,type)=>{s.result={yards,type,spot:s.ball.carrier?.x};};
    s.endOppPlay=(yards,type)=>{s.result={yards,type,spot:s.ball.carrier?.x};};
    s.startUsDrive=yard=>{s.result={yard,team:'us'};};s.defenseDrive=yard=>{s.result={yard,team:'them'};};
    s.showAfterTouchdownMenu=()=>{s.result={touchdown:true,team:'us'};};s.oppAfterTouchdown=()=>{s.result={touchdown:true,team:'them'};};
    s.bigMessage=(message,ms,then)=>{events.push({kind:'message',message});if(then)s.time.delayedCall(ms,then);};
    s.beginReceiverSelect=()=>{s.phase='receiver';};
    s._trackGameplayTimers();
    let contact;
    const actualTackle=s.tackleShake.bind(s);
    s.tackleShake=p=>{
        const defenders=s.offense.includes(p)?s.defense:s.offense;
        const distance=Math.min(...defenders.map(d=>Math.hypot(d.x-p.x,d.y-p.y)));
        assert(distance<=25,'tackle requires visible contact, got '+distance.toFixed(2));
        contact={x:p.x,y:p.y,time:s.now,player:p};actualTackle(p);
    };
    s.tick=(dt=1000/60)=>{
        s.now+=dt;
        if(!s.tweens.paused) for(const t of [...tweens]) {
            if(!t.active)continue;t.elapsed+=dt;
            if(t.elapsed<(t.config.delay||0))continue;
            if(!t.started){t.started=true;if(t.config.onStart)t.config.onStart(t);}
            t.progress=Math.min(1,(t.elapsed-(t.config.delay||0))/Math.max(1,t.config.duration||0));
            for(const [key,from] of Object.entries(t.from)) t.config.targets[key]=from+(t.config[key]-from)*t.progress;
            if(t.config.onUpdate)t.config.onUpdate(t);
            if(t.progress>=1){t.active=false;if(t.config.onComplete)t.config.onComplete(t);for(const fn of t.handlers)fn(t);}
        }
        for(const e of [...timers]) {if(!e.active||e.paused)continue;e.elapsed+=dt;if(e.elapsed>=e.delay){
            const fn=e.callback;if(e.loop)e.elapsed-=e.delay;else{e.active=false;e.callback=null;}if(fn)fn();}}
        s._motion().update(dt);
        if(!s.paused)s._updatePlayerSprites(dt);
        for(const p of s.offense.concat(s.defense)) {
            assert(Number.isFinite(p.x)&&Number.isFinite(p.y),'finite positions');
            assert(p.x>=FIELD.LEFT-1&&p.x<=FIELD.RIGHT+1,'player stays on field horizontally');
            assert(p.y>=FIELD.TOP-1&&p.y<=FIELD.BOTTOM+1,'player stays on field vertically');
        }
    };
    s.until=(done,limit=16000,dt=1000/60)=>{const end=s.now+limit;while(!done()&&s.now<end)s.tick(dt);assert(done(),'play stalled after '+limit+' ms');};
    s.contact=()=>contact;s.log=events;s.timers=timers;
    return s;
}
const report=[];
for(const classic of [false,true]) for(const id of ['INSIDE_RUN','OUTSIDE_RUN']) for(const yard of [2,25,60,97]) {
    seed=17+yard;const s=fixture(yard,false,classic);s.execRun(PLAYS[id]);s.until(()=>s.result);
    if(s.result.yards!==undefined && s.contact())assert.equal(s.result.yards,s._spotYard(s.contact().x)-yard);
    report.push({play:id,yard,classic,result:s.result,time:Math.round(s.now)});
}
for(const type of ['run','sack','tfl']) for(const yard of [3,40,98]) {
    const s=fixture(yard,true);let result;
    s.animateOppPlay(type==='run'?7:-6,type,actual=>{result=actual;},null,null,'neutral');
    s.until(()=>result!==undefined);
    if(type==='sack')assert.equal(s.contact().player,s.defense[0],'QB is sacked, not RB');
    if(s.contact())assert.equal(result,yard-s._spotYard(s.contact().x));
    report.push({play:'CPU '+type,yard,result,time:Math.round(s.now)});
}
for(const id of ['SHORT_PASS','LONG_PASS']) {
    seed=41;const s=fixture(35);s.startPass(PLAYS[id]);s.until(()=>s.phase==='receiver');
    const arrival=s.receivers.map(r=>({x:r.player.x,y:r.player.y}));
    assert.equal(new Set(s.receivers.flatMap(r=>r.defenders)).size,s.receivers.flatMap(r=>r.defenders).length,'defenders have unique assignments');
    for(let i=0;i<600;i++)s.tick();
    assert(s.receivers.some((r,i)=>Math.abs(r.player.y-arrival[i].y)>3),'receivers continue working while selection waits');
    assert.equal(s.contact(),undefined,'accessible selection does not auto-sack');
    s.target=s.receivers[0];s.phase='anim';s.throwPass(0);s.until(()=>s.result);
    assert.equal(s.result.type,'incomplete');
    report.push({play:id+' routes / scan / incompletion',time:Math.round(s.now)});
}
const focusMetrics=[];
for(const fps of [30,60,120]) {
    seed=41;const s=fixture(35);s.startPass(PLAYS.LONG_PASS);s.until(()=>s.phase==='receiver');
    const players=s.offense.concat(s.defense), pocket=s._motion().pocket;
    const previous=players.map(p=>({x:p.x,y:p.y,vx:0,vy:0}));
    let maxSpeed=0,maxAcceleration=0;
    for(let frame=0;frame<fps*12;frame++) {
        if(frame===fps*6) {
            s.target=s.receivers[0];s.beginCharge();s.startCharge();
            assert.equal(s._motion().pocket,pocket,'charging continues the existing motion without restarting');
        }
        s.tick(1000/fps);
        players.forEach((p,i)=>{
            const last=previous[i],vx=(p.x-last.x)*fps,vy=(p.y-last.y)*fps;
            maxSpeed=Math.max(maxSpeed,Math.hypot(vx,vy));
            if(frame>1)maxAcceleration=Math.max(maxAcceleration,Math.hypot(vx-last.vx,vy-last.vy)*fps);
            Object.assign(last,{x:p.x,y:p.y,vx,vy});
            const row=Math.floor(p._spr.base.frame/P.dirs);
            const clip=s.ball.carrier===p?P.anims.idle_carry:P.anims.idle;
            assert(row>=clip.row&&row<clip.row+clip.frames,'focus movement does not flicker between running and ready poses');
        });
    }
    assert(maxSpeed<12,'passing focus stays slow: '+maxSpeed);
    assert(maxAcceleration<40,'passing focus has no stop/start bursts: '+maxAcceleration);
    focusMetrics.push({fps,maxSpeed:+maxSpeed.toFixed(2),maxAcceleration:+maxAcceleration.toFixed(2),positions:players.map(p=>[p.x,p.y])});
    s.power=0;s.releaseCharge();s.until(()=>s.result);
    assert.equal(s._motion().pocket,null,'normal play resumes after release');
}
for(const sample of focusMetrics.slice(1))sample.positions.forEach((p,i)=>{
    const reference=focusMetrics[0].positions[i];
    assert(Math.hypot(p[0]-reference[0],p[1]-reference[1])<.15,'focus motion is consistent across frame rates');
});
{
    const s=fixture(25);s.startPass(PLAYS.SHORT_PASS);s.until(()=>s.phase==='receiver');
    const r=s.receivers[0];s.phase='anim';
    s._passFlight(s.offense[0],r.player,{x:r.player.x,y:r.player.y},620,()=>s._completePass(r));
    s.until(()=>s.result);assert.equal(s.result.type,'pass');
    report.push({play:'catch and run',result:s.result});
}
{
    const s=fixture(25),db=s.defense[3];db.x=FIELD.GOAL_L+70*7;db.y=250;
    s.ball.carrier=db;s._interceptPass({},db);s.until(()=>s.result);
    assert.equal(s.result.yard,s._spotYard(s.contact().x),'interception possession starts at actual return spot');
    report.push({play:'interception return',result:s.result});
}
{
    const s=fixture(30);const p=s.offense[1];p._spr.action={clip:P.anims.tackle,t:5};
    s.offense[4].x=850;let arrived=false;
    s.tweenFormation(30,300,()=>{arrived=true;});
    assert.equal(s._lineFormationReady,false,'line stances wait for formation arrival');
    s.tick(16);assert.equal(p._spr.action.clip,P.anims.recover,'get up before moving');
    s.until(()=>arrived);
    assert.equal(s._lineFormationReady,true,'formation is set before pre-snap stances are enabled');
    const targets=s.formationPositions(30);
    s.offense.forEach((p,i)=>assert(Math.hypot(p.x-targets.off[i].x,p.y-targets.off[i].y)<1));
    s.defense.forEach((p,i)=>assert(Math.hypot(p.x-targets.def[i].x,p.y-targets.def[i].y)<1));
    report.push({play:'formation completion barrier',time:Math.round(s.now)});
}
{
    const s=fixture(40);let old=0;s._motion().after(100,()=>old++);s._motion().reset();
    for(let i=0;i<20;i++)s.tick();assert.equal(old,0,'old play callbacks are cancelled');
    const p=s.offense[1];let first=0,second=0;
    s.jog(p,500,320,600,undefined,()=>first++);s.tick();
    s.jog(p,410,350,300,undefined,()=>second++);s.until(()=>second===1);
    assert.equal(first,0,'replaced movement cannot call its old completion');
    assert.equal(p.x,410);assert.equal(p.y,350);
}
{
    const s=fixture(40);s.execRun(PLAYS.INSIDE_RUN);for(let i=0;i<30;i++)s.tick();
    let fired=0;s.time.delayedCall(100,()=>fired++);
    s.add={rectangle:()=>({setDepth(){return this;},setScrollFactor(){return this;},destroy(){}})};
    s.showPauseMenu=()=>{};
    s.togglePause();
    const positions=s.offense.concat(s.defense).map(p=>[p.x,p.y]);
    let menu=0;s.time.delayedCall(100,()=>menu++);
    for(let i=0;i<60;i++)s.tick();assert.equal(fired,0);assert.equal(menu,1,'pause UI timers continue');
    s.offense.concat(s.defense).forEach((p,i)=>assert.deepEqual([p.x,p.y],positions[i]));
    s.closePause();s.until(()=>s.result);assert.equal(fired,1);
}
for (const receiving of ['us','them']) for (const classic of [false,true]) {
    const s=fixture(30,false,classic);s.kickoff(receiving);s.until(()=>s.result,22000);
    assert(s.log.some(e=>e.key==='kick'));assert(s.log.some(e=>e.key==='catch'));
    if(s.contact())assert.equal(s.result.yard,s._spotYard(s.contact().x));
    report.push({play:'kickoff '+receiving,classic,result:s.result});
}
for(const us of [true,false]) for(const yard of [10,50,90]) {
    const s=fixture(yard,!us);s._puntSequence(us);s.until(()=>s.result,24000);
    assert(s.log.some(e=>e.key==='kick'));
    report.push({play:'punt '+(us?'us':'them'),yard,result:s.result});
}
for(const id of Object.keys(DEF_PLAYS)) for(let i=0;i<30;i++) {
    seed=1000+i*491;const s=fixture([2,35,75,98][i%4],true);
    s.resolveOppPlay(DEF_PLAYS[id]);s.until(()=>s.result,24000);
}
for(const us of [true,false]) {
    const s=fixture(us?98:2,!us);
    const attack=us?s.offense:s.defense, defend=us?s.defense:s.offense, p=attack[1], dir=us?1:-1;
    // Contact half a yard before the goal must not round up into a score.
    p.x=(us?FIELD.GOAL_R:FIELD.GOAL_L)-dir*3;p.y=310;
    let spot;s._runWithBall(p,attack,defend,us?100:0,p.y,dir,x=>spot=x);
    defend[0].x=p.x+dir*15;defend[0].y=p.y;
    s._motion().finishRun(false,defend[0]);s.until(()=>spot!==undefined);
    assert.equal(spot,us?99:1,'score requires crossing the goal line');
}
const distribution={};
for(const us of [true,false]) {
    const s=fixture(us?98:2,!us), attack=us?s.offense:s.defense, defend=us?s.defense:s.offense;
    const dir=us?1:-1, runner=attack[1], goal=us?FIELD.GOAL_R:FIELD.GOAL_L;
    runner.x=goal-dir*6;runner.y=310;
    defend.forEach((p,i)=>{p.x=goal-dir*160;p.y=170+i*45;});
    s.endPlay=GameScene.prototype.endPlay;s.endOppPlay=GameScene.prototype.endOppPlay;
    s._runWithBall(runner,attack,defend,us?100:0,310,dir,(spot,result)=>{
        assert(result.touchdown);assert((runner.x-goal)*dir>=0);
        if(us)s.endPlay(spot-98,'run');else s.endOppPlay(2-spot,'run');
    });
    assert.equal(s.gs.score[us?'us':'them'],0,'no score before the run');
    s.until(()=>s.result);assert.equal(s.gs.score[us?'us':'them'],6);
}
{
    const s=fixture(35);seed=77;s.endPlay=GameScene.prototype.endPlay;s.flashSub=()=>{};
    s.showPlayCall=()=>{s.result={nextSnap:true};};s.execRun(PLAYS.INSIDE_RUN);s.until(()=>s.result);
    assert(s.result.nextSnap);assert.equal(s.gs.down,2);
    const targets=s.formationPositions(s.gs.ballPosition);
    s.offense.forEach((p,i)=>assert(Math.hypot(p.x-targets.off[i].x,p.y-targets.off[i].y)<1));
}
for(const id of ['INSIDE_RUN','OUTSIDE_RUN']) {
    const yards=[];
    for(let i=0;i<100;i++) {
        seed=i*977+61;const s=fixture(30);s.execRun(PLAYS[id]);s.until(()=>s.result);
        yards.push(s.result.yards??s.result.yard-30);
    }
    assert(new Set(yards).size>=4,'runs produce varied gains');
    distribution[id]={min:Math.min(...yards),max:Math.max(...yards),average:+(yards.reduce((a,b)=>a+b,0)/yards.length).toFixed(2)};
}
for(const us of [true,false]) for(const pat of [false,true]) for(const classic of [false,true]) {
    seed=17;const yard=us?(pat?85:65):(pat?3:35),s=fixture(yard,!us,classic);
    s.kickToOpponent=()=>{s.result={kickoff:'them'};};s.kickoffToUs=()=>{s.result={kickoff:'us'};};
    s.isPAT=pat;s.fgDist=pat?20:52;s.aimWindow=.3;
    if(us)s.kickFieldGoal(0,100);else if(pat)s.oppKickPAT();else s.oppKickFG();
    s.until(()=>!!s._placeKick);
    const set=s._placeKick;
    assert.equal(set.kicker.role,'K');assert.equal(set.holder.role,'H');assert.equal(set.snapper.role,'LS');
    assert.notEqual(set.kicker,set.holder,'holder does not take the kick');
    const holderPosition=[set.holder.x,set.holder.y];
    let heldBall=false,kickPose=false,followThrough=false;
    while(!s.result&&s.now<24000) {
        if(!set.struck)assert.equal(s.gs.score[us?'us':'them'],0,'no score before foot contact');
        s.tick();heldBall ||= !!s.ball.placed;
        kickPose ||= set.kicker._spr?.action?.clip===P.anims.placekick;
        if(!classic) {
            assert.equal(set.holder._spr.sheet,P.actions.baseKey,'holder uses the kneeling sheet');
            assert.equal(Math.floor(set.holder._spr.base.frame/P.dirs),P.anims.holder.row,'holder stays visibly kneeling');
            followThrough ||= set.struck && set.kicker._spr.sheet===P.actions.baseKey
                && Math.floor(set.kicker._spr.base.frame/P.dirs)===P.anims.placekick.row+6;
        }
        assert.deepEqual([set.holder.x,set.holder.y],holderPosition,'holder stays planted through the kick');
    }
    assert(s.result,'field goal sequence completes');assert(heldBall,'snap reaches the holder before the approach');
    if(!classic) {
        assert(kickPose,'the kicker plays the dedicated place-kick animation');
        assert(followThrough,'the kicking leg follows through after ball release');
    }
    assert.equal(s.gs.score[us?'us':'them'],pat?1:3);
    assert.equal(s.log.filter(e=>e.key==='snap').length,1);assert.equal(s.log.filter(e=>e.key==='kick').length,1);
}
for(const [aim,power] of [[1,100],[0,0]]) {
    const s=fixture(65);s.fgDist=52;s.aimWindow=.3;
    s.kickFieldGoal(aim,power);s.until(()=>s.result,24000);
    assert.equal(s.gs.score.us,0,'wide and short kicks do not score');
    assert(s._placeKick.struck,'misses still animate a complete kick');
    assert.equal(s.log.filter(e=>e.key==='kick').length,1);
}
{
    const s=fixture(65);s.input={on(){},off(){}};
    s.beginFgAim();assert.equal(s.phase,'transition','aim waits for the special-teams formation');
    s.until(()=>s.phase==='fgaim');
    assert.equal(s.ball.x,s._placeKick.snapper.x,'ball waits at the long snapper');
    for(let i=0;i<180;i++)s.tick();
    assert.equal(Math.floor(s._placeKick.holder._spr.base.frame/P.dirs),P.anims.holder.row);
    assert.equal(Math.floor(s._placeKick.snapper._spr.base.frame/P.dirs),P.anims.stance_ol.row);
    assert.equal(s.log.filter(e=>e.key==='snap').length,0,'aiming does not snap the ball');
}
if(process.argv.includes('--record-kick')) {
    const s=fixture(65);s.fgDist=52;s.aimWindow=.3;s.kickToOpponent=()=>{s.result={done:true};};
    let ready=false;s._setupPlaceKick(true,65,()=>ready=true);s.until(()=>ready);s.phase='fgaim';
    const frames=[],start=s.now;
    for(let i=0;i<100&&!s.result;i++) {
        if(i===15){s.phase='anim';s.kickFieldGoal(0,100);}
        s.tick(1000/30);
        frames.push({time:s.now-start,ball:{x:s.ball.x,y:s.ball.y,visible:s.ball.visible,placed:s.ball.placed},struck:!!s._placeKick.struck,
            players:s.offense.concat(s.defense).map(p=>({x:p.x,y:p.y,frame:p._spr.base.frame,sheet:p._spr.sheet,role:p.role}))});
    }
    fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'out/kick-playback.json'),JSON.stringify({frames}));
}
if(process.argv.includes('--record')) {
    const s=fixture(30);seed=61;const frames=[];s.execRun(PLAYS.OUTSIDE_RUN);
    while(!s.result&&s.now<15000){s.tick(1000/30);frames.push({time:s.now,ball:s.ball.carrier?s.offense.concat(s.defense).indexOf(s.ball.carrier):-1,
        players:s.offense.concat(s.defense).map(p=>({x:p.x,y:p.y,frame:p._spr.base.frame,sheet:p._spr.sheet,role:p.role,block:!!p._blocking}))});}
    fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'out/playback.json'),JSON.stringify({frames,result:s.result}));
}
if(process.argv.includes('--verbose'))console.log(JSON.stringify(report,null,2));
console.log('Run distribution (100 seeded plays each):',distribution);
console.log('Passing focus (px/s and px/s²):',focusMetrics.map(({positions,...metrics})=>metrics));
console.log('Gameplay checks passed: contact and yardage, bounds, goal lines, routes, accessible selection waits, passing, interceptions, recovery, movement ownership, pause, both kickoff/punt directions, field goals and extra points for both teams, and 120 CPU play calls.');
