/**
 * NARBE Build n Bash - particle effects.
 *
 * Three pooled systems, each ONE draw call however busy the screen gets:
 *   puffs     soft round dust and smoke (normal blending)
 *   glow      sparks, embers and fire (additive)
 *   confetti  little paper squares that flutter down (instanced quads)
 * plus a few expanding shock rings on the ground.
 *
 * Everything here is decoration. Calm motion (Settings) halves the counts and
 * slows nothing down; nothing ever flashes the whole screen.
 */

window.BNB = window.BNB || {};

BNB.FX = (function () {
    'use strict';

    let THREE = null, root = null, calm = false, rand = Math.random;
    let puffs = null, glow = null, confetti = null;
    const rings = [];

    const VERT = [
        'attribute float size;', 'attribute float alpha;', 'attribute vec3 tint;',
        'varying float vAlpha;', 'varying vec3 vTint;',
        'uniform float scale;',
        'void main() {',
        '  vAlpha = alpha; vTint = tint;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = size * scale / max(0.1, -mv.z);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
    ].join('\n');
    const FRAG_SOFT = [
        'varying float vAlpha;', 'varying vec3 vTint;',
        'void main() {',
        '  vec2 c = gl_PointCoord - 0.5; float d = length(c);',
        '  if (d > 0.5) discard;',
        '  float a = smoothstep(0.5, 0.18, d) * vAlpha;',
        '  gl_FragColor = vec4(vTint, a);',
        '}'
    ].join('\n');

    /** A pool of point particles sharing one geometry. */
    function pointPool(max, additive) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max), tint = new Float32Array(max * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3).setUsage(THREE.DynamicDrawUsage));
        const mat = new THREE.ShaderMaterial({
            vertexShader: VERT, fragmentShader: FRAG_SOFT, transparent: true, depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            uniforms: { scale: { value: 300 } }
        });
        const pts = new THREE.Points(geo, mat);
        pts.frustumCulled = false;
        pts.renderOrder = additive ? 6 : 5;
        root.add(pts);
        const live = [];
        return {
            obj: pts, mat: mat, max: max, live: live,
            spawn: function (p) { if (live.length < max) live.push(p); else live[Math.floor(rand() * max)] = p; },
            update: function (dt) {
                let n = 0;
                for (let i = 0; i < live.length; i++) {
                    const p = live[i];
                    p.age += dt;
                    if (p.age >= p.life) continue;
                    p.vy -= (p.g || 0) * dt;
                    const drag = Math.exp(-(p.drag || 0) * dt);
                    p.vx *= drag; p.vy *= drag; p.vz *= drag;
                    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                    if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = 0; }
                    const u = p.age / p.life;
                    pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
                    size[n] = p.s0 + (p.s1 - p.s0) * u;
                    alpha[n] = p.a * (u < 0.12 ? u / 0.12 : 1 - Math.pow((u - 0.12) / 0.88, 1.6));
                    tint[n * 3] = p.r; tint[n * 3 + 1] = p.gr; tint[n * 3 + 2] = p.b;
                    live[n++] = p;
                }
                live.length = n;
                geo.setDrawRange(0, n);
                ['position', 'size', 'alpha', 'tint'].forEach(k => { geo.attributes[k].needsUpdate = true; });
            }
        };
    }

    function confettiPool(max) {
        const geo = new THREE.PlaneGeometry(0.16, 0.1);
        const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
        const mesh = new THREE.InstancedMesh(geo, mat, max);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        root.add(mesh);
        const live = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
        mesh.setColorAt(0, c.set('#ffffff'));
        return {
            spawn: function (o) { if (live.length < max) live.push(o); },
            update: function (dt) {
                let n = 0;
                for (let i = 0; i < live.length; i++) {
                    const o = live[i];
                    o.age += dt;
                    if (o.age >= o.life) continue;
                    o.vy = Math.max(o.vy - 9 * dt, -1.6);
                    o.vx *= Math.exp(-1.5 * dt); o.vz *= Math.exp(-1.5 * dt);
                    o.x += (o.vx + Math.sin(o.age * 3 + o.ph) * 0.5) * dt;
                    o.y += o.vy * dt;
                    o.z += o.vz * dt;
                    if (o.y < o.floor) { o.y = o.floor; o.vx = o.vz = 0; }
                    o.rx += o.sx * dt; o.ry += o.sy * dt;
                    const fade = o.age > o.life - 0.6 ? Math.max(0.01, (o.life - o.age) / 0.6) : 1;
                    q.setFromEuler(e.set(o.rx, o.ry, 0));
                    m.compose(p.set(o.x, o.y, o.z), q, s.set(fade, fade, fade));
                    mesh.setMatrixAt(n, m);
                    mesh.setColorAt(n, c.set(o.color));
                    live[n++] = o;
                }
                live.length = n;
                mesh.count = n;
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
        };
    }

    function init(three, parent, opts) {
        THREE = three;
        root = new THREE.Group();
        root.name = 'fx';
        parent.add(root);
        if (opts && opts.rand) rand = opts.rand;
        puffs = pointPool(500, false);
        glow = pointPool(400, true);
        confetti = confettiPool(260);
    }

    function setCalm(on) { calm = !!on; }
    function n(count) { return Math.max(1, Math.round(count * (calm ? 0.45 : 1))); }
    function col(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
    function jitter(a) { return (rand() * 2 - 1) * a; }

    /** Pixel scale for point sizes; the stage calls this on resize. */
    function setViewport(heightPx, fovDeg) {
        const s = heightPx / (2 * Math.tan(fovDeg * Math.PI / 360));
        if (puffs) { puffs.mat.uniforms.scale.value = s; glow.mat.uniforms.scale.value = s; }
    }

    // --- effects ------------------------------------------------------------------------

    /** Dust kicked up where something lands. */
    function dust(x, y, z, count, size, color) {
        const c = col(color || '#d9cdb8');
        for (let i = 0, k = n(count || 8); i < k; i++) {
            const a = rand() * Math.PI * 2, sp = 0.6 + rand() * 1.6;
            puffs.spawn({ x: x + jitter(0.2), y: y + 0.05, z: z + jitter(0.2), vx: Math.cos(a) * sp, vy: 0.4 + rand() * 0.9, vz: Math.sin(a) * sp,
                drag: 2.6, g: 0.4, age: 0, life: 0.7 + rand() * 0.6, s0: (size || 0.5) * 0.6, s1: (size || 0.5) * 1.8, a: 0.55, r: c[0], gr: c[1], b: c[2] });
        }
    }

    /** Thick rolling smoke (explosions, tornado debris, meteor trail). */
    function smoke(x, y, z, count, size, color, rise) {
        const c = col(color || '#6b6560');
        for (let i = 0, k = n(count || 10); i < k; i++) {
            const a = rand() * Math.PI * 2, sp = rand() * 1.8;
            puffs.spawn({ x: x + jitter(0.4), y: y + jitter(0.3), z: z + jitter(0.4), vx: Math.cos(a) * sp, vy: (rise === undefined ? 1.2 : rise) + rand(), vz: Math.sin(a) * sp,
                drag: 1.4, g: -0.3, age: 0, life: 1.4 + rand() * 1.2, s0: (size || 1) * 0.8, s1: (size || 1) * 2.6, a: 0.62, r: c[0], gr: c[1], b: c[2] });
        }
    }

    /** Hot sparks that arc and fade. */
    function sparks(x, y, z, count, speed, color) {
        const c = col(color || '#ffb347');
        for (let i = 0, k = n(count || 14); i < k; i++) {
            const a = rand() * Math.PI * 2, e = rand() * 1.2, sp = (speed || 6) * (0.4 + rand() * 0.8);
            glow.spawn({ x: x, y: y, z: z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 1, vz: Math.sin(a) * Math.cos(e) * sp,
                drag: 1.2, g: 9, floor: 0.02, age: 0, life: 0.5 + rand() * 0.6, s0: 0.22, s1: 0.06, a: 1, r: c[0], gr: c[1], b: c[2] });
        }
    }

    /** A fireball: layered glowing puffs, orange core to red edge. */
    function fire(x, y, z, radius, count) {
        const k = n(count || 26);
        for (let i = 0; i < k; i++) {
            const a = rand() * Math.PI * 2, e = (rand() - 0.3) * Math.PI / 2, sp = radius * (1.4 + rand() * 2.2);
            const hot = rand();
            const c = hot < 0.35 ? [1, 0.92, 0.55] : hot < 0.75 ? [1, 0.55, 0.15] : [0.95, 0.28, 0.08];
            glow.spawn({ x: x, y: y, z: z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 1.5, vz: Math.sin(a) * Math.cos(e) * sp,
                drag: 3.2, g: -1.5, age: 0, life: 0.45 + rand() * 0.45, s0: radius * 1.4, s1: radius * 2.6, a: 0.75, r: c[0], gr: c[1], b: c[2] });
        }
    }

    /** Water splash: white droplets thrown up in a crown. */
    function splash(x, y, z, size) {
        const c = [0.86, 0.95, 1];
        for (let i = 0, k = n(16); i < k; i++) {
            const a = rand() * Math.PI * 2, sp = (size || 1) * (1 + rand() * 1.8);
            puffs.spawn({ x: x, y: y, z: z, vx: Math.cos(a) * sp, vy: (size || 1) * (3 + rand() * 3), vz: Math.sin(a) * sp,
                drag: 0.6, g: 14, age: 0, life: 0.6 + rand() * 0.4, s0: 0.25, s1: 0.12, a: 0.9, r: c[0], gr: c[1], b: c[2] });
        }
        ring(x, y + 0.02, z, (size || 1) * 1.6, '#e6f6ff', 0.7);
    }

    /** A little sparkle burst (space landings, the finished build). */
    function twinkle(x, y, z, count, color) {
        const c = col(color || '#fff3b0');
        for (let i = 0, k = n(count || 10); i < k; i++) {
            const a = rand() * Math.PI * 2, e = rand() * Math.PI - Math.PI / 2, sp = 1 + rand() * 2.5;
            glow.spawn({ x: x, y: y, z: z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp,
                drag: 2.5, g: 0, age: 0, life: 0.5 + rand() * 0.5, s0: 0.2, s1: 0.02, a: 1, r: c[0], gr: c[1], b: c[2] });
        }
    }

    const PARTY = ['#ff4d6d', '#ffd23f', '#3bceac', '#5aa9ff', '#c77dff', '#ff8c42', '#ffffff'];

    /** Confetti from above a point, for the finished build. */
    function party(x, y, z, spread, count) {
        for (let i = 0, k = n(count || 140); i < k; i++) {
            const a = rand() * Math.PI * 2, r = rand() * spread;
            confetti.spawn({ x: x + Math.cos(a) * r * 0.4, y: y, z: z + Math.sin(a) * r * 0.4, vx: Math.cos(a) * (2 + rand() * 4), vy: 5 + rand() * 6, vz: Math.sin(a) * (2 + rand() * 4),
                floor: 0.02, age: 0, life: 3.2 + rand() * 1.6, ph: rand() * 6, rx: rand() * 6, ry: rand() * 6, sx: jitter(9), sy: jitter(9),
                color: PARTY[Math.floor(rand() * PARTY.length)] });
        }
    }

    /** An expanding ring flat on the ground (a stomp, a landing, a blast). */
    function ring(x, y, z, radius, color, opacity) {
        const g = new THREE.RingGeometry(0.8, 1, 48);
        g.rotateX(-Math.PI / 2);
        const m = new THREE.MeshBasicMaterial({ color: color || '#ffffff', transparent: true, opacity: opacity === undefined ? 0.6 : opacity, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y + 0.03, z);
        mesh.renderOrder = 4;
        root.add(mesh);
        rings.push({ mesh: mesh, age: 0, life: 0.7, r: radius || 2, a: m.opacity });
    }

    function update(dt) {
        if (!puffs) return;
        puffs.update(dt);
        glow.update(dt);
        confetti.update(dt);
        for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.age += dt;
            const u = r.age / r.life;
            if (u >= 1) {
                root.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); rings.splice(i, 1); continue;
            }
            const s = 0.2 + (1 - Math.pow(1 - u, 3)) * r.r;
            r.mesh.scale.set(s, 1, s);
            r.mesh.material.opacity = r.a * (1 - u);
        }
    }

    function clear() {
        if (!puffs) return;
        puffs.live.length = 0; glow.live.length = 0;
        rings.splice(0).forEach(r => { root.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
        update(0);
    }

    return {
        init: init, setCalm: setCalm, setViewport: setViewport, update: update, clear: clear,
        dust: dust, smoke: smoke, sparks: sparks, fire: fire, splash: splash, twinkle: twinkle, party: party, ring: ring,
        calm: function () { return calm; }
    };
})();
