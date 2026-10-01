/* Run with the project's Electron executable. Uses a hidden offscreen window. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const tabletOnly=process.argv.includes('--tablet-only');
const seasonOnly=process.argv.includes('--season-only');
const conversionOnly=process.argv.includes('--conversion-only');
const basicOnly=process.argv.includes('--basic-only');
const out = path.join(__dirname, 'test-output');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.resolve(__dirname, '../../../../../tmp/bennys3dfootball-electron-profile'+(tabletOnly?'-tablet':seasonOnly?'-season':conversionOnly?'-conversion':basicOnly?'-basic':'')));
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
let win;
const errors = [], results = [], screenshots = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = () => fs.writeFileSync(path.join(out, tabletOnly?'ui-tablet-results.json':seasonOnly?'ui-season-results.json':conversionOnly?'ui-conversion-results.json':basicOnly?'ui-basic-results.json':'ui-results.json'), JSON.stringify({ results, errors, screenshots }, null, 2));
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: {
    backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, offscreen: true
  } });
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
  win.webContents.on('render-process-gone', (_e, details) => { errors.push(details); report(); app.exit(1); });
  const js = code => win.webContents.executeJavaScript(code, true);
  const capture = async name => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, name + '.png'), image.toPNG());
    screenshots.push(name + '.png'); report();
  };
  const check = (name, value) => { assert.ok(value, name); results.push(name); report(); };
  // Offscreen windows cannot obtain native OS focus on every platform. Supply
  // the actual KeyboardEvent codes consumed by the game's switch handlers.
  const keyEvent = (type, code) => js('window.dispatchEvent(new KeyboardEvent(' + JSON.stringify(type) + ', {bubbles:true,code:' + JSON.stringify(code === 'Return' ? 'Enter' : code) + ',key:' + JSON.stringify(code === 'Space' ? ' ' : 'Enter') + '}))');
  const keyDown = code => keyEvent('keydown', code);
  const keyUp = code => keyEvent('keyup', code);
  // The hub's anti-tremor filter ignores presses under 50ms, so a test press is awaited and held longer.
  const key = async code => { await keyDown(code); await wait(120); await keyUp(code); await wait(290); };
  const focused = () => js("(document.querySelector('.focused .name') || document.querySelector('.focused'))?.textContent.trim()");
  const click = async name => {
    const found = await js("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>!b.closest('[hidden]') && ((b.querySelector('.name')?.textContent || b.querySelector('span')?.textContent || b.textContent).trim()===" + JSON.stringify(name) + "));if(!b)return false;b.click();return true})()");
    assert.ok(found, 'Visible button exists: ' + name); await wait(290);
  };
  const advancePhase = async () => {
    await js("(()=>{const s=BennyFootball.sim, phase=s.s.phase;for(let i=0;i<12000 && s.s.phase===phase && (['presnap','flight','run','defend','kickflight','tackle'].includes(phase)||(phase==='result' && s.s.resultRevealRemaining>0));i++)s.step(.1,0)})()");
    await wait(90);
  };
  const quiet = () => js("NarbeVoiceManager.speak=()=>{};void 0");
  const until = async (condition, ms = 6000) => { const start = Date.now(); while (Date.now() - start < ms && !await js(condition)) await wait(50); };
  // The next menu waits until an outcome has been heard, then opens by itself.
  const speechChecks = async () => {
    await js("BennyFootball.startGame(true);void 0"); await wait(300);
    // A stand-in voice: every line talks until released, then later lines take 0.4 seconds each.
    await js("window.__long=true;window.__talkUntil=0;Object.defineProperty(speechSynthesis,'speaking',{configurable:true,get:()=>performance.now()<window.__talkUntil});NarbeVoiceManager.speak=t=>{window.__said=t;window.__talkUntil=window.__long?Infinity:performance.now()+400};void 0");
    // Reach the outcome, then let its on-field reveal play in real time, as in a game.
    await js("(()=>{const r=BennyFootball,s=r.sim;s.callPlay('inside');r.resume();for(let i=0;i<900&&s.s.phase!=='result';i++)s.step(.1,0,true)})()");
    await until("BennyFootball.sim.s.phase==='result' && BennyFootball.sim.s.resultRevealRemaining===0", 6000); await wait(1500);
    check('An outcome stays on the field while its speech is still playing', await js("BennyFootball.sim.s.phase==='result' && document.querySelector('#overlay').hidden && !document.querySelector('#ready-cue').hidden"));
    await js("window.__long=false;window.__talkUntil=0;void 0"); await until("BennyFootball.sim.s.phase!=='result'", 6000); await wait(300);
    check('When the speech ends, the next screen opens after a short breath', await js("BennyFootball.sim.s.phase!=='result' && !document.querySelector('#overlay').hidden"));
    await quiet();
  };
  // Hold Enter and the throw's line grows to the receiver, slows on him, then runs on past for an overthrow.
  const chargeChecks = async () => {
    const zone = "BennyFootball.charge && BennyFootball.charge.power>=FootballSim.CHARGE_ZONE[0] && BennyFootball.charge.power<=FootballSim.CHARGE_ZONE[1]";
    const toAim = async () => { await js("(()=>{const r=BennyFootball;r.prefs.charge=true;r.prefs.kickGuide=true;r.startGame(true);r.sim.callPlay('slants');r.resume()})()"); await until("BennyFootball.sim.s.phase==='aim'"); await wait(300); };
    await js("(()=>{const r=BennyFootball;r.prefs.charge=true;r.startGame(true)})()"); await wait(600);
    check('Plays lead with what they are for, under their playbook names', await js("[...document.querySelectorAll('#menu-items .menu-button')].slice(0,5).map(b=>(b.querySelector('.tag')?.textContent||'')+'|'+b.querySelector('.name').textContent).join(',')==='Quick Slants|Short pass,Sideline Flood|Medium pass,Four Verticals|Long pass,Outside Sweep|Outside run,Inside Zone|Inside run'"));
    await toAim();
    await keyDown('Return'); await wait(300);
    check('Holding Enter on a receiver starts the charge line instead of throwing', await js("BennyFootball.sim.s.phase==='aim' && !!BennyFootball.charge && BennyFootball.renderer.chargeArc.visible"));
    await until(zone, 4000); await wait(1200);
    check('The line reaches the receiver and slows there', await js(zone));
    check('While you charge, his defender holds the coverage you heard', await js("BennyFootball.sim._coverPlans[BennyFootball.charge.target].left>=1.4"));
    await keyUp('Return'); await wait(300);
    check('Letting go on the receiver throws the pass', await js("['flight','run'].includes(BennyFootball.sim.s.phase) && !BennyFootball.charge && !BennyFootball.renderer.chargeArc.visible"));
    await toAim(); await js("BennyFootball.sim.options.practice=false;void 0");  // practice is no-fail, so no overthrows there
    await keyDown('Return'); await until("BennyFootball.sim.s.phase!=='aim'", 12000); await wait(200);
    check('Held too long, the throw goes by itself as an overthrow and never pauses', await js("BennyFootball.sim._flight?.over===true && BennyFootball.screen==='game'"));
    await keyUp('Return'); await wait(300);
    check('The release after an automatic throw does nothing more', await js("BennyFootball.screen==='game'"));
    await js("(()=>{const r=BennyFootball,s=r.sim;s.options.practice=false;s.s.phase='playcall';s.s.fieldPosition=75;s.s.distance=10;s.s.down=4;s._formation();s.callPlay('fieldgoal');r.resume()})()");
    // One-switch mode sweeps the aim from the moment it opens, so read the start at once.
    await until("BennyFootball.sim.s.phase==='kickaim'");
    check('A field goal aim starts at a far post', await js("Math.abs(BennyFootball.sim.s.kickAim)>.85 && !document.querySelector('#kick-readout').classList.contains('on-target')"));
    await wait(400);
    check('A holder kneels with the ball up on its point, a fingertip on top', await js("(()=>{const r=BennyFootball.renderer,k=BennyFootball.sim.s.placeKick,m=r.playerModels.get(k.holderId),d=r.ballPresentation;if(!m||d.mode!=='tee')return false;const tip=m.arms[0].userData.hand.getWorldPosition(new THREE.Vector3()),top=new THREE.Vector3(...d.ballCenter).addScaledVector(new THREE.Vector3(...d.longAxis),.245);return m.kneel>.95&&d.longAxis[1]>.95&&tip.distanceTo(top)<.2&&r.ball.visible})()"));
    await js("BennyFootball.sim.setKickAim(0);void 0"); await wait(300);
    check('On target, the readout and uprights light up', await js("document.querySelector('#kick-readout').classList.contains('on-target') && BennyFootball.renderer.goalWindow.material.opacity>0"));
    await keyDown('Return'); await until(zone, 4000); await wait(300); await keyUp('Return'); await wait(300);
    check('A charged kick starts the run-up while the ball waits on the tee', await js("BennyFootball.sim.s.phase==='kickflight' && !BennyFootball.charge && !BennyFootball.sim.s.placeKick.struck && BennyFootball.renderer.ballPresentation.mode==='tee'"));
    await until("BennyFootball.sim.s.placeKick?.struck", 3000); await wait(150);
    check('The kicker boots it and the ball flies', await js("BennyFootball.sim.s.placeKick.struck && BennyFootball.renderer.ballPresentation.mode==='flight' && BennyFootball.sim.s.players.find(p=>p.id===BennyFootball.sim.s.placeKick.kickerId).anim==='kick'"));
  };
  // A coin toss opens the game; your kickoff is charged; a kick caught in your end zone waits for your choice.
  const kickoffChecks = async () => {
    await js("(()=>{const r=BennyFootball;r.prefs.kickoffs=true;r.prefs.charge=true;r.startGame(false)})()"); await wait(700);
    check('A new game opens with the coin toss', await js("BennyFootball.sim.s.toss==='call' && document.querySelector('#menu-title').textContent==='COIN TOSS.' && [...document.querySelectorAll('#menu-items .name')].slice(0,2).map(n=>n.textContent).join()==='Heads,Tails'"));
    await js("(()=>{const s=BennyFootball.sim;window.__roll=s.random;s.random=()=>.1})()"); await key('Return'); await js("BennyFootball.sim.random=window.__roll;void 0"); await wait(400);
    check('Winning the toss offers receive or kick off', await js("BennyFootball.sim.s.toss==='choose' && document.querySelector('#menu-title').textContent==='YOU WON THE TOSS.' && [...document.querySelectorAll('#menu-items .name')].slice(0,2).map(n=>n.textContent).join()==='Receive,Kick off'"));
    await key('Space'); await key('Return'); await wait(400);
    check('Kicking off opens your kickoff call', await js("BennyFootball.sim.s.kickoff?.team==='home' && document.querySelector('#menu-title').textContent==='KICKOFF.' && document.querySelector('#possession').textContent.endsWith('KICK')"));
    await key('Return'); await until("BennyFootball.sim.s.phase==='kickaim'"); await wait(300);
    check('Your kickoff has no aim to sweep, only the charge', await js("document.querySelector('#aim-button').hidden && !document.querySelector('#kick-readout').hidden && BennyFootball.renderer.kickTee.visible"));
    await keyDown('Return'); await until("BennyFootball.charge && BennyFootball.charge.power>=FootballSim.CHARGE_ZONE[0]", 5000);
    check('Holding Enter grows the kickoff line down the field', await js("BennyFootball.renderer.chargeArc.visible && BennyFootball.sim.s.phase==='kickaim'"));
    await keyUp('Return'); await wait(200);
    check('Letting go starts the run-up to the tee', await js("BennyFootball.sim.s.phase==='kickflight' && !BennyFootball.sim.s.placeKick.struck"));
    await js("(()=>{const r=BennyFootball,s=r.sim;s.random=()=>.99;s._setupKickoff('away');r.resume()})()");
    await until("BennyFootball.sim.s.phase==='returnchoice'", 20000);
    check('A kick caught in your end zone waits, with Run it out first and focused', await js("document.querySelector('#action-title').textContent==='Caught in the end zone' && [...document.querySelectorAll('#action-items .name')].slice(0,2).map(n=>n.textContent).join()==='Run it out,Take a knee' && document.querySelector('#action-items .focused .name').textContent==='Run it out'"));
    await key('Space'); await key('Return'); await until("BennyFootball.sim.s.phase==='playcall'", 15000);
    check('Taking a knee starts your drive at the 25', await js("BennyFootball.sim.s.possession==='home' && BennyFootball.sim.s.fieldPosition===25 && !BennyFootball.sim.s.kickoff && !!document.querySelector('#menu-items .tag')"));
    await js("BennyFootball.sim.random=Math.random;BennyFootball.prefs.kickoffs=false;void 0");
  };
  // On the visitors' fourth down their punt or field goal unit is on the field: you choose a return or a block.
  const specialTeamsChecks = async () => {
    await js("(()=>{const r=BennyFootball,s=r.sim;r.startGame(true);Object.assign(s.s,{phase:'playcall',toss:null,kickoff:null,conversion:null,possession:'away',possessionNumber:1,fieldPosition:75,down:4,distance:8});s._formation();r.resume()})()"); await wait(500);
    check('Their punt brings out the return and block calls', await js("document.querySelector('#menu-title').textContent==='THEY ARE PUNTING.' && [...document.querySelectorAll('#menu-items .name')].slice(0,2).map(n=>n.textContent).join()==='Return the punt,Block the punt'"));
    await capture('16-punt-return-call');
    await key('Return'); await until("BennyFootball.sim.s.phase==='run'", 20000);
    check('Returning the punt hands your returner the ball', await js("BennyFootball.sim.s.possession==='home' && BennyFootball.sim.s.carrierId==='home-FS' && document.querySelector('#camera-label').textContent==='RETURN CAM'"));
    await until("BennyFootball.sim.s.controlGrace===0", 6000); await wait(200);
    check('The readout counts the punt return', await js("BennyFootball.sim.s.phase!=='run' || document.querySelector('#gain-label').textContent==='RETURN'"));
    await js("(()=>{const r=BennyFootball,s=r.sim;r.startGame(true);Object.assign(s.s,{phase:'playcall',toss:null,kickoff:null,conversion:null,possession:'away',possessionNumber:1,fieldPosition:30,down:4,distance:8});s._formation();r.resume()})()"); await wait(500);
    check('Their field goal try brings out the block and return calls, with its distance', await js("document.querySelector('#menu-title').textContent==='STOP THE KICK.' && [...document.querySelectorAll('#menu-items .name')].slice(0,2).map(n=>n.textContent).join()==='Block the kick,Return a miss' && /47-yard/.test(document.querySelector('#menu-description').textContent)"));
  };
  // A touchdown offers the extra point or a two-point try.
  const conversionChecks = async () => {
    await js("BennyFootball.startGame(true);void 0"); await wait(300);
    await js("(()=>{const r=BennyFootball,s=r.sim;s.s.fieldPosition=97;s.s.distance=3;s._formation();s.callPlay('inside');for(let i=0;i<400&&!(s.s.phase==='run'&&s.s.controlGrace===0);i++)s.step(.1,0);s._player(s.s.carrierId).z=99.9;for(let i=0;i<200&&s.s.phase!=='result';i++)s.step(.1,0);for(let i=0;i<60&&s.s.resultRevealRemaining>0;i++)s.step(.1,0);r.resume()})()"); await wait(400);
    check('A touchdown is six points and leads to the conversion choice', await js("BennyFootball.sim.s.homeScore===6 && BennyFootball.sim.s.conversion==='choose' && document.querySelector('#menu-title').textContent==='AFTER THE TOUCHDOWN.' && document.querySelectorAll('#menu-items .menu-button').length===3"));
    await capture('15-conversion');
    await click('Go for two');
    check('Going for two offers only run and pass plays', await js("BennyFootball.sim.s.conversion==='two' && document.querySelector('#menu-title').textContent==='GO FOR TWO.' && Array.from(document.querySelectorAll('#menu-items .name')).every(n=>!/Field Goal|Punt|extra point/i.test(n.textContent))"));
  };
  // Basic: only the essentials, and the game makes the small calls (the coin toss, kicking deep, punt aim).
  const basicChecks = async () => {
    const names = sel => js("[...document.querySelectorAll('" + sel + " .name')].map(n=>n.textContent).join()");
    const value = name => js("[...document.querySelectorAll('#menu-items .menu-button')].find(b=>b.querySelector('.name').textContent===" + JSON.stringify(name) + ")?.querySelector('.value').textContent");
    await win.webContents.session.clearStorageData(); await win.reload(); await wait(1500); await quiet();
    // A coin toss or kickoff menu must never open while Basic is on.
    await js("window.__basicMenu='';setInterval(()=>{const t=document.querySelector('#menu-title').textContent;if(BennyFootball.prefs.mode==='basic'&&!document.querySelector('#overlay').hidden&&/^(COIN TOSS|YOU WON THE TOSS|KICKOFF|FREE KICK)\\./.test(t))window.__basicMenu=t},40);void 0");
    check('A brand new player starts in Basic', await js("BennyFootball.prefs.mode==='basic'") && (await value('Settings')).startsWith('Basic · '));
    await click('Settings');
    check('Basic settings are the essentials, in the order Benny\'s Football uses', await names('#menu-items') === 'Sound effects,Text to speech,Voice,Auto scan,Scan speed,Easy throw,Large text,Game mode,Reset saved progress,Back');
    check('Easy throw starts off, so throws and kicks are charged', await js("BennyFootball.prefs.charge===true") && await value('Easy throw') === 'Off');
    await capture('16-basic-settings');
    await click('Game mode');
    check('Advanced lists every option and keeps focus on Game mode', await js("BennyFootball.prefs.mode==='advanced'") && await names('#menu-items') === 'Text to speech,Voice,Difficulty,Game speed,Run controls,Camera motion,Auto scan,Scan speed,Sound effects,Stadium crowd,Kick aim speed,Large text,Charge throws and kicks,Kick guide,Kickoffs and coin toss,Game mode,Reset saved progress,Back' && await focused() === 'Game mode');
    await js("Object.assign(BennyFootball.prefs,{difficulty:'pro',pace:1,runControl:'scan',kickoffs:false});void 0");
    await click('Game mode');
    check('Switching back to Basic keeps focus on Game mode', await js("BennyFootball.prefs.mode==='basic'") && await focused() === 'Game mode' && (await names('#menu-items')).startsWith('Sound effects,'));
    await click('Easy throw');
    check('Easy throw is the charge setting seen from the other side', await js("BennyFootball.prefs.charge===false") && await value('Easy throw') === 'On' && await focused() === 'Easy throw');
    await click('Back');
    check('The main menu Settings row shows the mode', (await value('Settings')).startsWith('Basic · '));
    await click('How to play');
    const hidden = "/heads or tails|receive or defer|Choose direction|Settings can turn|Settings has slower|onside/i";
    check('Basic help leaves out the coin toss calls and the hidden settings', await js("(()=>{const t=document.querySelector('#menu-content').textContent;return !" + hidden + ".test(t)&&t.includes('Advanced mode in Settings adds more options')})()"));
    await js("NarbeVoiceManager.speak=t=>{window.__said=t};void 0"); await click('Read instructions aloud');
    check('Basic read-aloud help matches', await js("!" + hidden + ".test(window.__said)&&window.__said.endsWith('Advanced mode in Settings adds more options.')"));
    await quiet(); await click('Back');
    await js("(()=>{const r=BennyFootball;r.sim.random=Math.random;r.startGame(false)})()"); await wait(200);
    check('Basic plays at its fixed values and keeps the Advanced choices saved', await js("(()=>{const r=BennyFootball,o=r.sim.options;return o.difficulty==='rookie'&&o.pace===.45&&o.kickoffs===true&&r.prefs.difficulty==='pro'&&r.prefs.pace===1&&r.prefs.runControl==='scan'&&r.prefs.kickoffs===false})()"));
    check('The coin toss is tossed for you and its result shown on the field', await js("BennyFootball.sim.s.toss===null && !!BennyFootball.sim.s.kickoff && document.querySelector('#overlay').hidden && document.querySelector('#ready-label').textContent.startsWith('COIN TOSS')"));
    await capture('17-basic-toss');
    const held = await js("JSON.stringify([BennyFootball.sim.s.phase,BennyFootball.sim.s.countdown])"); await wait(900);
    check('The kickoff waits while the toss is shown', held === await js("JSON.stringify([BennyFootball.sim.s.phase,BennyFootball.sim.s.countdown])"));
    await until("!document.querySelector('#ready-label').textContent.startsWith('COIN TOSS')", 12000);
    check('After the toss has been heard, the kickoff goes on', await js("!document.querySelector('#ready-label').textContent.startsWith('COIN TOSS')"));
    // Lose an exhibition toss: you kick off deep with no kickoff menu, and Easy throw kicks it for you.
    await js("(()=>{const r=BennyFootball;r.prefs.kickoffs=true;r.prefs.mode='advanced';r.startGame(false);const rolls=[.1,.9];r.sim.random=()=>rolls.length?rolls.shift():.5;r.prefs.mode='basic';r.resume()})()"); await wait(100);
    check('A game left at the coin toss is tossed for you once Basic is on', await js("BennyFootball.sim.s.toss===null && BennyFootball.sim.s.kickoff?.team==='home' && document.querySelector('#ready-label').textContent==='COIN TOSS · TAILS'"));
    await until("BennyFootball.sim.s.phase==='kickflight'", 20000);
    check('Your kickoff is called deep and kicked for you', await js("BennyFootball.sim.s.phase==='kickflight' && BennyFootball.sim.s.playId==='kickdeep'"));
    check('An Easy throw kickoff lands short of the end zone for a return', await js("(()=>{const y=100-BennyFootball.sim._flight.to.z;return y>=3&&y<=10})()"));
    // Switch modes from the pause menu at the coin toss; it takes effect on Continue.
    await js("(()=>{const r=BennyFootball;r.sim.random=Math.random;r.prefs.mode='advanced';r.startGame(false)})()"); await wait(300);
    check('Advanced still opens with the coin toss', await js("document.querySelector('#menu-title').textContent==='COIN TOSS.' && BennyFootball.sim.s.toss==='call'"));
    await click('Pause / settings');
    check('The Advanced pause menu has every option', await names('#menu-items') === 'Continue,Help,Game status,Restart game,Settings,How to play,Main menu,Exit game');
    await click('Settings'); await click('Game mode'); await click('Back');
    check('The Basic pause menu is the short list', await names('#menu-items') === 'Continue,Help,Game status,Settings,Main menu');
    await click('Continue');
    check('Continue in Basic tosses the coin for you', await js("BennyFootball.sim.s.toss===null && document.querySelector('#ready-label').textContent.startsWith('COIN TOSS')"));
    // A save made at the coin toss.
    await js("(()=>{const r=BennyFootball;r.prefs.mode='advanced';r.startGame(false)})()"); await wait(300);
    await click('Pause / settings'); await click('Main menu'); await js("BennyFootball.prefs.mode='basic';void 0");
    await click('Continue exhibition');
    check('A save made at the coin toss resumes with the toss done for you', await js("BennyFootball.sim.s.toss===null && !!BennyFootball.sim.s.kickoff"));
    await js("(()=>{const r=BennyFootball;r.startGame(false,{mode:'season'})})()"); await wait(200);
    check('A Basic season game: you receive, and the visitors get the second half', await js("BennyFootball.sim.s.toss===null && BennyFootball.sim.s.kickoff?.team==='away' && BennyFootball.sim.s.secondHalfReceiver==='away'"));
    await js("(()=>{const r=BennyFootball,s=r.sim;s.s.quarter=4;s.s.overtime=true;s.s.overtimePeriod=1;s._startToss();r.resume()})()"); await wait(200);
    check('The overtime toss is tossed for you too', await js("BennyFootball.sim.s.toss===null && !!BennyFootball.sim.s.kickoff && document.querySelector('#ready-label').textContent.startsWith('OVERTIME TOSS')"));
    // A Basic punt goes straight down the field.
    await js("(()=>{const r=BennyFootball,s=r.sim;r.prefs.charge=false;r.startGame(true);s.reset({practice:true});s.s.fieldPosition=30;s.s.down=4;s.s.distance=10;s._formation();s.callPlay('punt');r.resume()})()");
    await until("BennyFootball.sim.s.phase==='kickaim'");
    check('A Basic punt has no aim to sweep', await js("document.querySelector('#aim-button').hidden && document.querySelector('#kick-status').textContent==='PUNT' && BennyFootball.sim.s.kickAim===0"));
    await keyDown('Space'); await wait(400);
    check('Holding Space does not move a Basic punt', await js("BennyFootball.sim.s.kickAim===0 && BennyFootball.sim.s.phase==='kickaim'"));
    await keyUp('Space'); await until("BennyFootball.sim.s.phase==='kickflight'", 6000);
    check('With Easy throw on, the punt kicks itself', await js("BennyFootball.sim.s.phase==='kickflight' && BennyFootball.sim.s.playId==='punt'"));
    // With charging on, a mouse or finger charges the same way a held Enter does.
    const pointer = (selector, type, id, kind) => js("document.querySelectorAll(" + JSON.stringify(selector) + ")[" + (kind === 'receiver' ? 1 : 0) + "].dispatchEvent(new PointerEvent(" + JSON.stringify(type) + ",{bubbles:true,pointerId:" + id + ",pointerType:'touch'}));void 0");
    await js("(()=>{const r=BennyFootball,s=r.sim;r.prefs.charge=true;r.startGame(true);s.reset({practice:true});s.s.fieldPosition=75;s.s.down=4;s.s.distance=10;s._formation();s.callPlay('fieldgoal');r.resume()})()");
    await until("BennyFootball.sim.s.phase==='kickaim'"); await wait(200);
    await js("document.querySelector('#kick-button').click();void 0"); await wait(200);
    check('With charging on, a click on Kick does not kick at full power', await js("BennyFootball.sim.s.phase==='kickaim' && !BennyFootball.charge"));
    await pointer('#kick-button', 'pointerdown', 7); await wait(500);
    check('Holding a finger on Kick grows the charge line', await js("BennyFootball.charge?.kind==='kick' && BennyFootball.renderer.chargeArc.visible"));
    await pointer('#kick-button', 'pointerup', 7); await wait(200);
    check('Letting go of Kick kicks with that charge', await js("BennyFootball.sim.s.phase==='kickflight' && !BennyFootball.charge"));
    await js("(()=>{const r=BennyFootball;r.startGame(true);r.sim.reset({practice:true});r.sim.callPlay('slants');r.resume()})()"); await until("BennyFootball.sim.s.phase==='aim'"); await wait(300);
    await js("document.querySelector('.field-choice').click();void 0"); await wait(200);
    check('With charging on, a click on a receiver does not throw at once', await js("BennyFootball.sim.s.phase==='aim' && !BennyFootball.charge"));
    await pointer('.field-choice', 'pointerdown', 8, 'receiver'); await wait(400);
    check('Holding a finger on a receiver charges the throw to him', await js("BennyFootball.charge?.kind==='throw' && BennyFootball.charge.target===1"));
    await pointer('.field-choice', 'pointerup', 8, 'receiver'); await wait(200);
    check('Letting go of the receiver throws', await js("['flight','run','result'].includes(BennyFootball.sim.s.phase) && !BennyFootball.charge"));
    check('No coin toss or kickoff menu ever opened in Basic', await js("window.__basicMenu===''"));
  };
  const playToResult = async () => {
    for (let n = 0; n < 15 && await js("!['result','final'].includes(BennyFootball.sim.s.phase)"); n++) await advancePhase();
    assert.ok(await js("['result','final'].includes(BennyFootball.sim.s.phase)"), 'Active play settles');
  };
  try {
    await win.webContents.session.clearStorageData();
    await win.loadFile(path.join(__dirname, '..', 'index.html')); await wait(1800); await quiet();
    if(basicOnly){await basicChecks();check('No Basic browser errors',errors.length===0);report();app.exit(0);return;}
    // Every check below plays Advanced, the full game; basicChecks covers Basic.
    await js("BennyFootball.prefs.mode='advanced';BennyFootball.prefs.kickoffs=false;void 0");
    if(conversionOnly){await conversionChecks();await speechChecks();await chargeChecks();await kickoffChecks();await specialTeamsChecks();check('No conversion browser errors',errors.length===0);report();app.exit(0);return;}
    // The original switch checks run with the charge meter off; chargeChecks covers it on.
    await js("BennyFootball.prefs.charge=false;void 0");
    if(tabletOnly){
      await js("BennyFootball.startGame(true);void 0");await key('Return');await advancePhase();await wait(500);win.setSize(768,768);await wait(500);
      check('Tablet direct receivers remain fully within viewport',await js("Array.from(document.querySelectorAll('.field-choice')).every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})"));
      check('Tablet receiver buttons do not overlap',await js("(()=>{const r=Array.from(document.querySelectorAll('.field-choice')).map(b=>b.getBoundingClientRect());return r.length===4&&r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5))})()"));
      await capture('07b-tablet-aim');check('No tablet browser errors',errors.length===0);report();app.exit(0);return;
    }
    if(!seasonOnly){
    check('Game starts in the main menu with a WebGL renderer', await js("!!window.BennyFootball && BennyFootball.screen==='main' && !!document.querySelector('#stadium canvas')"));
    await capture('01-main');
    const initialFocus = await focused();
    keyDown('Space'); await wait(120);
    check('Menu highlight does not move on keydown', initialFocus === await focused());
    keyUp('Space'); await wait(290);
    check('Space advances the menu on release', await focused() === 'Exhibition');
    keyDown('Return'); await wait(120);
    check('Enter does not select a menu item on keydown', await js("BennyFootball.screen==='main'"));
    keyUp('Return'); await wait(290);
    check('Enter release opens the exhibition team picker', await js("BennyFootball.screen==='teams' && document.querySelectorAll('#menu-items .menu-button').length===11"));
    await capture('02-teams');
    win.setSize(768,768);await wait(250);await capture('02b-tablet-teams');
    check('Team selection fits the tablet width',await js("document.documentElement.scrollWidth<=innerWidth"));
    win.setSize(1440,900);await wait(100);
    await key('Return'); await key('Return');
    check('Picking two distinct teams opens the overhead playbook', await js("BennyFootball.sim.s.phase==='playcall' && document.querySelector('#menu-title').textContent==='CALL YOUR PLAY.'"));
    await wait(700); await capture('03-overhead');
    let exhibitionSave = await js("localStorage.getItem('bennys-stadium-match-v1')");
    check('Exhibition saves a settled checkpoint', !!exhibitionSave);
    await click('Pause'); await click('Main menu'); exhibitionSave=await js("localStorage.getItem('bennys-stadium-match-v1')"); await click('New season');
    await key('Space'); await key('Return');
    check('Season team selection creates a sixteen-game schedule', await js("BennyFootball.screen==='season' && BennyFootball.season.data.teamId==='blue' && BennyFootball.season.data.schedule.length===16"));
    await capture('04-season');
    await click('Schedule & results');
    check('Season schedule displays all sixteen games', await js("document.querySelectorAll('.schedule-list li').length===16"));
    await capture('05-schedule');
    await click('Back to season'); await key('Return');
    check('Season games use regulation quarters', await js("BennyFootball.sim.options.format==='regulation' && BennyFootball.sim.s.quarter===1 && BennyFootball.sim.s.timeRemaining===120"));
    let seasonSave = await js("localStorage.getItem('bennys-stadium-season-match-v1')");
    check('Season and exhibition checkpoints stay separate', !!seasonSave && exhibitionSave === await js("localStorage.getItem('bennys-stadium-match-v1')"));
    await click('Pause'); await click('Main menu'); seasonSave=await js("localStorage.getItem('bennys-stadium-season-match-v1')"); await click('Practice field');
    check('Practice preserves both saved competitive games', seasonSave === await js("localStorage.getItem('bennys-stadium-season-match-v1')") && exhibitionSave === await js("localStorage.getItem('bennys-stadium-match-v1')"));
    await key('Return');
    check('Choosing a play starts a protected pre-snap setup', await js("BennyFootball.sim.s.phase==='presnap' && BennyFootball.sim.s.countdown>2"));
    check('Pre-snap cue is visible instead of instant action', await js("!document.querySelector('#ready-cue').hidden && BennyFootball.sim.s.controlGrace===0"));
    await capture('06-presnap');
    await advancePhase();
    check('Pass read has four buttons directly over the field', await js("BennyFootball.sim.s.phase==='aim' && document.querySelectorAll('#target-labels .field-choice').length===4 && document.querySelector('#action-panel').hidden"));
    await wait(800); await capture('07-aim');
    win.setSize(768,768);await wait(250);await capture('07b-tablet-aim');
    check('Direct receiver targets remain within the tablet viewport',await js("Array.from(document.querySelectorAll('.field-choice')).every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})"));
    check('Tablet receiver buttons do not overlap',await js("(()=>{const r=Array.from(document.querySelectorAll('.field-choice')).map(b=>b.getBoundingClientRect());return r.length===4&&r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5))})()"));
    win.setSize(1440,900);await wait(150);
    check('Receiver buttons meet the minimum switch/touch target size', await js("Array.from(document.querySelectorAll('.field-choice')).every(b=>b.getBoundingClientRect().height>=64)"));
    const readBefore = await js("({players:JSON.stringify(BennyFootball.sim.s.players),clock:BennyFootball.sim.s.timeRemaining})");
    await wait(450);
    check('Receivers keep moving while the pass read has no running clock or failure deadline', readBefore.players !== await js("JSON.stringify(BennyFootball.sim.s.players)") && readBefore.clock === await js("BennyFootball.sim.s.timeRemaining") && await js("BennyFootball.sim.s.phase==='aim'"));
    await key('Space');
    check('Space scans receivers on the field', await js("BennyFootball.sim.s.selectedTarget===1 && document.querySelector('.field-choice.focused').dataset.playerId===BennyFootball.sim.s.targets[1]"));
    // Pause is a scanned choice after the receivers; holding Enter never pauses.
    await key('Space'); await key('Space'); await key('Space');
    check('Pause is scanned after the receivers', await js("document.querySelector('#pause-button').classList.contains('focused')"));
    await key('Return');
    check('Selecting Pause opens the pause menu from receiver selection', await js("BennyFootball.screen==='pause'"));
    const paused = await js("JSON.stringify(BennyFootball.sim.s)"); await wait(250);
    check('Pause freezes gameplay', paused === await js("JSON.stringify(BennyFootball.sim.s)"));
    const selected = await focused();
    keyDown('Space'); await wait(3150);
    check('Holding Space scans backwards through a menu', selected !== await focused());
    const backwards = await focused(); keyUp('Space'); await wait(290);
    check('Releasing a backwards scan does not also move forwards', backwards === await focused());
    await click('Settings'); await capture('08-settings');
    win.setSize(768, 768); await wait(400); await capture('09-tablet-settings');
    check('Settings fit the tablet width', await js("document.documentElement.scrollWidth<=innerWidth"));
    await js("Array.from(document.querySelectorAll('#menu-items button')).at(-1).scrollIntoView({block:'nearest'})");
    check('The tablet Back control remains reachable', await js("(()=>{const r=Array.from(document.querySelectorAll('#menu-items button')).at(-1).getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight})()"));
    win.setSize(1440, 900); await wait(150);
    await click('Back'); await click('Continue');
    keyDown('Return'); await wait(100);
    check('A receiver is not thrown to on keydown', await js("BennyFootball.sim.s.phase==='aim'"));
    keyUp('Return'); await wait(290);
    check('Enter release throws to the focused receiver', await js("BennyFootball.sim.s.phase==='flight'"));
    await js("(()=>{const s=BennyFootball.sim;for(let i=0;i<400 && s.s.phase==='flight';i++)s.step(.1,0);const p=JSON.stringify(s.s.players);s.step(.1,-1);window.__catchGraceOK=s.s.phase==='run' && s.s.controlGrace>1.8 && p===JSON.stringify(s.s.players)})()");
    await wait(100);
    check('A catch enters a protected control grace period', await js("window.__catchGraceOK && BennyFootball.sim.s.carrierId===BennyFootball.sim.s.controlledId"));
    await wait(600); await capture('10-run');
    await js("for(let i=0;i<40 && BennyFootball.sim.s.controlGrace>0;i++)BennyFootball.sim.step(.1,0)");
    const runnerBefore = await js("BennyFootball.sim.s.players.find(p=>p.id===BennyFootball.sim.s.carrierId).x");
    keyDown('Space'); await wait(450); keyUp('Space'); await wait(290);
    check('Space steers toward screen left in the third-person view', await js("(BennyFootball.sim.s.players.find(p=>p.id===BennyFootball.sim.s.carrierId).x-(" + runnerBefore + "))*BennyFootball.renderer.getSteerSign()<0"));
    // A long hold on Enter keeps steering right; it never pauses or freezes the play.
    keyDown('Return'); await wait(1600);
    const heldRun = await js("JSON.stringify(BennyFootball.sim.s.players)"); await wait(300);
    check('Holding Enter keeps the play running instead of pausing', await js("BennyFootball.screen==='game' && JSON.stringify(BennyFootball.sim.s.players)!==" + JSON.stringify(heldRun)));
    keyUp('Return'); await wait(290);
    await click('Pause'); await click('Settings'); await click('Auto scan'); await click('Run controls');
    check('One-switch mode and no-hold steering use shared settings', await js("NarbeScanManager.getSettings().autoScan && BennyFootball.prefs.runControl==='scan'"));
    await click('Back'); await click('Continue');
    check('Choose-direction controls are available after resuming', await js("!document.querySelector('#action-panel').hidden && document.querySelectorAll('#action-items button').length===4"));
    const waiting = await js("JSON.stringify(BennyFootball.sim.s.players)"); await wait(350);
    check('Choose-direction gameplay waits for a switch selection', waiting === await js("JSON.stringify(BennyFootball.sim.s.players)"));
    await key('Return'); await wait(1150);
    check('One Enter press advances a movement segment', waiting !== await js("JSON.stringify(BennyFootball.sim.s.players)"));
    await js("(()=>{const s=BennyFootball.sim,p=s.s.players.find(p=>p.id===s.s.carrierId),q=s.s.players.find(q=>q.team!==p.team);q.x=p.x;q.z=p.z+.2;s.s.down=4;s.s.distance=90;s.s.controlGrace=0;s._runTime=2;s.options.practice=false;const roll=s.random;s.random=()=>.99;s.step(.016,0);s.random=roll;s.options.practice=true})()");  // a high roll: no broken tackle
    check('Contact starts a tackle presentation while direction controls are enabled', await js("BennyFootball.sim.s.phase==='tackle' && BennyFootball.prefs.runControl==='scan'"));
    await wait(450);
    check('The tackle remains visible before the result appears', await js("BennyFootball.sim.s.phase==='tackle' && document.querySelector('#overlay').hidden"));
    await capture('10b-tackle');
    for(let i=0;i<120 && await js("BennyFootball.sim.s.phase==='tackle'");i++)await wait(75);
    check('Choose-direction controls automatically finish the tackle animation', await js("BennyFootball.sim.s.phase==='result'"));
    check('The outcome is shown on the field before the next-play menu', await js("BennyFootball.sim.s.phase==='result' && BennyFootball.sim.s.resultRevealRemaining>0 && document.querySelector('#overlay').hidden"));
    check('The tackle and outcome keep the camera close to the players', await js("BennyFootball.renderer.camera.position.y<12"));
    await capture('10c-result-field');
    await key('Return');
    check('An early Enter release does not skip the outcome presentation', await js("BennyFootball.sim.s.phase==='result' && BennyFootball.sim.s.resultRevealRemaining>0"));
    await advancePhase(); await until("BennyFootball.sim.s.phase==='playcall' && !document.querySelector('#overlay').hidden");
    check('After the outcome, the next playbook opens without an extra press', await js("BennyFootball.sim.s.phase==='playcall' && !document.querySelector('#overlay').hidden && !!document.querySelector('.last-play')"));
    await capture('10d-result-menu');
    await wait(250);
    check('The playbook waits for a deliberate selection', await js("BennyFootball.sim.s.phase==='playcall'"));
    check('Play completion returns to the overhead defensive playbook', await js("BennyFootball.sim.s.possession==='away' && document.querySelector('#menu-title').textContent==='MAKE THE STOP.'"));
    await wait(900);
    const upField = "(()=>{const d=new THREE.Vector3();BennyFootball.renderer.camera.getWorldDirection(d);return d.z>0})()";
    check('The defensive overhead looks up the field from your own side', await js(upField));
    await key('Return');
    check('Defense also starts with a pre-snap setup', await js("BennyFootball.sim.s.phase==='presnap'"));
    await advancePhase(); await wait(500); await capture('11-defense');
    check('Live defense also looks up the field from your own side', await js(upField));
    check('Defense assigns a home defender and an opposing target', await js("BennyFootball.sim.s.phase==='defend' && BennyFootball.sim.s.controlledId.startsWith('home-') && BennyFootball.renderer.projectPlayer(BennyFootball.sim.s.defenseTargetId || BennyFootball.sim.s.carrierId).visible"));
    await click('Pause'); await click('Settings'); await click('Auto scan'); await click('Run controls'); await click('Back'); await click('Main menu');
    await click('Continue exhibition');
    check('Exhibition resume does not overwrite the saved season game', await js("BennyFootball.sim.options.format==='drives' && !BennyFootball.sim.options.practice") && seasonSave === await js("localStorage.getItem('bennys-stadium-season-match-v1')"));
    await click('Field Goal'); await advancePhase(); await wait(700); await capture('12-kick');
    check('Kicking opens a continuous third-person aim', await js("BennyFootball.sim.s.phase==='kickaim' && !document.querySelector('#kick-readout').hidden && document.querySelector('#action-panel').hidden"));
    const aim0 = await js("BennyFootball.sim.s.kickAim");
    keyDown('Space'); await wait(350); keyUp('Space'); await wait(290);
    const aim1 = await js("BennyFootball.sim.s.kickAim");
    check('Holding Space moves kick aim', Math.abs(aim1 - aim0) > 0.005);
    await wait(350);
    check('Releasing Space stops kick aim', aim1 === await js("BennyFootball.sim.s.kickAim"));
    keyDown('Space'); await wait(350); keyUp('Space'); await wait(290);
    const aim2 = await js("BennyFootball.sim.s.kickAim");
    check('The next Space hold reverses kick aim', (aim2 - aim1) * (aim1 - aim0) < 0);
    await click('Pause'); await click('Settings'); await click('Auto scan'); await click('Back'); await click('Continue');
    const autoAim=await js("BennyFootball.sim.s.kickAim");await wait(350);
    check('One-switch kick aiming sweeps without holding Space',autoAim!==await js("BennyFootball.sim.s.kickAim"));
    keyDown('Return'); await wait(120);
    check('The kick waits for Enter release', await js("BennyFootball.sim.s.phase==='kickaim'"));
    keyUp('Return'); await wait(290);
    check('Enter release launches the kick', await js("BennyFootball.sim.s.phase==='kickflight'"));
    await playToResult(); await advancePhase(); await until("BennyFootball.sim.s.phase==='playcall' && !document.querySelector('#overlay').hidden");
    await click('Pause / settings'); await click('Main menu'); await click('Continue season'); await key('Return');
    check('Season resumes its matching game checkpoint', await js("BennyFootball.sim.options.format==='regulation' && BennyFootball.sim.s.phase==='playcall'"));
    await click('Pause'); await click('Settings'); if(!await js("NarbeScanManager.getSettings().autoScan"))await click('Auto scan'); await click('Back'); await click('Continue');
    }else{
      check('The season-only run starts with a clean main menu',await js("!!window.BennyFootball && BennyFootball.screen==='main'"));
      // The Enter-only season game plays with the coin toss and every kickoff.
      await js("BennyFootball.prefs.kickoffs=true;void 0");
      await click('New season');await key('Space');await key('Return');await key('Return');
      check('A fresh four-quarter season game is ready',await js("BennyFootball.sim.options.format==='regulation' && BennyFootball.sim.s.phase==='playcall' && BennyFootball.season.data.gamesPlayed===0"));
      await click('Pause');await click('Settings');await click('Auto scan');await click('Run controls');await click('Back');await click('Continue');
    }
    // A constant success roll can make both teams score forever in overtime.
    // Use a reproducible sequence so this end-to-end game has varied outcomes.
    await js("(()=>{let seed=20260929;BennyFootball.sim.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646}})()");
    const completedMatchId = await js("BennyFootball.season.data.matchId");
    const quarters = new Set(), possessionSides = new Set();
    let uiSteps = 0;
    while (await js("BennyFootball.sim.s.phase!=='final'") && uiSteps++ < 1800) {
      const state = await js("({phase:BennyFootball.sim.s.phase,quarter:BennyFootball.sim.s.quarter,possession:BennyFootball.sim.s.possession})");
      quarters.add(state.quarter); possessionSides.add(state.possession);
      if (state.phase==='result' && await js("BennyFootball.sim.s.resultRevealRemaining>0")) await advancePhase();
      else if (['playcall','aim','kickaim','result','returnchoice'].includes(state.phase)) await key('Return');
      else await advancePhase();
    }
    check('Enter-only play completes a regulation season game', await js("BennyFootball.sim.s.phase==='final' && BennyFootball.sim.options.format==='regulation'"));
    check('Regulation play includes all four quarters and both possessions', [1,2,3,4].every(q=>quarters.has(q)) && possessionSides.size===2);
    check('The HUD clock reads simulation time', await js("document.querySelector('#period').textContent.includes(':')"));
    await capture('13-season-final');
    check('A final result records exactly one season game', await js("BennyFootball.season.data.gamesPlayed===1 && BennyFootball.season.data.results.length===1"));
    check('The completed season game checkpoint is cleared', await js("localStorage.getItem('bennys-stadium-season-match-v1')===null"));
    await js("BennyFootball.pause();BennyFootball.resume()");
    check('Revisiting the final screen does not duplicate its season result', await js("BennyFootball.season.data.results.length===1"));
    await win.reload(); await wait(1500); await quiet(); await js("BennyFootball.prefs.mode='advanced';void 0");
    check('Season progression survives reload without duplicate recording', await js("BennyFootball.season.data.gamesPlayed===1 && BennyFootball.season.data.results.length===1 && BennyFootball.season.data.results[0].matchId===" + JSON.stringify(completedMatchId)));
    await click('Continue season'); await capture('14-season-next-game');
    check('The next season game is ready after reload', await js("BennyFootball.screen==='season' && BennyFootball.season.data.gamesPlayed===1 && document.querySelector('#menu-title').textContent==='GAME 2 OF 16'"));
    await js("BennyFootball.prefs.kickoffs=false;void 0");
    await conversionChecks();
    await speechChecks();
    await chargeChecks();
    await kickoffChecks();
    await specialTeamsChecks();
    await basicChecks();
    check('No browser errors', errors.length === 0);
    report(); app.exit(0);
  } catch (error) {
    try { errors.push({ phase: await js("window.BennyFootball?.sim.s.phase"), screen: await js("window.BennyFootball?.screen") }); await capture('failure'); } catch (_) {}
    errors.push(error.stack || String(error)); report(); app.exit(1);
  }
});
