/* Real Chrome checks. Uses an isolated browser profile, never the user's saved settings. */
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = process.env.HUB_TEST_ORIGIN || 'http://127.0.0.1:4173';
const out = path.join(root, 'artifacts/graphics');
const basketballURL = base + '/bennyshub/apps/games/BENNYSBASKETBALLSHOOTER/index.html';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await fs.mkdir(out, {recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const report = { phase:'Basketball representative integration', checks:[], errors:[], pi:'PENDING: no Pi measurements', desktop:'Covered separately by native Electron suites' };
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080}});
    context.on('page', page => page.on('pageerror', e => report.errors.push({url:page.url(),error:e.message})));
    const hub = await context.newPage(); await hub.goto(base+'/bennyshub/index.html');
    const cancel=hub.locator('#modal-cancel'); if(await cancel.isVisible())await cancel.click();
    await hub.locator('.nav[data-target="settings"]').click();
    await hub.waitForFunction(()=>currentScreen==='settings'&&!isTransitioning);
    assert.equal(await hub.locator('#graphics-status').textContent(),'Auto');
    await hub.locator('#graphics-toggle').focus(); for(const mode of ['high','standard','low']){await hub.keyboard.press('Enter');await hub.waitForFunction(mode=>NarbeGraphics.getHub()===mode,mode);await hub.waitForTimeout(150);}
    await hub.waitForFunction(()=>NarbeGraphics.getHub()==='low');
    assert.equal(await hub.locator('#screen-settings').getAttribute('data-selected'),'graphics-toggle');
    await hub.screenshot({path:path.join(out,'hub-settings.png')});
    const page = await context.newPage(); await page.goto(basketballURL);
    await page.waitForFunction(()=>typeof renderer!=='undefined'&&window.classicChoice);
    await page.waitForTimeout(4200);
    const inspect = () => page.evaluate(()=>({state:graphics.get(),ratio:renderer.getPixelRatio(),width:renderer.domElement.width,height:renderer.domElement.height,
      antialias:renderer.getContext().getContextAttributes().antialias,shadows:renderer.shadowMap.enabled,composer:!!composer,
      quality,gameState,score,shotsTaken,memory:{...renderer.info.memory}}));
    let state=await inspect(); assert.equal(state.state.quality,'low');assert.equal(state.antialias,false);
    assert.equal(state.shadows,false);assert.equal(state.composer,false);assert.ok(state.width*state.height<=1280*720);
    await page.screenshot({path:path.join(out,'basketball-low.png')});
    report.checks.push({name:'Hub switch control and first-launch inheritance',state});
    await page.locator('#main-menu-list [data-action="settings"]').click();
    const setting=page.locator('#settings-menu-list [data-action="cycle_graphics"]');
    await setting.hover();await page.waitForTimeout(100);await page.keyboard.press('Enter');
    assert.equal((await inspect()).state.choice,'auto');
    await page.keyboard.press('Enter');await page.waitForTimeout(150);assert.equal((await inspect()).state.choice,'high');
    assert.equal(await page.evaluate(()=>classicChoice.getState().id),'cycle_graphics');
    assert.equal((await inspect()).state.pendingLaunch,true);
    await hub.locator('#graphics-toggle').click();await page.waitForTimeout(150);
    assert.equal((await inspect()).state.quality,'high');
    await page.evaluate(()=>graphics.setChoice('hub'));
    await hub.evaluate(()=>NarbeGraphics.setHub('low'));
    await page.waitForFunction(()=>graphics.isLightweight());
    await page.reload();await page.waitForFunction(()=>window.classicChoice);assert.equal((await inspect()).state.choice,'hub');
    await page.setViewportSize({width:2560,height:1440});await page.waitForTimeout(100);
    state=await inspect();assert.ok(state.width*state.height<=1280*720);assert.ok(Math.abs(state.width/state.height-2560/1440)<.005);
    await page.setViewportSize({width:1920,height:1080});
    report.checks.push({name:'Override, reset, stable selection, reload, resize',passed:true});
    await page.locator('#main-menu-list [data-action="start"]').click();
    await page.waitForTimeout(200);
    console.log('Basketball gameplay surface:',await page.evaluate(()=>({gameState,items:classicChoice.getItems()})));
    const take=page.locator('[data-action="take_shot"]:visible');
    if(await take.count())await take.click();
    await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');await page.waitForTimeout(120);
    await page.keyboard.down('Enter');await page.waitForTimeout(450);await page.keyboard.up('Enter');
    await page.waitForFunction(()=>shotsTaken>=1,{},{timeout:15000});
    state=await inspect();assert.ok(state.shotsTaken>=1,'a real shot must resolve');
    const before=await page.evaluate(()=>({score,shotsTaken,gameState}));
    await page.evaluate(()=>{window.__graphicsRenderer=renderer;graphics.setChoice('standard');});await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(()=>({score,shotsTaken,gameState})),before);
    assert.equal(await page.evaluate(()=>renderer===window.__graphicsRenderer),true);
    await page.evaluate(()=>graphics.setChoice('low'));await page.waitForTimeout(100);
    const memory=[];
    for(let i=0;i<8;i++){await page.evaluate(()=>graphics.setChoice('standard'));await page.waitForTimeout(80);await page.evaluate(()=>graphics.setChoice('low'));await page.waitForTimeout(80);memory.push((await inspect()).memory);}
    assert.ok(memory.at(-1).textures<=memory[1].textures+1,'textures must stabilize after repeated changes');
    assert.ok(memory.at(-1).geometries<=memory[1].geometries+1,'geometries must stabilize after repeated changes');
    report.checks.push({name:'Live shot, gameplay state preservation and repeated-switch resources',memory});
    await page.locator('#ready-menu-list [data-action="pause"]').click();await page.locator('#pause-menu-list [data-action="settings"]').click();
    assert.equal(await setting.isVisible(),true);await page.locator('#settings-menu-list [data-action="back"]').click();
    await page.locator('#pause-menu-list [data-action="resume"]').click();
    report.checks.push({name:'Pause settings and resume',passed:true});
    await page.evaluate(()=>{graphics.setChoice('auto');const original=graphics.frame;window.__graphicsFrames=0;graphics.frame=(...args)=>{window.__graphicsFrames++;return original(...args);};});
    await page.waitForFunction(()=>window.__graphicsFrames>=12);
    await page.evaluate(()=>{const start=performance.now()+2000;graphics.frame(start);for(let n=1;n<240;n++)graphics.frame(start+n*40);});
    state=await inspect();assert.equal(state.state.mode,'auto');assert.equal(state.state.quality,'low');assert.equal(state.shadows,false);assert.ok(state.width*state.height<=921600);
    report.checks.push({name:'Auto receives real frames and applies Low after sustained synthetic slow frames',state});
    await context.close();
    for(const legacy of ['auto','high','low']){
      const c=await browser.newContext({viewport:{width:1920,height:1080}});
      await c.addInitScript(value=>{localStorage.setItem('bennys_ball_settings',JSON.stringify({graphics:value}));localStorage.setItem('bennys_ball_autoq','low');},legacy);
      const p=await c.newPage();p.on('pageerror',e=>report.errors.push({legacy,error:e.message}));await p.goto(basketballURL);await p.waitForFunction(()=>window.classicChoice);
      const actual=await p.evaluate(()=>({state:graphics.get(),quality,shadows:renderer.shadowMap.enabled}));
      assert.equal(actual.quality,legacy==='low'?'lightweight':legacy==='high'?'high':'low');assert.equal(actual.shadows,legacy!=='low');
      assert.equal(actual.state.choice,legacy==='auto'?'hub':legacy);
      if(legacy==='high')await p.screenshot({path:path.join(out,'basketball-standard.png')});
      report.checks.push({name:'Legacy '+legacy,actual});await c.close();
    }
    assert.deepEqual(report.errors,[]);
    report.passed=true;
  } catch(error) {report.passed=false;report.failure=error.stack;throw error;}
  finally{await fs.writeFile(path.join(out,'basketball-report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
