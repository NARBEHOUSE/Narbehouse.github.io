'use strict';
/* Chasing Rainbows - whole games played through the real page, headless, by switch presses.
 *
 * Loads index.html in jsdom (a Node DOM: no browser, no rendering, no GPU - safe on this PC)
 * with the hub's real shared scanner, voice manager and input guard. Only speech, canvas
 * and media are faked. A driver presses Space and Enter (keydown/keyup, like a switch
 * interface) to start games, take turns, look, pause and continue, and plays each game to
 * the results screen. Any script error fails the run.
 *
 * jsdom is not a hub dependency. Install it anywhere and point at it:
 *   npm i jsdom@24 --prefix <dir>   then   JSDOM=<dir>/node_modules/jsdom node tests/dom-smoke.cjs
 */
const path = require('path'), fs = require('fs');
const jsdom = require(process.env.JSDOM || 'jsdom');
const { JSDOM, VirtualConsole } = jsdom;
const GAME = process.env.CR_GAME || path.join(__dirname, '..');
const HUB = path.join(GAME, '..', '..', '..');
const ORIGIN = 'http://hub.local/';
/** Serves the hub folder at http://hub.local/ (a real origin, so localStorage works). */
class HubFiles extends jsdom.ResourceLoader {
  fetch(url, options) {
    if (!url.startsWith(ORIGIN)) return super.fetch(url, options);
    const file = path.join(HUB, decodeURIComponent(url.slice(ORIGIN.length).split('?')[0]));
    const p = new Promise((resolve, reject) => fs.readFile(file, (err, buf) => (err ? reject(err) : resolve(buf))));
    p.abort = () => {};
    return p;
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fakeContext() {
  const grad = { addColorStop() {} };
  const target = {
    canvas: null, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, filter: 'none',
    globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: '', font: '', lineCap: 'butt', lineJoin: 'miter',
    createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad, createPattern: () => ({ setTransform() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w.width || w) * (h || w.height || 1) * 4)), width: w.width || w, height: h || w.height }),
    measureText: t => ({ width: String(t).length * 8 }),
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}

function stub(w, errors) {
  w.addEventListener('error', e => errors.push('window error: ' + (e.error && e.error.stack || e.message)));
  w.addEventListener('unhandledrejection', e => errors.push('unhandled rejection: ' + (e.reason && e.reason.stack || e.reason)));
  const voices = [{ name: 'Fake English', lang: 'en-US', default: true }];
  let current = null;
  w.SpeechSynthesisUtterance = function (text) { this.text = text; };
  w.speechSynthesis = {
    speaking: false, pending: false,
    getVoices: () => voices,
    speak(u) {
      this.speaking = true; current = u;
      setTimeout(() => { if (current !== u) return; u.onstart && u.onstart(); }, 2);
      setTimeout(() => { if (current !== u) return; current = null; this.speaking = false; u.onend && u.onend(); }, 4 + String(u.text).length);
    },
    cancel() { const u = current; current = null; this.speaking = false; if (u && u.onerror) u.onerror({ error: 'interrupted' }); },
    addEventListener() {}, removeEventListener() {},
  };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.load = function () {};
  w.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, finish() {} }; };
  w.HTMLCanvasElement.prototype.getContext = function () { const c = fakeContext(); c.canvas = this; return c; };
}


const assert=require('node:assert/strict');
const E=require(path.join(GAME,'js/engine.js')), C=require(path.join(GAME,'js/cards.js'));
const names=['Player 1','Player 2','Player 3'];
const cards=ts=>ts.map((t,i)=>({t,id:'fixture'+i}));
function saved(mode, hand, laid={}, n=2) {
 const cfg={mode,players:names.slice(0,n).map(name=>({name,kind:'human'}))};
 const state=E.createGame(cfg,42).state; state.phase='play';state.players[0].hand=cards(hand);
 for(const k of Object.keys(laid))state.players[0].laid[k]=cards(['wild']);
 return {v:1,cfg,state,meta:{names:names.slice(0,n),kinds:Array(n).fill('human'),viewer:0,hidden:false,openHands:false,inbox:{},hints:{},explained:{}},summary:'Test fixture'};
}
async function check(label, save, auto, body) {
 const errors=[],spoken=[],vc=new VirtualConsole();
 vc.on('jsdomError',e=>{if(!/Not implemented: (navigation|window.scrollTo)/.test(e.message))errors.push(e.message);});
 vc.on('error',(...a)=>errors.push(a.join(' ')));
 const dom=new JSDOM(fs.readFileSync(path.join(GAME,'index.html'),'utf8'),{url:ORIGIN+'apps/games/CHASINGRAINBOWS/index.html',runScripts:'dangerously',resources:new HubFiles(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  stub(w,errors); const speak=w.speechSynthesis.speak;w.speechSynthesis.speak=function(u){spoken.push(u.text);return speak.call(this,u);};
  w.Element.prototype.scrollIntoView=function(){};
  w.localStorage.setItem('chasingrainbows_settings',JSON.stringify({pace:'quick',motion:'off',autoDraw:false,confirmDiscard:true,helper:'off',textSize:1.5,setup:{mode:save?save.cfg.mode:'classic',players:save?save.cfg.players.length:2,people:save?save.cfg.players.length:1}}));
  w.localStorage.setItem('narbe-scan-settings',JSON.stringify(auto?{autoScan:true,scanSpeedIndex:0,parkingMode:'off',waitForSpeech:false}:{}));
  if(save)w.localStorage.setItem('chasingrainbows_save',JSON.stringify(save));
 }});
 const w=dom.window,doc=w.document,dbg=()=>w.CRApp.__dbg();
 async function wait(fn,what){for(let i=0;i<400;i++){if(fn())return;await sleep(25);}throw Error(label+' timed out: '+what+' '+JSON.stringify(dbg()));}
 async function press(code){const ev=type=>new w.KeyboardEvent(type,{code,key:code==='Space'?' ':'Enter',bubbles:true,cancelable:true});doc.body.dispatchEvent(ev('keydown'));await sleep(25);doc.body.dispatchEvent(ev('keyup'));await sleep(90);}
 async function choose(id){for(let i=0;i<(auto?800:45);i++){if(dbg().choice&&dbg().choice.id===id){await press('Enter');return;}if(auto)await sleep(25);else await press('Space');}throw Error(label+' cannot reach '+id+' '+JSON.stringify(dbg()));}
 try {await wait(()=>w.CRApp&&w.CRApp.__dbg,'boot');await body({w,doc,dbg,wait,press,choose,spoken});assert.deepEqual(errors,[]);console.log('PASS '+label);} finally{dom.window.close();}
}
(async()=>{
 await check('setup: four complexity labels, stable selection and saved mode',null,false,async({w,doc,dbg,press,choose})=>{
  assert.equal(dbg().choice.index,-1);await press('Enter');assert.equal(dbg().screen,'title');
  await choose('new');assert.equal(dbg().choice.index,-1);
  const expected=[['classicLite','Chasing Rainbows Lite','More Complex'],['raceFull','Rainbow Race Full','Less Complex'],['race','Rainbow Race Lite','Least Complex'],['house','House Rules','Custom game'],['classic','Chasing Rainbows Full','Most Complex']];
  for(const [mode,title,complexity]of expected){await choose('mode');assert.equal(dbg().choice.id,'mode');assert.match(doc.getElementById('menu').textContent,new RegExp(title));assert.match(doc.getElementById('menu').textContent,new RegExp(complexity));assert.equal(JSON.parse(w.localStorage.getItem('chasingrainbows_settings')).setup.mode,mode);}
 });
 for(const mode of ['classic','classicLite','raceFull','race'])await check(mode+': win through switch with a card left',saved(mode,[...C.COLORS,'red'],mode==='race'?{}:{core:true}),false,async({doc,dbg,wait,choose,w})=>{
  await choose('continue');await wait(()=>dbg().ids.includes('combo:rainbow'),'combo menu');
  assert.equal(doc.getElementById('pileDiscard').hidden,mode==='raceFull'||mode==='race');
  await choose('combo:rainbow');await wait(()=>dbg().screen==='results','results');
  assert.match(doc.querySelector('.board').textContent,/1 left/);assert.equal(w.localStorage.getItem('chasingrainbows_save'),null);
 });
 await check('Race: pass row Back, confirmation, forced passes, save/resume, private handoff',saved('raceFull',Array(10).fill('red'),{},3),false,async({w,doc,dbg,wait,press,choose,spoken})=>{
  await choose('continue');await wait(()=>dbg().ids.includes('pass'),'pass row');
  await choose('pass');assert.equal(dbg().choice.depth,1);await choose('narbe:row-back');assert.equal(dbg().choice.id,'pass');assert.equal(dbg().choice.depth,0);
  await choose('pass');while(dbg().choice.id!=='pass:red')await press('Space');assert.equal(dbg().choice.id,'pass:red');assert.ok(doc.querySelector('.hcard.focused'),'chosen pass card highlighted');
  await choose('pass:red');assert.ok(dbg().ids.includes('confirm:pass:red'));await choose('narbe:row-back');assert.equal(dbg().phase,'play');
  await choose('pass:red');await choose('confirm:pass:red');await wait(()=>dbg().phase==='pass'&&!dbg().busy,'forced pass');
  var st=JSON.parse(w.localStorage.getItem('chasingrainbows_save'));assert.equal(st.state.players[0].hand.length,9);assert.equal(st.state.players[1].hand.length,8);assert.equal(st.state.discard.length,0);
  await choose('pause');await choose('settings');await choose('back');await choose('menu');await choose('continue');await wait(()=>dbg().screen==='cover','resume privacy cover');await choose('ready');await wait(()=>dbg().ids.includes('pass:red')&&!dbg().waiting,'resumed forced pass');
  for(let i=0;i<2;i++){await choose('pass:red');await choose('confirm:pass:red');await sleep(200);}
  await wait(()=>dbg().screen==='cover','handoff');assert.match(doc.getElementById('cardTitle').textContent,/Player 2/);
  st=JSON.parse(w.localStorage.getItem('chasingrainbows_save'));assert.equal(st.state.players[0].hand.length,7);assert.equal(st.state.players[1].hand.length,10);
  assert.match(st.meta.inbox[1].join(' '),/left gives you Red/);
  await choose('ready');await wait(()=>dbg().ids.includes('draw'),'recipient draw');await wait(()=>spoken.some(s=>s.includes('While you waited:')&&s.includes('Red')),'received-card speech');
  assert.ok(!dbg().ids.some(id=>id==='take'||id.startsWith('steal:')));
  await choose('draw');await wait(()=>dbg().ids.includes('pass'),'recipient pass row');assert.match(doc.getElementById('choices').textContent,/Player 3/);
 });
 await check('Auto Scan: passing row loops through Back and restores parent',saved('race',['red','blue']),true,async({dbg,wait,choose})=>{
  await choose('continue');await wait(()=>dbg().ids.includes('pass'),'pass root');await choose('pass');await choose('narbe:row-back');assert.equal(dbg().choice.id,'pass');assert.equal(dbg().choice.depth,0);
 });
 const legacy=saved('race',['red','blue'],{rainbow:true});legacy.state.v=1;legacy.state.rules.draw='player';delete legacy.state.rules.emptyHand;
 await check('old save: original-rule notice and original draw choices',legacy,false,async({dbg,choose,wait,spoken})=>{await choose('continue');await wait(()=>dbg().ids.includes('discard'),'legacy menu');await wait(()=>spoken.some(s=>s.includes('original rules')),'legacy notice');assert.equal(dbg().phase,'play');});
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
