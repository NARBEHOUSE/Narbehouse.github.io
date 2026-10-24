import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {zip} from '../lib/zip.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=data=>createHash('sha256').update(data).digest('hex');
const modules=[['narbe_config.py','narbe_settings.mpy'],['narbe_runtime.py','narbe_device.mpy']];
const compilerIndex=process.argv.indexOf('--compiler'),compiler=compilerIndex>=0?process.argv[compilerIndex+1]:process.env.NARBE_MPY_CROSS;
let compiled;
if(compiler){
 const version=execFileSync(compiler,['--version'],{encoding:'utf8',windowsHide:true}).trim();
 if(!version.includes('CircuitPython 10.0.3'))throw new Error('Use the official CircuitPython 10.0.3 mpy-cross compiler.');
 compiled={compiler:version,source:'https://adafruit-circuit-python.s3.amazonaws.com/bin/mpy-cross/windows/mpy-cross-windows-10.0.3.static.exe',modules:{}};
 for(const [source,output]of modules){
  execFileSync(compiler,['-s',output.replace('.mpy','.py'),'-o',path.join(root,'firmware',output),path.join(root,'firmware',source)],{windowsHide:true});
  compiled.modules[source]={source:hash(await fs.readFile(path.join(root,'firmware',source))),output:hash(await fs.readFile(path.join(root,'firmware',output)))};
 }
 await fs.writeFile(path.join(root,'firmware','compiled.json'),JSON.stringify(compiled,null,2)+'\n');
}else{
 compiled=JSON.parse(await fs.readFile(path.join(root,'firmware','compiled.json'),'utf8'));
 for(const [source,output]of modules){
  if(compiled.modules[source]?.source!==hash(await fs.readFile(path.join(root,'firmware',source)))||compiled.modules[source]?.output!==hash(await fs.readFile(path.join(root,'firmware',output))))
   throw new Error('Compiled firmware is stale. Run node scripts/package.mjs --compiler PATH_TO_MPY_CROSS_10.0.3');
 }
}
const manifest={version:'0.2.0',board:'adafruit_trrs_trinkey_m0',circuitpython:'10.x',files:{},
 base:{file:'circuitpython-10.0.3.uf2',sha256:hash(await fs.readFile(path.join(root,'firmware','circuitpython-10.0.3.uf2'))),source:'https://circuitpython.org/board/adafruit_trrs_trinkey_m0/',version:'10.0.3'}};
const entries=[];
for(const name of ['narbe_settings.mpy','narbe_device.mpy','boot.py','code.py']){
 const data=await fs.readFile(path.join(root,'firmware',name));manifest.files[name]=hash(data);entries.push([name,data]);
}
entries.push(['INSTALL.txt',await fs.readFile(path.join(root,'firmware','INSTALL.txt'),'utf8')]);
await fs.writeFile(path.join(root,'firmware','manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.mkdir(path.join(root,'downloads'),{recursive:true});
await fs.writeFile(path.join(root,'downloads','narbe-trinkey-0.2.0.zip'),new Uint8Array(await zip(entries).arrayBuffer()));
console.log('Packaged '+entries.length+' files. Compiled modules and manifest verified.');
