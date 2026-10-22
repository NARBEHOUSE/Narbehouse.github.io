/**
 * NARBE Glow Pop - the scene: one giant glowing ball (or bug) on a plain
 * dark screen, and the sparkles when it pops.
 *
 * The ball's state is one of:
 *   'in'       growing into place
 *   'waiting'  Wait for It only: there, but dim and not ready yet
 *   'ready'    glowing, waiting for a press
 *   'squash'   ladybug or bee squishing flat right after a press
 *   'gone'     just popped, waiting to come back
 *
 * The scene keeps drawing behind the menus. It only makes sounds while it is
 * live (during play), so a chime or appear sound never plays over a menu.
 */

window.NGP = window.NGP || {};

NGP.Scene = (function () {
    'use strict';

    const C = NGP.CONFIG;
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
    function mix(hex, hex2, amt) { const a = hexToRgb(hex), b = hexToRgb(hex2); return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * amt)).join(',') + ')'; }

    function S() { return NGP.Settings; }
    const mixItUp = () => S().get('reactions') === 'mix';
    const isWaitMode = () => S().get('tapStyle') === 'wait';
    const timing = () => S().option('comesBack');

    let canvas = null, ctx = null;
    let W = 0, H = 0;
    let live = false;
    let time = 0;
    const counts = { pops: 0, bigPops: 0, minis: 0, builds: 0, readies: 0 };

    const ball = {
        state: 'in', t: 0,
        color: '#ffd60a',
        bright: 1,         // 1 is full brightness; lower while waiting in Wait for It
        readyGlow: 0,      // extra glow right when it becomes ready
        build: 0,          // Build Up: presses so far
        swell: 0,          // Build Up: how much bigger it is right now (0 to 1)
        swellTarget: 0,
        wobble: 0,         // little squish after each Build Up press
        bigPop: false
    };
    let turnsIndex = 0;

    function sound(name, a, b) { if (live && NGP.Sound) NGP.Sound[name](a, b); }

    const turnColors = () => Object.values(C.colors).filter(c => c.hex).map(c => c.hex);
    function nextColor() {
        if (S().get('color') !== 'turns') return S().option('color').hex;
        const list = turnColors();
        turnsIndex = (turnsIndex + 1) % list.length;
        return list[turnsIndex];
    }

    /** Where it is and how big, keeping it fully on screen. */
    function geometryFor(w, h) {
        const R = Math.min(w, h) * S().option('size').radius;
        const pos = S().option('position');
        const x = clamp(pos.x * w, Math.min(R * 1.05, w / 2), Math.max(w - R * 1.05, w / 2));
        const y = clamp(pos.y * h, Math.min(R * 1.1, h / 2), Math.max(h - R * 1.05, h / 2));
        return { x, y, R };
    }
    function ballGeometry() { return geometryFor(W, H); }

    function bringBack() {
        ball.state = 'in'; ball.t = 0;
        ball.color = nextColor();
        ball.bright = isWaitMode() ? C.waitingBrightness : 1;
        if (!isWaitMode() && C.appearSound) sound('appear'); // in Wait for It, the ready chime is the cue instead
    }
    function becomeReady() {
        ball.state = 'ready'; ball.t = 0;
        if (isWaitMode()) {
            ball.readyGlow = 1;
            const { x, y, R } = ballGeometry();
            rings.push({ x, y, r: R, color: '#ffffff', life: 0.6, max: 0.6 });
            if (live) counts.readies++;
            sound('ready');
        }
    }

    // --- large, recognizable shapes, kept in the chosen color and outline.
    // Same Every Time uses a fixed pattern; Mix It Up varies each full burst.

    let sparkles = [];
    let rings = [];
    const burstShapes = Object.keys(C.popShapes).filter(id => id !== 'variety');
    let lastBurstShape = -1;
    function burst(x, y, R, color, count, big) {
        const mixed = mixItUp();
        const selected = S().get('popShape');
        let burstShape = selected;
        if (selected === 'variety' && mixed) {
            lastBurstShape = (lastBurstShape + 1 + Math.floor(Math.random() * (burstShapes.length - 1))) % burstShapes.length;
            burstShape = burstShapes[lastBurstShape];
        }
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * TAU + (mixed ? rand(-0.15, 0.15) : 0);
            const speed = R * (mixed ? rand(2.0, 3.4) : (i % 2 ? 2.4 : 3.2)) * (big ? 1.3 : 1);
            const shape = burstShape === 'variety' ? burstShapes[i % burstShapes.length] : burstShape;
            const upright = shape === 'heart' || shape === 'diamond';
            sparkles.push({
                shape,
                x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                size: R * (mixed ? rand(0.1, 0.17) : (i % 2 ? 0.12 : 0.15)) * (big ? 1.2 : 1),
                color: i % 3 === 0 ? '#ffffff' : color,
                spin: upright ? 0 : mixed ? rand(-2, 2) : 1,
                rot: upright ? (mixed ? rand(-0.2, 0.2) : 0) : mixed ? Math.random() * TAU : angle,
                life: big ? 1.2 : 0.9, max: big ? 1.2 : 0.9
            });
        }
        rings.push({ x, y, r: R, color, life: 0.5, max: 0.5 });
        if (sparkles.length > 300) sparkles.splice(0, sparkles.length - 300);
    }

    // --- presses: what a press does depends on the Tap Style setting.

    let lastTapTime = -1;
    function popBall(big) {
        ball.bigPop = big;
        counts.pops++;
        if (big) counts.bigPops++;
        if (S().get('shape') === 'ball') { finishPop(); sound('pop', big, false); }
        else { ball.state = 'squash'; ball.t = 0; sound('pop', big, true); } // bugs squish first, then burst
    }
    function finishPop() {
        const { x, y, R } = ballGeometry();
        burst(x, y, R * (1 + ball.swell * 0.35), ball.color, C.sparkleCount + (ball.bigPop ? 12 : 0), ball.bigPop);
        ball.state = 'gone'; ball.t = 0;
        ball.build = 0; ball.swell = 0; ball.swellTarget = 0; ball.wobble = 0; ball.readyGlow = 0;
    }
    function miniSparkle() {
        const { x, y, R } = ballGeometry();
        burst(x, y, R * 0.5, ball.color, 8, false);
        counts.minis++;
        sound('mini');
    }
    function tinySparkle() {
        const { x, y, R } = ballGeometry();
        burst(x, y, R * 0.3, ball.color, 4, false);
        counts.minis++;
        sound('tiny');
    }
    /** A press. Every press gets something; presses closer than the cooldown count as one. */
    function press() {
        const now = performance.now() / 1000;
        if (now - lastTapTime < C.tapCooldown) return false;
        lastTapTime = now;

        const style = S().get('tapStyle');

        if (style === 'wait') {
            if (ball.state === 'ready') popBall(false);
            else tinySparkle(); // too early: something tiny and quiet, but no big reward
            return true;
        }

        const isThere = ball.state === 'ready' || ball.state === 'in';
        if (!isThere) { miniSparkle(); return true; } // every press still gets a little something

        if (style === 'every') { popBall(false); return true; }

        if (style === 'build') {
            ball.build++;
            if (ball.build >= C.buildUpTaps) { popBall(true); return true; }
            ball.swellTarget = ball.build / C.buildUpTaps;
            ball.wobble = 1;
            counts.builds++;
            sound('build', ball.build);
        }
        return true;
    }

    // --- drawing -----------------------------------------------------------------

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function outlineColor() { return S().option('outline').hex; }
    function strokeOutline(r) {
        const oc = outlineColor();
        if (!oc) return;
        ctx.strokeStyle = oc; ctx.lineWidth = r * 0.07; ctx.stroke();
    }

    // The glowing ball, drawn centered at 0,0 with radius r.
    function drawBallShape(r, t, c) {
        const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
        body.addColorStop(0, mix(c, '#ffffff', 0.7));
        body.addColorStop(0.5, c);
        body.addColorStop(1, mix(c, '#000000', 0.2));
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(0, 0, r * (outlineColor() ? 0.965 : 1), 0, TAU); ctx.fill();
        strokeOutline(r);
        // A slow shimmer that moves around the top of the ball
        const sa = -2.2 + Math.sin(t * 0.9) * 0.5;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(Math.cos(sa) * r * 0.5, Math.sin(sa) * r * 0.5, r * 0.22, r * 0.11, sa + Math.PI / 2, 0, TAU);
        ctx.fill();
    }

    // A simple, bold ladybug seen from above, facing up.
    function drawLadybug(r, t, c) {
        const dark = mix(c, '#000000', 0.45);   // head and legs: a dark shade of the body color, so they still show on black
        const wig = Math.sin(t * 6) * 0.06;
        ctx.lineCap = 'round';

        // legs
        ctx.strokeStyle = dark; ctx.lineWidth = r * 0.08;
        for (const side of [-1, 1]) for (const ly of [-0.2, 0.2, 0.6]) {
            ctx.beginPath(); ctx.moveTo(side * 0.55 * r, ly * r);
            ctx.lineTo(side * 0.97 * r, (ly + 0.12 + wig * side) * r); ctx.stroke();
        }
        // antennae
        ctx.lineWidth = r * 0.06;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 0.1 * r, -0.92 * r);
            ctx.quadraticCurveTo(side * 0.2 * r, -1.08 * r, (side * 0.32 + wig) * r, -1.1 * r); ctx.stroke();
            ctx.fillStyle = dark; ctx.beginPath(); ctx.arc((side * 0.32 + wig) * r, -1.1 * r, r * 0.06, 0, TAU); ctx.fill();
        }
        // head
        ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, -0.7 * r, 0.3 * r, 0, TAU); ctx.fill(); strokeOutline(r * 0.6);
        // body
        const body = ctx.createRadialGradient(-r * 0.25, -r * 0.15, r * 0.05, 0, 0.15 * r, 0.8 * r);
        body.addColorStop(0, mix(c, '#ffffff', 0.55)); body.addColorStop(0.55, c); body.addColorStop(1, mix(c, '#000000', 0.15));
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0.15 * r, 0.8 * r, 0, TAU); ctx.fill(); strokeOutline(r);
        // center line and spots
        ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.05;
        ctx.beginPath(); ctx.moveTo(0, -0.6 * r); ctx.lineTo(0, 0.9 * r); ctx.stroke();
        ctx.fillStyle = '#111';
        for (const [sx, sy, sr] of [[0.36, -0.15, 0.14], [0.45, 0.3, 0.12], [0.2, 0.62, 0.11]]) {
            for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * sx * r, sy * r, sr * r, 0, TAU); ctx.fill(); }
        }
    }

    // A simple, bold bee seen from above, with flapping wings.
    function drawBee(r, t, c) {
        const dark = mix(c, '#000000', 0.45);
        const flap = 0.75 + 0.25 * Math.sin(t * 18);
        ctx.lineCap = 'round';

        // wings (behind the body)
        ctx.fillStyle = 'rgba(235,248,255,0.9)';
        for (const side of [-1, 1]) {
            ctx.save(); ctx.translate(side * 0.45 * r, -0.2 * r); ctx.rotate(side * 0.45); ctx.scale(1, flap);
            ctx.beginPath(); ctx.ellipse(side * 0.08 * r, -0.12 * r, 0.32 * r, 0.46 * r, 0, 0, TAU); ctx.fill();
            ctx.restore();
        }
        // stinger
        ctx.fillStyle = dark; ctx.beginPath();
        ctx.moveTo(-0.09 * r, 0.84 * r); ctx.lineTo(0.09 * r, 0.84 * r); ctx.lineTo(0, 1.02 * r); ctx.closePath(); ctx.fill();
        // body with stripes
        const bodyPath = new Path2D();
        bodyPath.ellipse(0, 0.12 * r, 0.56 * r, 0.78 * r, 0, 0, TAU);
        const body = ctx.createRadialGradient(-r * 0.2, -r * 0.1, r * 0.05, 0, 0.12 * r, 0.8 * r);
        body.addColorStop(0, mix(c, '#ffffff', 0.55)); body.addColorStop(0.55, c); body.addColorStop(1, mix(c, '#000000', 0.15));
        ctx.fillStyle = body; ctx.fill(bodyPath);
        ctx.save(); ctx.clip(bodyPath);
        ctx.fillStyle = '#111';
        for (const sy of [-0.05, 0.3, 0.65]) ctx.fillRect(-r, sy * r, 2 * r, 0.17 * r);
        ctx.restore();
        const oc = outlineColor();
        if (oc) { ctx.strokeStyle = oc; ctx.lineWidth = r * 0.07; ctx.stroke(bodyPath); }
        // antennae
        ctx.strokeStyle = dark; ctx.lineWidth = r * 0.06;
        const wig = Math.sin(t * 6) * 0.05;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 0.1 * r, -0.92 * r);
            ctx.quadraticCurveTo(side * 0.2 * r, -1.08 * r, (side * 0.3 + wig) * r, -1.1 * r); ctx.stroke();
            ctx.fillStyle = dark; ctx.beginPath(); ctx.arc((side * 0.3 + wig) * r, -1.1 * r, r * 0.06, 0, TAU); ctx.fill();
        }
        // head
        ctx.fillStyle = mix(c, '#ffffff', 0.15);
        ctx.beginPath(); ctx.arc(0, -0.7 * r, 0.32 * r, 0, TAU); ctx.fill();
        ctx.strokeStyle = oc || '#111'; ctx.lineWidth = oc ? r * 0.06 : r * 0.04; ctx.stroke();
        // face
        for (const side of [-1, 1]) {
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(side * 0.12 * r, -0.76 * r, 0.07 * r, 0, TAU); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(side * 0.1 * r, -0.79 * r, 0.025 * r, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.04;
        ctx.beginPath(); ctx.arc(0, -0.66 * r, 0.12 * r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }

    /** The soft outer glow, then the shape itself, centered at 0,0. */
    function drawFigure(shape, color, r, t, glow, bright, sx, sy) {
        const outer = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.8);
        outer.addColorStop(0, rgba(color, Math.min(0.9, 0.5 * glow)));
        outer.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = outer;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, TAU); ctx.fill();

        ctx.scale(sx, sy);
        ctx.globalAlpha = bright;
        if (shape === 'ladybug') drawLadybug(r, t, color);
        else if (shape === 'bee') drawBee(r, t, color);
        else drawBallShape(r, t, color);
        ctx.globalAlpha = 1;
    }

    function drawMain() {
        if (ball.state === 'gone') return;
        const { x, y, R } = ballGeometry();

        let scale = 1 + Math.sin(time * 2.4) * C.pulseAmount;              // gentle breathing
        if (ball.state === 'in') scale *= Math.max(0, easeOutBack(Math.min(1, ball.t / timing().grow)));
        scale *= 1 + ball.swell * 0.35;                                     // Build Up growth
        scale *= 1 + ball.readyGlow * 0.08;                                 // little bump when ready
        const r = R * scale;
        if (r < 1) return;

        let sx = 1 + ball.wobble * 0.1 * Math.sin(time * 28);
        let sy = 2 - sx;
        if (ball.state === 'squash') {
            const p = Math.min(1, ball.t / C.squashTime);
            sx *= 1 + 0.35 * p; sy *= 1 - 0.55 * p;
        }
        const glow = (1 + ball.swell * 0.8 + ball.readyGlow * 0.8) * ball.bright;

        ctx.save();
        ctx.translate(x, y);
        drawFigure(S().get('shape'), ball.color, r, time, glow, ball.bright, sx, sy);
        ctx.restore();
    }

    function drawBurstShape(s, size) {
        ctx.save();
        ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.scale(size, size);
        ctx.beginPath();
        if (s.shape === 'circle') {
            ctx.arc(0, 0, 0.9, 0, TAU);
        } else if (s.shape === 'heart') {
            ctx.moveTo(0, 0.95);
            ctx.bezierCurveTo(-0.2, 0.65, -1, 0.12, -1, -0.4);
            ctx.bezierCurveTo(-1, -1.08, -0.25, -1.15, 0, -0.55);
            ctx.bezierCurveTo(0.25, -1.15, 1, -1.08, 1, -0.4);
            ctx.bezierCurveTo(1, 0.12, 0.2, 0.65, 0, 0.95);
        } else if (s.shape === 'diamond') {
            ctx.moveTo(0, -1); ctx.lineTo(0.7, 0); ctx.lineTo(0, 1); ctx.lineTo(-0.7, 0);
        } else {
            const flower = s.shape === 'flower', steps = flower ? 72 : 10;
            for (let i = 0; i < steps; i++) {
                const a = -Math.PI / 2 + i * TAU / steps;
                const r = flower ? 0.75 + 0.25 * Math.cos(6 * a) : i % 2 ? 0.45 : 1;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
        }
        ctx.closePath(); ctx.fill();
        const edge = outlineColor();
        if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.12, 1.5 / size); ctx.lineJoin = 'round'; ctx.stroke(); }
        ctx.restore();
    }
    function drawEffects() {
        ctx.globalCompositeOperation = 'lighter';
        for (const ring of rings) {
            const a = ring.life / ring.max;
            ctx.strokeStyle = rgba(ring.color, a * 0.8);
            ctx.lineWidth = ring.r * 0.08;
            ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r * (1 + (1 - a) * 0.9), 0, TAU); ctx.stroke();
        }
        // Source-over keeps selected colors and black outlines intact.
        ctx.globalCompositeOperation = 'source-over';
        for (const s of sparkles) {
            const a = Math.max(0, s.life / s.max);
            ctx.globalAlpha = a;
            ctx.fillStyle = s.color;
            drawBurstShape(s, s.size * (0.6 + 0.4 * a));
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    /**
     * A still picture onto another canvas, for the menu tiles and the
     * settings preview. `screen` draws a small copy of the whole screen, with
     * the Size and Where It Appears settings; otherwise the shape sits in the
     * middle at `fill` of the shorter side.
     */
    function paintStill(target, w, h, opts) {
        opts = opts || {};
        const saved = ctx;
        ctx = target;
        try {
            ctx.fillStyle = S().option('background').hex;
            ctx.fillRect(0, 0, w, h);
            let x = w / 2, y = h / 2, R = Math.min(w, h) * (opts.fill || 0.3);
            if (opts.screen) ({ x, y, R } = geometryFor(w, h));
            const color = opts.color || (S().get('color') === 'turns' ? ball.color : S().option('color').hex);
            ctx.save();
            ctx.translate(x, y);
            drawFigure(opts.shape || S().get('shape'), color, R * (1 + Math.sin(time * 2.4) * C.pulseAmount), time, 1, 1, 1, 1);
            ctx.restore();
        } finally {
            ctx = saved;
        }
    }

    // --- the loop ----------------------------------------------------------------

    let lastFrame = performance.now();
    function frame(now) {
        const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
        lastFrame = now; time += dt;

        ball.t += dt;
        if (ball.state === 'in' && ball.t >= timing().grow) {
            if (isWaitMode()) { ball.state = 'waiting'; ball.t = 0; }
            else ball.state = 'ready';
        }
        if (ball.state === 'waiting' && ball.t >= S().option('waitTime').seconds) becomeReady();
        if (ball.state === 'squash' && ball.t >= C.squashTime) finishPop();
        if (ball.state === 'gone' && ball.t >= timing().delay) bringBack();

        const brightTarget = (isWaitMode() && (ball.state === 'in' || ball.state === 'waiting')) ? C.waitingBrightness : 1;
        ball.bright += (brightTarget - ball.bright) * (1 - Math.pow(0.00001, dt));
        ball.readyGlow = Math.max(0, ball.readyGlow - dt * 1.6);
        ball.swell += (ball.swellTarget - ball.swell) * (1 - Math.pow(0.0005, dt));
        ball.wobble = Math.max(0, ball.wobble - dt * 3);

        for (const s of sparkles) {
            const drag = Math.pow(0.15, dt);
            s.vx *= drag; s.vy *= drag;
            s.x += s.vx * dt; s.y += s.vy * dt;
            s.rot += s.spin * dt; s.life -= dt;
        }
        sparkles = sparkles.filter(s => s.life > 0);
        for (const ring of rings) ring.life -= dt;
        rings = rings.filter(r => r.life > 0);

        ctx.fillStyle = S().option('background').hex;
        ctx.fillRect(0, 0, W, H);
        drawMain();
        drawEffects();

        if (NGP.UI && NGP.UI.frame) NGP.UI.frame();
        requestAnimationFrame(frame);
    }

    /** A fresh start: it grows in where it belongs, with no leftover sparkles. */
    function reset() {
        sparkles = []; rings = [];
        ball.build = 0; ball.swell = 0; ball.swellTarget = 0; ball.wobble = 0; ball.readyGlow = 0;
        bringBack();
    }

    /** What else needs to happen when a setting changes. */
    function settingChanged(key) {
        if (key === 'color') ball.color = S().get('color') === 'turns' ? nextColor() : S().option('color').hex;
        if (key === 'tapStyle') {
            ball.build = 0; ball.swellTarget = 0;
            if (ball.state === 'waiting') ball.state = 'ready';
            ball.bright = 1;
        }
    }

    function init(el) {
        canvas = el;
        ctx = canvas.getContext('2d');
        ball.color = S().get('color') === 'turns' ? nextColor() : S().option('color').hex;
        ball.state = 'ready';
        ball.bright = 1;
        resize();
        window.addEventListener('resize', resize);
        requestAnimationFrame(frame);
    }

    return {
        init: init,
        press: press,
        reset: reset,
        settingChanged: settingChanged,
        paintStill: paintStill,
        /** Sounds only while live, so nothing chimes over a menu. */
        setLive: function (on) { live = !!on; },
        geometry: ballGeometry,
        turnColors: turnColors,
        stats: function () {
            return Object.assign({ state: ball.state, build: ball.build, sparkles: sparkles.length,
                burstShapes: [...new Set(sparkles.map(s => s.shape))], color: ball.color }, counts);
        }
    };
})();
