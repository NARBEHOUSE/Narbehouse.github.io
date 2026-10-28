'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createOfflineManifest,writeOfflineManifest,assetUrl}=require('../scripts/offline-manifest.cjs');
const {isPublicFile}=require('../scripts/public-files.cjs');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hub-offline-manifest-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const put=async(relative,content='fixture')=>{const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);return file;};
  return {root,put};
}
test('offline inventory covers unopened nested runtime assets and safely encodes URLs',async t=>{
  const {root,put}=await fixture(t);
  const content='A game asset that has never been opened';
  await put('bennyshub/index.html','Hub');
  await put('bennyshub/apps/games/TEST/levels/Bonus #1.json',content);
  await put('bennyshub/apps/games/TEST/audio/hello world.ogg');
  await put('bennyshub/shared/offline-vendor/engine.js');
  await put('bennyshub/shared/hub-library.js');
  const manifest=await createOfflineManifest(root);
  assert.equal(manifest.schema,1);assert.equal(manifest.assets.length,5);
  const asset=manifest.assets.find(item=>item.url.includes('Bonus%20%231'));
  assert.deepEqual(asset,{url:'./apps/games/TEST/levels/Bonus%20%231.json',revision:crypto.createHash('sha256').update(content).digest('hex'),bytes:Buffer.byteLength(content)});
  assert.equal(manifest.totalBytes,manifest.assets.reduce((sum,item)=>sum+item.bytes,0));
  assert.equal(assetUrl('apps/a?/é.png'),'./apps/a%3F/%C3%A9.png');
});
test('source inventory shares build exclusions and leaves optional downloads out',async t=>{
  const {root,put}=await fixture(t);
  await put('bennyshub/index.html');
  const privatePaths=[
    'bennyshub/.private.json','bennyshub/apps/games/TEST/tests/example.json',
    'bennyshub/apps/games/TEST/tools/source.js','bennyshub/apps/games/TEST/node_modules/code.js',
    'bennyshub/apps/games/TEST/rights and publishing/license.txt',
    'bennyshub/apps/games/NARBESWITCHSTORIES/stories/test/source/page.png',
    'bennyshub/apps/games/CHASINGRAINBOWS/REFERENCE DATA/page.png',
    'bennyshub/apps/games/BENNYSFISHMYSTERY/content/story.json',
    'bennyshub/apps/tools/keyboard/kenlm/model.bin','bennyshub/test-player.js'
  ];
  for(const relative of privatePaths){const file=await put(relative);assert.equal(await isPublicFile(root,file),false,relative);}
  for(const relative of ['offline-manifest.json','service-worker.js','downloads/old.zip','apps/tools/rtc-lite/vendor/model.js','shared/communication-vendor/engine.js','shared/communication-fast-vendor/voice.wasm','shared/communication-voices/a2.bin'])await put('bennyshub/'+relative);
  const manifest=await createOfflineManifest(root);
  assert.deepEqual(manifest.assets.map(item=>item.url),['./index.html']);
});
test('inventory revisions are stable across writes and update when content changes',async t=>{
  const {root,put}=await fixture(t);
  await put('bennyshub/index.html','Hub');await put('bennyshub/apps/games/TEST/index.html','Before');
  const first=await writeOfflineManifest(root),same=await writeOfflineManifest(root);
  assert.deepEqual(same,first,'generated manifest must not inventory itself');
  await put('bennyshub/apps/games/TEST/index.html','After!');
  const changed=await createOfflineManifest(root);
  assert.notEqual(changed.version,first.version);
  assert.equal(changed.assets.find(item=>item.url==='./index.html').revision,first.assets.find(item=>item.url==='./index.html').revision);
  assert.notEqual(changed.assets[0].revision,first.assets[0].revision);
});
test('all Hub catalog entry pages and thumbnails are represented by the offline inventory',async()=>{
  const root=path.resolve(__dirname,'..'),manifest=JSON.parse(await fs.readFile(path.join(root,'bennyshub/offline-manifest.json'),'utf8'));
  const urls=new Set(manifest.assets.map(item=>item.url));
  for(const kind of ['games','tools']){
    const catalog=JSON.parse(await fs.readFile(path.join(root,'bennyshub/apps',kind,kind+'.json'),'utf8'));
    for(const item of catalog[kind]){
      for(const field of ['path','image']){const local=item[field].split('?')[0];assert.ok(urls.has(assetUrl(local)),kind+': '+item.id+' '+field);}
    }
  }
});
