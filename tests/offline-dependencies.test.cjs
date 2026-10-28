'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../bennyshub'),vendor=path.join(root,'shared/offline-vendor');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('offline engine and font files retain their recorded downloaded bytes',()=>{
 const sources=JSON.parse(fs.readFileSync(path.join(vendor,'SOURCES.json'),'utf8'));
 for(const item of sources.files){const data=fs.readFileSync(path.join(vendor,item.file));assert.equal(data.length,item.bytes,item.file);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256,item.file);assert.ok(item.source.length,item.file+' has download provenance');}
});
test('all game page engines and styles are served locally',()=>{
 for(const file of walk(path.join(root,'apps/games')).filter(f=>/\.html$/.test(f)&&!/[\\/]tools[\\/]/.test(f))){
  const html=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i,file);
  assert.doesNotMatch(html,/<link[^>]+(?:rel=["']stylesheet["'][^>]+href=["']https?:|href=["']https?:[^>]+rel=["']stylesheet)/i,file);
  for(const match of html.matchAll(/(?:src|href)=["']([^"']*shared\/offline-vendor\/[^"']+)["']/g)){assert.ok(fs.existsSync(path.resolve(path.dirname(file),match[1])),file+': '+match[1]);}
 }
 const dice=fs.readFileSync(path.join(root,'apps/games/BENNYSDICE/index.html'),'utf8');
 const importMap=JSON.parse(dice.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
 for(const href of Object.values(importMap.imports)){assert.ok(!/^https?:/.test(href));assert.ok(fs.existsSync(path.resolve(root,'apps/games/BENNYSDICE',href)));}
});
test('offline stylesheets have complete local font dependencies',()=>{
 for(const file of walk(vendor).filter(f=>f.endsWith('.css'))){
  const css=fs.readFileSync(file,'utf8');
  for(const match of css.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g)){assert.ok(!/^https?:/.test(match[1]),file);assert.ok(fs.existsSync(path.resolve(path.dirname(file),match[1])),file+': '+match[1]);}
 }
});
