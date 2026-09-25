/**
 * Benny's Ballista — physics settling and collateral damage.
 *
 * Extracted from js/game.js's stepPhysicsWithImpacts()/applyCrush() (see
 * commit history around the level editor's stability-test rewrite) so the
 * level editor's stability test can settle a candidate castle with the exact
 * same damage model the real game's boot audit (auditLevels()) uses, instead
 * of a bare P.step() that can't see a crown getting crushed in place by a
 * falling block. game.js's own stepPhysicsWithImpacts() is now a thin wrapper
 * over step() below, passing hooks for the things that are genuinely
 * game-specific (sound, score, scene teardown, splash-chain explosions) —
 * everything portable (peak-speed tracking, hp loss, crush detection) lives
 * here so both callers can never quietly drift apart.
 *
 * `recs` is any array of block-like records with these fields, mutated in
 * place: { body, mesh, mat, hp, alive, _peakSpeed, _peakResolved,
 * _lastHitSpeed }. `mesh` MUST be a real THREE.Mesh with geometry sized to the
 * block's extents — not a bare Object3D — because applyCrush()'s overlap test
 * calls Box3.setFromObject(), which needs actual geometry to compute a
 * bounding box from; a geometry-less Object3D silently produces an empty box
 * and crush damage would never fire. game.js's real blocks[] already satisfy
 * this (their mesh IS the rendered block); a caller building throwaway test
 * records — the editor's stability test — has to give each one a matching
 * BoxGeometry even though nothing ever renders it.
 */
RT.settle = (function () {
  'use strict';

  const D = RT.data;
  const CFG = D.CFG;
  const P = RT.physics;

  const _crushBox = new THREE.Box3(), _otherBox = new THREE.Box3();

  /** A hard-landing block doesn't just hurt itself — it hurts whatever it's
   *  now resting directly on top of. Geometric, not a contact listener: real
   *  XZ footprint overlap plus `b`'s bottom sitting at (not through, not
   *  beside) `other`'s top, a tight tolerance so this never fires for two
   *  blocks merely standing side by side. */
  function applyCrush(recs, b, drop, hooks) {
    const crushDmg = (drop - CFG.IMPACT_THRESHOLD) * CFG.CRUSH_DMG_SCALE;
    _crushBox.setFromObject(b.mesh);
    for (const other of recs) {
      if (!other.alive || other === b) continue;
      _otherBox.setFromObject(other.mesh);
      const xzOverlap = _crushBox.max.x > _otherBox.min.x && _crushBox.min.x < _otherBox.max.x &&
                         _crushBox.max.z > _otherBox.min.z && _crushBox.min.z < _otherBox.max.z;
      if (!xzOverlap) continue;
      const gap = _crushBox.min.y - _otherBox.max.y;
      if (gap < -0.05 || gap > 0.1) continue;  // resting ON other, not through or beside it
      other._lastHitSpeed = drop;
      if (hooks.onImpact) hooks.onImpact(other, drop);
      other.hp -= crushDmg * (other.mat.fallDmgMult || 1);
      if (!other.mat.static) P.addVelocity(other.body, 0, -drop * 0.28, 0);
      if (other.hp <= 0 && hooks.onDestroy) hooks.onDestroy(other);
    }
  }

  /**
   * One physics step, plus the collateral damage that comes with it: blocks
   * smashing into each other during a collapse. Contact-point closing speed
   * handles immediate fractures; peak-speed tracking also catches long falls.
   *
   * `hooks`: { onImpact(rec, drop), onDestroy(rec) }, both optional. Neither
   * is told WHY — self-damage vs. crush both call onImpact the same way — the
   * distinction a caller might want (sound design, say) is available via
   * `rec` itself, not a separate parameter, to keep this the same call shape
   * for both paths.
   */
  function characterContacts(recs,hooks){
    const byBody=new Map(recs.filter(b=>b.alive).map(b=>[P.bodyId(b.body),b]));
    for(const [a,b] of P.contacts())for(const [sourceId,targetId] of [[a,b],[b,a]]){
      const source=byBody.get(sourceId),target=byBody.get(targetId);if(!source?.alive||!target?.alive||source.mat.static||source.mat.crown||source.mat.guard||source.mat.protected||!(target.mat.crown||target.mat.guard||target.mat.protected))continue;
      const speed=source._incomingSpeed||0;if(speed<1.6)continue;source._characterHits??=new Set();if(source._characterHits.has(target))continue;source._characterHits.add(target);
      target._lastHitSpeed=speed;target.hp-=Math.min(50,Math.max(18,speed*7));hooks.onImpact?.(target,speed);if(target.hp<=0)hooks.onDestroy?.(target);
    }
  }
  function isCharacter(b){return b.mat.crown||b.mat.guard||b.mat.protected;}
  function pointVelocity(m,p){
    if(!m)return {x:0,y:0,z:0};
    const x=p.x-m.p.x,y=p.y-m.p.y,z=p.z-m.p.z;
    return {x:m.v.x+m.a.y*z-m.a.z*y,y:m.v.y+m.a.z*x-m.a.x*z,z:m.v.z+m.a.x*y-m.a.y*x};
  }
  // Corner velocity matters: a long roof can hit hard while its center barely
  // moves. Measure closing speed at the actual contact before Bullet stops it.
  // Quiet resting contacts and pieces travelling together cause no damage.
  function structuralContacts(recs,hooks,contacts){
    const byBody=new Map(recs.filter(b=>b.alive).map(b=>[P.bodyId(b.body),b])),hits=new Map(),ground=P.groundId();
    for(const c of contacts){
      const a=byBody.get(c.a),b=byBody.get(c.b);
      if((!a&&c.a!==ground)||(!b&&c.b!==ground)||a&&isCharacter(a)||b&&isCharacter(b))continue;
      const va=pointVelocity(a?._motionBefore,c.p),vb=pointVelocity(b?._motionBefore,c.q);
      const speed=Math.max(0,-((va.x-vb.x)*c.n.x+(va.y-vb.y)*c.n.y+(va.z-vb.z)*c.n.z));
      for(const [target,other,point] of [[a,b,c.p],[b,a,c.q]]){
        if(!target||target.mat.static||target.mat.pickup||target._fractureCooldown>0)continue;
        const threshold=target.mat.glass?2.8:target.mat.family==='wood'?3.6:4.8;
        if(speed<=threshold)continue;
        const volume=r=>r?.spec?Math.max(.15,r.spec.w*r.spec.h*r.spec.d):1;
        const transfer=other&&!other.mat.static?Math.max(.45,Math.min(1.4,Math.sqrt(volume(other)/volume(target)))):1;
        const damage=(speed-threshold)*(target.mat.family==='wood'?22:25)*transfer;
        if(!hits.has(target)||hits.get(target).damage<damage)hits.set(target,{speed,damage,point});
      }
    }
    // Aggregate first: several contact points in one manifold are ONE impact.
    for(const [b,hit] of hits){
      if(!b.alive)continue;
      b._fractureCooldown=.18;b._lastHitSpeed=hit.speed;b._fracturePoint=hit.point;
      b.hp-=hit.damage*(b.mat.fallDmgMult||1);
      hooks.onImpact?.(b,hit.speed);
      if(b.hp<=0)hooks.onDestroy?.(b);
    }
  }
  function step(recs, dt, hooks) {
    hooks = hooks || {};
    for (const b of recs) {
      if(b.alive){b._motionBefore=P.motion(b.body);b._fractureCooldown=Math.max(0,(b._fractureCooldown||0)-dt);}
      if (b.alive && !b.mat.static){b._peakSpeed = Math.max(b._peakSpeed || 0, P.speed(b.body));const s=b.spec;b._incomingSpeed=P.surfaceSpeed(b.body,s?Math.hypot(s.w,s.h,s.d)/2:1); }
    }
    P.step(dt);
    for(const b of recs)if(b.alive)P.sync(b.mesh,b.body);
    const impacts=P.contactDetails();
    characterContacts(recs,hooks);
    structuralContacts(recs,hooks,impacts);
    for (const b of recs) {
      if (!b.alive) continue;
      P.sync(b.mesh, b.body);
      if (b.mat.static) continue;
      const cur = P.speed(b.body);
      /* Peak-since-last-rest, evaluated once the block is actually settled
         (below SLEEP_LINEAR), not frame-to-frame — see the long comment on
         the original in js/game.js's history for why frame-to-frame or
         first-crossing comparisons under-credit a real fall. */
      const peak = b._peakSpeed || 0;
      if((b.mat.crown||b.mat.guard)&&peak>3.2&&cur<CFG.SLEEP_LINEAR&&!b._peakResolved){b.hp=0;b._lastHitSpeed=peak;b._peakResolved=true;hooks.onDestroy?.(b);continue;}
      if (peak > CFG.IMPACT_THRESHOLD && cur < CFG.SLEEP_LINEAR && !b._peakResolved) {
        const drop = peak - cur;
        b._lastHitSpeed = drop;
        if (hooks.onImpact) hooks.onImpact(b, drop);
        b.hp -= (drop - CFG.IMPACT_THRESHOLD) * CFG.IMPACT_DMG_SCALE * (b.mat.fallDmgMult || 1);
        applyCrush(recs, b, drop, hooks);
        b._peakResolved = true;
        if (b.hp <= 0 && hooks.onDestroy) hooks.onDestroy(b);
      }
      if (cur > peak) {
        b._peakSpeed = cur;
        b._peakResolved = false;   // a fresh fall — allow this one to register too
      }
    }
  }

  /** Convenience for a caller that just wants an end state after N seconds of
   *  simulated settling, rather than driving step() itself frame by frame —
   *  the editor's stability test is exactly this shape. Mutates only what's
   *  passed in (`recs`' bodies/hp/alive/mesh transforms); never touches a
   *  scene, a save, or anything else. */
  function settle(recs, seconds, hooks) {
    const steps = Math.ceil(seconds / CFG.DT);
    for (let i = 0; i < steps; i++) step(recs, CFG.DT, hooks);
    return { steps: steps };
  }

  /** How far a piece may shift while settling and still count as having
   *  stayed put. Long the crown's own tolerance; standingReport() below holds
   *  every piece to it, so it is now one number rather than a per-caller
   *  choice.
   *
   *  Was 0.05, raised when js/levels.js's weldPairs() started bonding a
   *  board to whatever it touches rather than only to another board: a
   *  welded board frame settles as one assembly, which reads as a slightly
   *  larger one-off shift than the same pieces settling individually did.
   *
   *  Picked from measurement, not taste. Over four passes of all sixteen
   *  castles the worst legitimate settle is The Watchtower at 0.264 (a
   *  timber board; every other level is at or under 0.053, most under
   *  0.014), while the smallest GENUINE fault seen while building this —
   *  a board drawn with empty cells under it — free-falls 1.33, and the
   *  bug that put this check here in the first place fell eight units. So
   *  0.35 sits in a wide empty gap: comfortably above every real castle's
   *  settle, comfortably below anything actually failing to stand. Re-run
   *  the numbers before moving it; a value that merely squeaks past
   *  today's worst case is how this check stops earning its keep. */
  const STILL_EPS = 0.35;

  /** Simulated seconds a castle gets to prove it stands. */
  const DEFAULT_SECONDS = 4;

  /**
   * "Does this castle stand on its own?", computed once for every caller that
   * asks — js/game.js's boot audit and the level editor's stability button.
   * Settles `recs` and reports what standing there alone did to them.
   *
   * Both callers used to ask this question themselves, and they asked
   * DIFFERENT questions: each only ever compared CROWN positions, and leaned
   * on "is anything still awake at 4 seconds" to notice everything else. That
   * let a castle through whose four board frames free-fell eight units and
   * shattered on landing the instant it loaded — no crown was touched, so the
   * only check that could object was the sleep deadline, and whether a pile of
   * debris has gone quiet by an arbitrary 4-second mark is a stopwatch race
   * that Bullet resolves differently depending on what the physics world did
   * beforehand. The editor won that race and shipped the level; the game lost
   * it and refused to boot.
   *
   * So the real question is asked directly instead: did anything MOVE, and did
   * anything DIE, from merely being stood up? Both are facts about the castle
   * rather than about the clock, both are decided long before any deadline,
   * and either one is enough on its own. The sleep check stays as a backstop
   * for genuine jitter, but it is no longer the only thing standing between a
   * collapsing castle and a clean verdict.
   *
   * Every entry carries the `rec` it describes, so a caller can name the
   * failure in whatever coordinates it knows about (the editor has cell
   * provenance on `rec.spec`; the game has the material and a world position)
   * without this needing to know about either.
   */
  function standingReport(recs, seconds, hooks) {
    const starts = recs.map((r) => r.mesh.position.clone());
    const destroyed = [];
    const res = settle(recs, seconds === undefined ? DEFAULT_SECONDS : seconds, {
      onImpact: hooks && hooks.onImpact,
      onDestroy: (rec) => {
        destroyed.push(rec);
        if (hooks && hooks.onDestroy) hooks.onDestroy(rec);
      }
    });
    const moved = [];
    const awake = [];
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (!r.alive) continue;
      const dist = r.mesh.position.distanceTo(starts[i]);
      if (dist > STILL_EPS) moved.push({ rec: r, dist: dist });
      if (!r.mat.static && P.isAwake(r.body)) awake.push(r);
    }
    moved.sort((a, b) => b.dist - a.dist);
    return {
      steps: res.steps,
      stands: !destroyed.length && !moved.length && !awake.length,
      destroyed: destroyed,
      crownsLost: destroyed.filter((r) => r.mat.crown),
      moved: moved,
      worst: moved.length ? moved[0] : null,
      awake: awake
    };
  }

  return { step: step, settle: settle, standingReport: standingReport,
           STILL_EPS: STILL_EPS, DEFAULT_SECONDS: DEFAULT_SECONDS };
})();
