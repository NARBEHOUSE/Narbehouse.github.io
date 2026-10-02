/**
 * Benny's P3GL — campaign and level files.
 *
 * Format v3 ("bennys-peggle-levels-v3"):
 *
 *   { format, id, title, mode: 'cozy'|'vivid'|'hyper', theme, blurb, author,
 *     levels: [ {
 *       name, intro,
 *       goal:  { type: 'clear'|'color'|'gems'|'lanterns'|'bricks'|'score'|'count'|'chain',
 *                color?, score?, count?, chain? },
 *       balls, gravity (×mode), speed (×mode), stars: [twoStar, threeStar],
 *       plate: { w, speed, mode: 'bounce'|'catch'|'timed', period, x },
 *       guide?: 'short'|'medium'|'long',   // overrides the mode's default
 *       bg?: number,                       // backdrop variant within the theme
 *       items: [
 *         { t: 'peg'|..., x, y, r, c?, k?, p?, m? }            pegs
 *         { t: 'brick'|..., x, y, w, h, a, hp?, k?, m? }       bricks
 *       ] } ] }
 *
 *   c: peg colour, k: key/gate colour, p: portal pair number,
 *   m: motion — { type:'rotate', cx, cy, speed }      degrees per second
 *               { type:'slide', dx, dy, period, phase }
 *               { type:'orbit', r, speed, phase }
 *
 * Older files still open: v1 (Benny's original 820 × 540 board) and v2 (the
 * arcade campaigns). They are mapped onto the new board and new peg types.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const C = P3.catalog;
  const U = P3.util;
  const B = C.BOARD;

  const FORMAT = 'bennys-peggle-levels-v3';
  const MAX_LEVELS = 40;
  const MAX_ITEMS = 320;

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : d));
  const str = (v, d, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max || 120) : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);

  /* ── Items ────────────────────────────────────────────────────────────── */

  function normMotion(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.type === 'rotate') {
      const speed = U.clamp(num(m.speed, 30), -360, 360);
      if (!speed) return null;
      return { type: 'rotate', cx: U.clamp(num(m.cx, B.W / 2), 0, B.W), cy: U.clamp(num(m.cy, B.H / 2), 0, B.H), speed };
    }
    if (m.type === 'slide') {
      const dx = U.clamp(num(m.dx, 0), -800, 800), dy = U.clamp(num(m.dy, 0), -800, 800);
      if (!dx && !dy) return null;
      return { type: 'slide', dx, dy, period: U.clamp(num(m.period, 4), 0.5, 60), phase: U.clamp(num(m.phase, 0), 0, 1) };
    }
    if (m.type === 'orbit') {
      const r = U.clamp(num(m.r, 40), 4, 400);
      return { type: 'orbit', r, speed: U.clamp(num(m.speed, 90), -720, 720), phase: U.clamp(num(m.phase, 0), 0, 1) };
    }
    return null;
  }

  function normItem(src) {
    if (!src || typeof src !== 'object') return null;
    const t = src.t;
    const def = Object.prototype.hasOwnProperty.call(C.TYPES, t) && C.TYPES[t];
    if (!def) return null;
    const it = { t };
    it.x = U.clamp(num(src.x, B.W / 2), 0, B.W);
    it.y = U.clamp(num(src.y, B.H / 2), 0, B.H);
    if (def.shape === 'peg') {
      const dr = t === 'hole' ? 26 : t === 'portal' ? 22 : t === 'bumper' ? 20 : 17;
      it.r = U.clamp(num(src.r, dr), 8, t === 'hole' ? 60 : 40);
      if (t === 'peg') it.c = pick(src.c, C.PEG_COLOR_IDS, 'blue');
      if (t === 'key') it.k = pick(src.k, C.KEY_COLORS, 'blue');
      if (t === 'portal') it.p = U.clamp(Math.round(num(src.p, 0)), 0, C.PORTAL_COLORS.length - 1);
    } else {
      it.w = U.clamp(num(src.w, 64), 10, 600);
      it.h = U.clamp(num(src.h, 22), 10, 300);
      it.a = ((num(src.a, 0) % 360) + 360) % 360;
      if (t === 'brick') it.hp = U.clamp(Math.round(num(src.hp, 1)), 1, 4);
      if (t === 'armor') it.hp = U.clamp(Math.round(num(src.hp, 1)), 1, 3);
      if (t === 'gate') it.k = pick(src.k, C.KEY_COLORS, 'blue');
    }
    const m = normMotion(src.m);
    if (m) it.m = m;
    return it;
  }

  /* ── Levels ───────────────────────────────────────────────────────────── */

  function normGoal(g, items) {
    g = g && typeof g === 'object' ? g : {};
    const type = pick(g.type, Object.keys(C.GOALS), 'clear');
    const goal = { type };
    if (type === 'color') {
      const present = C.PEG_COLOR_IDS.filter(c => items.some(i => i.t === 'peg' && i.c === c));
      goal.color = pick(g.color, C.PEG_COLOR_IDS, present.includes('orange') ? 'orange' : (present[0] || 'orange'));
    }
    if (type === 'score') goal.score = U.clamp(Math.round(num(g.score, 30000)), 1000, 5000000);
    if (type === 'count') {
      const breakable = items.filter(i => C.isBreakablePeg(i.t)).length;
      goal.count = U.clamp(Math.round(num(g.count, Math.ceil(breakable * 0.6))), 1, Math.max(1, breakable));
    }
    if (type === 'chain') goal.chain = U.clamp(Math.round(num(g.chain, 10)), 2, 200);
    return goal;
  }

  function normPlate(p, modeId) {
    const base = (C.MODES[modeId] || C.MODES.vivid).plate;
    p = p && typeof p === 'object' ? p : {};
    return {
      w: U.clamp(num(p.w, base.w), 80, 700),
      speed: U.clamp(num(p.speed, base.speed), 0, 600),
      mode: pick(p.mode, ['bounce', 'catch', 'timed'], base.mode),
      period: U.clamp(num(p.period, 4), 0.5, 30),
      x: U.clamp(num(p.x, B.W / 2), 40, B.W - 40)
    };
  }

  function normLevel(src, modeId, index) {
    src = src && typeof src === 'object' ? src : {};
    const items = (Array.isArray(src.items) ? src.items : []).slice(0, MAX_ITEMS).map(normItem).filter(Boolean);
    const lv = {
      name: str(src.name, 'Level ' + (index + 1), 60),
      intro: str(src.intro, '', 300),
      goal: normGoal(src.goal, items),
      balls: U.clamp(Math.round(num(src.balls, 10)), 1, 50),
      gravity: U.clamp(num(src.gravity, 1), 0.5, 1.6),
      speed: U.clamp(num(src.speed, 1), 0.7, 1.4),
      plate: normPlate(src.plate, modeId),
      items
    };
    if (src.guide && C.GUIDES[src.guide] && src.guide !== 'super') lv.guide = src.guide;
    if (typeof src.bg === 'number') lv.bg = Math.max(0, Math.round(src.bg));
    if (Array.isArray(src.stars) && src.stars.length === 2) {
      const a = Math.round(num(src.stars[0], 0)), b = Math.round(num(src.stars[1], 0));
      if (a > 0 && b > a) lv.stars = [a, b];
    }
    return lv;
  }

  /** What the goal needs, counted from the level's own items. */
  function goalTotal(level) {
    const g = level.goal, items = level.items;
    switch (g.type) {
      case 'clear': return items.filter(i => C.countsForClear(i.t)).length;
      case 'color': return items.filter(i => i.t === 'peg' && i.c === g.color).length;
      case 'gems': return items.filter(i => i.t === 'gem').length;
      case 'lanterns': return items.filter(i => i.t === 'lantern').length;
      case 'bricks': return items.filter(i => C.isBreakableBrick(i.t)).length;
      case 'score': return g.score;
      case 'count': return g.count;
      case 'chain': return g.chain;
    }
    return 0;
  }

  /** Problems a level author should know about. Empty array = playable. */
  function levelProblems(level) {
    const out = [];
    const total = goalTotal(level);
    const g = level.goal;
    if (!level.items.length) out.push('The level is empty.');
    if (['clear', 'color', 'gems', 'lanterns', 'bricks'].includes(g.type) && total === 0) {
      const what = g.type === 'color' ? C.PEG_COLORS[g.color].name + ' pegs' : { clear: 'pegs to break', gems: 'gems', lanterns: 'lanterns', bricks: 'breakable bricks' }[g.type];
      out.push('The goal needs ' + what + ', but there are none.');
    }
    if (g.type === 'count' && !level.items.some(i => C.isBreakablePeg(i.t))) out.push('The goal needs pegs to break, but there are none.');
    if (g.type === 'chain' && level.items.filter(i => C.isBreakablePeg(i.t) || C.isBreakableBrick(i.t) || i.t === 'lantern').length < g.chain) {
      out.push('The chain goal needs at least ' + g.chain + ' pegs, lanterns or breakable bricks.');
    }
    if (g.type === 'bricks' && level.items.some(i => i.t === 'armor') && !level.items.some(i => i.t === 'blast' || i.t === 'fire' || i.t === 'zap')) {
      out.push('Armour bricks need a Blast ball, Fireball or Lightning peg to break.');
    }
    const portals = {};
    level.items.filter(i => i.t === 'portal').forEach(i => { portals[i.p] = (portals[i.p] || 0) + 1; });
    Object.keys(portals).forEach(p => { if (portals[p] !== 2) out.push('Portal pair ' + (+p + 1) + ' needs exactly two portals.'); });
    const keys = new Set(level.items.filter(i => i.t === 'key').map(i => i.k));
    level.items.filter(i => i.t === 'gate').forEach(i => { if (!keys.has(i.k)) out.push('A ' + i.k + ' gate has no ' + i.k + ' key.'); });
    return Array.from(new Set(out));
  }

  /** Default star thresholds when a level does not set its own. */
  function defaultStars(level, modeId) {
    let base = 0;
    for (const it of level.items) {
      const d = C.TYPES[it.t];
      if (!d) continue;
      if (C.isBreakablePeg(it.t) || it.t === 'lantern') base += d.points;
      else if (C.isBreakableBrick(it.t)) base += d.points;
    }
    if (level.goal.type === 'score') base = Math.max(base, level.goal.score);
    const k = modeId === 'cozy' ? 1.6 : modeId === 'vivid' ? 2.2 : 2.6;
    const two = Math.round(base * k / 500) * 500;
    return [Math.max(1000, two), Math.max(2000, Math.round(two * 1.7 / 500) * 500)];
  }

  function starsFor(level, modeId) { return level.stars || defaultStars(level, modeId); }

  /* ── Campaigns ────────────────────────────────────────────────────────── */

  function normCampaign(src) {
    src = src && typeof src === 'object' ? src : {};
    const mode = pick(src.mode, C.MODE_IDS, 'vivid');
    const levels = (Array.isArray(src.levels) ? src.levels : []).slice(0, MAX_LEVELS).map((l, i) => normLevel(l, mode, i));
    return {
      format: FORMAT,
      id: str(src.id, 'custom-' + U.hash(JSON.stringify(levels)).toString(36), 80).replace(/[^a-z0-9_-]/gi, '-').toLowerCase(),
      title: str(src.title, 'My Campaign', 60),
      mode,
      theme: str(src.theme, defaultTheme(mode), 40),
      blurb: str(src.blurb, '', 240),
      author: str(src.author, '', 60),
      cover: str(src.cover, '', 200000),
      levels
    };
  }

  function defaultTheme(mode) {
    return mode === 'cozy' ? 'lantern-garden' : mode === 'hyper' ? 'neon-highway' : 'candy-coast';
  }

  /**
   * Read anything that might be a campaign: a v3 campaign, a bare v3 level,
   * or an old v1/v2 pack. Returns { campaign, notes } or throws a plain-words
   * error.
   */
  function readCampaign(raw) {
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { throw new Error('That file is not a P3GL campaign (it is not valid JSON).'); }
    }
    if (!raw || typeof raw !== 'object') throw new Error('That file is not a P3GL campaign.');
    const notes = [];
    let camp;
    if (raw.format === FORMAT || (Array.isArray(raw.levels) && raw.levels.some(l => l && Array.isArray(l.items)))) {
      camp = normCampaign(raw);
    } else if (Array.isArray(raw.items)) {
      camp = normCampaign({ title: raw.name || 'One level', mode: 'vivid', levels: [raw] });
    } else {
      camp = migrateOld(raw);
      notes.push('This campaign was made for the older P3GL. It has been moved onto the new board.');
    }
    if (!camp.levels.length) throw new Error('That campaign has no levels in it.');
    camp.levels.forEach((lv, i) => {
      const p = levelProblems(lv);
      if (p.length) notes.push('Level ' + (i + 1) + ': ' + p.join(' '));
    });
    return { campaign: camp, notes };
  }

  /* ── Old packs (v1 and v2) ────────────────────────────────────────────── */

  const OLD_W = 820;
  const mapX = (x) => U.clamp(x * (B.W / OLD_W), 30, B.W - 30);
  const mapY = (y) => U.clamp(170 + (y - 110) * (800 / 390), 160, 975);

  const V1_TYPES = { NORMAL: 'peg', HAZARD: 'thief', EXTRA: 'extra', MULTI: 'multiplier', MULTIBALL: 'multiball', SPRAY: 'spray', INVINCIBLE: 'net', EXPLODE: 'blast' };
  const V2_TYPES = { NORMAL: 'peg', TARGET: 'peg', GEM: 'gem', EXTRA: 'extra', EXPLODE: 'zap', MULTIBALL: 'multiball' };
  const V2_POWERS = { ghost: 'fire', blast: 'blast', multiball: 'spray', fireball: 'fire', echo: 'net', magnet: 'net', guide: 'guide' };
  const OLD_COLORS = ['blue', 'teal', 'purple', 'pink', 'green'];

  function migrateOld(raw) {
    let input = Array.isArray(raw) ? raw : raw.levels;
    if (!Array.isArray(input) && input && typeof input === 'object') {
      input = Object.keys(input).sort((a, b) => a - b).map(k => ({ pegs: input[k] }));
    }
    if (!Array.isArray(input)) {
      const keys = Object.keys(raw).filter(k => /^\d+$/.test(k));
      if (keys.length) input = keys.sort((a, b) => a - b).map(k => ({ pegs: raw[k] }));
    }
    if (!Array.isArray(input) || !input.length) throw new Error('That file is not a P3GL campaign.');
    const meta = raw.meta || {};
    const v2 = meta.format === 'bennys-peggle-levels-v2';
    const levels = input.slice(0, MAX_LEVELS).map((lvSrc, li) => {
      const lv = Array.isArray(lvSrc) ? { pegs: lvSrc } : (lvSrc || {});
      const pegs = Array.isArray(lv.pegs) ? lv.pegs : [];
      const items = [];
      pegs.forEach((p, pi) => {
        if (!p || typeof p !== 'object') return;
        const T = String(p.block ? 'BLOCK' : (p.type || 'NORMAL')).toUpperCase();
        const x = mapX(num(p.x, 410)), y = mapY(num(p.y, 300));
        const r = U.clamp(num(p.radius, 16) * 1.12, 12, 26);
        if (T === 'BLOCK') { items.push({ t: v2 ? 'wall' : 'armor', x, y, w: r * 2.2, h: r * 2.2, a: 0, hp: 2 }); return; }
        let t = (v2 ? V2_TYPES : V1_TYPES)[T];
        if (T === 'POWER') t = V2_POWERS[p.power] || 'blast';
        if (!t) t = 'peg';
        const it = { t, x, y, r };
        if (t === 'peg') it.c = T === 'TARGET' ? 'orange' : OLD_COLORS[(U.hash(li + ':' + pi) >>> 0) % OLD_COLORS.length];
        items.push(it);
      });
      let goal = { type: 'clear' };
      if (v2) {
        if (lv.objective === 'targets') goal = { type: 'color', color: 'orange' };
        else if (lv.objective === 'gems') goal = { type: 'gems' };
        else if (lv.objective === 'score') goal = { type: 'score', score: Math.max(5000, num(lv.goal, 2000) * 10) };
      }
      spreadOut(items);
      return {
        name: str(lv.title, 'Level ' + (li + 1), 60),
        intro: str(lv.story, '', 300),
        goal,
        balls: U.clamp(Math.round(num(lv.shots, num(lv.balls, 10))), 3, 30),
        plate: v2 ? { w: 240, speed: 160, mode: 'bounce' } : { w: 420, speed: 100, mode: 'bounce' },
        items
      };
    });
    return normCampaign({
      id: 'imported-' + U.hash(JSON.stringify(levels)).toString(36),
      title: str(meta.title, 'Imported Campaign', 60),
      mode: 'vivid',
      theme: 'candy-coast',
      blurb: str(meta.story, '', 240),
      levels
    });
  }

  /** Push overlapping pegs apart (old boards were packed tighter). */
  function spreadOut(items) {
    for (let pass = 0; pass < 30; pass++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          const ra = a.r || Math.max(a.w, a.h) / 2, rb = b.r || Math.max(b.w, b.h) / 2;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          const min = ra + rb + 6;
          if (d < min) {
            const push = (min - d) / 2, nx = d ? dx / d : 1, ny = d ? dy / d : 0;
            a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
            moved = true;
          }
        }
      }
      for (const it of items) { it.x = U.clamp(it.x, 30, B.W - 30); it.y = U.clamp(it.y, 160, 975); }
      if (!moved) break;
    }
  }

  /* ── Loading built-in campaigns ───────────────────────────────────────── */

  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ': ' + r.status);
    return r.json();
  }

  /** campaigns/index.json → [{ id, file, mode, title, theme, blurb, cover }] */
  async function loadIndex(base) {
    base = base || 'campaigns/';
    try { return (await fetchJson(base + 'index.json')).campaigns || []; } catch (e) { console.warn('P3GL: no campaign index', e); return []; }
  }

  const cache = {};
  async function loadCampaign(entry, base) {
    base = base || 'campaigns/';
    if (cache[entry.id]) return cache[entry.id];
    const raw = await fetchJson(base + entry.file);
    const camp = normCampaign(raw);
    camp.id = entry.id;
    if (entry.cover && !camp.cover) camp.cover = entry.cover;
    cache[entry.id] = camp;
    return camp;
  }

  /* ── Your own campaigns (made in the editor or opened from a file) ────── */

  const LIB_KEY = 'library';
  function library() { const l = U.load(LIB_KEY, []); return Array.isArray(l) ? l.map(normCampaign) : []; }
  function saveToLibrary(camp) {
    const list = library().filter(c => c.id !== camp.id);
    list.unshift(normCampaign(camp));
    while (list.length > 30) list.pop();
    return U.save(LIB_KEY, list);
  }
  function removeFromLibrary(id) { U.save(LIB_KEY, library().filter(c => c.id !== id)); }

  P3.levels = {
    FORMAT, MAX_LEVELS, MAX_ITEMS,
    normItem, normLevel, normCampaign, normMotion, readCampaign, migrateOld,
    goalTotal, levelProblems, defaultStars, starsFor,
    loadIndex, loadCampaign, library, saveToLibrary, removeFromLibrary
  };
})(typeof window !== 'undefined' ? window : globalThis);
