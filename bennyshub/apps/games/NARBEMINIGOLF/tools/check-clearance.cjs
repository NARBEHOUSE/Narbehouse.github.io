#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),THREE=require('../js/three.min.js');
const store=new Map(),ctx={console,THREE,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};
vm.createContext(ctx);
const load=f=>vm.runInContext(fs.readFileSync(path.join(base,'js',f),'utf8'),ctx,{filename:f});
['util.js','course.js','physics.js'].forEach(load);
const MG=ctx.MG,C=MG.course;
MG.art={dashTexture:()=>new THREE.Texture(),glowSprite:()=>new THREE.Texture()};MG.audio={};
load('fx.js');load('game.js');
const scene=new THREE.Scene();MG.fx.init(scene);
let holes=0,slopes=0;
for(const file of JSON.parse(fs.readFileSync(path.join(base,'courses/course_list.json')))){
 const course=C.normaliseCourse(JSON.parse(fs.readFileSync(path.join(base,'courses',file))));
 assert.equal(course.holes.length,18,file);
 assert.equal(new Set(course.holes.map(h=>h.name)).size,18);
 const length=h=>h.fairway.lane.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-h.fairway.lane[i].x,p.y-h.fairway.lane[i].y),0);
 assert.ok(course.holes.slice(9).reduce((n,h)=>n+length(h),0)>course.holes.slice(0,9).reduce((n,h)=>n+length(h),0)*1.3,'back nine adds route length');
 for(const h of course.holes){
  const ch=C.compileHole(h);assert.equal(C.validateHole(h).join('; '),'',file+': '+h.name);holes++;
  const view={ch,cupWorld:new THREE.Vector3(ch.cup.x*C.S,C.surfaceHeight(ch,ch.cup.x,ch.cup.y)*C.S,ch.cup.y*C.S),surfaceY:(x,y)=>C.surfaceHeight(ch,x,y)*C.S};
  MG.fx.setView(view);
  for(const k of [...ch.hills,...ch.bridges.map(b=>({x:b.cx,y:b.cy,radius:100}))]){
   for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI]){
    const end={x:k.x+Math.cos(angle)*k.radius*.35,y:k.y+Math.sin(angle)*k.radius*.35};
    MG.fx.setAim([{x:end.x-Math.cos(angle)*250,y:end.y-Math.sin(angle)*250},end],{width:28,ghostR:ch.ballR,ghostAt:end});
    const arrow=scene.children.find(m=>m.renderOrder===16);
    assert.ok(arrow.geometry.attributes.position.count>100,'arrowhead is tessellated');
    for(const m of scene.children.filter(m=>m.visible&&m.renderOrder>=14)) assert.equal(m.material.depthTest,false,'aim must remain visible over terrain');
    const p=arrow.geometry.attributes.position;
    for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-view.surfaceY(p.getX(i)/C.S,p.getZ(i)/C.S)-.10)<.0001,'arrow follows the slope at every vertex');
    slopes++;
   }
  }
 }
}
// Reproduce the old water-through-side defect and require rejection.
const bad=C.normaliseHole({start:{x:100,y:100,radius:12},end:{x:600,y:100,radius:24},fairway:{lane:[{x:50,y:100,w:220},{x:650,y:100,w:220}]},waters:[{x:350,y:100,radius:160}]});
assert.ok(C.validateHole(bad).some(e=>e.includes('waters')));
MG.util.save('best',{'sunny_meadows.json':{casual:18}});
assert.equal(MG.progress.best('sunny_meadows.json',18,'casual'),undefined);
assert.equal(MG.progress.record('sunny_meadows.json',18,'casual',54),true);
assert.equal(MG.progress.best('sunny_meadows.json',18,'casual'),54);
assert.equal(MG.util.load('best',{})['sunny_meadows.json'].casual,18,'old records retained');
console.log(holes+' holes: valid boundaries, longer back nines; '+slopes+' slope/bridge aim cases; old records retained separately.');
