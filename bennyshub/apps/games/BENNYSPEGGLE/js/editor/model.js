/* Campaign editor helpers. Shared with its browser and Node checks. */
(function (root) {
  'use strict';
  const P3 = root.P3, C = P3.catalog, L = P3.levels, U = P3.util, B = C.BOARD;
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = () => 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  function newLevel(mode, index, starter) {
    const items = starter ? pattern({ type: 'grid', x: 500, y: 470, width: 540, height: 280, count: 7, rows: 4 }, { t: 'peg', r: 17, c: 'blue' }) : [];
    if (starter) items.forEach((p, i) => { p.c = i % 3 === 0 ? 'orange' : 'blue'; });
    return L.normLevel({ name: 'Level ' + (index + 1), goal: { type: 'clear' }, balls: 15, items }, mode, index);
  }
  function newCampaign() {
    return L.normCampaign({ id: uid(), title: 'My Campaign', mode: 'vivid', theme: 'sugar-rush', levels: [newLevel('vivid', 0, true)] });
  }
  function bounds(it, pose) {
    const x = pose ? pose.x : it.x, y = pose ? pose.y : it.y;
    const a = pose ? pose.a : U.rad(it.a || 0);
    const rx = it.r || (Math.abs(Math.cos(a)) * it.w + Math.abs(Math.sin(a)) * it.h) / 2;
    const ry = it.r || (Math.abs(Math.sin(a)) * it.w + Math.abs(Math.cos(a)) * it.h) / 2;
    return { x1: x - rx, x2: x + rx, y1: y - ry, y2: y + ry };
  }
  function clampItem(it) {
    const b = bounds(it), rx = (b.x2 - b.x1) / 2, ry = (b.y2 - b.y1) / 2;
    it.x = U.clamp(it.x, B.MARGIN + rx, B.W - B.MARGIN - rx);
    it.y = U.clamp(it.y, B.SAFE_TOP + ry, B.SAFE_BOTTOM - ry);
    return it;
  }
  function hit(it, x, y) {
    const dx = x - it.x, dy = y - it.y;
    if (it.r) return dx * dx + dy * dy <= (it.r + 7) ** 2;
    const a = U.rad(it.a || 0), c = Math.cos(a), s = Math.sin(a);
    return Math.abs(dx * c + dy * s) <= it.w / 2 + 6 && Math.abs(-dx * s + dy * c) <= it.h / 2 + 6;
  }
  function pattern(o, template) {
    const points = [], n = U.clamp(Math.round(o.count || 8), 2, 40), rows = U.clamp(Math.round(o.rows || 4), 1, 20);
    const w = +o.width || 450, h = +o.height || 300;
    if (o.type === 'single') points.push([0, 0]);
    else if (o.type === 'grid') {
      for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) points.push([(i / (n - 1) - .5) * w, rows === 1 ? 0 : (j / (rows - 1) - .5) * h]);
    } else if (o.type === 'star') {
      const vertices = Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? .22 : .5; return [Math.cos(a) * w * r, Math.sin(a) * h * r]; });
      for (let i = 0; i < n; i++) { const t = i * 10 / n, j = Math.floor(t), f = t - j, a = vertices[j], b = vertices[(j + 1) % 10]; points.push([U.lerp(a[0], b[0], f), U.lerp(a[1], b[1], f)]); }
    } else {
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1), a = i / n * U.TAU;
        if (o.type === 'line') points.push([(f - .5) * w, 0]);
        else if (o.type === 'arc') points.push([Math.cos(Math.PI * f) * w / 2, -Math.sin(Math.PI * f) * h / 2 + h / 4]);
        else if (o.type === 'spiral') points.push([Math.cos(f * U.TAU * 2) * w / 2 * (.1 + .9 * f), Math.sin(f * U.TAU * 2) * h / 2 * (.1 + .9 * f)]);
        else if (o.type === 'heart') points.push([Math.pow(Math.sin(a), 3) * w / 2, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a) + 2) * h / 32]);
        else points.push([Math.cos(a) * w / 2, Math.sin(a) * h / 2]);
      }
    }
    const r = U.rad(o.angle || 0), c = Math.cos(r), s = Math.sin(r);
    return points.map(([x, y]) => L.normItem(Object.assign({}, template, { x: (o.x || 0) + x * c - y * s, y: (o.y || 0) + x * s + y * c })));
  }
  function symmetry(items, kind) {
    const out = [], seen = new Set();
    const axes = kind === 'both' ? [[false, false], [true, false], [false, true], [true, true]] : kind === 'x' ? [[false, false], [true, false]] : kind === 'y' ? [[false, false], [false, true]] : [[false, false]];
    for (const item of items) for (const [mx, my] of axes) {
      const p = copy(item);
      if (mx) p.x = B.W - p.x;
      if (my) p.y = B.SAFE_TOP + B.SAFE_BOTTOM - p.y;
      if (p.a !== undefined && (mx !== my)) p.a = -p.a;
      if (p.m) {
        const m = p.m;
        if (m.type === 'rotate') { if (mx) m.cx = B.W - m.cx; if (my) m.cy = B.SAFE_TOP + B.SAFE_BOTTOM - m.cy; if (mx !== my) m.speed = -m.speed; }
        if (m.type === 'slide') { if (mx) m.dx = -m.dx; if (my) m.dy = -m.dy; }
        if (m.type === 'orbit') { if (mx) { m.phase = .5 - m.phase; m.speed = -m.speed; } if (my) { m.phase = -m.phase; m.speed = -m.speed; } m.phase = ((m.phase % 1) + 1) % 1; }
      }
      clampItem(p);
      const key = p.t + ':' + p.x.toFixed(2) + ':' + p.y.toFixed(2);
      if (!seen.has(key)) { seen.add(key); out.push(L.normItem(p)); }
    }
    return out;
  }
  function problems(level, mode) {
    const out = L.levelProblems(level), breakable = level.items.filter(i => C.isBreakablePeg(i.t)).length;
    if (level.goal.type === 'count' && level.goal.count > breakable) out.push('The peg goal asks for more breakable pegs than this level contains.');
    if (level.goal.type === 'chain' && level.goal.chain > breakable) out.push('The chain goal is larger than the number of breakable pegs.');
    if (mode === 'cozy' && level.items.some(p => p.t === 'spike' || p.t === 'hole')) out.push('Cozy protects balls from spikes and black holes; choose another mode if those hazards should pop balls.');
    let unsafe = 0, movingUnsafe = 0, overlap = 0;
    const outside = b => b.x1 < B.MARGIN - 1 || b.x2 > B.W - B.MARGIN + 1 || b.y1 < B.SAFE_TOP - 1 || b.y2 > B.SAFE_BOTTOM + 1;
    for (const it of level.items) {
      if (outside(bounds(it))) unsafe++;
      if (it.m) {
        const b = P3.physics.makeBody(it, 0), period = it.m.type === 'slide' ? it.m.period : 360 / Math.max(.1, Math.abs(it.m.speed)), pose = {};
        for (let j = 0; j <= 32; j++) { P3.physics.poseAt(b, j / 32 * period, pose); if (outside(bounds(it, pose))) { movingUnsafe++; break; } }
      }
    }
    for (let i = 0; i < level.items.length; i++) {
      const a = level.items[i];
      if (!a.r) continue;
      for (let j = i + 1; j < level.items.length; j++) { const b = level.items[j]; if (b.r && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 1) overlap++; }
    }
    if (unsafe) out.push(unsafe + ' piece(s) extend outside the safe placement area.');
    if (movingUnsafe) out.push(movingUnsafe + ' moving piece(s) leave the safe area during their motion.');
    if (overlap) out.push(overlap + ' overlapping peg pair(s). Leave space for the ball to pass.');
    return out;
  }
  P3.editorTools = { copy, uid, newLevel, newCampaign, bounds, clampItem, hit, pattern, symmetry, problems };
})(typeof window !== 'undefined' ? window : globalThis);
