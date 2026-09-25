/**
 * Benny's Ballista — world building.
 *
 * Ground, sky, fog and the lighting rig. Deliberately its own small module
 * rather than a fork of Race Tracks' world.js (that file is a road/terrain
 * generator this game has no use for — see the ballista-3d plan on the wart
 * that leaves in FishMaster).
 *
 * Takes colours as plain arguments rather than reading the palette itself, so
 * this module has no dependency on game state or the DOM theme — game.js
 * reads the CSS custom properties once per theme change and hands the result
 * here and to art.js. That is also what makes refresh() below possible: it
 * repaints the same objects rather than rebuilding the world.
 */
RT.world = (function () {
  'use strict';

  const A = RT.art;
  const U = RT.util;

  const GROUND_SIZE = 400;
  const MOAT_GAP=1,MOAT_WIDTH=3;
  /* Both well inside the 200-unit ground half-extent and past every level's
     max `dist` (~29) and the shadow frustum's far plane (recenterShadow()
     never exceeds ~65) — so the horizon dressing never intersects a level or
     clips the shadow camera. */
  const HILL_RADIUS = 160;
  const CLOUD_BOUND = 170;

  /**
   * Distance haze, except in the High Contrast profile, which drops it
   * entirely. Fog works by fading geometry toward the sky colour — in that
   * profile the sky is near-black, so a far castle would fade toward the
   * background rather than staying legible. Contrast has to be constant with
   * distance there, which means no fog at all rather than a subtler fog.
   */
  function setFog(scene, pal) {
    scene.fog = pal.flat ? null : new THREE.Fog(pal.sky2, 40, 260);
  }

  /** A ring of soft hills closing off the horizon, so the ATTRACT/SETTLE
   *  camera's 360° orbit never runs out into flat fog in any direction —
   *  a single painted backdrop can't do that from every angle, which is why
   *  this is real geometry (ported from Race Tracks) rather than an image. */
  function buildHills(pal) {
    const g = new THREE.Group();
    const r = U.rng(U.hash('ballista-hills'));
    const count = 16;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r.range(-0.12, 0.12);
      const h = A.hillBackdrop(r, [pal.hill || pal.ground]);
      h.position.set(Math.sin(a) * HILL_RADIUS, 0, Math.cos(a) * HILL_RADIUS);
      g.add(h);
    }
    return g;
  }

  /** A seeded layer of drifting clouds, scattered inside the hill ring.
   *  Positions are fixed at build time; only x drifts, wrapping at
   *  CLOUD_BOUND (see update()) — this arena is small and bounded, unlike
   *  Race Tracks' endless route, so there is no need to re-centre on the
   *  camera the way FishMaster's lake clouds do. */
  function buildClouds() {
    const g = new THREE.Group();
    const r = U.rng(U.hash('ballista-clouds'));
    for (let i = 0; i < 14; i++) {
      const c = A.cloud(r);
      c.position.set(r.range(-CLOUD_BOUND, CLOUD_BOUND), r.range(38, 72), r.range(-CLOUD_BOUND, CLOUD_BOUND));
      c.scale.setScalar(r.range(1.1, 2.0));
      c.rotation.y = r.range(0, Math.PI * 2);
      c.userData.drift = r.range(0.5, 1.4) * (r.chance(0.5) ? 1 : -1);
      g.add(c);
    }
    return g;
  }

  /** An irregular worn patch under the ballista and firing line — a decal
   *  layered a hair above the flat ground plane (not a height change), so the
   *  literal ground geometry and physics body stay exactly what they are. */
  function buildDirtPatch(pal) {
    const r = U.rng(U.hash('ballista-dirt'));
    const sides = 14;
    const shape = new THREE.Shape();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rad = 7 * r.range(0.78, 1.15);
      const x = Math.sin(a) * rad, y = Math.cos(a) * rad;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const mesh = A.part(new THREE.ShapeGeometry(shape), A.paper(pal.dirt || pal.ground, { roughness: 1 }), { cast: false, receive: true });
    mesh.userData.pal = 'dirt';
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(1.5, 1, 1.05);
    mesh.position.set(0, 0.002, -1.5);
    return mesh;
  }

  /** A couple of hand-placed hay bales and a crate flanking the ballista —
   *  modest camp dressing, decorative only: no physics body, not in
   *  blocks[], invisible to auditLevels(), same convention as game.js's
   *  guardDecor. */
  function buildCamp(pal) {
    const g = new THREE.Group();
    const mat = () => A.paper(pal.wood || '#a9682f', { roughness: 1 });
    const tag = (m) => { m.userData.pal = 'wood'; return m; };

    const bale1 = tag(A.part(new THREE.CylinderGeometry(0.5, 0.5, 0.85, 10), mat(),
      { rot: [0, 0, Math.PI / 2], outline: true, receive: true }));
    bale1.position.set(2.7, 0.5, 1.6);
    g.add(bale1);

    const bale2 = tag(A.part(new THREE.CylinderGeometry(0.5, 0.5, 0.85, 10), mat(),
      { rot: [0, 0, Math.PI / 2], outline: true, receive: true }));
    bale2.position.set(2.3, 0.5, 2.6);
    g.add(bale2);

    const crate = tag(A.part(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat(),
      { outline: true, receive: true }));
    crate.position.set(-2.7, 0.3, 1.9);
    g.add(crate);

    return g;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {object} pal  { sky1, sky2, sky3, ground, hill, dirt, wood, sunColor }
   * @returns {object} handles for refresh()/later tuning
   */

  function buildGarden(pal) {
    const g = new THREE.Group(); const r=U.rng(U.hash('mischief-garden'));
    function instances(geo,color,poses){const m=new THREE.InstancedMesh(geo,A.paper(color),poses.length);const dummy=new THREE.Object3D();poses.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);dummy.rotation.set(0,p.rot||0,0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
    const trunks=[],leaves=[],rocks=[],flowers=[];
    for(let i=0;i<70;i++){const side=i%2?-1:1;const x=side*r.range(15,65),z=r.range(-90,32),height=r.range(2,5);trunks.push({x,y:height*.35,z,sx:.3,sy:height*.7,sz:.3});leaves.push({x,y:height,z,sx:height*.65,sy:height*.7,sz:height*.65});if(i%2===0)rocks.push({x:x+2,y:.3,z:z+2,sx:1,sy:.6,sz:.8});}
    for(let i=0;i<140;i++){const x=(i%2?-1:1)*r.range(10,27),z=r.range(-50,6);flowers.push({x,y:.12,z,sx:.13,sy:.18,sz:.13});}
    instances(new THREE.CylinderGeometry(.55,.7,1,6),pal.wood,trunks).userData.pal='wood';instances(new THREE.IcosahedronGeometry(1,1),pal.hill,leaves).userData.pal='hill';instances(new THREE.DodecahedronGeometry(.8,0),'#a8ac99',rocks);instances(new THREE.IcosahedronGeometry(1,0),'#f0d37e',flowers);
    return g;
  }

  function build(scene, pal) {
    setFog(scene, pal);
    scene.background = new THREE.Color(pal.sky2);

    const skyMat = new THREE.MeshBasicMaterial({
      map: A.skyTexture(pal.sky1, pal.sky2, pal.sky3 || pal.sky2),
      side: THREE.BackSide, fog: false, depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 20, 14), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    const groundMat = A.paper(pal.ground, { roughness: 1 });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      groundMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const dirt = buildDirtPatch(pal);
    scene.add(dirt);

    const hills = buildHills(pal);
    scene.add(hills);

    const clouds = buildClouds();
    scene.add(clouds);

    const garden = buildGarden(pal);
    scene.add(garden);
    const camp = buildCamp(pal);
    scene.add(camp);

    const hemi = new THREE.HemisphereLight(pal.sky1, pal.ground, 1.7);
    scene.add(hemi);

    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(amb);

    const sun = new THREE.DirectionalLight(pal.sunColor || 0xfff4dc, 2.5);
    sun.position.set(-14, 22, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    // Tight frustum around where the castle actually sits (roughly muzzle to
    // ~40 units downrange, per data.js's rangeWindow); re-centre per level once
    // levels exist rather than trying to cover the whole ground plane.
    const SH = 26;
    sun.shadow.camera.left = -SH;
    sun.shadow.camera.right = SH;
    sun.shadow.camera.top = SH;
    sun.shadow.camera.bottom = -SH;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.035;
    sun.target.position.set(0, 0, -20);
    scene.add(sun);
    scene.add(sun.target);

    return {
      sky: sky, skyMat: skyMat, ground: ground, groundMat: groundMat,
      dirt: dirt, hills: hills, clouds: clouds, camp: camp, garden: garden,
      hemi: hemi, amb: amb, sun: sun
    };
  }

  /** Repaint an existing world for a new theme, without rebuilding geometry.
   *  Takes a scene now as well, because switching profile can change whether
   *  there is fog at all, not just what colour it is. */
  function refresh(handles, pal, scene) {
    handles.skyMat.map?.dispose();
    handles.skyMat.map = A.skyTexture(pal.sky1, pal.sky2, pal.sky3 || pal.sky2);
    handles.skyMat.map.needsUpdate = true;
    handles.hemi.color.set(pal.sky1);
    handles.hemi.groundColor.set(pal.ground);
    handles.sun.color.set(pal.sunColor || 0xfff4dc);
    /* The ground material is one of art.js's cached ones, and the cache is
       dropped on a profile change — so take a fresh one rather than tinting
       the old object, which may no longer be the material class this profile
       wants (lit vs unlit). */
    handles.groundMat = A.paper(pal.ground, { roughness: 1 });
    handles.ground.material = handles.groundMat;
    if (scene) {
      setFog(scene, pal);
      scene.background = new THREE.Color(pal.sky2);
    }

    /* Same "mesh keeps whatever material it was built with" problem as the
       ground, for everything the environment pass added: hills/dirt/camp
       carry a palette key (see repaint()) so this is a lookup, not a rebuild.
       Clouds carry no palette key — their colour never varies by theme, only
       the material class does (lit vs High Contrast's unlit) — so they get
       their material re-fetched directly instead. */
    
    if (handles.hills) A.repaint(handles.hills, pal);
    if (handles.dirt) A.repaint(handles.dirt, pal);
    if (handles.camp) A.repaint(handles.camp, pal);
    if (handles.garden) { A.repaint(handles.garden, pal); handles.garden.visible = !pal.flat; }
    if (handles.clouds) {
      const cloudMat = A.cloudMaterial();
      handles.clouds.traverse((o) => { if (o.isMesh) o.material = cloudMat; });
    }
    if(handles.level){handles.sceneSignature=null;setLevel(handles,handles.level,pal);}
  }

  /** Per-frame drift for the cloud layer — the only part of the environment
   *  that animates. Wraps at CLOUD_BOUND rather than following the camera:
   *  this arena is small and bounded (see HILL_RADIUS/CLOUD_BOUND above), so
   *  there is no endless-route problem to solve here. */
  function update(handles, dt) {
    if (!handles.clouds) return;
    for (const c of handles.clouds.children) {
      c.position.x += (c.userData.drift || 0) * dt;
      if (c.position.x > CLOUD_BOUND) c.position.x = -CLOUD_BOUND;
      else if (c.position.x < -CLOUD_BOUND) c.position.x = CLOUD_BOUND;
    }
  }

  /** Re-centres the shadow frustum on a level's actual distance, now that
   *  real levels (js/levels.js) exist and don't all sit at the same `dist`
   *  the fixed frustum in build() was tuned for. Keeps the same half-size,
   *  just slides where it's aimed. */
  function recenterShadow(handles, dist) {
    const sun = handles.sun;
    sun.target.position.set(0, 0, -dist);
    sun.target.updateMatrixWorld();
    const SH = sun.shadow.camera.right;   // half-size chosen in build()
    sun.shadow.camera.far = dist + SH + 10;
    sun.shadow.camera.updateProjectionMatrix();
  }

  // Scenery belongs to the loaded level and is removed/disposed on every swap.
  function setLevel(handles,level,pal){
    handles.level=level;
    const bounds=RT.levels.parseLevel(level).blocks.reduce((v,b)=>[Math.min(v[0],b.x-b.w/2),Math.max(v[1],b.x+b.w/2),Math.min(v[2],b.z-b.d/2)],[0,0,0]);
    const signature=JSON.stringify([level.environment,level.dist,level.moat,level._cols,level._depth,bounds,pal]);if(handles.sceneSignature===signature)return;handles.sceneSignature=signature;
    if(handles.levelScenery){handles.levelScenery.parent?.remove(handles.levelScenery);const geometries=new Set(),materials=new Set();handles.levelScenery.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
    const group=new THREE.Group();group.name='level-scenery';handles.levelScenery=group;handles.ground.parent.add(group);
    RT.scenery.apply(handles,level,pal,group);
    if(!level.moat)return;
    const x=level._cols/2+MOAT_GAP,z=level._depth/2+MOAT_GAP,wide=MOAT_WIDTH;
    function box(w,h,d,px,py,pz,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),pal.flat?new THREE.MeshBasicMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.45}));m.position.set(px,py,pz-level.dist);m.receiveShadow=true;group.add(m);return m;}
    const water=pal.flat?'#00ffff':'#529ca9',bank=pal.flat?'#ffffff':'#b3b29b';
    box((x+wide)*2,.055,wide,0,.04,z+wide/2,water);box((x+wide)*2,.055,wide,0,.04,-z-wide/2,water);
    box(wide,.055,z*2,-x-wide/2,.04,0,water);box(wide,.055,z*2,x+wide/2,.04,0,water);
    for(const sign of [-1,1]){box(x*2,.12,.24,0,.08,sign*z,bank);box(.24,.12,z*2,sign*x,.08,0,bank);}
    for(let i=0;i<11;i++)box(2.7,.12,.27,0,.16,z+i*.3,'#a77c51');
    for(const side of [-1,1])for(let i=0;i<4;i++)box(.12,.65,.12,side*1.35,.42,z+i,'#795b40');
  }
  // The speaking spot and full entrance path must stay on the field side of water.
  function dryForegroundZ(level,margin=1.25){return -level.dist+(level._depth||1)/2+(level.moat?MOAT_GAP+MOAT_WIDTH:0)+margin;}
  return { build, refresh, update, recenterShadow, setLevel, dryForegroundZ };
})();
