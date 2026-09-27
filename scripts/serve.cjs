const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.wav':'audio/wav','.mp3':'audio/mpeg','.mp4':'video/mp4','.webm':'video/webm','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');if(!relative)relative='index.html';
    // Preview only public surfaces, not staging, credentials, dependencies, or the extension itself.
    if(!/^(bennyshub\/|logos\/|videos\/|steviesmusic\/|index\.html$|ai-workflow\.html$|developer-guide\.html$|the-dream\.html$)/.test(relative)||relative.split(/[\\/]/).some(p=>p.startsWith('.')||p==='..'))throw Error('Not public');
    const generated=/^bennyshub\/downloads\/bennys-hub-companion-\d+\.\d+\.\d+\.zip$/.test(relative);
    let file=path.resolve(root,generated?'dist/'+relative:relative);if(!file.startsWith(root+path.sep))throw Error('Not public');if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
    const real=await fs.realpath(file);if(!real.startsWith(root+path.sep))throw Error('Not public');const body=await fs.readFile(real);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Benny’s Hub preview: http://127.0.0.1:4173/bennyshub/'));
