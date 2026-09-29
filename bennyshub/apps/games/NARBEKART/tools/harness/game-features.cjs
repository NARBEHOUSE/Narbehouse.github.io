/* Shipping simulation + real authored world and art, exercised in Electron. */
module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/index.html');
  await t.until('window.NK && NK.ui && NK.ui.ready', 45000);
  await t.js(`
    window.__featureStart = function(mode,track,showGrid) {
      NK.debug.start({players:1,type:'single',mode:mode,trackId:track}); NK.debug.skipIntro();
      NK.game.pause(); NK.controls.stop();
      document.getElementById('nkOverlay').style.display='none';NK.hud.visible(true);
      document.querySelectorAll('.nkPop').forEach(function(el){el.style.display='none';});
      var R=NK.debug.race(); window.__featureEvents=[];
      ['coin','itemGet','itemUse','box','hit','boost','turbo','jump','trick','fall','rescued'].forEach(function(name){
        R.on(name,function(r,arg){window.__featureEvents.push({name:name,idx:r.idx,arg:typeof arg==='string'||typeof arg==='number'?arg:null});});
      });
      if(!showGrid)R.racers.slice(1).forEach(function(r,i){NK.debug.teleport(r.idx,R.L*0.4+i*8,7.2);});
    };
    window.__featureTick=function(seconds){for(var i=0;i<Math.ceil(seconds/.02);i++)NK.debug.race().update(.02);};
    window.__featurePut=function(s,x){
      var r=NK.debug.race().humans[0];NK.debug.teleport(0,s,x);
      Object.assign(r,{v:24,y:0,vy:0,airT:0,_jump:null,item:null,itemUseT:0,itemUseDelay:0,roulette:0,rouletteKind:null,steer:0,stepTarget:null,spinT:0,wobbleT:0,invulnT:0,boostT:0,starT:0,megaT:0,jetT:0,shrinkT:0});
      return r;
    };
    window.__featureView=function(){
      var R=NK.debug.race(),r=R.humans[0],view={world:R.world,racer:r,playerIdx:0,camera:new THREE.PerspectiveCamera(55,1,.35,1600)};
      NK.camera.chase(view,r,1,true);NK.main.setViews([view],'single');
      R.world.update(.02,R.time,view.camera.position);return true;
    };
    window.__featureEvent=function(name){return window.__featureEvents.filter(function(e){return e.name===name&&e.idx===0;});};
    __featureStart('nofail','meadow',true);__featureTick(.02);__featureView(); true;
  `);
  const identity = await t.js(`(function(){var R=NK.debug.race(),r=R.humans[0];return {marker:r.playerMarker,
    ring:r.playerRing.visible,separate:r.playerRing.parent!==r.mesh,
    cpuClear:R.racers.slice(1).every(function(c){return c.playerMarker===null&&c.playerRing===null;})};})()`);
  t.assert(identity.marker === null && identity.ring && identity.separate && identity.cpuClear,
    'only the controlled kart has an independent outlined ring, without a floating label', identity);
  await t.shot('00-player-grid');
  await t.js(`var R=NK.debug.race();R.racers.slice(1).forEach(function(r,i){NK.debug.teleport(r.idx,R.L*.4+i*8,7.2);});true`);
  const coin = await t.js(`(function(){var R=NK.debug.race(),c=R.world.features.coins[0],r=__featurePut(c.s-.2,NK.C.laneX(c.lane));
    var before=r.coins;__featureTick(.04);return {collected:r.coins===before+1,hidden:!R.world.handles.coins[0].visible};})()`);
  t.assert(coin.collected && coin.hidden, 'real coin crossing collects and hides an instanced coin', coin);
  const box = await t.js(`(function(){var R=NK.debug.race(),b=R.world.features.itemRows[0],lane=b.lanes[0],r=__featurePut(b.s-.2,NK.C.laneX(lane));
    r.item=null;r.roulette=0;__featureTick(.04);var spinning=r.roulette>0,hidden=!R.world.handles.boxes[0][lane].visible;
    __featureTick(1.5);return {spinning:spinning,hidden:hidden,item:r.item,reveals:__featureEvent('itemGet').length};})()`);
  t.assert(box.spinning && box.hidden && box.item && box.reveals === 1, 'real box starts roulette and reveals exactly one usable item', box);
  const pausedItem = await t.js(`({paused:NK.game.isPaused(),remaining:NK.debug.race().humans[0].itemUseT,item:NK.debug.race().humans[0].item})`);
  await t.wait(350);
  const stillPausedItem = await t.js(`({paused:NK.game.isPaused(),remaining:NK.debug.race().humans[0].itemUseT,item:NK.debug.race().humans[0].item})`);
  t.assert(pausedItem.paused && stillPausedItem.paused && pausedItem.remaining > 0 && pausedItem.remaining === stillPausedItem.remaining && pausedItem.item === stillPausedItem.item,
    'the real pause flow freezes a revealed item countdown', {before:pausedItem,after:stillPausedItem});
  const automatic = await t.js(`(function(){var R=NK.debug.race(),r=R.humans[0],uses=__featureEvent('itemUse').length,remaining=r.itemUseT;
    __featureTick(remaining-.05);var held=!!r.item;__featureTick(.08);
    return {held:held,item:r.item,remaining:r.itemUseT,uses:__featureEvent('itemUse').length-uses};})()`);
  t.assert(automatic.held && automatic.item === null && automatic.remaining === 0 && automatic.uses === 1,
    'a revealed item automatically activates once its countdown expires', automatic);
  const pad = await t.js(`(function(){var R=NK.debug.race(),p=R.world.features.padRows[0],r=__featurePut(p.s-.2,7.2);
    var uses=__featureEvent('itemUse').length;NK.debug.give(0,'rocket');__featureTick(.04);return {item:r.item,boost:r.boostT,uses:__featureEvent('itemUse').length-uses};})()`);
  t.assert(pad.item === 'rocket' && pad.boost > 0.9 && pad.uses === 0, 'No-Fail Power Pad boosts in the outside lane without consuming the item', pad);
  const boost = await t.js(`(function(){var R=NK.debug.race(),p=R.world.features.boostPads[0],r=__featurePut(p.s-.2,NK.C.laneX(p.lanes[0]));
    __featureTick(.04);return {boost:r.boostT,events:__featureEvent('boost').some(function(e){return e.arg==='pad';})};})()`);
  t.assert(boost.boost > 0.9 && boost.events, 'authored boost chevrons grant a pad boost', boost);
  const jump = await t.js(`(function(){var R=NK.debug.race(),p=R.world.features.ramps[0],r=__featurePut(p.s-.2,NK.C.laneX(p.lanes[0]));
    __featureTick(.5);__featureView();return {air:r.airT,height:r.y,meshHeight:r.mesh.position.y-R.world.pointAt(r.s,r.x,new THREE.Vector3()).y};})()`);
  t.assert(jump.air > 0 && jump.height > 0.5 && Math.abs(jump.meshHeight - jump.height) < 0.01, 'ramp physics and rendered kart height agree', jump);
  await t.shot('01-jump');
  const landing = await t.js(`__featureTick(2);({air:NK.debug.race().humans[0].airT,tricks:__featureEvent('trick').length})`);
  t.assert(landing.air === 0 && landing.tricks === 1, 'landing grants one automatic trick', landing);
  const drift = await t.js(`(function(){var R=NK.debug.race(),W=R.world,s=0,found=false;
    for(var p=40;p<W.L-100;p+=4){var k=W.frameAt(p).curvature;if(Math.abs(k)>=NK.C.DRIFT_K&&Math.abs(W.frameAt(p+35).curvature)>=NK.C.DRIFT_K){s=p;found=true;break;}}
    if(!found)return {found:false};var r=__featurePut(s,Math.sign(W.frameAt(s).curvature)*3.6);__featureTick(1.2);var level=r.drift.level;
    var straight=0;for(var p=40;p<W.L-40;p+=4)if(Math.abs(W.frameAt(p).curvature)<NK.C.DRIFT_END_K&&Math.abs(W.frameAt(p+12).curvature)<NK.C.DRIFT_END_K){straight=p;break;}
    NK.debug.teleport(0,straight,r.x);__featureTick(.2);return {found:true,level:level,turbos:__featureEvent('turbo').length,boost:r.boostT};})()`);
  t.assert(drift.found && drift.level >= 1 && drift.turbos >= 1 && drift.boost > 0, 'actual road curvature charges and releases an automatic mini-turbo', drift);
  const effects = await t.js(`(function(){var R=NK.debug.race(),r=__featurePut(100,0);r.item='star';NK.items.use(R,r);__featureTick(.1);
    var star=r._visual.aura&&r._visual.aura.visible,protected=!R.hitRacer(r,{kind:'hazard',by:null});r.starT=0;
    r.item='jet';NK.items.use(R,r);__featureTick(.1);var jet=r._visual.jet&&r._visual.jet.visible;r.jetT=0;
    r.megaT=1;__featureTick(.5);var mega=r.mesh.scale.x;r.megaT=0;r.shrinkT=1;__featureTick(.5);
    return {star:!!star,protected:protected,jet:!!jet,mega:mega,shrink:r.mesh.scale.x};})()`);
  t.assert(effects.star && effects.protected && effects.jet && effects.mega > 1.45 && effects.shrink < 0.65, 'real star, jet, mega and shrink visuals follow effect timers', effects);
  const restore = await t.js(`__featureTick(11);({coin:NK.debug.race().world.handles.coins[0].visible,box:NK.debug.race().world.handles.boxes[0][0].visible})`);
  t.assert(restore.coin && restore.box, 'real instanced pickups respawn', restore);

  await t.js(`__featureStart('open','starlight');true`);
  const saving = await t.js(`(function(){var R=NK.debug.race(),p=R.world.features.padRows[0],lane=[0,1,2,3,4].find(function(l){return p.lanes.indexOf(l)<0;}),r=__featurePut(p.s-.2,NK.C.laneX(lane));
    NK.debug.give(0,'rocket');__featureTick(.04);return {item:r.item,boost:r.boostT,lane:lane,lanes:p.lanes};})()`);
  t.assert(saving.item === 'rocket' && saving.boost === 0, 'an uncovered Open lane bypasses the pad boost while the item waits', saving);
  const fall = await t.js(`(function(){var R=NK.debug.race(),s=R.L*.15,r=__featurePut(s,11);R.setSteer(0,1);__featureTick(.02);R.setSteer(0,0);
    var falling=r.fallT>0;__featureTick(1.15);__featureView();return {falling:falling,rescue:r.rescueT,drone:!!(r._visual.drone&&r._visual.drone.visible),height:r.y};})()`);
  t.assert(fall.falling && fall.rescue > 0 && fall.drone, 'Open road drop starts the real Rescue Drone flight', fall);
  await t.shot('02-rescue');
  const rescued = await t.js(`__featureTick(1.4);({x:NK.debug.race().humans[0].x,y:NK.debug.race().humans[0].y,rescued:__featureEvent('rescued').length,drone:NK.debug.race().humans[0]._visual.drone.visible})`);
  t.assert(Math.abs(rescued.x) < 0.01 && rescued.y === 0 && rescued.rescued === 1 && !rescued.drone, 'rescue safely returns the kart to the centre lane', rescued);
  const glider = await t.js(`(function(){var R=NK.debug.race(),p=R.world.features.ramps.find(function(r){return r.kind==='glide';});if(!p)return {missing:true};
    var r=__featurePut(p.s-.2,NK.C.laneX(p.lanes[0]));__featureTick(.65);__featureView();return {air:r.airT,height:r.y,glider:r.mesh.userData.glider.visible};})()`);
  t.assert(glider.air > 0 && glider.height > 1 && glider.glider, 'glide ramp deploys the actual kart glider', glider);
  await t.shot('03-glider');
  t.note('Real-world feature events: ' + await t.js('JSON.stringify(__featureEvents)'));
  const rampTracks = await t.js('Object.keys(NK.tracks.TRACKS).filter(id => NK.tracks.TRACKS[id].features.ramps.length)');
  let rampCases = 0;
  for (const track of rampTracks) {
    await t.js('__featureStart("open",' + JSON.stringify(track) + '); true');
    const arcs = await t.js(`(() => {
      const W = NK.debug.race().world, results = [];
      W.features.ramps.forEach((ramp, rampIndex) => {
        for (const classId of ['easy','fast']) for (const boosted of [false,true]) {
          for (const lane of [...new Set([ramp.lanes[0],ramp.lanes[ramp.lanes.length-1]])]) {
            const R = NK.race.create({world:W,scene:new THREE.Scene(),mode:'open',classId,
              humans:[{charId:'pip',vehicleId:'kart'}],cpus:[]});
            const r = R.humans[0], spec = NK.C.JUMPS[ramp.kind], len = ramp.len || spec.rampLength;
            const end = ramp.s + len + (ramp.flightLength || spec.flightLength);
            const obstacle = W.features.hazards.find(h => h.jumpObstacle && Math.abs(h.rampS-ramp.s)<.001 && h.lane===lane);
            let jumps = 0, tricks = 0, hits = 0, climbed = false, clearance = Infinity, landed = null, finite = true;
            R.on('jump', () => jumps++); R.on('trick', () => tricks++); R.on('hit', () => hits++);
            Object.assign(r,{progress:ramp.s-.5,s:ramp.s-.5,x:NK.C.laneX(lane),targetLane:lane,lane,
              v:NK.C.CLASSES[classId].speed*(boosted?NK.C.BOOST_MUL:1),boostT:boosted?12:0});
            R.skipIntro();
            for(let step=0;step<600 && landed===null;step++) {
              const wasAirborne=r.airT>0; R.update(.02);
              if(r.progress>ramp.s+1 && r.progress<ramp.s+len-.5 && r.y>0)climbed=true;
              if(obstacle && Math.abs(NK.util.loopDelta(r.s,obstacle.s,W.L))<obstacle.halfLength+NK.C.KART_LEN*.5)
                clearance=Math.min(clearance,r.y);
              if(wasAirborne && r.airT===0)landed=r.progress;
              finite=finite && Number.isFinite(r.y) && Number.isFinite(r.mesh.position.y);
            }
            results.push({ramp:rampIndex,kind:ramp.kind,classId,boosted,lane,linked:!!obstacle,climbed,
              clearance:Number.isFinite(clearance)?clearance:null,jumps,tricks,hits,finite,
              landed:landed!==null && landed>=end && landed<end+2 && r.y===0});
            R.dispose();
          }
        }
      });
      return results;
    })()`);
    rampCases += arcs.length;
    t.assert(arcs.length > 0 && arcs.every(a => a.linked && a.climbed && a.clearance > 2.1 && a.jumps === 1 && a.tricks === 1 && a.hits === 0 && a.finite && a.landed),
      track + ': authored ramp obstacles clear safely at both speeds, boost states and outside ramp lanes', arcs);
  }
  t.note('Verified ' + rampCases + ' authored jump trajectories across ' + rampTracks.length + ' tracks.');

};
