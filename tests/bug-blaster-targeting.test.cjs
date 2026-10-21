const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../bennyshub/apps/games/BENNYSBUGBLASTER/game.js'),'utf8');
const functions=source.slice(source.indexOf('function select_salt_shot_target()'),source.indexOf('function update_enemy_projectiles()'));
function setup(){
 let time=100;
 const box={enemies:[],focused_enemy:null,tower_projectiles:[],tower_last_projectile_time:0,
  buy_menu_options:[{purchased:1},{purchased:0}],towers:[{x:100,y:500,size:150}],
  SCREEN_WIDTH:1440,SCREEN_HEIGHT:960,window:{BugBlasterProgression:require('../bennyshub/apps/games/BENNYSBUGBLASTER/progression.js')},Math,Date:{now:()=>time*1000},sounds:[],
  TowerProjectile:class{constructor(x,y,tx,ty,damage){Object.assign(this,{x,y,tx,ty,damage,radius:5});}move(){}draw(){}},
  playSound(name){box.sounds.push(name);},removeEnemy(e){e.isDead=true;}};
 vm.createContext(box);vm.runInContext(functions,box);
 return Object.assign(box,{advance(seconds){time+=seconds;}});
}
const bug=(hp,y,extra={})=>({hp,y,x:200,etype:'small',isDead:false,...extra});
test('highest current HP wins; closest to the fence breaks ties',()=>{
 const s=setup(),near=bug(3,700),far=bug(50,120),closer=bug(50,450);
 s.enemies=[near,far,closer];assert.equal(s.select_salt_shot_target(),closer);
});
test('each volley replaces a stale target with the current priority',()=>{
 const s=setup(),first=bug(1,700),strong=bug(50,100);s.enemies=[first];s.fire_tower_projectile();
 s.enemies.push(strong);s.advance(10);s.fire_tower_projectile();assert.equal(s.focused_enemy,strong);
 strong.hp=1;s.advance(10);s.fire_tower_projectile();assert.equal(s.focused_enemy,first);
});
test('dying and zero-HP bugs cannot be targeted',()=>{
 const s=setup(),live=bug(1,300);s.enemies=[bug(100,700,{isDead:true}),bug(0,750),live];
 assert.equal(s.select_salt_shot_target(),live);
});
test('an empty or fully defeated wave does not spend a volley',()=>{
 const s=setup();s.enemies=[bug(100,700,{isDead:true})];s.focused_enemy=s.enemies[0];s.fire_tower_projectile();
 assert.equal(s.focused_enemy,null);assert.equal(s.tower_projectiles.length,0);assert.equal(s.tower_last_projectile_time,0);assert.equal(s.sounds.length,0);
 s.enemies=[];assert.equal(s.select_salt_shot_target(),null);
});
test('purchase requirement, cadence, power and one shot per house remain',()=>{
 const s=setup();s.enemies=[bug(5,300)];s.buy_menu_options[0].purchased=0;s.fire_tower_projectile();assert.equal(s.tower_projectiles.length,0);
 s.buy_menu_options[0].purchased=3;s.buy_menu_options[1].purchased=2;s.towers.push({x:50,y:500,size:105},{x:300,y:500,size:105});
 s.fire_tower_projectile();assert.equal(s.tower_projectiles.length,3);assert.ok(s.tower_projectiles.every(p=>p.damage===3));
 s.advance(5);s.fire_tower_projectile();assert.equal(s.tower_projectiles.length,3);
 s.advance(1);s.fire_tower_projectile();assert.equal(s.tower_projectiles.length,6);assert.equal(s.sounds.length,2);
});
test('defeated bugs do not absorb salt meant for a living bug',()=>{
 const s=setup(),live=bug(3,300),dead=bug(0,300,{isDead:true});s.enemies=[live,dead];
 s.tower_projectiles=[new s.TowerProjectile(200,300,200,300,2)];s.update_tower_projectiles();
 assert.equal(live.hp,1);assert.equal(dead.hp,0);assert.equal(s.tower_projectiles.length,0);
});
