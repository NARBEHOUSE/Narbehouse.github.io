const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/movement.js'),'utf8'),context);
const Motion=vm.runInContext('BaseballPlayerMotion',context);
const player=(x,y)=>({x,y,active:true,visible:true,alpha:1,scaleX:1});
let checks=0;
function scenario(name,positions,goals,dt=1000/60) {
    const scene={},motion=new Motion(scene),players=positions.map(([x,y])=>motion.register(player(x,y)));
    let arrived=0,maxStep=0;
    goals.forEach(([index,x,y,ms])=>motion.move(players[index],x,y,ms,()=>arrived++));
    for(let time=0;time<14000&&motion.moves.size;time+=dt) {
        const previous=players.map(p=>({x:p.x,y:p.y}));motion.update(dt);
        players.forEach((p,i)=>{maxStep=Math.max(maxStep,Math.hypot(p.x-previous[i].x,p.y-previous[i].y));});
        for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++) {
            assert(Math.hypot(players[i].x-players[j].x,players[i].y-players[j].y)>=17.48,
                name+': ground footprints overlap');checks++;
        }
    }
    assert.equal(arrived,goals.length,name+': movement stalled');
    goals.forEach(([index,x,y])=>assert(Math.hypot(players[index].x-x,players[index].y-y)<.02,name+': early callback'));
    return {motion,players,maxStep};
}
scenario('stationary teammate',[[-90,0],[0,0]],[[0,90,0,1500]]);
scenario('head-on exchange',[[-90,0],[90,0]],[[0,90,0,1500],[1,-90,0,1500]]);
scenario('crossing paths',[[-90,0],[0,-90]],[[0,90,0,1500],[1,0,90,1500]]);
scenario('occupied base with departure',[[-90,0],[0,0]],[[0,0,0,1500],[1,90,0,2000]]);
scenario('first-base coverage',[[460,514],[690,380]],[[0,665,398,2300],[1,653,385,650]]);
scenario('cluster detour',[[-90,0],[0,0],[0,22],[0,-22]],[[0,90,0,1500]]);
scenario('dugout queue',Array.from({length:9},(_,i)=>[-60-(i%3)*24,470+Math.floor(i/3)*24]),
    Array.from({length:9},(_,i)=>[i,200+(i%3)*80,180+Math.floor(i/3)*100,2200]));
const slow=scenario('slow frames',[[-90,0],[0,0]],[[0,90,0,1500]],250);
assert(slow.maxStep<=12.01,'slow frame teleported through the obstruction');
const m=new Motion({}),p=m.register(player(0,0));let stale=0,finished=0;
m.move(p,100,0,1000,()=>stale++);m.update(100);
m.move(p,0,80,1000,()=>finished++);
for(let i=0;i<200;i++)m.update(16);
assert.equal(stale,0);assert.equal(finished,1);
m.move(p,80,80,500,()=>stale++);p.active=false;m.update(16);assert.equal(m.moves.size,0);assert.equal(stale,0);
console.log('Movement checks passed:',checks,'pairwise separation checks; crossings, queues, coverage, retargeting and slow frames.');
