const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const out=path.join(__dirname,'artifacts'),root=path.resolve(__dirname,'../../../../..');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-library-')));
const checks=[],errors=[],servers=[];let w,fixture,downloaded;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function assert(ok,name,detail){checks.push({ok,name,detail});if(!ok)throw Error(name);}
function serve(handler){return new Promise(resolve=>{const s=http.createServer(handler);s.listen(0,'127.0.0.1',()=>{servers.push(s);resolve('http://127.0.0.1:'+s.address().port);});});}
const js=s=>w.webContents.executeJavaScript(s);
async function until(s){for(let i=0;i<300;i++){if(await js(s))return;await wait(100);}throw Error('Timeout '+s);}
async function click(label){assert(await js('(()=>{const b=[...document.querySelectorAll("#panelList button")].find(b=>b.querySelector("strong")?.textContent==='+JSON.stringify(label)+');if(!b)return false;b.click();return true;})()'),'Menu: '+label);await wait(100);}
async function chooseFile(file){if(!w.webContents.debugger.isAttached())w.webContents.debugger.attach('1.3');const {root}=await w.webContents.debugger.sendCommand('DOM.getDocument');const {nodeId}=await w.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#castleFileInput'});await w.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[file]});}
async function shot(name){fs.writeFileSync(path.join(out,name+'.png'),(await w.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 try{
  const origin=await serve((req,res)=>{const url=new URL(req.url,'http://local');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname.replace(/^\/project/,'')));if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'}[path.extname(file)]||'application/octet-stream'));res.end(data);});});
  const remote=await serve((req,res)=>{if(req.url==='/slow'){setTimeout(()=>res.end(JSON.stringify(fixture)),1200);return;}if(req.url!=='/blocked')res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');if(req.url==='/bad')return res.end('{bad');res.end(JSON.stringify({...fixture,name:'Remote harbor castle'}));});
  const base=origin+'/project/bennyshub/apps/games/BENNYSBALLISTA/';
  w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}});
  w.webContents.on('console-message',(_e,l,m)=>{if(l>=3&&!/favicon|CORS|net::ERR/.test(m))errors.push(m);});
  w.webContents.session.on('will-download',(_e,item)=>{const file=path.join(out,'custom-library-download.json');item.setSavePath(file);item.once('done',(_e,state)=>{downloaded=state==='completed'?file:null;});});
  await w.loadURL(base+'index.html');await until('window.RT?.ui&&RT.game.CAM.phase==="MENU"');
  fixture=await js('({...RT.courses.validate(RT.levels.LEVELS[0]),name:"My fishing castle",cutscene:false,environment:RT.scenery.defaults("harbor")})');
  fs.writeFileSync(path.join(out,'custom-library-input.json'),JSON.stringify({version:1,level:fixture}));
  await click('Play Game');await click('My Castles');await click('Import castles');
  assert(await js('RT.ui.__test.state().scan===-1&&!document.querySelector("#castleFiles .fileScan")'),'Importer opens without a switch highlight');
  await js('document.dispatchEvent(new KeyboardEvent("keyup",{code:"Enter",bubbles:true}));true;');
  assert(await js('RT.castleFiles.isOpen()&&RT.courses.list().length===0'),'Unselected Enter cannot start an import');
  await js('document.dispatchEvent(new KeyboardEvent("keyup",{code:"Space",bubbles:true}));true;');
  assert(await js('document.getElementById("castleFilePick").classList.contains("fileScan")'),'Space selects first import choice');
  for(const [width,height] of [[1280,900],[640,480],[390,844]]){w.setSize(width,height);await wait(120);assert(await js('(()=>{const d=document.getElementById("castleFiles");return d.scrollHeight<=d.clientHeight+1&&[...d.querySelectorAll("button,input:not([type=file])")].every(b=>{const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});})()'),'Import form has no scrolling '+width+'x'+height);await shot('custom-import-'+width+'x'+height);}
  w.setSize(1280,900);await chooseFile(path.join(out,'custom-library-input.json'));await until('!RT.castleFiles.isOpen()');
  assert(await js('RT.courses.list().length===1&&RT.ui.__test.state().choices.includes("My fishing castle")'),'File import appears immediately in game');
  const savedId=await js('RT.courses.list()[0].id');
  await click('My fishing castle');assert(await js('RT.game.isCustom()&&RT.game.currentLevel().environment.preset==="harbor"'),'Custom castle loads playable scene');
  await click('Export JSON');for(let i=0;i<80&&!downloaded;i++)await wait(100);assert(!!downloaded,'Game exports a real JSON download');
  const exported=JSON.parse(fs.readFileSync(downloaded,'utf8'));assert(exported.version===1&&exported.level.name===fixture.name&&JSON.stringify(exported.level.environment)===JSON.stringify(fixture.environment),'JSON download retains scenery and level data');
  await click('Back');await click('Import castles');await chooseFile(downloaded);await until('!RT.castleFiles.isOpen()');assert(await js('RT.courses.list().length===1'),'Reimporting identical JSON does not duplicate a castle');
  await click('Import castles');await js('document.getElementById("castleFileURL").value='+JSON.stringify(remote+'/castle.json')+';document.getElementById("castleFileLoad").click();');await until('!RT.castleFiles.isOpen()');assert(await js('RT.courses.list().length===2&&RT.ui.__test.state().choices.includes("Remote harbor castle")'),'Public JSON link imports from another origin');
  assert(await js('(()=>{const before=localStorage.getItem("rt-ballista-castles");for(const raw of [{version:99,level:RT.courses.list()[0].level},{version:1,levels:[]},{version:1,levels:[RT.courses.list()[0].level,{layers:[["?"]]}]}]){try{RT.courses.importData(raw);return false;}catch{}}return before===localStorage.getItem("rt-ballista-castles");})()'),'Invalid packs and unsupported versions leave library untouched');
  assert(await js('(()=>{const C=RT.courses,before=localStorage.getItem("rt-ballista-castles"),original=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("Full","QuotaExceededError")};let failed=false;try{C.importData({levels:[{...C.list()[0].level,name:"Must not partially save"}]});}catch{failed=true;}finally{Storage.prototype.setItem=original;}return failed&&before===localStorage.getItem("rt-ballista-castles");})()'),'Storage failure never reports a partial import as saved');

  assert(await js('RT.courses.readFile(new File(["x".repeat(1000001)],"big.json")).then(()=>false,()=>true)'),'Oversized files are rejected before reading');
  assert(await js('RT.courses.readURL("javascript:alert(1)").then(()=>false,()=>true)'),'Non-web URL schemes are rejected');
  assert(await js('RT.courses.readURL('+JSON.stringify(remote+'/blocked')+').then(()=>false,e=>e.message.includes("download the file"))'),'Blocked remote service explains the download/import fallback');
  await click('Import castles');await js('document.getElementById("castleFileURL").value='+JSON.stringify(remote+'/bad')+';document.getElementById("castleFileLoad").click();');await until('document.getElementById("castleFileStatus").textContent.includes("not valid JSON")');assert(await js('RT.courses.list().length===2&&RT.castleFiles.isOpen()'),'Bad JSON shows a recoverable error without changing saved castles');
  await js('document.getElementById("castleFileURL").value='+JSON.stringify(remote+'/slow')+';document.getElementById("castleFileLoad").click();document.getElementById("castleFileClose").click();');await wait(1400);assert(await js('!RT.castleFiles.isOpen()&&RT.courses.list().length===2'),'Closing a pending import cancels it without saving later');
  assert(await js('(()=>{const C=RT.courses,before=localStorage.getItem("rt-ballista-castles"),level=C.list()[0].level;try{C.importData({levels:Array.from({length:40},(_,i)=>({...level,name:"Capacity "+i}))});return false;}catch{return before===localStorage.getItem("rt-ballista-castles");}})()'),'An over-capacity pack leaves the whole library unchanged');
  servers[1].close();
  await w.reload();await until('window.RT?.ui&&RT.game.CAM.phase==="MENU"');await click('Play Game');await click('My Castles');assert(await js('RT.ui.__test.state().choices.includes("Remote harbor castle")'),'Imported castles remain selectable after reload with their host offline');
  await click('My fishing castle');await click('Edit in Workshop');await click('Open Castle Workshop');await until('window.RT?.editor&&document.getElementById("fName").value==="My fishing castle"');
  assert(await js('document.getElementById("savedCastle").value==='+JSON.stringify(savedId)),'Game opens the same saved castle in Workshop');
  await js('document.getElementById("fName").value="Edited fishing castle";document.getElementById("fName").dispatchEvent(new Event("input"));document.getElementById("btnSaveCastle").click();');assert(await js('RT.courses.list().length===2&&RT.courses.list().find(it=>it.id==='+JSON.stringify(savedId)+').level.name==="Edited fishing castle"'),'Editing updates the existing saved castle');
  await js('document.getElementById("btnLibrary").click();document.getElementById("btnImportCastles").click();');assert(await js('RT.castleFiles.isOpen()'),'Workshop shelf opens shared importer');await js('document.getElementById("castleFileClose").click()');
  for(const [width,height]of [[800,600],[640,480]]){w.setSize(width,height);await wait(120);for(const id of ['libraryDialog','shareDialog']){await js('document.querySelectorAll("dialog[open]").forEach(d=>d.close());document.getElementById('+JSON.stringify(id)+').showModal()');assert(await js('(()=>{const d=document.getElementById('+JSON.stringify(id)+');return d.scrollHeight<=d.clientHeight+1;})()'),'Workshop '+id+' fits '+width+'x'+height);}}
  await js('document.querySelectorAll("dialog[open]").forEach(d=>d.close());document.getElementById("btnPlayCastle").click();');await until('window.RT?.ui&&RT.ui.__test.state().screen==="kingdom"');assert(await js('RT.game.currentLevel().name==="Edited fishing castle"'),'Workshop playtest returns to saved custom castle under project subpath');
  await click('Start level');assert(await js('RT.game.isCustom()&&RT.ui.__test.state().stage==="ammo"'),'Custom castle starts through normal game controls');
  assert(!errors.length,'No runtime errors',errors);
 }catch(e){checks.push({ok:false,name:'Completion',error:e.stack});try{await shot('custom-library-failure');}catch{}}
 finally{fs.writeFileSync(path.join(out,'custom-library-results.json'),JSON.stringify({checks,errors},null,2));for(const s of servers)s.close();app.exit(checks.some(c=>!c.ok)?1:0);}
});
