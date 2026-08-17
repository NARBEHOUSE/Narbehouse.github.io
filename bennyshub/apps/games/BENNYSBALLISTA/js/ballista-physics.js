'use strict';
/* ==========================================================================
   BENNY'S BALLISTA — physics adapter
   Thin wrapper around Box2D (box2d-wasm, loaded by box2d-entry.js) so the
   main game script never touches Box2D's raw API directly. Every block is a
   real dynamic rigid body — there is no hand-written "is this held up" check
   anywhere; Box2D's own contact solver is what keeps a well-built castle
   standing and what makes a knocked-out one topple and crash into its
   neighbours. See ../README.md's "Physics" section for the player-facing
   version of this.

   Units: Box2D is tuned for objects roughly 0.1-10 metres across, so pixels
   are converted at PPM (pixels-per-metre) = one board cell. Positions and
   sizes go in divided by PPM; everything read back out is multiplied by
   PPM, so the rest of the game never has to think in metres.
   ========================================================================== */
const BallistaPhysics = (() => {
  let box2D = null, world = null, PPM = 44;

  function init(module, opts){
    box2D = module;
    PPM = opts.ppm;
    const gravity = new box2D.b2Vec2(0, opts.gravity / PPM);
    world = new box2D.b2World(gravity);

    // One static ground fixture, wide and thick enough for the whole
    // playfield plus the camera's horizontal pan. Created once and never
    // touched again — levels only add and remove their own block bodies.
    const gd = new box2D.b2BodyDef();
    gd.set_type(box2D.b2_staticBody);
    gd.set_position(new box2D.b2Vec2(0, (opts.groundY + 50) / PPM));
    const groundBody = world.CreateBody(gd);
    const groundShape = new box2D.b2PolygonShape();
    groundShape.SetAsBox(3000 / PPM, 50 / PPM);
    const gfd = new box2D.b2FixtureDef();
    gfd.set_shape(groundShape);
    gfd.set_friction(opts.groundFriction);
    gfd.set_restitution(opts.groundRestitution);
    groundBody.CreateFixture(gfd);
  }

  // x, y, w, h are a block's pixel rect (top-left + size) — the same shape
  // the rest of the game already uses for its block objects.
  function addBlock(x, y, w, h, friction, restitution){
    const bd = new box2D.b2BodyDef();
    bd.set_type(box2D.b2_dynamicBody);
    bd.set_position(new box2D.b2Vec2((x + w/2) / PPM, (y + h/2) / PPM));
    const body = world.CreateBody(bd);

    const shape = new box2D.b2PolygonShape();
    shape.SetAsBox((w/2) / PPM, (h/2) / PPM);
    const fd = new box2D.b2FixtureDef();
    fd.set_shape(shape);
    fd.set_density(1);            // mass ends up equal to area in "cell units"
    fd.set_friction(friction);
    fd.set_restitution(restitution);
    body.CreateFixture(fd);
    return body;
  }

  function destroyBlock(body){
    if (body) world.DestroyBody(body);
  }

  function step(dt, velocityIterations, positionIterations){
    world.Step(dt, velocityIterations, positionIterations);
  }

  // Pulls a body's live position/rotation back into the plain block object
  // the rest of the game reads (b.x/b.y stay top-left, exactly like before —
  // nothing outside this file needs to know Box2D is involved at all).
  function sync(b){
    const pos = b.body.GetPosition();
    b.x = pos.get_x() * PPM - b.w/2;
    b.y = pos.get_y() * PPM - b.h/2;
    b.rot = b.body.GetAngle();
    b.awake = b.body.IsAwake();
  }

  function speed(body){
    const v = body.GetLinearVelocity();
    return Math.hypot(v.get_x(), v.get_y()) * PPM;
  }

  // Adds a knock (in px/s) on top of whatever velocity the body already
  // has, and guarantees it is awake to actually move on the next step —
  // used for a direct bolt hit or an explosion, never by the general sim.
  function addVelocity(body, vx, vy){
    body.SetAwake(true);
    const v = body.GetLinearVelocity();
    body.SetLinearVelocity(new box2D.b2Vec2(v.get_x() + vx/PPM, v.get_y() + vy/PPM));
  }

  return { init, addBlock, destroyBlock, step, sync, speed, addVelocity };
})();
