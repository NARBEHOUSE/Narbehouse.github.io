'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../bennyshub/apps/games/NARBESWITCHSTORIES');
const chart=fs.readFileSync(path.join(base,'IMAGE-DESCRIPTIONS.html'),'utf8');
const rows=new Map();
const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
for(const row of chart.matchAll(/<tr data-story="([^"]+)" data-page="(\d+)">([\s\S]*?)<\/tr>/g)){
 const cells={};for(const cell of row[3].matchAll(/<td data-field="([^"]+)">([^<]*)<\/td>/g))cells[cell[1]]=decode(cell[2]);
 assert.equal(Object.keys(cells).length,4);rows.set(row[1]+':'+row[2],cells);
}
const settings={imageDescriptions:'on',switchAnimations:'on',look:'book',readAloud:'off'},spoken=[];
let now=0,caption='',hint='',stories=[];
const NSS={Settings:{is:(k,v)=>settings[k]===v,cvi:()=>settings.look==='cvi'},UI:{setWords:s=>caption=s,setHint:s=>hint=s,setCredits(){},setPageNo(){},setSpread(){},showEndChoices(){},fadeWords(){},show(){}},
 Scene:{newPage(){},celebrate(){}},Sound:{stopFile(){},play(){},action(){},check(){},after(){}},Reader:{stop(){},read:(p,done)=>{spoken.push(p.text);done();}},Input:{refresh(){},announce(){}}};
const c=vm.createContext({window:{NSS},NSS,console,performance:{now:()=>now+=1000},setTimeout:()=>1,clearTimeout(){}});
const read=file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),c,{filename:file});
read('js/config.js');read('js/descriptions.js');read('js/braille-books.js');
NSS.Descriptions.get=(id,i,simple,kind)=>rows.get(id+':'+i)?.[(simple?'simple':'book')+(kind==='after'?'Action':'Image')]||'';
read('stories/list.js');
for(const id of NSS.STORY_LIST){NSS.registerStory=def=>stories.push({...def,id,pages:def.pages.map(p=>({...p,text:p.text||p.textParts.join(' ')}))});read('stories/'+id+'/story.js');}
read('js/story.js');
assert.equal(rows.size,stories.reduce((n,s)=>n+s.pages.length,0));
for(const s of stories) s.pages.forEach((p,i)=>{
 for(const simple of [false,true])for(const kind of ['before','after']){
  if(kind==='after'&&p.action==='none')continue;
  assert.ok(NSS.Descriptions.get(s.id,i,simple,kind),s.id+' '+i+' complete descriptions');
 }
});
function finishDescription(kind){
 for(let safety=0;NSS.Story.stats().state==='descriptionReady';safety++){
  assert.ok(safety<100);assert.equal(NSS.Story.stats().descriptionKind,kind);
  assert.ok(caption.length>0&&caption.length<=115,'short readable description passages');
  const before=NSS.Story.stats();NSS.Story.tick(50);
  assert.equal(NSS.Story.stats().state,'descriptionReady','waits indefinitely');
  assert.equal(NSS.Story.stats().index,before.index);
  assert.equal(NSS.Story.view().state,kind==='after'?'done':'reading','poses match phase');
  if(kind==='before')assert.equal(NSS.Story.view().progress,0,'no action before description');
  NSS.Story.press();
 }
}
let count=0;
// Even stale values from the retired option cannot skip an action or its description.
for(const look of ['book','cvi'])for(const legacyAnimations of ['on','off']){
 settings.look=look;settings.switchAnimations=legacyAnimations;
 for(const story of stories){NSS.Story.open(story);for(let i=0;i<story.pages.length;i++){
  NSS.Story.goToPage(i);assert.equal(NSS.Story.stats().state,'descriptionReady');
  assert.equal(spoken.at(-1),NSS.Descriptions.parts(NSS.Descriptions.get(story.id,i,look==='cvi','before'))[0]);
  finishDescription('before');
  const page=story.pages[i],parts=page.textParts||[page.text];
  for(let j=0;j<parts.length;j++){
   assert.equal(spoken.at(-1),parts[j]);assert.equal(NSS.Story.stats().partIndex,j);
   if(j<parts.length-1){assert.equal(hint,'Press to keep reading');NSS.Story.press();}
  }
  if(page.action!=='none'){
   assert.equal(NSS.Story.stats().state,'waiting');NSS.Story.press();
   assert.equal(NSS.Story.stats().state,'acting');NSS.Story.press();NSS.Story.tick(100);
   assert.equal(NSS.Story.stats().state,'descriptionReady','extra action press cannot skip explanation');
   assert.equal(NSS.Story.stats().index,i);
   assert.equal(spoken.at(-1),NSS.Descriptions.parts(NSS.Descriptions.get(story.id,i,look==='cvi','after'))[0]);
   finishDescription('after');
  }else{assert.equal(NSS.Story.stats().state,'done');NSS.Story.press();}
  assert.equal(NSS.Story.stats().state,'turning');NSS.Story.tick(1);
  assert.equal(NSS.Story.stats().state,i===story.pages.length-1?'end':'descriptionReady');
  count++;
 }}
}
settings.switchAnimations='on';settings.imageDescriptions='off';
for(const story of stories){NSS.Story.open(story);assert.ok(['waiting','done'].includes(NSS.Story.stats().state),'off keeps original flow');}
settings.imageDescriptions='on';NSS.Story.open(stories.at(-1));
NSS.Story.press();const part=NSS.Story.stats().descriptionIndex;
NSS.Story.pause();NSS.Story.resume();assert.equal(NSS.Story.stats().descriptionIndex,part,'pause retains description passage');
NSS.Story.goToPage(19);assert.equal(NSS.Story.stats().descriptionIndex,0);assert.equal(NSS.Story.stats().partIndex,0);
settings.imageDescriptions='off';NSS.Story.settingChanged('imageDescriptions');NSS.Story.resume();
assert.equal(spoken.at(-1),stories.at(-1).pages[19].textParts[0]);
assert.equal(NSS.Story.stats().state,'done','off resumes first story passage');
settings.imageDescriptions='on';NSS.Sound.after=()=>.7;
NSS.Story.open(stories.find(s=>s.id==='rocky-says-hello'));NSS.Story.goToPage(1);finishDescription('before');
NSS.Story.press();NSS.Story.tick(100);
assert.equal(NSS.Story.stats().state,'actionOutro','closing bark is preserved');
const beforeBark=spoken.length;NSS.Story.press();NSS.Story.tick(.35);
assert.equal(spoken.length,beforeBark,'no narration over the closing bark');
NSS.Story.tick(.4);assert.equal(NSS.Story.stats().state,'descriptionReady');assert.equal(NSS.Story.stats().descriptionKind,'after');
NSS.Story.pause();NSS.Story.resume();
assert.equal(NSS.Story.stats().state,'descriptionReady');assert.equal(NSS.Story.view().progress,1,'pause preserves the action description and completed pose');
const braille={turtle:'⠞⠥⠗⠞⠇⠑',shell:'⠎⠓⠑⠇⠇',kite:'⠅⠊⠞⠑',balloon:'⠃⠁⠇⠇⠕⠕⠝'};
for(const [word,expected] of Object.entries(braille)){
 const unicode=NSS.BrailleBooks.cells(word).map(dots=>String.fromCodePoint(0x2800+dots.reduce((mask,dot)=>mask|(1<<(dot-1)),0))).join('');
 assert.equal(unicode,expected,word+' matches UEB alphabet cells');
}
console.log(`${count} complete page flows passed: all 54 pages, both looks, retired animation preferences ignored. Chart coverage, fresh presses, page jumps, pause, settings, and four Braille labels passed.`);
