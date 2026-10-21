/* Campaign prices and next-rank unlocks, shared by the store and purchase validation. */
(function(root){
'use strict';
const catalog=[
 {name:'Salt Shot',costs:[200,200,300,400,550,750],levels:[3,5,7,9,12,16]},
 {name:'Shot Power',costs:[200,350,600],levels:[4,8,13],requires:0},
 {name:'Repair House',costs:[50],levels:[2],kind:'repair'},
 {name:'Defender Bugs',costs:[150,250,400],levels:[2,6,11]},
 {name:'Defender Frequency',costs:[300,500],levels:[7,12],requires:3},
 {name:'Expand House',costs:[1500,2200],levels:[9,17]},
 {name:'Bug Bomb',costs:[1500],levels:[11]},
 {name:'Bomb Frequency',costs:[1300],levels:[18],requires:6},
 {name:'Bug Zapper Beam',costs:[900],levels:[7]},
 {name:'Healing',costs:[600,1100,1700],levels:[6,12,19]},
 {name:'Bug Net',costs:[350],levels:[5],kind:'net'},
 {name:'Upgrade Net',costs:[200,350,500],levels:[8,12,18],requires:10,kind:'net'},
 {name:'Boot Stomp',costs:[400,850],levels:[4,10]},
 {name:'Glue Traps',costs:[100],levels:[4],kind:'consumable'}
];
const healingIntervals={1:12,2:6,3:5};
const saltCooldowns=[null,10,8,6,4,2.5,1.75];
const repeatable=i=>i===2||i===13;
function createOptions(){return catalog.map((c,i)=>({name:c.name,cost:c.costs[0],max:repeatable(i)?Infinity:c.costs.length,purchased:0}));}
function offer(index,state){
 const c=catalog[index],owned=state.options[index].purchased;
 const rank=repeatable(index)?0:Math.max(0,Math.min(owned,c.costs.length-1));
 const cost=c.costs[rank],level=c.levels[rank],maxed=!repeatable(index)&&owned>=c.costs.length;
 const locked=!maxed&&state.level<level;
 const kind=c.kind==='consumable'?'Consumable: 1 level':c.kind==='repair'?'Use once':c.kind==='net'?'Refills each level':'Permanent';
 let note=kind;
 if(maxed)note='Fully upgraded';
 else if(locked)note='After level '+(level-1);
 else if(c.requires!==undefined&&state.options[c.requires].purchased<1)note='Needs '+catalog[c.requires].name;
 else if(index===13&&state.glue)note='Ready for next level';
 else if(index===2&&state.health>=state.maxHealth)note='Health is full';
 else if(state.points<cost)note='Need '+(cost-state.points)+' more';
 const enabled=!maxed&&!locked&&note===kind;
 return {index,name:c.name,cost,purchased:owned,rank:rank+1,max:c.costs.length,unlockLevel:level,locked,maxed,kind,note,enabled};
}
function label(index,state){const o=offer(index,state);return o.name+', '+o.cost+' points'+(index===13?', consumable for the next level only':'');}
const api={catalog,createOptions,offer,label,healingIntervals,saltCooldowns};
root.BugBlasterProgression=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
