/** A kingdom is a complete, ordered campaign. Stable IDs keep saves independent of menu order. */
RT.campaigns=(function(){
  'use strict';
  const kingdoms=[
    {id:'bramblewick',name:'Bramblewick',sub:'Village roads, seasonal sieges and the crown castle',wall:'S',home:'W',guard:'Q',story:'Defeat the guards occupying Bramblewick. Reopen the village roads, protect the townspeople and clear the royal castle so the festival can return.',ending:'Every guard has been defeated. The roads are open, the townspeople are safe and Bramblewick can celebrate again.'},
    {id:'coppercoast',name:'Coppercoast',sub:'Harbor cottages, brick manors and island forts',wall:'M',home:'P',guard:'H',story:'Reopen the coast for the trading ships. Clear the occupied fishing huts, reclaim the harbor manor and work your way to the admiral’s island castle.',ending:'Every guard has been defeated. The harbor roads are safe and Coppercoast can welcome its fishing boats and traders again.'},
    {id:'mossmere',name:'Mossmere',sub:'Forest lodges, mossy walls and a moated citadel',wall:'C',home:'W',guard:'J',story:'Open the old forest road. Start at the occupied lodges, break through the warden’s manor and conquer the moated citadel beyond the trees.',ending:'The forest road is open from end to end. Mossmere’s villages are reunited and the moated citadel is yours.'}
  ];
  function grid(w,h,d){const cells=Array.from({length:d},()=>Array.from({length:h},()=>Array(w).fill('.')));return{put(x,y,z,ch){if(x>=0&&x<w&&y>=0&&y<h&&z>=0&&z<d)cells[z][h-1-y][x]=ch;},layers:()=>cells.map(l=>l.map(r=>r.join('')))};}
  function settlement(k,tier,variant){
    const sizes=[[[5,3,7],[11,6,8],[15,7,10]],[[7,4,6],[14,6,8],[17,8,9]],[[7,5,8],[13,8,9],[17,10,11]]][variant];
    const [w,d,h]=sizes[tier],g=grid(w,h,d),put=g.put;
    function house(x,z,width,depth,height,mat){
      for(let zz=z;zz<z+depth;zz++)for(let xx=x;xx<x+width;xx++){
        const edge=xx===x||xx===x+width-1||zz===z+depth-1;
        if(edge)for(let y=0;y<height;y++)put(xx,y,zz,variant===2&&y===0?'C':mat);
        if(zz===z&&xx>x&&xx<x+width-1&&tier>0)put(xx,0,zz,'I');
        put(xx,height,zz,'W');
      }
      if(variant===0){for(let zz=z;zz<z+depth;zz++)for(let xx=x;xx<x+width;xx++)put(xx,height+1,zz,'R');}
      else if(variant===1){for(let xx=x;xx<x+width;xx++)put(xx,height+1,z+depth-1,'P');for(const xx of [x,x+width-1])put(xx,height+1,z,'M');}
      else{for(let zz=z;zz<z+depth;zz++)for(let xx=x+1;xx<x+width-1;xx++)put(xx,height+1,zz,'W');put(x+1,height+2,z+depth-1,'C');}
      put(x+Math.floor(width/2),0,z+1,'K');
    }
    if(variant===0){if(tier===0)house(0,0,5,3,2,'W');if(tier===1){house(0,0,5,3,2,'W');house(6,3,5,3,3,'W');put(5,0,4,'U');}if(tier===2){house(4,1,7,5,4,'W');house(0,0,3,4,3,'S');house(12,0,3,4,3,'S');put(7,0,0,'Q');put(2,0,5,'T');}}
    if(variant===1){if(tier===0){house(0,1,7,3,2,'P');for(let x=0;x<7;x++)put(x,0,0,'W');}if(tier===1){house(0,0,7,4,2,'P');house(9,2,5,4,2,'P');for(let z=0;z<2;z++)for(let x=11;x<13;x++)for(let y=0;y<5;y++)put(x,y,z,'M');put(11,5,0,'H');}if(tier===2){house(5,2,7,5,3,'P');house(0,0,4,6,3,'M');house(13,1,4,5,4,'P');put(8,0,0,'H');put(4,0,6,'T');}}
    if(variant===2){if(tier===0)house(0,1,7,4,2,'W');if(tier===1){house(0,0,5,5,3,'W');house(6,4,7,4,2,'W');put(7,0,1,'U');}if(tier===2){house(4,2,9,6,4,'W');house(0,3,3,6,2,'C');house(14,0,3,4,5,'C');put(8,0,0,'J');put(3,0,8,'T');}}
    return g.layers();
  }
  function fortress(k,tier,variant){
    const w=[16,18,17][variant]+(tier-3)*2,d=[8,6,9][variant]+(tier-3)*2,th=tier+[1,0,2][variant],g=grid(w,th+4,d),put=g.put;
    for(const x0 of [0,w-2])for(const z0 of [0,d-2])for(let x=x0;x<x0+2;x++)for(let z=z0;z<z0+2;z++)for(let y=0;y<th;y++)put(x,y,z,k.wall);
    for(let z=2;z<d-2;z++)for(let y=0;y<2+(tier>4?1:0);y++){put(0,y,z,k.wall);put(w-1,y,z,k.wall);}
    for(let x=2;x<w-2;x++)for(let y=0;y<2;y++)put(x,y,d-1,k.wall);
    // The central timber gate is a weak point in progressively stronger defenses.
    for(let y=0;y<3;y++){put(2,y,0,'W');put(w-3,y,0,'W');}
    for(let x=2;x<w-2;x++)put(x,3,0,'W');
    put(2,4,0,k.guard);put(w-3,4,0,k.guard);
    const c=Math.floor(w/2);put(c,0,d-3,'K');put(1,th,d-1,'K');
    if(tier>=4){put(w-2,th,d-1,'K');put(c-2,0,d-3,'T');put(c+2,0,d-3,'T');}
    if(tier>=5){
      for(let z=3;z<d-3;z++)for(const x of [c-2,c+2])for(let y=0;y<3;y++)put(x,y,z,k.wall);
      for(let z=3;z<d-3;z++)for(let x=c-2;x<=c+2;x++)put(x,3,z,'W');
      put(c,4,d-4,'K');
      for(let x=c-1;x<=c+1;x++)put(x,0,2,variant===1?'I':'U');
    }
    if(tier===6){put(1,th,0,'K');put(w-2,th,0,'K');for(let x=3;x<w-3;x+=2)put(x,2,d-1,k.guard);}
    // Different silhouettes and construction: steep timber caps, broad sea forts,
    // and an asymmetric mossy watchtower beside the old forest road.
    if(variant===0)for(const x0 of [0,w-2]){for(let z=0;z<2;z++)for(let x=x0;x<x0+2;x++)put(x,th,z,'W');put(x0,th+1,0,'R');put(x0,th+1,1,'R');if(tier===6){put(x0+1,th,0,'W');put(x0+1,th+1,0,'K');}}
    if(variant===1){for(let x=3;x<w-3;x++)put(x,0,1,'W');for(const x0 of [0,w-3])for(let z=d-3;z<d;z++)for(let x=x0;x<x0+3;x++)for(let y=0;y<th;y++)put(x,y,z,'M');for(let x=3;x<w-3;x+=3)put(x,2,d-1,'P');}
    if(variant===2){for(let y=0;y<3;y++)put(3,y,0,'W');put(w-3,4,0,'.');put(w-4,0,1,k.guard);for(let x=0;x<3;x++)for(let z=0;z<3;z++)for(let y=0;y<th+1;y++)put(x,y,z,'C');for(let z=0;z<3;z++)put(1,th+1,z,'W');if(tier===6)put(1,th+2,0,'K');for(let z=3;z<d-3;z+=3)for(let y=0;y<3;y++)put(w-2,y,z,'E');}
    return g.layers();
  }

  const revision=2,legacyOrders=[0,3,7,11,15,19,23];
  const names=[
    ['Woodland Huts','Sawmill Clearing','Applecart Cottages','Bellringer Village','Mill Road Crossing','Harvest Yard','Twin Lookouts','Copperpot Manor','Carpenters Court','Thornwood Checkpoint','Orchard Keeps','Bramblewick Gate','Lantern Courtyard','Powder Barns','Westfield Castles','Thistledown Keep','Highwatch Towers','Roadside Market','Three Hearth Halls','Festival Fortress','Crown Road Castles','Royal Powder Yard','Last Watch','Bramblewick Crown Castle'],
    ['Fishermen’s Huts','Netmakers Yard','Saltwind Cottages','Harbor Cottages','Dock Road Crossing','Sailmakers Yard','Beacon Lookouts','Admiral’s Manor','Shipwright Court','Tideway Checkpoint','Clifftop Keeps','Harbor Gatehouse','Lantern Quay','Powder Warehouses','Sister Island Castles','Seabreeze Keep','Stormwatch Towers','Shelter Quay','Three Harbor Halls','Breakwater Fortress','Admiralty Castles','Naval Powder Yard','Last Beacons','Coppercoast Island Castle'],
    ['Foresters’ Huts','Woodcutters Clearing','Reedbank Lodges','Willow Lodges','Old Road Crossing','Foresters Yard','Pine Lookouts','Warden’s Manor','Woodland Workshop','Rootway Checkpoint','Ridgewatch Keeps','Old Forest Gate','Moonlit Courtyard','Powder Lodges','Stonegrove Castles','Fernwatch Keep','Stonepine Towers','Forest Market','Three Woodland Halls','Mosswall Fortress','Warden Road Castles','Citadel Powder Yard','Last Sentinels','Mossmere Grand Citadel']
  ];
  const settings=[
    [
        "woodland",
        "woodland",
        "orchard",
        "village",
        "riverside",
        "farmland",
        "meadow",
        "orchard",
        "village",
        "woodland",
        "orchard",
        "farmland",
        "village",
        "farmland",
        "meadow",
        "meadow",
        "mountains",
        "village",
        "woodland",
        "village",
        "riverside",
        "farmland",
        "riverside",
        "riverside"
    ],
    [
        "harbor",
        "harbor",
        "riverside",
        "harbor",
        "harbor",
        "harbor",
        "island",
        "harbor",
        "harbor",
        "riverside",
        "mountains",
        "harbor",
        "harbor",
        "island",
        "island",
        "island",
        "mountains",
        "lake",
        "harbor",
        "island",
        "island",
        "harbor",
        "island",
        "island"
    ],
    [
        "woodland",
        "woodland",
        "marsh",
        "riverside",
        "riverside",
        "woodland",
        "mountains",
        "woodland",
        "woodland",
        "marsh",
        "mountains",
        "ruins",
        "ruins",
        "woodland",
        "ruins",
        "woodland",
        "mountains",
        "village",
        "woodland",
        "woodland",
        "lake",
        "ruins",
        "lake",
        "lake"
    ]
];
  const reasons=[
    ['The woodland path is blocked by guards in these timber huts.','Guards have occupied the sawmill clearing and stopped work on the village homes.','The orchard cottages are occupied, keeping the apple wagons off the road.','The village cannot prepare its festival while guards occupy the cottages.','Guards on the crossing are stopping the mill workers from reaching the village.','The harvest yard is occupied and the farmers need their buildings back.','Two lookout posts watch the road to Copperpot Manor.','The manor guards are blocking the road through the orchard.','The carpenters need their workshops back before they can repair the village.','A timber checkpoint is cutting the woodland road in two.','Two small keeps overlook the orchard route.','Bramblewick Gate is the entrance to the fortified heart of the kingdom.','The lantern courtyard is occupied and the townspeople cannot pass.','These barns supply powder to the occupied castles.','Two separate castle compounds control the western fields.','The guards have gathered at Thistledown Keep.','The mountain watchtowers are blocking the mountain road.','The roadside market needs a safe route back to the village.','Three guarded halls stand along the road to the festival grounds.','Festival Fortress blocks the way to the capital.','Two castles and their gate hold the crown road.','The royal powder yard supplies the last line of defenses.','The last watch posts protect the approach to the crown castle.','This is the final stronghold beside the river. Defeat its tower, gate and courtyard guards so Bramblewick can celebrate in peace.'],
    ['The fishermen cannot use their huts while the harbor guards remain.','The netmakers need their occupied workshops back.','Guards in the riverside cottages are stopping supplies from reaching the docks.','The harbor cottages must be cleared before the waterfront can reopen.','Two guard posts block the road beside the docks.','The sailmakers cannot work while guards occupy their yard.','Two beacon towers watch the island passage.','The admiral’s manor controls the road to the sea gate.','The shipwrights need their workshops back to repair the fishing boats.','A riverside checkpoint blocks the coast road.','Two cliffside keeps overlook the harbor approach.','The harbor gatehouse blocks the route to the island forts.','Guards in the lantern quay keep the harbor workers away.','These warehouses hold powder for the island defenses.','Two island castle compounds guard the sea road.','Seabreeze Keep is the next obstacle along the island passage.','Stormwatch Towers overlook the highland supply route.','The shelter quay needs to be safe for returning harbor workers.','Three occupied halls guard the approach to the breakwater.','The breakwater fortress controls the route back to the fishing harbor.','The admiralty castles hold the last road to the island capital.','The naval powder yard supplies the final harbor defenses.','The last beacon posts guard the admiral’s castle approach.','The admiral’s island castle is the last stronghold. Defeat its tower, gate and courtyard guards so the coast can reopen.'],
    ['Guards in these timber lodges have closed the forest road.','The woodcutters need their occupied clearing back.','Guards in the reedbank lodges are blocking the marsh path.','The willow lodges control the river crossing.','Two guarded posts stand across the old forest road.','The foresters cannot return to their yard while the guards remain.','Two pine lookouts watch the road to the warden’s manor.','The warden’s manor blocks the woodland route.','The woodland workers need their occupied workshops back.','A timber checkpoint blocks the path through the marsh.','Two ridge keeps overlook the forest pass.','The old gate stands among the ruins at the edge of the inner forest.','Guards occupy the moonlit courtyard between the ruined columns.','These lodges supply powder to the forest strongholds.','Two stonegrove castles control the roads through the ruins.','Fernwatch Keep overlooks the route through the forest canopy.','Stonepine Towers block the mountain path.','The forest market needs a safe road to the forest villages.','Three woodland halls guard the route toward the lake.','Mosswall Fortress blocks the road back to the forest villages.','Two castles hold the warden’s road beside the lake.','The citadel powder yard supplies the final forest defenses.','The last sentinel posts guard the lakeside approach.','The grand citadel is the last stronghold beside the lake. Defeat its tower, gate and courtyard guards to reunite the forest villages.']
  ];
  // Hand-authored encounters, in grid cells: kind, x, depth, width, length, height.
  // Broad roofs have real side/back supports; open fronts expose guards and weak points.
  const layouts={
    1:[['hut',0,0,4,3,2],['store',7,2,3,3,2]],
    2:[['hut',0,2,4,3,2],['hut',7,0,5,3,2]],
    4:[['tower',0,1,2,2,3],['gate',5,0,7,2,2],['tower',15,2,2,2,3]],
    5:[['hut',0,0,4,3,2],['store',7,3,4,3,3],['hut',14,1,4,3,2]],
    6:[['tower',0,0,3,3,4],['hut',6,3,5,3,2],['tower',14,1,3,3,5]],
    8:[['hall',0,0,5,4,3],['store',8,3,4,4,3],['tower',16,0,2,2,4]],
    9:[['gate',0,0,7,2,3],['gate',11,3,7,2,3]],
    10:[['keep',0,0,6,4,3],['keep',11,3,6,4,4]],
    12:[['tower',0,0,2,2,5],['hall',5,3,7,5,4],['tower',16,1,3,3,5]],
    13:[['store',0,0,5,4,3],['store',8,2,5,4,3],['tower',17,0,2,2,4]],
    14:[['keep',0,0,7,5,4],['keep',12,2,7,5,5]],
    16:[['tower',0,0,3,3,6],['gate',6,2,7,2,4],['tower',17,0,3,3,7]],
    17:[['hall',0,2,5,4,3],['store',8,0,4,3,3],['hall',15,3,5,4,4]],
    18:[['hall',0,0,5,4,4],['hall',8,4,5,4,5],['hall',16,1,5,4,4]],
    20:[['keep',0,0,7,5,5],['keep',13,3,7,5,6]],
    21:[['store',0,0,5,4,4],['gate',8,3,6,2,4],['store',17,1,5,4,5]],
    22:[['tower',0,0,3,3,7],['keep',6,4,8,5,6],['tower',18,1,3,3,8]]
  };
  function encounter(k,order,v){
    const sites=layouts[order].map(([kind,x,z,w,d,h],i)=>[kind,x,z+(v===2?i%2:0),w+(v===1&&kind!=='tower'?1:0),d,h+(v===2&&i===1?1:0)]);
    const width=Math.max(...sites.map(s=>s[1]+s[3])),depth=Math.max(...sites.map(s=>s[2]+s[4])),height=Math.max(...sites.map(s=>s[5]+3)),g=grid(width,height,depth),put=g.put;
    for(const [kind,x,z,w,d,h] of sites){
      const stone=['tower','keep'].includes(kind),wall=stone?k.wall:kind==='store'?'W':k.home;
      if(kind==='tower'){
        for(let xx=x;xx<x+w;xx++)for(let zz=z;zz<z+d;zz++)for(let y=0;y<h;y++)put(xx,y,zz,wall);
        put(x+Math.floor(w/2),h,z+1,k.guard);continue;
      }
      if(kind==='gate'){
        for(const xx of [x,x+w-1])for(let zz=z;zz<z+d;zz++)for(let y=0;y<h;y++)put(xx,y,zz,y===0?'W':k.wall);
        for(let xx=x;xx<x+w;xx++)for(let zz=z;zz<z+d;zz++)put(xx,h,zz,'W');
        put(x+1,h+1,z,k.guard);put(x+w-2,h+1,z+1,'K');continue;
      }
      for(let xx=x;xx<x+w;xx++)for(let zz=z;zz<z+d;zz++){
        if(xx===x||xx===x+w-1||zz===z+d-1)for(let y=0;y<h;y++)put(xx,y,zz,wall);
        put(xx,h,zz,'W');
        if(kind==='hut'&&v===0)put(xx,h+1,zz,'R');
      }
      put(x+Math.floor(w/2),0,z+1,'K');
      if(kind==='keep'||kind==='hall')put(x+1,h+1,z+1,k.guard);
      if(kind==='keep'&&order>=14)put(x+w-2,h+1,z+d-2,v===1?'F':v===2?'Q':'H');
      if(kind==='store')put(x+1,0,z,'T');
    }
    return g.layers();
  }
  const levels=[];
  kingdoms.forEach((k,v)=>{
    k.names=names[v];k.levels=[];
    k.names.forEach((name,order)=>{
      const legacy=legacyOrders.indexOf(order),tier=legacy>=0?legacy:Math.min(6,Math.floor(order/4));
      const raw={name,cutscene:true,dist:22+Math.min(6,Math.floor(order/4)),par:2+Math.floor(order/3),layers:legacy>=0?(tier<3?settlement(k,tier,v):fortress(k,tier,v)):encounter(k,order,v),ammo:['boulder','stone','fire','splitter','bomb']};
      const height=raw.layers[0].length,width=raw.layers[0][0].length;
      const crates=order===0?['L']:order<6?['L','D']:order<12?['D','Y']:order<18?['Y','Z']:['D','Z','Y'];
      const front=Array(height).fill('.'.repeat(width)),row=front[height-1].split('');
      crates.forEach((id,i)=>row[Math.min(width-1,1+i*Math.max(2,Math.floor((width-3)/crates.length)))]=id);
      front[height-1]=row.join('');raw.layers.unshift(front);
      if(order>=17){
        raw.layers=raw.layers.map(layer=>layer.map(row=>'....'+row+'....'));
        const fw=width+8,clearance=legacy>=0?8:12;raw.layers.unshift(...Array.from({length:clearance},()=>Array(height).fill('.'.repeat(fw))));
        raw.dist-=clearance/2;const friends=raw.layers[0][height-1].split('');
        friends[0]=['v','f','h'][v];if(order>=20)friends[fw-1]=order===22?'A':['m','m','v'][v];
        raw.layers[0][height-1]=friends.join('');raw.objective='rescue';
        if(legacy<0){
          // Roadside backstops catch incidental rubble while the open fronts
          // leave friends visible and vulnerable to a deliberately misplaced shot.
          for(const edge of order>=20?[0,fw-3]:[0])for(let x=edge;x<edge+3;x++)for(let y=0;y<2;y++){
            const back=raw.layers[2][height-1-y].split('');back[x]='X';raw.layers[2][height-1-y]=back.join('');
          }
        }
      }
      const depot=[13,21].includes(order);
      raw.goals={enemies:'guards',destroy:depot?['T']:[],collect:[]};
      const enemyCount=[...raw.layers.flat().join('')].filter(id=>RT.data.MAT[id]?.crown||RT.data.MAT[id]?.guard).length;
      raw.bolts=Math.max(3,enemyCount+(depot?2:0));raw.par=Math.min(raw.bolts,Math.max(2,Math.ceil(enemyCount*.65)));
      raw.patrols=RT.characterPaths.defaults(raw);
      if(legacy>=3){
        // Stay on the single timber gate span. Crossing onto an independently
        // settled stone tower can catch the character's collision box at its seam.
        const frontDepth=1+(order>=17?8:0),center=raw.layers[0][0].length/2;
        for(const route of raw.patrols)if(route.cell[0]===frontDepth&&route.cell[1]===height-5){
          const mat=RT.data.MAT[raw.layers[route.cell[0]][route.cell[1]][route.cell[2]]];
          if(mat?.guard)route.points=[[0,0],[route.cell[2]<center?.8:-.8,0]];
        }
      }
      raw.environment={...RT.scenery.defaults(settings[v][order]),season:['spring','summer','autumn','winter'][(Math.floor(order/6)+v)%4],timeOfDay:['day','dawn','sunset','day','twilight','night'][order%6]};
      if(v===2)raw.environment.props.boats=false;
      if(order>=19)raw.environment.props.banners=true;
      raw.story=reasons[v][order]+' '+RT.levelBrief.instructions(raw)+(depot?' The powder kegs can also damage nearby supports when they explode.':order>0?' Ammo crates are optional: hit them to add more shot choices.':' Hit the marked ammo crate if you want extra ammunition.');
      raw.ending=order===23?k.ending:'The guards are defeated. Next: '+k.names[order+1]+'.';
      const level=RT.courses.prepare(raw);
      Object.assign(level,{id:legacy>=0?k.id+'-'+(legacy+1):k.id+'-expanded-'+(order+1),kingdomId:k.id,order,moat:order===23,chapter:k.name+' · Chapter '+(Math.floor(order/6)+1)+' · Level '+(order+1)+' of 24'});
      k.levels.push(levels.length);levels.push(level);
    });
  });
  // Keep the original prototype structures available to the Workshop and older tooling.
  RT.levels.CLASSICS=RT.levels.LEVELS.slice();
  RT.levels.LEVELS.splice(0,RT.levels.LEVELS.length,...levels);
  const find=id=>kingdoms.find(k=>k.id===id);
  const forLevel=level=>find(level?.kingdomId);
  return{kingdoms,find,forLevel,revision,legacyOrders};
})();
