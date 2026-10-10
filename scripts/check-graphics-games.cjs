'use strict';
// Real-browser settings, renderer, persistence and layout checks. Run alongside
// check-graphics.cjs and the existing deep gameplay suites; this is not a Pi benchmark.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/graphics');
const games=[['BENNYSBALLISTA','ballista'],['BENNYSRACETRACKS','racetracks'],['BENNYSFISHMYSTERY','fishmystery'],['NARBEMINIGOLF','minigolf'],['NARBEKART','racer'],['BENNYSPEGGLE','p3gl'],['BENNYSBOWLING','bowling'],['BENNYSDICE','dice'],['ROBOTFOOTBALL','robotfootball'],['NARBEPICKLEBALL','pickleball'],['NARBEANIMALFRIENDS','animalfriends'],['BENNYSBASEBALL2','baseball']].filter(g=>!process.argv[2]||process.argv.slice(2).includes(g[1]));
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});const reports=process.argv[2]?await fs.readFile(path.join(out,'games-report.json'),'utf8').then(JSON.parse).then(rows=>rows.filter(row=>!games.some(g=>g[1]===row.id))).catch(()=>[]):[];
try{for(const [folder,id] of games){const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage(),errors=[],checks=[];let failure;
page.on('pageerror',e=>errors.push(e.message));
const quality=()=>page.evaluate(id=>NarbeGraphics.openGame(id).get(),id);
const settle=()=>page.waitForTimeout(250);
const render=()=>page.evaluate(()=>[...document.querySelectorAll('canvas')].filter(c=>c.clientWidth>200&&c.clientHeight>150).map(c=>{const gl=c.getContext('webgl2')||c.getContext('webgl');return {width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,antialias:gl?.getContextAttributes()?.antialias};}));
const scan=()=>page.evaluate(()=>{if(window.RT?.ui?.__test?.choiceState){const s=RT.ui.__test.choiceState();return {index:s.index,context:s.context,id:s.id};}const d=document.querySelector('[data-choice-active="true"]')?.dataset;return d?{index:d.choiceIndex,context:d.choiceContext,id:d.choiceSelected}:null;});
const tap=async key=>{await page.keyboard.press(key);await page.waitForTimeout(160);};
async function settings(){if(id==='baseball'){await page.waitForFunction(()=>window.__baseball2Game?.scene.isActive('TitleScene'));for(let i=0;i<12&&await page.evaluate(()=>window.__baseball2Game.scene.getScene('TitleScene').menu._choice.adapter.getState().id)!=='settings:0';i++)await tap('Space');await tap('Enter');await page.waitForFunction(()=>window.__baseball2Game.scene.isActive('SettingsScene'));return;}
if(id==='pickleball'){await page.locator('#action-settings').click();await settle();return;}
if(id==='fishmystery'){await page.locator('.menuItem').filter({hasText:'Settings'}).click();await settle();return;}
let el=page.getByText(/^(?:⚙️?\s*)?settings$/i).filter({visible:true}).first();await el.click();
if(id==='p3gl')await page.getByText('Display & Sound',{exact:true}).click();
await page.getByText(/^Graphics quality/).filter({visible:true}).first().waitFor();await page.waitForTimeout(450);}
const graphicsRow=()=>page.getByText(/^Graphics quality/).filter({visible:true}).first();
async function activateGraphics(){if(id==='baseball'){for(let i=0;i<12&&await page.evaluate(()=>window.__baseball2Game.scene.getScene('SettingsScene').menu._choice.adapter.getState().id)!=='graphics-quality:0';i++)await tap('Space');await tap('Enter');}else await graphicsRow().click();await settle();}
try{
await page.goto('http://127.0.0.1:4173/bennyshub/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>NarbeGraphics.setHub('low'));
await page.goto('http://127.0.0.1:4173/bennyshub/apps/games/'+folder+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(id=>window.NarbeGraphics?.openGame(id).get().quality==='low',id);await page.waitForTimeout(1800);
assert.equal((await quality()).choice,'hub');const initial=await render();assert.ok(initial.length);if(id!=='baseball')for(const r of initial)assert.ok(r.width*r.height<=921600,r.width+'x'+r.height);assert.ok(initial.every(r=>r.antialias===false));checks.push({name:'Low inherited before renderer setup',render:initial});
await settings();await page.screenshot({path:path.join(out,id+'-settings-low.png')});await activateGraphics();assert.equal((await quality()).choice,'auto');
const selected=await scan();for(const mode of ['high','standard','low']){await tap('Enter');assert.equal((await quality()).choice,mode);}assert.deepEqual(await scan(),selected);checks.push({name:'Graphics choice works with native Enter and retains scan context',selected});
const hubPage=await context.newPage();await hubPage.goto('http://127.0.0.1:4173/bennyshub/',{waitUntil:'domcontentloaded'});await hubPage.evaluate(()=>NarbeGraphics.setHub('standard'));await settle();assert.equal((await quality()).quality,'low');await tap('Enter');assert.equal((await quality()).choice,'hub');assert.equal((await quality()).quality,'standard');await hubPage.evaluate(()=>NarbeGraphics.setHub('low'));await settle();assert.equal((await quality()).quality,'low');checks.push({name:'Live cross-page Hub updates, override and reset'});
await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(1200);assert.equal((await quality()).choice,'hub');assert.equal((await quality()).quality,'low');
await settings();await activateGraphics();assert.equal((await quality()).choice,'auto');await tap('Enter');await tap('Enter');assert.equal((await quality()).choice,'standard');await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(1200);assert.equal((await quality()).choice,'standard');assert.equal((await quality()).quality,'standard');assert.equal((await quality()).pendingLaunch,false);const standard=await render();await page.screenshot({path:path.join(out,id+'-standard.png')});checks.push({name:'Override persists across reload; Standard launch',render:standard});
const ready=async()=>{await page.waitForFunction(()=>window.NarbeGraphics);await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].some(c=>c.width>200&&(c.getContext('webgl2')||c.getContext('webgl'))));await page.waitForTimeout(300);};

await page.evaluate(async id=>{NarbeGraphics.openGame(id).setChoice('high');},id);await page.reload();await ready(id);const high=await render();assert.ok(high.every(r=>r.antialias===(id!=='p3gl')));assert.equal(await page.evaluate(id=>NarbeGraphics.openGame(id).get().quality,id),'high');checks.push({name:'High fresh renderer and fixed preference',render:high});
await page.evaluate(async id=>{NarbeGraphics.openGame(id).setChoice('auto');},id);await page.reload();await ready(id);assert.ok((await render()).every(r=>r.antialias===false));
await page.evaluate(id=>{const g=NarbeGraphics.openGame(id),original=g.frame;window.__graphicsFrames=0;g.frame=(...args)=>{window.__graphicsFrames++;return original(...args);};},id);await page.waitForFunction(()=>window.__graphicsFrames>=12);
await page.evaluate(id=>{const g=NarbeGraphics.openGame(id),start=performance.now()+2000;g.frame(start);for(let n=1;n<240;n++)g.frame(start+n*40);},id);
assert.equal(await page.evaluate(id=>NarbeGraphics.openGame(id).get().mode,id),'auto');assert.equal(await page.evaluate(id=>NarbeGraphics.openGame(id).get().quality,id),'low');assert.equal(await page.evaluate(id=>NarbeGraphics.openGame(id).get().pendingLaunch,id),false);if(id!=='baseball')assert.ok((await render()).every(r=>r.width*r.height<=921600));checks.push({name:'Auto receives real render frames; sustained synthetic slow frames apply Low immediately'});

await page.evaluate(id=>NarbeGraphics.openGame(id).setChoice('low'),id);await page.setViewportSize({width:2560,height:1440});await settle();if(id!=='baseball')for(const r of await render())assert.ok(r.width*r.height<=921600,'Large resize '+JSON.stringify(r));
await page.setViewportSize({width:390,height:844});await settings();await page.evaluate(id=>NarbeGraphics.openGame(id).setChoice('hub'),id);await settle();if(id!=='baseball'){const row=graphicsRow();await row.scrollIntoViewIfNeeded();const b=await row.boundingBox();assert.ok(b&&b.x>=-1&&b.x+b.width<=391,'Settings fits narrow screen '+JSON.stringify(b));
const overflow=await row.evaluate(el=>{const host=el.closest('button,.menuItem,.menu-item,.nkItem,.mi,.choice')||el,r=host.getBoundingClientRect(),walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),bad=[];while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const b of range.getClientRects())if(b.left<r.left-2||b.right>r.right+2)bad.push(node.textContent);}return bad;});assert.deepEqual(overflow,[],'Graphics text stays inside its choice');}
await page.screenshot({path:path.join(out,id+'-settings-mobile.png')});checks.push({name:'Large and narrow resizing preserves caps and accessible settings'});
await page.goto('http://127.0.0.1:4173/bennyshub/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.NarbeGraphics);assert.equal(await page.evaluate(()=>NarbeGraphics.getHub()),'low');checks.push({name:'Hub reload preserves installation preference'});assert.deepEqual(errors,[]);
}catch(e){failure=e.stack;await page.screenshot({path:path.join(out,id+'-failure.png')}).catch(()=>{});}
reports.push({id,folder,status:failure?'failed':'passed',checks,errors,failure});console.log(id+': '+reports.at(-1).status+(failure?' '+failure.split('\n')[0]:''));await fs.writeFile(path.join(out,'games-report.json'),JSON.stringify(reports,null,2));await context.close();}
}finally{await browser.close();}if(reports.some(r=>r.failure))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
