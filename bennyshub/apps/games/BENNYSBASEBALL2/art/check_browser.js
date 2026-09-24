// Headless Chrome smoke check of the real Phaser renderer. No npm dependencies.
// Usage: node art/check_browser.js [path-to-chrome]
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
// Browser caches/screenshots must never enter a folder watched by Live Server.
const root=path.resolve(__dirname,'../../../..'),out=path.join(os.tmpdir(),'bennysbaseball2-review');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={'.html':'text/html','.js':'application/javascript','.png':'image/png','.mp3':'audio/mpeg','.json':'application/json'};
const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;
    if(!fs.existsSync(target)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');
    fs.createReadStream(target).pipe(res);
});
let chrome,ws,browserSocket,browserCall,browserPid,profile;
let mainNavigations=0;
(async()=>{
    fs.mkdirSync(out,{recursive:true});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    profile=fs.mkdtempSync(path.join(os.tmpdir(),'bennysbaseball2-chrome-'));
    chrome=spawn(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
        '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
        '--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1200,800',
        '--autoplay-policy=no-user-gesture-required','about:blank'
    ],{windowsHide:true,stdio:'ignore'});
    chrome.on('error',e=>{throw e;});
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portFile);i++)await wait(100);
    assert(fs.existsSync(portFile),'Chrome debugging endpoint did not start');
    if(process.argv.includes('--cleanup-probe')) {console.log('Testing cleanup before CDP attachment.');return;}
    const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
    const version=await (await fetch('http://127.0.0.1:'+port+'/json/version')).json();
    browserSocket=new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{browserSocket.onopen=resolve;browserSocket.onerror=reject;});
    let browserId=0;const browserPending=new Map();
    browserSocket.onmessage=e=>{
        const message=JSON.parse(e.data),pending=browserPending.get(message.id);
        if(pending){browserPending.delete(message.id);message.error?pending.reject(message.error):pending.resolve(message.result);}
    };
    browserCall=(method,params={})=>new Promise((resolve,reject)=>{
        browserPending.set(++browserId,{resolve,reject});browserSocket.send(JSON.stringify({id:browserId,method,params}));
    });
    const processes=await browserCall('SystemInfo.getProcessInfo');
    browserPid=processes.processInfo.find(p=>p.type==='browser').id;
    const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let id=0;const pending=new Map(),errors=[];
    ws.onmessage=e=>{
        const msg=JSON.parse(e.data);
        if(msg.method==='Page.frameNavigated' && !msg.params.frame.parentId)mainNavigations++;
        if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);
        if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);}
    };
    const call=(method,params={})=>new Promise((resolve,reject)=>{
        pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression=>{
        const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
        if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
    };
    const until=async(expression,timeout=15000)=>{
        for(let i=0;i<timeout/100;i++){if(await evaluate(expression))return;await wait(100);}
        throw Error('Timed out: '+expression);
    };
    const capture=async name=>{
        const shot=await call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'));
    };
    await call('Runtime.enable');await call('Page.enable');
    await call('Page.bringToFront');
    await call('Emulation.setDeviceMetricsOverride',{width:1200,height:720,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/apps/games/BENNYSBASEBALL2/'});
    await until('!!window.__baseball2Game?.scene.isActive("TitleScene")');
    const resolution=await evaluate(`(() => {
        const g=__baseball2Game,r=g.canvas.getBoundingClientRect();
        return {width:g.canvas.width,height:g.canvas.height,cssWidth:r.width,cssHeight:r.height,
            scale:window.__BASEBALL_RENDER_SCALE,cell:BB2_CELL};
    })()`);
    assert.equal(resolution.width,1000*resolution.scale);
    assert.equal(resolution.height,600*resolution.scale);
    assert.equal(resolution.cell,256);
    assert(resolution.width>=resolution.cssWidth,'Backing canvas must not be stretched on this display');
    await evaluate(`(() => {
        window.__startupTrace={variants:0,variantMs:0,creates:0,preparationFrames:0};const trace=window.__startupTrace;
        const variant=bb2VariantTexture;
        bb2VariantTexture=function(...args){const start=performance.now();const result=variant(...args);
            trace.variants++;trace.variantMs+=performance.now()-start;return result;};
        const create=GameScene.prototype.create;
        const preload=GameScene.prototype.preload;
        GameScene.prototype.preload=function(...args){preload.apply(this,args);
            this.game.events.once('postrender',()=>{trace.fieldShown=performance.now();});};
        GameScene.prototype.create=function(...args){trace.creates++;trace.createStart=performance.now();create.apply(this,args);
            trace.createEnd=performance.now();this.game.events.once('postrender',()=>{trace.firstFrame=performance.now();});};
        const finish=GameScene.prototype._finishSetup;
        GameScene.prototype._finishSetup=function(...args){finish.apply(this,args);trace.playersReady=performance.now();};
        const start=ColorSelectScene.prototype.start;
        ColorSelectScene.prototype.start=function(...args){start.apply(this,args);start.apply(this,args);
            trace.acknowledged=this._starting && this.startMenu.labels[0].text==='STARTING GAME...';
            this.game.events.once('postrender',()=>{trace.feedbackFrame=performance.now();});};
        __baseball2Game.events.on('postrender',()=>{
            if(__baseball2Game.scene.getScene('GameScene')._preparingLabel)trace.preparationFrames++;
        });
    })()`);
    await evaluate(`audioSys().settings.music=false; audioSys().stopMusic();
        __baseball2Game.scene.getScene('TitleScene').scene.start('ColorSelectScene', {mode:'exhibition'}); void 0;`);
    await until('__baseball2Game.scene.isActive("ColorSelectScene")');
    const teamLayouts=[];
    for(const display of [{width:1200,height:720,deviceScaleFactor:1},
        {width:800,height:600,deviceScaleFactor:1},{width:390,height:844,deviceScaleFactor:3},
        {width:1440,height:900,deviceScaleFactor:2},{width:1200,height:720,deviceScaleFactor:1}]) {
        await call('Emulation.setDeviceMetricsOverride',{...display,mobile:false});await wait(300);
        const layout=await evaluate(`(() => {
            const s=__baseball2Game.scene.getScene('ColorSelectScene'),c=s.cameras.main;
            const heading=c.matrix.transformPoint(W/2,70),button=c.matrix.transformPoint(W/2,470);
            return {zoom:c.zoom,scale:s._renderScale,headingX:heading.x/c.width,
                headingY:heading.y/c.height,buttonY:button.y/c.height,worldWidth:c.worldView.width};
        })()`);
        assert.equal(layout.zoom,layout.scale);assert.equal(layout.worldWidth,1000);
        assert(Math.abs(layout.headingX-.5)<.001,'Team heading must be centered');
        assert(Math.abs(layout.headingY-70/600)<.001,'Team heading must be on screen');
        assert(Math.abs(layout.buttonY-470/600)<.001,'Start button must be on screen');
        teamLayouts.push({display,...layout});
        await capture('browser-team-'+display.width+'.png');
    }
    const clickLogical=async(x,y)=>{
        const point=await evaluate(`(() => {const r=__baseball2Game.canvas.getBoundingClientRect();
            return {x:r.left+${x}/1000*r.width,y:r.top+${y}/600*r.height};})()`);
        await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
        await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    };
    await clickLogical(750,285);
    assert.equal(await evaluate('__baseball2Game.scene.getScene("ColorSelectScene").colorIndex'),1);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(await evaluate('__baseball2Game.scene.getScene("ColorSelectScene").colorIndex'),2);
    // Re-entering the scene and season setup must also initialize its camera.
    await evaluate(`__baseball2Game.scene.getScene('ColorSelectScene').scene.start('TitleScene');void 0;`);await wait(150);
    await evaluate(`__baseball2Game.scene.getScene('TitleScene').scene.start('ColorSelectScene',{mode:'season'});void 0;`);await wait(250);
    assert.equal(await evaluate('__baseball2Game.scene.getScene("ColorSelectScene").cameras.main.zoom'),2);
    await capture('browser-team-season.png');
    await evaluate(`__baseball2Game.scene.getScene('ColorSelectScene').mode='exhibition';void 0;`);
    await evaluate('window.__startupTrace.start=performance.now()');
    if(process.argv.includes('--startup')) await clickLogical(500,470);
    else {
        await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
    await until('!!window.__baseball2Game?.scene.getScene("GameScene")?.batter?._bb2');
    await until('!!window.__startupTrace.firstFrame');
    const startup=await evaluate(`(() => {const t=window.__startupTrace;return {
        toFirstFrameMs:t.firstFrame-t.start,createMs:t.createEnd-t.createStart,
        variants:t.variants,variantMs:t.variantMs,playersReadyMs:t.playersReady-t.start,
        feedbackMs:t.feedbackFrame-t.start,fieldShownMs:t.fieldShown-t.start,
        acknowledged:t.acknowledged,creates:t.creates,preparationFrames:t.preparationFrames};})()`);
    assert(startup.acknowledged);assert.equal(startup.creates,1,'Repeated start cannot create duplicate games');
    assert(startup.preparationFrames>1,'Preparation must yield to render progress');
    assert(startup.fieldShownMs<startup.playersReadyMs,'Field must be visible while players are prepared');
    fs.writeFileSync(path.join(out,'browser-startup.json'),JSON.stringify(startup,null,2));
    if(process.argv.includes('--startup')) {
        await capture('browser-startup.png');assert.equal(errors.length,0,JSON.stringify(errors));
        console.log('Startup:',startup);return;
    }
    await wait(8500); // Opening announcements finish before driving an at-bat.
    if(process.argv.includes('--pitch-choices')) {
        await require('./check_pitch_choices_browser.js')({evaluate,wait,until,capture,call});
        assert.equal(errors.length,0,JSON.stringify(errors));
        console.log('Pitch cues, charge take, pitch cards, team scores and third-HBP recovery passed.');return;
    }
    if(process.argv.includes('--races')) {
        const races=await require('./check_extra_base_browser.js')({evaluate,wait,until,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        console.log('Extra-base races:',JSON.stringify(races));return;
    }
    if(process.argv.includes('--routes')) {
        const routes=await require('./check_routes_browser.js')({evaluate,wait,until,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-routes.json'),JSON.stringify(routes));
        console.log('Routes: both dugouts, full roster separation and catcher entrance behind home passed.');return;
    }
    if(process.argv.includes('--lifecycle')) {
        const lifecycle=await require('./check_lifecycle_browser.js')({evaluate,wait,until,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-lifecycle.json'),JSON.stringify(lifecycle,null,2));
        console.log('Lifecycle: retired hitters, stranded runners and the entire outgoing roster remain visible until offscreen.');return;
    }
    if(process.argv.includes('--contact')) {
        const contact=await require('./check_contact_browser.js')({evaluate,wait,until,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-contact.json'),JSON.stringify(contact,null,2));
        console.log('Contact: visible foul/miss/home-run paths, matching impact sounds and one celebration passed.');return;
    }
    if(process.argv.includes('--pitcher')) {
        const delivery=await require('./check_pitcher_browser.js')({evaluate,wait,until,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-pitcher.json'),JSON.stringify(delivery,null,2));
        console.log('Pitcher: every delivery frame, animation state, one release, hand alignment and repeat delivery passed.');return;
    }
    if(process.argv.includes('--flow')) {
        const flow=await require('./check_flow_browser.js')({evaluate,wait,until,capture,call});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-flow.json'),JSON.stringify(flow,null,2));
        console.log('Flow: on-field choices, spoken-call order, frozen pitch, pause, catcher reception and lineup walk-up passed.');return;
    }
    if(process.argv.includes('--throws')) {
        const throws=await require('./check_throw_browser.js')({evaluate,wait,until,capture,call});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-throws.json'),JSON.stringify(throws,null,2));
        console.log('Throws: real release frames, hand/glove alignment, cutoff relay, pitcher returns and recovery passed.');return;
    }
    if(process.argv.includes('--returns')) {
        const returns=await require('./check_return_browser.js')({evaluate,wait,until,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-returns.json'),JSON.stringify({returns,exceptions:errors},null,2));
        console.log('Returns: upright walking, pitch recovery, arrival poses and equal runner scale passed.');return;
    }
    if(process.argv.includes('--batting')) {
        const batting=await require('./check_batting_browser.js')({evaluate,wait,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-batting-poses.json'),JSON.stringify({batting,exceptions:errors},null,2));
        console.log('Batting: continuous charge, final-pose hold, reset and all three swing animations passed.');return;
    }
    if(process.argv.includes('--camera')) {
        const camera=await require('./check_camera.js')({evaluate,until,wait,call,capture});
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-camera.json'),JSON.stringify({camera,exceptions:errors},null,2));
        console.log('Camera: grounder, fly out, next play, inning change and display resize passed.');return;
    }
    const entered=await evaluate(`Object.entries(__baseball2Game.scene.getScene('GameScene').fielders).every(([pos,p])=>
        Math.hypot(p.x-FIELD.FIELDER_HOMES[pos].x,p.y-FIELD.FIELDER_HOMES[pos].y)<8)`);
    assert(entered,'The defense must reach its starting positions from the dugout');
    await evaluate(`window.reviewScene=__baseball2Game.scene.getScene('GameScene');
        reviewScene.gs.playerIsAway=true;reviewScene.createTeams(false);reviewScene.gs.selectedPitch='Fastball';
        reviewScene.gs.selectedPitchLocation='Middle';reviewScene.resetInteractiveBatting();reviewScene.showBattingMenu();`);
    await wait(500);
    await capture('browser-batting.png');
    const art=await evaluate(`({players:Object.values(reviewScene.fielders).filter(p=>p._bb2).length,
        batter:reviewScene.batter._spr.texture.key,display:BB2_DISPLAY,mode:bb2BattingMode(),
        stances:Object.fromEntries(Object.entries(reviewScene.fielders).map(([pos,p])=>[pos,p._anim]))})`);
    assert.equal(art.players,9);assert.equal(art.mode,'pick');assert.equal(art.display,84);
    assert.equal(art.stances.P,'set');assert.equal(art.stances.SS,'ready');assert.equal(art.stances['1B'],'ready_at_bag');
    const opacityChanges=await evaluate(`(() => {
        const source=reviewScene.textures.get('batter-actions').getSourceImage();
        const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
        const before=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        const after=reviewScene.batter._spr.texture.getContext().getImageData(0,0,canvas.width,canvas.height).data;
        let increases=0;for(let i=3;i<before.length;i+=4)if(after[i]>before[i])increases++;
        return increases;
    })()`);
    assert.equal(opacityChanges,0,'Recoloring must not turn antialiased edges into opaque speckles');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await wait(350); // Respect the shared hub's anti-tremor release cooldown.
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await until('reviewScene.ib.active && !reviewScene.menu');
    await wait(500);await capture('browser-delivery.png');
    await until('reviewScene.ib.awaitingChoice');await capture('browser-frozen-pitch.png');
    await evaluate('reviewScene.menu.index=0;void 0;');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await wait(7500);await capture('browser-after-play.png');
    const running=await evaluate(`(() => {
        const b=reviewScene.makePlayer(TEAM_COLORS.player,'B');
        const r=reviewScene.makePlayer(TEAM_COLORS.player,'R');
        for(const p of [b,r]){p.faceFrom(1,0);p.runAnim();}
        const result=[b,r].map(p=>p._spr.texture.key.split('|')[0]);
        b.destroy();r.destroy();return result;
    })()`);
    assert.deepEqual(running,['batter-actions','runner-actions']);
    await evaluate(`(() => {
        const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);
        for(const p of s.playerMotion().players())s.stopPlayerMovement(p);
        s.clearContactRunners();s.gs.bases={first:null,second:null,third:null};s.syncRunners();
        s.createTeams(false);s.gs.outs=0;
        s.finishPlay=result=>{s._reviewRaceResult=result;};
        const start=s.batter.actionPoint('swing_normal','bat');s.ball.setPosition(start.x,start.y);
        s._spacingReview={samples:0,overlaps:0,minClearance:999};
        s.events.on('postupdate',()=>{
            const bodies=s.playerMotion().players();
            for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
                const a=bodies[i],b=bodies[j];
                const clearance=Math.hypot(a.x-b.x,a.y-b.y)-s.playerMotion().radius(a)-s.playerMotion().radius(b);
                s._spacingReview.samples++;s._spacingReview.minClearance=Math.min(s._spacingReview.minClearance,clearance);
                if(clearance<-.02)s._spacingReview.overlaps++;
            }
        });
        s.playGrounderToFirst();
    })()`);
    await until('!!reviewScene._reviewRaceResult',20000);
    await capture('browser-player-spacing.png');
    assert.equal(await evaluate('reviewScene.batter._anim'),'lead_off','Stopped baserunner must not pick up a bat');
    const spacing=await evaluate('reviewScene._spacingReview');
    assert(spacing.samples>100);assert.equal(spacing.overlaps,0,JSON.stringify(spacing));
    assert.equal(errors.length,0,JSON.stringify(errors));
    // A density change must preserve the world camera and pointer coordinates.
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:2,mobile:false});
    await wait(500);
    const resized=await evaluate(`({width:__baseball2Game.canvas.width,height:__baseball2Game.canvas.height,
        scale:window.__BASEBALL_RENDER_SCALE,worldWidth:reviewScene.cameras.main.worldView.width})`);
    assert.equal(resized.scale,3);assert.equal(resized.width,3000);assert.equal(resized.height,1800);
    assert(Math.abs(resized.worldWidth-800)<1,'Resizing must preserve the 1.25x field camera');
    await capture('browser-high-density.png');
    const ballArt=await evaluate(`(() => {
        const s=reviewScene,ball=s.ball;
        s.time.removeAllEvents();if(s._ballFlight)s._ballFlight.stop();
        s.setBallSpin(false);ball.seams.setAngle(0);s.setBallSpin(true);
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=220;
        const c=canvas.getContext('2d');c.fillStyle='#245c3a';c.fillRect(0,0,640,220);
        for(const [i,size] of [128,ball.body.displayWidth*3,ball.body.displayWidth*1.9,ball.body.displayWidth].entries()) {
            const x=35+i*155,y=100-size/2;
            c.drawImage(ball.body.texture.getSourceImage(),x,y,size,size);
            c.drawImage(ball.seams.texture.getSourceImage(),x,y,size,size);
            c.fillStyle='white';c.font='14px Arial';c.fillText(size+'px',x,185);
        }
        return {size:ball.body.texture.getSourceImage().width,png:canvas.toDataURL().split(',')[1]};
    })()`);
    fs.writeFileSync(path.join(out,'browser-baseball.png'),Buffer.from(ballArt.png,'base64'));delete ballArt.png;
    assert.equal(ballArt.size,128);
    const proportions=await evaluate(`(() => {
        const canvas=document.createElement('canvas');canvas.width=840;canvas.height=320;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#245c3a';ctx.fillRect(0,0,840,320);
        const samples=[['P','pitcher-actions','release','hand'],['C','catcher','receive','glove'],
            ['1B','firstbase-actions','stretch_catch','glove']];
        samples.forEach(([pos,sheet,clip,part],i)=>{
            const meta=BASEBALL_ART[sheet],anim=meta.anims[clip],frame=anim.start+anim.contactFrame;
            const source=reviewScene.textures.get(reviewScene.fielders[pos]._tex[sheet]).getSourceImage();
            const x=i*280+14,y=15,display=BB2_DISPLAY*3;
            ctx.drawImage(source,(frame%8)*BB2_CELL,Math.floor(frame/8)*BB2_CELL,BB2_CELL,BB2_CELL,x,y,display,display);
            const anchor=meta.anchors[frame][part],ball=reviewScene.ball,size=ball.body.displayWidth*3;
            const bx=x+anchor[0]/BB2_CELL*display-size/2,by=y+anchor[1]/BB2_CELL*display-size/2;
            ctx.drawImage(ball.body.texture.getSourceImage(),bx,by,size,size);
            ctx.drawImage(ball.seams.texture.getSourceImage(),bx,by,size,size);
            ctx.fillStyle='white';ctx.font='15px Arial';ctx.fillText(pos+' / '+clip+' (3x view)',x,290);
        });
        return canvas.toDataURL().split(',')[1];
    })()`);
    fs.writeFileSync(path.join(out,'browser-ball-proportions.png'),Buffer.from(proportions,'base64'));
    await wait(230);
    assert((await evaluate('reviewScene.ball.seams.angle'))!==0,'Stitches must spin in flight');
    assert.equal(await evaluate('reviewScene.ball.body.angle'),0,'Leather lighting must stay fixed');
    await evaluate('reviewScene.setBallSpin(false)');
    const heldAngle=await evaluate('reviewScene.ball.seams.angle');await wait(160);
    assert.equal(await evaluate('reviewScene.ball.seams.angle'),heldAngle,'Held ball must stop spinning');
    await evaluate(`(() => {
        const s=reviewScene;s.time.removeAllEvents();s.setMenu(null);
        for(const p of s.playerMotion().players())s.stopPlayerMovement(p);
        s.clearContactRunners();s.gs.bases={first:null,second:null,third:null};s.syncRunners();s.createTeams(false);
        s._ballBusy=0;s._flyCaught=false;
        s._flyStart={x:s.fielders.CF.x,y:s.fielders.CF.y};
        const plan=s.chaseFlyBall(FIELD.HOME,'CF',()=>{
            const glove=s.fielders.CF.ballPoint('glove');
            s._flyGloveError=Math.hypot(s.ball.x-glove.x,s.ball.y-glove.y);s._flyCaught=true;
        });
        s._zoomOnPoint(plan.spot.x,plan.spot.y,1.7,250);
    })()`);
    await wait(450);
    assert(await evaluate('Math.hypot(reviewScene.fielders.CF.x-reviewScene._flyStart.x,reviewScene.fielders.CF.y-reviewScene._flyStart.y)>10'));
    await capture('browser-fly-chase.png');
    assert(await evaluate('reviewScene.hudAll.every(o=>!o.visible)'),'Close-up scoreboard must not cover the chase');
    await until('reviewScene._flyCaught');
    const flyGloveError=await evaluate('reviewScene._flyGloveError');
    assert(flyGloveError<4,'Fly catch must meet the animated glove: '+flyGloveError);
    await capture('browser-fly-catch.png');
    await wait(650);
    assert.equal(await evaluate('reviewScene.fielders.CF._anim'),'ready','Outfielder must lower glove after catching');
    await capture('browser-fly-recovery.png');
    await evaluate('reviewScene.returnFielders()');
    await until('Math.hypot(reviewScene.fielders.CF.x-FIELD.FIELDER_HOMES.CF.x,reviewScene.fielders.CF.y-FIELD.FIELDER_HOMES.CF.y)<.1');
    await evaluate('reviewScene._zoomOut(250)');await wait(300);
    assert(await evaluate('reviewScene.hudAll.every(o=>o.visible)'),'Scoreboard returns with the full field view');
    // Exercise real Phaser animation completion across defensive roles.
    await evaluate(`for(const [pos,clip] of Object.entries({P:'field_grounder',C:'receive','1B':'stretch_catch',
        '2B':'receive_at_bag',SS:'throw','3B':'field_grounder',LF:'catch_fly',CF:'throw_relay',RF:'field_bounce'}))
        reviewScene.bb2Anim(reviewScene.fielders[pos],clip);`);
    await wait(1100);
    const recovered=await evaluate('Object.fromEntries(Object.entries(reviewScene.fielders).map(([pos,p])=>[pos,p._anim]))');
    for(const [pos,name] of Object.entries(recovered)) {
        if(pos==='C')assert(['idle_front','idle_back'].includes(name));
        else assert.equal(name,pos==='P'?'set':pos==='1B'?'ready_at_bag':'ready');
    }
    if(process.argv.includes('--stability')) {
        const began=Date.now(),navigationsAtStart=mainNavigations;
        let cycles=0;
        await evaluate(`window.__stabilityFrames=0;reviewScene.game.events.on('postrender',()=>window.__stabilityFrames++);void 0;`);
        while(Date.now()-began<45000) {
            await evaluate(`(() => {
                const s=reviewScene;s._stabilityCaught=false;
                s.chaseFlyBall(FIELD.HOME,['LF','CF','RF'][${cycles}%3],()=>{s._stabilityCaught=true;});
            })()`);
            await until('reviewScene._stabilityCaught',10000);await wait(650);
            assert(await evaluate(`['LF','CF','RF'].every(pos=>reviewScene.fielders[pos]._anim==='ready')`));
            await evaluate('reviewScene.returnFielders()');
            await until('reviewScene.playerMotion().moves.size===0',10000);cycles++;
        }
        const stability={cycles,elapsedMs:Date.now()-began,renderedFrames:await evaluate('__stabilityFrames'),
            reloads:mainNavigations-navigationsAtStart,gameCreations:await evaluate('__startupTrace.creates')};
        assert.equal(stability.reloads,0);assert.equal(stability.gameCreations,1);
        assert.equal(errors.length,0,JSON.stringify(errors));
        fs.writeFileSync(path.join(out,'browser-stability.json'),JSON.stringify(stability,null,2));
        console.log('Sustained gameplay:',stability);
    }
    await evaluate(`reviewScene.scene.start('SettingsScene');void 0;`);
    await until('__baseball2Game.scene.isActive("SettingsScene")');
    await wait(250);
    const button=await evaluate(`(() => {
        const s=__baseball2Game.scene.getScene('SettingsScene');
        const i=s.menu.options.findIndex(o=>o.value==='batting'),zone=s.menu.zones[i];
        const rect=__baseball2Game.canvas.getBoundingClientRect();
        return {x:rect.left+zone.x/1000*rect.width,y:rect.top+zone.y/600*rect.height};
    })()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:button.x,y:button.y});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:button.x,y:button.y});
    await until('bb2BattingMode()==="charge"');
    await capture('browser-settings-high-density.png');
    const materialAudit=await evaluate('('+require('./browser_material_audit.js').toString()+')()');
    fs.writeFileSync(path.join(out,'browser-materials.png'),Buffer.from(materialAudit.board,'base64'));
    delete materialAudit.board;
    assert.equal(materialAudit.frames,await evaluate('Object.values(BASEBALL_ART).reduce((sum,s)=>sum+s.anchors.length,0)'));
    assert.equal(errors.length,0,JSON.stringify(errors));
    fs.writeFileSync(path.join(out,'browser-check.json'),JSON.stringify({resolution,resized,teamLayouts,ballArt,art,spacing,flyGloveError,recovered,materialAudit,exceptions:errors},null,2));
    console.log('Chrome: team layout/input, ball spin/lighting, high-resolution sprites, resize, batting and player spacing passed.',{resolution,resized,spacing});
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
    // Chrome may detach from the initial launcher PID on Windows. Close the
    // actual browser over CDP, with a tree-kill fallback for this test PID only.
    if(browserCall && browserSocket.readyState===WebSocket.OPEN) {
        await Promise.race([browserCall('Browser.close').catch(()=>{}),wait(2000)]);
    }
    if(ws)ws.close();if(browserSocket)browserSocket.close();
    await wait(500);
    if(browserPid) {
        let alive=false;try{process.kill(browserPid,0);alive=true;}catch{}
        if(alive)await new Promise(resolve=>{
            const killer=spawn('taskkill',['/PID',String(browserPid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
            killer.on('exit',resolve);killer.on('error',resolve);
        });
    }
    if(chrome)chrome.kill();server.close();
    // Also cover failures before CDP supplied a PID and detached crash handlers.
    // The random profile is unique to this invocation; never target other tabs.
    if(profile && process.platform==='win32') {
        const quotedProfile=profile.replace(/'/g,"''");
        const cleanup=`$testProfile='${quotedProfile}'; Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($testProfile) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
        await new Promise(resolve=>{
            const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(cleanup,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});
            child.on('exit',code=>{if(code)process.exitCode=1;resolve();});
            child.on('error',error=>{console.error('Test-browser cleanup failed:',error);process.exitCode=1;resolve();});
        });
    }
    if(profile && fs.existsSync(profile)) {
        try {
            // Delete only this run's generated profile, after closing Chrome.
            // Resolve and check the actual parent before any recursive removal.
            const tempRoot=fs.realpathSync(os.tmpdir()),target=fs.realpathSync(profile);
            assert(!fs.lstatSync(profile).isSymbolicLink(),'Refusing a linked browser profile');
            assert.equal(path.dirname(target),tempRoot,'Profile must be directly inside OS temp');
            assert(/^bennysbaseball2-chrome-[a-zA-Z0-9]{6}$/.test(path.basename(target)),'Unexpected profile name');
            await fs.promises.rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:250});
            console.log('Temporary browser profile removed.');
        } catch(error) {
            console.error('Temporary browser profile cleanup failed:',error);process.exitCode=1;
        }
    }
    console.log('Browser test output:',out);
});
