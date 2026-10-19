const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const box = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../bennyshub/apps/games/BENNYSBUGBLASTER/crowd.js'), 'utf8'), box);
const crowd = box.BugBlasterCrowd;
function checkSpacing(bugs, width) {
  for (let i=0;i<bugs.length;i++) {
    const a=bugs[i];
    assert.ok(a.x >= crowd.radius(a)-0.01 && a.x <= width-crowd.radius(a)+0.01, 'stay inside side edges');
    for(let j=i+1;j<bugs.length;j++) {
      const b=bugs[j];
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y) >= crowd.radius(a)+crowd.radius(b)+2.98, 'living bugs never stack');
    }
  }
}
for (const width of [360,768,1440]) test('spawn and overtaking remain separated at width '+width, () => {
  const bugs=[];
  for(let i=0;i<80;i++) {
    const bug={x:width/2,y:80,baseX:width/2,etype:['small','medium','large','extra_large','boss'][i%5],hp:10,damage:2};
    crowd.placeSpawn(bug,bugs,80,width);bugs.push(bug);
  }
  checkSpacing(bugs,width);
  for(let tick=0;tick<500;tick++) {
    for(let i=0;i<bugs.length;i++)bugs[i].y+=(i%5+1)*0.12;
    crowd.resolve(bugs,width);
    if(tick%50===0)checkSpacing(bugs,width);
  }
  checkSpacing(bugs,width);
  assert.ok(bugs.every(b=>b.hp===10&&b.damage===2), 'spacing never applies combat damage');
});
test('glued bug stays anchored while the follower passes',()=>{
  const stuck={x:150,y:250,baseX:150,etype:'extra_large',stuckToGlue:true};
  const follower={x:150,y:245,baseX:150,etype:'small'};
  crowd.resolve([stuck,follower],360);
  assert.equal(stuck.x,150);assert.equal(stuck.y,250);
  assert.equal(follower.x-follower.baseX,0,'ant zigzag lane follows its sidestep');
  checkSpacing([stuck,follower],360);
});
test('defenders leave the same doorway without stacking',()=>{
  const units=[];
  for(let i=0;i<3;i++){const unit={x:180,y:600};crowd.placeSpawn(unit,units,600,360);units.push(unit);}
  crowd.resolve(units,360);checkSpacing(units,360);
});
test('faded enemies do not block living bugs',()=>{
  const dead={x:180,y:300,etype:'boss',isDead:true};
  const bug={x:180,y:300,baseX:180,etype:'small'};
  crowd.resolve([dead,bug],360);
  assert.equal(bug.x,180);assert.equal(bug.y,300);
});
