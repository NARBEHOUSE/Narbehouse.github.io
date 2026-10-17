import { chromium } from '../../../node_modules/playwright/index.mjs';
import { fixture,key } from './fixture.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),out=path.join(root,'artifacts/rtc-lite');
const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'benny-rtc-web-')),oldCwd=process.cwd();process.chdir(runtime);
await fs.mkdir(out,{recursive:true});
let browser,f,endpoint;
const failures=[],requests=[];
const server=http.createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://fixture').pathname;
  const file=path.resolve(root,'.'+name);if(!file.startsWith(path.join(root,'bennyshub')+path.sep))throw Error('Not public');
  let body=await fs.readFile(file);
  if(name.endsWith('/web-config.js'))body=Buffer.from(body.toString().replace('https://bennys-hub-byok.narbehousellc.workers.dev',endpoint));
  if(name.endsWith('/rtc-lite/app.js'))body=Buffer.from(body.toString().replace('    loadStarters(); initDefaults(); applyTheme(); updateSettings();','window.__rtc={ai,memory,speech,profile,state:()=>choice.getState(),open:openScreen,type:text=>{typed=text;changedTyping();}};prefs.listening=false;\n    loadStarters(); initDefaults(); applyTheme(); updateSettings();'));
  const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png'})[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const appOrigin='http://localhost:'+server.address().port;
 f=await fixture({origin:appOrigin});endpoint=(await f.mf.ready).origin;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--test-third-party-cookie-phaseout']});
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.addInitScript(()=>{localStorage.setItem('narbe-voice-settings',JSON.stringify({ttsEnabled:false}));});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname))route.continue();else route.abort();});
 const page=await context.newPage();
 page.on('pageerror',e=>failures.push(e.message));
 page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCookieControls',{enableThirdPartyCookieRestriction:true,disableThirdPartyCookieMetadata:true,disableThirdPartyCookieHeuristics:true});
 await page.goto(appOrigin+'/bennyshub/apps/tools/rtc-lite/index.html');
 await page.waitForFunction(()=>window.__rtc);
 await page.locator('#continueButton').click();
 await page.locator('#settingsButton').click();await page.locator('#bioPage').click();
 await page.locator('#bioInput').fill('I like music and parks. Please give me time.');
 await page.locator('#saveBio').click();
 assert.equal(await page.evaluate(()=>__rtc.profile().bio),'I like music and parks. Please give me time.');
 await page.locator('#bioBack').click();await page.locator('#aiPage').click();await page.locator('#keyPage').click();
 const popupPromise=page.waitForEvent('popup');await page.locator('#connectCloud').click();const popup=await popupPromise;
 popup.on('pageerror',e=>failures.push('setup: '+e.message));
 await popup.waitForURL(endpoint+'/connect?**');
 await popup.waitForFunction(()=>document.getElementById('connect')&&!document.getElementById('connect').disabled);
 await popup.locator('#key').fill(key);await popup.locator('#connect').click();
 await page.waitForFunction(()=>!!window.RtcByok.connection(),{timeout:15000});
 assert.equal(await page.evaluate(k=>JSON.stringify(localStorage).includes(k),key),false);
 assert.equal(f.calls().length,0);
 await page.locator('#keyBack').click();await page.locator('#aiBack').click();await page.locator('#settingsBackButton').click();
 await page.evaluate(()=>__rtc.speech.onText('Would you like lunch in the park?',Date.now(),25));
 await page.locator('#getButton').click();
 await page.waitForFunction(()=>document.getElementById('general0').textContent==='That sounds good');
 assert(f.calls().length>=1);assert(f.calls()[0].data.messages[0].content.includes('Please give me time.'));
 await page.screenshot({path:path.join(out,'board.png')});
 await page.locator('#keyboardButton').click();await page.waitForSelector('#keyboardScreen:not([hidden])');
 await page.evaluate(()=>__rtc.type('that sou'));
 await page.waitForFunction(()=>document.getElementById('prediction5').dataset.prediction==='sounds good');
 await page.locator('#prediction5').click();
 assert.equal(await page.locator('#typedText').textContent(),'that sounds good ');
 await page.waitForFunction(()=>document.getElementById('prediction5').dataset.prediction==='to me');
 assert(f.calls().some(c=>c.data.messages?.[0]?.content.includes('ACTUAL TEXT BEFORE THE CURSOR: "that sounds good "')));
 await page.waitForFunction(()=>document.getElementById('keyboardPrediction0').textContent!=='—');
 assert.equal(await page.evaluate(()=>window.predictionSystem.loadError?.message||null),null);
 assert(await page.evaluate(()=>Object.keys(predictionSystem.data.frequent_words).length)>100);
 assert.equal(await page.locator('#keyboardStatus').textContent().then(t=>t.includes('could not load')),false);
 const layouts=[];
 for(const [width,height] of [[1366,900],[1280,800],[1024,768],[800,600]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(80);
  layouts.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight})));
 }
 assert(layouts.every(x=>x.fits),JSON.stringify(layouts));
 await page.setViewportSize({width:1366,height:900});await page.screenshot({path:path.join(out,'keyboard.png')});
 // The real web scanner, not a synthetic selection, reaches the first row after blank.
 await page.evaluate(()=>__rtc.open('board'));await page.keyboard.press('Space');await page.waitForTimeout(90);
 assert.equal(await page.evaluate(()=>__rtc.state().id),'controlsRow');
 await page.keyboard.press('Enter');await page.waitForTimeout(90);assert.equal(await page.evaluate(()=>__rtc.state().id),'getButton');
 await page.evaluate(()=>__rtc.open('key'));
 await page.locator('#clearKey').click();await page.waitForFunction(()=>!RtcByok.connection());
 assert(requests.filter(x=>x.url.includes('/api/byok/')).every(x=>!x.body.includes(key)));
 await page.goto(appOrigin+'/bennyshub/index.html');
 await page.locator('#modal-cancel').click();
 await page.locator('[data-target="tools"]').click();
 await page.locator('#tools-grid [data-title="RTC Lite"]').click();
 const frame=page.frameLocator('#app-iframe');await frame.locator('#continueButton').click();
 await frame.locator('#settingsButton').click();await frame.locator('#aiPage').click();await frame.locator('#keyPage').click();
 const nestedPopupPromise=page.waitForEvent('popup');await frame.locator('#connectCloud').click();const nestedPopup=await nestedPopupPromise;
 await nestedPopup.waitForFunction(()=>document.getElementById('connect')&&!document.getElementById('connect').disabled);
 await nestedPopup.locator('#connect').click();
 await page.waitForFunction(()=>document.querySelector('#app-iframe').contentWindow.RtcByok.connection());
 await frame.locator('#keyBack').click();await frame.locator('#aiBack').click();await frame.locator('#settingsBackButton').click();
 await frame.locator('#exitButton').click();
 assert.deepEqual(failures,[]);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,checks:['First-party setup with third-party cookies blocked','No provider key in app storage or app requests','Bio save and use in Worker prompt','Cloud board suggestions','Keyboard completion and refresh','Dictionary fallback','Four keyboard viewport sizes','Switch row navigation','Revocable disconnect','Hub catalog and embedded setup / exit'],layouts,providerCalls:f.calls().length,failures},null,2));
 console.log(JSON.stringify({passed:true,providerCalls:f.calls().length,layouts,failures}));
}catch(e){await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:false,error:e.message,failures},null,2));console.error(e);if(browser){const page=browser.contexts()[0]?.pages()[0];await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}process.exitCode=1;}
finally{
 await browser?.close();await f?.mf.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));process.chdir(oldCwd);
 const resolved=await fs.realpath(runtime),temp=await fs.realpath(os.tmpdir());if(!resolved.startsWith(temp+path.sep)||!path.basename(resolved).startsWith('benny-rtc-web-'))throw Error('Unsafe runtime cleanup');await fs.rm(resolved,{recursive:true});
}
