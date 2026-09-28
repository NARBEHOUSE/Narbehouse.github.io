// Uses disposable browser storage, real NARBE vocabulary, and mocked external images/speech.
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),url='http://127.0.0.1:4173/bennyshub/apps/tools/phraseboard/';
const executablePath=process.env.PHRASEBOARD_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await context.route('https://**',route=>route.abort());
  const editor=await context.newPage();await editor.goto(url+'phrase-editor.html');
  await editor.evaluate(csv=>{PhraseBoard.save(localStorage,PhraseBoard.parse(csv));},fs.readFileSync(path.join(root,'bennyshub/apps/tools/phraseboard/boards/NARBE_Words.csv'),'utf8'));await editor.reload();
  const live=await context.newPage();await live.goto(url+'index.html?saved=1&category=Core');
  await live.evaluate(()=>{state.predictionsEnabled=true;state.sentenceMode=true;state.ttsOnScan=false;state.speakGroups=false;window.spoken=[];speak=text=>spoken.push(text);renderMessage();});
  const liveSuggestions=async message=>{await live.evaluate(text=>{state.sentence=text?[{text}]:[];renderMessage();},message);return live.locator('[data-prediction]').allTextContents();};
  const messages=['I want to','I need','I feel','can you','how are','I would like','unrecorded quux'];
  for(const view of ['basicView','mapView']){
   await editor.locator('#'+view).click();await editor.locator('#boardMenuButton').click();await editor.locator('#openSuggestions').click();
   for(const message of messages){
    await editor.locator('#predictionContext').fill(message);
    const suggestions=await editor.locator('.preview-suggestion').allTextContents();assert.deepEqual(suggestions,await liveSuggestions(message),view+': '+message);
    if(message==='I want to'){assert.ok(suggestions.includes('go'));assert.ok(!suggestions.some(x=>['am','are','is','I'].includes(x)));}
   }
   await expect(editor.locator('#predictionExamples')).toContainText('No matching continuation');
   await expect(editor.locator('#predictionSummary')).toContainText('all 30 categories');
   await editor.locator('#closeBoardOptions').click();
  }
  // Large Graphic canvases stay in place while Board settings and nested symbols are open.
  await editor.locator('#boardMenuButton').click();await editor.locator('#openBoardOptions').click();
  await editor.evaluate(()=>window.originalMapTile=document.querySelector('.canvas-tile'));
  for(const layout of ['free','grid']){
   await editor.locator('#boardLayout').selectOption(layout);await editor.locator('#boardOptionsTitle').click();
   assert.equal(await editor.evaluate(()=>originalMapTile.isConnected),true);
   assert.equal(await editor.locator('#boardOptions').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
   assert.equal(await editor.locator('#boardOptions').evaluate(n=>n.matches(':modal')),true);
   assert.equal(await editor.locator('#boardOptions').evaluate(n=>getComputedStyle(n,'::backdrop').backgroundColor),'rgba(16, 42, 61, 0.8)');
  }
  await editor.locator('[data-symbol-target="board"]').click();await expect(editor.locator('#symbolDialog')).toBeVisible();await editor.locator('#closeSymbols').click();
  assert.equal(await editor.evaluate(()=>originalMapTile.isConnected),true);
  await editor.locator('#closeBoardOptions').click();await expect.poll(()=>editor.evaluate(()=>pendingCanvasRender)).toBe(false);
  assert.equal(await editor.evaluate(()=>originalMapTile.isConnected),false);
  await editor.locator('#boardMenuButton').click();await editor.locator('#openSuggestions').click();await editor.locator('#predictionContext').fill('I want to');
  // Speaking learns locally; both the open editor and live board immediately use that history.
  await live.evaluate(()=>{state.rememberMessages=true;state.sentence=[{text:'I want to swim'}];speakMessage();});
  await expect(editor.locator('.preview-suggestion').first()).toHaveText('swim');
  assert.deepEqual(await editor.locator('.preview-suggestion').allTextContents(),await liveSuggestions('I want to'));
  const spokenBefore=await live.evaluate(()=>spoken.length);await live.locator('[data-prediction]').first().click();
  assert.equal(await live.evaluate(()=>messageText()),'I want to swim');assert.equal(await live.evaluate(()=>spoken.length),spokenBefore);
  // The live scanning preview uses the same suggestions, too.
  await editor.locator('#closeBoardOptions').click();await editor.locator('#preview').click();
  const frame=editor.frameLocator('#previewFrame');await expect(frame.locator('#editBoard')).toBeHidden();
  const preview=editor.frames().find(f=>f.url().includes('preview=1'));await preview.waitForLoadState('domcontentloaded');
  await preview.evaluate(()=>{state.predictionsEnabled=true;state.sentenceMode=true;openCategory('Core');state.sentence=[{text:'I want to'}];renderMessage();});
  assert.deepEqual(await frame.locator('[data-prediction]').allTextContents(),await liveSuggestions('I want to'));
  await editor.locator('#closePreview').click();await editor.locator('#boardMenuButton').click();await editor.locator('#openSuggestions').click();
  await live.evaluate(()=>{localStorage.removeItem(PhrasePredictions.HISTORY_KEY);predictionEngine.setHistory([]);});
  await expect(editor.locator('.preview-suggestion').first()).not.toHaveText('swim');
  assert.deepEqual(await editor.locator('.preview-suggestion').allTextContents(),await liveSuggestions('I want to'));
  assert.deepEqual(errors,[]);await context.close();console.log('Prediction browser checks passed: Layout/Graphic editor and live/embedded previews agree, trigram continuations, learned/cleared history, deliberate insertion, opaque nested settings and deferred canvas repaint.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
