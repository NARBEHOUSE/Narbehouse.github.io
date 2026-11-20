/**
 * NARBE Space Explorer - aliens who call you up.
 *
 * Some planets have a civilisation. Now and then one of its people hails the
 * ship: a cartoon face pops up and talks gibberish in their own language
 * (browser speech with an altered pitch and rate, plus a synthesised babble
 * sound so it still works with speech off), with a translation underneath.
 * Moods: friendly, curious, grumpy or loud. Funny, never scary: big round
 * eyes, soft shapes, no teeth or angry red glare.
 *
 * Each civilisation's face, language and voice come from its seed, so the same
 * people always look and sound the same.
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

    function make(world) {
        const civ = world.civ;
        const r = U.rng(U.hash('alien', civ.seed));
        const lang = [];
        for (let i = 0; i < 9; i++) lang.push(r.pick(SOUNDS));
        const hue = r.range(0, 360);
        const face = {
            skin: U.toHex(U.hsl(hue, r.range(0.45, 0.75), r.range(0.5, 0.66))),
            spots: U.toHex(U.hsl(hue + r.range(30, 90), 0.6, 0.45)),
            shape: r.pick(['round', 'tall', 'wide', 'pear', 'bean']),
            eyes: r.weighted([[1, 2], [2, 6], [3, 3], [4, 1], [5, 1]]),
            iris: U.toHex(U.hsl(r.range(0, 360), 0.7, 0.45)),
            antennae: r.int(0, 3),
            ears: r.pick(['none', 'pointy', 'round', 'fins']),
            spotsOn: r.chance(0.5),
            bg: U.toHex(U.hsl(hue + 180, 0.5, 0.2))
        };
        const voice = VOICE[civ.mood];
        let lineN = 0;

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
            face: face,
            voice: voice,
            greeting: function () { return { alien: words(), translation: line(LINES[civ.mood]) }; },
            reply: function () { return { alien: words(), translation: line(REPLIES[civ.mood]) }; },
            draw: function (ctx, W, H, t, talk) { drawFace(ctx, W, H, face, civ.mood, t, talk); }
        };
    }

    // --- the face (2D canvas) ----------------------------------------------------------------------

    function drawFace(ctx, W, H, f, mood, t, talk) {
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        // A soft screen glow behind them.
        const bg = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.05, W / 2, H / 2, W * 0.7);
        bg.addColorStop(0, '#2a3a66');
        bg.addColorStop(1, f.bg);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2, cy = H * 0.56 + Math.sin(t * 2.2) * H * 0.012;
        const sx = W / 320, sy = H / 320;
        ctx.translate(cx, cy);
        ctx.scale(sx, sy);
        // Lean and bounce a little with mood.
        const bounce = mood === 'friendly' ? Math.sin(t * 5) * 3 : mood === 'loud' && talk ? Math.sin(t * 18) * 2.5 : 0;
        ctx.translate(0, bounce);
        if (mood === 'curious') ctx.rotate(Math.sin(t * 1.3) * 0.08 + 0.06);

        const dims = { round: [92, 96], tall: [74, 112], wide: [112, 84], pear: [90, 100], bean: [82, 104] }[f.shape];
        const hw = dims[0], hh = dims[1];

        // Antennae behind the head.
        ctx.lineWidth = 7;
        ctx.strokeStyle = f.skin;
        ctx.lineCap = 'round';
        for (let i = 0; i < f.antennae; i++) {
            const a = (i - (f.antennae - 1) / 2) * 0.5;
            const wob = Math.sin(t * 3 + i) * 0.12;
            const x1 = Math.sin(a + wob) * 70, y1 = -hh - 40 - Math.cos(a) * 10;
            ctx.beginPath();
            ctx.moveTo(Math.sin(a) * 30, -hh + 20);
            ctx.quadraticCurveTo(Math.sin(a) * 50, -hh - 10, x1, y1);
            ctx.stroke();
            ctx.fillStyle = f.spots;
            ctx.beginPath(); ctx.arc(x1, y1, 11, 0, Math.PI * 2); ctx.fill();
        }
        // Ears.
        ctx.fillStyle = f.skin;
        if (f.ears === 'pointy') {
            [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(s * hw * 0.8, -20); ctx.lineTo(s * (hw + 46), -60); ctx.lineTo(s * hw * 0.9, 20); ctx.closePath(); ctx.fill(); });
        } else if (f.ears === 'round') {
            [-1, 1].forEach(s => { ctx.beginPath(); ctx.arc(s * hw * 0.98, -12, 26, 0, Math.PI * 2); ctx.fill(); });
        } else if (f.ears === 'fins') {
            [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(s * (hw + 8), 0, 18, 46, s * 0.3, 0, Math.PI * 2); ctx.fill(); });
        }
        // Head.
        ctx.beginPath();
        if (f.shape === 'pear') {
            ctx.moveTo(0, -hh);
            ctx.bezierCurveTo(hw * 0.8, -hh, hw * 0.7, -10, hw, hh * 0.45);
            ctx.bezierCurveTo(hw, hh * 1.05, -hw, hh * 1.05, -hw, hh * 0.45);
            ctx.bezierCurveTo(-hw * 0.7, -10, -hw * 0.8, -hh, 0, -hh);
        } else {
            ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        }
        const hg = ctx.createLinearGradient(0, -hh, 0, hh);
        hg.addColorStop(0, lighten(f.skin, 0.18));
        hg.addColorStop(1, f.skin);
        ctx.fillStyle = hg;
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(20, 20, 40, 0.55)';
        ctx.stroke();
        if (f.spotsOn) {
            ctx.fillStyle = f.spots;
            [[-0.55, -0.55, 9], [0.6, -0.4, 7], [0.45, 0.55, 8], [-0.6, 0.35, 6]].forEach(p => { ctx.beginPath(); ctx.arc(p[0] * hw, p[1] * hh, p[2], 0, Math.PI * 2); ctx.fill(); });
        }
        // Rosy cheeks.
        ctx.fillStyle = 'rgba(255, 120, 150, 0.35)';
        [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(s * hw * 0.55, hh * 0.22, 16, 10, 0, 0, Math.PI * 2); ctx.fill(); });

        // Eyes: big and friendly, blinking now and then.
        const n = f.eyes;
        const blink = (t % 3.7) < 0.14;
        const er = n === 1 ? 34 : n === 2 ? 26 : n === 3 ? 21 : 17;
        for (let i = 0; i < n; i++) {
            const ex = n === 1 ? 0 : (i / (n - 1) - 0.5) * hw * (n > 3 ? 1.45 : 1.1);
            const ey = -hh * 0.22 - (n >= 3 && i === Math.floor(n / 2) ? 18 : 0);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(20, 20, 40, 0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(ex, ey, er, blink ? 3 : er * (mood === 'loud' && talk ? 1.15 : 1), 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            if (!blink) {
                const lx = Math.sin(t * 0.7 + i) * er * 0.18;
                ctx.fillStyle = f.iris;
                ctx.beginPath(); ctx.arc(ex + lx, ey + 2, er * 0.55, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#10121a';
                ctx.beginPath(); ctx.arc(ex + lx, ey + 2, er * 0.3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(ex + lx - er * 0.18, ey - er * 0.15, er * 0.14, 0, Math.PI * 2); ctx.fill();
            }
            // Brows show the mood (soft, never angry-scary).
            ctx.strokeStyle = 'rgba(30, 25, 40, 0.8)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            const by = ey - er - 10;
            if (mood === 'grumpy') { ctx.moveTo(ex - er * 0.8, by - 4 * (ex < 0 ? 1 : -1) * 0); ctx.lineTo(ex + er * 0.8, by + (ex < 0 ? 6 : -6)); }
            else if (mood === 'curious' && i === n - 1) { ctx.moveTo(ex - er * 0.7, by - 6); ctx.quadraticCurveTo(ex, by - 18, ex + er * 0.7, by - 6); }
            else if (mood === 'loud') { ctx.moveTo(ex - er * 0.7, by - 10); ctx.quadraticCurveTo(ex, by - 22, ex + er * 0.7, by - 10); }
            else { ctx.moveTo(ex - er * 0.7, by); ctx.quadraticCurveTo(ex, by - 8, ex + er * 0.7, by); }
            ctx.stroke();
        }

        // Mouth: talks while speaking.
        const open = talk ? (0.35 + 0.65 * Math.abs(Math.sin(t * (mood === 'loud' ? 16 : 11)))) : 0;
        const my = hh * 0.5;
        const mw = mood === 'loud' ? 40 : 30;
        ctx.fillStyle = '#3a1830';
        ctx.strokeStyle = 'rgba(20, 20, 40, 0.75)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        if (open > 0.05) {
            ctx.ellipse(0, my, mw * (0.7 + open * 0.3), 6 + open * (mood === 'loud' ? 26 : 16), 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ff7aa0';
            ctx.beginPath(); ctx.ellipse(0, my + open * 8, mw * 0.4, 4 + open * 5, 0, 0, Math.PI * 2); ctx.fill();
        } else if (mood === 'grumpy') {
            ctx.moveTo(-mw * 0.7, my + 6); ctx.quadraticCurveTo(0, my - 6, mw * 0.7, my + 6); ctx.stroke();
        } else if (mood === 'curious') {
            ctx.arc(0, my, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else {
            ctx.moveTo(-mw, my - 4); ctx.quadraticCurveTo(0, my + 22, mw, my - 4); ctx.stroke();
        }
        ctx.restore();
    }

    function lighten(hex, k) {
        const c = U.hex(hex);
        return U.toHex([c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k]);
    }

    return { make: make, LINES: LINES, REPLIES: REPLIES };
})();
