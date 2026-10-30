/** Grounded cutout walking: all distances are fractions of character height. */
window.NSS = window.NSS || {};
NSS.BeachWalk = (function () {
    'use strict';
    const clamp = n => Math.max(0, Math.min(1, n));
    const ease = n => n * n * (3 - 2 * n);
    const legLength = 0.252;
    const steps = 8;
    // Landmarks in the single continuous painted leg, in source pixels.
    const art = { hipX: 201, hipY: 16, ankleX: 195, ankleY: 298, soleY: 374, widthScale: 0.72 };
    const ankleToSole = legLength * (art.soleY - art.ankleY) / (art.ankleY - art.hipY);

    function pose(progress, distance) {
        const phase = clamp(progress) * steps, step = Math.min(steps-1, Math.floor(phase)), f = phase - step;
        const landing = n => distance * Math.min(n + 1, steps-1) / (steps-1);
        const feet = [0, 0], prints = [];
        // Short, low steps avoid a high-kneed march. The last step brings
        // the trailing foot alongside the other.
        // A footprint belongs to the contact being LEFT, never to a future step.
        for (let k = 0; k <= step; k++) {
            const leg = k % 2;
            if (k < step || f > 0.10) prints.push({ x: feet[leg] + (leg ? 0.015 : -0.015), y: 0.965 + (leg ? 0.018 : -0.018), leg });
            if (k < step) feet[leg] = landing(k);
        }
        const leg = step % 2;
        // Ease into and out of the walk, but keep moving through each step.
        // Stopping the torso at every footfall made the old walk mechanical.
        const stride = 1 / (steps-1), finish = phase - (steps-1);
        const forward = phase < 1 ? stride * .5 * phase * phase : phase > steps-1
            ? 1-stride*.5 + stride*finish-stride*.5*finish**2 : stride*(phase-.5);
        const bodyX = distance * forward;
        feet[leg] += (landing(step) - feet[leg]) * ease(f);
        const lift = Math.sin(f * Math.PI);
        const legs = feet.map((x, i) => ({
            x: x + (i ? 0.015 : -0.015),
            y: 0.965 + (i ? 0.018 : -0.018) - ankleToSole - (i === leg ? lift * 0.010 : 0),
            angle: i === leg ? -lift * 0.06 : 0,
            planted: i !== leg || f === 0 || f === 1,
            hipX: bodyX + (i ? 0.012 : -0.012),
            depth: i ? 0.018 : -0.018
        }));
        // Lower the hips just enough for the planted leg to reach the sand.
        const hipY = Math.max(...legs.map(a => a.y - a.depth - Math.sqrt(Math.max(0.001, legLength ** 2 - (a.x - a.hipX) ** 2))));
        legs.forEach(a => {
            const dx = a.x - a.hipX, dy = a.y - hipY - a.depth, d = Math.hypot(dx, dy);
            const bend = Math.sqrt(Math.max(0, (legLength / 2) ** 2 - (d / 2) ** 2));
            a.hipY = hipY + a.depth;
            // Both knees bend toward the direction Sanja faces: screen left.
            a.kneeX = (a.hipX + a.x) / 2 - dy / d * bend;
            a.kneeY = (a.hipY + a.y) / 2 + dx / d * bend;
        });
        return { bodyX, hipY, legs, prints };
    }
    // A continuous curve carries the whole painted leg across both joints.
    // Its tangent matches at the knee and meets the foot's rigid transform.
    function point(a, x, y) {
        const scale = legLength / (art.ankleY - art.hipY), width = scale * art.widthScale;
        if (y >= art.ankleY) {
            const dx = (x - art.ankleX) * width, dy = (y - art.ankleY) * scale;
            return { x: a.x + Math.cos(a.angle) * dx - Math.sin(a.angle) * dy,
                y: a.y + Math.sin(a.angle) * dx + Math.cos(a.angle) * dy };
        }
        const hip = { x: a.hipX, y: a.hipY }, knee = { x: a.kneeX, y: a.kneeY }, ankle = { x: a.x, y: a.y };
        const first = { x: knee.x - hip.x, y: knee.y - hip.y };
        if (y <= art.hipY) {
            const d = Math.hypot(first.x, first.y), dx = (x - art.hipX) * width, dy = (y - art.hipY) * scale;
            return { x: hip.x + first.x / d * dy + first.y / d * dx, y: hip.y + first.y / d * dy - first.x / d * dx };
        }
        const t = (y - art.hipY) / (art.ankleY - art.hipY), upper = t < 0.5, u = upper ? t * 2 : t * 2 - 1;
        const middle = { x: (ankle.x - hip.x) / 2, y: (ankle.y - hip.y) / 2 };
        const last = { x: -Math.sin(a.angle) * legLength / 2, y: Math.cos(a.angle) * legLength / 2 };
        const p0 = upper ? hip : knee, p1 = upper ? knee : ankle, m0 = upper ? first : middle, m1 = upper ? middle : last;
        const value = key => (2*u*u*u-3*u*u+1)*p0[key] + (u*u*u-2*u*u+u)*m0[key]
            + (-2*u*u*u+3*u*u)*p1[key] + (u*u*u-u*u)*m1[key];
        const derivative = key => (6*u*u-6*u)*p0[key] + (3*u*u-4*u+1)*m0[key]
            + (-6*u*u+6*u)*p1[key] + (3*u*u-2*u)*m1[key];
        const dx = derivative('x'), dy = derivative('y'), d = Math.hypot(dx,dy);
        const offset = (x - art.hipX - (art.ankleX-art.hipX)*t) * width;
        return { x: value('x') + dy/d*offset, y: value('y') - dx/d*offset };
    }
    return { pose, point, art, legLength };
})();
