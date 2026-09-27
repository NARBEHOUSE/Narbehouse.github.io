const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const path=require('node:path');
const base='http://127.0.0.1:4173', keyboard=base+'/bennyshub/apps/tools/keyboard/index.html';
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext(),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/bennyshub/index.html');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.goto(keyboard);
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.waitForFunction(()=>window.predictionSystem?.dataLoaded&&window.kenLMPredictor?.available,{},{timeout:45000});
  const suggestions=await page.evaluate(async()=>({next:await predictionSystem.getHybridPredictions('I WOULD LIKE TO '),prefix:await predictionSystem.getHybridPredictions('I WANT TO DR')}));
  assert.equal(suggestions.next.filter(Boolean).length,6);
  assert.ok(suggestions.prefix.filter(Boolean).every(w=>w.startsWith('DR')));
  console.log('On-device KenLM suggestions:',suggestions);
  await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
  for(const char of 'I WANT TO DR')await page.locator('#keyboard').getByRole('button',{name:char===' '?/Space/:char,exact:char!==' '}).click();
  await expect(page.locator('#predictBar').getByRole('button',{name:'DRINK',exact:true})).toBeVisible();
  await page.locator('#predictBar').getByRole('button',{name:'DRINK',exact:true}).click();
  await expect(page.locator('#textBar')).toHaveText('I WANT TO DRINK |');
  await page.evaluate(()=>{predictionSystem.recordLocalWord('ZORBELL');predictionSystem.recordNgram('I WANT','ZORBELL');});
  assert.ok((await page.evaluate(()=>predictionSystem.getHybridPredictions('I WANT '))).slice(0,2).includes('ZORBELL'));
  await page.screenshot({path:path.resolve('artifacts/keyboard-kenlm.png')});
  // The enhanced model remains available offline after its static assets load.
  await context.setOffline(true);await page.reload();
  await page.waitForFunction(()=>window.predictionSystem?.dataLoaded&&window.kenLMPredictor?.available,{},{timeout:45000});
  assert.ok((await page.evaluate(()=>predictionSystem.getHybridPredictions('I WANT '))).includes('ZORBELL'));
  // Model/worker unavailable: the old local predictor still supplies suggestions.
  await page.evaluate(()=>kenLMPredictor.stop());
  const fallback=await page.evaluate(async()=>({local:await predictionSystem.getLocalPredictions('I WANT '),hybrid:await predictionSystem.getHybridPredictions('I WANT ')}));
  assert.deepEqual(fallback.hybrid,fallback.local);assert.ok(fallback.local.some(Boolean));
  assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===base));
  assert.deepEqual(errors,[]);
  console.log('Keyboard checks passed: real KenLM WASM, typing/selecting suggestions in the original UI, contextual/prefix predictions, learned words, offline reload and local fallback; no typed-text network requests.');
  // Fresh profile with a failed model load must also retain a working keyboard.
  const fallbackContext=await browser.newContext();await fallbackContext.route('**/kenlm/english.arpa.gz',r=>r.abort());
  const fallbackPage=await fallbackContext.newPage();await fallbackPage.goto(keyboard);
  await fallbackPage.waitForFunction(()=>predictionSystem.dataLoaded);
  assert.ok((await fallbackPage.evaluate(()=>predictionSystem.getHybridPredictions('I WANT '))).some(Boolean));
  await expect(fallbackPage.locator('#keyboard button').first()).toBeVisible();
  await fallbackContext.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>browser?.close());
