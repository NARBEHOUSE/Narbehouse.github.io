#!/usr/bin/env node
/* Does the alligator always come out of the water?
 *
 *   node tools/check-gator.cjs [--grid 20] [--every 1] [--plots DIR]
 *
 * For ball spots near every pond (a grid of --grid px), plans the alligator
 * with gator.plan, then plays its watch and its attack in 1/50 s steps on the
 * real meshes (art.makeGator posed by gator.apply) and tests every vertex.
 * Nothing may be buried in the carpet or the bank, cross the rail, or come up
 * under a bridge (gator.misplaced). Also checks that the jaws close on the
 * ball, and that no joint jumps between frames. --every N tests every Nth
 * plan only; --plots writes top and side pictures of a few attacks as PNGs.
 *
 * Node only: it never opens a browser.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), zlib = require('node:zlib');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const GRID = +opt('grid', 20), EVERY = +opt('every', 1), PLOTS = opt('plots', null);

// three.js + the game's modules in one context. art.js only touches the DOM for textures, which this never asks for.
const ctx = { console: { log() {}, warn() {}, error: console.error }, Math, Date, JSON, Float32Array, Uint16Array, Uint32Array, Uint8Array, Int32Array, Float64Array, Array, Object, Map, Set, WeakMap, Symbol, Promise, Error, TypeError, RangeError, ArrayBuffer, DataView, Number, String, Boolean, parseInt, parseFloat, isFinite };
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
const dir = path.resolve(__dirname, '../js');
for (const f of ['three.min.js', 'util.js', 'course.js', 'physics.js', 'gator.js', 'art.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}
const { MG, THREE } = ctx;
const C = MG.course, P = MG.physics, G = MG.gator, S = C.S;

const model = MG.art.makeGator();
const meshes = [];
model.traverse(o => { if (o.isMesh) meshes.push(o); });
const vtx = new THREE.Vector3(), mouth = new THREE.Vector3();
let vertexCount = 0;
for (const m of meshes) vertexCount += m.geometry.attributes.position.count;

/** Every vertex of the posed model, tested against the hole. */
function meshFaults(ch, pl, pose, tol) {
  G.apply(model, pose);
  model.updateMatrixWorld(true);
  let worst = 0, at = null;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      vtx.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const q = { x: vtx.x / S, y: vtx.z / S, h: vtx.y };
      const bad = G.misplaced(ch, pl.pond, q, tol, true);
      if (bad > worst) { worst = bad; at = { part: m.name, x: Math.round(q.x), y: Math.round(q.y), h: +q.h.toFixed(2) }; }
    }
  }
  return { worst, at };
}

function mouthAt(pose) {
  G.apply(model, pose);
  model.updateMatrixWorld(true);
  return model.userData.head.localToWorld(mouth.copy(model.userData.mouth));
}

/* ── A tiny PNG writer, for the pictures ──────────────────────────────── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function Picture(w, h) {
  const px = Buffer.alloc(w * h * 3, 24);
  const set = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 3; px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; };
  return {
    w, h, set,
    dot(x, y, c, r) { r = r || 1; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) set(x + dx, y + dy, c); },
    line(x0, y0, x1, y1, c) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= n; i++) set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); },
    poly(pts, c) { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.line(a[0], a[1], b[0], b[1], c); } },
    save(file) {
      const raw = Buffer.alloc((w * 3 + 1) * h);
      for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
      fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    }
  };
}

const COLORS = { watch: [120, 200, 255], rise: [80, 255, 160], snap: [255, 90, 90], hold: [255, 200, 60], back: [200, 120, 255] };
const MOMENTS = (pl) => [['watch', 'watch', 99], ['rise', 'strike', pl.T.open], ['snap', 'strike', pl.T.snap], ['back', 'strike', (pl.T.hold + pl.T.gone) / 2]];

function plot(file, ch, pl, title) {
  // Top view, 2 screen px per course px, around the attack.
  const xs = pl.path.map(p => p.x), ys = pl.path.map(p => p.y);
  const x0 = Math.min(...xs) - 140, x1 = Math.max(...xs) + 140, y0 = Math.min(...ys) - 140, y1 = Math.max(...ys) + 140;
  const K = 2, W = Math.round((x1 - x0) * K), H = Math.round((y1 - y0) * K);
  const pic = Picture(W, H + 260);
  const tx = (x) => (x - x0) * K, ty = (y) => (y - y0) * K;
  pic.poly(ch.fairway.poly.map(p => [tx(p.x), ty(p.y)]), [60, 170, 70]);
  for (const w of ch.waters) pic.poly(w.poly.map(p => [tx(p.x), ty(p.y)]), [60, 130, 255]);
  for (const b of ch.bridges) pic.poly([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [tx(b.cx + a * b.hw * b.cos - c * b.hh * b.sin), ty(b.cy + a * b.hw * b.sin + c * b.hh * b.cos)]), [170, 110, 60]);
  for (let i = 1; i < pl.path.length; i++) pic.line(tx(pl.path[i - 1].x), ty(pl.path[i - 1].y), tx(pl.path[i].x), ty(pl.path[i].y), [230, 230, 80]);
  pic.dot(tx(pl.ball.x), ty(pl.ball.y), [255, 255, 255], Math.round(ch.ballR * K));
  // Side view below: height against distance along the lunge, at the snap.
  const base = H + 150, VK = 40;      // 40 screen px per world unit of height
  const along = (x, y) => ((pl.ball.x - x) * Math.cos(pl.dir) + (pl.ball.y - y) * Math.sin(pl.dir));
  for (let u = 0; u < W / K; u += 0.5) {
    pic.set(u * K, base, [60, 170, 70]);                                 // carpet top
    pic.set(u * K, base - pl.pond.level * VK, [60, 130, 255]);            // water surface
    pic.set(u * K, base - (pl.pond.level - 0.6) * VK, [40, 70, 140]);     // well under: out of sight
  }
  for (const [name, phase, t] of MOMENTS(pl)) {
    const pose = G.frame(ch, pl, phase, t);
    G.apply(model, pose);
    model.updateMatrixWorld(true);
    for (const m of meshes) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        vtx.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        pic.set(tx(vtx.x / S), ty(vtx.z / S), COLORS[name]);
        if (name === 'snap' || name === 'watch') pic.set(along(vtx.x / S, vtx.z / S) * K, base - vtx.y * VK, COLORS[name]);
      }
    }
  }
  pic.save(file);
  console.log('   picture: ' + file + '  (' + title + ')');
}

/* ── Run ──────────────────────────────────────────────────────────────── */

const files = JSON.parse(fs.readFileSync(path.join(__dirname, '../courses/course_list.json'), 'utf8'));
if (PLOTS) fs.mkdirSync(PLOTS, { recursive: true });
let spots = 0, planned = 0, tested = 0, faults = 0, plotted = 0;
console.log(`Model: ${meshes.length} meshes, ${vertexCount} vertices.`);
for (const f of files) {
  const course = C.normaliseCourse(JSON.parse(fs.readFileSync(path.join(__dirname, '../courses', f), 'utf8')));
  course.holes.forEach((h, hi) => {
    const ch = C.compileHole(h);
    if (!ch.waters.length) return;
    G.prepare(ch);
    let n = 0, ok = 0, k = 0, holeFaults = 0, worstMouth = 0;
    const bb = ch.fairway.bbox;
    for (let y = bb.y0; y <= bb.y1; y += GRID) for (let x = bb.x0; x <= bb.x1; x += GRID) {
      if (!C.pointInPolygon(x, y, ch.fairway.poly) || P.surfaceAt(ch, x, y).kind === 'water' || P.onBridge(ch, x, y)) continue;
      if (C.closestOnPolygon(x, y, ch.fairway.poly).d < ch.ballR) continue;     // a ball can't rest closer to the rail
      let near = Infinity;
      for (const w of ch.waters) near = Math.min(near, C.closestOnPolygon(x, y, w.poly).d);
      if (near > 60 + ch.ballR) continue;                                       // game.js only lets it come this close
      n++;
      const pl = G.plan(ch, { x, y });
      if (!pl) continue;
      ok++;
      if (k++ % EVERY) continue;
      tested++;
      const problems = [];
      // Every vertex, through the watch and the whole attack.
      for (const t of [0, 2, 5, 10, 99]) { const r = meshFaults(ch, pl, G.frame(ch, pl, 'watch', t), 0.08); if (r.worst > 0) problems.push(`watch ${t}s: ${r.worst.toFixed(2)} at ${JSON.stringify(r.at)}`); }
      // Motion: the lunge is fast (up to ~30 px and ~0.5 high a step), so look for real
      // jumps (far more than that in one step) and lurches (a sudden change of speed).
      let prev = null, prevDh = null;
      for (let t = 0; t <= pl.T.gone + 0.4; t += 0.02) {
        const pose = G.frame(ch, pl, 'strike', t);
        const r = meshFaults(ch, pl, pose, 0.08);
        if (r.worst > 0) problems.push(`strike ${t.toFixed(2)}s: ${r.worst.toFixed(2)} at ${JSON.stringify(r.at)}`);
        if (prev) {
          const dh = pose.joints.map((b, j) => b.h - prev.joints[j].h);
          for (let j = 0; j < pose.joints.length; j++) {
            const a = prev.joints[j], b = pose.joints[j];
            const chomp = j === 0 && Math.abs(t - pl.T.snap) < 0.1;     // the head slams down on the ball: meant
            const seen = Math.max(a.h, b.h) > pl.pond.level - 0.9;        // deeper than the pond bed nothing shows
            if (!seen) continue;
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > 45) problems.push(`joint ${j} jumps ${d.toFixed(0)} px at ${t.toFixed(2)}s`);
            if (!chomp && Math.abs(dh[j]) > 0.8) problems.push(`joint ${j} ${dh[j] > 0 ? 'pops up' : 'drops'} ${Math.abs(dh[j]).toFixed(2)} at ${t.toFixed(2)}s`);
            if (!chomp && prevDh && Math.abs(dh[j] - prevDh[j]) > 0.5) problems.push(`joint ${j} lurches ${Math.abs(dh[j] - prevDh[j]).toFixed(2)} at ${t.toFixed(2)}s`);
          }
          prevDh = dh;
        }
        prev = pose;
      }
      // Pieces that have to stretch a lot to meet their next joint would look pulled apart.
      for (let t = 0; t <= pl.T.gone; t += 0.05) {
        const pose = G.frame(ch, pl, 'strike', t);
        for (let i = 0; i < pose.pieces.length; i++) if (pose.pieces[i].stretch > 1.35 && pose.joints[i].h > pl.pond.level - 0.3) {
          problems.push(`${G.PIECES[i].name} stretched ${pose.pieces[i].stretch.toFixed(2)}x at ${t.toFixed(2)}s`);
          break;
        }
      }
      // The jaws close on the ball.
      const m = mouthAt(G.frame(ch, pl, 'strike', pl.T.snap));
      const ballH = C.surfaceHeight(ch, x, y) * S + ch.ballR * S;
      const miss = Math.hypot(m.x / S - x, m.z / S - y);
      worstMouth = Math.max(worstMouth, miss);
      if (miss > 4 || Math.abs(m.y - ballH) > 0.35) problems.push(`mouth misses the ball by ${miss.toFixed(1)} px, ${(m.y - ballH).toFixed(2)} high`);
      if (problems.length) {
        holeFaults++; faults++;
        if (holeFaults <= 3) console.log(`   FAULT ${h.name} ball (${Math.round(x)},${Math.round(y)}) scale ${pl.s}: ${problems.slice(0, 3).join('; ')}`);
      }
      if (PLOTS && (plotted < 12) && (problems.length || k % 23 === 1)) {
        plotted++;
        plot(path.join(PLOTS, `${f.replace('.json', '')}-${hi + 1}-${Math.round(x)}-${Math.round(y)}.png`), ch, pl, `${h.name}, scale ${pl.s}${problems.length ? ', FAULT' : ''}`);
      }
    }
    spots += n; planned += ok;
    console.log(`${course.name.padEnd(16)} ${String(hi + 1).padStart(2)} ${h.name.padEnd(18)} ${String(ok).padStart(4)}/${String(n).padEnd(4)} spots get an alligator; ${holeFaults ? holeFaults + ' FAULTY' : 'all clean'} (mouth within ${worstMouth.toFixed(1)} px)`);
  });
}
console.log(`\n${planned}/${spots} ball spots near water get an alligator; ${tested} attacks played vertex by vertex; ${faults} with faults.`);
process.exitCode = faults ? 1 : 0;
