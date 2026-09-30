// Exercise the real Hub and app pages without sending any requests to Google Analytics.
const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),origin='https://narbehouse.github.io';
(async()=>{
  const executablePath=process.env.HUB_BROWSER_EXECUTABLE||process.argv[2];
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{channel:process.env.HUB_BROWSER_CHANNEL||'chrome'})});
  try {
    const context=await browser.newContext({serviceWorkers:'block'});
    let loaders=0;
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='www.googletagmanager.com'){
        loaders++;return route.fulfill({contentType:'application/javascript',body:'/* isolated test: leave the gtag queue intact */'});
      }
      if(url.origin!==origin)return route.abort();
      try {
        let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
        if(!file.startsWith(root+path.sep))return route.abort();
        if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
        const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
        await route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});
      }catch{await route.fulfill({status:404,body:'Not found'});}
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const events=()=>page.evaluate(()=>Array.from(window.dataLayer||[],x=>Array.from(x)).filter(x=>x[0]==='event'));
    await page.goto(origin+'/bennyshub/?private_query=must-not-be-sent');
    await page.waitForFunction(()=>window.dataLayer?.some(x=>x[0]==='event'&&x[1]==='page_view'));
    await page.locator('#modal-cancel').click();
    await page.locator('[data-target="tools"]').first().click();
    await page.locator('#tools-grid [data-path="apps/tools/keyboard/index.html"]').click();
    const frame=page.frameLocator('#app-iframe');
    await frame.locator('body').waitFor();
    await frame.locator('body').click({position:{x:10,y:10}});
    await page.waitForTimeout(1400); // A real foreground interval is the quantity under test.
    const embedded=page.frames().find(f=>f.url().includes('/keyboard/index.html'));
    assert.equal(await embedded.evaluate(()=>typeof window.BennyUsage),'undefined');
    await page.locator('#iframe-back').click();
    const hubEvents=await events();
    assert.equal(hubEvents.filter(x=>x[1]==='hub_app_open'&&x[2].hub_app_id==='keyboard').length,1);
    assert(hubEvents.some(x=>x[1]==='hub_usage'&&x[2].hub_app_id==='keyboard'&&x[2].hub_usage_seconds>=1));
    assert.equal(loaders,1,'Only the parent loads Google Analytics');
    assert(!JSON.stringify(hubEvents).includes('must-not-be-sent'));
    assert.deepEqual(errors,[]);
    await page.goto(origin+'/bennyshub/apps/tools/keyboard/index.html?category=private-text#private-fragment');
    await page.waitForFunction(()=>window.dataLayer?.some(x=>x[0]==='event'&&x[1]==='hub_app_open'));
    const directEvents=await events();
    assert.equal(directEvents.filter(x=>x[1]==='hub_app_open').length,1);
    assert.equal(directEvents.find(x=>x[1]==='hub_app_open')[2].hub_app_id,'keyboard');
    assert(!JSON.stringify(directEvents).includes('private-text'));
    assert(!JSON.stringify(directEvents).includes('private-fragment'));
    assert.equal(loaders,2,'A direct entry has one independent tracker');
    console.log('Usage browser checks passed: real Hub launch/return, iframe focus/time, no duplicate tracking, direct entry, and canonical URLs. No real Analytics requests sent.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
