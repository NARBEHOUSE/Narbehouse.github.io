const {chromium,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://companion.test/**',async route=>{
    const file=new URL(route.request().url()).pathname.slice(1);
    if(!['options.html','options.css','options.mjs','policy.mjs','player-registration.mjs'].includes(file))return route.abort();
    await route.fulfill({body:await fs.readFile(path.join('extension',file)),contentType:file.endsWith('html')?'text/html':file.endsWith('css')?'text/css':'application/javascript'});
  });
  await page.addInitScript(()=>{
    const event=()=>{const listeners=[];return {addListener:fn=>listeners.push(fn),emit:()=>listeners.forEach(fn=>fn())};};
    const added=event(),removed=event(),changed=event();let origins=JSON.parse(localStorage.getItem('origins')||'[]'),data=JSON.parse(localStorage.getItem('data')||'{}');
    const persist=()=>{localStorage.setItem('origins',JSON.stringify(origins));localStorage.setItem('data',JSON.stringify(data));};
    window.approve=true;window.requests=[];
    window.chrome={runtime:{getManifest:()=>({version:'0.1.6'})},permissions:{
      onAdded:added,onRemoved:removed,getAll:async()=>({origins}),contains:async p=>p.origins.every(o=>origins.includes(o)),
      request:async p=>{requests.push({origins:p.origins,gesture:navigator.userActivation.isActive});if(!approve)return false;origins=[...new Set([...origins,...p.origins])];persist();added.emit();return true;},
      remove:async p=>{origins=origins.filter(o=>!p.origins.includes(o));persist();removed.emit();return true;}
    },storage:{onChanged:changed,session:{setAccessLevel:async()=>{}},local:{setAccessLevel:async()=>{},get:async keys=>Object.fromEntries([].concat(keys).map(k=>[k,data[k]])),set:async obj=>{Object.assign(data,obj);persist();changed.emit();},remove:async key=>{delete data[key];persist();changed.emit();}}},scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async()=>{}}};
  });
  await page.goto('https://companion.test/options.html');await expect(page.locator('#enable-all')).toBeEnabled();await expect(page.getByRole('switch')).toHaveCount(11);
  await expect(page.locator('#source-count')).toHaveText('0 of 10 on');assert.equal(await page.locator('[role=switch][aria-checked=true]').count(),0);
  await page.evaluate(()=>approve=false);await page.getByRole('switch',{name:'YouTube',exact:true}).click();await expect(page.locator('#status')).toContainText('Permission was not granted');await expect(page.getByRole('switch',{name:'YouTube',exact:true})).toHaveAttribute('aria-checked','false');
  await page.evaluate(()=>approve=true);await page.locator('#enable-all').click();await expect(page.locator('[role=switch][aria-checked=true]')).toHaveCount(11);await expect(page.locator('#enable-all')).toBeDisabled();
  assert.equal(await page.evaluate(()=>requests.every(r=>r.gesture)),true);assert.equal(await page.evaluate(()=>requests.some(r=>r.origins.includes('https://calendar.google.com/*'))),false);
  await page.getByRole('switch',{name:'YouTube',exact:true}).click();await expect(page.getByRole('switch',{name:'YouTube',exact:true})).toHaveAttribute('aria-checked','false');await expect(page.locator('#source-count')).toHaveText('9 of 10 on');
  await page.reload();await expect(page.locator('#source-count')).toHaveText('9 of 10 on');await expect(page.getByRole('switch',{name:'YouTube',exact:true})).toHaveAttribute('aria-checked','false');
  await page.evaluate(()=>chrome.permissions.remove({origins:['https://www.netflix.com/*']}));await expect(page.getByRole('switch',{name:'Netflix',exact:true})).toHaveAttribute('aria-checked','false');
  await page.evaluate(()=>chrome.permissions.remove({origins:['https://feeds.npr.org/*']}));await expect(page.getByRole('switch',{name:'News',exact:true})).toHaveAttribute('aria-checked','false');
  await page.getByRole('switch',{name:'YouTube',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('switch',{name:'YouTube',exact:true})).toHaveAttribute('aria-checked','true');await page.keyboard.press('Space');await expect(page.getByRole('switch',{name:'Netflix',exact:true})).toBeFocused();
  await page.locator('.calendar-panel summary').click();await page.locator('#calendar').fill('https://calendar.google.com/calendar/ical/test/synthetic-fixture/basic.ics');await page.getByRole('button',{name:'Connect calendar',exact:true}).click();await expect(page.locator('#calendar-status')).toHaveText('Connected');await expect(page.locator('#calendar')).toHaveValue('');
  await page.locator('#clear-calendar').click();await expect(page.locator('#calendar-status')).toHaveText('Not connected');await page.locator('.calendar-panel summary').click();
  await page.screenshot({path:'artifacts/companion-settings-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/companion-settings-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('Settings checks passed: permission approval/denial, bulk enable, individual off, persistence, external revocation, keyboard toggles, calendar, and mobile layout.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>browser?.close());
