const test=require('node:test'),assert=require('node:assert/strict');
const {setup,vm}=require('./helpers/bug-blaster-runtime.cjs');
const run=(box,code)=>JSON.parse(JSON.stringify(vm.runInContext(code,box)));
test('level one shows no purchasable upgrades even with an oversized budget',()=>{
 const s=setup(1);assert.deepEqual(run(s,'points=100000;getVisibleBuyOptions()'),[14,16]);
 const before=run(s,'capture_store_state()');vm.runInContext('for(let i=0;i<14;i++)tryBuyItem(i)',s);assert.deepEqual(run(s,'capture_store_state()'),before);
});
test('Salt Shot opens after level two and its next rank remains locked',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=2;points=1000;tryBuyItem(0);[points,buy_menu_options[0].purchased,getBuyItemState(0).locked]'),[1000,0,true]);
 assert.deepEqual(run(s,'wave_number=3;tryBuyItem(0);tryBuyItem(0);[points,buy_menu_options[0].purchased,getBuyItemState(0).unlockLevel]'),[800,1,5]);
});
test('budget and prerequisites are enforced by both scan and purchase paths',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=4;points=10000;tryBuyItem(1);[points,buy_menu_options[1].purchased,getVisibleBuyOptions().includes(1)]'),[10000,0,false]);
 assert.deepEqual(run(s,'points=199;tryBuyItem(0);[points,buy_menu_options[0].purchased]'),[199,0]);
 assert.deepEqual(run(s,'points=200;tryBuyItem(0);[points,buy_menu_options[0].purchased]'),[0,1]);
});
test('boot price, charge, refund and cooldown agree at both ranks',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=4;points=2000;tryBuyItem(12);[points,stomp_cooldown_max,buy_menu_options[12].cost]'),[1600,3,850]);
 assert.deepEqual(run(s,'wave_number=10;tryBuyItem(12);[points,stomp_cooldown_max,buy_menu_options[12].purchased]'),[750,2,2]);
 assert.deepEqual(run(s,'undoLastPurchase();[points,stomp_cooldown_max,buy_menu_options[12].purchased]'),[1600,3,1]);
});
test('glue is a one-level consumable with no duplicate charge or lifetime ownership counter',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=4;points=500;tryBuyItem(13);tryBuyItem(13);[points,glue_trap_active,glue_traps.length,buy_menu_options[13].purchased,getVisibleBuyOptions().includes(13),getBuyItemState(13).note]'),[400,true,5,0,false,'Ready for next level']);
 assert.match(vm.runInContext('getBuyLabel(13)',s),/consumable for the next level only/);
 assert.deepEqual(run(s,'undoLastPurchase();[points,glue_trap_active,glue_traps.length]'),[500,false,0]);
});
test('glue expires before the next store checkpoint and can be bought again',()=>{
 const s=setup(1);vm.runInContext('wave_number=4;points=500;save_store_state();tryBuyItem(13);start_level();finish_level_intro();game_time_start-=151;loop()',s);
 assert.deepEqual(run(s,'[wave_number,gameState,glue_trap_active,glue_traps.length,store_backup_state.glue_trap_active,getVisibleBuyOptions().includes(13)]'),[5,'BUY',false,0,false,true]);
});
test('restarting restores the pre-purchase budget and consumes no extra glue payment',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=4;points=500;save_store_state();tryBuyItem(13);start_level();restore_store_state();[points,glue_trap_active,purchaseHistory.length]'),[500,false,0]);
});
test('repair undo restores exactly the health and budget without negative purchase counts',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=2;points=150;tower_hp=73;tryBuyItem(2);[tower_hp,points,buy_menu_options[2].purchased]'),[100,100,0]);
 assert.deepEqual(run(s,'undoLastPurchase();[tower_hp,points,buy_menu_options[2].purchased]'),[73,150,0]);
});
test('net strength in the store matches the start of the level',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=8;points=2000;tryBuyItem(10);tryBuyItem(11);[max_shield_hp,shield_hp]'),[100,100]);
 assert.deepEqual(run(s,'start_level();[max_shield_hp,shield_hp]'),[100,100]);
});
test('undoing a net purchase removes the actual shield',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=5;points=350;tryBuyItem(10);undoLastPurchase();[points,shield_active,shield_hp,max_shield_hp,buy_menu_options[10].purchased]'),[350,false,0,0,0]);
});
test('house upgrade and chained undo restore all state, including earlier glue',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=9;points=2000;tryBuyItem(13);tryBuyItem(5);undoLastPurchase();[points,tower_hp,max_tower_hp,glue_trap_active]'),[1900,100,100,true]);
 assert.deepEqual(run(s,'undoLastPurchase();[points,glue_trap_active,glue_traps.length]'),[2000,false,0]);
});
test('new game clears consumables, projectiles and upgraded boot cooldown',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=10;points=10000;tryBuyItem(13);tryBuyItem(12);tryBuyItem(12);enemy_projectiles.push({});reset_game_state();[points,wave_number,glue_trap_active,glue_traps.length,enemy_projectiles.length,stomp_cooldown_max]'),[0,1,false,0,0,4]);
});
test('all rank prices are affordable to display and later ranks open strictly later',()=>{
 const {catalog}=require('../bennyshub/apps/games/BENNYSBUGBLASTER/progression.js');
 for(const item of catalog){assert.equal(item.costs.length,item.levels.length);item.costs.forEach((cost,i)=>{assert.ok(Number.isInteger(cost)&&cost>0);if(i){assert.ok(cost>=item.costs[i-1]);assert.ok(item.levels[i]>item.levels[i-1]);}});}
});

test('a broken net keeps its purchased upgrades and refills next level',()=>{
 const s=setup(1);assert.deepEqual(run(s,"wave_number=8;points=2000;tryBuyItem(10);tryBuyItem(11);shield_hp=1;const e=new Enemy('small',1,0,5);e.y=TOWER_Y;enemies=[e];check_shield_damage();[shield_active,buy_menu_options[10].purchased,buy_menu_options[11].purchased]"),[false,1,1]);
 assert.deepEqual(run(s,'start_level();[shield_active,shield_hp,max_shield_hp]'),[true,100,100]);
});
test('house repair cannot charge for net damage that refills free next level',()=>{
 const s=setup(1);assert.deepEqual(run(s,'wave_number=5;points=1000;tryBuyItem(10);shield_hp=10;tryBuyItem(2);[points,shield_hp,getVisibleBuyOptions().includes(2)]'),[650,10,false]);
});

test('first-rank unlocks stay within one reward of a repair-reserved budget',()=>{
 const {catalog}=require('../bennyshub/apps/games/BENNYSBUGBLASTER/progression.js');
 const first=[3,0,12,10,9,8,5,6].map(i=>({i,level:catalog[i].levels[0],cost:catalog[i].costs[0]}));
 let bank=0;const waiting=[],bought=[];
 for(let level=2;level<=20;level++){
  bank+=100*level-50; // Guaranteed prior-level reward; keep 50 for house repair.
  waiting.push(...first.filter(x=>x.level===level));
  while(waiting.length&&bank>=waiting[0].cost){const item=waiting.shift();bank-=item.cost;bought.push(item.i);assert.ok(level-item.level<=1,catalog[item.i].name+' waits too long');}
 }
 assert.equal(bought.length,first.length);
});
