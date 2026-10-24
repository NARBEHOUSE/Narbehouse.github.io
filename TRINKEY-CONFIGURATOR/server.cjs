const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=__dirname;
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.zip':'application/zip','.py':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const relative=requested.replace(/^\/+/, '')||'index.html';const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||relative.split(/[\\/]/).some(p=>p.startsWith('.'))){res.writeHead(403);return res.end('Forbidden');}const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port '+port+' is already in use. Open http://localhost:'+port+' or set PORT to another number.':error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{const url='http://localhost:'+port;console.log('Trinkey Configurator: '+url+'\nKeep this window open. Press Ctrl+C to stop.');if(process.argv.includes('--open')){const command=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';const args=process.platform==='win32'?['/c','start','',url]:[url];spawn(command,args,{windowsHide:true,stdio:'ignore'}).on('error',()=>{});}});
