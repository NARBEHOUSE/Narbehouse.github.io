/**
 * NARBE Space Explorer - aliens who call you up.
 *
 * Some planets have a civilisation. Now and then one of its people hails the
 * ship: a cartoon face pops up on a little video screen and talks gibberish in
 * their own language (browser speech with an altered pitch and rate, plus a
 * synthesised babble sound so it still works with speech off), with a
 * translation underneath. Moods: friendly, curious, grumpy or loud. Funny,
 * never scary: big round eyes, soft shapes, no teeth or angry red glare.
 *
 * Each civilisation's look comes from its seed through NSE.Creatures.peopleLook,
 * the same look the scanner's 3D model of the people uses: head shape, skin and
 * markings, eyes, ears, antennae, the top of the head, their clothes and collar,
 * headgear (a headset, a bubble helmet, a headband, a cap), and where they call
 * from (a room with a round window, a ship's bridge, a garden, out among the
 * stars). Each mood has its own face: a happy squint and bounce, a tilted head
 * and one raised brow, half-closed unimpressed eyes, or wide eyes and sound
 * waves when they shout.
 */

window.NSE = window.NSE || {};

NSE.Aliens = (function () {
    'use strict';

    const U = NSE.Util;

    const SOUNDS = ['zib', 'glor', 'mee', 'vok', 'tuu', 'pla', 'nix', 'oo', 'qua', 'bru', 'zee', 'lop', 'fwa', 'gub', 'yip', 'skro',
        'mup', 'wee', 'dor', 'kli', 'bap', 'zoo', 'nee', 'gra', 'blu', 'ip', 'og', 'fli', 'tok', 'wum', 'ree', 'pix', 'ga', 'lu', 'boo'];

    const LINES = {
        friendly: [
            'They say: Welcome, space friend!',
            'They say: Nice ship! Is it new?',
            'They say: Hello! We love visitors. Come back any time, and bring snacks.',
            'They say: Greetings from all of us! Even Grandma waved.',
            'They say: You look lovely today. Very shiny.',
            'They say: Welcome! Mind the moons, they bounce.'
        ],
        curious: [
            'They ask: Do you have a nose? What is it for?',
            'They ask: What is Earth like? Is it bouncy?',
            'They ask: Is that your real face, or a helmet?',
            'They want to know what a sandwich is.',
            'They ask: How many legs do you have? Only two? Wow.',
            'They ask: Do you like music? We sing with our ears.'
        ],
        grumpy: [
            'They grumble: You are parking in our sky.',
            'They grumble: Too bright! Turn your lights down.',
            'They grumble: It is nap time. Fly quieter, please.',
            'They grumble: Hmph. Another tourist.',
            'They grumble: Wipe your rockets before you come in.'
        ],
        loud: [
            'They yell: GO AWAY!',
            'They yell: THIS IS OUR PLANET! Nice ship, though.',
            'They yell: HELLO! SORRY! WE ONLY HAVE ONE VOLUME!',
            'They yell: NO VISITORS TODAY! Maybe tomorrow.',
            'They yell: WHO ARE YOU?! WE LIKE YOUR HAT!'
        ]
    };

    const REPLIES = {
        friendly: ['They wave back with all of their arms!', 'They wave back and do a little happy dance.', 'They wave back and send you a picture of their pet.'],
        curious: ['They wave back, then try to copy your wave.', 'They wave back and ask if waving is a kind of dance.', 'They wave back very slowly, studying how you do it.'],
        grumpy: ['They sigh, and wave back a tiny bit.', 'They wave back, but only with one finger. Well, one tentacle.', 'They almost smile. Almost.'],
        loud: ['They yell: FINE! HELLO! GOODBYE!', 'They yell: WE ARE WAVING BACK! CAN YOU SEE IT?!', 'They yell: OKAY! YOU CAN STAY! BUT BE QUIET!']
    };

    /** How each mood sounds through the speech engine. */
    const VOICE = {
        friendly: { pitch: 1.7, rate: 1.15 },
        curious: { pitch: 1.4, rate: 0.95 },
        grumpy: { pitch: 0.35, rate: 0.8 },
        loud: { pitch: 1.05, rate: 1.35 }
    };

    /** If creatures.js is missing, a simpler look from the seed (the call still works). */
    function fallbackLook(seed) {
        const r = U.rng(U.hash('people-look', seed));
        const hue = 75 + r.range(0, 260);       // never a human skin tone (as in NSE.Creatures.peopleLook)
        return {
            seed: seed, skin: U.toHex(U.hsl(hue, 0.55, 0.56)), dark: U.toHex(U.hsl(hue, 0.6, 0.36)), belly: U.toHex(U.hsl(hue, 0.3, 0.78)),
            accent: U.toHex(U.hsl(hue + 45, 0.75, 0.55)), spots: U.toHex(U.hsl(hue + 10, 0.6, 0.42)), iris: U.toHex(U.hsl(r.range(0, 360), 0.8, 0.5)),
            outfit: U.toHex(U.hsl(hue + 180, 0.6, 0.4)), trim: U.toHex(U.hsl(45, 0.85, 0.6)), eyes: r.weighted([[2, 8], [1, 1.4], [3, 1.6], [4, 0.8]]),
            eyeShape: 'round', ears: r.pick(['none', 'pointy', 'round', 'fins', 'long']), antennae: r.int(0, 2), antKind: 'bobble',
            head: r.pick(['round', 'tall', 'wide', 'pear', 'dome']), headTop: 'none', headgear: 'none', collar: 'round', nose: 'dots',
            pattern: 'plain', cheeks: true, arms: 2, bg: r.pick(['window', 'bridge', 'garden', 'stars']), bgHue: hue + 180
        };
    }

    function make(world) {
        const civ = world.civ;
        const r = U.rng(U.hash('alien', civ.seed));
        const lang = [];
        for (let i = 0; i < 9; i++) lang.push(r.pick(SOUNDS));
        let look = null;
        try { if (NSE.Creatures && NSE.Creatures.peopleLook) look = NSE.Creatures.peopleLook(civ.seed, world.type); } catch (e) { look = null; }
        if (!look) look = fallbackLook(civ.seed);
        const voice = VOICE[civ.mood];
        let lineN = 0;
        const blinkOff = r.range(0, 3);
        let bgCache = null;

        function words() {
            const n = r.int(3, 6);
            const out = [];
            for (let i = 0; i < n; i++) {
                let w = '';
                for (let tries = 0; tries < 8; tries++) {
                    w = '';
                    const k = r.int(1, 3);
                    for (let j = 0; j < k; j++) w += r.pick(lang);
                    // Never a rude word by accident (the same filter as the place names).
                    if (!(NSE.Universe && NSE.Universe.rude(w))) break;
                    w = r.pick(lang);
                }
                if (NSE.Universe && NSE.Universe.rude(w)) w = 'zib';
                out.push(w);
            }
            let s = out.join(' ');
            s = s.charAt(0).toUpperCase() + s.slice(1);
            if (civ.mood === 'loud') return s.toUpperCase() + '!!';
            if (civ.mood === 'curious') return s + '?';
            if (civ.mood === 'grumpy') return 'Hmph. ' + s + '.';
            return s + '!';
        }

        function line(list) {
            const l = list[(U.hash(civ.seed, lineN++) >>> 0) % list.length];
            return l;
        }

        return {
            people: civ.people,
            mood: civ.mood,
            face: look,
            look: look,
            voice: voice,
            greeting: function () { return { alien: words(), translation: line(LINES[civ.mood]) }; },
            reply: function () { return { alien: words(), translation: line(REPLIES[civ.mood]) }; },
            draw: function (ctx, W, H, t, talk) {
                // The room behind them is drawn once into a picture and reused every frame.
                if (!bgCache || bgCache.w !== W || bgCache.h !== H) bgCache = backdrop(ctx, W, H, look);
                drawFace(ctx, W, H, look, civ.mood, t, talk, blinkOff, bgCache);
            }
        };
    }

    // --- colour helpers ----------------------------------------------------------------------------

    function shade(hex, k) {
        const c = U.hex(hex);
        return k >= 0 ? U.toHex([c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k]) : U.toHex([c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)]);
    }
    function rgba(hex, a) {
        const c = U.hex(hex);
        return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a + ')';
    }
    function hsl(h, s, l) { return U.toHex(U.hsl(h, s, l)); }

    // --- where they call from (drawn once) ----------------------------------------------------------

    function backdrop(ctx, W, H, f) {
        let cv = null;
        try { cv = (ctx.canvas && ctx.canvas.ownerDocument ? ctx.canvas.ownerDocument : document).createElement('canvas'); } catch (e) { cv = null; }
        if (!cv || !cv.getContext) return { w: W, h: H, img: null };
        cv.width = W; cv.height = H;
        const c = cv.getContext('2d');
        if (!c) return { w: W, h: H, img: null };
        const r = U.rng(U.hash('alien-room', f.seed || 1));
        c.save();
        c.scale(W / 320, H / 320);
        const h0 = f.bgHue || 220;
        const wall = c.createLinearGradient(0, 0, 0, 320);
        if (f.bg === 'garden') {
            wall.addColorStop(0, hsl(h0, 0.55, 0.62)); wall.addColorStop(0.7, hsl(h0 + 20, 0.5, 0.45)); wall.addColorStop(1, hsl(h0 + 40, 0.4, 0.3));
        } else if (f.bg === 'stars') {
            wall.addColorStop(0, '#060818'); wall.addColorStop(1, hsl(h0, 0.5, 0.12));
        } else {
            wall.addColorStop(0, hsl(h0, 0.32, 0.28)); wall.addColorStop(1, hsl(h0, 0.38, 0.14));
        }
        c.fillStyle = wall; c.fillRect(0, 0, 320, 320);

        if (f.bg === 'window') {
            // A round window onto their sky, with a planet hanging in it.
            const wx = r.range(70, 250), wy = r.range(70, 100), wr = 62;
            c.fillStyle = hsl(h0, 0.2, 0.42); c.beginPath(); c.arc(wx, wy, wr + 10, 0, Math.PI * 2); c.fill();
            const sky = c.createLinearGradient(0, wy - wr, 0, wy + wr);
            const sh = r.range(0, 360);
            sky.addColorStop(0, hsl(sh, 0.6, 0.35)); sky.addColorStop(1, hsl(sh + 40, 0.7, 0.62));
            c.save(); c.beginPath(); c.arc(wx, wy, wr, 0, Math.PI * 2); c.clip();
            c.fillStyle = sky; c.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
            const px = wx + r.range(-25, 25), py = wy + r.range(-20, 10), pr = r.range(16, 28);
            const pg = c.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 2, px, py, pr);
            const ph = r.range(0, 360);
            pg.addColorStop(0, hsl(ph, 0.6, 0.75)); pg.addColorStop(1, hsl(ph, 0.6, 0.4));
            c.fillStyle = pg; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
            if (r.chance(0.5)) { c.strokeStyle = rgba('#ffffff', 0.5); c.lineWidth = 3; c.beginPath(); c.ellipse(px, py, pr * 1.7, pr * 0.4, -0.3, 0, Math.PI * 2); c.stroke(); }
            c.fillStyle = 'rgba(255,255,255,0.9)';
            for (let i = 0; i < 10; i++) { c.beginPath(); c.arc(wx + r.range(-wr, wr), wy + r.range(-wr, wr * 0.4), r.range(0.6, 1.6), 0, Math.PI * 2); c.fill(); }
            c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(wx - wr * 0.35, wy - wr * 0.4, wr * 0.35, wr * 0.18, -0.6, 0, Math.PI * 2); c.fill();
            c.restore();
            c.strokeStyle = hsl(h0, 0.15, 0.6); c.lineWidth = 5; c.beginPath(); c.arc(wx, wy, wr + 3, 0, Math.PI * 2); c.stroke();
            // A shelf with a little pot plant on the other side.
            const sx = wx < 160 ? 230 : 40;
            c.fillStyle = hsl(h0, 0.2, 0.2); c.fillRect(sx - 30, 150, 70, 8);
            c.fillStyle = hsl(r.range(0, 360), 0.5, 0.5); c.fillRect(sx - 8, 128, 22, 22);
            c.fillStyle = hsl(r.range(90, 150), 0.55, 0.45);
            for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(sx + 3 + (k - 1.5) * 8, 116, 6, 16, (k - 1.5) * 0.4, 0, Math.PI * 2); c.fill(); }
        } else if (f.bg === 'bridge') {
            // A ship's bridge: a starry viewscreen and a row of console lights.
            c.fillStyle = '#05081a'; roundRect(c, 24, 22, 272, 130, 22); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.85)';
            for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(r.range(30, 290), r.range(28, 146), r.range(0.5, 1.7), 0, Math.PI * 2); c.fill(); }
            const ng = c.createRadialGradient(220, 70, 4, 220, 70, 70);
            ng.addColorStop(0, rgba(hsl(r.range(0, 360), 0.7, 0.6), 0.45)); ng.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = ng; c.fillRect(24, 22, 272, 130);
            c.strokeStyle = hsl(h0, 0.25, 0.5); c.lineWidth = 5; roundRect(c, 24, 22, 272, 130, 22); c.stroke();
            c.fillStyle = hsl(h0, 0.25, 0.22); roundRect(c, 0, 250, 320, 80, 10); c.fill();
            for (let i = 0; i < 9; i++) { c.fillStyle = hsl(r.pick([120, 45, 200, 0, 280]), 0.8, 0.6); roundRect(c, 14 + i * 34, 262, 18, 8, 4); c.fill(); }
        } else if (f.bg === 'garden') {
            // Soft rounded alien plants.
            for (let k = 0; k < 7; k++) {
                const x = r.range(0, 320), hgt = r.range(70, 170), hue = h0 + r.range(80, 160);
                c.strokeStyle = hsl(hue, 0.4, 0.28); c.lineWidth = 6;
                c.beginPath(); c.moveTo(x, 320); c.quadraticCurveTo(x + r.range(-30, 30), 320 - hgt * 0.6, x + r.range(-20, 20), 320 - hgt); c.stroke();
                c.fillStyle = hsl(hue, 0.5, 0.42);
                c.beginPath(); c.arc(x + r.range(-20, 20), 320 - hgt, r.range(14, 30), 0, Math.PI * 2); c.fill();
                c.fillStyle = hsl(hue + 40, 0.7, 0.7);
                c.beginPath(); c.arc(x + r.range(-10, 10), 320 - hgt - 4, r.range(4, 8), 0, Math.PI * 2); c.fill();
            }
            c.fillStyle = rgba('#ffffff', 0.7); c.beginPath(); c.arc(r.range(40, 280), 40, 18, 0, Math.PI * 2); c.fill();
        } else {
            c.fillStyle = 'rgba(255,255,255,0.9)';
            for (let i = 0; i < 70; i++) { c.beginPath(); c.arc(r.range(0, 320), r.range(0, 320), r.range(0.4, 1.6), 0, Math.PI * 2); c.fill(); }
            const ng = c.createRadialGradient(r.range(60, 260), r.range(40, 140), 5, 160, 100, 200);
            ng.addColorStop(0, rgba(hsl(h0 + 60, 0.7, 0.55), 0.4)); ng.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = ng; c.fillRect(0, 0, 320, 320);
        }
        // A soft light behind their head, then the screen's vignette.
        const glow = c.createRadialGradient(160, 150, 10, 160, 150, 170);
        glow.addColorStop(0, 'rgba(255,255,255,0.18)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = glow; c.fillRect(0, 0, 320, 320);
        c.restore();
        return { w: W, h: H, img: cv };
    }

    function roundRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
    }

    // --- the face (2D canvas) ----------------------------------------------------------------------

    const HEADS = { round: [88, 90], tall: [74, 104], wide: [108, 80], pear: [86, 94], bean: [80, 98], dome: [86, 100], heart: [94, 90] };

    function headPath(ctx, shape, hw, hh) {
        ctx.beginPath();
        if (shape === 'pear') {
            ctx.moveTo(0, -hh);
            ctx.bezierCurveTo(hw * 0.75, -hh, hw * 0.72, -hh * 0.2, hw, hh * 0.38);
            ctx.bezierCurveTo(hw * 1.02, hh * 1.02, -hw * 1.02, hh * 1.02, -hw, hh * 0.38);
            ctx.bezierCurveTo(-hw * 0.72, -hh * 0.2, -hw * 0.75, -hh, 0, -hh);
        } else if (shape === 'dome') {
            ctx.moveTo(0, -hh);
            ctx.bezierCurveTo(hw * 1.15, -hh, hw * 1.12, hh * 0.2, hw * 0.72, hh * 0.62);
            ctx.bezierCurveTo(hw * 0.42, hh * 1.02, -hw * 0.42, hh * 1.02, -hw * 0.72, hh * 0.62);
            ctx.bezierCurveTo(-hw * 1.12, hh * 0.2, -hw * 1.15, -hh, 0, -hh);
        } else if (shape === 'heart') {
            ctx.moveTo(0, -hh * 0.72);
            ctx.bezierCurveTo(hw * 0.3, -hh * 1.08, hw * 1.08, -hh * 1.0, hw, -hh * 0.15);
            ctx.bezierCurveTo(hw * 0.95, hh * 0.55, hw * 0.4, hh, 0, hh);
            ctx.bezierCurveTo(-hw * 0.4, hh, -hw * 0.95, hh * 0.55, -hw, -hh * 0.15);
            ctx.bezierCurveTo(-hw * 1.08, -hh * 1.0, -hw * 0.3, -hh * 1.08, 0, -hh * 0.72);
        } else if (shape === 'bean') {
            ctx.moveTo(0, -hh);
            ctx.bezierCurveTo(hw * 1.1, -hh, hw * 0.92, hh * 0.1, hw * 0.95, hh * 0.4);
            ctx.bezierCurveTo(hw * 0.98, hh * 1.05, -hw * 1.08, hh * 1.05, -hw * 1.05, hh * 0.3);
            ctx.bezierCurveTo(-hw * 1.02, -hh * 0.3, -hw * 0.8, -hh, 0, -hh);
        } else {
            ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        }
        ctx.closePath();
    }

    function drawFace(ctx, W, H, f, mood, t, talk, blinkOff, bg) {
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        if (bg && bg.img) ctx.drawImage(bg.img, 0, 0, W, H);
        else { ctx.fillStyle = '#1a2348'; ctx.fillRect(0, 0, W, H); }
        ctx.scale(W / 320, H / 320);
        const lw = 4;                    // outline width (soft, dark, never black)
        const ink = 'rgba(25, 18, 40, 0.55)';
        const dims = HEADS[f.head] || HEADS.round;
        const hw = dims[0], hh = dims[1];
        const HS = 0.84, HY = 162;       // the head's scale and height on the screen (room for antennae and crests)

        // How they move: friendly bounce, curious tilt, grumpy slow sway, loud shake while shouting.
        const breathe = Math.sin(t * 2) * 2;
        let bx = 0, by = breathe, rot = 0;
        if (mood === 'friendly') by += Math.abs(Math.sin(t * 3.2)) * -5;
        else if (mood === 'curious') rot = 0.09 + Math.sin(t * 1.1) * 0.06;
        else if (mood === 'grumpy') rot = Math.sin(t * 0.6) * 0.025;
        else if (mood === 'loud' && talk) { bx = Math.sin(t * 31) * 2.5; by += Math.sin(t * 23) * 1.5; }

        // Shoulders and clothes.
        ctx.save();
        ctx.translate(160 + bx * 0.4, 0);
        const shoulderY = 262 + by * 0.4;
        const cloth = ctx.createLinearGradient(0, shoulderY - 30, 0, 330);
        cloth.addColorStop(0, shade(f.outfit, 0.12)); cloth.addColorStop(1, shade(f.outfit, -0.35));
        ctx.fillStyle = cloth;
        ctx.beginPath();
        ctx.moveTo(-150, 330); ctx.bezierCurveTo(-150, shoulderY - 10, -90, shoulderY - 28, -40, shoulderY - 30);
        ctx.lineTo(40, shoulderY - 30); ctx.bezierCurveTo(90, shoulderY - 28, 150, shoulderY - 10, 150, 330); ctx.closePath();
        ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
        // Neck.
        ctx.fillStyle = shade(f.skin, -0.18);
        ctx.beginPath(); ctx.ellipse(0, shoulderY - 36, 30, 26, 0, 0, Math.PI * 2); ctx.fill();
        // Collar.
        ctx.fillStyle = f.trim; ctx.strokeStyle = ink; ctx.lineWidth = 3;
        ctx.beginPath();
        if (f.collar === 'high') { ctx.ellipse(0, shoulderY - 26, 42, 16, 0, 0, Math.PI * 2); }
        else if (f.collar === 'v') { ctx.moveTo(-42, shoulderY - 30); ctx.lineTo(0, shoulderY + 12); ctx.lineTo(42, shoulderY - 30); ctx.lineTo(30, shoulderY - 32); ctx.lineTo(0, shoulderY - 4); ctx.lineTo(-30, shoulderY - 32); ctx.closePath(); }
        else if (f.collar === 'ruff') { for (let k = -3; k <= 3; k++) { ctx.moveTo(k * 15 + 12, shoulderY - 26); ctx.arc(k * 15, shoulderY - 26, 12, 0, Math.PI * 2); } }
        else { ctx.ellipse(0, shoulderY - 28, 40, 10, 0, 0, Math.PI); }
        ctx.fill(); ctx.stroke();
        // A badge that glows.
        const bp = 0.6 + 0.4 * Math.sin(t * 2.4);
        ctx.fillStyle = rgba(f.accent, 0.35 * bp); ctx.beginPath(); ctx.arc(-70, shoulderY + 24, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(f.accent, 0.25); ctx.beginPath(); ctx.arc(-70, shoulderY + 24, 7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // The head and everything on it.
        ctx.save();
        ctx.translate(160 + bx, HY + by);
        ctx.rotate(rot);
        ctx.scale(HS, HS);

        // Antennae (behind the head).
        const nA = f.antennae || 0;
        for (let i = 0; i < nA; i++) {
            const sd = nA === 1 ? 0 : (i ? 1 : -1);
            const wob = Math.sin(t * 3 + i * 2) * 0.12 + (mood === 'loud' && talk ? Math.sin(t * 20 + i) * 0.1 : 0);
            const a = sd * 0.42 + wob;
            const x0 = sd * hw * 0.38, y0 = -hh * 0.82;
            const x1 = x0 + Math.sin(a) * 70, y1 = y0 - Math.cos(a) * 62;
            ctx.strokeStyle = shade(f.skin, -0.25); ctx.lineWidth = 7; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x0, y0);
            if (f.antKind === 'curl') ctx.bezierCurveTo(x0 + sd * 10, y0 - 50, x1 + sd * 40, y1 - 10, x1 + sd * 14, y1 + 8);
            else ctx.quadraticCurveTo(x0 + sd * 8, y0 - 40, x1, y1);
            ctx.stroke();
            if (f.antKind === 'feather') {
                ctx.fillStyle = f.accent; ctx.beginPath(); ctx.ellipse(x1, y1, 9, 22, a, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = rgba('#000000', 0.2); ctx.lineWidth = 2;
                for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x1, y1 + k * 6); ctx.lineTo(x1 + 8, y1 + k * 6 - 4); ctx.moveTo(x1, y1 + k * 6); ctx.lineTo(x1 - 8, y1 + k * 6 - 4); ctx.stroke(); }
            } else {
                const bx1 = f.antKind === 'curl' ? x1 + sd * 14 : x1, by1 = f.antKind === 'curl' ? y1 + 8 : y1;
                const g = ctx.createRadialGradient(bx1 - 3, by1 - 3, 1, bx1, by1, 12);
                g.addColorStop(0, shade(f.accent, 0.5)); g.addColorStop(1, f.accent);
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx1, by1, 11, 0, Math.PI * 2); ctx.fill();
                ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
            }
        }

        // Ears (behind the head).
        if (f.ears && f.ears !== 'none') {
            [-1, 1].forEach(function (s) {
                ctx.save();
                ctx.translate(s * hw * 0.92, -hh * 0.08);
                const wig = Math.sin(t * 2 + s) * 0.05 + (mood === 'loud' && talk ? Math.sin(t * 25) * 0.06 : 0);
                ctx.rotate(s * wig);
                ctx.fillStyle = f.skin; ctx.strokeStyle = ink; ctx.lineWidth = lw;
                ctx.beginPath();
                if (f.ears === 'pointy') { ctx.moveTo(-s * 6, -24); ctx.quadraticCurveTo(s * 40, -50, s * 58, -64); ctx.quadraticCurveTo(s * 40, 6, -s * 4, 22); ctx.closePath(); }
                else if (f.ears === 'round') ctx.arc(s * 14, -6, 28, 0, Math.PI * 2);
                else if (f.ears === 'fins') { ctx.moveTo(0, -36); ctx.quadraticCurveTo(s * 46, -30, s * 34, 4); ctx.quadraticCurveTo(s * 40, 24, 0, 34); ctx.closePath(); }
                else { ctx.ellipse(s * 40, 6, 46, 15, s * 0.35, 0, Math.PI * 2); }
                ctx.fill(); ctx.stroke();
                // Inner ear.
                ctx.fillStyle = rgba(mood === 'grumpy' ? shade(f.skin, -0.25) : '#ff9fb8', 0.55);
                ctx.beginPath();
                if (f.ears === 'pointy') { ctx.moveTo(s * 4, -16); ctx.quadraticCurveTo(s * 34, -38, s * 46, -50); ctx.quadraticCurveTo(s * 30, 0, s * 2, 12); ctx.closePath(); }
                else if (f.ears === 'round') ctx.arc(s * 16, -6, 15, 0, Math.PI * 2);
                else if (f.ears === 'fins') { for (let k = 0; k < 3; k++) { ctx.moveTo(s * 4, -20 + k * 18); ctx.lineTo(s * 30, -18 + k * 14); } ctx.strokeStyle = rgba('#000000', 0.18); ctx.lineWidth = 3; ctx.stroke(); }
                else ctx.ellipse(s * 42, 6, 32, 7, s * 0.35, 0, Math.PI * 2);
                if (f.ears !== 'fins') ctx.fill();
                ctx.restore();
            });
        }

        // The head: soft light from the top left, a rim light, a gentle outline.
        headPath(ctx, f.head, hw, hh);
        const hg = ctx.createRadialGradient(-hw * 0.35, -hh * 0.45, hw * 0.1, 0, 0, Math.max(hw, hh) * 1.15);
        hg.addColorStop(0, shade(f.skin, 0.28)); hg.addColorStop(0.6, f.skin); hg.addColorStop(1, shade(f.skin, -0.22));
        ctx.fillStyle = hg; ctx.fill();
        ctx.save();
        ctx.clip();
        // Markings, clipped to the head.
        ctx.fillStyle = f.spots;
        const pr = U.rng(U.hash('alien-marks', f.seed || 1));
        if (f.pattern === 'spots') {
            for (let k = 0; k < 7; k++) { const a = pr.range(0, Math.PI * 2), d = pr.range(0.55, 0.95); ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.arc(Math.cos(a) * hw * d, Math.sin(a) * hh * d * 0.9 - hh * 0.1, pr.range(6, 13), 0, Math.PI * 2); ctx.fill(); }
        } else if (f.pattern === 'stripes') {
            ctx.globalAlpha = 0.5;
            for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(k * hw * 0.32, -hh * 0.95, 9, hh * 0.42, k * 0.15, 0, Math.PI * 2); ctx.fill(); }
        } else if (f.pattern === 'mask') {
            ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.ellipse(0, -hh * 0.18, hw * 0.95, hh * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        } else if (f.pattern === 'freckles') {
            ctx.globalAlpha = 0.7;
            for (let k = 0; k < 14; k++) { const s = k % 2 ? 1 : -1; ctx.beginPath(); ctx.arc(s * pr.range(hw * 0.28, hw * 0.62), hh * pr.range(0.08, 0.3), pr.range(2, 3.4), 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        // Rim light on the far side.
        const rim = ctx.createLinearGradient(hw * 0.5, 0, hw * 1.05, 0);
        rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(1, rgba(shade(f.accent, 0.5), 0.35));
        ctx.fillStyle = rim; ctx.fillRect(0, -hh * 1.2, hw * 1.2, hh * 2.4);
        ctx.restore();
        headPath(ctx, f.head, hw, hh);
        ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();

        // The top of the head.
        if (f.headTop === 'crest' || f.headTop === 'ridge') {
            const n = f.headTop === 'crest' ? 3 : 5;
            ctx.fillStyle = f.accent; ctx.strokeStyle = ink; ctx.lineWidth = 3;
            for (let k = 0; k < n; k++) {
                const x = (k - (n - 1) / 2) * (f.headTop === 'crest' ? 18 : 12), big = f.headTop === 'crest' ? 26 - Math.abs(x) * 0.4 : 12;
                ctx.beginPath(); ctx.ellipse(x, -hh - big * 0.35, f.headTop === 'crest' ? 8 : 6, big, x * 0.01, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            }
        } else if (f.headTop === 'tuft') {
            ctx.fillStyle = f.accent; ctx.strokeStyle = ink; ctx.lineWidth = 3;
            for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(k * 11, -hh + 2 - (2 - Math.abs(k)) * 5, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
            ctx.beginPath(); for (let k = -2; k <= 2; k++) ctx.arc(k * 11, -hh + 2 - (2 - Math.abs(k)) * 5, 11, 0, Math.PI * 2); ctx.fill();
        } else if (f.headTop === 'nubs') {
            ctx.fillStyle = '#f0e6d2'; ctx.strokeStyle = ink; ctx.lineWidth = 3;
            [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(s * hw * 0.35 - 9, -hh * 0.9); ctx.quadraticCurveTo(s * hw * 0.38, -hh - 30, s * hw * 0.35 + 9, -hh * 0.88); ctx.closePath(); ctx.fill(); ctx.stroke(); });
        }

        // Eyes.
        const n = f.eyes || 2;
        const blink = ((t + blinkOff) % 3.7) < 0.13;
        const er = n === 1 ? 33 : n === 2 ? 25 : n === 3 ? 20 : 17;
        const lookX = Math.sin(t * 0.55) * 0.18 + (mood === 'curious' ? 0.12 : 0), lookY = Math.sin(t * 0.37) * 0.1;
        const eyes = [];
        const ey0 = -hh * 0.16;
        if (n === 1) eyes.push([0, ey0, 1]);
        else if (n === 2) eyes.push([-hw * 0.4, ey0, 1], [hw * 0.4, ey0, 1]);
        else if (n === 3) eyes.push([-hw * 0.46, ey0 + 4, 1], [hw * 0.46, ey0 + 4, 1], [0, ey0 - 30, 0.85]);
        else eyes.push([-hw * 0.45, ey0 + 6, 1], [hw * 0.45, ey0 + 6, 1], [-hw * 0.2, ey0 - 30, 0.75], [hw * 0.2, ey0 - 30, 0.75]);
        eyes.forEach(function (e, i) {
            const ex = e[0], ey = e[1];
            let rx = er * e[2], ry = er * e[2] * (f.eyeShape === 'oval' ? 1.18 : f.eyeShape === 'almond' ? 0.8 : 1);
            if (mood === 'loud') { rx *= 1.1; ry *= 1.12; }
            if (mood === 'curious' && i === eyes.length - 1 && n > 1) { rx *= 1.12; ry *= 1.15; }
            // Lids: grumpy eyes are half closed; friendly ones squint happily from below.
            let upper = mood === 'grumpy' ? 0.48 : mood === 'friendly' ? 0.08 : 0;
            let lower = mood === 'friendly' ? 0.22 : 0;
            if (blink) { upper = 1; lower = 0; }
            ctx.save();
            ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#fbfbff'; ctx.fill();
            ctx.clip();
            // A little shade at the top of the white.
            ctx.fillStyle = 'rgba(80, 90, 140, 0.18)'; ctx.fillRect(ex - rx, ey - ry, rx * 2, ry * 0.5);
            const ix = ex + lookX * rx * 0.6, iy = ey + lookY * ry * 0.5 + ry * 0.08;
            const ir = Math.min(rx, ry) * 0.62;
            const ig = ctx.createRadialGradient(ix, iy - ir * 0.3, ir * 0.15, ix, iy, ir);
            ig.addColorStop(0, shade(f.iris, 0.35)); ig.addColorStop(1, shade(f.iris, -0.25));
            ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#12101c'; ctx.beginPath(); ctx.arc(ix, iy, ir * (mood === 'loud' ? 0.42 : 0.52), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ix - ir * 0.35, iy - ir * 0.38, ir * 0.28, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(ix + ir * 0.32, iy + ir * 0.3, ir * 0.12, 0, Math.PI * 2); ctx.fill();
            // Lids in skin colour.
            ctx.fillStyle = shade(f.skin, -0.08);
            if (upper > 0) {
                const ly = ey - ry + upper * ry * 2;
                ctx.beginPath(); ctx.moveTo(ex - rx - 2, ey - ry - 2); ctx.lineTo(ex + rx + 2, ey - ry - 2); ctx.lineTo(ex + rx + 2, ly);
                ctx.quadraticCurveTo(ex, ly + (mood === 'grumpy' ? 2 : 6), ex - rx - 2, ly); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex - rx, ly); ctx.quadraticCurveTo(ex, ly + (mood === 'grumpy' ? 2 : 6), ex + rx, ly); ctx.stroke();
            }
            if (lower > 0) {
                const ly = ey + ry - lower * ry * 2;
                ctx.beginPath(); ctx.moveTo(ex - rx - 2, ey + ry + 2); ctx.lineTo(ex + rx + 2, ey + ry + 2); ctx.lineTo(ex + rx + 2, ly);
                ctx.quadraticCurveTo(ex, ly - 8, ex - rx - 2, ly); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
            ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
            ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
            if (f.eyeShape === 'almond' && !blink) {
                ctx.strokeStyle = ink; ctx.lineWidth = 3;
                [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(ex + s * rx * 0.95, ey - ry * 0.1); ctx.lineTo(ex + s * (rx + 7), ey - ry * 0.45); ctx.stroke(); });
            }
            // Brows show the mood (soft, never angry-scary).
            if (i < 2 || n === 1) {
                const side = n === 1 ? 0 : (ex < 0 ? -1 : 1);
                const by0 = ey - ry - 12;
                ctx.strokeStyle = shade(f.skin, -0.5); ctx.lineWidth = 6; ctx.lineCap = 'round';
                ctx.beginPath();
                if (mood === 'grumpy') { ctx.moveTo(ex - rx * 0.8, by0 + 4 + side * 3); ctx.lineTo(ex + rx * 0.8, by0 + 4 - side * 3); }
                else if (mood === 'curious' && (side > 0 || n === 1)) { ctx.moveTo(ex - rx * 0.7, by0 - 8); ctx.quadraticCurveTo(ex, by0 - 22, ex + rx * 0.75, by0 - 10); }
                else if (mood === 'loud') { ctx.moveTo(ex - rx * 0.7, by0 - 10); ctx.quadraticCurveTo(ex, by0 - 24, ex + rx * 0.7, by0 - 10); }
                else { ctx.moveTo(ex - rx * 0.65, by0); ctx.quadraticCurveTo(ex, by0 - 9, ex + rx * 0.65, by0); }
                ctx.stroke();
            }
        });

        // Cheeks and nose.
        if (f.cheeks || mood === 'friendly') {
            ctx.fillStyle = 'rgba(255, 110, 150, 0.32)';
            [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(s * hw * 0.58, hh * 0.24, 17, 10, 0, 0, Math.PI * 2); ctx.fill(); });
        }
        const noseY = hh * 0.18;
        if (f.nose === 'dots') { ctx.fillStyle = shade(f.skin, -0.45); [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(s * 6, noseY, 2.8, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }); }
        else if (f.nose === 'button') { ctx.fillStyle = shade(f.skin, -0.12); ctx.beginPath(); ctx.ellipse(0, noseY, 11, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-3, noseY - 3, 3, 0, Math.PI * 2); ctx.fill(); }
        else if (f.nose === 'snout') {
            ctx.fillStyle = shade(f.skin, 0.12); ctx.strokeStyle = ink; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(0, noseY + 8, 30, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = shade(f.skin, -0.5); [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(s * 9, noseY + 4, 4, 5, 0, 0, Math.PI * 2); ctx.fill(); });
        }

        // Mouth: talks while speaking.
        const mouthY = hh * (f.nose === 'snout' ? 0.58 : 0.5);
        const open = talk ? (0.3 + 0.7 * Math.abs(Math.sin(t * (mood === 'loud' ? 15 : 10.5)) * (0.7 + 0.3 * Math.sin(t * 3.3)))) : 0;
        const mw = mood === 'loud' ? 38 : mood === 'grumpy' ? 24 : 30;
        ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineCap = 'round';
        if (open > 0.05) {
            const oh = 5 + open * (mood === 'loud' ? 30 : 18);
            ctx.fillStyle = '#4a1d34';
            ctx.beginPath();
            if (mood === 'friendly') { ctx.moveTo(-mw, mouthY - 3); ctx.quadraticCurveTo(0, mouthY + oh * 1.6, mw, mouthY - 3); ctx.quadraticCurveTo(0, mouthY + 3, -mw, mouthY - 3); }
            else ctx.ellipse(0, mouthY + oh * 0.3, mw * (0.62 + open * 0.3), oh, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.save(); ctx.clip();
            ctx.fillStyle = '#ff7fa4'; ctx.beginPath(); ctx.ellipse(0, mouthY + oh * 1.0, mw * 0.45, oh * 0.55, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        } else if (mood === 'grumpy') {
            ctx.beginPath(); ctx.moveTo(-mw, mouthY + 4); ctx.bezierCurveTo(-mw * 0.4, mouthY - 4, mw * 0.4, mouthY + 2, mw, mouthY - 2); ctx.stroke();
        } else if (mood === 'curious') {
            ctx.fillStyle = '#4a1d34'; ctx.beginPath(); ctx.ellipse(0, mouthY + 2, 8, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (mood === 'loud') {
            ctx.fillStyle = '#4a1d34'; ctx.beginPath(); ctx.moveTo(-mw, mouthY - 4); ctx.quadraticCurveTo(0, mouthY + 26, mw, mouthY - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(-mw, mouthY - 5); ctx.quadraticCurveTo(0, mouthY + 20, mw, mouthY - 5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-mw - 4, mouthY - 9); ctx.lineTo(-mw + 2, mouthY - 3); ctx.moveTo(mw + 4, mouthY - 9); ctx.lineTo(mw - 2, mouthY - 3); ctx.stroke();
        }

        // Headgear.
        const g = f.headgear;
        if (g === 'headset') {
            ctx.strokeStyle = '#2b3048'; ctx.lineWidth = 8;
            ctx.beginPath(); ctx.ellipse(0, -hh * 0.1, hw * 1.02, hh * 1.0, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
            ctx.fillStyle = '#353b58'; ctx.beginPath(); ctx.ellipse(hw * 0.98, -hh * 0.05, 13, 22, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#353b58'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(hw * 0.95, hh * 0.05); ctx.quadraticCurveTo(hw * 0.85, hh * 0.55, hw * 0.35, hh * 0.55); ctx.stroke();
            const on = Math.sin(t * 5) > 0;
            ctx.fillStyle = on ? shade(f.accent, 0.3) : shade(f.accent, -0.3); ctx.beginPath(); ctx.arc(hw * 0.32, hh * 0.55, 6, 0, Math.PI * 2); ctx.fill();
        } else if (g === 'band') {
            ctx.strokeStyle = f.trim; ctx.lineWidth = 10;
            ctx.save(); headPath(ctx, f.head, hw, hh); ctx.clip();
            ctx.beginPath(); ctx.moveTo(-hw * 1.2, -hh * 0.6); ctx.quadraticCurveTo(0, -hh * 0.76, hw * 1.2, -hh * 0.6); ctx.stroke();
            ctx.restore();
            ctx.fillStyle = shade(f.accent, 0.2 + 0.2 * Math.sin(t * 3)); ctx.beginPath(); ctx.moveTo(0, -hh * 0.82); ctx.lineTo(9, -hh * 0.7); ctx.lineTo(0, -hh * 0.58); ctx.lineTo(-9, -hh * 0.7); ctx.closePath(); ctx.fill();
        } else if (g === 'cap') {
            // The top of the head itself becomes the cap, so it fits every head shape.
            ctx.save(); headPath(ctx, f.head, hw * 1.03, hh * 1.03); ctx.clip();
            const cg = ctx.createLinearGradient(0, -hh, 0, -hh * 0.45);
            cg.addColorStop(0, shade(f.outfit, 0.15)); cg.addColorStop(1, shade(f.outfit, -0.15));
            ctx.fillStyle = cg; ctx.fillRect(-hw * 1.2, -hh * 1.2, hw * 2.4, hh * 0.68);
            ctx.restore();
            ctx.strokeStyle = ink; ctx.lineWidth = 3;
            ctx.fillStyle = f.trim; ctx.beginPath(); ctx.ellipse(hw * 0.22, -hh * 0.52, hw * 0.78, 10, -0.04, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, -hh * 1.0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();

        // A bubble helmet sits over the whole head (drawn unrotated, glassy).
        if (g === 'bubble') {
            const R = Math.max(hw, hh) * 1.22 * HS;
            const cx = 160 + bx, cy = HY + by - 6 * HS;
            const gl = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.5, R * 0.1, cx, cy, R);
            gl.addColorStop(0, 'rgba(220, 245, 255, 0.28)'); gl.addColorStop(0.75, 'rgba(160, 210, 255, 0.08)'); gl.addColorStop(1, 'rgba(200, 235, 255, 0.35)');
            ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(220, 240, 255, 0.7)'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(cx - R * 0.45, cy - R * 0.5, R * 0.22, R * 0.09, -0.7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = f.trim; ctx.strokeStyle = ink; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.92, R * 0.62, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }

        // Mood touches: sound waves when shouting, a question mark, a grumpy puff, happy sparkles.
        ctx.lineCap = 'round';
        if (mood === 'loud' && talk) {
            ctx.strokeStyle = 'rgba(255, 240, 160, 0.85)'; ctx.lineWidth = 5;
            for (let k = 0; k < 3; k++) {
                const ph = ((t * 2.2 + k / 3) % 1);
                ctx.globalAlpha = 1 - ph;
                [-1, 1].forEach(s => { ctx.beginPath(); ctx.arc(160 + s * (hw * HS + 22 + ph * 40), HY, 18 + ph * 22, s > 0 ? -0.7 : Math.PI - 0.7, s > 0 ? 0.7 : Math.PI + 0.7); ctx.stroke(); });
            }
            ctx.globalAlpha = 1;
        } else if (mood === 'curious' && Math.sin(t * 0.8) > 0.3) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = ink; ctx.lineWidth = 3;
            ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center';
            const qx = 160 + hw * HS + 26, qy = 82 + Math.sin(t * 2) * 4;
            ctx.strokeText('?', qx, qy); ctx.fillText('?', qx, qy);
        } else if (mood === 'grumpy' && Math.sin(t * 0.7) > 0.5) {
            ctx.fillStyle = 'rgba(220, 225, 240, 0.75)';
            const px = 160 + hw * HS + 18, py = 100 - ((t * 10) % 20);
            [[0, 0, 14], [14, -6, 11], [-12, -4, 10], [4, -16, 10]].forEach(p => { ctx.beginPath(); ctx.arc(px + p[0], py + p[1], p[2], 0, Math.PI * 2); ctx.fill(); });
        } else if (mood === 'friendly') {
            ctx.fillStyle = 'rgba(255, 245, 190, 0.9)';
            for (let k = 0; k < 3; k++) {
                const a = t * 1.3 + k * 2.1, s = 4 + 3 * Math.sin(t * 4 + k);
                const sx = 160 + Math.cos(a) * (hw * HS + 34), sy = HY - 10 + Math.sin(a) * (hh * HS + 20) * 0.7;
                ctx.beginPath(); ctx.moveTo(sx, sy - s * 2); ctx.lineTo(sx + s * 0.5, sy - s * 0.5); ctx.lineTo(sx + s * 2, sy); ctx.lineTo(sx + s * 0.5, sy + s * 0.5);
                ctx.lineTo(sx, sy + s * 2); ctx.lineTo(sx - s * 0.5, sy + s * 0.5); ctx.lineTo(sx - s * 2, sy); ctx.lineTo(sx - s * 0.5, sy - s * 0.5); ctx.closePath(); ctx.fill();
            }
        }

        // The video screen: faint scanlines and a soft vignette.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        for (let y = ((t * 30) % 4); y < 320; y += 4) ctx.fillRect(0, y, 320, 1.5);
        const vg = ctx.createRadialGradient(160, 160, 120, 160, 160, 230);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,0.45)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, 320, 320);
        ctx.restore();
    }

    return { make: make, LINES: LINES, REPLIES: REPLIES };
})();
