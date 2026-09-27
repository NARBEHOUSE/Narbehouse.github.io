// Check exact filename case as GitHub Pages runs on a case-sensitive filesystem.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist'),files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push(path.relative(root,p).replaceAll('\\','/'));}}
walk(root);const names=new Set(files),issues=[];let checked=0;
function check(from,value){
  value=value.replaceAll('&amp;','&').trim();
  if(!value||/^(?:[a-z]+:|\/\/|#|\{)/i.test(value)||value.includes('${'))return;
  let target;try{target=decodeURIComponent(new URL(value,'https://narbehouse.github.io/'+from).pathname).slice(1);}catch{return;}
  if(!target||target.endsWith('/'))target+='index.html';
  checked++;
  if(!names.has(target))issues.push({from,target});
}
for(const file of files){
  if(!/\.(html|css)$/.test(file))continue;
  const text=fs.readFileSync(path.join(root,file),'utf8').replace(/<!--[\s\S]*?-->/g,'');
  if(file.endsWith('.html'))for(const match of text.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi))check(file,match[1]);
  if(file.endsWith('.css'))for(const match of text.matchAll(/url\(\s*["']?([^'"\)]+)["']?\s*\)/gi))check(file,match[1]);
}
for(const group of ['tools','games']){
  const items=JSON.parse(fs.readFileSync(path.join(root,'bennyshub/apps',group,group+'.json')))[group];
  for(const app of items){check('bennyshub/index.html',app.path);check('bennyshub/index.html',app.image);}
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'bennyshub/manifest.webmanifest')));
check('bennyshub/manifest.webmanifest',manifest.start_url);
for(const icon of manifest.icons)check('bennyshub/manifest.webmanifest',icon.src);
const report={checked,issues};fs.mkdirSync(path.resolve(__dirname,'../artifacts'),{recursive:true});
fs.writeFileSync(path.resolve(__dirname,'../artifacts/pages-links.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(issues.length)process.exitCode=1;
