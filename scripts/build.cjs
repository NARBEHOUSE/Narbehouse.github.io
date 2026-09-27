const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'dist');
(async()=>{
  const existing=await fs.lstat(dest).catch(()=>null);if(existing){if(existing.isSymbolicLink()||(await fs.realpath(dest))!==dest)throw Error('Refusing unsafe build destination');await fs.rm(dest,{recursive:true});}
  await fs.mkdir(dest);
  const publicRoots=['bennyshub','logos','videos','steviesmusic','index.html','ai-workflow.html','developer-guide.html','the-dream.html','LICENSE'];
  const extensions=new Set(['.html','.js','.mjs','.css','.json','.webmanifest','.svg','.png','.jpg','.jpeg','.gif','.webp','.ico','.wav','.mp3','.mp4','.webm','.ogg','.wasm','.gz','.csv','.txt','.woff','.woff2','.ttf','.glb','.gltf','.bin','.obj','.mtl']);
  for(const item of publicRoots)await fs.cp(path.join(root,item),path.join(dest,item),{recursive:true,filter:async source=>{
    const rel=path.relative(root,source).replaceAll('\\','/');const name=path.basename(source);
    if((await fs.lstat(source)).isSymbolicLink())throw Error('Symlink in public files');
    if(name.startsWith('.')||/(?:^|\/)(node_modules|__pycache__|chrome_profile|tests|artifacts|playwright-report|test-results)(?:\/|$)/.test(rel)||/\/games\/[^/]+\/tools(?:\/|$)/.test(rel)||/\/(?:BENNYSFOOTBALL|BENNYSBASEBALL2)\/art(?:\/|$)/.test(rel)||/test-player\.(html|js)$|^rt-convo|^package(?:-lock)?\.json$|^playwright\.config\.|^DESKTOP_PROMPT\.txt$/.test(name))return false;
    // Retired prediction experiment stays in the source tree, not the public app.
    if(/^bennyshub\/apps\/tools\/keyboard\/kenlm(?:\/|-(?:client|worker)\.js$)/.test(rel))return false;
    // Local Fish Mystery authoring sources are ignored by Git and are not runtime assets.
    if(/^bennyshub\/apps\/games\/BENNYSFISHMYSTERY\/(?:content(?:\/|$)|editor\.html$)/.test(rel))return false;
    return (await fs.stat(source)).isDirectory()||/^(?:LICENSE|COPYING|NOTICE|CREDITS)(?:\.(?:md|txt))?$/i.test(name)||extensions.has(path.extname(name).toLowerCase());
  }});
  // Only this generated, production-scoped extension ZIP is a public download.
  require('node:child_process').execFileSync(process.env.PYTHON||'python',['scripts/package-release.py','--extension-only'],{cwd:root,stdio:'inherit'});
  const version=require('../extension/manifest.json').version,name='bennys-hub-companion-'+version+'.zip';
  await fs.mkdir(path.join(dest,'bennyshub/downloads'),{recursive:true});
  await fs.copyFile(path.join(root,'releases',version,name),path.join(dest,'bennyshub/downloads',name));
  await fs.writeFile(path.join(dest,'.nojekyll'),'');
  console.log('Reviewed public roots copied to dist/. TO BE ADDED, extension, tests and private runtime files are excluded.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
