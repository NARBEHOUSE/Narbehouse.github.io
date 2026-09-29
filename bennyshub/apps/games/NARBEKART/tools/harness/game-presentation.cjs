/** Real-game presentation: tablet targets, own-player rings, split views,
 *  and a native 3D hub thumbnail. The final composition is test-only DOM. */
module.exports = async function (t) {
  await t.setSize(1024, 768);
  await t.load('apps/games/NARBEKART/index.html');
  await t.until('window.NK && NK.ui && NK.ui.ready', 45000);
  await t.js('window.__thumbLogo = document.querySelector(".nkLogo").outerHTML; true');

  async function countdown(layout) {
    // Freeze the real race and exercise just the HUD data contract. Race and
    // item tests separately verify the timer's random delay and consumption.
    const result = await t.js(`(() => {
      NK.game.pause(); NK.ui.debugRace();
      const humans = NK.debug.race().humans;
      function paint(i, more) {
        NK.hud.update(i, Object.assign({item:i ? 'bee' : 'rocket3',roulette:false,itemUseT:i ? 5.2 : 3.2,
          itemUseDelay:i ? 5.7 : 4.8,finished:false,label:(humans.length === 1 ? 'YOU' : 'P' + (i + 1)) + ' · ' + humans[i].name}, more || {}));
      }
      const cases = [
        [{itemUseT:3.01},'USE IN 4s'], [{itemUseT:3},'USE IN 3s'], [{itemUseT:0.01},'USE IN 1s'],
        [{itemUseT:0},''], [{roulette:true},''], [{item:null},''], [{finished:true},'']
      ].map(([data,expected]) => {
        paint(0,data);
        const el = document.querySelector('.v0 .nkItemUse'), rect = el.getBoundingClientRect(), visible = rect.width > 0 && rect.height > 0;
        return {expected,actual:visible ? el.textContent : ''};
      });
      humans.forEach((h,i) => paint(i));
      const badges = [...document.querySelectorAll('.nkItemUse')].map(el => {
        const r = el.getBoundingClientRect(), v = el.closest('.nkView').getBoundingClientRect();
        return {text:el.textContent,animation:getComputedStyle(el).animationName,fit:r.width > 0 && r.height > 0 && r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom};
      });
      return {cases,badges,oldPadCue:!!document.querySelector('.nkPad')};
    })()`);
    t.assert(result.cases.every(c => c.actual === c.expected), layout + ': item countdown rounds up and hides when unavailable', result.cases);
    t.assert(result.badges.every(b => b.fit && b.animation === 'none') && !result.oldPadCue, layout + ': steady countdown fits view without pad-use cue', result);
    await t.wait(150); await t.shot('item-countdown-' + layout);
    await t.js('NK.game.resume(); true');
  }

  for (const screen of ['title', 'racer', 'settings']) {
    await t.js('NK.ui.setScreen(' + JSON.stringify(screen) + ', {player:0}); true');
    await t.wait(300);
    const targets = await t.js(`(() => {
      const card = document.getElementById('nkCard').getBoundingClientRect();
      return { viewport: [innerWidth, innerHeight], card: [card.left,card.top,card.right,card.bottom],
        items: [...document.querySelectorAll('#nkMenu .nkItem')].map(el => {
          const r = el.getBoundingClientRect(); return {label:el.textContent.trim(),height:r.height,width:r.width};
        }) };
    })()`);
    t.assert(targets.items.length > 0 && targets.items.every(i => i.height >= 63.95), screen + ': tablet targets at least 64px', targets);
    t.assert(targets.card[0] >= -0.5 && targets.card[1] >= -0.5 && targets.card[2] <= 1024.5 && targets.card[3] <= 768.5, screen + ': card fits tablet', targets.card);
    await t.shot('tablet-' + screen);
  }

  await t.setSize(1600, 900);
  await t.js('NK.debug.start({players:1,type:"single",mode:"nofail",trackId:"meadow"}); NK.debug.skipIntro(); true');
  await t.wait(900);
  const single = await t.js(`(() => {
    const r = NK.debug.race().humans[0]; NK.game.beforeView(0);
    return {marker:r.playerMarker, ring:!!r.playerRing?.visible};
  })()`);
  t.assert(single.marker === null && single.ring, 'single view identifies the controlled vehicle with only its ring', single);
  await t.shot('race-marked-single');
  await countdown('single');

  await t.js('NK.debug.start({players:2,type:"single",mode:"nofail",trackId:"frost",picks:[{charId:"pip",vehicleId:"kart"},{charId:"rusty",vehicleId:"buggy"}]}); NK.debug.skipIntro(); true');
  await t.wait(700);
  for (const split of ['side', 'stack']) {
    await t.js('NK.game.settings.set("split",' + JSON.stringify(split) + '); true');
    await t.wait(260);
    const states = await t.js(`(() => {
      const humans = NK.debug.race().humans;
      return [0,1].map(view => {
        NK.game.beforeView(view);
        return humans.map(h => ({marker:h.playerMarker,ring:!!h.playerRing?.visible}));
      });
    })()`);
    t.assert(states.every((row, view) => row.every((h, i) => h.marker === null && h.ring === (i === view))), split + ': each camera shows only its player ring', states);
    await t.shot('race-marked-' + split);
    await countdown(split);
  }
  const airborne = await t.js(`(() => {
    const h = NK.debug.race().humans[0], oldFall = h.fallT, oldRescue = h.rescueT;
    h.fallT = 1; h.rescueT = 0; NK.game.beforeView(0);
    const falling = !h.playerRing.visible;
    h.fallT = 0; h.rescueT = 1; NK.game.beforeView(0);
    const rescuing = !h.playerRing.visible;
    h.fallT = oldFall; h.rescueT = oldRescue; NK.game.beforeView(0);
    return {falling,rescuing};
  })()`);
  t.assert(airborne.falling && airborne.rescuing, 'road ring hides during falls and rescue', airborne);

  // Compose the thumbnail from the real meadow world and its real racers.
  // Nothing here changes shipped UI or artwork; capture the current game logo.
  await t.setSize(960, 540);
  await t.js(`(() => {
    NK.debug.start({players:1,type:'single',mode:'nofail',trackId:'meadow',picks:[{charId:'pip',vehicleId:'kart'}]});
    NK.debug.skipIntro(); NK.game.pause();
    const R = NK.debug.race(), W = R.world;
    R.racers.forEach((r,i) => {
      r.v = 0;
      NK.debug.teleport(r.idx, 55 + (i === 0 ? 0 : i === 1 ? -1.8 : i === 2 ? -4 : -60 - i * 5), i === 0 ? -1.2 : i === 1 ? 2.3 : -4.4);
    });
    R.update(0.001);
    R.racers.forEach((r,i) => { r.mesh.visible = i < 3; if(r.shadow) r.shadow.visible = i < 3; });
    const camera = new THREE.PerspectiveCamera(37, 960 / 540, 0.1, 1800);
    W.pointAt(65, -9, camera.position); camera.position.y += 5.5;
    const target = W.pointAt(54, -0.8, new THREE.Vector3()); target.y += 2.4;
    camera.lookAt(target);
    NK.main.setViews([{camera,scene:NK.debug.scene}], 'single');
    NK.main.onBeforeView(() => {
      W.followCamera(camera.position);
      R.humans.forEach(h => { if(h.playerRing) h.playerRing.visible=false; });
    });
    document.querySelectorAll('#nkHud,#nkOverlay,#nkPauseBtn').forEach(el => el.style.display = 'none');
    const panel = document.createElement('div'); panel.id = 'thumbnailTitle';
    panel.style.cssText = 'position:fixed;left:22px;top:26px;z-index:100;width:380px;text-align:center;pointer-events:none;filter:drop-shadow(0 3px 0 rgba(255,255,255,.75))';
    panel.innerHTML = window.__thumbLogo + '<div style="display:inline-block;background:#fff8ec;color:#1d1b2e;border:3px solid #1d1b2e;border-radius:999px;padding:7px 18px;font:900 16px Arial,sans-serif;letter-spacing:1.5px;box-shadow:0 4px 0 #1d1b2e">ONE OR TWO PLAYERS</div>';
    panel.querySelector('.nkLogo').style.cssText = 'font-size:16px;transform:skewX(-9deg) scale(1.05);margin-bottom:20px';
    document.body.appendChild(panel);
    NK.debug.renderer.setPixelRatio(1); NK.debug.renderer.setSize(960,540);
    return true;
  })()`);
  await t.wait(500);
  await t.shot('thumbnail');
  t.assert(await t.js('innerWidth === 960 && innerHeight === 540 && /NARBE\\s*RACER/i.test(document.querySelector("#thumbnailTitle .nkLogo")?.textContent)'), 'thumbnail uses NARBE Racer game logo at 960x540');

  // Close views of live track signage, with no injected logo. Scenery is
  // merged for rendering, so locate each original textured quad by width.
  for (const [kind, width, distance] of [['billboard',9.2,15], ['startGantry',23.6,30], ['grandstand',18.5,24], ['pit_building',23,30]]) {
    await t.js(`(() => {
      document.getElementById('thumbnailTitle').style.display = 'none';
      const R = NK.debug.race(), W = R.world;
      let center, normal;
      NK.debug.scene.updateMatrixWorld(true);
      NK.debug.scene.traverse(o => {
        const image = o.material?.map?.image;
        if (center || !o.isMesh || !image || ![1008,2048].includes(image.width)) return;
        const geo = o.geometry, pos = geo.attributes.position, uv = geo.attributes.uv;
        const index = n => geo.index ? geo.index.getX(n) : n;
        for (let start = 0; start < (geo.index ? geo.index.count : pos.count); start += 6) {
          const pts = Array.from({length:6}, (_,k) => new THREE.Vector3().fromBufferAttribute(pos,index(start+k)).applyMatrix4(o.matrixWorld));
          let span = 0;
          for (let a=0; a<6; a++) for (let b=a+1; b<6; b++) {
            if (Math.abs(uv.getY(index(start+a)) - uv.getY(index(start+b))) < .01) span = Math.max(span,pts[a].distanceTo(pts[b]));
          }
          if (Math.abs(span - ${width}) > .2) continue;
          center = pts.reduce((sum,p) => sum.add(p),new THREE.Vector3()).multiplyScalar(1/6);
          normal = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal,index(start)).applyMatrix3(new THREE.Matrix3().getNormalMatrix(o.matrixWorld)).normalize();
          break;
        }
      });
      if (!center) throw new Error('Missing signage: ' + ${JSON.stringify(kind)});
      const camera = new THREE.PerspectiveCamera(37, 960 / 540, 0.1, 1800);
      camera.position.copy(center).addScaledVector(normal, ${distance});
      camera.lookAt(center);
      NK.main.setViews([{camera,scene:NK.debug.scene}], 'single');
      NK.main.onBeforeView(() => W.followCamera(camera.position));
      return true;
    })()`);
    await t.wait(150);
    await t.shot('brand-' + kind);
  }
  t.assert(t.errors.length === 0, 'presentation produces no browser errors', t.errors);
};
