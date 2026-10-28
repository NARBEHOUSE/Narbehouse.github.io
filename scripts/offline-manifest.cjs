'use strict';
const fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {isPublicFile}=require('./public-files.cjs');
const MANIFEST='offline-manifest.json';
// Optional speech/AI packages retain their existing explicit download flows.
// User media, streaming and API data never enter this static public inventory.
function isOfflineAsset(relative){
  return !/^(?:offline-manifest\.json|service-worker\.js)$/.test(relative)
    && !/^(?:downloads|shared\/(?:communication-vendor|communication-fast-vendor|communication-voices)|apps\/tools\/rtc-lite\/vendor)(?:\/|$)/.test(relative);
}
function assetUrl(relative){return './'+relative.split('/').map(encodeURIComponent).join('/');}
async function hashFile(file){
  const digest=crypto.createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(file)){bytes+=chunk.length;digest.update(chunk);}
  return {revision:digest.digest('hex'),bytes};
}
async function createOfflineManifest(root){
  root=path.resolve(root);const hub=path.join(root,'bennyshub'),files=[];
  async function visit(directory){
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name),relative=path.relative(hub,file).split(path.sep).join('/');
      if(!isOfflineAsset(relative)||!await isPublicFile(root,file))continue;
      if(entry.isDirectory())await visit(file);else if(entry.isFile())files.push({file,relative});
    }
  }
  await visit(hub);
  files.sort((a,b)=>a.relative<b.relative?-1:a.relative>b.relative?1:0);
  const assets=new Array(files.length);let next=0;
  await Promise.all(Array.from({length:4},async()=>{while(next<files.length){const i=next++,item=files[i];assets[i]={url:assetUrl(item.relative),...await hashFile(item.file)};}}));
  return {schema:1,version:crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex'),totalBytes:assets.reduce((sum,item)=>sum+item.bytes,0),assets,excludedFeatures:['Streaming and online services','Optional AI models and downloaded voices']};
}
async function writeOfflineManifest(root){
  const manifest=await createOfflineManifest(root);
  await fs.writeFile(path.join(root,'bennyshub',MANIFEST),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
module.exports={isOfflineAsset,assetUrl,createOfflineManifest,writeOfflineManifest};
if(require.main===module){
  const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
  writeOfflineManifest(root).then(manifest=>console.log(JSON.stringify({version:manifest.version,files:manifest.assets.length,totalBytes:manifest.totalBytes}))).catch(error=>{console.error(error);process.exitCode=1;});
}
