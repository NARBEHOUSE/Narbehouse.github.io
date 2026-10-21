const fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),game=path.resolve(__dirname,'../../bennyshub/apps/games/BENNYSBUGBLASTER');
const source=fs.readFileSync(game+'/game.js','utf8'),crowd=fs.readFileSync(game+'/crowd.js','utf8');
function setup(seed,width=1280,height=720){
 let time=100000,rand=seed;const noop=()=>{};
 const rng=()=>{rand=(Math.imul(rand,1664525)+1013904223)>>>0;return rand/4294967296;};
 const math=Object.create(Math);math.random=rng;
 const gradient={addColorStop:noop};
 const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:()=>({width:10})},{get:(o,k)=>k in o?o[k]:noop});
 const canvas={getContext:()=>context,addEventListener:noop};
 const box={Math:math,Date:{now:()=>time},console:{log:noop},Audio:class{play(){return Promise.resolve();}cloneNode(){return this;}},requestAnimationFrame:noop,setTimeout:noop,clearTimeout:noop,setInterval:noop,clearInterval:noop,document:{getElementById:()=>canvas,addEventListener:noop},window:{innerWidth:width,innerHeight:height,addEventListener:noop}};
 vm.createContext(box);vm.runInContext(fs.readFileSync(game+'/progression.js','utf8'),box);vm.runInContext(crowd,box);vm.runInContext(source,box);
 vm.runInContext('tts_enabled=false;sfx_enabled=false;music_enabled=false;Tower.prototype.draw=Enemy.prototype.draw=TowerUnit.prototype.draw=TowerProjectile.prototype.draw=EnemyProjectile.prototype.draw=()=>{};draw_grass=draw_glue_trap=draw_damage_zone=draw_health_bar=draw_timer_bar=draw_shield=draw_window_controls=()=>{};',box);
 box.tick=(ms)=>{time+=ms;};return box;
}

module.exports={setup,vm};
