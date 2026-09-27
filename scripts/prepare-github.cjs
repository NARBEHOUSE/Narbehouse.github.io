// Create a clean source handoff. No Git changes, network, or publishing.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),version=require('../extension/manifest.json').version;
const destination=path.join(root,'releases',version,'github-ready');
async function list(directory){let result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected symlink: '+path.relative(root,file));if(entry.isDirectory())result.push(...await list(file));else result.push(file);}return result;}
(async()=>{
  for(const name of ['release-audit.json','pages-links.json']){
    const report=JSON.parse(await fs.readFile(path.join(root,'artifacts',name)));
    if((report.problems||report.issues).length)throw Error('Resolve '+name+' before preparing the replacement.');
  }
  const sources=new Map();
  for(const file of await list(path.join(root,'dist'))){const relative=path.relative(path.join(root,'dist'),file).replaceAll('\\','/');if(!relative.startsWith('bennyshub/downloads/'))sources.set(relative,file);}
  for(const folder of ['.github','extension','scripts','tests','submission'])for(const file of await list(path.join(root,folder)))sources.set(path.relative(root,file).replaceAll('\\','/'),file);
  // Keep useful game development sources in the checkout, outside the public build.
  for(const folder of ['bennyshub/apps/games','steviesmusic'])for(const file of await list(path.join(root,folder))){
    const relative=path.relative(root,file).replaceAll('\\','/');
    if(/\/(?:out|artifacts|node_modules|__pycache__|\.vscode|playwright-report|test-results)\//.test(relative)||relative.endsWith('/DESKTOP_PROMPT.txt'))continue;
    if(/\.(?:md|cjs|py)$|\/(?:\.gitignore|package(?:-lock)?\.json)$/.test(relative)||/\/tests\/.*\.json$/.test(relative)||/\/(?:art|tools)\/.*\.(?:js|html|wam|wamset)$/.test(relative))sources.set(relative,file);
  }
  for(const file of ['.gitignore','README.md','WEB-EXTENSION-MIGRATION.md','package.json','package-lock.json','bennyshub/ACCESSIBILITY.md','bennyshub/test-player.html','bennyshub/test-player.js','workers/tmdb/package.json','workers/tmdb/package-lock.json','workers/tmdb/worker.mjs','workers/tmdb/wrangler.jsonc','workers/tmdb/README.md'])sources.set(file,path.join(root,file));
  const problems=[];let bytes=0;
  for(const [relative,file]of sources){
    const stat=await fs.stat(file);bytes+=stat.size;
    if(stat.size>100_000_000)problems.push({file:relative,kind:'over 100 MB'});
    if(!/\.(?:md|txt|html|css|js|mjs|cjs|json|jsonc|py|csv|svg|wam|wamset|webmanifest|example)$/.test(relative))continue;
    const content=await fs.readFile(file,'utf8');
    const checks={credential:/AIza[\w-]{25,}|sk-(?:proj-|ant-)[\w-]{20,}|gh[pousr]_[\w]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,personalPath:/(?:[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}|\/Users\/)[^\s"<>]+|[A-Za-z]:[\\/]PROJECT FILES[\\/]/i,privateCalendar:/calendar\/ical\/[^\s"<>]*private[^\s"<>]*/,privatePlex:/plex\.tv\/[^\s"<>]*server\/[a-f0-9]{20,}/,literalCredential:/(?:api[_-]?key|token|secret)\s*[=:]\s*["'][A-Za-z0-9_\-]{24,}["']/i};
    for(const [kind,pattern]of Object.entries(checks))if(pattern.test(content))problems.push({file:relative,kind});
  }
  if(problems.length)throw Error(JSON.stringify(problems,null,2));
  const existing=await fs.lstat(destination).catch(()=>null);
  if(existing){if(existing.isSymbolicLink())throw Error('Unsafe output folder');for(const file of await list(destination))if(!sources.has(path.relative(destination,file).replaceAll('\\','/')))throw Error('Unexpected existing output file: '+path.relative(destination,file));}
  for(const [relative,source]of sources){const file=path.join(destination,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(source,file);}
  const report={files:sources.size,bytes,problems,excluded:['old Git history','TO BE ADDED','personal backups','browser profiles','artifacts','node_modules','worker secrets and .wrangler','generated releases','development art reports','image-generation output'],publishesAutomatically:false};
  await fs.writeFile(path.join(root,'artifacts/github-ready-audit.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));console.log('Clean replacement: '+destination);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
