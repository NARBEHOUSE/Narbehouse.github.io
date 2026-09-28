// Run npm start first. Uses a fresh browser profile; never touches personal boards.
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const PB=require('../bennyshub/apps/tools/phraseboard/board-core.js');
const root=path.resolve(__dirname,'..'),url='http://127.0.0.1:4173/bennyshub/apps/tools/phraseboard/';
const executablePath=process.env.PHRASEBOARD_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://www.opensymbols.org/**',route=>route.fulfill({contentType:'application/json',body:'[]'}));
    await page.goto(url+'index.html');await expect(page.locator('#mainGrid > button').filter({hasText:'Settings'})).toBeVisible();
    assert.equal(await page.evaluate(()=>state.sentenceMode),true);assert.equal(await page.evaluate(()=>state.currentMenu),'main');
    await expect(page.locator('.tour-panel')).toHaveCount(0);await expect(page.locator('.header-right').getByRole('button',{name:'Help',exact:true})).toHaveCount(0);
    await page.locator('#mainGrid > button').filter({hasText:'Settings'}).click();
    await expect(page.getByRole('button',{name:/Help|Replay tour|Volume Up|Volume Down/i})).toHaveCount(0);
    for(const label of ['Message display:','Predictions:','Learn from spoken messages:','Clear learned sentences','Spoken group names:','Dim other groups:'])await expect(page.locator('#mainGrid > button').filter({hasText:label}).locator('.icon')).toHaveCount(1);
    await page.locator('#mainGrid > button').filter({hasText:'Predictions:'}).click();assert.equal(await page.evaluate(()=>state.predictionsEnabled),false);
    await page.locator('#mainGrid > button').filter({hasText:'Predictions:'}).click();assert.equal(await page.evaluate(()=>state.predictionsEnabled),true);
    await page.reload();assert.equal(await page.evaluate(()=>state.sentenceMode),true);
    // Legacy settings remain unchanged and legacy saves remain usable.
    await page.evaluate(()=>{localStorage.setItem('phraseboard_settings',JSON.stringify({gridSize:{rows:3,cols:3},theme:'dark',userScanPreference:'cell',sentenceMode:false}));});
    await page.reload();assert.deepEqual(await page.evaluate(()=>({sentence:state.sentenceMode,theme:state.theme,scan:state.userScanPreference})),{sentence:false,theme:'dark',scan:'cell'});
    await page.evaluate(()=>{state.sentenceMode=true;state.theme='light';state.userScanPreference='row';state.ttsOnScan=false;state.speakGroups=false;saveSettings();});
    // Mixed layout fixture includes real shipped vocabulary, images, long text and media.
    const real=PB.parse(fs.readFileSync(path.join(root,'bennyshub/apps/tools/phraseboard/boards/NARBE_Default.csv'),'utf8'));
    const fixture=PB.normalize([
      {category:'Words',display:'I',speak:'I',group:'Start',groupOrder:2,scanOrder:2,x:0,y:0,categoryLayout:'free'},
      {category:'Words',display:'want music',speak:'want music',group:'Start',groupOrder:2,scanOrder:1,x:240,y:0,categoryLayout:'free'},
      {category:'Words',display:'Hello!',speak:'Hello!',immediate:true,group:'Quick',groupOrder:1,x:480,y:0,categoryLayout:'free'},
      {category:'Words',display:'I want music',speak:'I want music',group:'Start',groupOrder:2,x:0,y:160,categoryLayout:'free'},
      {category:'Words',display:'A longer phrase with enough detail to explain exactly what I would like to do today',speak:'Please give me time to finish my message.',group:'Details',groupOrder:3,x:240,y:160,width:460,height:220,categoryLayout:'free',image:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Ccircle cx="32" cy="32" r="25" fill="orange"/%3E%3C/svg%3E'},
      {category:'Words',display:'Music video',speak:'https://www.youtube.com/watch?v=aqz-KE-bpKQ',group:'Media',groupOrder:4,x:720,y:0,categoryLayout:'free'},
      ...real.slice(0,28).map((r,i)=>({...r,category:'Grid vocabulary',categoryLayout:'grid',tileOrder:i+1,image:''}))
    ].map(r=>({...r,boardName:'Release practice',boardLayout:'grid'})));
    await page.evaluate(csv=>{PhraseBoard.save(localStorage,PhraseBoard.parse(csv));},PB.csv(fixture));
    await page.goto(url+'index.html?saved=1&category=Words');await expect(page.locator('.free-stage')).toBeVisible();
    await page.evaluate(()=>{window.spoken=[];speak=text=>spoken.push(text);state.ttsOnScan=false;state.speakGroups=false;});
    // Two-switch selection follows group order, then tile order, regardless of screen position.
    const press=async key=>{await page.waitForTimeout(220);await page.keyboard.press(key,{delay:90});};
    await press('Space');await press('Space');await press('Space'); // Message, Navigation, Quick
    await expect(page.locator('.group-label.group-active')).toHaveText('Quick');
    await press('Enter');await expect(page.locator('.free-stage .scan-highlight')).toContainText('Hello!');
    await press('Enter');assert.equal(await page.evaluate(()=>messageText()),'');
    assert.ok((await page.evaluate(()=>spoken)).includes('Hello!'));
    await press('Space');await press('Enter');await expect(page.locator('.free-stage .scan-highlight')).toContainText('want music');
    // Explicit escape is reachable without speaking a tile.
    await page.locator('#backToGroups').click();assert.equal(await page.evaluate(()=>groupScanner.tile),-1);
    await page.locator('.free-stage button').filter({hasText:/^IStart$/}).click();
    await page.evaluate(()=>{state.predictionsEnabled=true;state.messageDisplay='tiles';renderMessage();});
    await expect(page.locator('#sentenceDisplay')).toHaveText('I');const wantSuggestion=page.locator('[data-prediction]').filter({hasText:/^want$/});await expect(wantSuggestion).toBeVisible();
    const before=await page.evaluate(()=>spoken.length);await wantSuggestion.click();
    assert.equal(await page.evaluate(()=>spoken.length),before);assert.equal(await page.evaluate(()=>messageText()),'I want');
    await page.locator('#sentenceDisplay').click();assert.equal(await page.evaluate(()=>spoken.at(-1)),'I want');
    await page.locator('#deleteWordBtn').click();assert.equal(await page.evaluate(()=>messageText()),'I');
    // One-switch auto scan advances without a second key and ignores held-key repeats.
    await page.evaluate(()=>{state.autoScan=true;state.scanSpeed=120;startAutoScan();});
    await page.waitForTimeout(180);await press('Enter');assert.ok(await page.evaluate(()=>groupScanner.tile>=0));
    await page.evaluate(()=>{stopScanning();state.autoScan=false;});
    for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
      await page.setViewportSize({width,height});await page.evaluate(()=>renderCategory());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');
      assert.ok(await page.locator('.free-stage button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width>=120)),name+' readable tiles');
      await page.screenshot({path:path.join(root,'artifacts','phraseboard-'+name+'.png')});
    }
    // API/network failure must never hide the switch-accessible media exit.
    await page.route('https://www.youtube.com/**',route=>route.abort());
    await page.locator('.free-stage button').filter({hasText:'Music video'}).click();await expect(page.locator('#closeIframeBtn')).toBeVisible();
    await page.evaluate(()=>{state.currentRow=0;state.scanMode='column';state.scanIndex=state.scannableRows[0].indexOf(el.closeIframeBtn);selectCurrent();});
    await expect(page.locator('#iframeModal')).toBeHidden();await expect(page.locator('.free-stage')).toBeVisible();
    // Exercise the YouTube API contract without depending on a third-party network.
    await page.evaluate(async()=>{
      window.mediaCalls=[];window.YT={PlayerState:{PLAYING:1},Player:class {
        constructor(id,options){queueMicrotask(()=>options.events.onReady({target:this}));}
        mute(){mediaCalls.push('mute');}playVideo(){mediaCalls.push('play');}pauseVideo(){mediaCalls.push('pause');}
        isMuted(){return true;}unMute(){mediaCalls.push('unmute');}getPlayerState(){return 1;}getCurrentTime(){return 30;}getDuration(){return 90;}
        seekTo(time){mediaCalls.push('seek:'+time);}previousVideo(){mediaCalls.push('previous');}nextVideo(){mediaCalls.push('next');}destroy(){mediaCalls.push('destroy');}
      }};ytApiReady=Promise.resolve();await openIframe('https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=PLtest');
    });
    for(const id of ['playPauseBtn','rewindBtn','forwardBtn','muteBtn','prevBtn','nextBtn'])await page.locator('#'+id).click();
    assert.deepEqual(await page.evaluate(()=>mediaCalls),['mute','play','pause','seek:20','seek:40','unmute','previous','next']);
    await page.locator('#closeIframeBtn').click();assert.equal(await page.evaluate(()=>mediaCalls.at(-1)),'destroy');
    await page.evaluate(()=>{openCategory('Grid vocabulary');state.userScanPreference='cell';updateScannable();scanForward();});
    await expect(page.locator('.scan-highlight')).toHaveCount(1);await expect(page.locator('.free-stage')).toHaveCount(0);
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>openCategory('Words'));
    await page.locator('#editBoard').click();await expect(page.locator('#categoryName')).toHaveValue('Words');
    // Drag and resize are persisted independently of scan order.
    const tile=page.locator('.canvas-tile').first();let box=await tile.boundingBox();await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+70,box.y+65,{steps:5});await page.mouse.up();
    assert.ok(Number(await page.locator('#x').inputValue())>0);assert.equal(await page.locator('#scanOrder').inputValue(),'2');
    const handle=page.locator('.canvas-tile').first().locator('.resize-handle');box=await handle.boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+50,box.y+40,{steps:5});await page.mouse.up();assert.ok(Number(await page.locator('#width').inputValue())>220);
    await page.locator('#save').click();await expect(page.locator('#status')).toContainText('Saved.');
    await page.locator('#boardName').fill('Unwanted change');await page.locator('#boardName').blur();await page.locator('#save').click();
    await page.locator('#boardMenuButton').click();await page.locator('#restore').click();await expect(page.locator('#boardName')).toHaveValue('Release practice');await page.locator('#save').click();
    // Every device preview runs the live renderer and scanner.
    for(const width of ['1000','768','390']){
      await page.locator('#device').selectOption(width);await page.locator('#preview').click();
      await expect(page.frameLocator('#previewFrame').locator('.free-stage')).toBeVisible();
      const frame=page.frames().find(f=>f.url().includes('?preview='));assert.equal(await frame.evaluate(()=>innerWidth),Number(width));
      await frame.evaluate(()=>{scanForward();selectCurrent();});await expect(page.frameLocator('#previewFrame').locator('.scan-highlight')).toHaveCount(1);
      await page.locator('#closePreview').click();
    }
    await page.locator('#return').click();await expect(page.locator('#statusFooter')).toContainText('Saved changes loaded');
    // Concurrent editors must never silently overwrite each other.
    const editorA=await context.newPage(),editorB=await context.newPage();
    await editorA.goto(url+'phrase-editor.html');await editorB.goto(url+'phrase-editor.html');
    await editorA.locator('#boardName').fill('First editor');await editorA.locator('#boardName').blur();await editorA.locator('#save').click();
    await editorB.locator('#boardName').fill('Stale editor');await editorB.locator('#boardName').blur();await editorB.locator('#save').click();
    await expect(editorB.locator('#status')).toContainText('another tab');await editorA.close();await editorB.close();
    // Real touch events on a narrow viewport reach vocabulary and sentence controls.
    const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const touch=await touchContext.newPage();await touch.goto(url+'index.html');
    await touch.evaluate(csv=>{PhraseBoard.save(localStorage,PhraseBoard.parse(csv));},PB.csv(fixture));
    await touch.goto(url+'index.html?saved=1&category=Words');
    await touch.locator('.free-stage button').filter({hasText:/^IStart$/}).tap();assert.equal(await touch.evaluate(()=>messageText()),'I');
    await touch.locator('#clearSentenceBtn').tap();assert.equal(await touch.evaluate(()=>messageText()),'');await touchContext.close();
    assert.deepEqual(errors,[]);console.log('Phrase board browser checks passed: migration, direct startup, settings icons, switches, mixed layouts, predictions, responsive views, media exit, drag/resize, save/restore, live preview.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
