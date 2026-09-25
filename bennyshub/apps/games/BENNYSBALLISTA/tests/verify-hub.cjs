const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-hub-')));
const out={checks:[],errors:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.resolve(__dirname,'../../../..'),artifacts=path.join(__dirname,'artifacts');
fs.mkdirSync(artifacts,{recursive:true});
let server;
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const js=s=>w.webContents.executeJavaScript(s),game=s=>js('(()=>{const g=document.getElementById("app-iframe").contentWindow;return ('+s+');})()');
 const check=(ok,name)=>{out.checks.push({ok,name});if(!ok)throw Error(name);};
 const until=async s=>{for(let i=0;i<400;i++){if(await js(s))return;await wait(100);}throw Error('Timed out: '+s);};
 const input=async action=>{await js('GameHub.press('+JSON.stringify(action)+')');await wait(120);await js('GameHub.release('+JSON.stringify(action)+')');await wait(200);};
 const card='.app-btn[data-path="apps/games/BENNYSBALLISTA/index.html"]';
 const clickGame=label=>game('[...g.document.querySelectorAll("#panelList button")].find(b=>b.querySelector("strong")?.textContent==='+JSON.stringify(label)+').click()');
 w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)out.errors.push(message);});
 w.webContents.on('render-process-gone',(_e,details)=>out.errors.push(details));
 try{
  let url=process.env.BALLISTA_HUB_URL;
  if(!url){
   server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{
     if(error){res.writeHead(404).end();return;}
     const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.wav':'audio/wav','.mp3':'audio/mpeg'};
     res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);
    });
   });
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   url='http://127.0.0.1:'+server.address().port+'/index.html';
  }
  await w.loadURL(url);
  await until('typeof appsData!=="undefined"&&appsData.games.some(g=>g.id==="bennysballista")');
  await js(`document.getElementById('modal-cancel').click();document.querySelector('[data-target="games"]').click()`);
  await wait(500);
  check(await js('!!document.querySelector('+JSON.stringify(card)+')'),'Ballista appears in Games');
  await until('(()=>{const i=document.querySelector('+JSON.stringify(card+' img')+');return i?.complete&&i.naturalWidth>0;})()');
  check(await js('document.querySelector('+JSON.stringify(card+' img')+').getAttribute("src")==="images/games/bennysballista.png"'),'New PNG loads on the hub card');
  await js('NarbeScanManager.setAutoScan(false);NarbeScanManager.setScanSpeedIndex(0);NarbeScanManager.setInputSensitivityIndex(1)');
  await js('document.querySelector('+JSON.stringify(card)+').click()');
  await until('document.getElementById("app-iframe").contentWindow.RT?.game?.CAM.phase==="MENU"');
  check(await game('g.RT.ui.__test.state().screen==="welcome"'),'Hub launches Ballista over HTTP');
  check(await game('g.NarbeScanManager.getSettings().scanSpeedIndex===0&&g.NarbeScanManager.getSettings().inputSensitivityIndex===1'),'Game inherits hub scan speed and input sensitivity');
  check(await game('!!g.SafeAudio&&!!g.NarbeVoiceManager'),'Shared audio and voice managers load');
  await input('scan');
  check(await game('g.RT.ui.__test.state().scan===0'),'Hub switch input scans to Play Game');
  await input('select');
  check(await game('g.RT.ui.__test.state().screen==="levels"'),'Hub select input opens campaigns');
  await clickGame('Back');
  await game('g.NarbeScanManager.setAutoScan(true)');await wait(1200);
  check(await game('g.RT.ui.__test.state().scan>=0'),'One-switch Auto Scan advances the menu');
  await game('g.NarbeScanManager.setAutoScan(false)');
  await clickGame('Exit');await wait(400);
  check(await js('!document.getElementById("iframe-container").classList.contains("active")'),'Exit returns to the hub');
  check(await js('document.getElementById("app-iframe").getAttribute("src")===""'),'Exit unloads the game');
  check(!out.errors.length,'No runtime or resource errors');
 }catch(error){out.error=error.stack;}
 finally{fs.writeFileSync(path.join(artifacts,'hub-results.json'),JSON.stringify(out,null,2));if(server)server.close();app.exit(out.error?1:0);}
});
