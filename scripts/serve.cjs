const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
// Big games are their own GitHub Pages repos, published at /<repo>/ next to this site. Locally they live in
// F:\PROJECT FILES\WEBSITES\GAMES\<repo>, a sibling of this repo. Every folder there with an index.html is served at
// the address GitHub Pages gives it, so the preview matches the live site. `--log` prints every request and its status.
const gamesRoot=path.resolve(root,'..','GAMES');
const BIG_GAMES=(()=>{const sync=require('node:fs');try{return sync.readdirSync(gamesRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.startsWith('.')&&sync.existsSync(path.join(gamesRoot,d.name,'index.html'))).map(d=>d.name).sort();}catch{return [];}})();
const logRequests=process.argv.includes('--log');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.mp4':'video/mp4','.webm':'video/webm','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  if(logRequests)res.on('finish',()=>console.log(res.statusCode+' '+req.method+' '+req.url));
  try{
    const url=new URL(req.url,'http://localhost');let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');if(!relative)relative='index.html';
    if(relative.split(/[\\/]/).some(p=>p.startsWith('.')||p==='..'))throw Error('Not public');
    const game=BIG_GAMES.find(name=>relative===name||relative.startsWith(name+'/'));
    // GitHub Pages redirects /<repo> to /<repo>/ so the game's relative paths resolve inside its folder.
    if(game&&relative===game){res.writeHead(301,{Location:'/'+game+'/'+url.search});res.end();return;}
    // Preview only public surfaces, not staging, credentials, dependencies, or the extension itself.
    if(!game&&!/^(build-with-us\/|codex-physical-builds\/|bennyshub\/|logos\/|videos\/|steviesmusic\/|index\.html$|ai-workflow\.html$|developer-guide\.html$|the-dream\.html$)/.test(relative))throw Error('Not public');
    const base=game?path.join(gamesRoot,game):root;if(game)relative=relative.slice(game.length+1)||'index.html';
    const generated=!game&&/^bennyshub\/downloads\/bennys-hub-companion-\d+\.\d+\.\d+\.zip$/.test(relative);
    let file=path.resolve(base,generated?'dist/'+relative:relative);if(!file.startsWith(base+path.sep))throw Error('Not public');if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
    const real=await fs.realpath(file);if(!real.startsWith(base+path.sep))throw Error('Not public');const body=await fs.readFile(real);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
const port=Number(process.env.PORT)||4173;
server.listen(port,'127.0.0.1',()=>{console.log('Benny’s Hub preview: http://127.0.0.1:'+port+'/bennyshub/');for(const name of BIG_GAMES)console.log('  '+name+': http://127.0.0.1:'+port+'/'+name+'/');});
