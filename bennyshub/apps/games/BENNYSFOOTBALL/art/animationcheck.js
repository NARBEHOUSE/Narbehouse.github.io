// Exercise the real animation controller without a browser or Phaser renderer.
// Run: node art/animationcheck.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = {
    Phaser: { Scene: class {}, Math: {
        Clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
        Distance: { Between: (x, y, a, b) => Math.hypot(a - x, b - y) }
    } },
    localStorage: { getItem: () => null }, console
};
vm.createContext(sandbox);
for (const file of ['constants.js', 'motion.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), sandbox);
}
const { GameScene, P } = vm.runInContext('({ GameScene, P: PLAYER_SPRITE })', sandbox);
const layer = () => ({ frame: 0, setFrame(i) { this.frame = i; }, setTexture(k,i) { this.key=k;this.frame=i; } });
function player() {
    return { x: 100, y: 200, setScale() {}, _spr: {
        base: layer(), jersey: layer(), glow: layer(), dir: 6,
        phase: 0, idlePhase: 0, moving: false, lastX: null, lastY: null
    } };
}
function fixture() {
    const scene = new GameScene(), p = player();
    Object.assign(scene, { offense: [p], defense: [], ball: { carrier: p }, phase: 'anim', _lineFormationReady: true });
    return { scene, p };
}
const row = p => Math.floor(p._spr.base.frame / P.dirs);
const inClip = (p, name) => row(p) >= P.anims[name].row && row(p) < P.anims[name].row + P.anims[name].frames;

{
    const {scene,p}=fixture();const motion=scene._motion();
    for(const degrees of [22,24,21,25,23,22]) {
        const radians=degrees*Math.PI/180;
        motion.face(p,{x:p.x+Math.cos(radians)*30,y:p.y+Math.sin(radians)*30});
        assert.equal(p._spr.dir,6,'tracking a receiver near a direction boundary must not flicker');
    }
    motion.face(p,{x:p.x,y:p.y+30});assert.equal(p._spr.dir,0,'real target changes still turn the player');
}

for (const phase of ['playcall','defcall','transition','message']) {
    for (const role of ['OL','TE','DL','QB','RB','WR','LB','CB','S']) {
        const {scene,p}=fixture();scene.ball.carrier=null;scene.phase=phase;
        scene._setPlayerLabel(p,role);scene._updatePlayerSprites(16);
        const expected=role==='DL'?'stance_dl':['OL','TE'].includes(role)?'stance_ol':'idle';
        assert(inClip(p,expected),phase+' '+role+' uses its starting pose');
        scene._updatePlayerSprites(2000);
        assert(inClip(p,expected),'holds set stance while selection waits');
        p.x+=12;scene._updatePlayerSprites(100);
        assert(inClip(p,'run'),'formation adjustments use running, not a sliding crouch');
        scene._updatePlayerSprites(100);assert(inClip(p,expected),'settles back into stance');
        scene.phase='anim';scene._updatePlayerSprites(16);
        assert(inClip(p,'idle'),'stance releases at the snap');
    }
}
{
    const {scene,p}=fixture();scene.ball.carrier=null;scene.phase='defcall';
    scene._setPlayerLabel(p,'DL');scene._updatePlayerSprites(16);assert(inClip(p,'stance_dl'));
    scene._setPlayerLabel(p,'QB');scene.ball.carrier=p;scene._updatePlayerSprites(16);
    assert(inClip(p,'idle_carry'),'roles and possession update when teams switch sides');
}
{
    const {scene,p}=fixture();scene.ball.carrier=null;scene.phase='playcall';scene._setPlayerLabel(p,'OL');
    scene._motion().reset();scene._updatePlayerSprites(16);
    assert(inClip(p,'idle'),'post-touchdown menus do not crouch players away from the line');
}

{
    const { scene, p } = fixture();
    scene._updatePlayerSprites(16);
    assert(inClip(p, 'idle_carry'), 'stationary carrier uses a planted pose');
    assert(p._spr.showsBall);
    scene.ball.carrier = null;
    scene._updatePlayerSprites(500);
    assert(inClip(p, 'idle'));
    assert.equal(p._spr.showsBall, false, 'handoff removes the old carrier ball');
    const first = row(p);
    scene._updatePlayerSprites(500);
    assert.notEqual(row(p), first, 'ready pose breathes while stationary');
    p.x += 20;
    scene._updatePlayerSprites(100);
    assert(inClip(p, 'run'));
    assert.equal(p._spr.base.frame, p._spr.jersey.frame);
    assert.equal(p._spr.base.frame, p._spr.glow.frame);
    scene._updatePlayerSprites(100);
    assert(inClip(p, 'idle'), 'stop returns to ready stance');
}
{
    // The same travel produces the same stride at different update rates.
    const simulate = (steps, dt) => {
        const { scene, p } = fixture();
        scene._updatePlayerSprites(16);
        for (let i = 0; i < steps; i++) { p.x += 120 / steps; scene._updatePlayerSprites(dt); }
        return p._spr.phase;
    };
    assert(Math.abs(simulate(60, 1000 / 60) - simulate(30, 1000 / 30)) < 1e-9);
}
{
    const { scene, p } = fixture();
    scene._updatePlayerSprites(16);
    for (const angle of [22, 23, 22, 24, 21]) {
        p.x += Math.cos(angle * Math.PI / 180) * 4;
        p.y += Math.sin(angle * Math.PI / 180) * 4;
        scene._updatePlayerSprites(16);
        assert.equal(p._spr.dir, 6, 'small route jitter must not flicker facings');
    }
    p.y += 20;
    scene._updatePlayerSprites(100);
    assert.equal(p._spr.dir, 0, 'a real turn changes facing');
    p.x += 300;
    scene.facePlayer(p, { x: p.x - 100, y: p.y });
    scene._updatePlayerSprites(16);
    assert.equal(p._spr.dir, 2, 'formation teleport must not override explicit facing');
    assert(inClip(p, 'idle_carry'));
}
{
    const { scene, p } = fixture();
    scene.playPlayerAction(p, 'throw', { x: 900, y: p.y });
    scene._updatePlayerSprites(100);
    assert(p._spr.showsBall);
    scene._updatePlayerSprites(240);
    assert.equal(p._spr.showsBall, false, 'ball leaves the throwing hand at release');
    scene.ball.carrier = null;
    scene._updatePlayerSprites(300);
    assert(inClip(p, 'idle'));
    scene.playPlayerAction(p, 'tackle');
    scene._updatePlayerSprites(900);
    const down = row(p);
    scene._updatePlayerSprites(900);
    assert.equal(row(p), down, 'tackled player stays down');
    scene._clearPlayerActions();
    scene._updatePlayerSprites(16);
    assert(inClip(p, 'idle'));
    assert.equal(p._spr.showsBall, false);
}
for (const clipName of ['kick','placekick']) for (const classic of [false, true]) {
    const { scene, p } = fixture();
    if (classic) delete p._spr;
    let arrival, timer, strikes = 0, kicks = 0;
    scene.tweens = { killTweensOf() {} };
    scene.jog = (who, x, y, duration, ease, done) => {
        arrival = () => { who.x = x; who.y = y; done(); };
    };
    scene.time = { delayedCall: (delay, done) => { timer = { delay, done }; } };
    scene.audio = { play: key => { assert.equal(key, 'kick'); kicks++; } };
    scene._kickFrom(p, { x: 300, y: 200 }, { x: 900, y: 200 }, () => strikes++, clipName);
    assert.equal(strikes, 0, 'approach must finish before launch');
    assert.equal(scene.ball.carrier, null);
    arrival();
    assert.equal(strikes, 0, 'wind-up must finish before launch');
    const clip=P.anims[clipName];
    assert.equal(timer.delay, classic ? 0 : clip.strikeFrame / clip.fps * 1000);
    if (!classic) {
        scene._updatePlayerSprites(timer.delay);
        assert.equal(row(p), clip.row + clip.strikeFrame);
    }
    timer.done();
    assert.equal(strikes, 1);
    assert.equal(kicks, 1);
}
{
    const { scene,p }=fixture();scene.ball.carrier=null;
    p._blocking=true;scene._updatePlayerSprites(200);
    assert.equal(p._spr.sheet,P.actions.baseKey);assert(inClip(p,'block'));
    p._blocking=false;scene.playPlayerAction(p,'recover');scene._updatePlayerSprites(150);
    assert(inClip(p,'recover'));scene._updatePlayerSprites(1000);
    assert.equal(p._spr.sheet,P.baseKey,'get-up returns to the main atlas');
    scene.playPlayerAction(p,'celebrate');scene._updatePlayerSprites(400);
    assert(inClip(p,'celebrate'));assert.equal(p._spr.sheet,P.actions.baseKey);
}
for (const method of ['kickFieldGoal', 'oppKickFG', 'oppKickPAT']) {
    const { scene, p } = fixture();
    let strike, flights = 0;
    Object.assign(scene, {
        offense: Array.from({ length: 6 }, player), defense: Array.from({ length: 6 }, player),
        gs: { ballPosition: 65, score: { us: 0, them: 0 } }, opp: { yard: 35 },
        fgDist: 45, aimWindow: .2, oppColor: { name: 'Blue' },
        audio: { play() {}, speak() {} }, time: { delayedCall: (delay, done) => done() },
        tweens: { add: () => flights++ }, jog() {}, _zoomOut() {},
        idealKickPower: () => 70,
        _runPlaceKick: (us, yard, target, onStrike) => {
            assert.equal(us,method==='kickFieldGoal');
            assert(Number.isFinite(yard));
            assert(Number.isFinite(target.x));
            strike = onStrike;
        }
    });
    scene[method](0, 70);
    assert.equal(typeof strike, 'function', method + ' uses the kick controller');
    assert.equal(flights, 0, method + ' waits for boot contact');
    strike();
    assert.equal(flights, 1, method + ' launches exactly once');
}
console.log('Animation checks passed: idle, running, frame-rate independence, turning, ball transfer, tackles, kick timing, both teams’ kick sequences and classic fallback.');
