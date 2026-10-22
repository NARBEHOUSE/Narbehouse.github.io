const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'dist');
function companionCandidate(html,version){
  if(!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version))throw Error('Invalid Companion manifest version');
  const links=[...html.matchAll(/\bhref\s*=\s*["']downloads\/(bennys-hub-companion-[^"']+\.zip)["']/g)];
  if(links.length!==1)throw Error('Expected one local Companion ZIP link in extension-setup.html');
  const name=links[0][1],prefix='bennys-hub-companion-'+version;
  if(!name.startsWith(prefix))throw Error('Companion download version does not match the manifest');
  const suffix=name.slice(prefix.length,-4);
  if(suffix&&(!/^-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suffix)||suffix.length>49))throw Error('Invalid Companion download revision');
  return {name,artifactVersion:version+suffix,args:suffix?['--revision='+suffix.slice(1)]:[]};
}
async function build(){
  // The setup download is the single active candidate reference. Validate its
  // immutable package before replacing the generated website directory.
  const candidate=companionCandidate(await fs.readFile(path.join(root,'bennyshub/extension-setup.html'),'utf8'),require('../extension/manifest.json').version);
  const packageArgs=[path.join(root,'scripts/package-companion.cjs'),...candidate.args];
  const runPackage=extra=>require('node:child_process').execFileSync(process.execPath,[...packageArgs,...extra],{cwd:root,windowsHide:true,stdio:'inherit'});
  runPackage(['--check']);
  const existing=await fs.lstat(dest).catch(()=>null);if(existing){if(existing.isSymbolicLink()||(await fs.realpath(dest))!==dest)throw Error('Refusing unsafe build destination');await fs.rm(dest,{recursive:true});}
  await fs.mkdir(dest);
  const publicRoots=['codex-physical-builds','crypto-statement','bennyshub','logos','videos','steviesmusic','index.html','ai-workflow.html','developer-guide.html','the-dream.html','LICENSE'];
  const extensions=new Set(['.html','.js','.mjs','.css','.json','.webmanifest','.svg','.png','.jpg','.jpeg','.gif','.webp','.ico','.wav','.mp3','.mp4','.webm','.ogg','.wasm','.gz','.csv','.txt','.woff','.woff2','.ttf','.glb','.gltf','.bin','.obj','.mtl']);
  for(const item of publicRoots)await fs.cp(path.join(root,item),path.join(dest,item),{recursive:true,filter:async source=>{
    const rel=path.relative(root,source).replaceAll('\\','/');const name=path.basename(source);
    if((await fs.lstat(source)).isSymbolicLink())throw Error('Symlink in public files');
    if(name.startsWith('.')||/(?:^|\/)(node_modules|__pycache__|chrome_profile|tests|artifacts|playwright-report|test-results)(?:\/|$)/.test(rel)||/\/games\/[^/]+\/tools(?:\/|$)/.test(rel)||/\/(?:BENNYSFOOTBALL|BENNYSBASEBALL2)\/art(?:\/|$)/.test(rel)||/test-player\.(html|js)$|^rt-convo|^package(?:-lock)?\.json$|^playwright\.config\.|^DESKTOP_PROMPT\.txt$/.test(name))return false;
    // Keep original project photographs as source; publish the compressed JPEG derivatives.
    if(/^codex-physical-builds\/images\/.*\.png$/i.test(rel))return false;
    // Retired prediction experiment stays in the source tree, not the public app.
    if(/^bennyshub\/apps\/tools\/keyboard\/kenlm(?:\/|-(?:client|worker)\.js$)/.test(rel))return false;
    // Switch Stories production references never ship with the playable books.
    if(/^bennyshub\/apps\/games\/NARBESWITCHSTORIES\/(?:.*\/)?(?:source|incoming|reference|art|prototype)(?:\/|$)/i.test(rel)||(/^bennyshub\/apps\/games\/NARBESWITCHSTORIES\//.test(rel)&&/\.pdf$/i.test(name)))return false;
    // Private publishing records never enter a website build, regardless of file type.
    if (/(?:^|\/)rights and publishing[^/]*(?:\/|$)/i.test(rel)) return false;
    // Publish the game's README alongside its license, notice and credits.
    if (rel === 'bennyshub/apps/games/CHASINGRAINBOWS/README.md') return true;
    // Chasing Rainbows partner source documents/art are local references, not web assets.
    if(/^bennyshub\/apps\/games\/CHASINGRAINBOWS\/REFERENCE DATA(?:\/|$)/.test(rel))return false;
    // Local Fish Mystery authoring sources are ignored by Git and are not runtime assets.
    if(/^bennyshub\/apps\/games\/BENNYSFISHMYSTERY\/(?:content(?:\/|$)|editor\.html$)/.test(rel))return false;
    // The Faster voice phonemizer needs this pinned public data package.
    if(rel === 'bennyshub/shared/communication-fast-vendor/piper_phonemize.data')return true;
    return (await fs.stat(source)).isDirectory()||/(?:^|[-_.])(?:LICENSE|COPYING|NOTICE|CREDITS)(?:\.(?:md|txt))?$/i.test(name)||extensions.has(path.extname(name).toLowerCase());
  }});
  // Only the production-scoped ZIP linked by the setup page is public.
  runPackage([]);
  await fs.mkdir(path.join(dest,'bennyshub/downloads'),{recursive:true});
  await fs.copyFile(path.join(root,'releases',candidate.artifactVersion,candidate.name),path.join(dest,'bennyshub/downloads',candidate.name));
  await fs.writeFile(path.join(dest,'.nojekyll'),'');
  console.log('Reviewed public roots copied to dist/. TO BE ADDED, extension, tests and private runtime files are excluded.');
}
module.exports={companionCandidate};
if(require.main===module)build().catch(e=>{console.error(e.message);process.exitCode=1;});
