#!/usr/bin/env node
// Copy a big game from Ben's PC Hub (the Electron app, the source of truth) into its website repo in
// F:\PROJECT FILES\WEBSITES\GAMES\<repo>, applying the website-only changes on the way:
//   - every path that climbs out of the game folder to a hub file (../../../shared/x, ../../../images/x,
//     ../../../index.html) becomes the absolute /bennyshub/... address, in HTML attributes, CSS url()s and the
//     page's scripts (so the exit goes to /bennyshub/index.html);
//   - <script src=".../electron-bridge.js"> is removed (the website has no such file);
//   - the analytics tag goes first in <head> and the two favicons after <title>, when missing;
//   - a Google Fonts stylesheet becomes the hub's local copy in shared/offline-vendor/fonts when one exists;
//   - with cacheTag (scripts/big-games.cjs), ?v=<date> on the game's own scripts and styles in index.html.
// It only READS the PC Hub. Without --write it changes nothing and prints what it would do.
//
//   node scripts/copy-big-game.cjs <repo>                 preview (dry run): the edits and the files that would change
//   node scripts/copy-big-game.cjs <repo> --write         copy for real
//   node scripts/copy-big-game.cjs <repo> --write --prune also delete website files the PC no longer has
//   options: --all (list every file, not the first 40), --from <Ben's PC Hub folder> (or env PC_HUB)
// Per-game settings (source folder, files never copied, website-owned files) are in scripts/big-games.cjs.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {GAMES}=require('./big-games.cjs');
const SITE=path.resolve(__dirname,'..');
const GAMES_ROOT=path.resolve(SITE,'..','GAMES');
const args=process.argv.slice(2);
const flag=n=>{const i=args.indexOf(n);if(i<0)return false;args.splice(i,1);return true;};
const option=n=>{const i=args.indexOf(n);if(i<0)return null;const v=args[i+1];args.splice(i,2);return v;};
const WRITE=flag('--write'),PRUNE=flag('--prune'),ALL=flag('--all');
const PC_HUB=path.resolve(option('--from')||process.env.PC_HUB||"C:/Users/ass/OneDrive/BEN'S SOFTWARE/Documents/Python Projects/Benny's PC Hub");
const repo=args[0];
if(!repo||!GAMES[repo]){console.error('Usage: node scripts/copy-big-game.cjs <repo> [--write] [--prune] [--all] [--from <PC Hub>]\nRepos: '+Object.keys(GAMES).join(', '));process.exit(2);}
const cfg=GAMES[repo];
const HUB=path.join(PC_HUB,'bennyshub');                       // the Electron app's bennyshub folder (read only)
const SRC=path.join(HUB,'apps','games',cfg.source);
const DEST=path.join(GAMES_ROOT,repo);
const inside=(dir,p)=>p===dir||p.startsWith(dir+path.sep);
if(!fs.existsSync(path.join(SRC,'index.html'))){console.error('No game at '+SRC);process.exit(2);}
if(!inside(GAMES_ROOT,DEST)||inside(PC_HUB,DEST)||inside(DEST,PC_HUB)){console.error('Refusing: '+DEST+' is not a folder of '+GAMES_ROOT+' apart from the PC Hub');process.exit(2);}

/* ── which files ─────────────────────────────────────────────────────────── */
const ALWAYS=['.git/','node_modules/','**/__pycache__/','**/*.pyc','**/Thumbs.db','**/desktop.ini','**/.DS_Store'];
const re=g=>new RegExp('^'+g.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*\//g,'\u0001').replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]').replace(/\u0001/g,'(?:.*/)?')+(g.endsWith('/')?'':'$'));
const matcher=list=>{const res=list.map(re);return rel=>res.some(r=>r.test(rel));};
const excluded=matcher(ALWAYS.concat(cfg.exclude||[]));
const owned=matcher(cfg.keep||[]);
function walk(dir,skip,out=[],base=dir){
  for(const d of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,d.name),rel=path.relative(base,full).split(path.sep).join('/')+(d.isDirectory()?'/':'');
    if(skip(rel))continue;
    if(d.isDirectory())walk(full,skip,out,base);else if(d.isFile())out.push(rel);
  }
  return out;
}

/* ── the website-only changes ────────────────────────────────────────────── */
const edits=[],warnings=[];
const note=(file,before,after,why)=>edits.push({file,before:before.trim(),after:after.trim(),why});
// A relative address, resolved from `fromDir` (a folder of the game, as a PC path): the /bennyshub/ address when it
// leaves the game folder for an existing hub file; null when it stays inside the game (or is not a hub file).
function hubAddress(ref,fromDir){
  const clean=ref.split(/[?#]/)[0];const tail=ref.slice(clean.length);
  const target=path.resolve(fromDir,clean);
  if(inside(SRC,target)||!inside(HUB,target))return null;
  const rel=path.relative(HUB,target).split(path.sep).join('/');
  // A hub file on the PC, or one only the website has (the favicons): either way the website serves it.
  if(!fs.existsSync(target)&&!fs.existsSync(path.join(SITE,'bennyshub',rel))){warnings.push('climbs out of the game to a hub file neither the PC nor the website has: '+ref);return null;}
  return '/bennyshub/'+rel+tail;
}
const lineOf=(text,i)=>text.slice(text.lastIndexOf('\n',i-1)+1,(text.indexOf('\n',i)+1||text.length+1)-1);
function rewritePaths(text,file,fromDir,pattern,why){
  return text.replace(pattern,(m,pre,ref,post,offset)=>{
    const abs=hubAddress(ref,fromDir);if(!abs)return m;
    const line=lineOf(text,offset);note(file,line,line.replace(pre+ref+post,pre+abs+post),why);
    return pre+abs+post;
  });
}
const ATTR=/(\b(?:src|href)\s*=\s*["'])(\.\.\/[^"']*)(["'])/g;
const STR=/((?:^|[^\w$.])["'`])((?:\.\.\/)+[^"'`\s]*)(["'`])/gm;
const CSSURL=/(url\(\s*["']?)(\.\.\/[^"')]+)(["']?\s*\))/g;
const NL=t=>t.includes('\r\n')?'\r\n':'\n';
function html(text,file,isIndex,tag){
  const dir=path.dirname(path.join(SRC,file)),nl=NL(text);
  text=text.replace(/^[ \t]*<script\b[^>]*electron-bridge\.js[^>]*>\s*<\/script>[ \t]*\r?\n?/gim,m=>{note(file,m,'(removed)','electron-bridge.js exists only in the Electron app');return '';});
  text=rewritePaths(text,file,dir,ATTR,'hub file: absolute /bennyshub/ address');
  // Google Fonts -> the hub's local copy of that font, when it has one.
  text=text.replace(/<link\b[^>]*fonts\.googleapis\.com\/css2?\?family=([^"'&:]+)[^>]*>/gi,(m,fam)=>{
    const slug=decodeURIComponent(fam).replace(/[+\s]/g,'').toLowerCase(),local='bennyshub/shared/offline-vendor/fonts/'+slug+'.css';
    if(!fs.existsSync(path.join(SITE,local))){warnings.push(file+': Google Font "'+fam+'" has no local copy in '+local+'; left as is');return m;}
    const out='<link href="/'+local+'" rel="stylesheet">';note(file,m,out,'local font file instead of Google Fonts');return out;
  });
  if(!/fonts\.googleapis\.com\/css/.test(text))text=text.replace(/^[ \t]*<link\b[^>]*rel=["']preconnect["'][^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>[ \t]*\r?\n?/gim,m=>{note(file,m,'(removed)','preconnect for Google Fonts, no longer used');return '';});
  if(isIndex){
    if(!/usage-analytics\.js/.test(text)){const t='<script src="/bennyshub/shared/usage-analytics.js" defer></script>';
      text=text.replace(/<head\b[^>]*>/i,m=>m+nl+t);note(file,'<head>','<head>\n'+t,'analytics tag first in <head>');}
    if(!/favicon-32\.png/.test(text)){const t='<link rel="icon" type="image/png" sizes="32x32" href="/bennyshub/images/favicon-32.png">'+nl+'<link rel="icon" type="image/png" sizes="16x16" href="/bennyshub/images/favicon-16.png">';
      text=text.replace(/<\/title>/i,m=>m+nl+t);note(file,'</title>','</title>\n'+t.replace(/\r/g,''),'favicons after <title>');}
    if(tag)text=text.replace(/(<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'])(?![a-z]+:|\/|#)([^"'?#]+\.(?:js|css))(?:\?v=[^"'#]*)?(["'])/gi,(m,pre,ref,post)=>pre+ref+'?v='+tag+post);
  }
  return text;
}
// Scripts run on the game's page, so their relative addresses resolve from the game's own folder.
const js=(text,file)=>rewritePaths(text,file,SRC,STR,'hub address in a page script (the standalone exit)');
const css=(text,file)=>rewritePaths(text,file,path.dirname(path.join(SRC,file)),CSSURL,'hub file in a stylesheet');
// Node tools, tests and docs are not page code; they keep their PC paths.
const NOT_PAGE=/^(tests|tools|docs|art-source|scripts)\//;
function transform(rel,buf,tag){
  const ext=path.extname(rel).toLowerCase();
  if(NOT_PAGE.test(rel)||!['.html','.htm','.js','.mjs','.css'].includes(ext))return buf;
  const text=buf.toString('utf8');
  const out=ext==='.css'?css(text,rel):ext==='.js'||ext==='.mjs'?js(text,rel):html(text,rel,rel==='index.html',tag);
  return out===text?buf:Buffer.from(out,'utf8');
}

/* ── plan ─────────────────────────────────────────────────────────────────── */
// A website-owned file is copied once if the website copy does not have it yet, and never overwritten after that.
const sources=walk(SRC,rel=>excluded(rel)||(owned(rel)&&fs.existsSync(path.join(DEST,rel))));
const destFiles=fs.existsSync(DEST)?walk(DEST,rel=>excluded(rel)||owned(rel)):[];
function plan(tag){
  edits.length=0;warnings.length=0;
  const add=[],change=[],same=[],out=new Map();
  for(const rel of sources){
    const data=transform(rel,fs.readFileSync(path.join(SRC,rel)),tag);out.set(rel,data);
    const d=path.join(DEST,rel);
    if(!fs.existsSync(d))add.push(rel);else if(Buffer.compare(fs.readFileSync(d),data))change.push(rel);else same.push(rel);
  }
  const stale=destFiles.filter(rel=>!out.has(rel));
  return {add,change,same,stale,out};
}
let tag=null;
if(cfg.cacheTag){
  const cur=fs.existsSync(path.join(DEST,'index.html'))&&(fs.readFileSync(path.join(DEST,'index.html'),'utf8').match(/\?v=([\w.-]+)/)||[])[1];
  // Keep the current tag unless a file the page loads (anything but index.html, which is not tagged) is new or
  // different; then a new one, so browsers fetch the new files.
  const first=cur?plan(cur):null;
  if(cur&&!first.add.length&&!first.change.some(r=>r!=='index.html'))tag=cur;
  else{
    const d=new Date(),today=d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');
    tag=today+'.'+(cur&&cur.startsWith(today+'.')?Number(cur.split('.').pop())+1:1);
  }
}
const P=plan(tag);
const repoFiles=[['.nojekyll',''],['LICENSE',fs.readFileSync(path.join(SITE,'LICENSE'),'utf8')]].filter(([f])=>!fs.existsSync(path.join(DEST,f)));

/* ── report ──────────────────────────────────────────────────────────────── */
const list=(title,a)=>{if(!a.length)return;console.log('\n'+title+' ('+a.length+'):');(ALL?a:a.slice(0,40)).forEach(f=>console.log('  '+f));if(!ALL&&a.length>40)console.log('  … '+(a.length-40)+' more (--all lists them)');};
console.log((WRITE?'COPY':'PREVIEW (nothing is written; add --write to copy)')+': '+cfg.source+' -> '+DEST);
console.log('From (read only): '+SRC);
console.log('Files: '+sources.length+' from the PC ('+P.same.length+' already identical), website-owned and never touched: '+(cfg.keep||[]).join(', '));
console.log('\nWEBSITE-ONLY EDITS ('+edits.length+')'+(tag?', cache tag ?v='+tag:'')+':');
const byFile={};for(const e of edits)(byFile[e.file]=byFile[e.file]||[]).push(e);
for(const [f,list2] of Object.entries(byFile)){console.log('  '+f);for(const e of list2){console.log('    - PC:  '+e.before.replace(/\n/g,'\n           '));console.log('      web: '+e.after.replace(/\n/g,'\n           ')+'   ['+e.why+']');}}
if(warnings.length)console.log('\nWARNINGS:\n  '+[...new Set(warnings)].join('\n  '));
list('Would ADD (new on the website)'.replace('Would ',WRITE?'':'Would '),P.add);
list((WRITE?'':'Would ')+'UPDATE (different on the website)',P.change);
// For each text file that would change, the lines that differ from the website copy today (- now, + after).
for(const rel of P.change){
  if(!/\.(html?|js|mjs|css|json|md|txt)$/i.test(rel))continue;
  const a=fs.readFileSync(path.join(DEST,rel),'utf8').replace(/\r\n/g,'\n').split('\n'),b=P.out.get(rel).toString('utf8').replace(/\r\n/g,'\n').split('\n');
  if(a.length*b.length>4e6){console.log('  '+rel+': too long to compare line by line');continue;}
  const L=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)L[i][j]=a[i]===b[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const d=[];for(let i=0,j=0;i<a.length||j<b.length;){if(i<a.length&&j<b.length&&a[i]===b[j]){i++;j++;}else if(j<b.length&&(i>=a.length||L[i][j+1]>=L[i+1][j]))d.push('+ '+b[j++]);else d.push('- '+a[i++]);}
  console.log('\n  '+rel+' compared with the website copy now:');(ALL?d:d.slice(0,30)).forEach(x=>console.log('    '+x));if(!ALL&&d.length>30)console.log('    … '+(d.length-30)+' more lines (--all)');
}
list('Only in the website copy'+(PRUNE?(WRITE?', deleted':', would be deleted'):' (kept; --prune deletes)'),P.stale);
if(repoFiles.length)console.log('\nRepo files '+(WRITE?'created':'that would be created')+': '+repoFiles.map(([f])=>f).join(', '));

if(WRITE){
  for(const rel of P.add.concat(P.change)){const d=path.join(DEST,rel);fs.mkdirSync(path.dirname(d),{recursive:true});fs.writeFileSync(d,P.out.get(rel));}
  for(const [f,t] of repoFiles)fs.writeFileSync(path.join(DEST,f),t);
  if(PRUNE)for(const rel of P.stale)fs.unlinkSync(path.join(DEST,rel));
  console.log('\nWrote '+(P.add.length+P.change.length)+' files'+(PRUNE?', deleted '+P.stale.length:'')+'. Nothing in the PC Hub was changed.');
}
