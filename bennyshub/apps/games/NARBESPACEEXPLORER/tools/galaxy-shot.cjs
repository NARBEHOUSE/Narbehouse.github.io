/**
 * NARBE Space Explorer - a picture of the galaxy view (a new galaxy seen from outside), drawn in
 * Node (dev-only). Used for the hub's game picture.
 *
 *   node tools/galaxy-shot.cjs <out.png> [seed ...] [--size=1280x720] [--spin=0.6] [--dist=1050]
 *
 * With several seeds it draws a contact sheet to choose from (out.png), one picture per seed.
 *
 * Browsers, Electron and software WebGL are off-limits on the development PC (they froze it), and
 * NARBE Build n Ride's CPU renderer has no sprites, so this builds the game's real galaxy-view
 * scene (js/galaxyview.js) and draws its points and glow sprites the way WebGL does: each one
 * added on top (additive blending), ACES tone mapping where the material asks for it, sRGB out,
 * at twice the size and scaled down (like a high-DPI screen).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = path.join(__dirname, '..');
const R = require(path.join(GAME, '..', 'NARBEBUILDNRIDE', 'tools', 'node_render.cjs'));
const g = globalThis;
g.window = g; g.devicePixelRatio = 1;
g.document = { createElement: t => (t === 'canvas' ? new R.MiniCanvas() : { style: {} }), getElementById: () => null, addEventListener() {} };
const store = new Map();
g.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
g.THREE = require(path.join(GAME, 'vendor/three.min.js'));
for (const f of ['util', 'universe', 'settings', 'planets', 'galaxyview']) vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js', f + '.js'), 'utf8'), { filename: f });
const THREE = g.THREE, UV = NSE.Universe;
NSE.Planets.init(THREE, 'high');

const EXPOSURE = 1.05;                      // js/stage.js: renderer.toneMappingExposure
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const srgb = v => { v = clamp01(v); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
const fit = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
/** three.js r155 ACESFilmicToneMapping (same matrices, same exposure / 0.6). */
function aces(c) {
    const r = c[0] * EXPOSURE / 0.6, gg = c[1] * EXPOSURE / 0.6, b = c[2] * EXPOSURE / 0.6;
    const x = fit(0.59719 * r + 0.35458 * gg + 0.04823 * b);
    const y = fit(0.076 * r + 0.90834 * gg + 0.01566 * b);
    const z = fit(0.0284 * r + 0.13383 * gg + 0.83777 * b);
    return [clamp01(1.60475 * x - 0.53108 * y - 0.07367 * z), clamp01(-0.10208 * x + 1.10813 * y - 0.00605 * z), clamp01(-0.00327 * x - 0.07276 * y + 1.07602 * z)];
}
/** What one fragment writes before blending: tone mapped (or not), then sRGB, clamped. */
const shade = (c, toneMapped) => (toneMapped ? aces(c) : c).map(srgb);

/** Bilinear alpha from a DataTexture (the glow and soft cloud maps are white with alpha). */
function alphaAt(tex, u, v) {
    if (!tex || !tex.image || !tex.image.data) return 1;
    const S = tex.image.width, T = tex.image.height, d = tex.image.data;
    const x = clamp01(u) * S - 0.5, y = clamp01(v) * T - 0.5;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(T - 1, y0 + 1);
    const fx = Math.max(0, x - x0), fy = Math.max(0, y - y0);
    const a = (i, j) => d[(j * S + i) * 4 + 3] / 255;
    return (a(x0, y0) * (1 - fx) + a(x1, y0) * fx) * (1 - fy) + (a(x0, y1) * (1 - fx) + a(x1, y1) * fx) * fy;
}

/** Draw the scene's points and sprites as WebGL would (nothing in it writes depth). */
function shoot(scene, camera, W, H, ss) {
    const w = W * ss, h = H * ss;
    const buf = new Float32Array(w * h * 3);
    const bg = scene.background ? [scene.background.r, scene.background.g, scene.background.b].map(srgb) : [0, 0, 0];
    for (let i = 0; i < w * h; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
    scene.updateMatrixWorld(true);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const view = camera.matrixWorldInverse, proj = camera.projectionMatrix, P5 = proj.elements[5];
    const v3 = new THREE.Vector3(), v4 = new THREE.Vector4(), sc = new THREE.Vector3();
    function splat(px, py, size, rgb, opacity, tex, rot) {
        size = Math.max(1, size);
        const half = size / 2;
        const x0 = Math.max(0, Math.floor(px - half)), x1 = Math.min(w - 1, Math.ceil(px + half));
        const y0 = Math.max(0, Math.floor(py - half)), y1 = Math.min(h - 1, Math.ceil(py + half));
        const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            let u = (x + 0.5 - (px - half)) / size, v = (y + 0.5 - (py - half)) / size;
            if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
            if (rot) { const du = u - 0.5, dv = v - 0.5; u = 0.5 + du * cr - dv * sr; v = 0.5 + du * sr + dv * cr; }
            const a = opacity * alphaAt(tex, u, v);
            if (a <= 0) continue;
            const o = (y * w + x) * 3;
            buf[o] += rgb[0] * a; buf[o + 1] += rgb[1] * a; buf[o + 2] += rgb[2] * a;
        }
    }
    function toScreen(p) {
        v3.copy(p).applyMatrix4(view);
        const depth = -v3.z;
        if (depth < camera.near || depth > camera.far) return null;
        v4.set(v3.x, v3.y, v3.z, 1).applyMatrix4(proj);
        return { x: (v4.x / v4.w + 1) / 2 * w, y: (1 - v4.y / v4.w) / 2 * h, depth: depth };
    }
    const wp = new THREE.Vector3();
    scene.traverseVisible(function (o) {
        const m = o.material;
        if (o.isPoints) {
            const pos = o.geometry.attributes.position, col = m.vertexColors ? o.geometry.attributes.color : null;
            for (let i = 0; i < pos.count; i++) {
                wp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
                const s = toScreen(wp);
                if (!s) continue;
                // three.js points: size * (drawing-buffer height / 2) / depth, or size in pixels.
                const size = m.sizeAttenuation ? m.size * (h / 2) / s.depth : m.size * ss;
                const c = col ? [m.color.r * col.getX(i), m.color.g * col.getY(i), m.color.b * col.getZ(i)] : [m.color.r, m.color.g, m.color.b];
                splat(s.x, s.y, size, shade(c, m.toneMapped), m.opacity, m.map, 0);
            }
        } else if (o.isSprite) {
            wp.setFromMatrixPosition(o.matrixWorld);
            const s = toScreen(wp);
            if (!s) return;
            sc.setFromMatrixScale(o.matrixWorld);
            splat(s.x, s.y, sc.x * P5 * (h / 2) / s.depth, shade([m.color.r, m.color.g, m.color.b], m.toneMapped), m.opacity, m.map, m.rotation);
        }
    });
    // Down to the picture's size (a box filter over each ss x ss block).
    const out = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let r = 0, gg = 0, b = 0;
        for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
            const o = ((y * ss + j) * w + x * ss + i) * 3;
            r += Math.min(1, buf[o]); gg += Math.min(1, buf[o + 1]); b += Math.min(1, buf[o + 2]);
        }
        const n = ss * ss, o = (y * W + x) * 3;
        out[o] = Math.round(r / n * 255); out[o + 1] = Math.round(gg / n * 255); out[o + 2] = Math.round(b / n * 255);
    }
    return { W: W, H: H, data: out };
}

/**
 * The galaxy view, turned `spin` radians. dist: the camera's distance; the game's reveal rushes
 * back from 60 to 1050 (then 'look' holds there), so a nearer dist is a moment of that reveal.
 */
function galaxyPicture(seed, W, H, spin, dist) {
    const gal = UV.galaxy(seed);
    const view = NSE.GalaxyView.create(THREE, gal, 'high');
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 20000);
    if (dist && dist < 1050) {
        // galaxyview.js: dist = lerp(60, 1050, 1 - (1 - k)^3) during the reveal.
        const k = 1 - Math.cbrt(1 - (dist - 60) / 990);
        view.update(spin / 0.04, camera, 'reveal', k, false);
    } else view.update(spin / 0.04, camera, 'look', 0, false);      // spin = dt * 0.04 in update()
    const img = shoot(view.scene, camera, W, H, 2);
    view.dispose();
    return { img: img, galaxy: gal };
}

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const files = args.filter(a => !a.startsWith('--'));
const out = files[0] || path.join(GAME, '..', '..', '..', '..', 'tmp', 'nse-galaxy.png');
const seeds = files.slice(1).map(Number).filter(n => isFinite(n));
const size = (opt('size') || '1280x720').split('x').map(Number);
const spin = Number(opt('spin') || 0.6);
const dist = Number(opt('dist') || 1050);
if (seeds.length <= 1) {
    const seed = seeds.length ? seeds[0] : UV.HOME_GALAXY;
    const p = galaxyPicture(seed, size[0], size[1], spin, dist);
    R.writePNG(out, p.img);
    console.log(out + '  (the ' + p.galaxy.name + ' Galaxy, seed ' + seed + ', ' + p.galaxy.kind + ', ' + p.galaxy.scheme + ')');
} else {
    // A contact sheet: 3 across, each picture labelled with its seed.
    const cw = 480, ch = 270, cols = 3, rows = Math.ceil(seeds.length / cols);
    const sheet = { W: cw * cols, H: ch * rows, data: Buffer.alloc(cw * cols * ch * rows * 3) };
    seeds.forEach(function (seed, k) {
        const p = galaxyPicture(seed, cw, ch, spin, dist);
        const ox = (k % cols) * cw, oy = Math.floor(k / cols) * ch;
        for (let y = 0; y < ch; y++) p.img.data.copy(sheet.data, ((oy + y) * sheet.W + ox) * 3, y * cw * 3, (y + 1) * cw * 3);
        console.log((k + 1) + ': seed ' + seed + ' - the ' + p.galaxy.name + ' Galaxy (' + p.galaxy.kind + ', ' + p.galaxy.scheme + ', ' + p.galaxy.companions.length + ' companions)');
    });
    R.writePNG(out, sheet);
    console.log(out);
}
