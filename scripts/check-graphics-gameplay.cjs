'use strict';
// Reuse established interaction suites with Low selected before page code.
// Each suite runs in its own process. Existing speech/clock fixtures remain in place.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const suites={basketball:['check-graphics.cjs'],shots:['check-scan-sports-shots.cjs'],racer:['check-scan-sports-racer.cjs'],bowling:['check-scan-bowling-deep.cjs'],fish:['check-scan-fish.cjs'],baseball:['check-scan-sports-phaser-deep.cjs','BENNYSBASEBALL2'],ballista:['check-ballista-scan.cjs'],remaining:['check-graphics-interactions.cjs']};
if(process.argv[2]==='--suite'){
 const name=process.argv[3],spec=suites[name];if(!spec)throw Error('Unknown suite');
 const {chromium}=require('@playwright/test'),launch=chromium.launch.bind(chromium);
 chromium.launch=async opts=>{const b=await launch({...opts,executablePath:undefined,channel:'chrome',args:[]});
 const seed=()=>{try{localStorage.setItem('narbe-graphics-settings',JSON.stringify({version:1,quality:'low'}));}catch{}};
 const ctx=b.newContext.bind(b);b.newContext=async opts=>{const c=await ctx(opts);if(name!=='basketball')await c.addInitScript(seed);return c;};
 const page=b.newPage.bind(b);b.newPage=async opts=>{const p=await page(opts);if(name!=='basketball')await p.addInitScript(seed);return p;};return b;};
 const filename=path.join(__dirname,spec[0]);process.argv=[process.execPath,filename,...spec.slice(1)];
 process.env.HUB_TEST_ARTIFACTS='artifacts/graphics/gameplay/'+name;
 let source=fs.readFileSync(filename,'utf8').replaceAll('artifacts/scan-completion-sports','artifacts/graphics/gameplay').replaceAll('artifacts/rally-club','artifacts/graphics/gameplay/rally');
 source=source.replace("await page.route('https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js',r=>r.fulfill({path:path.join(out,'fixtures/phaser-3.60.0.min.js'),contentType:'application/javascript'}));",''); // Use the game's own pinned CDN dependency.
 fs.mkdirSync(path.join(root,'artifacts/graphics/gameplay'),{recursive:true});
 const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(source,filename);
}else{let failed=false;for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(suites)){
 if(!suites[name])throw Error('Unknown suite '+name);const r=cp.spawnSync(process.execPath,[__filename,'--suite',name],{cwd:root,windowsHide:true,stdio:'inherit',timeout:600000});if(r.status!==0||r.error){failed=true;console.error(name+': failed',r.error?.message||r.status);}}
 if(failed)process.exitCode=1;
}
