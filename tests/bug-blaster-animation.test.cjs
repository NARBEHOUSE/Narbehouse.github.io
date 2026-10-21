const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,vm}=require('./helpers/bug-blaster-runtime.cjs');
function setupArt(){
 const box=setup(1);box.matchMedia=()=>({matches:false});box.Audio.prototype.pause=()=>{};
 const context=box.document.getElementById().getContext();box.document.createElement=()=>({getContext:()=>context});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../bennyshub/apps/games/BENNYSBUGBLASTER/presentation.js'),'utf8'),box);
 return box;
}
const box=setupArt(),art=box.window.BugBlasterPresentation,{rigs,legPose,walkCycleDistance}=art.locomotion;
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,label+': '+a+' vs '+b);
const crosses=(a,b,c,d)=>{const orient=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;};
for(const type of Object.keys(rigs))test(type+' has reachable, separate articulated legs and planted stance feet',()=>{
 const rig=rigs[type],scale=({small:48,defender:40,medium:65,large:80,extra_large:112.5,boss:190})[type]/(type==='extra_large'?90:76);
 for(let f=0;f<320;f++){
  const phase=f/320*Math.PI*2,legs=rig.hips.map((_,row)=>legPose(type,1,row,phase));
  legs.forEach((p,row)=>{
   close(Math.hypot(p.knee.x-p.hip.x,p.knee.y-p.hip.y),rig.bones[row][0],'upper bone');
   close(Math.hypot(p.foot.x-p.knee.x,p.foot.y-p.knee.y),rig.bones[row][1],'lower bone');
   const next=legPose(type,1,row,phase+.0001);
   if(p.planted&&next.planted){close(p.foot.x,next.foot.x,'planted lateral position');close(p.foot.y*scale,next.foot.y*scale+walkCycleDistance(type)*.0001/(Math.PI*2),'ground contact during forward travel');}
   const mirrored=legPose(type,-1,row,phase+Math.PI);
   close(p.foot.x,-mirrored.foot.x,'opposite tripod');close(p.foot.y,mirrored.foot.y,'opposite tripod');
  });
  for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++)for(const a of [[legs[i].hip,legs[i].knee],[legs[i].knee,legs[i].foot]])for(const b of [[legs[j].hip,legs[j].knee],[legs[j].knee,legs[j].foot]])assert.ok(!crosses(...a,...b),type+' adjacent legs cross');
 }
 for(let row=0;row<rig.hips.length;row++){
  const a=legPose(type,1,row,0),b=legPose(type,1,row,Math.PI*2);close(a.foot.x,b.foot.x,'loop x');close(a.foot.y,b.foot.y,'loop y');
  for(const state of ['idle','attack','hit','death'])for(let f=0;f<10;f++){
   const p=legPose(type,1,row,f/10*Math.PI*2,state,f/9);
   for(const point of [p.hip,p.knee,p.foot])assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Math.abs(point.x)<36&&Math.abs(point.y)<36,'finite pose stays inside atlas');
  }
 }
});
test('ants and defenders keep six compact legs rooted on the thorax',()=>{
 for(const type of ['small','defender']){assert.equal(rigs[type].hips.length,3);for(const [y,x]of rigs[type].hips)assert.ok(Math.abs(y)<=2.5&&x<=4);for(const bones of rigs[type].bones)assert.ok(bones[0]+bones[1]<=14);}
 assert.equal(rigs.boss.hips.length,4);assert.equal(rigs.extra_large.hips.length,4);assert.equal(art.stats.atlasFrames,288);
});
test('approaching bugs keep walking, stopped bugs brace, and glue stops the gait',()=>{
 vm.runInContext("globalThis.subject=new Enemy('small',1,10,1);subject.y=TOWER_Y-50;subject.draw();subject.y+=.2;subject.draw();",box);
 assert.equal(art.stats.lastPose.state,'walk');vm.runInContext('subject.draw()',box);assert.equal(art.stats.lastPose.state,'attack');
 vm.runInContext('subject.y=150;subject.stuckToGlue=true;subject.draw()',box);assert.equal(art.stats.lastPose.state,'idle');
});
