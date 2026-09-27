const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {urlKey,duplicate,mergeLibrary,mergeEpisodes}=require('../bennyshub/apps/tools/streaming/library-merge.js');
test('matching provider links normalize while distinct videos, episodes and playlists remain distinct',()=>{
  for(const pair of [
    ['https://youtu.be/abc?t=20','https://m.youtube.com/watch?v=abc&list=PLAYLIST'],
    ['https://www.netflix.com/title/123?trackId=1','https://netflix.com/watch/123'],
    ['https://www.disneyplus.com/browse/entity-c29f81d8-8c51-4fe7-bb0c-13f099ad3e90','https://www.disneyplus.com/play/c29f81d8-8c51-4fe7-bb0c-13f099ad3e90'],
    ['https://tubitv.com/movies/123/old-title?start=true','https://www.tubitv.com/movies/123/new-title'],
    ['https://www.primevideo.com/detail/0JSOQNXC38YDDVGBXDDTIMFZS7?tr=gb','https://primevideo.com/-/en/detail/0JSOQNXC38YDDVGBXDDTIMFZS7'],
    ['https://example.org/video/?b=2&utm_source=test&a=1','https://example.org/video?a=1&b=2']
  ])assert.equal(urlKey(pair[0]),urlKey(pair[1]));
  assert.notEqual(urlKey('https://youtube.com/watch?v=one'),urlKey('https://youtube.com/watch?v=two'));
  assert.notEqual(urlKey('https://youtube.com/playlist?list=one'),urlKey('https://youtube.com/playlist?list=two'));
  assert.notEqual(urlKey('https://app.plex.tv/#!/video/one'),urlKey('https://app.plex.tv/#!/video/two'));
  assert.notEqual(urlKey('https://example.org/watch?episode=1'),urlKey('https://example.org/watch?episode=2'));
});
test('imports preserve existing edits and links, skip repeated links, and can be repeated safely',()=>{
  const old=[{id:'mine',title:'My name',url:'https://youtu.be/abc',description:'Keep this'}];
  const input=[{id:'new',title:'Different name',url:'https://youtube.com/watch?v=abc'},{title:'New movie',url:'https://netflix.com/title/456'},{title:'Same movie',url:'https://netflix.com/watch/456'}];
  const before=JSON.stringify(old),result=mergeLibrary(old,input);
  assert.equal(result.added,1);assert.equal(result.skipped,2);assert.deepEqual(result.items[0],old[0]);assert.equal(JSON.stringify(old),before);
  assert.equal(mergeLibrary(result.items,input).added,0);assert.equal(duplicate(result.items,'https://youtube.com/embed/abc').title,'My name');assert.equal(duplicate(old,'https://youtu.be/abc','mine'),undefined);
  assert.throws(()=>mergeLibrary(Array.from({length:5000},(_,i)=>({url:'https://example.org/'+i})),[{url:'https://example.org/new'}]),/limit/);
});
test('episode imports keep existing episode numbers and skip reused links across seasons',()=>{
  const old={show:{1:[{episode:1,title:'Personal title',url:'https://youtu.be/one'}]}};
  const incoming={show:{1:[{episode:1,title:'Replacement',url:'https://youtu.be/changed'},{episode:2,title:'Second',url:'https://youtu.be/two'}],2:[{episode:1,title:'Duplicate link',url:'https://youtube.com/watch?v=one'}]}};
  const result=mergeEpisodes(old,incoming);assert.equal(result.added,1);assert.equal(result.skipped,2);assert.equal(result.items.show[1][0].title,'Personal title');assert.equal(old.show[1].length,1);
});
test('starter collections contain only supported public HTTPS links and never seed the private library',async()=>{
  const root=path.resolve(__dirname,'../bennyshub/apps/tools/streaming'),index=JSON.parse(fs.readFileSync(path.join(root,'collections/index.json'))),{streamURL}=await import('../extension/policy.mjs');
  const all=[];
  for(const pack of index.collections){const data=JSON.parse(fs.readFileSync(path.join(root,'collections',pack.file)));assert.equal(data.library.length,pack.count);for(const item of data.library){const url=streamURL(item.url);assert.ok(pack.hosts.includes(url.hostname));assert.ok(!url.hostname.includes('plex'));assert.ok(item.source_url);if(pack.id==='disney'||item.service==='Disney+')assert.match(url.pathname,/^\/play\/[a-f0-9-]{36}$/i);assert.equal(item.metadataSource,'TMDB',item.title);assert.match(item.image,/^https:\/\/image\.tmdb\.org\/t\/p\//,item.title);assert.ok(item.description,item.title);all.push(item);}}
  assert.ok(all.length>=150);
  assert.equal(mergeLibrary([],all).skipped,0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'data.json'))),[]);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'episodes.json'))),{});
});
