/** Layered licensed picture books. Background and actors share one world frame. */
window.NSS = window.NSS || {};
NSS.Illustrations = (function () {
    'use strict';
    const TAU = Math.PI * 2;
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const ease = p => p * p * (3 - 2 * p);
    const backgrounds = new Map();
    let shoreCache = null;

    // Only the outermost paper edge is feathered into the surrounding wash.
    // There are no reflected images or enlarged duplicate background objects.
    function softEdges(img, mask, edge = 0.025) {
        if (!mask) return img;
        const key = img.src + '|' + mask + '|' + edge;
        if (backgrounds.has(key)) return backgrounds.get(key);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.src = img.src;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        x.globalCompositeOperation = 'destination-in';
        for (const horizontal of [true, false]) {
            const before = mask & (horizontal ? 1 : 4), after = mask & (horizontal ? 2 : 8);
            if (!before && !after) continue;
            const g = x.createLinearGradient(0, 0, horizontal ? c.width : 0, horizontal ? 0 : c.height);
            g.addColorStop(0, before ? 'transparent' : '#000'); g.addColorStop(edge, '#000');
            g.addColorStop(1 - edge, '#000'); g.addColorStop(1, after ? 'transparent' : '#000');
            x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
        }
        backgrounds.set(key, c);
        // Keep only the current/previous prepared backdrop on memory-limited tablets.
        if (backgrounds.size > 2) {
            const oldest = backgrounds.keys().next().value;
            const oldCanvas = backgrounds.get(oldest);
            backgrounds.delete(oldest); oldCanvas.width = oldCanvas.height = 1;
        }
        return c;
    }

    function safeArea(w, pictureH, st, cvi) {
        const right = st.pictureW || w;
        const margin = st.cover ? Math.max(2, right * 0.025) : Math.max(6, Math.min(20, right * 0.025));
        const controls = (st.controls || []).filter(c => c.left < right && c.right > margin);
        const reserveTop = cvi || right < pictureH * 1.25;
        const top = reserveTop && controls.length ? Math.max(...controls.map(c => c.bottom)) + margin : margin;
        return { x: margin, y: top, w: Math.max(40, right - margin * 2), h: Math.max(40, pictureH - top - margin) };
    }

    function frameFor(img, spec, area, w, pictureH) {
        const core = spec.panoramaBounds || [0.05, 0.95, 0.90];
        const iw = img ? img.width * (spec.panorama ? core[1] - core[0] : 1) : 1672, ih = img ? img.height : 941;
        const f = spec.focus;
        // Fill as much of the display as possible, while keeping this page's
        // complete action and story landmarks clear of captions and controls.
        const k = Math.min(Math.max(w / iw, pictureH / ih),
            area.w / ((f[2] - f[0]) * iw), area.h / ((f[3] - f[1]) * ih));
        const fw = iw * k, fh = ih * k;
        const desiredX = area.x + area.w / 2 - (f[0] + f[2]) / 2 * fw;
        return { x: fw >= w ? clamp(desiredX, w - fw, 0) : (w - fw) / 2,
            y: area.y + area.h / 2 - (f[1] + f[3]) / 2 * fh, w: fw, h: fh, core: core };
    }

    function drawPanorama(ctx, img, frame, w, h) {
        // The central painting and every actor retain their shared scale.
        // Only the added outer scenery and narrow quiet sky/sand bands grow.
        // Adjacent regions come from one continuous painting: no dissolves,
        // repeated scenery, reflected objects or hard rectangular paper edge.
        const core = frame.core, span = core[1] - core[0];
        const sx = [0, img.width * core[0], img.width * core[1], img.width];
        const sy = [0, img.height * 0.03, img.height * core[2], img.height];
        const dx = [Math.min(0, frame.x - frame.w * core[0] / span), frame.x,
            frame.x + frame.w, Math.max(w, frame.x + frame.w * (1 - core[0]) / span)].map(Math.round);
        const dy = [frame.y, frame.y + frame.h * 0.03,
            frame.y + frame.h * core[2], frame.y + frame.h].map(Math.round);
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++)
            ctx.drawImage(img, sx[col], sy[row], sx[col + 1] - sx[col], sy[row + 1] - sy[row],
                dx[col], dy[row], dx[col + 1] - dx[col], dy[row + 1] - dy[row]);
    }

    function textureBand(ctx, img, from, to, y, h, w) {
        if (h <= 0) return;
        const sh = img.height * (to - from), scale = Math.max(w / img.width, h / sh);
        const sw = w / scale, cropH = h / scale;
        ctx.drawImage(img, (img.width - sw) / 2, img.height * from + (sh - cropH) / 2,
            sw, cropH, 0, y, w, h);
    }

    function wash(ctx, w, h, frame, spec, img, panorama, extension) {
        if (panorama) {
            // Tall displays use real sky/sand texture, cropped with uniform
            // scale. Stretching a few edge pixels would create vertical streaks.
            const top = frame.y > 0, bottom = frame.y + frame.h < h;
            if (extension) {
                if (top) textureBand(ctx, extension, 0, 0.15, 0, frame.y + frame.h * 0.12, w);
                if (bottom) {
                    const y = Math.max(0, frame.y + frame.h * 0.86);
                    textureBand(ctx, extension, 0.86, 1, y, h - y, w);
                }
            }
            drawPanorama(ctx, softEdges(panorama, (top ? 4 : 0) | (bottom ? 8 : 0), 0.09), frame, w, h);
            return;
        }
        const colors = spec.colors.length === 3 ? spec.colors : ['#c4eaf8', '#f6eac8', '#fff0cd'];
        ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.h);
        g.addColorStop(0, colors[0]); g.addColorStop(0.52, colors[1]); g.addColorStop(1, colors[2]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        if (img) {
            // An edge at or beyond the viewport is already seamless; fading it
            // would introduce an unwanted pale stripe down the screen.
            const mask = (frame.x > 1 ? 1 : 0) | (frame.x + frame.w < w - 1 ? 2 : 0) |
                (frame.y > 1 ? 4 : 0) | (frame.y + frame.h < h - 1 ? 8 : 0);
            ctx.drawImage(softEdges(img, mask, panorama ? 0.075 : 0.025), frame.x, frame.y, frame.w, frame.h);
        }
    }

    function shadow(ctx, x, bottom, width) {
        ctx.save(); ctx.translate(x, bottom); ctx.scale(1, 0.10);
        const local = ctx.createRadialGradient(0, 0, 0, 0, 0, width);
        local.addColorStop(0, 'rgba(95,67,34,0.27)'); local.addColorStop(1, 'rgba(95,67,34,0)');
        ctx.fillStyle = local; ctx.beginPath(); ctx.arc(0, 0, width, 0, TAU); ctx.fill(); ctx.restore();
    }

    function cue(ctx, x, y, d, time, cvi) {
        const radius = d * 0.64;
        const g = ctx.createRadialGradient(x, y, d * 0.1, x, y, radius);
        g.addColorStop(0, cvi ? 'rgba(255,230,60,0.19)' : 'rgba(255,255,220,0.48)');
        g.addColorStop(1, 'rgba(255,245,150,0)');
        ctx.save(); ctx.globalAlpha = 0.8 + 0.15 * Math.sin(time * 2);
        ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
    }

    function poseObject(layer, p, cvi) {
        const frames = cvi && layer.cviPoses.length ? layer.cviPoses : layer.poses;
        let object = layer.object;
        for (const frame of frames) {
            if (p < frame.at) break;
            object = frame.object;
        }
        return object;
    }

    function drawShoreline(ctx, img, spec, frame, p, w, h) {
        if (!img || spec.mask.length < 3) return;
        const key = img.src + JSON.stringify(spec.mask);
        if (!shoreCache || shoreCache.key !== key) {
            const mask = document.createElement('canvas'), painted = document.createElement('canvas');
            const source = document.createElement('canvas');
            mask.width = painted.width = source.width = img.width;
            mask.height = painted.height = source.height = img.height;
            const m = mask.getContext('2d');
            m.filter = 'blur(' + img.height * 0.009 + 'px)'; m.fillStyle = '#fff';
            m.beginPath(); spec.mask.forEach((point, i) => {
                m[i ? 'lineTo' : 'moveTo'](point[0] * img.width, point[1] * img.height);
            }); m.closePath(); m.fill();
            m.filter = 'none'; m.globalCompositeOperation = 'destination-in';
            const floorFade = m.createLinearGradient(0, img.height * 0.91, 0, img.height);
            floorFade.addColorStop(0, '#fff'); floorFade.addColorStop(1, 'transparent');
            m.fillStyle = floorFade; m.fillRect(0, 0, img.width, img.height);
            const clean = source.getContext('2d'); clean.drawImage(img, 0, 0);
            clean.globalCompositeOperation = 'destination-in'; clean.drawImage(mask, 0, 0);
            painted.src = img.src + '#water';
            shoreCache = { key, image: painted, mask: mask, source: source };
        }
        const c = shoreCache.image.getContext('2d');
        c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, img.width, img.height);
        // Remove land objects before moving the water, then mask the destination
        // as well. A crab or castle must never travel into the water from shore.
        c.drawImage(shoreCache.source, -img.width * 0.12 * (1 - ease(p)), 0);
        c.globalCompositeOperation = 'destination-in'; c.drawImage(shoreCache.mask, 0, 0);
        ctx.save(); ctx.globalAlpha = Math.min(1, p / 0.12);
        drawPanorama(ctx, shoreCache.image, frame, w, h);
        ctx.restore();
    }

    function waterAround(ctx, frame, p) {
        if (p <= 0 || p >= 1) return;
        const point = (points, t) => {
            const q = 1 - t;
            return [0, 1].map(axis => q * q * q * points[0][axis] +
                3 * q * q * t * points[1][axis] + 3 * q * t * t * points[2][axis] +
                t * t * t * points[3][axis]);
        };
        // The incoming water divides at the left wall, travels around BOTH
        // sides of the dry island, and rejoins to its right. These paths share
        // the painting's coordinates, so they stay aligned on every display.
        const routes = [
            [[0.07, 0.59], [0.08, 0.29], [0.85, 0.27], [0.96, 0.69]],
            [[0.07, 0.59], [0.08, 0.94], [0.81, 0.97], [0.96, 0.69]]
        ];
        ctx.save(); ctx.translate(frame.x, frame.y);
        ctx.scale(frame.w, frame.h);
        // Trace the actual outer sand wall, including the front apron. The
        // old ellipse cut through that apron and let water appear underneath.
        ctx.beginPath(); ctx.rect(-1, -1, 3, 3);
        ctx.moveTo(0.15, 0.68);
        ctx.bezierCurveTo(0.14, 0.47, 0.22, 0.41, 0.46, 0.405);
        ctx.bezierCurveTo(0.73, 0.40, 0.91, 0.44, 0.915, 0.69);
        ctx.bezierCurveTo(0.91, 0.79, 0.73, 0.835, 0.54, 0.835);
        ctx.bezierCurveTo(0.34, 0.835, 0.20, 0.78, 0.15, 0.68);
        ctx.closePath(); ctx.clip('evenodd');
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const route of routes) for (let wave = 0; wave < 3; wave++) {
            const head = (p - wave * 0.11) / 0.76;
            if (head <= 0 || head >= 1.18) continue;
            const start = Math.max(0, head - 0.24), end = Math.min(1, head);
            if (start >= end) continue;
            const alpha = Math.min(1, head / 0.10, (1.18 - head) / 0.20, (1 - p) / 0.08);
            // Fill each scalloped ribbon once. Overlapping little strokes made
            // seams like a segmented belt, instead of a continuous wash of sea.
            const bank = [];
            for (let i = 0; i <= 64; i++) {
                const t = start + (end - start) * i / 64;
                const at = point(route, t), next = point(route, Math.min(1, t + 0.001));
                const dx = (next[0] - at[0]) * frame.w, dy = (next[1] - at[1]) * frame.h;
                const length = Math.hypot(dx, dy) || 1;
                const taper = Math.pow(Math.sin(Math.PI * i / 64), 0.65);
                const scallop = 1 + Math.sin(t * 116 + wave) * 0.19 + Math.sin(t * 251) * 0.08;
                bank.push({ x: at[0], y: at[1], nx: -dy / length * frame.h / frame.w,
                    ny: dx / length, width: 0.022 * taper * scallop });
            }
            const ribbon = (inner, outer, color, opacity) => {
                ctx.beginPath();
                bank.forEach((b, i) => ctx[i ? 'lineTo' : 'moveTo'](
                    b.x + b.nx * b.width * inner, b.y + b.ny * b.width * inner));
                for (let i = bank.length - 1; i >= 0; i--) {
                    const b = bank[i];
                    ctx.lineTo(b.x + b.nx * b.width * outer, b.y + b.ny * b.width * outer);
                }
                ctx.closePath(); ctx.fillStyle = color; ctx.globalAlpha = alpha * opacity; ctx.fill();
            };
            ribbon(-1, 1, '#61c6d6', 0.32);
            ribbon(-0.78, 0.65, '#b7e7e5', 0.50);
            ribbon(-1, -0.64, '#fffefa', 0.88);
            ribbon(0.28, 0.46, '#e9faf6', 0.55);
        }
        ctx.restore();
    }

    function sandFromShovel(ctx, x, bottom, d, p) {
        const t = p < 0.64 ? (p - 0.38) / 0.26 : (p - 0.85) / 0.15;
        if (t < 0 || t > 1) return;
        ctx.save(); ctx.fillStyle = '#d7ad59';
        for (let i = 0; i < 7; i++) {
            const fall = clamp(t * 1.8 - i * 0.10, 0, 1);
            ctx.globalAlpha = Math.sin(Math.PI * fall);
            ctx.beginPath(); ctx.ellipse(x + d * (0.35 + fall * 0.06 + i * 0.007),
                bottom - d * 0.39 * (1 - fall * fall), d * 0.008, d * 0.006, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    function draw(ctx, imageFor, w, pictureH, page, st, time) {
        const spec = page.illustration, cvi = NSS.Settings.cvi();
        const area = safeArea(w, pictureH, st, cvi || spec.cover), fullH = st.h || pictureH;
        const background = page.background && imageFor(page.background);
        const panorama = !cvi && spec.panorama && imageFor(page.story.objects[spec.panorama]);
        const frame = frameFor(panorama || background, spec, area, st.pictureW || w, pictureH);
        const coreSpan = frame.core[1] - frame.core[0];
        const actionFrame = panorama ? { x: frame.x + frame.w * (11 / 54 - frame.core[0]) / coreSpan,
            y: frame.y, w: frame.w * 32 / 54 / coreSpan, h: frame.h } : frame;
        const p = clamp(Number(st.p) || 0, 0, 1), active = st.state === 'acting';
        const action = page.action, u = ease(p);
        const main = (cvi && spec.layers.find(l => l.cviActive)) || spec.layers.find(l => l.active) || spec.layers[0];
        ctx.save();
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        if (cvi) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, fullH); }
        else wash(ctx, w, fullH, frame, spec, background, panorama,
            spec.extension && imageFor(page.story.objects[spec.extension]));
        ctx.beginPath(); ctx.rect(0, 0, w, pictureH); ctx.clip();

        if (!cvi && spec.shoreline) {
            drawShoreline(ctx, imageFor(page.story.objects[spec.shoreline.object]), spec.shoreline, frame, p, w, fullH);
            if (st.state === 'waiting') cue(ctx, actionFrame.x + actionFrame.w * 0.29,
                frame.y + frame.h * 0.49, frame.h * 0.55, time, false);
        }

        if (!cvi && action === 'protect' && p > 0)
            waterAround(ctx, actionFrame, p);
        let mainD = 100;
        const layers = cvi ? [main] : spec.layers.filter(layer => !layer.contrastOnly);
        layers.forEach(layer => {
            const img = imageFor(page.story.objects[poseObject(layer, p, cvi)]) || imageFor(page.story.objects[layer.object]);
            if (!img) return;
            const ratio = img.width / img.height;
            let d, x, bottom;
            if (st.cover) {
                // A static library tile needs no spare space for travel.
                d = Math.min(area.h, area.w / ratio) * 0.98;
                x = area.x + area.w / 2; bottom = area.y + area.h / 2 + d * 0.46;
            } else if (cvi) {
                // Fit the WHOLE motion first, then make Regular/Large distinct.
                const fit = Math.min(area.h / (layer.motion === 'hop' ? 1.40 : 1.20),
                    area.w / (ratio + (layer.motion === 'fly' ? 0.65 : 0.30)));
                d = fit * (NSS.Settings.is('characterSize', 'large') ? 0.94 : 0.56);
                x = area.x + area.w / 2; bottom = area.y + area.h / 2 + d * 0.46;
                // Center the full jump, including its upward travel, so a
                // large crab stays below Pause even on the smallest screens.
                if (layer.motion === 'hop') bottom += d * 0.15;
            } else {
                d = frame.h * layer.height;
                x = frame.x + frame.w * layer.x;
                bottom = frame.y + frame.h * layer.bottom;
            }
            const isMain = layer === main;
            const landingBottom = bottom;
            let rotation = 0;
            if (layer.motion === 'hop') {
                bottom -= Math.abs(Math.sin(p * Math.PI * 2)) * d * 0.30;
            } else if (layer.motion === 'fly') {
                x += cvi ? (u - 0.5) * d * 0.58 : frame.w * layer.travel * u;
                bottom -= Math.sin(p * Math.PI) * d * 0.12;
            } else if (layer.motion === 'sunset') {
                bottom += cvi ? d * (u - 0.5) * 0.16 : frame.h * layer.drop * u;
            }
            if (isMain) {
                mainD = d;
                if (action === 'drive' && !st.cover) {
                    x += cvi ? (u - 0.5) * d * 0.20 : frame.w * layer.travel * u;
                    bottom += cvi ? 0 : frame.h * layer.drop * u;
                } else if (action === 'swim') {
                    const landing = ease(clamp(p / 0.45, 0, 1));
                    bottom += cvi ? d * (landing - 0.5) * 0.12 : frame.h * layer.drop * landing;
                    if (p < 0.45) rotation = -0.08 * Math.sin(p / 0.45 * Math.PI);
                } else if (action === 'tide') {
                    x += cvi ? (u - 0.5) * d * 0.18 : frame.w * layer.travel * u;
                } else if (action === 'sunset' && !layer.motion) {
                    bottom += cvi ? d * (u - 0.5) * 0.16 : frame.h * layer.drop * u;
                }
                if (st.state === 'waiting') cue(ctx, x, bottom - d * 0.48, d, time, cvi);
            }
            if (!cvi && layer.grounded) {
                const contacts = page.story.objects[layer.object].contacts;
                if (contacts.length) contacts.forEach(c => shadow(ctx,
                    x + (c[0] - 0.5) * d * ratio, bottom + (c[1] - layer.foot) * d, c[2] * d * ratio));
                else shadow(ctx, x, bottom, d * 0.24);
            }
            ctx.save();
            if (!cvi && layer.motion === 'sunset') {
                ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.w, frame.h * 0.40); ctx.clip();
            }
            ctx.translate(x, bottom); ctx.rotate(rotation);
            ctx.drawImage(img, -d * ratio / 2, -d * (cvi ? 0.96 : layer.foot), d * ratio, d);
            ctx.restore();
            if (!cvi && layer.motion === 'hop' && p > 0) {
                const landing = Math.max(0, 1 - Math.abs(Math.sin(p * Math.PI * 2)) * 4);
                ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,' + (0.3 + landing * 0.6) + ')';
                ctx.lineWidth = Math.max(1, d * 0.014); ctx.beginPath();
                ctx.ellipse(x, landingBottom, d * (0.38 + landing * 0.14), d * 0.065, 0, 0, TAU);
                ctx.stroke(); ctx.restore();
            }
            if (isMain && active && action === 'dig') sandFromShovel(ctx, x, bottom, d, p);
        });
        ctx.restore();
        return { s: mainD / 300 };
    }

    return { draw: draw };
})();
