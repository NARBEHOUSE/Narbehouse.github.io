/**
 * NARBE Mini Golf — Course Creator.
 *
 * A mouse-and-keyboard tool for caregivers (behind a spoken warning in the
 * game). It edits the same course JSON the game plays, through the same
 * course.js compile step, so what's drawn on the plan is exactly what the
 * ball will meet. The 3D preview uses the game's own scene builder and only
 * renders when something changes.
 *
 * Coordinates are course px (y down). The plan view maps them to the screen
 * with a pan/zoom: screen = world * view.s + view.o.
 */
(function () {
  'use strict';

  const U = MG.util, C = MG.course, P = MG.physics, A = MG.art;
  const $ = (id) => document.getElementById(id);

  /* ── Object kinds ─────────────────────────────────────────────────────── */

  const ARR = {
    wall: 'walls', bridge: 'bridges', windmill: 'windmills', water: 'waters', sand: 'sands', ice: 'ice',
    boost: 'boosts', bush: 'trees', bumper: 'bumpers', hill: 'hills', tunnel: 'tunnels'
  };
  const REGION = { water: 1, sand: 1, ice: 1, boost: 1 };
  const RECT = { wall: 1, bridge: 1, windmill: 1 };
  const CIRCLE = { bush: 1, bumper: 1, hill: 1 };
  const NAMES = {
    tee: 'Tee', cup: 'Cup', node: 'Fairway point', fairway: 'Fairway', fpoint: 'Fairway corner',
    wall: 'Wall', bridge: 'Bridge', windmill: 'Windmill', water: 'Water', sand: 'Sand', ice: 'Ice',
    boost: 'Boost pad', bush: 'Bush', bumper: 'Bumper', hill: 'Hill', tunnel: 'Tunnel'
  };
  const HINTS = {
    select: 'Click to select · drag to move · right-click for options · double-click the fairway to add a bend',
    hand: 'Drag to move the view around · wheel to zoom',
    lane: 'Click to extend the fairway from its nearest end',
    tee: 'Click to put the tee there', cup: 'Click to put the cup there',
    wall: 'Click to place a wall', bumper: 'Click to place a bumper', bush: 'Click to place a bush',
    windmill: 'Click to place a windmill (the tunnel runs left to right; rotate it to fit)',
    hill: 'Click to place a hill — set Height below 0 for a bowl',
    water: 'Click points round the pond · Enter or click the first point to finish · Esc cancels',
    sand: 'Click points round the bunker · Enter to finish', ice: 'Click points round the ice · Enter to finish',
    boost: 'Click points round the pad · Enter to finish, then turn its arrow',
    bridge: 'Click to place a bridge over water', tunnel: 'Click where the ball goes in, then where it comes out'
  };

  /* ── State ────────────────────────────────────────────────────────────── */

  let course = null;
  let hi = 0;
  let ch = null;
  let tool = 'select';
  let sel = null;          // { kind, i, part? }
  let drag = null;
  let drawing = null;      // { kind, points } or { kind: 'tunnel', a }
  let pendingSnap = null;
  const undoStack = [], redoStack = [];
  let dirty = false;
  let currentFile = '';
  let spaceDown = false;
  const view = { ox: 0, oy: 0, s: 0.5 };
  const mouse = { sx: 0, sy: 0, x: 0, y: 0, inside: false };
  let issuesByHole = [];

  const hole = () => course.holes[hi];
  const snapOn = () => $('snap').checked;
  const sn = (v, step) => (snapOn() ? Math.round(v / (step || 10)) * (step || 10) : Math.round(v * 10) / 10);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const rad = (d) => d * Math.PI / 180;
  const deg = (r) => r * 180 / Math.PI;

  /* ── Templates & normalising ──────────────────────────────────────────── */

  function emptyHole(n) {
    return {
      name: 'Hole ' + n, par: 2,
      start: { x: 240, y: 400, radius: 12 }, end: { x: 1060, y: 400, radius: 24 },
      fairway: { lane: [{ x: 150, y: 400, w: 240 }, { x: 1150, y: 400, w: 240 }], caps: 'round' },
      walls: [], waters: [], sands: [], ice: [], boosts: [], bridges: [], trees: [],
      hills: [], bumpers: [], windmills: [], tunnels: [], decor: []
    };
  }

  function emptyCourse() {
    return { name: 'My Course', theme: 'sunny', version: 2, description: '', holes: [emptyHole(1)] };
  }

  /** Make any course (old top-down ones too) editable: every list present, every region as points. */
  function editable(raw) {
    const c = JSON.parse(JSON.stringify(raw || {}));
    c.name = c.name || 'My Course';
    c.theme = C.THEMES.includes(c.theme) ? c.theme : 'sunny';
    c.version = 2;
    c.holes = Array.isArray(c.holes) && c.holes.length ? c.holes : [emptyHole(1)];
    c.holes = c.holes.map((h, i) => {
      const base = emptyHole(i + 1);
      const out = Object.assign({}, base, h);
      for (const k of Object.values(ARR).concat(['decor'])) out[k] = Array.isArray(h[k]) ? h[k] : [];
      out.start = Object.assign({}, base.start, h.start);
      out.end = Object.assign({}, base.end, h.end);
      if (!h.fairway) out.fairway = { points: [{ x: 0, y: 0 }, { x: 1280, y: 0 }, { x: 1280, y: 720 }, { x: 0, y: 720 }], smooth: false };
      for (const kind of Object.keys(REGION)) {
        out[ARR[kind]] = out[ARR[kind]].map((r) => {
          if (r.points && r.points.length >= 3) return r;
          const pts = r.radius ? C.circlePolygon(r.x, r.y, r.radius, 12) : C.rectCorners({ x: r.x, y: r.y, width: r.width || 50, height: r.height || 50, angle: r.angle || 0 });
          return Object.assign({}, r.boostAngle !== undefined ? { boostAngle: r.boostAngle } : {}, { points: pts, smooth: !!r.radius });
        }).filter(r => r.points && r.points.length >= 3);
      }
      out.par = Math.max(1, Math.round(out.par || 2));
      return out;
    });
    return c;
  }

  /** Tidy numbers before saving so the JSON stays readable. */
  function tidy(obj) {
    return JSON.parse(JSON.stringify(obj, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)));
  }

  /* ── Undo / dirty / draft ─────────────────────────────────────────────── */

  const snapshot = () => JSON.stringify({ course, hi });

  function beginChange() { if (pendingSnap === null) pendingSnap = snapshot(); }

  function commit() {
    if (pendingSnap === null) return;
    const before = pendingSnap;
    pendingSnap = null;
    if (before !== snapshot()) pushUndo(before);
    refresh();
  }

  /** Make a change in one go (buttons, keys, fields that commit immediately). */
  function change(fn) {
    const before = snapshot();
    fn();
    if (before !== snapshot()) pushUndo(before);
    refresh();
  }

  function pushUndo(before) {
    undoStack.push(before);
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    markDirty();
  }

  function restore(s) {
    const o = JSON.parse(s);
    course = o.course;
    hi = U.clamp(o.hi, 0, course.holes.length - 1);
    sel = null; drawing = null;
    markDirty();
    refresh(true);
  }

  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); toast('Undone'); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); toast('Redone'); }

  let draftTimer = null;
  function markDirty() {
    dirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => U.save('editorDraft', { course, file: currentFile, at: Date.now() }), 400);
  }

  /* ── View ─────────────────────────────────────────────────────────────── */

  const toWorld = (sx, sy) => ({ x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s });

  function fitView() {
    const cv = $('plan');
    const bb = C.compileHole(hole()).bounds;
    const w = cv.clientWidth || 800, h = cv.clientHeight || 600;
    const bw = bb.x1 - bb.x0 + 160, bh = bb.y1 - bb.y0 + 160;
    view.s = Math.min(w / bw, h / bh);
    view.ox = w / 2 - (bb.x0 + bb.x1) / 2 * view.s;
    view.oy = h / 2 - (bb.y0 + bb.y1) / 2 * view.s;
  }

  /* ── Geometry helpers ─────────────────────────────────────────────────── */

  function rectCenter(r) { return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
  function setRectCenter(r, cx, cy) { r.x = cx - r.width / 2; r.y = cy - r.height / 2; }
  function rectLocal(r, x, y) {
    const c = rectCenter(r), a = rad(r.angle || 0);
    const dx = x - c.x, dy = y - c.y;
    return { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function rectWorld(r, lx, ly) {
    const c = rectCenter(r), a = rad(r.angle || 0);
    return { x: c.x + lx * Math.cos(a) - ly * Math.sin(a), y: c.y + lx * Math.sin(a) + ly * Math.cos(a) };
  }
  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  }
  function laneNodes() { const f = hole().fairway; return f && f.lane ? f.lane : null; }
  function nodeNormal(nodes, i) {
    const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(nodes.length - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    return { x: -ty / l, y: tx / l };
  }

  function objectOf(s) {
    if (!s) return null;
    const h = hole();
    if (s.kind === 'tee') return h.start;
    if (s.kind === 'cup') return h.end;
    if (s.kind === 'node') return laneNodes() && laneNodes()[s.i];
    if (s.kind === 'fairway') return h.fairway;
    if (s.kind === 'fpoint') return h.fairway.points && h.fairway.points[s.i];
    return h[ARR[s.kind]] && h[ARR[s.kind]][s.i];
  }

  /* ── Handles ──────────────────────────────────────────────────────────── */

  function handlesFor(s) {
    const o = objectOf(s);
    if (!o) return [];
    const out = [];
    const px = 26 / view.s;
    if (RECT[s.kind]) {
      out.push({ id: 'len', p: rectWorld(o, o.width / 2, 0) });
      out.push({ id: 'wid', p: rectWorld(o, 0, o.height / 2) });
      out.push({ id: 'rot', p: rectWorld(o, o.width / 2 + px * 1.4, 0), round: true });
    } else if (CIRCLE[s.kind]) {
      out.push({ id: 'rad', p: { x: o.x + o.radius, y: o.y } });
    } else if (REGION[s.kind]) {
      o.points.forEach((pt, i) => out.push({ id: 'v' + i, p: pt, small: true }));
      if (s.kind === 'boost') {
        const c = centroid(o.points), a = rad(o.boostAngle || 0);
        out.push({ id: 'dir', p: { x: c.x + Math.cos(a) * 80, y: c.y + Math.sin(a) * 80 }, round: true });
      }
    } else if (s.kind === 'node') {
      const nodes = laneNodes(), n = nodeNormal(nodes, s.i);
      out.push({ id: 'nw', p: { x: o.x + n.x * o.w / 2, y: o.y + n.y * o.w / 2 } });
    } else if (s.kind === 'tunnel') {
      const a = rad(o.exitAngle || 0);
      out.push({ id: 'exit', p: { x: o.x2 + Math.cos(a) * ((o.radius || 28) + 50), y: o.y2 + Math.sin(a) * ((o.radius || 28) + 50) }, round: true });
    } else if (s.kind === 'fairway' && o.points) {
      o.points.forEach((pt, i) => out.push({ id: 'v' + i, p: pt, small: true }));
    }
    return out;
  }

  /* ── Hit testing ──────────────────────────────────────────────────────── */

  function hit(x, y) {
    const h = hole();
    const tol = 8 / view.s;
    if (sel) {
      for (const hd of handlesFor(sel)) if (dist(x, y, hd.p.x, hd.p.y) < (hd.small ? 7 : 10) / view.s) return { handle: hd.id, kind: sel.kind, i: sel.i };
    }
    if (dist(x, y, h.end.x, h.end.y) < h.end.radius + tol) return { kind: 'cup' };
    if (dist(x, y, h.start.x, h.start.y) < h.start.radius + tol * 1.5) return { kind: 'tee' };
    for (let i = h.tunnels.length - 1; i >= 0; i--) {
      const t = h.tunnels[i], r = (t.radius || 28) + tol;
      if (dist(x, y, t.x1, t.y1) < r) return { kind: 'tunnel', i, part: 'a' };
      if (dist(x, y, t.x2, t.y2) < r) return { kind: 'tunnel', i, part: 'b' };
    }
    for (const kind of ['bumper', 'bush']) {
      const list = h[ARR[kind]];
      for (let i = list.length - 1; i >= 0; i--) if (dist(x, y, list[i].x, list[i].y) < list[i].radius + tol) return { kind, i };
    }
    for (const kind of ['windmill', 'wall', 'bridge']) {
      const list = h[ARR[kind]];
      for (let i = list.length - 1; i >= 0; i--) {
        const l = rectLocal(list[i], x, y);
        if (Math.abs(l.x) <= list[i].width / 2 + tol && Math.abs(l.y) <= list[i].height / 2 + tol) return { kind, i };
      }
    }
    for (const kind of ['boost', 'ice', 'sand', 'water']) {
      const compiled = ch[ARR[kind]];
      for (let i = compiled.length - 1; i >= 0; i--) if (C.pointInPolygon(x, y, compiled[i].poly)) return { kind, i };
    }
    for (let i = h.hills.length - 1; i >= 0; i--) if (dist(x, y, h.hills[i].x, h.hills[i].y) < h.hills[i].radius * 0.5) return { kind: 'hill', i };
    const nodes = laneNodes();
    if (nodes) for (let i = 0; i < nodes.length; i++) if (dist(x, y, nodes[i].x, nodes[i].y) < 12 / view.s) return { kind: 'node', i };
    for (let i = h.hills.length - 1; i >= 0; i--) if (dist(x, y, h.hills[i].x, h.hills[i].y) < h.hills[i].radius) return { kind: 'hill', i };
    if (C.pointInPolygon(x, y, ch.fairway.poly)) return { kind: 'fairway' };
    return null;
  }

  /* ── Placing new things ───────────────────────────────────────────────── */

  function laneAngleNear(x, y) {
    const nodes = laneNodes();
    if (!nodes || nodes.length < 2) return 0;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < nodes.length - 1; i++) {
      const c = C.closestOnSegment(x, y, nodes[i].x, nodes[i].y, nodes[i + 1].x, nodes[i + 1].y);
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = deg(Math.atan2(nodes[i + 1].y - nodes[i].y, nodes[i + 1].x - nodes[i].x)); }
    }
    return Math.round(best / 15) * 15;
  }

  function place(kind, x, y, keepTool) {
    const h = hole();
    x = sn(x); y = sn(y);
    change(() => {
      if (kind === 'tee') { h.start.x = x; h.start.y = y; sel = { kind: 'tee' }; }
      else if (kind === 'cup') { h.end.x = x; h.end.y = y; sel = { kind: 'cup' }; }
      else if (kind === 'wall') { const r = { x: 0, y: 0, width: 200, height: 22, angle: laneAngleNear(x, y) + 90 }; setRectCenter(r, x, y); h.walls.push(r); sel = { kind, i: h.walls.length - 1 }; }
      else if (kind === 'bridge') { const r = { x: 0, y: 0, width: 300, height: 120, angle: laneAngleNear(x, y) }; setRectCenter(r, x, y); h.bridges.push(r); sel = { kind, i: h.bridges.length - 1 }; }
      else if (kind === 'windmill') {
        const nodes = laneNodes();
        const span = nodes ? Math.max(...nodes.map(n => n.w || 240)) + 40 : 330;
        const r = { x: 0, y: 0, width: 150, height: span, angle: laneAngleNear(x, y), gap: 84, speed: 1 };
        setRectCenter(r, x, y); h.windmills.push(r); sel = { kind, i: h.windmills.length - 1 };
      }
      else if (kind === 'bumper') { h.bumpers.push({ x, y, radius: 18 }); sel = { kind, i: h.bumpers.length - 1 }; }
      else if (kind === 'bush') { h.trees.push({ x, y, radius: 34 }); sel = { kind, i: h.trees.length - 1 }; }
      else if (kind === 'hill') { h.hills.push({ x, y, radius: 180, height: 40 }); sel = { kind, i: h.hills.length - 1 }; }
    });
    if (!keepTool) setTool('select');
  }

  function extendLane(x, y) {
    const h = hole();
    x = sn(x); y = sn(y);
    change(() => {
      if (!h.fairway || !h.fairway.lane) {
        h.fairway = { lane: [{ x, y, w: 240 }, { x: x + 400, y, w: 240 }], caps: 'round' };
        sel = { kind: 'node', i: 1 };
        return;
      }
      const nodes = h.fairway.lane;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (dist(x, y, first.x, first.y) < dist(x, y, last.x, last.y)) { nodes.unshift({ x, y, w: first.w || 240 }); sel = { kind: 'node', i: 0 }; }
      else { nodes.push({ x, y, w: last.w || 240 }); sel = { kind: 'node', i: nodes.length - 1 }; }
    });
  }

  /** Double-click on the fairway: add a bend at the nearest point of its centre line. */
  function insertNode(x, y) {
    const nodes = laneNodes();
    if (!nodes) return;
    let best = -1, bestD = Infinity, at = null;
    for (let i = 0; i < nodes.length - 1; i++) {
      const c = C.closestOnSegment(x, y, nodes[i].x, nodes[i].y, nodes[i + 1].x, nodes[i + 1].y);
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = i; at = c; }
    }
    if (best < 0) return;
    const a = nodes[best], b = nodes[best + 1];
    change(() => {
      nodes.splice(best + 1, 0, { x: sn(at.x), y: sn(at.y), w: Math.round(((a.w || 240) + (b.w || 240)) / 2) });
      sel = { kind: 'node', i: best + 1 };
    });
  }

  function finishDrawing() {
    if (!drawing || !REGION[drawing.kind]) return;
    if (drawing.points.length < 3) { toast('A shape needs at least 3 points', true); return; }
    const kind = drawing.kind, pts = drawing.points;
    drawing = null;
    change(() => {
      const r = { points: pts, smooth: kind !== 'boost' };
      if (kind === 'boost') r.boostAngle = laneAngleNear(centroid(pts).x, centroid(pts).y);
      hole()[ARR[kind]].push(r);
      sel = { kind, i: hole()[ARR[kind]].length - 1 };
    });
    setTool('select');
  }

  /* ── Delete / duplicate / nudge ───────────────────────────────────────── */

  function deleteSelection() {
    if (!sel) return;
    const h = hole();
    if (sel.kind === 'tee' || sel.kind === 'cup' || sel.kind === 'fairway') { toast('Every hole needs its ' + NAMES[sel.kind].toLowerCase() + ' — move it instead', true); return; }
    if (sel.kind === 'node') {
      if (laneNodes().length <= 2) { toast('The fairway needs at least two points', true); return; }
      change(() => { laneNodes().splice(sel.i, 1); sel = null; });
      return;
    }
    if (sel.kind === 'fpoint') return;
    change(() => { h[ARR[sel.kind]].splice(sel.i, 1); sel = null; });
  }

  function duplicateSelection() {
    if (!sel || !ARR[sel.kind]) return;
    const o = objectOf(sel);
    const copy = JSON.parse(JSON.stringify(o));
    const off = 40;
    if (copy.points) copy.points.forEach(p => { p.x += off; p.y += off; });
    else if (copy.x1 !== undefined) { copy.x1 += off; copy.y1 += off; copy.x2 += off; copy.y2 += off; }
    else { copy.x += off; copy.y += off; }
    change(() => { hole()[ARR[sel.kind]].push(copy); sel = { kind: sel.kind, i: hole()[ARR[sel.kind]].length - 1 }; });
  }

  function moveObject(s, o, orig, dx, dy) {
    if (s.kind === 'tunnel') {
      if (s.part === 'a') { o.x1 = orig.x1 + dx; o.y1 = orig.y1 + dy; }
      else if (s.part === 'b') { o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy; }
      else { o.x1 = orig.x1 + dx; o.y1 = orig.y1 + dy; o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy; }
    } else if (o.points) {
      o.points.forEach((p, i) => { p.x = orig.points[i].x + dx; p.y = orig.points[i].y + dy; });
    } else if (o.lane) {
      o.lane.forEach((n, i) => { n.x = orig.lane[i].x + dx; n.y = orig.lane[i].y + dy; });
    } else {
      o.x = orig.x + dx; o.y = orig.y + dy;
    }
  }

  function nudge(dx, dy) {
    if (!sel) return;
    const o = objectOf(sel);
    if (!o) return;
    const orig = JSON.parse(JSON.stringify(o));
    change(() => moveObject(sel, o, orig, dx, dy));
  }

  function resizeSelection(dir) {
    if (!sel) return;
    const o = objectOf(sel);
    if (!o) return;
    change(() => {
      if (CIRCLE[sel.kind]) o.radius = Math.max(6, o.radius + dir * 4);
      else if (RECT[sel.kind]) { const c = rectCenter(o); o.width = Math.max(10, o.width + dir * 10); setRectCenter(o, c.x, c.y); }
      else if (sel.kind === 'node') o.w = U.clamp((o.w || 240) + dir * 10, 60, 900);
      else if (o.points) { const c = centroid(o.points), k = 1 + dir * 0.05; o.points.forEach(p => { p.x = c.x + (p.x - c.x) * k; p.y = c.y + (p.y - c.y) * k; }); }
      else if (sel.kind === 'tee') o.radius = U.clamp(o.radius + dir, 6, 80);
      else if (sel.kind === 'cup') o.radius = U.clamp(o.radius + dir * 2, 12, 120);
      else if (sel.kind === 'tunnel') o.radius = U.clamp((o.radius || 28) + dir * 2, 16, 80);
    });
  }

  function rotateSelection(dirDeg) {
    if (!sel) return;
    const o = objectOf(sel);
    if (!o) return;
    change(() => {
      if (RECT[sel.kind]) o.angle = ((o.angle || 0) + dirDeg + 360) % 360;
      else if (sel.kind === 'boost') o.boostAngle = ((o.boostAngle || 0) + dirDeg + 360) % 360;
      else if (sel.kind === 'tunnel') o.exitAngle = ((o.exitAngle || 0) + dirDeg + 360) % 360;
    });
  }

  /* ── Copy / paste ─────────────────────────────────────────────────────── */

  let clipboard = null;   // { kind, obj }

  function copySelection() {
    if (!sel || !ARR[sel.kind]) return;
    clipboard = { kind: sel.kind, obj: JSON.parse(JSON.stringify(objectOf(sel))) };
    toast('Copied ' + NAMES[sel.kind].toLowerCase());
  }

  function centreOf(kind, o) {
    if (o.points) return centroid(o.points);
    if (o.x1 !== undefined) return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
    if (RECT[kind]) return rectCenter(o);
    return { x: o.x, y: o.y };
  }

  function pasteAt(x, y) {
    if (!clipboard) return;
    const copy = JSON.parse(JSON.stringify(clipboard.obj));
    const c = centreOf(clipboard.kind, copy);
    const orig = JSON.parse(JSON.stringify(copy));
    moveObject({ kind: clipboard.kind }, copy, orig, sn(x - c.x), sn(y - c.y));
    change(() => {
      hole()[ARR[clipboard.kind]].push(copy);
      sel = { kind: clipboard.kind, i: hole()[ARR[clipboard.kind]].length - 1 };
    });
  }

  /* ── Small edits used by the right-click menu ─────────────────────────── */

  /** Nearest edge of a closed outline to (x,y): returns the index to insert after. */
  function nearestEdge(pts, x, y) {
    let best = 0, bestD = Infinity, at = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const c = C.closestOnSegment(x, y, a.x, a.y, b.x, b.y);
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = i; at = c; }
    }
    return { i: best, at };
  }

  function addCorner(o, x, y) {
    const e = nearestEdge(o.points, x, y);
    change(() => { o.points.splice(e.i + 1, 0, { x: sn(e.at.x, 5), y: sn(e.at.y, 5) }); });
  }

  function removeCorner(o, i) {
    if (o.points.length <= 3) { toast('A shape needs at least 3 corners', true); return; }
    change(() => { o.points.splice(i, 1); });
  }

  function nearestNodeIndex(x, y) {
    const nodes = laneNodes();
    if (!nodes) return -1;
    let best = -1, bestD = Infinity;
    nodes.forEach((n, i) => { const d = dist(x, y, n.x, n.y); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }

  function removeNode(i) {
    const nodes = laneNodes();
    if (!nodes || i < 0) return;
    if (nodes.length <= 2) { toast('The fairway needs at least two points', true); return; }
    change(() => { nodes.splice(i, 1); sel = null; });
  }

  /* ── Right-click menu ─────────────────────────────────────────────────── */

  function closeCtx() { $('ctxMenu').classList.remove('on'); }

  function openCtx(clientX, clientY) {
    const r = $('plan').getBoundingClientRect();
    const w = toWorld(clientX - r.left, clientY - r.top);
    const x = w.x, y = w.y;
    const t = hit(x, y);
    const items = [];
    const item = (label, fn, o) => items.push(Object.assign({ label, fn }, o || {}));
    const sep = () => items.push({ sep: true });
    const head = (text) => items.push({ head: text });
    const subhead = (text) => items.push({ sub: text });

    if (t && t.handle && t.handle[0] === 'v' && objectOf(sel) && objectOf(sel).points) {
      // A corner of the selected shape (or of an outline fairway).
      const o = objectOf(sel), i = parseInt(t.handle.slice(1), 10);
      head(NAMES[sel.kind] + ' corner');
      item('Remove this corner', () => removeCorner(o, i), { danger: true, disabled: o.points.length <= 3 });
    } else if (t && t.kind) {
      // An object, or one of the selected object's handles (rotate, resize…).
      sel = { kind: t.kind, i: t.i, part: t.part };
      refresh();
      const k = t.kind, o = objectOf(sel);
      if (k === 'node') {
        head('Fairway point');
        item('Wider', () => resizeSelection(1));
        item('Narrower', () => resizeSelection(-1));
        sep();
        item('Remove this fairway point', () => removeNode(t.i), { danger: true, disabled: laneNodes().length <= 2 });
      } else if (k === 'fairway') {
        head('Fairway');
        if (laneNodes()) {
          item('Add a bend here', () => insertNode(x, y));
          const ni = nearestNodeIndex(x, y);
          const nodes = laneNodes();
          const which = ni === 0 || ni === nodes.length - 1 ? 'end' : 'bend';
          item('Remove the nearest ' + which, () => removeNode(ni), { danger: true, disabled: nodes.length <= 2 });
        } else if (o.points) {
          item('Add a corner here', () => addCorner(o, x, y));
        }
        addHere(items, x, y, item, sep, subhead);
      } else if (k === 'tee' || k === 'cup') {
        head(NAMES[k]);
        item(k === 'tee' ? 'Bigger ball' : 'Bigger cup', () => resizeSelection(1));
        item(k === 'tee' ? 'Smaller ball' : 'Smaller cup', () => resizeSelection(-1));
      } else {
        head(NAMES[k] + ' ' + (t.i + 1));
        item('Duplicate', duplicateSelection);
        item('Copy', copySelection);
        if (RECT[k]) {
          item('Turn 15° left', () => rotateSelection(-15));
          item('Turn 15° right', () => rotateSelection(15));
          item(k === 'windmill' ? 'Deeper' : 'Longer', () => resizeSelection(1));
          item(k === 'windmill' ? 'Shallower' : 'Shorter', () => resizeSelection(-1));
        } else if (CIRCLE[k]) {
          item('Bigger', () => resizeSelection(1));
          item('Smaller', () => resizeSelection(-1));
          if (k === 'hill') item(o.height >= 0 ? 'Make it a bowl' : 'Make it a mound', () => change(() => { o.height = -o.height; }));
        } else if (REGION[k]) {
          item('Add a corner here', () => addCorner(o, x, y));
          if (k === 'boost') {
            item('Turn arrow 15° left', () => rotateSelection(-15));
            item('Turn arrow 15° right', () => rotateSelection(15));
          } else {
            item(o.smooth ? 'Sharp corners' : 'Smooth edges', () => change(() => { o.smooth = !o.smooth; }));
          }
          item('Bigger', () => resizeSelection(1));
          item('Smaller', () => resizeSelection(-1));
        } else if (k === 'tunnel') {
          item('Swap way in and way out', () => change(() => {
            const ax = o.x1, ay = o.y1;
            o.x1 = o.x2; o.y1 = o.y2; o.x2 = ax; o.y2 = ay;
            o.exitAngle = Math.round(deg(Math.atan2(o.y2 - o.y1, o.x2 - o.x1)) / 15) * 15;
          }));
          item('Turn the exit 15° left', () => rotateSelection(-15));
          item('Turn the exit 15° right', () => rotateSelection(15));
        }
        sep();
        item('Delete ' + NAMES[k].toLowerCase(), deleteSelection, { danger: true });
      }
    } else {
      sel = null; refresh();
      head('Here');
      addHere(items, x, y, item, sep, subhead);
    }
    sep();
    item('Undo', undo, { disabled: !undoStack.length });
    item('Fit the hole on screen', () => { fitView(); render(); });

    const menu = $('ctxMenu');
    menu.innerHTML = '';
    for (const it of items) {
      if (it.sep) { const d = document.createElement('div'); d.className = 'sep'; menu.appendChild(d); continue; }
      if (it.head) { const d = document.createElement('div'); d.className = 'head'; d.textContent = it.head; menu.appendChild(d); continue; }
      if (it.sub) { const d = document.createElement('div'); d.className = 'sub'; d.textContent = it.sub; menu.appendChild(d); continue; }
      const b = document.createElement('button');
      b.className = 'item' + (it.danger ? ' danger' : '');
      b.textContent = it.label;
      b.disabled = !!it.disabled;
      b.addEventListener('click', () => { closeCtx(); it.fn(); });
      menu.appendChild(b);
    }
    menu.classList.add('on');
    // Keep it on screen.
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(clientX, window.innerWidth - mw - 6) + 'px';
    menu.style.top = Math.min(clientY, window.innerHeight - mh - 6) + 'px';
  }

  /** "Add here" choices for an empty spot. */
  function addHere(items, x, y, item, sep, subhead) {
    subhead('Add here');
    item('Wall', () => place('wall', x, y));
    item('Bumper', () => place('bumper', x, y));
    item('Bush', () => place('bush', x, y));
    item('Hill', () => place('hill', x, y));
    item('Bowl', () => { place('hill', x, y); const o = objectOf(sel); if (o) change(() => { o.height = -30; o.radius = 140; }); });
    item('Windmill', () => place('windmill', x, y));
    item('Bridge', () => place('bridge', x, y));
    if (clipboard) item('Paste ' + NAMES[clipboard.kind].toLowerCase(), () => pasteAt(x, y));
    subhead('Move here');
    item('The tee', () => place('tee', x, y));
    item('The cup', () => place('cup', x, y));
    item('Extend the fairway to here', () => extendLane(x, y));
  }

  /* ── Mouse ────────────────────────────────────────────────────────────── */

  function onMouseDown(e) {
    const cv = $('plan');
    const r = cv.getBoundingClientRect();
    mouse.sx = e.clientX - r.left; mouse.sy = e.clientY - r.top;
    const w = toWorld(mouse.sx, mouse.sy);
    closeCtx();
    // Clicking the plan takes the keyboard back from any panel field, so
    // Delete, the arrows and the shortcuts act on the plan, not the field.
    const ae = document.activeElement;
    if (ae && ae !== document.body && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(ae.tagName)) ae.blur();
    if (e.button === 2 || e.button === 1 || spaceDown || (tool === 'hand' && e.button === 0)) {
      // Right button: a drag pans; a click without moving opens the menu (see onMouseUp).
      drag = { mode: 'pan', sx: mouse.sx, sy: mouse.sy, ox: view.ox, oy: view.oy, right: e.button === 2 };
      if (tool === 'hand') cv.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'lane') { extendLane(w.x, w.y); return; }
    if (['tee', 'cup', 'wall', 'bumper', 'bush', 'windmill', 'hill', 'bridge'].includes(tool)) { place(tool, w.x, w.y, e.shiftKey); return; }
    if (REGION[tool]) {
      if (!drawing) drawing = { kind: tool, points: [] };
      const pts = drawing.points;
      if (pts.length >= 3 && dist(w.x, w.y, pts[0].x, pts[0].y) < 14 / view.s) { finishDrawing(); return; }
      pts.push({ x: sn(w.x, 5), y: sn(w.y, 5) });
      render();
      return;
    }
    if (tool === 'tunnel') {
      if (!drawing) { drawing = { kind: 'tunnel', a: { x: sn(w.x), y: sn(w.y) } }; setHint('Now click where the ball comes out'); render(); return; }
      const a = drawing.a, b = { x: sn(w.x), y: sn(w.y) };
      drawing = null;
      change(() => {
        hole().tunnels.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, radius: 28, exitAngle: Math.round(deg(Math.atan2(b.y - a.y, b.x - a.x)) / 15) * 15 });
        sel = { kind: 'tunnel', i: hole().tunnels.length - 1 };
      });
      setTool('select');
      return;
    }

    // Select tool.
    const target = hit(w.x, w.y);
    if (!target) { sel = null; refresh(); return; }
    if (target.handle) {
      beginChange();
      drag = { mode: 'handle', handle: target.handle, sel: Object.assign({}, sel), orig: JSON.parse(JSON.stringify(objectOf(sel))) };
      return;
    }
    sel = { kind: target.kind, i: target.i, part: target.part };
    beginChange();
    const o = objectOf(sel);
    drag = { mode: 'move', start: w, sel: Object.assign({}, sel), orig: JSON.parse(JSON.stringify(o)), moved: false };
    refresh();
  }

  function onMouseMove(e) {
    const cv = $('plan');
    const r = cv.getBoundingClientRect();
    mouse.sx = e.clientX - r.left; mouse.sy = e.clientY - r.top;
    const w = toWorld(mouse.sx, mouse.sy);
    mouse.x = w.x; mouse.y = w.y;
    if (!drag) {
      if (drawing) render();
      const t = tool === 'select' ? hit(w.x, w.y) : null;
      cv.style.cursor = spaceDown || tool === 'hand' ? 'grab' : tool !== 'select' ? 'crosshair' : t ? (t.handle ? 'pointer' : 'move') : 'default';
      return;
    }
    if (drag.mode === 'pan') {
      view.ox = drag.ox + (mouse.sx - drag.sx);
      view.oy = drag.oy + (mouse.sy - drag.sy);
      render();
      return;
    }
    const s = drag.sel, o = objectOf(s);
    if (!o) return;
    if (drag.mode === 'move') {
      let dx = w.x - drag.start.x, dy = w.y - drag.start.y;
      if (snapOn()) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
      if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
      moveObject(s, o, drag.orig, dx, dy);
      refreshLight();
      return;
    }
    // Handles.
    const hd = drag.handle;
    if (RECT[s.kind]) {
      const l = rectLocal(drag.orig, w.x, w.y);
      const c = rectCenter(drag.orig);
      if (hd === 'len') { o.width = Math.max(10, sn(Math.abs(l.x) * 2)); setRectCenter(o, c.x, c.y); }
      if (hd === 'wid') { o.height = Math.max(6, sn(Math.abs(l.y) * 2, 2)); setRectCenter(o, c.x, c.y); }
      if (hd === 'rot') {
        let a = deg(Math.atan2(w.y - c.y, w.x - c.x));
        if (snapOn()) a = Math.round(a / 15) * 15;
        o.angle = (a + 360) % 360;
      }
    } else if (CIRCLE[s.kind] && hd === 'rad') {
      o.radius = Math.max(6, sn(dist(w.x, w.y, o.x, o.y), 2));
    } else if (hd && hd[0] === 'v') {
      const i = parseInt(hd.slice(1), 10);
      o.points[i].x = sn(w.x, 5); o.points[i].y = sn(w.y, 5);
    } else if (hd === 'dir') {
      const c = centroid(o.points);
      let a = deg(Math.atan2(w.y - c.y, w.x - c.x));
      if (snapOn()) a = Math.round(a / 15) * 15;
      o.boostAngle = (a + 360) % 360;
    } else if (hd === 'nw') {
      o.w = U.clamp(sn(dist(w.x, w.y, o.x, o.y) * 2), 60, 900);
    } else if (hd === 'exit') {
      let a = deg(Math.atan2(w.y - o.y2, w.x - o.x2));
      if (snapOn()) a = Math.round(a / 15) * 15;
      o.exitAngle = (a + 360) % 360;
    }
    refreshLight();
  }

  function onMouseUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode === 'pan') {
      if (tool === 'hand') $('plan').style.cursor = 'grab';
      const moved = Math.hypot(mouse.sx - d.sx, mouse.sy - d.sy);
      if (d.right && moved < 5 && e) openCtx(e.clientX, e.clientY);
      return;
    }
    commit();
  }

  function onDblClick(e) {
    if (tool !== 'select') { if (drawing && REGION[drawing.kind]) finishDrawing(); return; }
    const r = $('plan').getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    const t = hit(w.x, w.y);
    if (t && (t.kind === 'fairway' || t.kind === 'node')) insertNode(w.x, w.y);
  }

  function onWheel(e) {
    e.preventDefault();
    const r = $('plan').getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = toWorld(sx, sy);
    const k = Math.exp(-e.deltaY * 0.0015);
    view.s = U.clamp(view.s * k, 0.08, 4);
    view.ox = sx - before.x * view.s;
    view.oy = sy - before.y * view.s;
    render();
  }

  /* ── Keyboard ─────────────────────────────────────────────────────────── */

  function onKeyDown(e) {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
    if (e.key === 'Escape' && $('ctxMenu').classList.contains('on')) { closeCtx(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteAt(mouse.x, mouse.y); return; }
    if (e.key === 'Escape') { if (drawing) { drawing = null; render(); } else if (tool !== 'select') setTool('select'); else { sel = null; refresh(); } return; }
    if (e.key === 'Enter') { if (drawing) finishDrawing(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); return; }
    if (e.key === '[') { resizeSelection(-1); return; }
    if (e.key === ']') { resizeSelection(1); return; }
    if (e.key === 'q' || e.key === 'Q') { rotateSelection(-15); return; }
    if (e.key === 'e' || e.key === 'E') { rotateSelection(15); return; }
    if (e.key === 'v' || e.key === 'V') { setTool('select'); return; }
    if (e.key === 'l' || e.key === 'L') { setTool('lane'); return; }
    if (e.key === 'f' || e.key === 'F') { fitView(); render(); return; }
    if (e.key === 'h' || e.key === 'H') { setTool('hand'); return; }
  }

  function onKeyUp(e) { if (e.code === 'Space') spaceDown = false; }

  /* ── Drawing the plan ─────────────────────────────────────────────────── */

  function polyPath(g, pts) {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
  }

  function arrow(g, x, y, a, len, color, width) {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width;
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    const h = Math.max(8, width * 3);
    g.beginPath();
    g.moveTo(ex + Math.cos(a) * h, ey + Math.sin(a) * h);
    g.lineTo(ex + Math.cos(a + 2.4) * h, ey + Math.sin(a + 2.4) * h);
    g.lineTo(ex + Math.cos(a - 2.4) * h, ey + Math.sin(a - 2.4) * h);
    g.closePath(); g.fill();
  }

  function render() {
    const cv = $('plan');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1a12'; g.fillRect(0, 0, w, h);
    if (!ch) return;
    const th = A.theme(hole().theme || course.theme);
    const px = 1 / view.s;

    g.save();
    g.translate(view.ox, view.oy);
    g.scale(view.s, view.s);

    // Grid.
    const tl = toWorld(0, 0), br = toWorld(w, h);
    const gs = view.s > 0.6 ? 50 : 100;
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = px;
    g.beginPath();
    for (let x = Math.floor(tl.x / gs) * gs; x < br.x; x += gs) { g.moveTo(x, tl.y); g.lineTo(x, br.y); }
    for (let y = Math.floor(tl.y / gs) * gs; y < br.y; y += gs) { g.moveTo(tl.x, y); g.lineTo(br.x, y); }
    g.stroke();

    // Carpet and rail.
    polyPath(g, ch.fairway.poly);
    g.fillStyle = th.carpet; g.fill();
    g.lineWidth = 16; g.strokeStyle = th.railStyle === 'neon' ? th.neon[0] : th.rail; g.stroke();

    // Hills: warm for mounds, cool for bowls, with the height written on.
    for (const k of hole().hills) {
      const gr = g.createRadialGradient(k.x, k.y, 0, k.x, k.y, k.radius);
      const col = k.height >= 0 ? '255,230,150' : '80,160,255';
      gr.addColorStop(0, `rgba(${col},0.45)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(k.x, k.y, k.radius, 0, Math.PI * 2); g.fill();
      g.setLineDash([8 * px, 6 * px]); g.lineWidth = 1.5 * px; g.strokeStyle = `rgba(${col},0.8)`; g.stroke(); g.setLineDash([]);
      g.fillStyle = '#fff'; g.font = `bold ${13 * px}px sans-serif`; g.textAlign = 'center';
      g.fillText((k.height >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(k.height)), k.x, k.y + 5 * px);
    }

    // Surfaces.
    const fills = { water: th.water, sand: th.sand, ice: th.ice, boost: th.glow ? '#ff3df0' : '#e8742a' };
    for (const kind of ['water', 'sand', 'ice', 'boost']) {
      ch[ARR[kind]].forEach((reg) => {
        polyPath(g, reg.poly);
        g.globalAlpha = kind === 'water' ? 0.9 : 0.95;
        g.fillStyle = fills[kind]; g.fill();
        g.globalAlpha = 1;
        if (kind === 'boost') {
          const c = centroid(reg.poly);
          arrow(g, c.x - Math.cos(rad(reg.boostAngle)) * 30, c.y - Math.sin(rad(reg.boostAngle)) * 30, rad(reg.boostAngle), 50, '#ffe14a', 6);
        }
      });
    }

    // Bridges.
    for (const b of ch.bridges) {
      g.save(); g.translate(b.cx, b.cy); g.rotate(rad(b.angle));
      g.fillStyle = '#c08a52'; g.fillRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2);
      g.strokeStyle = 'rgba(70,40,10,0.6)'; g.lineWidth = 2;
      for (let x = -b.hw + 14; x < b.hw; x += 14) { g.beginPath(); g.moveTo(x, -b.hh); g.lineTo(x, b.hh); g.stroke(); }
      g.fillStyle = '#7a4a24'; g.fillRect(-b.hw, -b.hh, b.hw * 2, 5); g.fillRect(-b.hw, b.hh - 5, b.hw * 2, 5);
      g.restore();
    }

    // Walls and windmills.
    const box = (b, fill) => { polyPath(g, C.boxCorners(b)); g.fillStyle = fill; g.fill(); };
    for (const wl of ch.walls) box(wl, th.glow ? '#3a3f8a' : '#a8463a');
    for (const m of ch.windmills) {
      for (const b of m.blocks) box(b, '#f3e6c8');
      const front = { x: m.box.cx - m.box.cos * (m.box.hw + 10), y: m.box.cy - m.box.sin * (m.box.hw + 10) };
      g.strokeStyle = '#c9412e'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(front.x - m.box.sin * m.gap / 2, front.y + m.box.cos * m.gap / 2); g.lineTo(front.x + m.box.sin * m.gap / 2, front.y - m.box.cos * m.gap / 2); g.stroke();
      g.fillStyle = '#c9412e'; g.font = `bold ${14 * px}px sans-serif`; g.textAlign = 'center';
      g.fillText('windmill', m.box.cx, m.box.cy - m.box.hh - 8 * px);
    }

    // Bushes, bumpers.
    for (const b of hole().trees) { g.beginPath(); g.arc(b.x, b.y, b.radius, 0, Math.PI * 2); g.fillStyle = '#2f7d32'; g.fill(); g.strokeStyle = '#1b4d1e'; g.lineWidth = 3; g.stroke(); }
    for (const b of hole().bumpers) {
      g.beginPath(); g.arc(b.x, b.y, b.radius, 0, Math.PI * 2); g.fillStyle = '#e8352f'; g.fill();
      g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.arc(b.x, b.y, b.radius * 0.5, 0, Math.PI * 2); g.fillStyle = '#ffd23b'; g.fill();
    }

    // Tunnels.
    for (const t of hole().tunnels) {
      const r = t.radius || 28;
      g.setLineDash([10 * px, 8 * px]); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2 * px;
      g.beginPath(); g.moveTo(t.x1, t.y1); g.lineTo(t.x2, t.y2); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(t.x1, t.y1, r, 0, Math.PI * 2); g.fillStyle = '#111'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#f2a22c'; g.stroke();
      g.beginPath(); g.arc(t.x2, t.y2, r, 0, Math.PI * 2); g.fillStyle = '#111'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#2f9e4f'; g.stroke();
      arrow(g, t.x2, t.y2, rad(t.exitAngle || 0), r + 30, '#7be08f', 5);
      g.fillStyle = '#fff'; g.font = `bold ${12 * px}px sans-serif`; g.textAlign = 'center';
      g.fillText('IN', t.x1, t.y1 + 4 * px); g.fillText('OUT', t.x2, t.y2 + 4 * px);
    }

    // Tee and cup.
    const hs = hole();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(hs.start.x - hs.start.radius * 3.5, hs.start.y - hs.start.radius * 3, hs.start.radius * 7, hs.start.radius * 6);
    g.beginPath(); g.arc(hs.start.x, hs.start.y, hs.start.radius, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2 * px; g.strokeStyle = '#000'; g.stroke();
    g.beginPath(); g.arc(hs.end.x, hs.end.y, hs.end.radius, 0, Math.PI * 2); g.fillStyle = '#050505'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ddd'; g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 3 * px; g.beginPath(); g.moveTo(hs.end.x, hs.end.y); g.lineTo(hs.end.x, hs.end.y - 60 * px); g.stroke();
    g.fillStyle = '#e8352f'; g.beginPath(); g.moveTo(hs.end.x, hs.end.y - 60 * px); g.lineTo(hs.end.x + 30 * px, hs.end.y - 50 * px); g.lineTo(hs.end.x, hs.end.y - 40 * px); g.fill();

    // Lane centre line and nodes.
    const nodes = laneNodes();
    if (nodes) {
      g.setLineDash([12 * px, 8 * px]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2 * px;
      g.beginPath(); nodes.forEach((n, i) => (i ? g.lineTo(n.x, n.y) : g.moveTo(n.x, n.y))); g.stroke(); g.setLineDash([]);
      nodes.forEach((n, i) => {
        const on = sel && sel.kind === 'node' && sel.i === i;
        g.beginPath(); g.arc(n.x, n.y, (on ? 9 : 7) * px, 0, Math.PI * 2);
        g.fillStyle = on ? '#ffc233' : 'rgba(255,255,255,0.85)'; g.fill();
        g.lineWidth = 2 * px; g.strokeStyle = '#13261d'; g.stroke();
      });
    }

    drawSelection(g, px);
    drawInProgress(g, px);
    g.restore();

    // Problems on this hole, top-left.
    const issues = issuesByHole[hi] || [];
    if (issues.length) {
      g.font = 'bold 13px sans-serif'; g.textAlign = 'left';
      issues.slice(0, 4).forEach((t, i) => {
        const tw = g.measureText('⚠ ' + t).width;
        g.fillStyle = 'rgba(120,20,15,0.85)'; g.fillRect(10, 10 + i * 24, tw + 16, 22);
        g.fillStyle = '#fff'; g.fillText('⚠ ' + t, 18, 26 + i * 24);
      });
    }
  }

  function drawSelection(g, px) {
    if (!sel) return;
    const o = objectOf(sel);
    if (!o) return;
    g.strokeStyle = '#ffc233'; g.lineWidth = 3 * px; g.setLineDash([6 * px, 4 * px]);
    if (RECT[sel.kind]) {
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => rectWorld(o, a * o.width / 2, b * o.height / 2));
      polyPath(g, corners); g.stroke();
    } else if (CIRCLE[sel.kind]) {
      g.beginPath(); g.arc(o.x, o.y, o.radius + 4 * px, 0, Math.PI * 2); g.stroke();
    } else if (REGION[sel.kind]) {
      const reg = ch[ARR[sel.kind]][sel.i];
      if (reg) { polyPath(g, reg.poly); g.stroke(); }
      g.setLineDash([]); g.strokeStyle = 'rgba(255,194,51,0.5)'; g.lineWidth = 1.5 * px;
      polyPath(g, o.points); g.stroke();
    } else if (sel.kind === 'tee' || sel.kind === 'cup') {
      g.beginPath(); g.arc(o.x, o.y, o.radius + 8 * px, 0, Math.PI * 2); g.stroke();
    } else if (sel.kind === 'tunnel') {
      g.beginPath(); g.arc(o.x1, o.y1, (o.radius || 28) + 6 * px, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(o.x2, o.y2, (o.radius || 28) + 6 * px, 0, Math.PI * 2); g.stroke();
    } else if (sel.kind === 'fairway') {
      polyPath(g, ch.fairway.poly); g.stroke();
    }
    g.setLineDash([]);
    for (const hd of handlesFor(sel)) {
      g.beginPath();
      if (hd.round || hd.small) g.arc(hd.p.x, hd.p.y, (hd.small ? 5 : 8) * px, 0, Math.PI * 2);
      else g.rect(hd.p.x - 6 * px, hd.p.y - 6 * px, 12 * px, 12 * px);
      g.fillStyle = hd.round ? '#3d9ee0' : '#ffc233'; g.fill();
      g.lineWidth = 2 * px; g.strokeStyle = '#13261d'; g.stroke();
    }
  }

  function drawInProgress(g, px) {
    if (!drawing) return;
    g.strokeStyle = '#ffffff'; g.lineWidth = 2 * px; g.setLineDash([6 * px, 4 * px]);
    if (drawing.kind === 'tunnel') {
      g.beginPath(); g.arc(drawing.a.x, drawing.a.y, 28, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(drawing.a.x, drawing.a.y); g.lineTo(mouse.x, mouse.y); g.stroke();
    } else {
      const pts = drawing.points;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (pts.length) g.lineTo(mouse.x, mouse.y);
      g.stroke();
      pts.forEach((p, i) => { g.beginPath(); g.arc(p.x, p.y, (i === 0 ? 8 : 5) * px, 0, Math.PI * 2); g.fillStyle = i === 0 ? '#ffc233' : '#fff'; g.fill(); });
    }
    g.setLineDash([]);
  }

  /* ── Panels ───────────────────────────────────────────────────────────── */

  function setHint(t) { $('hint').textContent = t || ''; }

  function setTool(t) {
    tool = t;
    drawing = null;
    document.querySelectorAll('#tools .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    setHint(HINTS[t] || '');
    render();
  }

  /** A labelled number/text/select field bound to a getter/setter; commits on change. */
  function field(label, get, set, o) {
    o = o || {};
    const row = document.createElement('label');
    row.textContent = label;
    let input;
    if (o.options) {
      input = document.createElement('select');
      for (const [v, t] of o.options) { const op = document.createElement('option'); op.value = v; op.textContent = t; input.appendChild(op); }
      input.value = get();
    } else if (o.checkbox) {
      input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!get();
    } else {
      input = document.createElement('input');
      input.type = o.text ? 'text' : 'number';
      if (o.step) input.step = o.step;
      if (o.min !== undefined) input.min = o.min;
      if (o.max !== undefined) input.max = o.max;
      const v = get();
      input.value = o.text ? v : Math.round(v * 10) / 10;
    }
    const read = () => (o.checkbox ? input.checked : o.options || o.text ? input.value : parseFloat(input.value));
    input.addEventListener('focus', beginChange);
    input.addEventListener('input', () => {
      const v = read();
      if (!o.options && !o.text && !o.checkbox && !isFinite(v)) return;
      beginChange();
      set(v);
      refreshLight();
    });
    input.addEventListener('change', () => { commit(); });
    row.appendChild(input);
    return row;
  }

  function button(text, fn, cls) {
    const b = document.createElement('button');
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    return b;
  }

  function renderProps() {
    const box = $('props');
    box.innerHTML = '';
    const o = objectOf(sel);
    if (!sel || !o) {
      $('propTitle').textContent = 'Nothing selected';
      box.innerHTML = '<p class="muted">Click something on the plan to change it, or pick a tool on the left to add something.</p>';
      return;
    }
    const k = sel.kind;
    $('propTitle').textContent = NAMES[k] + (ARR[k] ? ' ' + (sel.i + 1) : '');
    const add = (el) => box.appendChild(el);
    const xy = (ob, kx, ky) => { add(field('Across', () => ob[kx], v => { ob[kx] = v; })); add(field('Down', () => ob[ky], v => { ob[ky] = v; })); };

    if (k === 'tee') { xy(o, 'x', 'y'); add(field('Ball size', () => o.radius, v => { o.radius = U.clamp(v, 6, 80); }, { min: 6, max: 80 })); }
    else if (k === 'cup') { xy(o, 'x', 'y'); add(field('Cup size', () => o.radius, v => { o.radius = U.clamp(v, 12, 120); }, { min: 12, max: 120 })); }
    else if (k === 'node') {
      xy(o, 'x', 'y');
      add(field('Width', () => o.w || 240, v => { o.w = U.clamp(v, 60, 900); }, { min: 60, max: 900, step: 10 }));
      const row = document.createElement('div'); row.className = 'row';
      row.appendChild(button('Delete point', deleteSelection, 'danger'));
      add(row);
    } else if (k === 'fairway') {
      if (o.lane) {
        add(field('Ends', () => o.caps || 'round', v => { o.caps = v; }, { options: [['round', 'Rounded'], ['square', 'Square']] }));
        const p = document.createElement('p'); p.className = 'muted';
        p.textContent = 'Drag the white points to bend the fairway, their yellow handles to widen it. Double-click the fairway to add a point.';
        add(p);
      } else {
        const p = document.createElement('p'); p.className = 'muted';
        p.textContent = 'This fairway is an outline. Drag its corners, or pick the Fairway tool to start a new bendy one.';
        add(p);
      }
    } else if (RECT[k]) {
      const c = rectCenter(o);
      add(field('Across', () => c.x, v => setRectCenter(o, v, rectCenter(o).y)));
      add(field('Down', () => c.y, v => setRectCenter(o, rectCenter(o).x, v)));
      add(field(k === 'windmill' ? 'Depth' : 'Length', () => o.width, v => { const cc = rectCenter(o); o.width = Math.max(10, v); setRectCenter(o, cc.x, cc.y); }, { min: 10 }));
      add(field(k === 'windmill' ? 'Span' : k === 'bridge' ? 'Width' : 'Thickness', () => o.height, v => { const cc = rectCenter(o); o.height = Math.max(6, v); setRectCenter(o, cc.x, cc.y); }, { min: 6 }));
      add(field('Turn (°)', () => o.angle || 0, v => { o.angle = v; }, { step: 15 }));
      if (k === 'windmill') {
        add(field('Tunnel width', () => o.gap || 84, v => { o.gap = U.clamp(v, 30, 400); }, { min: 30, step: 2 }));
        add(field('Sail speed', () => o.speed || 1, v => { o.speed = U.clamp(v, 0.2, 4); }, { min: 0.2, max: 4, step: 0.1 }));
      }
    } else if (CIRCLE[k]) {
      xy(o, 'x', 'y');
      add(field('Size', () => o.radius, v => { o.radius = Math.max(6, v); }, { min: 6 }));
      if (k === 'hill') {
        add(field('Height', () => o.height, v => { o.height = U.clamp(v, -120, 120); }, { min: -120, max: 120, step: 5 }));
        const p = document.createElement('p'); p.className = 'muted';
        p.textContent = 'Above 0 is a mound the ball rolls off; below 0 is a bowl it rolls into. Put a small bowl round the cup to help putts drop.';
        add(p);
      }
    } else if (REGION[k]) {
      if (k !== 'boost') add(field('Smooth edges', () => o.smooth, v => { o.smooth = !!v; }, { checkbox: true }));
      if (k === 'boost') add(field('Arrow (°)', () => o.boostAngle || 0, v => { o.boostAngle = v; }, { step: 15 }));
      const p = document.createElement('p'); p.className = 'muted';
      p.textContent = { water: 'The ball sinks: one penalty stroke, back to the tee.', sand: 'Slows the ball right down.', ice: 'Slippery — the ball keeps going and may skate off line.', boost: 'Pushes the ball the way the arrow points.' }[k];
      add(p);
    } else if (k === 'tunnel') {
      add(field('In: across', () => o.x1, v => { o.x1 = v; }));
      add(field('In: down', () => o.y1, v => { o.y1 = v; }));
      add(field('Out: across', () => o.x2, v => { o.x2 = v; }));
      add(field('Out: down', () => o.y2, v => { o.y2 = v; }));
      add(field('Size', () => o.radius || 28, v => { o.radius = U.clamp(v, 16, 80); }, { min: 16, max: 80 }));
      add(field('Comes out at (°)', () => o.exitAngle || 0, v => { o.exitAngle = v; }, { step: 15 }));
    }
    if (ARR[k]) {
      const row = document.createElement('div'); row.className = 'row';
      row.appendChild(button('Duplicate', duplicateSelection));
      row.appendChild(button('Delete', deleteSelection, 'danger'));
      add(row);
    }
  }

  function renderHolePanel() {
    const h = hole();
    $('holeNumber').textContent = (hi + 1) + ' of ' + course.holes.length;
    $('holeName').value = h.name || '';
    $('holePar').value = h.par;
    $('holeTheme').value = h.theme || '';
    $('courseName').value = course.name;
    $('courseTheme').value = course.theme;
  }

  function renderTabs() {
    const box = $('holeTabs');
    box.innerHTML = '';
    course.holes.forEach((h, i) => {
      const t = document.createElement('div');
      t.className = 'holeTab' + (i === hi ? ' on' : '') + ((issuesByHole[i] || []).length ? ' bad' : '');
      t.textContent = i + 1;
      t.title = (h.name || 'Hole ' + (i + 1)) + ' · par ' + h.par + ((issuesByHole[i] || []).length ? ' · needs a look' : '');
      t.addEventListener('click', () => { if (i !== hi) { hi = i; sel = null; drawing = null; $('checkOut').innerHTML = ''; refresh(true); fitView(); render(); } });
      box.appendChild(t);
    });
  }

  function validateAll() {
    issuesByHole = course.holes.map((h) => { try { return C.validateHole(h); } catch (e) { return ['This hole could not be read: ' + e.message]; } });
  }

  /** Recompile and redraw everything. full = also rebuild side panels. */
  function refresh(full) {
    try { ch = C.compileHole(hole()); } catch (e) { console.warn(e); }
    validateAll();
    render();
    renderProps();
    renderHolePanel();
    renderTabs();
    schedule3D();
    $('btnUndo').disabled = !undoStack.length;
    $('btnRedo').disabled = !redoStack.length;
  }

  /** Cheap redraw while dragging: recompile and paint the plan only. */
  function refreshLight() {
    try { ch = C.compileHole(hole()); } catch (e) { /* mid-edit shapes can be odd */ }
    render();
    schedule3D();
  }

  /* ── Hole management ──────────────────────────────────────────────────── */

  function addHole() {
    change(() => { course.holes.push(emptyHole(course.holes.length + 1)); hi = course.holes.length - 1; sel = null; });
    fitView(); render();
  }

  function duplicateHole() {
    change(() => {
      const copy = JSON.parse(JSON.stringify(hole()));
      copy.name = (copy.name || 'Hole') + ' copy';
      course.holes.splice(hi + 1, 0, copy);
      hi++; sel = null;
    });
  }

  async function deleteHole() {
    if (course.holes.length <= 1) { toast('A course needs at least one hole', true); return; }
    if (!(await confirmBox('Delete hole ' + (hi + 1) + ' (' + (hole().name || 'unnamed') + ')? You can undo this.'))) return;
    change(() => { course.holes.splice(hi, 1); hi = Math.min(hi, course.holes.length - 1); sel = null; });
    fitView(); render();
  }

  function moveHole(dir) {
    const j = hi + dir;
    if (j < 0 || j >= course.holes.length) return;
    change(() => { const t = course.holes[hi]; course.holes[hi] = course.holes[j]; course.holes[j] = t; hi = j; });
  }

  /* ── Check Hole: rules + a quick bot ──────────────────────────────────── */

  /** Walking distance to the cup — the game's own route map (physics.routeField). */
  function distanceField(chh) {
    const rf = P.routeField(chh);
    return (x, y) => rf.at(x, y);
  }

  let checking = false;
  async function checkHole() {
    if (checking) return;
    checking = true;
    const out = $('checkOut');
    const issues = C.validateHole(hole());
    let html = issues.length ? '<div class="bad"><b>Needs a look:</b><ul>' + issues.map(t => '<li>' + U.escapeHtml(t) + '</li>').join('') + '</ul></div>' : '<div class="ok">✓ Tee, cup and fairway all look fine.</div>';
    out.innerHTML = html + '<div class="muted">The bot is trying shots…</div>';
    try {
      const chh = C.compileHole(hole());
      const field = distanceField(chh);
      const ball = P.makeBall(chh.start.x, chh.start.y, chh.ballR, 0);
      const powers = [0.07, 0.12, 0.18, 0.25, 0.34, 0.45, 0.6, 0.8, 1];
      let strokes = 0, holed = false, n = 0;
      while (strokes < 6 && !holed) {
        strokes++;
        let best = null;
        for (let a = 0; a < 360; a += 5) {
          for (const p of powers) {
            const r = P.predict(chh, ball, rad(a), p, { maxSec: 16 });
            const s = r.holed ? -1000 - (1 - p) : r.drowned ? 1e9 : field(r.end.x, r.end.y);
            if (!best || s < best.s) best = { s, r };
            if (++n % 40 === 0) await new Promise(res => setTimeout(res, 0));   // keep the page responsive
          }
        }
        if (!best || best.s >= 1e9) break;
        if (best.r.holed) { holed = true; break; }
        ball.x = best.r.end.x; ball.y = best.r.end.y;
        out.innerHTML = html + '<div class="muted">The bot is on stroke ' + (strokes + 1) + '…</div>';
      }
      if (holed) {
        const suggest = Math.max(2, strokes + 1);
        html += '<div>The bot holed it in <b>' + strokes + '</b>. It plays perfectly, so a fair par is about <b>' + suggest + '</b>.</div>';
        out.innerHTML = html;
        if (suggest !== hole().par) {
          const row = document.createElement('div'); row.className = 'row';
          row.appendChild(button('Make par ' + suggest, () => change(() => { hole().par = suggest; })));
          out.appendChild(row);
        }
      } else {
        out.innerHTML = html + '<div class="bad">The bot could not get the ball in within 6. Check there is a clear way from the tee to the cup.</div>';
      }
    } catch (e) {
      out.innerHTML = html + '<div class="bad">Check failed: ' + U.escapeHtml(e.message) + '</div>';
    }
    checking = false;
  }

  /* ── Load / save / test ───────────────────────────────────────────────── */

  const slug = (s) => (String(s || 'my course').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'my_course') + '.json';

  async function refreshLoadList() {
    const sel_ = $('loadSelect');
    sel_.innerHTML = '<option value="">Open…</option>';
    try {
      const files = await (await fetch('courses/course_list.json', { cache: 'no-store' })).json();
      for (const f of files) {
        const op = document.createElement('option');
        op.value = f;
        op.textContent = f.replace(/\.json$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        sel_.appendChild(op);
      }
    } catch (e) { /* no list (opened from disk) */ }
  }

  async function openCourse(raw, file) {
    course = editable(raw);
    hi = 0; sel = null; drawing = null;
    currentFile = file || '';
    undoStack.length = 0; redoStack.length = 0;
    dirty = false;
    refresh(true);
    fitView(); render();
  }

  async function loadFromServer(file) {
    if (!file) return;
    if (dirty && !(await confirmBox('Open "' + file + '"? Changes you have not saved will be lost.'))) { $('loadSelect').value = ''; return; }
    try {
      const raw = await (await fetch('courses/' + file, { cache: 'no-store' })).json();
      await openCourse(raw, file);
      toast('Opened ' + course.name);
    } catch (e) { toast('Could not open ' + file, true); }
    $('loadSelect').value = '';
  }

  function loadFromFile(f) {
    const r = new FileReader();
    r.onload = async () => {
      try { await openCourse(JSON.parse(r.result), ''); toast('Opened ' + course.name); }
      catch (e) { toast('That file is not a golf course', true); }
    };
    r.readAsText(f);
  }

  async function save() {
    const fname = currentFile || slug(course.name);
    const data = tidy(course);
    const issues = issuesByHole.reduce((n, l) => n + l.length, 0);
    try {
      const res = await fetch('/api/narbeminigolf/save-course', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fname, course: data })
      });
      if (res.ok) {
        const j = await res.json();
        if (j && j.success) {
          currentFile = j.filename;
          dirty = false;
          U.remove('editorDraft');
          toast('Saved — "' + course.name + '" is in the game' + (issues ? ' (' + issues + ' thing' + (issues > 1 ? 's' : '') + ' to look at)' : ''));
          refreshLoadList();
          return;
        }
      }
    } catch (e) { /* no editor server: fall back to a download */ }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    dirty = false;
    toast('Downloaded ' + fname + ' — put it in the game\'s courses folder to play it');
  }

  function testPlay() {
    U.save('testCourse', tidy(course));
    window.open('index.html?test=1&hole=' + hi, '_blank');
  }

  async function newCourse() {
    if (dirty && !(await confirmBox('Start a new course? Changes you have not saved will be lost.'))) return;
    await openCourse(emptyCourse(), '');
  }

  /* ── 3D preview (on demand only) ──────────────────────────────────────── */

  const p3 = { on: false, renderer: null, scene: null, camera: null, view: null, ball: null, yaw: -0.9, pitch: 0.75, dist: 60, target: new THREE.Vector3(), timer: null, dragging: null, frame: false };

  function toggle3D() {
    p3.on = !p3.on;
    $('previewWrap').classList.toggle('on', p3.on);
    $('btn3d').classList.toggle('primary', p3.on);
    if (p3.on) { init3D(); rebuild3D(); }
  }

  function init3D() {
    if (p3.renderer) return;
    const cv = $('preview');
    p3.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    p3.renderer.setPixelRatio(1);
    p3.renderer.outputColorSpace = THREE.SRGBColorSpace;
    p3.renderer.useLegacyLights = false;
    p3.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    p3.renderer.shadowMap.enabled = true;
    p3.renderer.shadowMap.type = THREE.PCFShadowMap;
    p3.scene = new THREE.Scene();
    p3.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
    MG.scene.initEnvironment(p3.renderer, p3.scene);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pan = e.button === 2 || e.shiftKey || p3.hand;
      p3.dragging = { x: e.clientX, y: e.clientY, yaw: p3.yaw, pitch: p3.pitch, pan, target: p3.target.clone() };
      cv.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!p3.dragging) return;
      const dx = e.clientX - p3.dragging.x, dy = e.clientY - p3.dragging.y;
      if (p3.dragging.pan) {
        // Slide the point we orbit round across the ground, in screen directions.
        const k = p3.dist * 0.0016;
        const rx = Math.sin(p3.yaw), rz = -Math.cos(p3.yaw);          // camera right, on the ground
        const fx = -Math.cos(p3.yaw), fz = -Math.sin(p3.yaw);         // camera forward, on the ground
        p3.target.set(p3.dragging.target.x - (rx * dx - fx * dy) * k, p3.dragging.target.y, p3.dragging.target.z - (rz * dx - fz * dy) * k);
      } else {
        p3.yaw = p3.dragging.yaw - dx * 0.008;
        p3.pitch = U.clamp(p3.dragging.pitch + dy * 0.006, 0.15, 1.45);
      }
      request3D();
    });
    window.addEventListener('mouseup', () => { if (p3.dragging) { p3.dragging = null; cv.style.cursor = 'grab'; } });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); p3.dist = U.clamp(p3.dist * Math.exp(e.deltaY * 0.0012), 8, 200); request3D(); }, { passive: false });
  }

  function schedule3D() {
    if (!p3.on) return;
    clearTimeout(p3.timer);
    p3.timer = setTimeout(rebuild3D, 450);
  }

  function rebuild3D() {
    if (!p3.on || !p3.renderer || !ch) return;
    const themeName = hole().theme || course.theme;
    const th = MG.scene.setTheme(themeName);
    if (p3.view) { p3.scene.remove(p3.view.group); p3.view.dispose(); }
    if (p3.ball) { p3.scene.remove(p3.ball); p3.ball.geometry.dispose(); }
    p3.view = MG.scene.buildHole(ch, hi + 1, themeName);
    p3.scene.add(p3.view.group);
    MG.scene.fitShadows(p3.view.centre.x, p3.view.centre.z, p3.view.radius, th);
    p3.ball = A.makeBall('white', ch.ballR * C.S);
    p3.ball.position.copy(p3.view.toWorld(ch.start.x, ch.start.y, ch.ballR * C.S));
    p3.scene.add(p3.ball);
    p3.view.update(0.016, 1.3);
    if (!p3.fitted) { p3.target.set(p3.view.centre.x, 0, p3.view.centre.z); p3.dist = p3.view.radius * 1.5 + 10; p3.fitted = true; }
    request3D();
  }

  function request3D() {
    if (p3.frame) return;
    p3.frame = true;
    requestAnimationFrame(() => {
      p3.frame = false;
      if (!p3.on || !p3.renderer) return;
      const cv = $('preview');
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w < 10 || h < 10) return;
      p3.renderer.setSize(w, h, false);
      p3.camera.aspect = w / h;
      p3.camera.updateProjectionMatrix();
      const ce = Math.cos(p3.pitch), se = Math.sin(p3.pitch);
      p3.camera.position.set(p3.target.x + Math.cos(p3.yaw) * ce * p3.dist, p3.target.y + se * p3.dist, p3.target.z + Math.sin(p3.yaw) * ce * p3.dist);
      p3.camera.lookAt(p3.target);
      p3.renderer.render(p3.scene, p3.camera);
    });
  }

  /* ── Little UI bits ───────────────────────────────────────────────────── */

  let toastTimer = null;
  function toast(text, bad) {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }

  function confirmBox(text) {
    return new Promise((resolve) => {
      $('dialogText').textContent = text;
      $('dialog').classList.add('on');
      const done = (v) => { $('dialog').classList.remove('on'); $('dialogYes').onclick = $('dialogNo').onclick = null; resolve(v); };
      $('dialogYes').onclick = () => done(true);
      $('dialogNo').onclick = () => done(false);
    });
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */

  async function init() {
    const cv = $('plan');
    cv.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    cv.addEventListener('dblclick', onDblClick);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => { render(); request3D(); });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    document.querySelectorAll('#tools .tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('btnUndo').addEventListener('click', undo);
    $('btnRedo').addEventListener('click', redo);
    $('btnSave').addEventListener('click', save);
    $('btnTest').addEventListener('click', testPlay);
    $('btnNew').addEventListener('click', newCourse);
    $('btnOpenFile').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFromFile(f); e.target.value = ''; });
    $('loadSelect').addEventListener('change', (e) => loadFromServer(e.target.value));
    $('btn3d').addEventListener('click', toggle3D);
    $('previewHand').addEventListener('click', () => {
      p3.hand = !p3.hand;
      $('previewHand').classList.toggle('on', p3.hand);
      $('previewHelp').innerHTML = p3.hand ? 'drag to move &middot; wheel to zoom' : 'drag to turn &middot; right-drag to move &middot; wheel to zoom';
    });
    $('previewReset').addEventListener('click', () => { p3.fitted = false; rebuild3D(); });
    $('btnFit').addEventListener('click', () => { fitView(); render(); });
    document.addEventListener('mousedown', (e) => { if (!$('ctxMenu').contains(e.target)) closeCtx(); });
    window.addEventListener('blur', closeCtx);
    $('previewClose').addEventListener('click', toggle3D);
    $('btnAddHole').addEventListener('click', addHole);
    $('btnDupHole').addEventListener('click', duplicateHole);
    $('btnDelHole').addEventListener('click', deleteHole);
    $('btnMoveLeft').addEventListener('click', () => moveHole(-1));
    $('btnMoveRight').addEventListener('click', () => moveHole(1));
    $('btnCheck').addEventListener('click', checkHole);
    $('snap').addEventListener('change', render);

    const bindText = (id, set) => {
      const el = $(id);
      el.addEventListener('focus', beginChange);
      el.addEventListener('input', () => { beginChange(); set(el.value); renderTabs(); });
      el.addEventListener('change', commit);
    };
    bindText('courseName', v => { course.name = v; });
    bindText('holeName', v => { hole().name = v; });
    $('holePar').addEventListener('change', () => change(() => { hole().par = U.clamp(parseInt($('holePar').value, 10) || 2, 1, 9); }));
    $('holeTheme').addEventListener('change', () => change(() => { const v = $('holeTheme').value; if (v) hole().theme = v; else delete hole().theme; }));
    $('courseTheme').addEventListener('change', () => change(() => { course.theme = $('courseTheme').value; }));

    await refreshLoadList();

    const draft = U.load('editorDraft', null);
    if (draft && draft.course && await confirmBox('You have unsaved work from ' + new Date(draft.at).toLocaleString() + ' ("' + (draft.course.name || 'My Course') + '"). Carry on with it?')) {
      await openCourse(draft.course, draft.file || '');
      dirty = true;
    } else {
      await openCourse(emptyCourse(), '');
    }
    setTool('select');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
