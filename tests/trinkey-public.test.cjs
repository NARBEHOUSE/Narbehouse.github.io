const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {route,publicFiles,publishTrinkey}=require('../scripts/trinkey-public.cjs');
const project=path.resolve(__dirname,'..'),artifacts=path.join(project,'artifacts');
async function fixture(t){
 await fs.mkdir(artifacts,{recursive:true});
 const temp=await fs.mkdtemp(path.join(artifacts,'trinkey-release-test-'));
 t.after(async()=>{const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(artifacts)+path.sep))throw Error('Unsafe cleanup path');await fs.rm(resolved,{recursive:true,force:true});});
 for(const name of publicFiles){const to=path.join(temp,'TRINKEY-CONFIGURATOR',name);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(path.join(project,'TRINKEY-CONFIGURATOR',name),to);}
 return {root:temp,dist:path.join(temp,'dist')};
}
test('configurator publishes its complete runtime at the lowercase route and excludes local backups',async t=>{
 const fixturePaths=await fixture(t);
 for(const name of ['artifacts/device-backup.uf2','tests/private.json','firmware/narbe_runtime.py','README.md','image.png']){
  const file=path.join(fixturePaths.root,'TRINKEY-CONFIGURATOR',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'local only');
 }
 await publishTrinkey(fixturePaths.root,fixturePaths.dist);
 assert.equal(route,'trinkey-configurator');
 const base=path.join(fixturePaths.dist,route);
 for(const name of ['index.html','guide.html','firmware/boot.py','firmware/code.py','firmware/narbe_device.mpy','firmware/circuitpython-10.0.3.uf2'])assert.ok((await fs.stat(path.join(base,name))).size);
 for(const name of ['artifacts','tests','firmware/narbe_runtime.py','README.md','image.png'])await assert.rejects(fs.stat(path.join(base,name)),{code:'ENOENT'});
});
test('configurator publication refuses an installation file that fails its manifest hash',async t=>{
 const fixturePaths=await fixture(t);
 await fs.appendFile(path.join(fixturePaths.root,'TRINKEY-CONFIGURATOR/firmware/code.py'),'\nchanged\n');
 await assert.rejects(publishTrinkey(fixturePaths.root,fixturePaths.dist),/hash mismatch: code.py/);
 await assert.rejects(fs.stat(fixturePaths.dist),{code:'ENOENT'});
});
