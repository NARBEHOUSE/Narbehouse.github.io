// Deterministic simulation of the actual game methods and accessible menus.
// node art/check_game.js [--record]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');let seed=7,now=0,autoScan=false;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const math=Object.create(Math);math.random=random;
const storage=new Map();
const context={console,Math:math,Date:{now:()=>now},setTimeout,clearTimeout,setInterval,clearInterval,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    window:{addEventListener(){},removeEventListener(){},NarbeScanManager:{getSettings:()=>({autoScan}),getScanInterval:()=>1000}},
    document:{addEventListener(){},removeEventListener(){},visibilityState:'visible'},
    Phaser:{Scene:class{},Math:{Linear:(a,b,t)=>a+(b-a)*t,Clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
        Between:(a,b)=>Math.floor(a+random()*(b-a+1)),Distance:{Between:(a,b,c,d)=>Math.hypot(a-c,b-d)}},
        Input:{Keyboard:{KeyCodes:{SPACE:32}}},Utils:{Array:{GetRandom:a=>a[Math.floor(random()*a.length)]}}}};
vm.createContext(context);
for(const f of ['constants','player-art','sprites','ui','fielding','rendering','scenes','movement','game']) vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),context);
const api=vm.runInContext('({GameScene,SettingsScene,ScanInput,ScanList,FIELD,BB2_SHEETS,BB2_FOOT_OFFSET,BB2_DISPLAY,BB2_CELL,BASEBALL_ART,bb2BattingMode,bb2ToggleBatting,GAME_CONSTANTS})',context);
const {GameScene,SettingsScene,ScanInput,FIELD,BB2_SHEETS,BASEBALL_ART}=api;
function shape(x=0,y=0){const o={x,y,scaleX:1,scaleY:1,active:true,visible:true,alpha:1,handlers:{},
    setPosition(x,y){this.x=x;this.y=y;return this;},setScale(x,y=x){this.scaleX=x;this.scaleY=y;return this;},
    setVisible(v){this.visible=v;return this;},setAlpha(v){this.alpha=v;return this;},
    on(k,fn){this.handlers[k]=fn;return this;},destroy(){this.active=false;},setText(t){this.text=t;return this;}};
    const proxy=new Proxy(o,{get(t,k){return k in t?t[k]:typeof k==='string'&&k.startsWith('_')?undefined:(...args)=>proxy;}});return proxy;
}
function fixture(){
    now=0;const s=new GameScene(),timers=[],tweens=[],log=[];
    s.now=0;s.events={once(){},on(){},off(){}};s.add=new Proxy({},{get:()=> (...a)=>shape(a[0],a[1])});
    s.input={on(){},keyboard:{on(){},addKey:()=>({isDown:false})}};
    s.time={delayedCall(delay,callback){const e={at:s.now+delay,callback,active:true,remove(){this.active=false;}};timers.push(e);return e;},
        get now(){return s.now;},
        addEvent(c){const e=this.delayedCall(c.delay,c.callback);e.loop=c.loop;e.delay=c.delay;return e;}};
    s.tweens={killTweensOf(p){tweens.filter(t=>t.p===p&&t.active).forEach(t=>t.stop());},add(c){
        const t={p:c.targets,c,at:s.now+(c.delay||0),active:true,from:{},progress:0,
            isPlaying(){return this.active;},stop(){this.active=false;if(c.onStop)c.onStop();}};
        for(const k of ['x','y','t','alpha','scale'])if(typeof c[k]==='number')t.from[k]=c.targets[k]||0;
        tweens.push(t);return t;}};
    function player(pos,x,y){
        const p=shape(x,y);p.pos=pos;p._bb2=true;p._busy=false;p._flip=false;p._anim='idle_front';p._sheets=vm.runInContext('BB2_POSITION_SHEETS',context)[pos];
        p.setAnim=(name)=>{if(p._anim!==name){p._anim=name;p._animTime=s.now;log.push({pos,animation:name,time:s.now});}return p;};
        p.faceFrom=(dx,dy)=>{p._direction=Math.abs(dx)>Math.abs(dy)*1.2?'side':dy<0?'back':'front';p._flip=p._direction==='side'&&dx<0;};
        p.walkAnim=()=>p.setAnim('walk_'+(p._direction||'front'));p.runAnim=()=>p.setAnim('run_'+(p._direction||'front'));p.idleAnim=()=>p.setAnim(p._baseRunner?'lead_off':pos==='P'?'set':pos==='1B'?'ready_at_bag':['2B','3B','SS','LF','CF','RF'].includes(pos)?'ready':'idle_'+(p._direction==='back'?'back':'front'));p.syncDepth=()=>{};
        p.frameInfo=()=>{
            let name=p._anim,sheet;
            for(const key of p._sheets){const d=BB2_SHEETS[key];const alias=d.aliases?.[name];if(d.anims[alias||name]){sheet=key;name=alias||name;break;}}
            sheet ||= p._sheets[0];const d=BB2_SHEETS[sheet].anims[name]||Object.values(BB2_SHEETS[sheet].anims)[0];
            const frame=Math.floor((s.now-(p._animTime||0))/1000*d.rate);
            return {sheet,frame:d.start+(d.repeat===-1?frame%d.count:Math.min(d.count-1,frame))};
        };
        const anchor=(sheet,frame,part)=>{const a=BASEBALL_ART[sheet].anchors[frame][part];return{x:p.x+(a[0]-api.BB2_CELL/2)*api.BB2_DISPLAY/api.BB2_CELL*(p._flip?-1:1),y:p.y+api.BB2_FOOT_OFFSET+(a[1]-api.BB2_CELL/2)*api.BB2_DISPLAY/api.BB2_CELL};};
        p.ballPoint=part=>{const f=p.frameInfo();return anchor(f.sheet,f.frame,part);};
        p.actionPoint=(name,part)=>{const sheet=p._sheets.find(k=>BB2_SHEETS[k].anims[name]);if(!sheet)return{x:p.x,y:p.y-8};const c=BB2_SHEETS[sheet].anims[name];return anchor(sheet,c.start+c.contactFrame,part);};
        p.playPitch=release=>{p.setAnim('windup');const a=BB2_SHEETS['pitcher-actions'].anims;
            s.time.delayedCall(a.windup.count/a.windup.rate*1000,()=>{p.setAnim('release');s.time.delayedCall(a.release.contactFrame/a.release.rate*1000,release);});};
        return p;
    }
    s.makePlayer=(color,label,pos)=>s.playerMotion().register(player(pos||label,0,0));
    s.fielders=Object.fromEntries(Object.entries(FIELD.FIELDER_HOMES).map(([pos,p])=>[pos,player(pos,p.x,p.y)]));
    s.batter=player('B',FIELD.BATTER_BOX.x,FIELD.BATTER_BOX.y);
    s.ball=shape(FIELD.HOME.x,FIELD.HOME.y-6);s.ball.glow=shape();s.ball.spin={pause(){},resume(){}};
    s.gs={bases:{first:null,second:null,third:null},outs:0,balls:0,strikes:0,score:{Red:0,Blue:0},selectedPitch:'Fastball',selectedPitchLocation:'Middle'};
    s.audio={settings:{},play(k){log.push({audio:k,time:s.now});},speak(t,interrupt,done){log.push({speech:t,time:s.now});if(done)s.time.delayedCall(250,done);},stopChargeSound(){},startChargeSound(){},updateChargeSound(){}};
    s.cameras={main:{shake(){},worldView:{width:1000,centerX:500,y:0},zoom:1}};s.setBattingCamera=()=>{};s._zoomOnPoint=()=>{};s._zoomOut=()=>{};
    s.meter=shape();s.meterTitle=shape();s.powerMeter=shape();s.hideSwingMeter=()=>{};s.hidePowerMeter=()=>{};s.updateSwingMeter=()=>{};s.updatePowerMeter=()=>{};
    s.bigMessage=(t)=>log.push({message:t,time:s.now});s.contactFlash=()=>{};s.bat=null;
    s.updateBases=(outcome)=>{s.gs.bases.first='runner';};
    s.finishPlay=outcome=>{if(s.gs.pendingBaseUpdate){s.gs.pendingBaseUpdate();s.gs.pendingBaseUpdate=null;}s.result=outcome;};
    s.resetInteractiveBatting();s.log=log;
    s.tick=(dt=1000/120)=>{
        s.now+=dt;now=s.now;
        for(const e of [...timers])if(e.active&&s.now>=e.at){if(e.loop)e.at+=e.delay;else e.active=false;e.callback();}
        for(const t of [...tweens])if(t.active&&s.now>=t.at){const q=t.progress=Math.min(1,(s.now-t.at)/(t.c.duration||1));
            for(const k in t.from)t.p[k]=t.from[k]+(t.c[k]-t.from[k])*q;
            if(t.c.onUpdate)t.c.onUpdate(t);
            if(q>=1){t.active=false;if(t.c.onComplete)t.c.onComplete(t);}}
        s.update(s.now,dt);
        const bodies=s.playerMotion().players();
        for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
            const a=bodies[i],b=bodies[j];
            assert(Math.hypot(a.x-b.x,a.y-b.y)>=s.playerMotion().radius(a)+s.playerMotion().radius(b)-.02,
                'players overlapped: '+a.pos+' / '+b.pos);
        }
        for(const p of [...Object.values(s.fielders),s.batter].filter(Boolean))assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
    };
    s.until=(fn,max=18000)=>{const end=s.now+max;while(!fn()&&s.now<end)s.tick();assert(fn(),'sequence stalled: '+JSON.stringify([...s.playerMotion().moves.values()].map(m=>({pos:m.p.pos,x:m.p.x,y:m.p.y,goal:m.goal,path:m.path})))) ;};
    return s;
}

assert.equal(api.bb2BattingMode(),'pick');
const pref=api.GAME_CONSTANTS.STORAGE_KEYS.PREFERENCES;
storage.set(pref,JSON.stringify({highContrast:true}));api.bb2ToggleBatting();
assert.equal(api.bb2BattingMode(),'charge');assert.equal(JSON.parse(storage.get(pref)).highContrast,true);api.bb2ToggleBatting();
for(const auto of [false,true])for(const key of ['Enter','NumpadEnter']){
    autoScan=auto;const s=fixture();s.showBattingMenu();s.wireInput();
    assert(s.menu.options.some(o=>o.value==='bat'));assert(!s.ib.active);
    for(let i=0;i<900;i++)s.tick(1000/30); // scanning may wait indefinitely
    assert(!s.ib.active);assert.equal(s.gs.strikes,0);
    s.menu.index=0;const e={code:key,preventDefault(){}};
    s.scanInput._down(e);for(let i=0;i<120;i++)s.tick();
    assert(!s.ib.active,'a held selection does not start a pitch');
    s.menu.index=0;s.scanInput._up(e);assert(s.ib.active);assert(!s.ib.waitingForSwing);
    s.scanInput._up(e);s.until(()=>s.ib.awaitingChoice);
    assert(s.menu.options.some(o=>o.value==='take'));assert(!s.menu.options.some(o=>o.value.startsWith('steal')));
    const frozen={x:s.ball.x,y:s.ball.y};for(let i=0;i<900;i++)s.tick(1000/30);
    assert.equal(s.ball.x,frozen.x);assert.equal(s.ball.y,frozen.y);assert.equal(s.gs.strikes,0);
    s.menu.index=0;s.scanInput._down(e);s.scanInput._up(e);
    assert.equal(s.log.filter(e=>/^(normal|power|bunt) swing\.$/.test(e.speech||'')).length,1);
    s.scanInput.destroy();
}
autoScan=false;
{
    vm.runInContext('GAME_SEASON = {isActive:()=>true}',context);
    const s=fixture(),settings=new SettingsScene();Object.assign(settings,{add:s.add,audio:s.audio,time:s.time});
    settings._buildMenu();assert(settings.menu.options.some(o=>o.value==='batting'));
    for(const label of settings.menu.labels)assert(label._cy>75&&label._cy<565,'all settings stay on screen');
    const oldMode=api.bb2BattingMode();settings._handle('batting');assert.notEqual(api.bb2BattingMode(),oldMode);
    settings._handle('batting');settings.menu.destroy();
}
for(const choice of ['normal','power','bunt','take'])for(const location of ['Inside','Middle','Outside']){
    seed=13;const s=fixture();s.gs.selectedPitchLocation=location;
    let outcomes=0;s.processBattingOutcome=o=>{s.result=o;outcomes++;};
    s.beginChoicePitch();s.until(()=>s.ib.awaitingChoice);s.setMenu(null);s.beginSelectedPitch(choice);s.until(()=>s.result);
    assert.equal(outcomes,choice==='take'?0:1);assert(!s.ib.active);assert(!s.ib.swingPressed);
    if(choice!=='take')assert(s.log.some(e=>e.audio==='swing'));
    else assert(!s.log.some(e=>e.audio==='swing'));
}
{
    const s=fixture();let result;s.processBattingOutcome=o=>result=o;
    s.beginInteractivePitch();s.until(()=>s.ib.pitchProgress>.3);s.onSwingStart();
    s.until(()=>s.ib.pitchProgress>=.9);s.onSwingRelease();s.until(()=>result);
    assert.equal(s.ib.swingType,'power','hold-to-charge remains available');
}
{
    const s=fixture();s.showBattingMenu();const pause=s.menu.options.find(o=>o.value==='pause');s.menu.onSelect(pause);
    const setting=s.menu.options.find(o=>o.value==='batting');assert(setting);s.menu.onSelect(setting);
    assert.equal(api.bb2BattingMode(),'charge');s.menu.onSelect({value:'resume'});
    assert(s.menu.targets?.some(o=>o.value==='bat')||s.menu.options?.some(o=>o.value==='bat'));
    api.bb2ToggleBatting();
}
for(const outcome of ['Walk','Single','Double','Triple','Home Run']) {
    const s=fixture();s.gs.bases={first:'user',second:'user',third:'user'};s.runnerDots={};
    for(const [key,base] of Object.entries({first:FIELD.FIRST,second:FIELD.SECOND,third:FIELD.THIRD})) {
        const p=s.makePlayer({},'R');p.setPosition(base.x+16,base.y-14).setScale(1);s.runnerDots[key]=p;
    }
    let done=0;s.animateAdvances(outcome,()=>done++);s.until(()=>done);assert.equal(done,1);
}
let out=0,safe=0;
for(const pos of ['LF','CF','RF','SS','2B'])for(let i=0;i<12;i++) {
    seed=991*i+37;const s=fixture(),f=s.fielders[pos],start={x:f.x,y:f.y};let catches=0;
    const plan=s.chaseFlyBall(FIELD.HOME,pos,()=>catches++);
    s.until(()=>s.now>=450);
    assert(Math.hypot(f.x-start.x,f.y-start.y)>10,'fielder breaks before fly lands');
    assert.equal(catches,0);
    s.until(()=>catches);
    assert.equal(catches,1);assert(s.now<=plan.flight+20,'fielder arrives before catch');
    assert(Math.hypot(f.x-plan.spot.x,f.y-plan.spot.y)<.02);
    assert(s.log.some(e=>e.animation==='catch_fly'||e.animation==='receive_at_bag'));
    s.returnFielders();s.until(()=>Math.hypot(f.x-start.x,f.y-start.y)<.1);
}
for(let i=0;i<20;i++) {
    seed=i*23+5;const s=fixture();s.showThrowMenu=()=>{s.result='menu';};
    s.startGroundballPlay();s.until(()=>s.now>=300);
    assert(Object.values(s.fielders).some(p=>p._anim.startsWith('run_')),'charge grounders before arrival');
    s.until(()=>s.result);assert.equal(s._ballBusy,0);
    assert.equal(s.ball.alpha,0,'pickup finishes before throw menu opens');
}
for(const outcome of ['Double','Triple'])for(let i=0;i<10;i++) {
    seed=i*53+8;const s=fixture();let done=0;
    s.chaseDownExtraBaseHit(outcome,()=>done++);s.until(()=>s.now>=400);
    assert(s.log.some(e=>['LF','CF','RF'].includes(e.pos)&&e.animation?.startsWith('run_')&&e.time<400),'outfielder chases while gap hit flies');
    s.until(()=>done);assert.equal(done,1);assert.equal(s._ballBusy,0);
}
for(let i=0;i<160;i++){
    seed=i*991+7;const s=fixture();s.playGrounderToFirst();
    assert.equal(s.gs.outs,0,'no out is recorded at contact');s.until(()=>s.result);
    assert(s._lastGrounderRace.coverAtBag&&s._lastGrounderRace.ballAtBag);
    if(s.result==='Ground Out'){out++;assert.equal(s.gs.outs,1);assert.equal(s.gs.bases.first,null);}
    else{safe++;assert.equal(s.gs.outs,0);assert(s.gs.bases.first);}
    assert.equal(s.log.filter(e=>e.speech?.startsWith('Out at first')||e.speech?.startsWith('Safe at first')).length,1);
}
assert(out>0&&safe>0,'runner/ball races produce both outcomes');

// Opening lineup: the on-deck hitter starts offscreen and walks to the circle.
for(const half of ['top','bottom']) {
    const s=fixture();s.gs.playerIsAway=true;s.gs.half=half;let ready=0;
    s.createTeams(true,()=>ready++);const deck=s.onDeckBatter,start={x:deck.x,y:deck.y};
    assert(deck.x<0||deck.x>1000,'On-deck hitter must enter from offscreen');
    assert(s.playerMotion().moves.has(deck));assert(deck._anim.startsWith('walk_'));
    s.until(()=>s.now>=1000);assert.equal(ready,0);
    const travelled=Math.hypot(deck.x-start.x,deck.y-start.y);
    assert(travelled>20&&travelled<85,'On-deck hitter must visibly walk, not teleport');
    const end=s.now+18000;
    while(!ready&&s.now<end) {
        s.tick();
        assert(s.fielders.C.y>=545,'Catcher entrance cuts through the batter or mound');
    }
    assert.equal(ready,1);
    const x=FIELD.HOME.x+(half==='top'?-155:155);
    assert(Math.hypot(deck.x-x,deck.y-FIELD.HOME.y-28)<.1);
    assert(!s.playerMotion().moves.has(deck));
}
// Both directions must finish by actual arrivals, never by a fixed timeout.
for (const half of ['top','bottom']) {
    const s=fixture();s.gs.playerIsAway=true;s.gs.half=half;s.createTeams(false);
    const previous=Object.values(s.fielders);s.gs.half=half==='top'?'bottom':'top';
    let done=0;s.swapSides(()=>done++);
    s.until(()=>s.now>=1200);
    assert.equal(done,0);assert(previous.some(p=>p.active),'Outfielders must still be jogging off');
    for(const m of s.playerMotion().moves.values())assert(m.speed<=125.001,'Transition speed exceeds jog pace');
    s.until(()=>done,35000);
    assert.equal(done,1);assert(!s._teamEntry && !s._sidesChanging);
    assert(s.onDeckBatter && !s.playerMotion().moves.has(s.onDeckBatter),'On-deck arrival gates the next inning');
    assert(previous.every(p=>!p.active),'Old defense leaves before replacement');
    for(const [pos,p] of Object.entries(s.fielders)) {
        const home=FIELD.FIELDER_HOMES[pos];assert(Math.hypot(p.x-home.x,p.y-home.y)<.1,'New defense not ready');
    }
    assert(Math.hypot(s.batter.x-FIELD.BATTER_BOX.x,s.batter.y-FIELD.BATTER_BOX.y)<.1);
}
// A missed double-play relay reports the actual total, including an earlier out.
for(const startingOuts of [0,1]) {
    const s=fixture();s.gs.outs=startingOuts;s.gs.bases.first='comp';
    s.sendRunner=()=>{};s.animateThrowRace=(cfg,done)=>{cfg.out=false;done();};
    vm.runInContext('window.originalThrow=computeThrowOutcome;computeThrowOutcome=()=>({out:false,throwTimeMs:300})',context);
    s.applyThrowOut('second','3B');s.until(()=>s.result);
    vm.runInContext('computeThrowOutcome=window.originalThrow',context);
    assert(s.log.some(e=>e.speech===`Safe at first. ${startingOuts+1} ${startingOuts===0?'out':'outs'}.`));
}
// Do not announce a scripted result before its visible action has completed.
{
    const s=fixture();let complete;s.animatePlayerContact=(outcome,done)=>complete=done;
    s.processBattingOutcome('Pop Fly Out');
    assert(!s.log.some(e=>e.speech==='Pop Fly Out'));complete();
    assert(s.log.some(e=>e.speech==='Pop Fly Out'));
}
console.log('Side-change arrivals/speeds and result narration passed.');

// Every contact result moves a visible ball; misses never play the hit sample.
for(const outcome of ['Strike','Foul','Single','Double','Triple','Home Run','Pop Fly Out','Ground Out']) {
    seed=31;const s=fixture();s.runnerDots={};s.ball.setPosition(FIELD.HOME.x,FIELD.HOME.y-10);
    s.ib.active=true;s.ib.pitchProgress=.9;s.ib.timingScore=0;s.ib.swingType='normal';
    s.calculateGoodTimingOutcome=()=>outcome;
    s.processInteractiveSwingOutcome();
    let movingFrames=0;const origin={x:FIELD.HOME.x,y:FIELD.HOME.y-10};
    while(!s.result && s.now<45000) {
        s.tick(1000/60);
        if(s.ball.visible && s.ball.alpha>0 && Math.hypot(s.ball.x-origin.x,s.ball.y-origin.y)>20)movingFrames++;
    }
    assert(s.result,outcome+' did not finish');
    const impact=s.log.filter(e=>e.audio==='hit'||e.audio==='bigHit');
    assert.equal(impact.length,outcome==='Strike'?0:1,outcome+' contact sound count');
    if(outcome!=='Strike')assert(movingFrames>=10,outcome+' needs visible ball flight');
    if(outcome==='Home Run') {
        assert.equal(s.log.filter(e=>e.audio==='homer').length,1);
        assert.equal(s.log.filter(e=>e.audio==='crowd_big'||e.audio==='crowd').length,0,'Duplicate home-run cheering');
    }
}
console.log('All batting contact outcomes: visible flights, miss audio and single home-run celebration passed.');

for(const outcome of ['Ball','Strike','Foul','Walk','Strike Out','Hit By Pitch']) {
    const s=fixture();s.gs.balls=1;s.gs.strikes=2;s.showPitchCall(outcome);
    assert(s.log.some(e=>e.message?.startsWith(outcome==='Walk'?'BALL FOUR':outcome.toUpperCase())));
    if(['Ball','Strike','Foul'].includes(outcome))assert.equal(s.log[0].message,outcome==='Foul'?'FOUL BALL':outcome.toUpperCase());
}
console.log('Outcome-only pitch calls passed.');

// Switching from a keyboard-focused base to the same pointer target restores
// the wide view even though the selected index has not changed.
{
    const s=fixture();s.gs.bases.first='user';let wide=0,close=0;
    s._zoomOut=()=>wide++;s._zoomOnPoint=()=>close++;s.showBattingMenu();
    s.menu.next();assert.equal(close,0);s.menu.next();assert.equal(close,1);
    s.menu.zones[1].handlers.pointerover();assert.equal(wide,2);
    s.menu.next();assert.equal(wide,3);
}

function liveRoster() {
    const s=fixture();s.gs.playerIsAway=true;s.gs.half='top';s.gs.inning=1;s.runnerDots={};s.updateHUD=()=>{};s.createTeams(false);
    return s;
}
function addRunner(s,key) {
    const base={first:FIELD.FIRST,second:FIELD.SECOND,third:FIELD.THIRD}[key];
    const p=s.makePlayer({},'R').setPosition(base.x+16,base.y-14);
    p._baseRunner=true;p._runnerBase=key;s.runnerDots[key]=p;s.gs.bases[key]='user';return p;
}
function requireOffscreenRemoval(p) {
    const destroy=p.destroy.bind(p);
    p.destroy=()=>{assert(p.x<=-35||p.x>=1035,'Visible player abruptly destroyed');destroy();};
}
for(const outcome of ['Strike Out','Ground Out','Pop Fly Out']) {
    const s=liveRoster(),old=s.batter,deck=s.onDeckBatter;requireOffscreenRemoval(old);
    s.gs.outs=1;s.resetBatter(outcome);
    assert(old.active&&s._departingPlayers.has(old));assert.equal(s.batter,deck);
    s.until(()=>s.now>=1000);assert(old.active,'Exit takes longer than one second');
    s.until(()=>!old.active,18000);
}
{
    const s=liveRoster(),batter=s.batter,r1=addRunner(s,'first'),r2=addRunner(s,'second'),r3=addRunner(s,'third');
    for(const p of [batter,r1,r2,r3])requireOffscreenRemoval(p);
    s.startContactRunners();
    assert.equal(s.playRunners.first.sprite,r1);assert.equal(s.playRunners.second.sprite,r2);assert.equal(s.playRunners.third.sprite,r3);
    for(const key of ['batter','first','second','third'])s.sendRunner(key,700);
    s.until(()=>s.playerMotion().moves.size===0);
    GameScene.prototype.updateBases.call(s,'Single','user');s.clearContactRunners();s.syncRunners();
    assert.equal(s.runnerDots.first,batter);assert.equal(s.runnerDots.second,r1);assert.equal(s.runnerDots.third,r2);
    s.resetBatter('Single');assert(batter.active&&!batter._leavingField);
    s.until(()=>!r3.active,18000);
}
{
    const s=liveRoster(),old=[s.batter,s.onDeckBatter,addRunner(s,'first'),addRunner(s,'second'),addRunner(s,'third')];
    old.forEach(requireOffscreenRemoval);s.gs.outs=3;s.syncRunners();s.resetBatter('Strike Out');
    assert(old.every(p=>p.active&&p.visible&&p.alpha===1));
    s.gs.half='bottom';s.gs.outs=0;s.gs.bases={first:null,second:null,third:null};let done=0;
    s.swapSides(()=>done++);s.until(()=>done,35000);
    assert(old.every(p=>!p.active),'Both hitters and all stranded runners leave before the new lineup');
}
{
    const s=liveRoster(),old=[s.batter,addRunner(s,'first'),addRunner(s,'second'),addRunner(s,'third')];
    old.forEach(requireOffscreenRemoval);let done=0;s.animateAdvances('Home Run',()=>done++);
    s.until(()=>done,25000);assert(old.some(p=>p.active),'Scoring players continue toward the dugout');
    assert(old.filter(p=>p.active).every(p=>p.visible&&p.alpha===1));
    s.until(()=>old.every(p=>!p.active),20000);
}
for(const success of [true,false]) {
    const s=liveRoster(),runner=addRunner(s,'first');requireOffscreenRemoval(runner);
    vm.runInContext('window.originalRandom=Math.random;Math.random=()=>'+(success?'.1':'.99'),context);
    s.processStealAttempt('second');s.until(()=>s.result);
    vm.runInContext('Math.random=window.originalRandom',context);
    s.clearContactRunners();s.syncRunners();
    if(success)assert.equal(s.runnerDots.second,runner);
    else {assert(runner.active&&runner._leavingField);s.until(()=>!runner.active);}
}
console.log('Player lifecycle: identity at safe bases, visible outs/scoring exits, steals and loaded-base side changes passed.');
if(process.argv.includes('--record')){
    seed=1;const s=fixture(),frames=[];s.beginChoicePitch();s.until(()=>s.ib.awaitingChoice);s.setMenu(null);s.beginSelectedPitch('normal');
    while(!s.result&&s.now<18000){s.tick(1000/30);frames.push({time:s.now,ball:{x:s.ball.x,y:s.ball.y,visible:s.ball.visible,alpha:s.ball.alpha},
        players:[...Object.values(s.fielders),s.batter].map(p=>({x:p.x,y:p.y,flip:p._flip,...p.frameInfo(),pos:p.pos}))});}
    fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});fs.writeFileSync(path.join(__dirname,'out/replay.json'),JSON.stringify({frames,result:s.result}));
}
console.log('Passed: accessible batting/menus, 60 fly chases, 20 ground pickups, 20 gap-hit relays, and 160 grounder races.',{out,safe});
