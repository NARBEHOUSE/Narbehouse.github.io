const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const route='trinkey-configurator';
const publicFiles=Object.freeze([
 'index.html','styles.css','app.mjs','guide.html',
 'assets/narbe-house.png','assets/trinkey-hero.png',
 'lib/bindings.mjs','lib/device.mjs','lib/installer.mjs','lib/uf2.mjs','lib/zip.mjs',
 'firmware/manifest.json','firmware/narbe_settings.mpy','firmware/narbe_device.mpy',
 'firmware/boot.py','firmware/code.py','firmware/circuitpython-10.0.3.uf2','firmware/CIRCUITPYTHON-LICENSE.txt'
]);
async function publishTrinkey(root,dist){
 const source=path.join(root,'TRINKEY-CONFIGURATOR');
 if((await fs.lstat(source)).isSymbolicLink())throw Error('Symlink in configurator source');
 const manifest=JSON.parse(await fs.readFile(path.join(source,'firmware/manifest.json'),'utf8'));
 const payload=['boot.py','code.py','narbe_device.mpy','narbe_settings.mpy'];
 if(manifest.board!=='adafruit_trrs_trinkey_m0'||manifest.base?.file!=='circuitpython-10.0.3.uf2'||JSON.stringify(Object.keys(manifest.files).sort())!==JSON.stringify(payload))throw Error('Unexpected configurator firmware manifest');
 const hashes={...manifest.files,[manifest.base.file]:manifest.base.sha256};
 for(const [name,expected]of Object.entries(hashes)){
  const digest=createHash('sha256').update(await fs.readFile(path.join(source,'firmware',name))).digest('hex');
  if(digest!==expected)throw Error('Configurator firmware hash mismatch: '+name);
 }
 for(const name of publicFiles){
  const from=path.join(source,name),to=path.join(dist,route,name);
  if((await fs.realpath(from))!==from)throw Error('Symlink in configurator public file: '+name);
  await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(from,to);
 }
}
module.exports={route,publicFiles,publishTrinkey};
