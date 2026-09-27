// Smoke-test the built website at its production paths without deploying it.
const {chromium}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),site='https://narbehouse.github.io';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.wav':'audio/wav','.mp3':'audio/mpeg','.webmanifest':'application/manifest+json'};
let context;
(async()=>{
  const extension=path.join(root,'releases',require('../extension/manifest.json').version,'extension');
  context=await chromium.launchPersistentContext(path.join(root,'artifacts','pages-profile-'+Date.now()),{channel:'chromium',headless:true,serviceWorkers:'block',viewport:{width:1280,height:800},args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--enable-unsafe-swiftshader']});
  await context.route(site+'/**',async route=>{
    let rel=decodeURIComponent(new URL(route.request().url()).pathname);if(rel.endsWith('/'))rel+='index.html';
    const file=path.resolve(dist,'.'+rel);if(!file.startsWith(dist+path.sep))return route.abort();
    try{return await route.fulfill({body:await fs.readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  const groups=await Promise.all(['tools','games'].map(async group=>JSON.parse(await fs.readFile(path.join(dist,'bennyshub/apps',group,group+'.json')))[group]));
  const pages=[{title:'Main website',path:'../index.html'},{title:'Hub',path:'index.html'},{title:'Privacy',path:'companion-privacy.html'},...groups.flat()];
  const results=[];
  for(const app of pages){
    const page=await context.newPage(),errors=[],missing=[],warnings=[];
    // This game's optional recorded effects have deliberate generated WAV fallbacks.
    const optionalEffects=new Set(['latch','door-rattle','door-creak','door-close','footsteps','landing','stamp','fanfare','friend','barn-song','birdchirp','aquarium/tap','aquarium/bubbles','aquarium/splash-in','aquarium/splash-out','aquarium/song','aquarium/shimmer','safari/gate-open','safari/gate-close','safari/song','safari/critter'].map(x=>'/bennyshub/apps/games/NARBEANIMALFRIENDS/sounds/'+x+'.wav'));
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().startsWith(site+'/')&&response.status()>=400){const p=new URL(response.url()).pathname;(optionalEffects.has(p)?warnings:missing).push(p);}});
    try{await page.goto(new URL(app.path,site+'/bennyshub/').href,{waitUntil:'load',timeout:25000});await page.waitForTimeout(800);
      if(!await page.locator('body').isVisible())errors.push('Body not visible');
      if(app.requiresExtension)await page.waitForFunction(()=>window.BennyExtension?.state.connected,{timeout:10000});
      if(warnings.length&&!await page.evaluate(()=>window.NAF?.Audio.renderWav([{freq:440,dur:.05,wave:'sine',gain:.1}]).startsWith('data:audio/wav;base64,')))errors.push('Expected generated audio fallback was not available');
    }catch(error){errors.push(error.message.split('\n')[0]);}
    results.push({app:app.title,errors,missing:[...new Set(missing)],warnings:[...new Set(warnings)]});
    console.log(app.title+': '+(errors.length||missing.length?JSON.stringify({errors,missing}):'loaded'));
    await fs.writeFile(path.join(root,'artifacts/pages-browser.json'),JSON.stringify(results,null,2));
    await page.close();
  }
  await fs.writeFile(path.join(root,'artifacts/pages-browser.json'),JSON.stringify(results,null,2));
  const failures=results.filter(result=>result.errors.length||result.missing.length);
  console.log(JSON.stringify({pages:results.length,failures},null,2));if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>context?.close());
