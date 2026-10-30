/**
 * NARBE Switch Stories - the picture on each page.
 *
 * Until a story has its own picture files, the game draws the page itself:
 * Rocky the puppy (the Story Time prototype's drawing), the ball, the bird,
 * the puddle and the moon, and the effects (splash drops, celebration stars,
 * sleepy Zs). The CVI look keeps the prototype's rules: a black page, a
 * bigger Rocky, and nothing extra on the screen (no ground, no shadow, no
 * twinkling stars).
 *
 * The scene only draws while a story is on screen. Behind the pause menu it
 * keeps the last picture, dimmed, and costs nothing.
 */

window.NSS = window.NSS || {};

NSS.Scene = (function () {
    'use strict';

    const C = NSS.CONFIG;
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function mix(h1, h2, amt) { const a = hexToRgb(h1), b = hexToRgb(h2); return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * amt)).join(',') + ')'; }
    function isDark(h) { const [r, g, b] = hexToRgb(h); return (r * 299 + g * 587 + b * 114) / 1000 < 110; }

    function S() { return NSS.Settings; }

    let canvas = null, ctx = null;
    let W = 0, H = 0;
    let time = 0;

    // --- a story's own pictures -----------------------------------------------------
    //
    // Each picture has a colourful version and a Simple High Contrast (CVI)
    // version. The CVI one shows in that look; if it is missing, the
    // colourful one shows instead. If both are missing, the game draws the
    // page itself (the drawn Rocky).

    const pics = {};   // url -> { img, status: 'pending' | 'ok' | 'failed' }
    let paintingCover = false;
    const contrastBodies = {}, contrastPictures = {};
    const floorTextures = {}, panoramaTextures = {};
    let contrastColor;

    // Every high-contrast sprite needs one continuous edge, in menus and stories.
    // Clean sources use their own alpha; older exports first lose the baked
    // outline before getting one clean ring. Canvas compositing
    // avoids pixel reads, so this also works when opened directly from files.
    function contrastImage(pic, img) {
        const cleanSource = pic.cviOutline === 'alpha';
        const ring = !cleanSource && pic.outline && load(pic.outline, true);
        if (!cleanSource && (!ring || ring.status !== 'ok')) return img;
        const color = S().is('outline', 'off') ? null : (S().option('outline').color || '#ffe630');
        if (contrastColor !== color) {
            Object.keys(contrastPictures).forEach(key => delete contrastPictures[key]);
            contrastColor = color;
        }
        const key = pic.cviImage + '|' + color;
        if (contrastPictures[key]) return contrastPictures[key];
        let body = contrastBodies[pic.cviImage];
        if (!body) {
            body = document.createElement('canvas');
            body.width = img.width; body.height = img.height;
            const b = body.getContext('2d');
            b.drawImage(img, 0, 0);
            if (!cleanSource) {
                b.globalCompositeOperation = 'destination-out';
                // Include the antialiased fringe on either side of the old ring.
                const trim = Math.max(1, img.height / 450);
                b.drawImage(ring.img, 0, 0);
                for (let i = 0; i < 16; i++) {
                    const angle = i * TAU / 16;
                    b.drawImage(ring.img, Math.cos(angle) * trim, Math.sin(angle) * trim);
                }
            }
            const clean = document.createElement('canvas');
            clean.width = body.width; clean.height = body.height;
            const cleanContext = clean.getContext('2d');
            cleanContext.filter = 'url(#nss-cvi-silhouette)';
            cleanContext.drawImage(body, 0, 0);
            body = clean;
            body.src = img.src;
            contrastBodies[pic.cviImage] = body;
        }
        if (!color) return body;
        const result = document.createElement('canvas');
        result.width = img.width; result.height = img.height;
        const r = result.getContext('2d');
        if (color) {
            const radius = img.height * 0.008;
            for (let i = 0; i < 32; i++) {
                const angle = i * TAU / 32;
                r.drawImage(body, Math.cos(angle) * radius, Math.sin(angle) * radius);
            }
            r.globalCompositeOperation = 'source-in';
            r.fillStyle = color; r.fillRect(0, 0, result.width, result.height);
            r.globalCompositeOperation = 'source-over';
        }
        r.drawImage(body, 0, 0);
        result.src = img.src; // Preserve the source identity for scene diagnostics.
        contrastPictures[key] = result;
        return result;
    }

    function load(url, quiet) {
        if (!url) return null;
        let p = pics[url];
        if (!p) {
            p = pics[url] = { img: new Image(), status: 'pending' };
            p.img.onload = function () {
                p.status = 'ok';
                if (NSS.UI && NSS.UI.paintPictures) NSS.UI.paintPictures();
            };
            p.img.onerror = function () {
                p.status = 'failed';
                if (!quiet) console.warn('[NSS] Could not show ' + url + '. Is the file there, and is its name right in story.js?');
                if (NSS.UI && NSS.UI.paintPictures) NSS.UI.paintPictures();
            };
            p.img.src = url;
        }
        return p;
    }

    /** The picture to show right now, or null while it loads (or if it is missing). */
    function imageFor(pic) {
        if (!pic) return null;
        const main = load(pic.image, pic.quiet);
        if (S().cvi() && !pic.background) {
            const cvi = load(pic.cviImage, pic.cviGuessed || pic.quiet);
            if (cvi.status === 'ok') return contrastImage(pic, NSS.BrailleBooks.render(cvi.img));
            if (cvi.status === 'pending') return null;
        }
        return main.status === 'ok' ? NSS.BrailleBooks.render(main.img) : null;
    }

    /** True once a picture (and, in the CVI look, its CVI version) is known to be missing. */
    function missing(pic) {
        if (!pic) return true;
        const main = load(pic.image, pic.quiet);
        if (S().cvi() && !pic.background && load(pic.cviImage, pic.cviGuessed || pic.quiet).status !== 'failed') return false;
        return main.status === 'failed';
    }

    /** Fallback tint when a story has no CVI image. Prepared CVI pictures already
     * carry their clean outline. Compositing also works with direct file access. */
    const tints = {};
    function outlineFor(pic) {
        if (paintingCover || !pic || !pic.outline || !S().cvi()) return null;
        // contrastImage already replaces the old ring, including Outline Off.
        if (load(pic.cviImage, pic.cviGuessed || pic.quiet).status === 'ok') return null;
        const color = S().option('outline').color;
        if (!color) return null;
        const m = load(pic.outline, true);
        if (m.status !== 'ok') return null;
        const key = pic.outline + '|' + color;
        if (!tints[key]) {
            const c = document.createElement('canvas');
            c.width = m.img.naturalWidth; c.height = m.img.naturalHeight;
            const x = c.getContext('2d');
            x.drawImage(m.img, 0, 0);
            x.globalCompositeOperation = 'source-in';
            x.fillStyle = color;
            x.fillRect(0, 0, c.width, c.height);
            tints[key] = c;
        }
        return tints[key];
    }

    /** One of the story's things (ball, bird, ...), with its outline colour. Returns false if it has no picture. */
    function drawObject(story, name, cx, cy, maxW, maxH, rot, flip) {
        const pic = story && story.objects ? story.objects[name] : null;
        const img = imageFor(pic);
        if (!img) return false;
        drawFit(img, cx, cy, maxW, maxH, rot, flip);
        const ring = outlineFor(pic);
        if (ring) drawFit(ring, cx, cy, maxW, maxH, rot, flip);
        return true;
    }

    /** Start loading every picture a story uses, both looks, so pages never wait. */
    function preload(story) {
        if (!story) return;
        const all = [];
        Object.keys(story.poses || {}).forEach(k => all.push(story.poses[k]));
        Object.keys(story.objects || {}).forEach(k => all.push(story.objects[k]));
        Object.keys(story.cast || {}).forEach(id => Object.keys(story.cast[id].poses).forEach(k => all.push(story.cast[id].poses[k])));
        story.pages.forEach(p => {
            if (p.spreadAction) all.push(...p.spreadAction.overlays);
            [p.picture, p.spread, p.spreadAction && p.spreadAction.overlay, p.background, p.afterBackground, p.panorama && p.panorama.picture,
                p.panorama && p.panorama.afterPicture, p.panorama && p.panorama.extensionPicture].forEach(x => { if (x) all.push(x); });
        });
        all.forEach(function (pic) {
            load(pic.image, pic.quiet);
            if (pic.background) return;                 // backgrounds have no Simple High Contrast version
            load(pic.cviImage, pic.cviGuessed || pic.quiet);
            if (pic.outline) load(pic.outline, true);
        });
    }

    /** Draw a picture fitting inside maxW x maxH, centred on (cx, cy), turned and/or mirrored. */
    function drawFit(img, cx, cy, maxW, maxH, rot, flip) {
        const k = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * k, h = img.height * k;
        if (!rot && !flip) { ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); return; }
        ctx.save();
        ctx.translate(cx, cy);
        if (rot) ctx.rotate(rot);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
    }

    // --- where things go ---------------------------------------------------------

    /**
     * s is Rocky's size. pictureH is the part of the screen above the words.
     * `zoom` makes everything bigger, for small pictures like the cover tiles.
     */
    function geometry(w, pictureH, page, cvi, zoom) {
        let s = Math.min(w * 0.24, pictureH * 0.32) * (zoom || 1);
        if (cvi) s *= 1.25;
        s *= S().characterScale();
        const groundY = pictureH * 0.84;
        const hasObject = !!page.object;
        return { s: s, cvi: cvi, pictureH: pictureH, groundY: groundY, x: hasObject ? w * 0.38 : w * 0.5, y: groundY - s * 0.45, objX: w * 0.72 };
    }

    // --- drawing helpers ---------------------------------------------------------

    const OUTLINE = '#3a2410';
    function ellipse(x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
    function fillStroke(fill, lw) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); }

    /** Rocky the puppy, seen from the side, facing right. (x, y) is the middle of the body. */
    function drawRocky(x, y, s, o) {
        const BODY = '#f4a64a', EAR = '#9a5a22', SNOUT = '#ffe2bd';
        const lw = Math.max(2, s * 0.035);
        const lie = o.lie || 0;
        const by = lie * s * 0.28;
        ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        // tail
        ctx.save(); ctx.translate(-s * 0.5, -s * 0.1 + by); ctx.rotate(-0.9 + (o.tail || 0));
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = s * 0.13; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.34); ctx.stroke();
        ctx.strokeStyle = BODY; ctx.lineWidth = s * 0.13 - lw * 2; ctx.stroke();
        ctx.restore();

        // four legs
        const legLen = s * 0.32 * (1 - lie);
        for (const lx of [-0.36, -0.16, 0.18, 0.37]) {
            roundRect(lx * s - s * 0.07, s * 0.1 + by, s * 0.14, legLen + s * 0.08, s * 0.06);
            fillStroke(BODY, lw);
        }
        // body
        ellipse(0, by, s * 0.56, s * 0.3); fillStroke(BODY, lw);
        ellipse(-s * 0.05, by + s * 0.1, s * 0.3, s * 0.12); ctx.fillStyle = SNOUT; ctx.fill();
        // collar
        ctx.strokeStyle = '#e63946'; ctx.lineWidth = s * 0.07;
        ctx.beginPath(); ctx.moveTo(s * 0.3, by - s * 0.24); ctx.lineTo(s * 0.42, by - s * 0.02); ctx.stroke();

        // head
        ctx.save();
        ctx.translate(s * 0.5, -s * 0.36 + by * 0.9);
        ctx.rotate(o.tilt || 0);
        ellipse(0, 0, s * 0.3, s * 0.3); fillStroke(BODY, lw);
        ellipse(s * 0.24, s * 0.08, s * 0.17, s * 0.13); fillStroke(SNOUT, lw);
        ellipse(s * 0.38, s * 0.02, s * 0.06, s * 0.05); ctx.fillStyle = OUTLINE; ctx.fill();
        ellipse(-s * 0.12, -s * 0.02, s * 0.11, s * 0.24, 0.35); fillStroke(EAR, lw);
        if (o.closed) {
            ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 1.2;
            ctx.beginPath(); ctx.arc(s * 0.08, -s * 0.08, s * 0.05, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
        } else {
            ellipse(s * 0.08, -s * 0.08, s * 0.055, s * 0.055); ctx.fillStyle = OUTLINE; ctx.fill();
            ellipse(s * 0.095, -s * 0.1, s * 0.02, s * 0.02); ctx.fillStyle = '#fff'; ctx.fill();
        }
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(s * 0.22, s * 0.13, s * 0.08, 0.15 * Math.PI, 0.75 * Math.PI); ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    function drawBall(x, y, r) {
        ellipse(x, y, r, r); fillStroke('#ef233c', Math.max(2, r * 0.1));
        ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.16;
        ctx.beginPath(); ctx.arc(x - r * 0.2, y + r * 0.1, r * 0.7, -1.2, 0.6); ctx.stroke();
    }
    function drawBird(x, y, r, flap) {
        const lw = Math.max(2, r * 0.1);
        ellipse(x, y, r, r * 0.85); fillStroke('#2f8bff', lw);
        ctx.beginPath(); ctx.moveTo(x + r * 0.9, y - r * 0.1); ctx.lineTo(x + r * 1.45, y + r * 0.05); ctx.lineTo(x + r * 0.9, y + r * 0.25); ctx.closePath();
        fillStroke('#ffb703', lw);
        ellipse(x + r * 0.35, y - r * 0.25, r * 0.13, r * 0.13); ctx.fillStyle = OUTLINE; ctx.fill();
        ctx.save(); ctx.translate(x - r * 0.15, y - r * 0.05); ctx.rotate(flap);
        ellipse(-r * 0.25, -r * 0.35, r * 0.55, r * 0.28, -0.4); fillStroke('#7ec8ff', lw);
        ctx.restore();
    }
    function drawPuddle(x, y, rx) {
        ellipse(x, y, rx, rx * 0.2); fillStroke('#3a86ff', Math.max(2, rx * 0.05));
        ellipse(x - rx * 0.3, y - rx * 0.04, rx * 0.3, rx * 0.05); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    }
    function drawMoon(x, y, r) {
        const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2);
        g.addColorStop(0, 'rgba(255,230,120,.45)'); g.addColorStop(1, 'rgba(255,230,120,0)');
        ctx.fillStyle = g; ellipse(x, y, r * 2, r * 2); ctx.fill();
        ellipse(x, y, r, r); ctx.fillStyle = '#ffe680'; ctx.fill();
        ctx.fillStyle = 'rgba(200,170,60,.35)';
        ellipse(x - r * 0.3, y - r * 0.2, r * 0.18, r * 0.18); ctx.fill();
        ellipse(x + r * 0.25, y + r * 0.3, r * 0.12, r * 0.12); ctx.fill();
    }
    function drawStarShape(x, y, size, rot) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = rot + i * Math.PI / 5, rr = i % 2 ? size * 0.45 : size;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
    }

    // --- the character's own pictures (poses) ----------------------------------------

    /**
     * Which pose to show: the page's pose before the action, its actionPose
     * during it and its afterPose once it is done (each falls back to the one
     * before). Sleep drifts from one to the other; splash lands in afterPose.
     */
    function poseFor(page, state, p) {
        const story = page.story;
        const before = page.pose || story.firstPose;
        const during = page.actionPose || before;
        const after = page.afterPose || before;
        let name = before, next = null, mix = 0;
        if (state === 'acting') {
            if (page.action === 'sleep' && during !== before) {
                // Two translucent silhouettes create ghost faces and doubled
                // outlines. Keep one opaque pose in Simple High Contrast.
                if (S().cvi()) name = p < 0.45 ? before : during;
                else { next = during; mix = easeInOut(p); }
            }
            else if (page.action === 'splash' && p >= 0.85) name = after;
            else if (story.grounded && page.action === 'chase' &&
                (p >= 0.9 || Math.abs(Math.sin(p / 0.9 * Math.PI * 4)) < 0.12)) name = after;
            else name = during;
        } else if (p >= 1) {
            name = after;
        }
        const img = imageFor(story.poses[name]);
        const img2 = next ? imageFor(story.poses[next]) : null;
        if (!img && !img2) return null;
        return {
            img: img, img2: img2, mix: mix,
            pic: story.poses[name], pic2: next ? story.poses[next] : null,
            ring: outlineFor(story.poses[name]), ring2: next ? outlineFor(story.poses[next]) : null
        };
    }

    function posesMissing(story) { return missing(story.poses[story.firstPose]); }

    function contactBaseline(pic) {
        return pic && pic.contacts && pic.contacts.length ? Math.max(...pic.contacts.map(c => c[1])) : 1;
    }

    function objectGrounding(pic, maxW, maxH, footY) {
        const img = imageFor(pic);
        const height = img ? Math.min(maxW / img.width, maxH / img.height) * img.height : maxH;
        const bottom = footY + height * (1 - contactBaseline(pic));
        return { height: height, bottom: bottom, cy: bottom - height / 2 };
    }

    /** A pose picture standing on (x, footY), D tall. Pose pictures share one size and baseline. */
    function drawPose(pose, x, footY, D, rot) {
        ctx.save();
        ctx.translate(x, footY);
        if (rot) ctx.rotate(rot);
        const draw = function (img, ring, pic, alpha) {
            if (!img || alpha <= 0) return;
            const w = D * img.width / img.height;
            ctx.globalAlpha = alpha;
            const top = -D * contactBaseline(pic);
            ctx.drawImage(img, -w / 2, top, w, D);
            if (ring) ctx.drawImage(ring, -w / 2, top, w, D);      // the Outline colour, over the drawn edge
        };
        if (pose.img2) { draw(pose.img, pose.ring, pose.pic, 1 - pose.mix); draw(pose.img2, pose.ring2, pose.pic2, pose.mix); }
        else draw(pose.img, pose.ring, pose.pic, 1);
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // --- effects: splash drops, celebration stars, sleepy Zs ----------------------

    let particles = [];
    let reach = { top: Infinity, left: Infinity, right: -Infinity };
    let landed = false, zTimer = 0;

    function burstStars(g) {
        const colors = ['#ffd60a', '#ff4d6d', '#3bceac', '#5aa9ff', '#c77dff', '#ffffff'];
        for (let i = 0; i < 22; i++) {
            const a = i / 22 * TAU, sp = g.s * rand(2.2, 3.4);
            particles.push({
                type: 'star', x: g.x, y: g.y - g.s * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                size: g.s * rand(0.1, 0.16), color: colors[i % colors.length], rot: a, spin: 2, life: 1.4, max: 1.4
            });
        }
    }
    function splashDrops(x, y, s) {
        for (let i = 0; i < 16; i++) {
            const a = -Math.PI * (0.1 + 0.8 * (i / 15));
            const sp = s * rand(1.6, 2.6);
            particles.push({ type: 'drop', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: s * rand(0.05, 0.08), life: 0.9, max: 0.9 });
        }
    }
    function updateParticles(dt, s) {
        for (const p of particles) {
            p.life -= dt;
            if (p.type === 'star') { const d = Math.pow(0.15, dt); p.vx *= d; p.vy *= d; p.rot += p.spin * dt; }
            if (p.type === 'drop') p.vy += s * 6 * dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
        }
        particles = particles.filter(p => p.life > 0);
    }
    function drawParticles(cvi) {
        for (const p of particles) {
            ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
            if (p.type === 'star') { ctx.fillStyle = p.color; drawStarShape(p.x, p.y, p.size, p.rot); }
            else if (p.type === 'drop') { ellipse(p.x, p.y, p.size, p.size * 1.2); ctx.fillStyle = '#5aa9ff'; ctx.fill(); }
            else if (p.type === 'z') {
                ctx.fillStyle = cvi ? '#ffffff' : '#ffe680';
                ctx.font = '800 ' + Math.round(p.size) + "px 'Baloo 2', system-ui, sans-serif";
                ctx.fillText('Z', p.x, p.y);
            }
        }
        ctx.globalAlpha = 1;
    }

    // --- pages with a cast and a background picture ("Lily Loves Books") --------------
    //
    // A page can have a background picture, a cast of characters (each with
    // their own poses and place) and one of the story's objects. Missing
    // pictures show as labelled placeholders, so a story works while its art
    // is still being made. Simple High Contrast shows only the page's `cvi`
    // choice (a character, or an object) on black: no background, nobody else.

    const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    let castCenter = null;          // where the cast is, for the celebration's stars
    let twinkleT = 0;

    function wrapLines(text, maxW) {
        const lines = [];
        text.split(' ').forEach(function (word) {
            const last = lines[lines.length - 1];
            if (last && ctx.measureText(last + ' ' + word).width <= maxW) lines[lines.length - 1] = last + ' ' + word;
            else lines.push(word);
        });
        return lines;
    }

    /** A dashed box with a label, standing on (cx, bottom): a picture that has not been made yet. */
    function drawPlaceholder(cx, bottom, bw, bh, label, cvi) {
        ctx.save();
        ctx.fillStyle = cvi ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)';
        roundRect(cx - bw / 2, bottom - bh, bw, bh, Math.min(bw, bh) * 0.08);
        ctx.fill();
        ctx.setLineDash([Math.max(6, bw * 0.05), Math.max(5, bw * 0.04)]);
        ctx.lineWidth = Math.max(2, bw * 0.012);
        ctx.strokeStyle = cvi ? '#ffffff' : '#3a2410';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cvi ? '#ffffff' : '#3a2410';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const size = Math.max(10, Math.min(bw * 0.13, bh * 0.1));
        ctx.font = '800 ' + Math.round(size) + "px 'Baloo 2', system-ui, sans-serif";
        const lines = wrapLines(label, bw * 0.86);
        const top = bottom - bh / 2 - (lines.length - 1) * size * 0.6;
        lines.forEach(function (l, i) { ctx.fillText(l, cx, top + i * size * 1.2); });
        ctx.restore();
    }

    /**
     * The page's background picture, filling the picture (cover: cropped to
     * fill, keeping the floor; contain: all of it shows). Returns where the
     * picture is, so things can come out of the right spot on it.
     */
    function drawBackground(pic, w, pictureH, fullH, fit, alpha, fallbackColor, label, extend, floor) {
        const area = { x: 0, y: 0, w: w, h: pictureH };
        const img = imageFor(pic);
        if (!img) {
            if (alpha < 1) return area;
            ctx.fillStyle = fallbackColor; ctx.fillRect(0, 0, w, fullH);
            if (pic && missing(pic) && label) {
                ctx.save();
                ctx.fillStyle = 'rgba(58,36,16,0.55)';
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.font = "800 " + Math.round(Math.max(12, Math.min(w * 0.025, 22))) + "px 'Baloo 2', system-ui, sans-serif";
                ctx.fillText(label, w / 2, Math.max(10, pictureH * 0.04));
                ctx.restore();
            }
            return area;
        }
        const iw = img.width, ih = img.height;
        const k = fit === 'contain' ? Math.min(w / iw, pictureH / ih) : Math.max(w / iw, pictureH / ih);
        const dw = iw * k, dh = ih * k;
        const dx = (w - dw) / 2;
        const dy = fit === 'contain' ? (pictureH - dh) / 2 : pictureH - dh;      // cover keeps the floor
        ctx.globalAlpha = alpha;
        if (fit === 'contain' && alpha === 1) { ctx.fillStyle = fallbackColor; ctx.fillRect(0, 0, w, fullH); }
        // Extend the illustration's outer pixels into the unused space. This
        // preserves its subtle edge colours without a differently coloured mat.
        if (fit === 'contain' && extend) {
            const columns = [
                [0, 1, extend.x, dx - extend.x],
                [0, iw, dx, dw],
                [iw - 1, 1, dx + dw, extend.x + extend.w - dx - dw]
            ];
            const rows = [
                [0, 1, extend.y, dy - extend.y],
                [0, ih, dy, dh],
                [ih - 1, 1, dy + dh, extend.y + extend.h - dy - dh]
            ];
            columns.forEach(function (col, x) {
                rows.forEach(function (row, y) {
                    if ((x !== 1 || y !== 1) && col[3] > 0 && row[3] > 0)
                        ctx.drawImage(img, col[0], row[0], col[1], row[1], col[2], row[2], col[3], row[3]);
                });
            });
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        // A measured strip of complete boards or paving continues at the scene's scale.
        // Start on the last horizontal seam so joints end at a board or tile boundary,
        // preserving their direction instead of reflecting or stretching them.
        if (fit !== 'contain' && fullH > pictureH) {
            if (floor) {
                const sourceY = Math.round(ih * floor[0]), sourceEnd = Math.round(ih * floor[1]);
                const sourceH = sourceEnd - sourceY, tileH = sourceH * k;
                const floorTop = dy + sourceEnd * k;
                ctx.save();
                ctx.beginPath(); ctx.rect(dx, floorTop, dw, fullH - floorTop); ctx.clip();
                for (let y = floorTop; y < fullH; y += tileH)
                    ctx.drawImage(img, 0, sourceY, iw, sourceH, dx, y, dw, tileH);
                ctx.restore();
            } else {
                ctx.drawImage(img, 0, ih - 1, iw, 1, dx, pictureH, dw, fullH - pictureH);
            }
        }
        ctx.globalAlpha = 1;
        return { x: dx, y: dy, w: dw, h: dh };
    }

    // Fit the illustrated room and its occupants as one composition. A wide
    // window must not enlarge furniture while the children are height-limited;
    // a tall phone must not zoom into the furniture behind a width-limited cast.
    function roomFrame(w, pictureH, pictureW, page, controls) {
        const img = imageFor(page.background);
        const aspect = img ? img.width / img.height : 16 / 9;
        const group = (page.cast && page.cast.length > 1) || !page.cast;
        const top = (controls || []).reduce((y, control) => control.left < pictureW
            ? Math.max(y, control.bottom + 8) : y, 0);
        // On a short, narrow phone Pause shares the character's horizontal
        // space. Reserve it before sizing the room, not only when shrinking Lily.
        const availableH = pictureW <= 600 ? Math.max(40, pictureH - top) : pictureH;
        const h = Math.min(availableH * 1.1, pictureW * (group ? 1 / aspect : 1.2));
        const width = h * aspect;
        const spare = pictureH - h;
        const y = spare > 0 ? Math.min(spare, Math.max(top, spare * (group ? 0.8 : 0.35))) : spare;
        return { x: (pictureW - width) / 2, y: y, w: width, h: h };
    }

    function drawRoomBackground(pic, frame, w, fullH, alpha, page, label) {
        const after = pic === page.afterBackground;
        const wide = page.panorama;
        const wideImage = wide && imageFor(after ? wide.afterPicture : wide.picture);
        let img = wideImage || imageFor(pic);
        if (!img) return drawBackground(pic, w, frame.y + frame.h, fullH, 'cover', alpha, page.bg, label);
        const extension = wideImage && !after && imageFor(wide.extensionPicture);
        if (extension) {
            // Painted school wings add real scenery beyond the original view.
            // Blend their edges once at source resolution, never repeat or flip
            // a doorway, tree, window, or strip of planting across the screen.
            const key = img.src + '|' + extension.src;
            if (!panoramaTextures[key]) {
                const overlap = Math.round(img.width * wide.edge);
                const wingWidth = Math.round(extension.width * img.height / extension.height);
                const margin = wingWidth - overlap;
                const result = document.createElement('canvas');
                result.width = img.width + margin * 2; result.height = img.height;
                const g = result.getContext('2d');
                g.drawImage(extension, 0, 0, wingWidth, img.height);
                g.drawImage(extension, margin + img.width - overlap, 0, wingWidth, img.height);
                const middle = document.createElement('canvas');
                middle.width = img.width; middle.height = img.height;
                const m = middle.getContext('2d');
                m.drawImage(img, 0, 0);
                m.globalCompositeOperation = 'destination-in';
                const fade = m.createLinearGradient(0, 0, img.width, 0);
                fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(overlap / img.width, '#000');
                fade.addColorStop(1 - overlap / img.width, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0)');
                m.fillStyle = fade; m.fillRect(0, 0, img.width, img.height);
                g.drawImage(middle, margin, 0);
                result.src = img.src;
                panoramaTextures[key] = result;
            }
            img = panoramaTextures[key];
        }
        const scale = frame.h / img.height, width = img.width * scale;
        const x = frame.x + frame.w / 2 - width / 2;
        const floor = wideImage ? wide.floor : page.backgroundFloor;
        const sourceY = floor ? Math.round(img.height * floor[0]) : img.height;
        const sourceEnd = floor ? Math.round(img.height * floor[1]) : img.height;
        const floorTop = frame.y + sourceEnd * scale;
        // The panorama has one set of furniture. Only its empty outer walls and
        // floor expand farther on extreme aspect ratios; furniture never repeats.
        const edge = wideImage ? Math.round(img.width * wide.edge) : 0;
        // Adjacent antialiased clips at fractional device pixels leave a pale
        // hairline. Share exact pixel boundaries between all three sections.
        const density = Math.abs(ctx.getTransform().a) || 1;
        const pixel = value => Math.round(value * density) / density;
        const left = edge && x > 0 ? pixel(x + edge * scale) : 0;
        const right = edge && x + width < w ? pixel(x + width - edge * scale) : w;
        function strip(source, sy, sh, y, height, main) {
            ctx.save();
            ctx.beginPath(); ctx.rect(left, y, right - left, height); ctx.clip();
            if (main) ctx.drawImage(img, x, frame.y, width, frame.h);
            else ctx.drawImage(source, 0, sy, img.width, sh, x, y, width, height);
            ctx.restore();
            if (left > 0) ctx.drawImage(source, 0, sy, edge, sh, 0, y, left, height);
            if (right < w) ctx.drawImage(source, img.width - edge, sy, edge, sh, right, y, w - right, height);
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        const doorwayOnly = wideImage && after && wide.afterBounds;
        if (alpha === 1 && !doorwayOnly) { ctx.fillStyle = page.bg; ctx.fillRect(0, 0, w, fullH); }
        if (doorwayOnly) {
            // Crossfade just the doorway, keeping the floor, light and walls still.
            const b = wide.afterBounds;
            ctx.beginPath();
            ctx.rect(x + width * b[0], frame.y + frame.h * b[1], width * (b[2] - b[0]), frame.h * (b[3] - b[1]));
            ctx.clip();
        }
        strip(img, 0, sourceEnd, frame.y, sourceEnd * scale, true);
        if (floor && !doorwayOnly) {
            const sourceH = sourceEnd - sourceY, tileH = sourceH * scale;
            // Feather overlapping floor strips instead of reflecting the joints
            // or abruptly joining differently lit rows. Cache the alpha ramp at
            // source resolution; the artwork itself stays sharp and unfiltered.
            const blend = Math.max(1, Math.min(48, Math.round(sourceH * 0.22)));
            const key = img.src + '|' + img.width + '|' + sourceY + '|' + sourceEnd;
            let texture = floorTextures[key];
            if (!texture) {
                texture = document.createElement('canvas');
                texture.width = img.width; texture.height = sourceH;
                const g = texture.getContext('2d');
                g.drawImage(img, 0, sourceY, img.width, sourceH, 0, 0, img.width, sourceH);
                g.globalCompositeOperation = 'destination-in';
                const fade = g.createLinearGradient(0, 0, 0, blend);
                fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, '#000');
                g.fillStyle = fade; g.fillRect(0, 0, img.width, sourceH);
                texture.src = img.src;
                floorTextures[key] = texture;
            }
            for (let y = floorTop - blend * scale; y < fullH; y += (sourceH - blend) * scale)
                strip(texture, 0, sourceH, y, tileH, false);
        }
        if (frame.y > 0) {
            const fade = Math.min(70, frame.h * 0.1);
            const gradient = ctx.createLinearGradient(0, frame.y, 0, frame.y + fade);
            gradient.addColorStop(0, page.bg); gradient.addColorStop(1, page.bg + '00');
            ctx.fillStyle = gradient; ctx.fillRect(0, frame.y, w, fade);
        }
        ctx.restore();
    }

    /** One picture of a cast member or object, or its placeholder, standing on (x, bottom), D tall. */
    function drawStanding(pic, x, bottom, D, rot, label, cvi, alpha) {
        const img = imageFor(pic);
        let half = D * 0.35;
        ctx.save();
        ctx.translate(x, bottom);
        if (rot) ctx.rotate(rot);
        if (alpha !== undefined) ctx.globalAlpha = alpha;
        if (img) {
            const w = D * img.width / img.height;
            half = w / 2;
            ctx.drawImage(img, -w / 2, -D, w, D);
            const ring = outlineFor(pic);
            if (ring) ctx.drawImage(ring, -w / 2, -D, w, D);
        } else if (!pic || missing(pic)) {
            drawPlaceholder(0, 0, D * 0.7, D, label, cvi);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        return half;
    }

    function memberPoseName(m, state, p) {
        if (state === 'acting') return p >= m.settleAt ? (m.afterPose || m.pose) : (m.actionPose || m.pose);
        if (p >= 1) return m.afterPose || m.pose;
        return m.pose;
    }

    // Contacts are measured from each pose's opaque wheels, shoes and legs.
    // Their heights differ within the artwork, so one oval below the canvas
    // leaves a visible air gap under most of the character.
    function drawContactShadows(pic, x, bottom, height, opacity, depth) {
        const img = imageFor(pic);
        if (!img || !pic.contacts || S().cvi()) return;
        const width = height * img.width / img.height;
        pic.contacts.forEach(function (contact) {
            ctx.save();
            if (opacity !== undefined) ctx.globalAlpha *= opacity;
            ctx.translate(x - width / 2 + contact[0] * width, bottom - height + contact[1] * height - height / 1800);
            ctx.scale(Math.max(1, contact[2] * width / 2), Math.max(0.8, height * (depth || 0.005)));
            const shade = ctx.createRadialGradient(0, 0, 0.15, 0, 0, 1);
            shade.addColorStop(0, 'rgba(46,30,19,0.38)');
            shade.addColorStop(0.55, 'rgba(46,30,19,0.22)');
            shade.addColorStop(1, 'rgba(46,30,19,0)');
            ctx.fillStyle = shade; ellipse(0, 0, 1, 1); ctx.fill();
            ctx.restore();
        });
    }

    function drawCastPage(w, pictureH, page, st) {
        const cvi = S().cvi();
        const large = cvi && S().is('characterSize', 'large');
        const story = page.story;
        const p = st.p || 0, acting = st.state === 'acting', done = !acting && p >= 1;
        const fullH = Math.max(pictureH, st.h || 0);
        const pictureW = st.pictureW || w;
        // Room art reaches every edge; tablet pages retain their complete
        // display and extend its matching surroundings behind the caption.
        const fullRoom = st.fullBleed && !page.backgroundExtend;
        const room = !cvi && fullRoom ? roomFrame(w, pictureH, pictureW, page, st.controls) : null;
        let s = Math.min(w * 0.24, pictureH * 0.32) * (st.zoom || 1);
        if (cvi) s *= 1.25;
        s *= S().characterScale();
        let groundY = pictureH * (cvi ? (large ? 0.96 : 0.86) : page.ground);

        // --- the background (Picture Book only) ---
        let area = { x: 0, y: 0, w: w, h: pictureH };
        if (cvi) {
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, fullH);
        } else {
            if (!fullRoom && pictureW < w) { ctx.fillStyle = page.bg; ctx.fillRect(0, 0, w, fullH); }
            // On narrow portrait screens, keep the complete tablet below
            // Pause while its matching surroundings fill the viewport.
            const pictureTop = !fullRoom && w <= 500 && fullH > w
                ? (st.controls || []).reduce((top, control) => Math.max(top, control.bottom + 8), 0) : 0;
            if (pictureTop) { ctx.fillStyle = page.bg; ctx.fillRect(0, 0, w, fullH); }
            const label = page.background ? 'Background: ' + page.background.image.split('/').pop() : '';
            ctx.save(); ctx.translate(0, pictureTop);
            const extend = page.backgroundExtend ? { x: 0, y: -pictureTop, w: w, h: fullH } : null;
            const backgroundW = fullRoom ? w : pictureW, fit = fullRoom ? 'cover' : page.backgroundFit;
            if (room) {
                drawRoomBackground(page.background, room, w, fullH, 1, page, label);
                area = room;
            } else area = drawBackground(page.background, backgroundW, Math.max(40, pictureH - pictureTop), fullH - pictureTop, fit, 1, page.bg, label, extend, page.backgroundFloor);
            if (page.afterBackground) {
                const a = acting && page.action === 'arrive' ? clamp((p - 0.55) / 0.35, 0, 1) : (done ? 1 : 0);
                if (a > 0) {
                    if (room) drawRoomBackground(page.afterBackground, room, w, fullH, a, page, '');
                    else drawBackground(page.afterBackground, backgroundW, Math.max(40, pictureH - pictureTop), fullH - pictureTop, fit, a, page.bg, '', extend, page.backgroundFloor);
                }
            }
            ctx.restore(); area.y += pictureTop;
            // The room fills the menu tile, while the child fits its visible
            // rectangle instead of the larger, cropped background bounds.
            if (st.cover) area = { x: 0, y: 0, w: w, h: pictureH };
        }
        if (cvi && st.cover) groundY = pictureH * 0.94;
        if (!cvi) groundY = area.y + area.h * page.ground;

        // --- who is on the page (Simple High Contrast: only the page's choice) ---
        let members = page.cast || [];
        if (cvi) {
            if (page.cvi.show && page.cvi.show.length) {
                const shown = members.filter(m => page.cvi.show.indexOf(m.who) >= 0);
                members = page.cvi.keepPositions ? shown : shown.map((m, k) => {
                    const at = (k + 0.5) / shown.length;
                    return Object.assign({}, m, { at: at, afterAt: m.afterAt === null ? null : at + m.afterAt - m.at });
                });
            } else {
                members = [];
            }
        }
        if (large && members.length > 1 && page.castOverlap > 0) members = members.map(m => Object.assign({}, m));

        // --- the object on the page (or, in Simple High Contrast, the page's cvi object) ---
        let objName = null, objActionName = null;
        if (cvi && page.cvi.object) { objName = page.cvi.object; objActionName = page.cvi.actionObject; }
        else if (!(cvi && page.cvi.show && page.cvi.show.length) && page.object) { objName = page.object; objActionName = page.objectAction; }

        const sceneW = room ? Math.min(pictureW, room.w) : cvi || fullRoom ? pictureW : area.w;
        const sceneX = room ? (pictureW - sceneW) / 2 : cvi || fullRoom ? 0 : area.x;
        const sizeReference = cvi && page.cvi.sizeLike && story.cast[page.cvi.sizeLike];
        const bounds = !cvi && page.objectBounds ? page.objectBounds : [0, 0, 1, 1];
        let objectLeft = sceneX + sceneW * bounds[0], objectRight = sceneX + sceneW * bounds[2];
        const objectCeiling = cvi || fullRoom ? 12 : area.y + area.h * bounds[1];
        if (sizeReference && page.action === 'hopacross') {
            objectLeft += sceneW * 0.06; objectRight -= sceneW * 0.06;
            // Give the bigger character a clear route beside Pause, rather
            // than shrinking its entire journey to fit underneath the button.
            (st.controls || []).forEach(control => {
                if ((!large || sceneW > pictureH * 1.25) && control.left > sceneX + sceneW * 0.65 && control.left < objectRight)
                    objectRight = Math.min(objectRight, control.left - 12);
            });
        }
        const topGap = cvi ? 12 : Math.max(12, area.y + Math.max(10, area.h * 0.035));
        function clearTop(left, right) {
            return (st.controls || []).reduce(function (top, control) {
                return right > control.left && left < control.right ? Math.max(top, control.bottom + 8) : top;
            }, topGap);
        }
        const objects = story.objects || {};
        const objectRatio = Math.max.apply(null, [objects[objName], objects[objActionName]].map(function (pic) {
            const img = pic && imageFor(pic);
            return img ? img.width / img.height : 0;
        }));
        // Where an object comes out of (a fraction of the background picture), and how big it is.
        const from = page.from || [0.5, 0.62];
        const ox = cvi ? pictureW * 0.5 : sceneX + sceneW * from[0];
        const oy = cvi || fullRoom ? groundY : area.y + area.h * from[1];
        // Never taller than the room above where it stands, so a tall tower keeps a gap at the top.
        const hopHeight = sizeReference ? 0.12 : 0.28;
        const peak = page.action === 'popup' ? 1.101 : page.action === 'hopacross' && sizeReference ? 1 + hopHeight
            : /^(hopout|hopacross)$/.test(page.action) ? 1.35 : 1;
        const desiredObjectH = sizeReference ? s * 1.8 * sizeReference.size
            : (cvi ? pictureH : area.h) * page.objectSize * (cvi ? 1.15 : 1) * S().characterScale() * (st.zoom ? 1.2 : 1);
        // Test controls against the size that can actually fit. A requested
        // double-size tablet can extend into Pause before it is width-fitted,
        // incorrectly making Large smaller than Regular in landscape.
        const fittedObjectH = large ? Math.min(desiredObjectH,
            Math.max(1, Math.min(groundY, oy) - objectCeiling) / peak,
            objectRatio ? Math.max(1, objectRight - objectLeft - 16) / (objectRatio * peak) : Infinity) : desiredObjectH;
        const objectHalf = fittedObjectH * objectRatio * peak / 2;
        const travel = page.action === 'hopout' ? sceneW * (cvi ? 0.12 : 0.2) : 0;
        const objectTop = page.action === 'hopacross'
            ? Math.max(objectCeiling, clearTop(objectLeft, objectRight))
            : clearTop(ox - objectHalf, ox + travel + objectHalf);
        const objH = Math.max(1, Math.min(
            desiredObjectH,
            (Math.min(groundY, oy) - objectTop) / peak,
            objectRatio ? Math.max(1, objectRight - objectLeft - 16) / (objectRatio * peak) : Infinity));
        const objectHalfWidth = objH * objectRatio / 2;
        const objectX = page.action === 'hopacross'
            ? objectLeft + objectHalfWidth + 8 + Math.max(0, objectRight - objectLeft - objectHalfWidth * 2 - 16) * easeInOut(p)
            : ox;

        // --- the warm glow around everyone (behind them) ---
        let D0 = st.cover ? pictureH * 0.96 / Math.max(1, ...members.map(m => m.size)) : !cvi && page.characterHeight
            ? area.h * page.characterHeight
            : s * 1.8;
        const sizes = members.map(function (m) {
            const poses = story.cast[m.who].poses;
            const ratio = Math.max.apply(null, [m.pose, m.actionPose, m.afterPose].map(function (name) {
                const img = name && imageFor(poses[name]);
                return img ? img.width / img.height : 0;
            }));
            return { m: m, ratio: ratio || 0.7 };
        }).sort((a, b) => a.m.at - b.m.at);
        if (large && sizes.length > 1 && page.castOverlap > 0) {
            // Use the full width for the reading group. Fixed fractional gaps
            // otherwise make Regular and Large equally tiny on a phone.
            const widths = sizes.map(entry => entry.ratio * entry.m.size);
            const centers = [widths[0] / 2], settled = [widths[0] / 2];
            for (let i = 1; i < sizes.length; i++) {
                const halfWidths = (widths[i - 1] + widths[i]) / 2;
                centers.push(centers[i - 1] + halfWidths * (1 - page.castOverlap + 0.08));
                settled.push(settled[i - 1] + halfWidths * (1 - page.castOverlap));
            }
            const span = centers[centers.length - 1] + widths[widths.length - 1] / 2;
            const inset = (span - settled[settled.length - 1] - widths[widths.length - 1] / 2) / 2;
            sizes.forEach((entry, i) => {
                entry.m.at = (8 + centers[i] / span * (sceneW - 16)) / sceneW;
                entry.m.afterAt = page.action === 'gather' ? (8 + (settled[i] + inset) / span * (sceneW - 16)) / sceneW : null;
            });
        }
        sizes.forEach(function (entry, i) {
            D0 = Math.min(D0, (groundY - topGap) / entry.m.size, (sceneW - 16) / (entry.ratio * entry.m.size));
            // On a narrow screen the wheelchair still needs space to travel.
            // Filling the entire width would clamp both endpoints to the centre.
            if (entry.m.who === page.actor && (page.action === 'roll' || page.action === 'arrive'))
                D0 = Math.min(D0, (sceneW * 0.68 - 16) / (entry.ratio * entry.m.size));
            if (i) {
                const previous = sizes[i - 1];
                const endGap = (entry.m.afterAt === null ? entry.m.at : entry.m.afterAt) -
                    (previous.m.afterAt === null ? previous.m.at : previous.m.afterAt);
                const room = (Math.min(entry.m.at - previous.m.at, endGap) - 0.012) * sceneW;
                // Reading groups can share space around a desk. Draw order
                // supplies depth, while other pages keep their clear spacing.
                const halfWidths = (entry.ratio * entry.m.size + previous.ratio * previous.m.size) / 2 * (1 - page.castOverlap);
                D0 = Math.min(D0, Math.max(1, room) / halfWidths);
            }
        });
        function castSpan(height) {
            let span = sceneW;
            if (page.castOverlap > 0) sizes.forEach(function (entry, i) {
                if (!i) return;
                const previous = sizes[i - 1];
                const endGap = (entry.m.afterAt === null ? entry.m.at : entry.m.afterAt) -
                    (previous.m.afterAt === null ? previous.m.at : previous.m.afterAt);
                const halfWidths = height * (entry.ratio * entry.m.size + previous.ratio * previous.m.size) / 2;
                if (endGap > 0) span = Math.min(span, halfWidths * 0.85 / endGap);
            });
            return span;
        }
        // Check controls against the fitted cast, not an oversized requested
        // rectangle that could falsely shrink a child who already fits beside Pause.
        sizes.forEach(function (entry) {
            const half = D0 * entry.ratio * entry.m.size / 2;
            const span = large ? castSpan(D0) : sceneW, left = sceneX + (sceneW - span) / 2;
            const end = left + (entry.m.afterAt === null ? entry.m.at : entry.m.afterAt) * span;
            const start = entry.m.who === page.actor && (page.action === 'roll' || page.action === 'arrive')
                ? sceneX + (page.from ? page.from[0] : 0.12) * sceneW : left + entry.m.at * span;
            const fittedX = x => large ? clamp(x, sceneX + half + 8, Math.max(sceneX + half + 8, sceneX + sceneW - half - 8)) : x;
            const top = clearTop(Math.min(fittedX(start), fittedX(end)) - half, Math.max(fittedX(start), fittedX(end)) + half);
            D0 = Math.min(D0, (groundY - top) / entry.m.size);
        });
        D0 = Math.max(1, D0);
        // Keep friends around the same tablet when a short screen limits their
        // height. Spacing must shrink with them instead of spanning the room.
        const castW = castSpan(D0);
        const castX = sceneX + (sceneW - castW) / 2;
        // Both the waiting cue and the sprite use its current, fitted position.
        function memberX(m) {
            let x = castX + m.at * castW;
            if (page.action === 'gather' && m.afterAt !== null)
                x += (m.afterAt - m.at) * castW * easeInOut(clamp(p / 0.7, 0, 1));
            if (m.who === page.actor && (page.action === 'roll' || page.action === 'arrive')) {
                const start = sceneX + (page.from ? page.from[0] : 0.12) * sceneW;
                x = start + (x - start) * (acting ? easeInOut(p) : (done ? 1 : 0));
            }
            const img = imageFor(story.cast[m.who].poses[memberPoseName(m, st.state, p)]);
            const half = D0 * m.size * (img ? img.width / img.height / 2 : 0.35);
            return clamp(x, sceneX + half + 8, Math.max(sceneX + half + 8, sceneX + sceneW - half - 8));
        }
        const places = members.map(memberX);
        const midX = places.length ? places.reduce((a, b) => a + b, 0) / places.length : w / 2;
        castCenter = { x: midX, y: groundY - D0 * 0.55, s: s };
        if (!members.length && objName) castCenter = { x: objectX, y: oy - objH * 0.65, s: s };
        if (!cvi && page.action === 'glow' && (acting || done)) {
            const a = acting ? p : 1;
            const spread = places.length > 1 ? (Math.max.apply(null, places) - Math.min.apply(null, places)) / 2 : 0;
            const R = spread + D0 * 0.9;
            const glow = ctx.createRadialGradient(midX, castCenter.y, R * 0.2, midX, castCenter.y, R);
            const k = a * (0.45 + 0.08 * Math.sin(time * 1.6));
            glow.addColorStop(0, 'rgba(255,214,120,' + k.toFixed(3) + ')'); glow.addColorStop(1, 'rgba(255,214,120,0)');
            ctx.fillStyle = glow; ellipse(midX, castCenter.y, R, R * 0.85); ctx.fill();
        }

        // --- Press to Play: a soft glow says it is the player's turn ---
        if (st.state === 'waiting') {
            const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
            const actor = members.find(m => m.who === page.actor);
            const actorHeight = actor ? D0 * actor.size : objH;
            const gx = actor ? memberX(actor) : objectX, gy = actor ? groundY - actorHeight * 0.5 : oy - objH * 0.4;
            const R = actor ? actorHeight * 0.75 : objH * 0.7;
            const glow = ctx.createRadialGradient(gx, gy, R * 0.3, gx, gy, R);
            glow.addColorStop(0, 'rgba(255,255,255,' + (0.25 + pulse * 0.3) + ')'); glow.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glow; ellipse(gx, gy, R, R); ctx.fill();
        }

        // Celebration stars sit behind the children rather than covering faces.
        if (st.live && page.action === 'celebrate') drawParticles(cvi);

        // --- the cast ---
        members.forEach(function (m, k) {
            const character = story.cast[m.who] || {};
            const pose = character.poses || {};
            const name = memberPoseName(m, st.state, p);
            const D = D0 * m.size;
            let x = memberX(m), hop = 0, rot = 0;
            const isActor = m.who === page.actor;
            if (isActor && (page.action === 'roll' || page.action === 'arrive')) {
                if (acting) hop = Math.abs(Math.sin(p * Math.PI * 10)) * s * 0.012;   // a gentle bump as the wheels turn
            }
            if (acting && isActor && page.action === 'wave') { hop = Math.abs(Math.sin(p * Math.PI * 3)) * s * 0.1; rot = Math.sin(p * Math.PI * 3) * 0.04; }
            if (acting && isActor && page.action === 'press') hop = -Math.sin(Math.min(1, p / 0.35) * Math.PI) * s * 0.02;
            if (acting && m.wiggle) rot = Math.sin(p * Math.PI * 4) * 0.05;
            if (acting && page.action === 'celebrate') hop = Math.abs(Math.sin((p * 2 + k * 0.3) * Math.PI)) * s * 0.35;
            // Poses animate seated children; their wheelchair/table stays on the floor.
            if (character.grounded) { hop = 0; rot = 0; }
            // Keep the whole picture on the screen.
            const img = imageFor(pose[name]);
            const half = img ? D * img.width / img.height / 2 : D * 0.35;
            x = clamp(x, sceneX + half + 8, Math.max(sceneX + half + 8, sceneX + sceneW - half - 8));
            const motionMargin = Math.abs(rot) * D;
            hop = Math.min(hop, Math.max(0, groundY - D - clearTop(x - half - motionMargin, x + half + motionMargin)));
            if (!cvi) drawContactShadows(pose[name], x, groundY - hop, D);
            const label = (story.cast[m.who] ? story.cast[m.who].name : m.who) + ': ' + name;
            const breathe = character.grounded ? 0 : Math.sin(time * 2 + k) * s * 0.006;
            drawStanding(pose[name], x, groundY - hop + breathe, D, rot, label, cvi);
            if (st.live) {
                reach.top = Math.min(reach.top, groundY - hop - D);
                reach.left = Math.min(reach.left, x - half);
                reach.right = Math.max(reach.right, x + half - w);
            }
        });

        // --- the object, and what it does ---
        if (objName) {
            let pic = objects[objName], label = objName;
            let x = ox, bottom = oy, h = objH, show = true, clipY = null, alpha = 1, blend = null;
            const a = page.action;
            if (a === 'press' && objActionName) {
                // The screen changes while the tablet, switch and stand stay still.
                if (done) { pic = objects[objActionName]; label = objActionName; }
                else if (acting) blend = clamp((p - 0.15) / 0.4, 0, 1);
            } else if (objActionName && (acting || done) && a !== 'hopout' && a !== 'hopacross') {
                if ((acting || done) && objActionName) { pic = objects[objActionName]; label = objActionName; }
            }
            if (a === 'popup') {
                if (!acting && !done) show = false;
                else if (acting) h = objH * Math.max(0.05, easeOutBack(Math.min(1, p / 0.55)));
            } else if (a === 'rise') {
                if (!acting && !done) show = false;
                else if (acting) { const q = easeInOut(p); bottom = oy + objH * (1 - q); clipY = oy; alpha = Math.min(1, p * 3); }
            } else if (a === 'hopacross') {
                x = objectX;
                const jump = acting ? Math.abs(Math.sin(p * Math.PI * 3)) : 0;
                bottom = groundY - jump * objH * hopHeight;
                if (jump > 0.12 && objActionName) { pic = objects[objActionName]; label = objActionName; }
            } else if (a === 'hopout') {
                const landX = clamp(ox + sceneW * (cvi ? 0.12 : 0.2), sceneX + objH * 0.5, sceneX + sceneW - objH * 0.5);
                const landY = groundY;
                if (!acting && !done) show = false;
                else if (acting && p < 0.4) {
                    const q = p / 0.4;
                    x = ox + (landX - ox) * q;
                    bottom = oy + (landY - oy) * q - Math.sin(q * Math.PI) * objH * 0.6;
                    h = objH * (0.35 + 0.65 * q);
                    if (objActionName) { pic = objects[objActionName]; label = objActionName; }
                } else {
                    x = landX; bottom = landY;
                    if (acting) {
                        const hp = Math.abs(Math.sin(((p - 0.4) / 0.6) * Math.PI * 2));
                        bottom -= hp * objH * 0.28;
                        if (hp > 0.15 && objActionName) { pic = objects[objActionName]; label = objActionName; }
                    }
                }
            }
            if (show) {
                // Wide artwork (such as Amber's tablet and switch) must fit the
                // screen as well as the available height. Use both states'
                // aspect ratios so a switch press never changes its scale.
                if (objectRatio > 0) {
                    const half = h * objectRatio / 2;
                    x = clamp(x, sceneX + half + 8, sceneX + sceneW - half - 8);
                }
                bottom = Math.min(bottom, groundY + objH);
                const top = bottom - h;
                if (top < topGap && clipY === null) bottom += topGap - top;
                ctx.save();
                if (clipY !== null) { ctx.beginPath(); ctx.rect(0, 0, w, clipY); ctx.clip(); }
                if (a === 'hopacross' && !cvi) {
                    ctx.beginPath(); ctx.rect(objectLeft, objectCeiling, objectRight - objectLeft, area.h * (bounds[3] - bounds[1])); ctx.clip();
                }
                drawContactShadows(pic, x, bottom, h);
                drawStanding(pic, x, bottom, h, 0, label, cvi, blend === null ? alpha : 1 - blend);
                if (blend !== null && blend > 0) drawStanding(objects[objActionName], x, bottom, h, 0, objActionName, cvi, blend);
                ctx.restore();
                // Twinkles around something that has popped up.
                if (st.live && a === 'popup' && (acting || done)) {
                    twinkleT -= st.dt || 0;
                    if (twinkleT <= 0) {
                        twinkleT = acting ? 0.12 : 0.45;
                        particles.push({
                            type: 'star', x: x + rand(-0.45, 0.45) * h * 0.6, y: bottom - rand(0.1, 1) * h, vx: 0, vy: -s * 0.05,
                            size: s * rand(0.05, 0.1), color: cvi ? '#ffffff' : '#fff3a6', rot: rand(0, TAU), spin: 1.5, life: 0.9, max: 0.9
                        });
                    }
                }
            }
        }

        if (st.live && page.action !== 'celebrate') drawParticles(cvi);
        return { s: s };
    }

    // --- one page ------------------------------------------------------------------

    /**
     * Draw a page. `st` says where the page is up to:
     *   state  the story's state ('idle', 'reading', 'waiting', 'acting', 'done', ...)
     *   p      how far the action has got, 0 to 1
     *   live   true only for the real story screen: effects and sounds happen
     *   zoom   bigger, for the small cover tiles
     */
    function drawPage(w, pictureH, page, st) {
        if (page.spread) return NSS.Illustrations.drawSpread(ctx, imageFor, w, pictureH, page, st);
        if (page.illustration) return NSS.Illustrations.draw(ctx, imageFor, w, pictureH, page, st, time);
        if (page.cast || page.background) return drawCastPage(w, pictureH, page, st);
        const cvi = S().cvi();
        const large = cvi && S().is('characterSize', 'large');
        const availableW = st.pictureW || w;
        const pictureW = Math.min(availableW, pictureH * 1.9);
        const pictureX = (availableW - pictureW) / 2;
        const g = geometry(pictureW, pictureH, page, cvi, st.zoom);
        g.x += pictureX; g.objX += pictureX;
        const moving = /^(chase|splash)$/.test(page.action);
        let routeRight = pictureX + pictureW;
        if (large && moving && pictureW > pictureH * 1.25) {
            (st.controls || []).forEach(control => {
                if (control.left > pictureX + pictureW * 0.65)
                    routeRight = Math.min(routeRight, control.left - 12);
            });
            // Running beside Pause leaves room for a much larger dog and a
            // visible hop, instead of squeezing the whole action below it.
            g.x = pictureX + (routeRight - pictureX) * 0.38;
            g.objX = pictureX + (routeRight - pictureX) * 0.72;
        }
        const chaseEnd = pictureX + (routeRight - pictureX) * 0.66;
        let s = g.s;
        const p = st.p || 0, acting = st.state === 'acting';
        const bg = cvi ? '#000000' : page.bg;
        const story = page.story || null;
        const grounded = !!(story && story.grounded);
        const objPic = name => story && story.objects ? imageFor(story.objects[name]) : null;

        const sprite = story && story.poses ? poseFor(page, st.state, p) : null;
        const footY = large ? pictureH * 0.94 : g.groundY + s * 0.06;
        let topLimit = grounded && !large
            ? (st.controls || []).reduce((top, control) => control.left < pictureX + pictureW && control.right > pictureX
                ? Math.max(top, control.bottom + 8) : top, 6) : 6;
        // Large fits the poses used on this page, rather than reserving the
        // width of the sleeping dog on every page of the story.
        const pagePoses = story && story.poses ? (large
            ? [page.pose || story.firstPose, page.actionPose, page.afterPose].filter(Boolean).map(name => story.poses[name])
            : Object.values(story.poses)) : [];
        const poseRatio = Math.max(1, ...pagePoses.map(pic => {
            // Measuring an unseen pose must not composite all of its high-
            // contrast outlines during a resize. Only the displayed pose needs that.
            const entry = pics[(cvi && pic.cviImage) || pic.image];
            return entry && entry.status === 'ok' ? entry.img.width / entry.img.height : 1;
        }));
        const motionRoom = large && /^(jump|chase|splash|celebrate)$/.test(page.action) ? 1.08 : 1;
        const widthLimit = (routeRight - pictureX) * (large && moving ? 0.78 : 1) - 8;
        let D = Math.max(1, Math.min(s * 2.1, (footY - topLimit) / motionRoom, widthLimit / poseRatio));
        if (large) {
            const half = D * poseRatio / 2;
            const fittedX = x => clamp(x, pictureX + half + 4, Math.max(pictureX + half + 4, routeRight - half - 4));
            const start = fittedX(g.x), end = fittedX(page.action === 'chase' ? chaseEnd
                : page.action === 'splash' ? g.objX : g.x);
            topLimit = (st.controls || []).reduce((top, control) => Math.max(start, end) + half > control.left &&
                Math.min(start, end) - half < control.right ? Math.max(top, control.bottom + 8) : top, 6);
            D = Math.max(1, Math.min(D, (footY - topLimit) / motionRoom));
        }
        // Objects, movement and effects follow the dog's final fitted size.
        // Previously only Rocky was capped, leaving an oversized ball or bird.
        if (sprite) s = D / 2.1;
        g.s = s;
        if (large) {
            g.groundY = footY - s * 0.06;
            const objectHalf = s * ({ puddle: 0.8, moon: 0.475, bird: 0.4, ball: 0.33 }[page.object] || 0);
            if (objectHalf) g.objX = clamp(g.objX, pictureX + objectHalf + 8, routeRight - objectHalf - 8);
        }

        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, Math.max(pictureH, st.h || 0));
        if (!cvi) {
            ctx.fillStyle = isDark(bg) ? mix(bg, '#ffffff', 0.06) : mix(bg, '#000000', 0.06);
            // The floor extends behind every supporting paw and the puddle.
            ctx.fillRect(0, footY - (grounded ? D * 0.2 : 0), w, Math.max(pictureH, st.h || 0));
            if (page.object === 'moon') {
                const star = objPic('star');
                ctx.fillStyle = 'rgba(255,255,255,.8)';
                [[0.15, 0.18], [0.3, 0.1], [0.55, 0.2]].forEach(function (f, i) {
                    ctx.globalAlpha = 0.6 + 0.2 * Math.sin(time * 1.2 + i * 2);   // a slow, soft twinkle
                    if (star) drawObject(story, 'star', f[0] * w, f[1] * pictureH, s * 0.26, s * 0.26);
                    else drawStarShape(f[0] * w, f[1] * pictureH, s * 0.06, 0);
                });
                ctx.globalAlpha = 1;
            }
        }

        const rocky = { x: g.x, y: g.y, tail: Math.sin(time * 3) * 0.15, lie: 0, closed: false, tilt: 0, hop: 0 };
        const obj = { bounce: 0, visible: !!page.object, bx: g.objX, by: 0, roll: 0, flip: false, flying: false, flap: Math.sin(time * 3) * 0.2 };

        switch (page.action) {
            case 'wave': case 'wag':
                if (acting) { rocky.tail = Math.sin(time * 28) * 0.55; rocky.hop = Math.abs(Math.sin(p * Math.PI * 3)) * s * 0.18; rocky.tilt = Math.sin(p * Math.PI * 3) * 0.12; }
                if (grounded) { rocky.hop = 0; rocky.tilt = 0; }
                break;
            case 'jump':
                if (acting) { rocky.hop = Math.sin(p * Math.PI) * s * 0.95; rocky.tail = Math.sin(time * 20) * 0.4; obj.bounce = Math.abs(Math.sin(p * Math.PI * 2)) * s * 0.6; }
                break;
            case 'chase': {
                // Rocky bounds after the ball, which rolls away off the side of the page.
                if (p > 0) {
                    const run = Math.min(1, p / 0.9);
                    rocky.x = g.x + (chaseEnd - g.x) * easeInOut(run);
                    rocky.hop = run < 1 ? Math.abs(Math.sin(run * Math.PI * 4)) * s * 0.28 : 0;
                    rocky.tail = Math.sin(time * 20) * 0.4;
                    const q = clamp((p - 0.12) / 0.88, 0, 1);
                    obj.bx = g.objX + q * q * (w - g.objX + s);
                    obj.roll = (obj.bx - g.objX) / (s * 0.33);     // rolls, not slides
                }
                break;
            }
            case 'fly': {
                // The bird flies up over Rocky's head, to just where he is looking
                // (up and to his right), hovers there, then flies away.
                const perchX = g.objX, perchY = grounded
                    ? objectGrounding(story.objects.bird, s * 0.8, s * 0.8, footY).cy
                    : g.groundY - s * 0.3;
                obj.bx = perchX; obj.by = perchY;
                if (p > 0) {
                    const gx = Math.min(w - s * 0.5, rocky.x + (sprite ? D * 0.42 : s * 0.9));
                    const flightTop = s * 0.5 + (large ? (st.controls || []).reduce((top, control) => Math.max(top, control.bottom + 8), 0) : 0);
                    const gy = Math.max(flightTop, footY - (sprite ? D * 1.05 : s * 1.6));
                    obj.flying = true;
                    obj.flap = Math.sin(time * 30) * 0.8;
                    if (p < 0.45) {
                        const q = easeInOut(p / 0.45);
                        obj.bx = perchX + (gx - perchX) * q;
                        obj.by = perchY + (gy - perchY) * q - Math.sin(q * Math.PI) * s * 0.5;
                        obj.flip = gx < perchX;                    // facing the way it flies
                    } else if (p < 0.62) {
                        obj.bx = gx + Math.sin(time * 3) * s * 0.08;
                        obj.by = gy + Math.sin(time * 5) * s * 0.06;
                    }
                    // Until it flies away, the whole bird stays on the screen.
                    if (p < 0.62) obj.by = Math.max(obj.by, flightTop);
                    if (p >= 0.62) {
                        const e = Math.pow((p - 0.62) / 0.38, 2);
                        obj.bx = gx + e * (w - gx + s * 2);
                        obj.by = large ? Math.max(flightTop, gy - e * (gy + s * 2)) : gy - e * (gy + s * 2);
                    }
                    if (p >= 1) obj.visible = false;
                    rocky.tilt = -0.35;            // the drawn Rocky looks up at the bird
                }
                break;
            }
            case 'splash':
                if (p > 0) {
                    const q = Math.min(1, p / 0.85);
                    rocky.x = g.x + (g.objX - g.x) * q;
                    rocky.hop = Math.sin(q * Math.PI) * s * 0.7;
                    if (p >= 0.85) rocky.y += s * 0.05;
                }
                break;
            case 'sleep':
                rocky.lie = easeInOut(p); rocky.closed = rocky.lie > 0.6;
                if (rocky.lie > 0.6) rocky.tail = 0;
                break;
            case 'celebrate':
                if (acting) { rocky.hop = Math.abs(Math.sin(p * Math.PI * 2)) * s * 0.6; rocky.tail = Math.sin(time * 28) * 0.5; }
                break;
        }

        // things in the sky or on the ground behind Rocky
        if (page.object === 'moon') {
            let my = Math.max(s * 0.8, pictureH * 0.22);
            const moon = objPic('moon');
            if (cvi) (st.controls || []).forEach(control => {
                if (g.objX + s * 0.475 > control.left && g.objX - s * 0.475 < control.right)
                    my = Math.max(my, control.bottom + s * 0.475 + 8);
            });
            if (moon) {
                if (!cvi) {
                    const glow = ctx.createRadialGradient(g.objX, my, s * 0.4, g.objX, my, s * 1.0);
                    glow.addColorStop(0, 'rgba(255,230,120,.45)'); glow.addColorStop(1, 'rgba(255,230,120,0)');
                    ctx.fillStyle = glow; ellipse(g.objX, my, s * 1.0, s * 1.0); ctx.fill();
                }
                drawObject(story, 'moon', g.objX, my, s * 0.95, s * 0.95);
            } else {
                drawMoon(g.objX, my, s * 0.38);
            }
        }
        if (page.object === 'puddle') {
            const puddleY = large ? footY - s * 0.3 : g.groundY + s * 0.04;
            if (!drawObject(story, 'puddle', g.objX, puddleY, s * 1.6, s * 0.6)) drawPuddle(g.objX, puddleY, s * 0.65);
        }

        // A big jump never takes a pose picture off the top of the screen, and
        // running (the chase) never takes it off the side.
        if (sprite) {
            rocky.hop = Math.min(rocky.hop, Math.max(0, footY - D - topLimit));
            const half = D * poseRatio / 2;
            rocky.x = clamp(rocky.x, pictureX + half + 4, Math.max(pictureX + half + 4, routeRight - half - 4));
        }
        const bodyY = sprite ? footY - rocky.hop - D * 0.45 : rocky.y - rocky.hop;

        // Press to Play: a soft, slow glow says it is the player's turn.
        if (st.state === 'waiting') {
            const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
            const cx = rocky.x + (sprite ? 0 : s * 0.1), cy = bodyY - (sprite ? 0 : s * 0.1), R = sprite ? D * 0.75 : s * 1.25;
            const glow = ctx.createRadialGradient(cx, cy, R * 0.32, cx, cy, R);
            glow.addColorStop(0, 'rgba(255,255,255,' + (0.25 + pulse * 0.3) + ')'); glow.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glow; ellipse(cx, cy, R, R); ctx.fill();
            rocky.tail = Math.sin(time * 6) * 0.3;
        }

        // Paws and the sleeping body each have their own contact shadow.
        // Airborne poses cast a softer shadow on the floor below the jump.
        if (!cvi && grounded && sprite) {
            if (rocky.hop > 0.5) {
                ctx.save();
                ctx.translate(rocky.x, footY - D * 0.025);
                ctx.scale(D * 0.3, Math.max(1, D * 0.025));
                const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
                shadow.addColorStop(0, 'rgba(46,30,19,' + (0.23 / (1 + rocky.hop / D * 4)) + ')');
                shadow.addColorStop(1, 'rgba(46,30,19,0)');
                ctx.fillStyle = shadow; ellipse(0, 0, 1, 1); ctx.fill(); ctx.restore();
            } else {
                const shadow = (pic, opacity) => drawContactShadows(pic, rocky.x,
                    footY + D * (1 - contactBaseline(pic)), D, opacity, 0.014);
                shadow(sprite.pic, sprite.img2 ? 1 - sprite.mix : 1);
                if (sprite.img2) shadow(sprite.pic2, sprite.mix);
            }
        } else if (!cvi) {
            ellipse(rocky.x, footY, (sprite ? D * 0.36 : s * 0.6) * (1 - rocky.hop / (s * 2.5)), s * 0.07);
            ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fill();
        }
        // Wave, wag and celebrate give the pose a gentle wiggle; the other actions change pose instead.
        const wiggle = !grounded && /^(wave|wag|celebrate)$/.test(page.action) ? rocky.tilt * 0.5 : 0;
        if (sprite) {
            drawPose(sprite, rocky.x, footY - rocky.hop + (grounded ? 0 : Math.sin(time * 2.2) * s * 0.008), D, wiggle);
            if (st.live) {     // for the automated test: how far the pose picture ever reaches
                const half = D * sprite.img.width / sprite.img.height / 2;
                reach.top = Math.min(reach.top, footY - rocky.hop - D);
                reach.left = Math.min(reach.left, rocky.x - half);
                reach.right = Math.max(reach.right, rocky.x + half - w);
            }
        }
        else if (!story || !story.poses || posesMissing(story)) drawRocky(rocky.x, rocky.y - rocky.hop + Math.sin(time * 2.2) * s * 0.01, s, rocky);

        if (page.object === 'ball' && obj.bx < w + s) {
            const resting = grounded ? objectGrounding(story.objects.ball, s * 0.66, s * 0.66, footY) : null;
            if (resting) drawContactShadows(story.objects.ball, obj.bx, resting.bottom, resting.height, 1, 0.025);
            if (!drawObject(story, 'ball', obj.bx, (resting ? resting.cy : g.groundY - s * 0.3) - obj.bounce, s * 0.66, s * 0.66, obj.roll)) {
                drawBall(obj.bx, g.groundY - s * 0.28 - obj.bounce, s * 0.28);
            }
        }
        if (page.object === 'bird' && obj.visible) {
            const name = obj.flying && objPic('bird-flying') ? 'bird-flying' : 'bird';
            if (grounded && !obj.flying) {
                const resting = objectGrounding(story.objects.bird, s * 0.8, s * 0.8, footY);
                drawContactShadows(story.objects.bird, obj.bx, resting.bottom, resting.height, 1, 0.02);
            }
            if (!drawObject(story, name, obj.bx, obj.by, s * 0.8, s * 0.8, 0, obj.flip)) drawBird(obj.bx, obj.by, s * 0.25, obj.flap);
        }

        if (st.live) {
            if (page.action === 'splash' && acting && p >= 0.85 && !landed) {
                landed = true;
                if (st.onLand) st.onLand();
                splashDrops(g.objX, g.groundY, s);
            }
            if (page.action === 'sleep' && rocky.lie > 0.6 && st.state !== 'turning') {
                zTimer -= st.dt || 0;
                if (zTimer <= 0) {
                    zTimer = 1.1;
                    const zx = sprite ? rocky.x + D * 0.3 : rocky.x + s * 0.55, zy = sprite ? footY - D * 0.6 : rocky.y - s * 0.3;
                    particles.push({ type: 'z', x: zx, y: zy, vx: s * 0.25, vy: -s * 0.45, size: s * 0.3, life: 2.2, max: 2.2 });
                }
            }
            drawParticles(cvi);
        }
        return g;
    }

    // --- stills, for the cover tiles and the settings preview ------------------------

    function withContext(target, fn) {
        const saved = ctx;
        ctx = target;
        try { return fn(); } finally { ctx = saved; }
    }

    /** A page at rest, filling a small canvas. */
    function paintStill(target, w, h, page, opts) {
        opts = opts || {};
        withContext(target, function () {
            const wasCover = paintingCover;
            const savedTime = time;
            paintingCover = !!opts.cover;
            if (paintingCover) time = 0;
            ctx.save();
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            try {
                // The library's story back-reference is non-enumerable.
                const cover = opts.cover ? Object.assign({}, page, { story: page.story, backgroundFit: 'cover', ground: 0.94 }) : page;
                drawPage(w, h, cover, { state: 'idle', p: opts.acted ? 1 : 0, zoom: opts.zoom || 1.3, h: h, cover: !!opts.cover });
            } finally { ctx.restore(); paintingCover = wasCover; time = savedTime; }
        });
    }

    /**
     * A small copy of the whole story screen - the picture and the words - so
     * a caregiver sees Look and Text Size change as they are chosen.
     */
    function paintPreview(target, w, h, page) {
        withContext(target, function () {
            const cvi = S().cvi(), xl = S().is('textSize', 'xl');
            const boxH = h * (xl ? 0.34 : 0.3), pad = Math.max(4, w * 0.014);
            drawPage(w, h - boxH - pad, page, { state: 'idle', h: h, fullBleed: true });
            if (!cvi) {
                const fadeTop = h - boxH - pad * 4;
                const shade = ctx.createLinearGradient(0, fadeTop, 0, h);
                shade.addColorStop(0, 'rgba(0,0,0,0)');
                shade.addColorStop(0.3, 'rgba(0,0,0,0.66)');
                shade.addColorStop(1, 'rgba(0,0,0,0.8)');
                ctx.fillStyle = shade; ctx.fillRect(0, fadeTop, w, h - fadeTop);
            }
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            // Wrap the words onto lines, as the real story screen does, shrinking only if it must.
            const maxW = w - pad * 6;
            let size = boxH * (xl ? 0.42 : 0.34), lines;
            for (let tries = 0; tries < 8; tries++) {
                ctx.font = '800 ' + Math.round(size) + "px 'Baloo 2', system-ui, sans-serif";
                lines = [];
                page.text.split(' ').forEach(function (word) {
                    const last = lines[lines.length - 1];
                    if (last && ctx.measureText(last + ' ' + word).width <= maxW) lines[lines.length - 1] = last + ' ' + word;
                    else lines.push(word);
                });
                const widest = Math.max.apply(null, lines.map(l => ctx.measureText(l).width));
                if (lines.length * size * 1.15 <= boxH * 0.9 && widest <= maxW) break;
                size *= 0.85;
            }
            const top = h - boxH / 2 - pad * 0.5 - (lines.length - 1) * size * 0.575;
            lines.forEach(function (line, i) { ctx.fillText(line, w / 2, top + i * size * 1.15); });
            ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        });
    }

    // --- the live story screen ---------------------------------------------------------

    function resize() {
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, C.maxPixelRatio);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Resizing clears context settings. Match the cover renderer's quality
        // so large source pictures stay clear as the page scales them down.
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        stale = true;
    }

    let lastFrame = performance.now();
    let stale = false;
    function frame(now) {
        const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
        lastFrame = now;
        time += dt;
        const live = NSS.UI.current() === 'story';
        if (live) NSS.Story.tick(dt);
        // Behind a menu the story holds still, and is only drawn again when
        // something about it changes (Look, Text Size, the window's size).
        if (live || (stale && NSS.Story.active())) {
            stale = false;
            const v = NSS.Story.view();
            if (v) {
                const g = drawPage(W, NSS.UI.pictureHeight(), v.page, {
                    state: v.state, p: v.progress, live: live, dt: live ? dt : 0, h: H,
                    fullBleed: true,
                    pictureW: NSS.UI.pictureWidth(), controls: NSS.UI.pictureControls(), onLand: v.onLand
                });
                if (live) updateParticles(dt, g.s);
                // The soft fade between pages.
                if (live && v.fade > 0) {
                    ctx.fillStyle = S().cvi() ? '#000000' : '#ffffff';
                    ctx.globalAlpha = clamp(v.fade, 0, 1); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
                }
            }
        }
        requestAnimationFrame(frame);
    }

    /** A new page: no leftover effects from the last one. */
    function newPage() {
        particles = [];
        landed = false;
        zTimer = 0;
        twinkleT = 0;
    }

    /** Stars burst out of Rocky (or the middle of the cast) for "celebrate". */
    function celebrate() {
        const v = NSS.Story.view();
        if (!v) return;
        if ((v.page.cast || v.page.background) && castCenter) burstStars(castCenter);
        else burstStars(geometry(W, NSS.UI.pictureHeight(), v.page, S().cvi()));
    }

    function init(el) {
        canvas = el;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        requestAnimationFrame(frame);
    }

    return {
        init: init,
        newPage: newPage,
        celebrate: celebrate,
        preload: preload,
        /** Draw the story again behind a menu (after Look or Text Size changes). */
        refresh: function () { stale = true; },
        /** For the automated test: how each picture is doing. */
        pictures: function () { const o = {}; Object.keys(pics).forEach(k => { o[k] = pics[k].status; }); return o; },
        paintStill: paintStill,
        paintPreview: paintPreview,
        stats: function () { return { particles: particles.length, landed: landed, reach: Object.assign({}, reach) }; },
        resetReach: function () { reach = { top: Infinity, left: Infinity, right: -Infinity }; }
    };
})();
