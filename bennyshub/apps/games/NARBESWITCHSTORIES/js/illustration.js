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

    let spreadWash = null;
    // Continue the edge colours as a soft painted wash. Enlarging narrow image
    // strips stretches trees, stars and furniture into conspicuous streaks.
    // Only this colour field extends; the complete illustration stays uniform.
    function landscapeWash(ctx, img, frame, w, h) {
        const key = [img.src, frame.x, frame.y, frame.w, frame.h, w, h].join('|');
        if (!spreadWash || spreadWash.key !== key) {
            const sample = document.createElement('canvas'); sample.width = sample.height = 6;
            const sx = sample.getContext('2d', { willReadFrequently: true });
            sx.drawImage(img, 0, 0, 6, 6);
            const pixels = sx.getImageData(0, 0, 6, 6).data;
            const wash = document.createElement('canvas'); wash.width = wash.height = 48;
            const wx = wash.getContext('2d'), data = wx.createImageData(48, 48);
            for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
                const u = clamp(((x + 0.5) * w / 48 - frame.x) / frame.w * 6 - 0.5, 0, 5);
                const v = clamp(((y + 0.5) * h / 48 - frame.y) / frame.h * 6 - 0.5, 0, 5);
                const left = Math.floor(u), top = Math.floor(v), fx = u - left, fy = v - top;
                for (let c = 0; c < 3; c++) {
                    const color = (a, b) => pixels[(Math.min(5, b) * 6 + Math.min(5, a)) * 4 + c];
                    data.data[(y * 48 + x) * 4 + c] =
                        (color(left, top) * (1 - fx) + color(left + 1, top) * fx) * (1 - fy) +
                        (color(left, top + 1) * (1 - fx) + color(left + 1, top + 1) * fx) * fy;
                }
                data.data[(y * 48 + x) * 4 + 3] = 255;
            }
            wx.putImageData(data, 0, 0);
            if (spreadWash) spreadWash.canvas.width = spreadWash.canvas.height = 1;
            spreadWash = { key: key, canvas: wash };
        }
        ctx.drawImage(spreadWash.canvas, 0, 0, w, h);
    }

    // Short, subject-specific actions over a panorama, or one isolated subject
    // on black. Effects use source-image coordinates so they follow resizing.
    const effectPatches = new Map();
    function patch(img, bounds, blur) {
        const key = [img.src, bounds.join(','), blur].join('|');
        if (effectPatches.has(key)) return effectPatches.get(key);
        const [l, t, r, b] = bounds;
        const c = document.createElement('canvas');
        c.width = Math.ceil((r - l) * img.width); c.height = Math.ceil((b - t) * img.height);
        const x = c.getContext('2d');
        // Draw the surrounding source too, so a blur never pulls in transparent
        // black at the crop boundary. Feather only this patch's outside edge.
        x.filter = blur ? 'blur(' + blur + 'px)' : 'none';
        x.drawImage(img, -l * img.width, -t * img.height);
        x.filter = 'none'; x.globalCompositeOperation = 'destination-in';
        for (const horizontal of [true, false]) {
            const g = x.createLinearGradient(0, 0, horizontal ? c.width : 0, horizontal ? 0 : c.height);
            g.addColorStop(0, 'transparent'); g.addColorStop(0.08, '#000');
            g.addColorStop(0.92, '#000'); g.addColorStop(1, 'transparent');
            x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
        }
        c.src = img.src;
        effectPatches.set(key, c);
        if (effectPatches.size > 6) {
            const oldest = effectPatches.keys().next().value;
            const old = effectPatches.get(oldest);
            effectPatches.delete(oldest); old.width = old.height = 1;
        }
        return c;
    }

    function region(frame, bounds) {
        return { x: frame.x + bounds[0] * frame.w, y: frame.y + bounds[1] * frame.h,
            w: (bounds[2] - bounds[0]) * frame.w, h: (bounds[3] - bounds[1]) * frame.h };
    }

    function drawPatch(ctx, img, bounds, frame, blur, alpha) {
        if (!img || alpha <= 0) return;
        const r = region(frame, bounds);
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.drawImage(patch(img, bounds, blur), r.x, r.y, r.w, r.h); ctx.restore();
    }

    function blinkAmount(p) {
        return ease(clamp((p - 0.15) / 0.10, 0, 1)) * (1 - ease(clamp((p - 0.56) / 0.12, 0, 1)));
    }

    // Three simple stars, with slow independent brightening rather than flashing.
    function stars(ctx, positions, radius, p, always) {
        positions.forEach(([x, y], i) => {
            const glow = p > 0 && p < 1 ? Math.pow(Math.sin(p * Math.PI), 2) *
                (0.5 + 0.5 * Math.sin(p * TAU - i)) : 0;
            if (!always && !glow) return;
            ctx.save(); ctx.translate(x, y);
            ctx.globalAlpha = always ? 0.72 + glow * 0.28 : glow * 0.8;
            ctx.shadowColor = '#fff4ae'; ctx.shadowBlur = radius * glow * 1.3;
            ctx.fillStyle = '#ffeb87'; ctx.beginPath();
            for (let k = 0; k < 10; k++) {
                const a = -Math.PI / 2 + k * Math.PI / 5, d = radius * (k % 2 ? 0.43 : 1) * (1 + glow * 0.24);
                ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d);
            }
            ctx.closePath(); ctx.fill(); ctx.restore();
        });
    }

    function shine(ctx, r, p) {
        if (p <= 0 || p >= 1) return;
        const strength = ease(clamp(p / 0.25, 0, 1)) * (1 - ease(clamp((p - 0.7) / 0.3, 0, 1)));
        const cx = r.x + r.w * 0.55, cy = r.y + r.h * 0.42, radius = Math.max(r.w, r.h) * 0.9;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, 'rgba(255,253,207,0.72)');
        g.addColorStop(0.5, 'rgba(255,239,141,0.3)'); g.addColorStop(1, 'rgba(255,239,141,0)');
        ctx.save(); ctx.globalAlpha = strength; ctx.fillStyle = g;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2); ctx.restore();
    }

    function sighAmounts(p) {
        return [ease(clamp((p - 0.08) / 0.12, 0, 1)) * (1 - ease(clamp((p - 0.40) / 0.12, 0, 1))),
            ease(clamp((p - 0.46) / 0.12, 0, 1)) * (1 - ease(clamp((p - 0.76) / 0.16, 0, 1)))];
    }

    // Slowly brighten existing stars, with no motion of the child underneath.
    function nightStars(ctx, positions, radius, p, paintStars) {
        const envelope = ease(clamp(p / 0.14, 0, 1)) * (1 - ease(clamp((p - 0.86) / 0.14, 0, 1)));
        positions.forEach(([x, y], i) => {
            const glow = envelope * (0.32 + 0.68 * (0.5 - 0.5 * Math.cos(p * TAU * 1.6 - i * 1.4)));
            ctx.save(); ctx.translate(x, y);
            if (glow > 0) {
                const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 3.5);
                halo.addColorStop(0, 'rgba(255,249,211,0.9)');
                halo.addColorStop(0.24, 'rgba(255,226,120,0.55)'); halo.addColorStop(1, 'rgba(255,226,120,0)');
                ctx.globalAlpha = glow; ctx.fillStyle = halo;
                ctx.beginPath(); ctx.arc(0, 0, radius * 3.5, 0, TAU); ctx.fill();
            }
            if (paintStars) {
                ctx.globalAlpha = 0.78 + glow * 0.22; ctx.fillStyle = '#ffed9a'; ctx.beginPath();
                for (let k = 0; k < 10; k++) {
                    const a = -Math.PI / 2 + k * Math.PI / 5, d = radius * (k % 2 ? 0.43 : 1) * (1 + glow * 0.18);
                    ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d);
                }
                ctx.closePath(); ctx.fill();
            } else if (glow > 0) {
                ctx.globalAlpha = glow * 0.85; ctx.fillStyle = '#fffbe3'; ctx.beginPath();
                ctx.moveTo(0, -radius); ctx.quadraticCurveTo(radius * 0.12, -radius * 0.12, radius, 0);
                ctx.quadraticCurveTo(radius * 0.12, radius * 0.12, 0, radius);
                ctx.quadraticCurveTo(-radius * 0.12, radius * 0.12, -radius, 0);
                ctx.quadraticCurveTo(-radius * 0.12, -radius * 0.12, 0, -radius); ctx.fill();
            }
            ctx.restore();
        });
    }

    function chair(ctx, img, r, p) {
        const h = Math.min(r.h, r.w * img.height / img.width), w = h * img.width / img.height;
        const x = r.x + (r.w - w) / 2, bottom = r.y + r.h;
        const angle = Math.sin(p * TAU * 2) * 0.27 * (1 - p);
        // Pivot at the lowest front leg, so it never floats while rocking.
        ctx.save(); ctx.translate(x + w * 0.54, bottom - h * 0.02); ctx.rotate(angle);
        ctx.drawImage(img, -w * 0.54, -h * 0.98, w, h); ctx.restore();
    }

    function fitRect(img, r) {
        const k = Math.min(r.w / img.width, r.h / img.height);
        return { x: r.x + (r.w - img.width * k) / 2, y: r.y + (r.h - img.height * k) / 2,
            w: img.width * k, h: img.height * k };
    }

    // Blend registered poses on transparency, not against the scene. Additive
    // premultiplied alpha avoids a dark dip or leftover old silhouette.
    let poseCanvas = null;
    function mixPose(ctx, a, b, r, amount) {
        if (!a) return;
        if (!b || amount <= 0) { ctx.drawImage(a, r.x, r.y, r.w, r.h); return; }
        if (amount >= 1) { ctx.drawImage(b, r.x, r.y, r.w, r.h); return; }
        if (!poseCanvas) poseCanvas = document.createElement('canvas');
        if (poseCanvas.width !== a.width || poseCanvas.height !== a.height) {
            poseCanvas.width = a.width; poseCanvas.height = a.height;
        }
        const c = poseCanvas.getContext('2d'); c.clearRect(0, 0, a.width, a.height);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1 - amount;
        c.drawImage(a, 0, 0, a.width, a.height);
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = amount;
        c.drawImage(b, 0, 0, a.width, a.height);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        poseCanvas.src = a.src;
        ctx.drawImage(poseCanvas, r.x, r.y, r.w, r.h);
    }

    function sequence(images, p) {
        const list = images.filter(Boolean);
        if (list.length < 2) return [list[0], null, 0];
        for (let i = 1; i < list.length; i++) {
            const start = 0.20 + (i - 1) * 0.30;
            if (p < start + 0.12) return [list[i - 1], list[i], ease(clamp((p - start) / 0.12, 0, 1))];
        }
        return [list.at(-1), null, 0];
    }

    function warmHalo(ctx, r, p) {
        if (p <= 0) return;
        const radius = Math.max(r.w, r.h) * 0.72, x = r.x + r.w / 2, y = r.y + r.h * 0.48;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, 'rgba(255,208,108,0.04)');
        g.addColorStop(0.5, 'rgba(255,208,108,0.10)');
        g.addColorStop(0.7, 'rgba(255,194,78,0.32)'); g.addColorStop(1, 'rgba(255,194,78,0)');
        ctx.save(); ctx.globalAlpha = ease(clamp(p / 0.3, 0, 1)); ctx.fillStyle = g;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
    }

    function traceBook(ctx, book, hand, box, p) {
        const r = fitRect(book, { ...box, h: box.h / 1.14 });
        ctx.drawImage(book, r.x, r.y, r.w, r.h);
        if (!hand) return;
        const u = ease(clamp(p / 0.9, 0, 1)), h = r.h * 0.48, w = h * hand.width / hand.height;
        const x = r.x + r.w * (0.08 + u * 0.24), y = r.y + r.h * 0.62;
        // The book remains still; only the touching hand travels along the dots.
        ctx.save(); ctx.translate(x + w * 0.2, y + h * 0.15);
        ctx.rotate(Math.sin(p * Math.PI) * 0.025);
        ctx.drawImage(hand, -w * 0.2, -h * 0.15, w, h); ctx.restore();
    }

    function footprint(ctx, x, y, size, side, heading, cvi, alpha) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(heading + side * 0.10);
        ctx.globalAlpha = alpha; ctx.fillStyle = cvi ? '#e4bf84' : 'rgba(137,91,43,0.48)';
        ctx.beginPath(); ctx.ellipse(0, 0, size * 0.28, size * 0.48, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 5; i++) {
            ctx.beginPath(); ctx.ellipse((i - 2) * size * 0.12, -size * (0.53 - Math.abs(i - 2) * 0.035),
                size * (0.095 - i * 0.009), size * (0.11 - i * 0.01), 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    function walkImages(page, imageFor) {
        const spec = page.spreadAction;
        if (!spec.rig) return [];
        // Outline the assembled character, not every joint separately.
        return [spec.object, spec.rig.leg]
            .map(name => imageFor({ ...page.story.objects[name], background: true }));
    }

    function continuousLeg(ctx, img, pose) {
        const art = NSS.BeachWalk.art, w = img.width;
        const rows = [...new Set([0, ...Array.from({length:33}, (_,i)=>img.height*i/32),
            art.hipY, (art.hipY+art.ankleY)/2, art.ankleY])].sort((a,b)=>a-b);
        function triangle(points, matrix, y0, y1) {
            const cx = points.reduce((s,p)=>s+p.x,0)/3, cy = points.reduce((s,p)=>s+p.y,0)/3;
            ctx.save(); ctx.beginPath();
            points.forEach((p,i)=>{
                const dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy),x=p.x+dx/d*0.0007,y=p.y+dy/d*0.0007;
                ctx[i?'lineTo':'moveTo'](x,y);
            });
            ctx.closePath();ctx.clip();ctx.transform(...matrix);
            const top=Math.max(0,y0-2),bottom=Math.min(img.height,y1+2);
            ctx.drawImage(img,0,top,w,bottom-top,0,top,w,bottom-top);ctx.restore();
        }
        for(let i=1;i<rows.length;i++) {
            const y0=rows[i-1],y1=rows[i],dy=y1-y0;
            const tl=NSS.BeachWalk.point(pose,0,y0),tr=NSS.BeachWalk.point(pose,w,y0),
                bl=NSS.BeachWalk.point(pose,0,y1),br=NSS.BeachWalk.point(pose,w,y1);
            let a=(tr.x-tl.x)/w,b=(tr.y-tl.y)/w,c=(br.x-tr.x)/dy,d=(br.y-tr.y)/dy;
            triangle([tl,tr,br],[a,b,c,d,tl.x-c*y0,tl.y-d*y0],y0,y1);
            a=(br.x-bl.x)/w;b=(br.y-bl.y)/w;c=(bl.x-tl.x)/dy;d=(bl.y-tl.y)/dy;
            triangle([tl,br,bl],[a,b,c,d,tl.x-c*y0,tl.y-d*y0],y0,y1);
        }
    }

    let walkCanvas, walkClean, walkOutlined, walkKey;
    function walkingCutout(images, pose, p, distance, cvi) {
        if (images.some(img => !img)) return null;
        const color = cvi && !NSS.Settings.is('outline', 'off') ? (NSS.Settings.option('outline').color || '#ffe630') : null;
        const key = images[0].src + '|' + p + '|' + distance + '|' + color;
        if (key === walkKey) return color ? walkOutlined : walkClean;
        if (!walkCanvas) {
            [walkCanvas, walkClean, walkOutlined] = Array.from({ length: 3 }, () => {
                const c = document.createElement('canvas'); c.width = 960; c.height = 1200; return c;
            });
        }
        const c = walkCanvas.getContext('2d'), [body, leg] = images;
        c.clearRect(0, 0, 960, 1200); c.save(); c.scale(1200, 1200); c.translate(0.4 - pose.bodyX, 0);
        pose.legs.forEach((a, i) => {
            c.save(); if (!i) c.filter = 'brightness(0.92)';
            continuousLeg(c,leg,a); c.restore();
        });
        const bodyH = 0.755, bodyW = bodyH * body.width / body.height;
        c.drawImage(body, pose.bodyX - bodyW * 0.48, pose.hipY - 0.625, bodyW, bodyH); c.restore();
        const clean = walkClean.getContext('2d'); clean.clearRect(0, 0, 960, 1200);
        clean.filter = 'url(#nss-cvi-silhouette)'; clean.drawImage(walkCanvas, 0, 0); clean.filter = 'none';
        if (color) {
            const ring = walkOutlined.getContext('2d'); ring.clearRect(0, 0, 960, 1200);
            for (let i = 0; i < 16; i++) ring.drawImage(walkClean, Math.cos(i * TAU / 16) * 8, Math.sin(i * TAU / 16) * 8);
            ring.globalCompositeOperation = 'source-in'; ring.fillStyle = color; ring.fillRect(0, 0, 960, 1200);
            ring.globalCompositeOperation = 'source-over'; ring.drawImage(walkClean, 0, 0);
        }
        walkClean.src = walkOutlined.src = body.src; walkKey = key;
        return color ? walkOutlined : walkClean;
    }

    function walkBeach(ctx, images, r, p, travel, cvi) {
        const pose = NSS.BeachWalk.pose(p, travel / r.h), cx = r.x + r.w / 2;
        pose.prints.forEach(a => footprint(ctx, cx + (a.x - 0.035) * r.h, r.y + a.y * r.h,
            r.h * 0.085, a.leg ? 1 : -1, -Math.PI / 2, cvi, 1));
        if (!cvi) {
            ctx.save(); ctx.fillStyle = 'rgba(42,58,115,0.19)'; ctx.beginPath();
            ctx.ellipse(cx + pose.bodyX * r.h, r.y + r.h * 0.968, r.h * 0.14, r.h * 0.014, 0, 0, TAU); ctx.fill(); ctx.restore();
        }
        const sprite = walkingCutout(images, pose, p, travel / r.h, cvi);
        if (sprite) ctx.drawImage(sprite, r.x + pose.bodyX * r.h, r.y, r.w, r.h);
    }

    // Floating notes remain a visible sound cue when sound is switched off.
    function musicNotes(ctx, x, y, size, p, cvi) {
        for (let i = 0; i < 3; i++) {
            const t = (p - i * 0.13) / 0.74;
            if (t <= 0 || t >= 1) continue;
            ctx.save(); ctx.translate(x + (i - 1) * size * 1.6 + Math.sin(t * Math.PI) * size * 0.5,
                y - t * size * 1.6); ctx.rotate(Math.sin(t * Math.PI * 1.5 + i) * 0.12);
            ctx.globalAlpha = ease(clamp(t / 0.12, 0, 1)) * (1 - ease(clamp((t - 0.78) / 0.22, 0, 1)));
            ctx.fillStyle = '#fff'; ctx.strokeStyle = '#17394d';
            ctx.lineWidth = size * 0.14; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.ellipse(-size * 0.12, 0, size * 0.28, size * 0.19, -0.3, 0, TAU); ctx.stroke(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(size * 0.10, 0); ctx.lineTo(size * 0.10, -size * 0.85);
            ctx.lineTo(size * 0.24, -size * 0.85); ctx.lineTo(size * 0.24, -size * 0.75);
            ctx.bezierCurveTo(size * 0.60, -size * 0.55, size * 0.60, -size * 0.35, size * 0.40, -size * 0.22);
            ctx.bezierCurveTo(size * 0.48, -size * 0.44, size * 0.35, -size * 0.48, size * 0.24, -size * 0.51);
            ctx.lineTo(size * 0.24, 0); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
        }
    }

    function drawSimpleSpread(ctx, imageFor, w, pictureH, page, st) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, st.h || pictureH);
        const spec = page.spreadAction, img = imageFor(page.story.objects[spec.object]);
        if (!img) return { s: 1 };
        const area = safeArea(w, pictureH, st, true), ratio = page.action === 'beachwalk' ? 0.8 : img.width / img.height;
        const starRoom = page.action === 'blink' || page.action === 'canedip' ? 0.24 : page.action === 'stargaze' ? 0.32 : page.action === 'proudjump' ? 0.22 : 0;
        const motionRoom = page.action === 'rock' ? 0.38 : page.action === 'beachwalk' ? 0.98 : page.action === 'canesweep' ? 0.55 : page.action === 'sandsift' ? 0.30 : page.action === 'canedip' ? 0.18 : page.action === 'oceanlisten' ? 0.44 : 0.06;
        const fit = Math.min(area.h / (1.06 + starRoom), area.w / (ratio + motionRoom));
        const h = fit * (st.cover ? 0.94 : NSS.Settings.is('characterSize', 'large') ? 0.94 : 0.55);
        const r = { x: area.x + (area.w - h * ratio) / 2,
            y: area.y + (area.h - h * (1 + starRoom)) / 2 + h * starRoom, w: h * ratio, h: h };
        const p = st.cover ? 0 : st.p || 0;
        const poses = [img, ...spec.poses.map(name => imageFor(page.story.objects[name]))];
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.beginPath(); ctx.rect(0, 0, w, pictureH); ctx.clip();
        if (NSS.SensoryActions.handles(page.action)) NSS.SensoryActions.simple(ctx,imageFor,page,img,r,p);
        else if (NSS.FinalActions.handles(page.action)) NSS.FinalActions.simple(ctx,imageFor,page,img,r,p);
        else if (page.action === 'trace') traceBook(ctx, img, imageFor(page.story.objects[spec.detailObject]), r, p);
        else if (page.action === 'sigh') {
            const [open, exhale] = sighAmounts(p), lift = Math.sin(Math.PI * clamp(p / 0.76, 0, 1)) * 0.012;
            const anchor = r.y + r.h * 0.95;
            ctx.save(); ctx.translate(0, anchor); ctx.scale(1, 1 + lift); ctx.translate(0, -anchor);
            ctx.drawImage(img, r.x, r.y, r.w, r.h);
            drawPatch(ctx, poses[1], [0.42, 0.14, 0.65, 0.33], r, 0, open);
            drawPatch(ctx, poses[2], [0.42, 0.14, 0.65, 0.33], r, 0, exhale); ctx.restore();
        }
        else if (page.action === 'sharewarmth' || page.action === 'sunglasses') {
            if (page.action === 'sharewarmth') warmHalo(ctx, r, p);
            const [a,b,t] = sequence(poses,p); mixPose(ctx,a,b,r,t);
        } else if (page.action === 'beachwalk') walkBeach(ctx, walkImages(page, imageFor), { ...r, x: r.x + h * 0.45 }, p, -h * 0.90, true);
        else if (page.action === 'oceanlisten') {
            NSS.OceanListen.draw(ctx,img,poses[1],r,p);
        }
        else if (page.action === 'surf') {
            const wave = { x: r.x + r.w * 0.075, y: r.y + r.h * 0.15 - Math.sin(p * Math.PI) * r.h * 0.035, w: r.w * 0.85, h: r.h * 0.85 };
            mixPose(ctx, img, poses[1], wave, Math.pow(Math.sin(p * Math.PI),2));
            musicNotes(ctx, r.x + r.w * 0.58, r.y + r.h * 0.25, Math.max(12, Math.min(34, r.h * 0.09)), p, true);
        } else if (page.action === 'rock') chair(ctx, img, r, p);
        else ctx.drawImage(img, r.x, r.y, r.w, r.h);
        if (page.action === 'blink') {
            // Overlay only the glasses interior; the hair/outline never jumps
            // or doubles when the closed-eye frame comes in.
            const closed = imageFor(page.story.objects[spec.closedObject]);
            drawPatch(ctx, closed, [0.29, 0.24, 0.74, 0.45], r, 0, blinkAmount(p));
            stars(ctx, [[r.x + r.w * 0.22, r.y - h * 0.08], [r.x + r.w * 0.5, r.y - h * 0.17],
                [r.x + r.w * 0.78, r.y - h * 0.08]], h * 0.045, p, true);
        } else if (page.action === 'stargaze') {
            nightStars(ctx, [[r.x + r.w * 0.22, r.y - h * 0.08], [r.x + r.w * 0.5, r.y - h * 0.18],
                [r.x + r.w * 0.78, r.y - h * 0.08]], h * 0.045, p, true);
        } else if (page.action === 'shine') shine(ctx, r, p);
        else if (page.action === 'blur') drawPatch(ctx, img, [0.10, 0.16, 0.9, 0.84], r, img.height * 0.022, ease(p));
        ctx.restore();
        return { s: h / 300 };
    }

    function panoramicPatch(ctx, img, bounds, frame, core, width, alpha) {
        if (!img || alpha <= 0) return;
        if (!core) { drawPatch(ctx,img,bounds,frame,0,alpha); return; }
        const tile = patch(img,bounds,0), [l,t,r,b] = bounds;
        const stops = [l,...core.filter(n=>n>l&&n<r),r];
        const left = Math.min(0,frame.x), right = Math.max(width,frame.x+frame.w);
        const mapX = x => x < core[0] ? left + x / core[0] * (frame.x + core[0] * frame.w - left)
            : x > core[1] ? frame.x + core[1] * frame.w + (x - core[1]) / (1 - core[1]) * (right - frame.x - core[1] * frame.w)
            : frame.x + x * frame.w;
        ctx.save();ctx.globalAlpha=alpha;
        for(let i=1;i<stops.length;i++) {
            const x0=stops[i-1],x1=stops[i];
            ctx.drawImage(tile,(x0-l)/(r-l)*tile.width,0,(x1-x0)/(r-l)*tile.width,tile.height,
                mapX(x0),frame.y+t*frame.h,mapX(x1)-mapX(x0),(b-t)*frame.h);
        }
        ctx.restore();
    }

    function spreadEffect(ctx, imageFor, img, frame, page, st, width) {
        const spec = page.spreadAction;
        if (!spec || st.cover) return;
        const p = st.p || 0, r = region(frame, spec.bounds);
        if (NSS.SensoryActions.handles(page.action)) {
            NSS.SensoryActions.book(ctx,imageFor,page,frame,p,width);
        } else if (NSS.FinalActions.handles(page.action)) {
            NSS.FinalActions.book(ctx,imageFor,page,frame,p);
        } else if (page.action === 'blink') {
            drawPatch(ctx, imageFor(spec.overlay), spec.bounds, frame, 0, blinkAmount(p));
            stars(ctx, [[0.234, 0.164], [0.387, 0.191], [0.628, 0.156]].map(([x,y]) =>
                [frame.x + x * frame.w, frame.y + y * frame.h]), frame.h * 0.017, p, false);
        } else if (page.action === 'shine') shine(ctx, r, p);
        else if (page.action === 'blur') {
            // Sanja's hair overlaps the lower-left board corner. Keep it sharp.
            ctx.save(); ctx.translate(frame.x, frame.y); ctx.scale(frame.w, frame.h);
            const [l,t,r,b] = spec.bounds;
            ctx.beginPath(); ctx.moveTo(l,t); ctx.lineTo(r,t); ctx.lineTo(r,b);
            ctx.lineTo(0.48,b); ctx.lineTo(0.48,0.366); ctx.lineTo(l,0.366); ctx.closePath(); ctx.clip();
            ctx.scale(1 / frame.w, 1 / frame.h); ctx.translate(-frame.x,-frame.y);
            drawPatch(ctx, img, spec.bounds, frame, img.height * 0.023, ease(p)); ctx.restore();
        }
        else if (page.action === 'rock') {
            const sprite = imageFor(page.story.objects[spec.object]);
            if (sprite) {
                const h = Math.min(r.h, r.w * sprite.height / sprite.width), w = h * sprite.width / sprite.height;
                ctx.save(); ctx.fillStyle = 'rgba(48,37,17,0.18)'; ctx.beginPath();
                ctx.ellipse(r.x + (r.w - w) / 2 + w * 0.54, r.y + r.h - h * 0.014,
                    h * 0.046, h * 0.009, 0, 0, TAU); ctx.fill(); ctx.restore();
                chair(ctx, sprite, r, p);
            }
        } else if (page.action === 'trace') {
            const book = imageFor(page.story.objects[spec.object]);
            if (book) traceBook(ctx, book, imageFor(page.story.objects[spec.detailObject]), r, p);
        } else if (page.action === 'sharewarmth') {
            warmHalo(ctx,r,p);
            drawPatch(ctx,imageFor(spec.overlay),spec.bounds,frame,0,ease(clamp((p - 0.20) / 0.12,0,1)));
        } else if (page.action === 'sunglasses') {
            const frames = [img, ...spec.overlays.map(imageFor)];
            const [a,b,t] = sequence(frames,p);
            // Only the mirror's interior changes; the harbor stays still.
            drawPatch(ctx,a,spec.bounds,frame,0,1);
            drawPatch(ctx,b,spec.bounds,frame,0,t);
        } else if (page.action === 'beachwalk') {
            walkBeach(ctx, walkImages(page, imageFor), fitRect({ width: 0.8, height: 1 }, r), p, spec.travel * frame.w, false);
        } else if (page.action === 'oceanlisten') {
            const standing=imageFor(page.story.objects[spec.object]),listening=imageFor(page.story.objects[spec.poses[0]]);
            if(standing){const at=fitRect(standing,r);NSS.OceanListen.draw(ctx,standing,listening,at,p);}
        } else if (page.action === 'surf') {
            panoramicPatch(ctx,imageFor(spec.overlay),spec.bounds,frame,page.spreadCore,width,Math.pow(Math.sin(p * Math.PI),2));
            musicNotes(ctx, r.x + r.w * 0.58, r.y + r.h * 0.38, Math.max(16, Math.min(38, r.h * 0.11)), p, false);
        } else if (page.action === 'sigh') {
            const [open, exhale] = sighAmounts(p);
            drawPatch(ctx, imageFor(spec.overlays[0]), spec.bounds, frame, 0, open);
            drawPatch(ctx, imageFor(spec.overlays[1]), spec.bounds, frame, 0, exhale);
        } else if (page.action === 'stargaze') {
            nightStars(ctx, [[0.317,0.242],[0.422,0.314],[0.519,0.112],[0.563,0.381],
                [0.654,0.219],[0.716,0.306],[0.270,0.406],[0.757,0.518]].map(([x,y]) =>
                [frame.x + x * frame.w, frame.y + y * frame.h]), frame.h * 0.019, p, false);
        }
    }

    // Keep the important scene above the words and extend only outer scenery.
    function drawSpread(ctx, imageFor, w, pictureH, page, st) {
        if (NSS.Settings.cvi() && page.spreadAction) return drawSimpleSpread(ctx, imageFor, w, pictureH, page, st);
        const img = imageFor(page.spread), fullH = st.h || pictureH;
        ctx.fillStyle = page.bg; ctx.fillRect(0, 0, w, fullH);
        if (!img) return { s: 1 };
        const area = safeArea(w, pictureH, st, false);
        const frame = frameFor(img, { focus: page.spreadFocus }, area, st.pictureW || w, pictureH);
        // Close-ups and the courtyard already have safe upper scenery. Keep
        // that original painting against the screen edge, without a wash band.
        if(page.spreadAlignTop)frame.y=Math.min(0,frame.y);
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        landscapeWash(ctx, img, frame, w, fullH);
        const core = page.spreadCore;
        const mask = (!core && frame.x > 0 ? 1 : 0) | (!core && frame.x + frame.w < w ? 2 : 0) |
            (frame.y > 0 ? 4 : 0) | (frame.y + frame.h < fullH ? 8 : 0);
        const painting = softEdges(img, mask, 0.09);
        if (core) {
            const sx = [0, core[0] * img.width, core[1] * img.width, img.width];
            const dx = [Math.min(0, frame.x), frame.x + core[0] * frame.w,
                frame.x + core[1] * frame.w, Math.max(w, frame.x + frame.w)];
            // Added panoramic scenery fills wide monitors, with no vertical
            // strip stretching, mirrored furniture, or repeated characters.
            for (let i = 0; i < 3; i++) ctx.drawImage(painting,
                sx[i], 0, sx[i + 1] - sx[i], img.height,
                dx[i], frame.y, dx[i + 1] - dx[i], frame.h);
        } else ctx.drawImage(painting, frame.x, frame.y, frame.w, frame.h);
        if (page.spreadAction) {
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, pictureH); ctx.clip();
            spreadEffect(ctx, imageFor, img, frame, page, st, w); ctx.restore();
        }
        ctx.restore();
        return { s: 1 };
    }

    return { draw: draw, drawSpread: drawSpread };
})();
