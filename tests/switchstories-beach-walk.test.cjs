'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const context = { NSS: {} }; context.window = context;
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../bennyshub/apps/games/NARBESWITCHSTORIES/js/beach-walk.js'), 'utf8'), context);
const pose = context.NSS.BeachWalk.pose;
const {point, art}=context.NSS.BeachWalk;
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-7, why + ': ' + a + ', ' + b);
for (const distance of [-0.90, -0.14 * 2172 / (0.315 * 724)]) {
    let previous = pose(0, distance);
    close(previous.bodyX, 0, 'starts at the right-hand origin');
    for (let frame = 1; frame <= 600; frame++) {
        const now = pose(frame / 600, distance);
        assert.ok(now.bodyX <= previous.bodyX + 1e-8, 'body always travels left');
        assert.ok(now.legs.some(leg => leg.planted), 'at least one foot supports her at every instant');
        now.legs.forEach((leg, i) => {
            const before = previous.legs[i];
            if (leg.planted && before.planted) {
                close(leg.x, before.x, 'supporting foot never slides horizontally');
                close(leg.y, before.y, 'supporting foot stays on the sand');
                close(leg.angle, 0, 'planted foot is flat');
            }
            close(Math.hypot(leg.kneeX-leg.hipX, leg.kneeY-leg.hipY), .126, 'thigh keeps its length');
            close(Math.hypot(leg.x-leg.kneeX, leg.y-leg.kneeY), .126, 'shin keeps its length');
            const thigh=[leg.kneeX-leg.hipX,leg.kneeY-leg.hipY],shin=[leg.x-leg.kneeX,leg.y-leg.kneeY];
            const bend=Math.acos(Math.max(-1,Math.min(1,(thigh[0]*shin[0]+thigh[1]*shin[1])/(.126*.126))));
            assert.ok(bend<38*Math.PI/180,'knees stay softly bent instead of folding into a high step');
            const ankle=point(leg,art.ankleX,art.ankleY);
            close(ankle.x,leg.x,'painted ankle meets its planted contact');
            close(ankle.y,leg.y,'painted ankle stays attached');
            for(const y of [(art.hipY+art.ankleY)/2,art.ankleY]) {
                const x=art.hipX+(art.ankleX-art.hipX)*(y-art.hipY)/(art.ankleY-art.hipY);
                const left=point(leg,x,y-.00001),right=point(leg,x,y+.00001);
                assert.ok(Math.hypot(left.x-right.x,left.y-right.y)<1e-6,'paint remains continuous across knee and ankle');
            }
        });
        assert.ok(now.prints.length >= previous.prints.length, 'footprints remain after each step');
        previous.prints.forEach((print, i) => {
            close(now.prints[i].x, print.x, 'footprint stays at its ground contact');
            close(now.prints[i].y, print.y, 'footprint stays at its ground height');
        });
        previous = now;
    }
    close(previous.bodyX, distance, 'finishes at the left-hand destination');
    close(previous.legs[0].x + .015, distance, 'far foot finishes beneath her');
    close(previous.legs[1].x - .015, distance, 'near foot closes alongside');
    assert.equal(previous.prints.length, 8);
    assert.ok(previous.prints.every(print=>print.x>previous.bodyX), 'finished footprint trail is behind her to the right');
    for(const t of [2/8,3/8,4/8,5/8,6/8]) {
        const before=pose(t-.001,distance).bodyX,at=pose(t,distance).bodyX,after=pose(t+.001,distance).bodyX;
        close(at-before,after-at,'torso moves smoothly through each footfall');
    }
}
console.log('Passed: gentle knee bends under 38 degrees, short low steps, leftward travel, fixed supporting feet, continuous painted knees/ankles, eight stationary footprints, and a two-foot stop in both looks.');
