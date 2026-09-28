// Check actual scan/selection speech and paginated Settings at desktop/tablet/phone sizes.
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),url='http://127.0.0.1:4173/bennyshub/apps/tools/phraseboard/index.html';
const executablePath=process.env.PHRASEBOARD_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('https://**',r=>r.abort());await page.goto(url);await expect(page.getByRole('button',{name:'Narbe Words',exact:true})).toBeVisible();
  await page.evaluate(()=>{window.spoken=[];speak=text=>spoken.push(text);state.ttsOnScan=true;window.NarbeVoiceManager.getSettings=()=>({ttsEnabled:true});});
  for(const [width,height,rows,cols] of [[1440,1000,4,4],[1280,800,3,3],[1024,768,2,2],[768,1024,3,3],[390,844,4,4],[390,600,3,3]]){
   await page.setViewportSize({width,height});await page.evaluate(({rows,cols})=>{state.gridSize={rows,cols};el.mainGrid.style.setProperty('--grid-rows',rows);el.mainGrid.style.setProperty('--grid-cols',cols);openMenu('settings');},{rows,cols});
   const expectedColumns=width<760?2:cols,seen=new Set();let pages=0;
   do{
    const buttons=page.locator('#mainGrid > button');assert.ok(await buttons.count()<=rows*expectedColumns);
    const metrics=await buttons.evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,client:n.clientHeight,scroll:n.scrollHeight,text:buttonTextForTTS(n)})));
    assert.ok(metrics.every(n=>n.height>=100&&n.scroll<=n.client+1),JSON.stringify({width,rows,metrics}));
    assert.ok(Math.max(...metrics.map(n=>n.height))-Math.min(...metrics.map(n=>n.height))<2,JSON.stringify({width,rows,metrics}));
    for(const metric of metrics)if(!['Main Menu','Back','Next'].includes(metric.text))seen.add(metric.text.split(':')[0]);
    const cues=await page.evaluate(()=>{spoken=[];state.userScanPreference='cell';state.currentRow=-1;state.scanIndex=-1;for(let i=0;i<state.scannableRows.flat().length;i++)scanForward();return spoken;});
    assert.deepEqual(cues,metrics.map(n=>n.text));assert.ok(cues.every(s=>!/[🧠🔮💬🌗🗣🗑]/u.test(s)));
    const next=page.getByRole('button',{name:'Next',exact:true});pages++;if(!await next.count())break;await next.click();
   }while(await page.evaluate(()=>state.page)!==0&&pages<10);
   assert.equal(seen.size,12,JSON.stringify({width,rows,pages,seen:[...seen]}));assert.ok(pages<10);
   if(rows*expectedColumns<14)assert.ok(pages>1);
   await expect(page.getByRole('button',{name:'Main Menu',exact:true})).toBeVisible();
  }
  // In both scan modes, selecting the learning setting speaks only its label and keeps its page.
  for(const mode of ['cell','row']){
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>openMenu('settings'));
   while(!await page.getByRole('button',{name:/^Learn from spoken messages:/}).count())await page.getByRole('button',{name:'Next',exact:true}).click();
   const expected=await page.getByRole('button',{name:/^Learn from spoken messages:/}).innerText();const before=await page.evaluate(()=>state.page);
   await page.evaluate(mode=>{state.userScanPreference=mode;state.scanMode=mode==='cell'?'cell':'column';state.currentRow=state.scannableRows.findIndex(row=>row.some(n=>buttonTextForTTS(n).startsWith('Learn from spoken messages:')));state.scanIndex=state.scannableRows[state.currentRow].findIndex(n=>buttonTextForTTS(n).startsWith('Learn from spoken messages:'));spoken=[];highlightScanIndex();selectCurrent();},mode);
   await expect.poll(()=>page.evaluate(()=>spoken.length)).toBeGreaterThan(1);
   const label=expected.replace('🧠','').trim();assert.equal(await page.evaluate(()=>spoken[0]),label);await expect.poll(()=>page.evaluate(()=>spoken.at(-1))).toBe(label);assert.equal(await page.evaluate(()=>state.page),before);
   assert.equal(await page.getByRole('button',{name:/^Learn from spoken messages:/}).locator('.icon').getAttribute('aria-hidden'),'true');
  }
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{state.gridSize={rows:4,cols:4};el.mainGrid.style.setProperty('--grid-rows',4);el.mainGrid.style.setProperty('--grid-cols',4);renderSettingsMenu();});assert.equal(await page.evaluate(()=>state.page),0);
  await page.getByRole('button',{name:'Main Menu',exact:true}).click();await expect(page.locator('#mainGrid')).not.toHaveClass(/settings-active/);
  assert.deepEqual(errors,[]);await context.close();console.log('Settings checks passed: all options paginated, uniform readable buttons at six grid/device sizes, emoji-free scan/selection speech, page preservation, resize and exit.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
