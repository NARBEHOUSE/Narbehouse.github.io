// WEB-ONLY: Companion settings UI; controlled Chrome permissions/storage, real browser DOM and keyboard.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.env.HUB_TEST_ARTIFACTS||'artifacts/companion-master-access');
const runtimeFiles=['options.html','options.css','options.mjs','policy.mjs','player-registration.mjs'];
const report={createdAt:new Date().toISOString(),scope:'WEB-ONLY',electronPort:'WEB-ONLY',fixture:'Actual options HTML/CSS/modules in headless Edge; controlled chrome permissions/storage APIs. Native browser approval prompts are not exercised.',checks:[],errors:[],screenshots:[]};
let browser,page;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function check(name,fn){try{await fn();report.checks.push({name,passed:true});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,error:error.stack});throw error;}}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const {SERVICES,NEWS_ORIGINS}=await import(pathToFileURL(path.join(root,'extension/policy.mjs')).href);
  const streams=Object.values(SERVICES).flatMap(s=>s.hosts.map(h=>'https://'+h+'/*'));
  const all=[...streams,...NEWS_ORIGINS],calendar='https://calendar.google.com/*',local='http://localhost/*';
  const privateUrl='https://calendar.google.com/calendar/ical/test/synthetic-fixture/basic.ics';
  report.runtime=await Promise.all(runtimeFiles.map(async name=>{const bytes=await fs.readFile(path.join(root,'extension',name));return {path:'extension/'+name,bytes:bytes.length,sha256:hash(bytes)};}));
  const edge=process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser=await chromium.launch({headless:true,executablePath:edge});
  page=await browser.newPage({viewport:{width:1280,height:1100}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('https://companion.test/**',async route=>{
    const file=new URL(route.request().url()).pathname.slice(1);
    if(!runtimeFiles.includes(file))return route.abort();
    await route.fulfill({body:await fs.readFile(path.join(root,'extension',file)),contentType:file.endsWith('html')?'text/html':file.endsWith('css')?'text/css':'application/javascript'});
  });
  await page.addInitScript(()=>{
    const event=()=>{const listeners=[];return {addListener:fn=>listeners.push(fn),emit:(...args)=>listeners.forEach(fn=>fn(...args))};};
    const added=event(),removed=event(),changed=event();
    let origins=JSON.parse(localStorage.getItem('origins')||'[]'),data=JSON.parse(localStorage.getItem('data')||'{}'),pending=null,registered=[];
    const requests=[],removals=[],messages=[];
    let behavior={};
    const defaults=()=>({requestResult:true,grantSubset:null,requestError:null,removeResult:true,removeError:null,removeSubset:null,defer:false});
    behavior=defaults();
    const persist=()=>{localStorage.setItem('origins',JSON.stringify(origins));localStorage.setItem('data',JSON.stringify(data));};
    const snapshot=()=>({origins:[...origins],data:{...data},requests:structuredClone(requests),removals:structuredClone(removals),messages:structuredClone(messages),registered:structuredClone(registered),pending:!!pending});
    window.__permissions={
      snapshot,configure:options=>{behavior={...defaults(),...options};},
      replace:state=>{if(state.origins)origins=[...state.origins];if(state.data)data={...state.data};persist();removed.emit({origins:[...origins]});changed.emit({},'local');},
      release:()=>{pending?.();pending=null;}
    };
    window.chrome={
      runtime:{getManifest:()=>({version:'1.0.6'}),sendMessage:async message=>{messages.push(message);return {ok:true};}},
      tabs:{getCurrent:async()=>({id:73})},
      permissions:{
        onAdded:added,onRemoved:removed,getAll:async()=>({origins:[...origins]}),contains:async value=>value.origins.every(o=>origins.includes(o)),
        request:async value=>{
          requests.push({origins:[...value.origins],gesture:navigator.userActivation.isActive});
          const operation={...behavior};
          if(operation.defer)await new Promise(resolve=>{pending=resolve;});
          if(operation.requestError)throw Error(operation.requestError);
          if(!operation.requestResult)return false;
          const approved=operation.grantSubset===null?value.origins:value.origins.filter(o=>operation.grantSubset.includes(o));
          origins=[...new Set([...origins,...approved])];persist();added.emit({origins:approved});return true;
        },
        remove:async value=>{
          removals.push({origins:[...value.origins]});
          if(behavior.removeError)throw Error(behavior.removeError);
          if(!behavior.removeResult)return false;
          const remove=behavior.removeSubset===null?value.origins:value.origins.filter(o=>behavior.removeSubset.includes(o));
          origins=origins.filter(o=>!remove.includes(o));persist();removed.emit({origins:remove});return true;
        }
      },
      storage:{onChanged:changed,session:{setAccessLevel:async()=>{}},local:{
        setAccessLevel:async()=>{},get:async keys=>keys==null?{...data}:Object.fromEntries([].concat(keys).map(k=>[k,data[k]])),
        set:async obj=>{const changes={};for(const [key,value]of Object.entries(obj)){changes[key]={oldValue:data[key],newValue:value};data[key]=value;}persist();changed.emit(changes,'local');},
        remove:async keys=>{for(const key of [].concat(keys))delete data[key];persist();changed.emit({},'local');}
      }},
      scripting:{unregisterContentScripts:async()=>{registered=[];},registerContentScripts:async scripts=>{registered=structuredClone(scripts);}}
    };
  });
  await page.goto('https://companion.test/options.html');
  const toggle=page.getByRole('switch',{name:'Streaming and news',exact:true});
  const state=page.locator('#access-state'),status=page.locator('#status');
  const snap=()=>page.evaluate(()=>__permissions.snapshot());
  const configure=value=>page.evaluate(value=>__permissions.configure(value),value);
  const seed=value=>page.evaluate(value=>__permissions.replace(value),value);
  async function ready(label){await expect(toggle).toBeEnabled();await expect(toggle.locator('.toggle-state')).toHaveText(label);await expect(toggle).toHaveAttribute('aria-checked',String(label!=='Off'));}
  async function activate(label){await toggle.click();await ready(label);await expect(toggle).toBeFocused();}
  async function screenshot(name){await page.screenshot({path:path.join(out,name),fullPage:true});report.screenshots.push(name);}
  await check('One switch with ten noninteractive supported-service labels',async()=>{
    await ready('Off');await expect(page.getByRole('switch')).toHaveCount(1);
    assert.deepEqual(await page.locator('#services > li').allTextContents(),Object.values(SERVICES).map(s=>s.label));
    await expect(page.locator('#services button,#services a,#services input')).toHaveCount(0);
    await expect(page.locator('#services')).not.toContainText('Apple TV');
    await expect(page.locator('body')).toContainText('NPR, BBC and Google News');
    assert.equal((await snap()).requests.length,0);
  });
  await check('Denied approval preserves Off and stored values',async()=>{
    await seed({origins:[],data:{newsEnabled:false,playerToolbarSpeechEnabled:false,unrelated:'keep'}});
    await configure({requestResult:false});await activate('Off');
    await expect(status).toContainText('Permission was not granted');
    assert.deepEqual((await snap()).data,{newsEnabled:false,playerToolbarSpeechEnabled:false,unrelated:'keep'});
    assert.deepEqual((await snap()).origins,[]);
  });
  await check('One user-gesture approval enables all streaming and news, excluding Calendar',async()=>{
    await configure({});const before=(await snap()).requests.length;await activate('On');
    const result=await snap(),request=result.requests.at(-1);
    assert.equal(result.requests.length,before+1);assert.equal(request.gesture,true);
    assert.deepEqual([...request.origins].sort(),[...all].sort());assert.equal(request.origins.includes(calendar),false);
    assert.equal(result.data.newsEnabled,true);
    assert.deepEqual(result.registered[0].matches.sort(),[...streams].sort());
    await expect(state).toContainText('All streaming services and news are on');
    await screenshot('all-on-desktop.png');
  });
  await check('Disable removes only grouped origins and news, preserving Calendar and local preferences',async()=>{
    await seed({origins:[...all,calendar,local],data:{newsEnabled:true,calendarUrl:privateUrl,playerToolbarSpeechEnabled:false,unrelated:'keep'}});
    await ready('On');const before=(await snap()).removals.length;await activate('Off');
    const result=await snap();assert.equal(result.removals.length,before+1);
    assert.deepEqual([...result.removals.at(-1).origins].sort(),[...all].sort());
    assert.deepEqual(result.origins.sort(),[calendar,local].sort());
    assert.equal(result.data.newsEnabled,false);assert.equal(result.data.calendarUrl,privateUrl);
    assert.equal(result.data.playerToolbarSpeechEnabled,false);assert.equal(result.data.unrelated,'keep');
    assert.deepEqual(result.registered[0].matches,[local]);await expect(page.locator('#calendar-status')).toHaveText('Connected');
    await page.reload();await ready('Off');await expect(page.locator('#calendar-status')).toHaveText('Connected');
  });
  await check('Partial access can turn Off directly, then enable all with one request, preserving Calendar',async()=>{
    await seed({origins:[streams[0],calendar],data:{newsEnabled:true,calendarUrl:privateUrl}});await ready('Incomplete');
    await expect(state).toContainText('Only some streaming and news access is enabled');
    const before=(await snap()).requests.length;await activate('Off');
    assert.equal((await snap()).requests.length,before);assert.deepEqual((await snap()).origins,[calendar]);
    await activate('On');const result=await snap();
    assert.equal(result.requests.length,before+1);assert.equal(result.requests.at(-1).origins.includes(calendar),false);
    assert.equal(result.origins.includes(calendar),true);assert.equal(result.data.calendarUrl,privateUrl);
  });
  await check('A successful API result with partial actual grants never reports all enabled',async()=>{
    await seed({origins:[calendar],data:{newsEnabled:false,calendarUrl:privateUrl}});
    await configure({grantSubset:[streams[0]]});await activate('Incomplete');
    await expect(status).not.toContainText('All streaming services and news are on');
    await expect(state).toContainText('Only some streaming and news access is enabled');assert.equal((await snap()).origins.includes(calendar),true);
    await configure({});await activate('Off');await activate('On');
  });
  await check('Rejected and failed removal retain On and news preference',async()=>{
    for(const behavior of [{removeResult:false},{removeError:'Synthetic removal failure'}]){
      await configure(behavior);await activate('On');
      const result=await snap();assert.equal(result.data.newsEnabled,true);assert.equal(all.every(o=>result.origins.includes(o)),true);
      await expect(status).toHaveAttribute('data-error','true');
    }
    await configure({});
  });
  await check('Partial actual removal never reports all access turned off',async()=>{
    await configure({removeSubset:[streams[0]]});await activate('Incomplete');
    await expect(status).not.toHaveText('Streaming and news are off.');
    await expect(status).toHaveAttribute('data-error','true');assert.equal((await snap()).data.newsEnabled,false);
    assert.equal((await snap()).origins.includes(streams[1]),true);await configure({});
  });
  await check('A failed request preserves Off, Calendar and the stored news choice',async()=>{
    await seed({origins:[calendar],data:{newsEnabled:false,calendarUrl:privateUrl}});await ready('Off');
    await configure({requestError:'Synthetic request failure'});await activate('Off');
    await expect(status).toContainText('Synthetic request failure');
    assert.equal((await snap()).data.newsEnabled,false);assert.deepEqual((await snap()).origins,[calendar]);
    await configure({});
  });
  await check('External host revocation and local news changes update the switch accurately',async()=>{
    await seed({origins:[...all,calendar],data:{newsEnabled:true,calendarUrl:privateUrl}});await ready('On');
    await seed({origins:[...all.filter(o=>o!==NEWS_ORIGINS[0]),calendar]});await ready('Incomplete');
    await expect(status).not.toContainText('All streaming services and news are on');
    await seed({origins:[...all,calendar],data:{newsEnabled:false,calendarUrl:privateUrl}});await ready('Incomplete');
    await activate('Off');await activate('On');assert.equal((await snap()).data.newsEnabled,true);
    await seed({origins:[calendar],data:{newsEnabled:true,calendarUrl:privateUrl}});await ready('Off');
    await page.reload();await ready('Off');
  });
  await check('Calendar separately connects and removes while grouped access remains unchanged',async()=>{
    await seed({origins:[],data:{newsEnabled:false}});await ready('Off');
    await page.locator('.calendar-panel summary').click();
    await page.locator('#calendar').fill('https://example.test/private.ics');const before=(await snap()).requests.length;
    await page.getByRole('button',{name:'Connect calendar',exact:true}).click();await expect(status).toContainText('Google Calendar');
    assert.equal((await snap()).requests.length,before);
    await page.locator('#calendar').fill(privateUrl);await page.getByRole('button',{name:'Connect calendar',exact:true}).click();
    await expect(page.locator('#calendar-status')).toHaveText('Connected');await expect(page.locator('#calendar')).toHaveValue('');
    assert.deepEqual((await snap()).requests.at(-1).origins,[calendar]);await ready('Off');
    await activate('On');await expect(page.locator('#calendar-status')).toHaveText('Connected');
    await page.locator('#clear-calendar').click();await expect(page.locator('#calendar-status')).toHaveText('Not connected');
    await ready('On');assert.equal((await snap()).origins.includes(calendar),false);
    assert.equal((await snap()).data.newsEnabled,true);await page.locator('.calendar-panel summary').click();
  });
  await check('Pending access operation disables controls and issues one request',async()=>{
    await seed({origins:[],data:{newsEnabled:false}});await ready('Off');
    await configure({defer:true});const before=(await snap()).requests.length;
    await toggle.click();await expect(toggle).toBeDisabled();await expect(page.locator('#return-hub')).toBeDisabled();
    assert.equal((await snap()).requests.length,before+1);assert.equal((await snap()).pending,true);
    await page.evaluate(()=>__permissions.release());await ready('On');await expect(toggle).toBeFocused();
    assert.equal((await snap()).requests.length,before+1);await configure({});
  });
  await check('Enter toggles; Space and held Space move focus without changing access',async()=>{
    await toggle.focus();await page.keyboard.press('Enter');await ready('Off');await expect(toggle).toBeFocused();
    const before=(await snap()).requests.length;
    await page.keyboard.press('Space');await expect(page.locator('.calendar-panel summary')).toBeFocused();
    await page.keyboard.down('Space');await page.waitForTimeout(3050);await page.keyboard.up('Space');await expect(toggle).toBeFocused();
    assert.equal((await snap()).requests.length,before);
    await page.keyboard.press('Tab');await expect(page.locator('.calendar-panel summary')).toBeFocused();
    await page.keyboard.press('Shift+Tab');await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');await ready('On');assert.equal((await snap()).requests.at(-1).gesture,true);
  });
  await check('Desktop and narrow mobile show static labels without horizontal clipping',async()=>{
    await seed({origins:[streams[0]],data:{newsEnabled:true}});await ready('Incomplete');
    await expect(status).not.toContainText('All streaming services and news are on');
    await page.setViewportSize({width:390,height:844});await screenshot('incomplete-mobile.png');
    const geometry=await page.evaluate(()=>{
      const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};};
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,toggle:rect(document.querySelector('#companion-access')),services:[...document.querySelectorAll('#services li')].map(rect)};
    });
    assert.ok(geometry.scrollWidth<=geometry.width);
    for(const box of [geometry.toggle,...geometry.services])assert.ok(box.x>=0&&box.right<=geometry.width&&box.width>0&&box.height>0);
    report.mobileGeometry=geometry;
    await page.setViewportSize({width:1280,height:1100});await screenshot('incomplete-desktop.png');
  });
  await check('Back to Hub retains the existing trusted-settings message',async()=>{
    await page.locator('#return-hub').click();
    assert.deepEqual((await snap()).messages.at(-1),{protocol:1,action:'SETTINGS_RETURN',payload:{tabId:73}});
  });
  await check('Tested runtime matches final source and browser has no page errors',async()=>{
    assert.deepEqual(report.errors,[]);
    for(const row of report.runtime)assert.equal(hash(await fs.readFile(path.join(root,row.path))),row.sha256,'Runtime changed during test: '+row.path);
  });
  report.passed=true;
})().catch(error=>{report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  await browser?.close();await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,groups:report.checks.length,errors:report.errors,report:path.join(out,'browser-report.json')}));
});
