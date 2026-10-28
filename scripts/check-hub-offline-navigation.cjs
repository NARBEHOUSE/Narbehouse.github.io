'use strict';
// Navigation regression, not the full-library acceptance test. Serve an explicit
// current-source manifest subset to exercise real Hub iframes without 500 MB per
// retry. No game is opened until its library download has completed.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {createOfflineManifest}=require('./offline-manifest.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'artifacts/hub-offline-navigation');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.mp3':'audio/mpeg','.wav':'audio/wav','.woff2':'font/woff2'};
const report={fixture:'Current public assets except app trees outside Benny Says and Keyboard; full normal Hub and catalogs. Previous published v63 worker fixture verifies migration. Mobile viewport/user-agent in desktop Chrome; not physical Android or native installation UI.',checks:[],errors:[]};
let mode='online',base,browser,manifest,oldWorker,newWorker,legacy=true;
const hanging=new Set(),requests=new Map();
const server=http.createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 requests.set(pathname,(requests.get(pathname)||0)+1);
 if(mode==='fail'){req.socket.destroy();return;}
 if(mode==='hang'){hanging.add(res);res.on('close',()=>hanging.delete(res));return;}
 try{
  let file=path.resolve(root,'.'+pathname),hub=path.join(root,'bennyshub');
  if(file!==hub&&!file.startsWith(hub+path.sep))throw Error('Not public');
  if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
  let body=await fs.readFile(file);
  if(file.endsWith('offline-manifest.json'))body=Buffer.from(JSON.stringify(manifest));
  if(file.endsWith('service-worker.js'))body=Buffer.from(legacy?oldWorker:newWorker);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
async function frameSnapshot(page){return page.evaluate(()=>{const frame=document.querySelector('#app-iframe');return {src:frame.src,url:frame.contentWindow?.location.href,body:frame.contentDocument?.body?.innerText.slice(0,160),length:frame.contentDocument?.documentElement.outerHTML.length,status:document.querySelector('#offline-status').textContent};});}
async function launch(page,category,title,expected){
 if(await page.locator('#iframe-container.active').count())await page.locator('#iframe-back').click();
 await page.evaluate(()=>showScreen('home'));
 await page.locator('#screen-home [data-target="'+category+'"]').click();
 const start=Date.now();
 await page.locator('#'+category+'-grid .card-btn[data-title="'+title+'"]').click();
 await page.waitForFunction(expected=>{
  const frame=document.querySelector('#app-iframe');
  return frame.contentWindow?.location.href.includes(expected)&&frame.contentDocument?.readyState!=='loading'&&frame.contentDocument?.body?.innerHTML.length>100;
 },expected,{timeout:4000});
 if(category==='tools')await page.frameLocator('#app-iframe').locator('#keyboard .key').first().waitFor({state:'visible',timeout:4000});
 const elapsed=Date.now()-start;
 const snap=await frameSnapshot(page);
 assert.ok(snap.length>500,'real app document rendered');
 if(category==='tools')assert.ok(await page.frameLocator('#app-iframe').locator('#keyboard .key').count(),'actual keyboard keys rendered');
 report.checks.push({network:mode,app:title,elapsed,...snap});
 console.log('PASS '+mode+' '+title+' iframe in '+elapsed+' ms');
}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 newWorker=await fs.readFile(path.join(root,'bennyshub/service-worker.js'),'utf8');
 oldWorker=await fs.readFile(path.join(root,'tests/fixtures/offline-worker-v63.js'),'utf8');
 manifest=await createOfflineManifest(root);
 manifest.assets=manifest.assets.filter(e=>!e.url.startsWith('./apps/')||e.url.includes('/BENNYSAYS/')||e.url.includes('/keyboard/')||e.url.endsWith('/games.json')||e.url.endsWith('/tools.json'));
 manifest.totalBytes=manifest.assets.reduce((sum,e)=>sum+e.bytes,0);
 manifest.version=crypto.createHash('sha256').update(JSON.stringify(manifest.assets)).digest('hex');
 report.assetCount=manifest.assets.length;report.bytes=manifest.totalBytes;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base='http://127.0.0.1:'+server.address().port+'/bennyshub/';
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
 context.setDefaultTimeout(15000);
 const page=await context.newPage();
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(base);
 await page.waitForFunction(()=>navigator.serviceWorker.controller&&!document.querySelector('#offline-download').disabled);
 await page.locator('#modal-cancel').click();
 await page.locator('#hub-settings>summary').click();
 await page.locator('#offline-download').click();
 await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.startsWith('Ready offline'),null,{timeout:120000});
 await page.locator('#hub-settings>summary').click();
 const gamePath='/bennyshub/apps/games/BENNYSAYS/index.html',before=requests.get(gamePath);
 const priorCacheCount=await page.evaluate(async()=> (await (await caches.open('benny-offline-library-v1')).keys()).length);
 pass('Downloaded fixture library under the previous published worker without opening any game');
 legacy=false;
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
 const currentCache=newWorker.match(/const CACHE='([^']+)'/)[1];
 await page.waitForFunction(cache=>caches.keys().then(keys=>keys.includes(cache)),currentCache);
 await page.waitForTimeout(1000);
 assert.equal(await page.evaluate(async()=> (await (await caches.open('benny-offline-library-v1')).keys()).length),priorCacheCount);
 assert.equal(requests.get(gamePath),before,'worker update reused downloaded game');
 pass('Worker upgrade preserved the downloaded library without fetching the game again');
 mode='fail';await context.setOffline(true);
 await launch(page,'games','Benny Says','/BENNYSAYS/');
 await launch(page,'tools','Keyboard','/keyboard/');
 await page.locator('#iframe-back').click();
 // Keep navigator.onLine true: the network accepts a request but never replies.
 // This models the mobile Wi-Fi/cellular handoff missed by fast-failure tests.
 mode='hang';await context.setOffline(false);
 await launch(page,'games','Benny Says','/BENNYSAYS/');
 await launch(page,'tools','Keyboard','/keyboard/');
 await page.locator('#iframe-back').click();
 await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.startsWith('Ready offline'),null,{timeout:8000});
 pass('Saved readiness recovers while the manifest endpoint never replies');
 const cdp=await context.newCDPSession(page);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');
 const reloadStart=Date.now();await page.reload({waitUntil:'domcontentloaded',timeout:4000});
 await page.waitForFunction(()=>appsData.games.length&&allTools.length,null,{timeout:4000});
 pass('Cached Hub shell and catalogs reload after worker termination with a stalled network in '+(Date.now()-reloadStart)+' ms');
 await page.locator('#modal-cancel').click().catch(()=>{});
 await launch(page,'games','Benny Says','/BENNYSAYS/');
 await launch(page,'tools','Keyboard','/keyboard/');
 await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.startsWith('Ready offline'),null,{timeout:8000});
 pass('Restarted worker serves actual game/tool iframes and reports saved readiness');
 await page.screenshot({path:path.join(output,'keyboard-offline-mobile.png')});
 assert.deepEqual(report.errors,[]);
 report.status='passed';await context.close();
})().catch(async error=>{report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{for(const response of hanging)response.destroy();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.close();});
