'use strict';
// Benny's Hub cards show each catalog description under the title and speak it with the title when the scan
// reaches the card. Long descriptions made the cards grow out of the grid (worst at the larger text sizes) and
// made scanning slow, so every description is kept short (owner's request, 2026-11-28).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const LIMIT=120;
const root=path.resolve(__dirname,'..');
for(const kind of ['games','tools']){
  test(`every ${kind}.json card description is 1 to ${LIMIT} characters`,()=>{
    const items=JSON.parse(fs.readFileSync(path.join(root,'bennyshub/apps',kind,kind+'.json'),'utf8'))[kind];
    const problems=items.filter(item=>typeof item.description!=='string'||!item.description.trim()||item.description.length>LIMIT)
      .map(item=>`${item.id}: ${typeof item.description==='string'?item.description.length:'no'} characters`);
    assert.deepEqual(problems,[],`shorten these to ${LIMIT} characters or fewer`);
  });
}
