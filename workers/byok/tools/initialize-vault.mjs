// Run once after deployment. Never writes or prints the encryption secret.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
function run(args,input){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[wrangler,...args],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',()=>{});
 child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error('Wrangler failed ('+code+'). Check login and deployment; no secret was printed.')));
 child.stdin.on('error',()=>{});child.stdin.end(input||'');
});}
const existing=JSON.parse(await run(['secret','list','--format','json']));
if(!Array.isArray(existing))throw Error('Could not verify the existing secrets.');
if(existing.some(s=>s.name==='VAULT_KEY'))console.log('VAULT_KEY already exists; left unchanged.');
else {await run(['secret','put','VAULT_KEY'],randomBytes(32).toString('hex')+'\n');console.log('VAULT_KEY initialized in Cloudflare. Its value was not saved locally.');}
