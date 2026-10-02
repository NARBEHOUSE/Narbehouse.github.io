/**
 * Benny's P3GL — build the built-in campaigns.
 *
 *   node tools/build-campaigns.cjs [cozy|vivid|hyper|original|all] [--bot] [--runs 3] [--levels 1-5] [--only <campaign-id>]
 *
 * Reads tools/campaigns/<mode>.cjs (an array of three campaigns), checks every
 * level, optionally plays each one with the bot (tools/bot.cjs) to set the
 * star scores and print a difficulty table, then writes campaigns/<id>.json
 * and campaigns/index.json. Without --bot, stars from the previous build are
 * kept for levels whose content has not changed.
 */
const fs = require('fs');
const path = require('path');
const P3 = require('./test/load.cjs');
const bot = require('./bot.cjs');
const L = P3.levels, C = P3.catalog;

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'campaigns');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const which = args.find(a => !a.startsWith('--') && !/^\d/.test(a) && a !== opt('--only') && a !== opt('--runs') && a !== opt('--levels')) || 'all';
const runs = +opt('--runs', 3);
const only = opt('--only', null);
const range = (() => { const r = opt('--levels', null); if (!r) return null; const [a, b] = r.split('-').map(Number); return [a - 1, (b || a) - 1]; })();

fs.mkdirSync(OUT, { recursive: true });

function levelHash(lv) { const c = Object.assign({}, lv); delete c.stars; return P3.util.hash(JSON.stringify(c)).toString(36); }

function previous(id) {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, id + '.json'), 'utf8')); } catch (e) { return null; }
}

/** One item per line: readable diffs, still compact. */
function writeCampaign(camp) {
  const head = Object.assign({}, camp); delete head.levels;
  const lines = ['{'];
  for (const k of Object.keys(head)) if (head[k] !== '' && head[k] !== undefined) lines.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(head[k]) + ',');
  lines.push('  "levels": [');
  camp.levels.forEach((lv, li) => {
    const meta = Object.assign({}, lv); delete meta.items;
    lines.push('    {');
    for (const k of Object.keys(meta)) if (meta[k] !== '' && meta[k] !== undefined) lines.push('      ' + JSON.stringify(k) + ': ' + JSON.stringify(meta[k]) + ',');
    lines.push('      "items": [');
    lv.items.forEach((it, ii) => lines.push('        ' + JSON.stringify(it) + (ii < lv.items.length - 1 ? ',' : '')));
    lines.push('      ]');
    lines.push('    }' + (li < camp.levels.length - 1 ? ',' : ''));
  });
  lines.push('  ]', '}');
  fs.writeFileSync(path.join(OUT, camp.id + '.json'), lines.join('\n') + '\n');
}

function overlapReport(lv) {
  const out = [];
  const pegs = lv.items.filter(i => !i.w && !i.m);
  for (let i = 0; i < pegs.length; i++) for (let j = i + 1; j < pegs.length; j++) {
    const a = pegs[i], b = pegs[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 2) out.push(`${a.t}@${Math.round(a.x)},${Math.round(a.y)} overlaps ${b.t}@${Math.round(b.x)},${Math.round(b.y)}`);
  }
  const outside = lv.items.filter(i => i.y < 140 || i.y > 990 || i.x < 18 || i.x > 982);
  outside.forEach(i => out.push(`${i.t}@${Math.round(i.x)},${Math.round(i.y)} is outside the play area`));
  return out;
}

/** Moving items must stay on the board and never sweep through still items. */
function motionReport(lv) {
  const movers = lv.items.map((it, i) => ({ it, b: P3.physics.makeBody(it, i) })).filter(o => o.it.m);
  if (!movers.length) return [];
  const still = lv.items.filter(i => !i.m);
  const out = new Set();
  const pose = { x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0 };
  for (let t = 0; t < 24; t += 0.1) {
    for (const o of movers) {
      P3.physics.poseAt(o.b, t, pose);
      const r = o.it.r || Math.hypot(o.it.w, o.it.h) / 2 * 0.8;
      if (pose.x - r < 8 || pose.x + r > 992 || pose.y - r < 120 || pose.y + r > 1000) out.add(`moving ${o.it.t} from ${Math.round(o.it.x)},${Math.round(o.it.y)} leaves the play area`);
      for (const s of still) {
        const rs = s.r || Math.hypot(s.w, s.h) / 2 * 0.8;
        if (Math.hypot(s.x - pose.x, s.y - pose.y) < r + rs - 1) out.add(`moving ${o.it.t} from ${Math.round(o.it.x)},${Math.round(o.it.y)} passes through ${s.t} at ${Math.round(s.x)},${Math.round(s.y)}`);
      }
    }
  }
  return Array.from(out);
}

function goalText(g) {
  return g.type + (g.color ? ':' + g.color : '') + (g.score ? ':' + g.score : '') + (g.count ? ':' + g.count : '') + (g.chain ? ':' + g.chain : '');
}

function buildMode(mode) {
  const file = path.join(__dirname, 'campaigns', mode + '.cjs');
  if (!fs.existsSync(file)) { console.log('skip', mode, '(no ' + path.relative(ROOT, file) + ')'); return []; }
  delete require.cache[require.resolve(file)];
  const list = require(file);
  const built = [];
  for (const src of list) {
    if (only && src.id !== only) { const prev = previous(src.id); if (prev) built.push(prev); continue; }
    const camp = L.normCampaign(Object.assign({}, src, { mode }));
    camp.id = src.id;
    const prev = previous(camp.id);
    const prevByHash = {};
    if (prev && prev.levels) prev.levels.forEach(lv => { if (lv.stars) prevByHash[levelHash(lv)] = lv.stars; });
    console.log(`\n== ${camp.title} (${camp.id}, ${mode}, ${camp.levels.length} levels)`);
    let errors = 0;
    camp.levels.forEach((lv, i) => {
      const problems = L.levelProblems(lv);
      const ov = overlapReport(lv).concat(motionReport(lv));
      if (problems.length) { errors++; console.log(`  L${i + 1} PROBLEM: ${problems.join(' ')}`); }
      if (ov.length) console.log(`  L${i + 1} layout: ${ov.slice(0, 4).join('; ')}${ov.length > 4 ? ' … (' + ov.length + ' issues)' : ''}`);
      const h = levelHash(lv);
      const inRange = !range || (i >= range[0] && i <= range[1]);
      if (flag('--bot') && inRange) {
        const t0 = Date.now();
        const r = bot.measure(lv, mode, { runs });
        if (r.stars) lv.stars = r.stars;
        const f = (s) => r[s] ? `${Math.round(r[s].winRate * 100)}%/${r[s].shots}sh` : '-';
        console.log(`  L${String(i + 1).padStart(2)} ${lv.name.padEnd(24).slice(0, 24)} ${goalText(lv.goal).padEnd(14)} items ${String(lv.items.length).padStart(3)} balls ${String(lv.balls).padStart(2)} | expert ${f('expert')} avg ${f('average')} novice ${f('novice')} | prog(n) ${r.novice ? Math.round(r.novice.progress * 100) + '%' : '-'} | stars ${lv.stars ? lv.stars.join('/') : '-'} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } else if (prevByHash[h]) {
        lv.stars = prevByHash[h];
      }
    });
    if (errors) console.log(`  ${errors} level(s) with problems`);
    writeCampaign(camp);
    built.push(camp);
  }
  return built;
}

function buildOriginal() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'levels', 'Bennys_Campaign.json'), 'utf8'));
  const { campaign } = L.readCampaign(raw);
  campaign.id = 'bennys-original';
  campaign.title = "Benny's Original";
  campaign.mode = 'vivid';
  campaign.theme = 'carnival-skies';
  campaign.blurb = 'The twenty levels from the first Benny’s P3GL, on the new board.';
  const prev = previous(campaign.id);
  if (prev) campaign.levels.forEach((lv, i) => { if (prev.levels[i] && prev.levels[i].stars) lv.stars = prev.levels[i].stars; });
  if (flag('--bot')) campaign.levels.forEach((lv, i) => { const r = bot.measure(lv, 'vivid', { runs: 2, skills: ['expert', 'average'] }); if (r.stars) lv.stars = r.stars; console.log('  original L' + (i + 1), r.stars, Math.round((r.average || {}).winRate * 100) + '%'); });
  writeCampaign(campaign);
  return campaign;
}

const modes = which === 'all' ? ['cozy', 'vivid', 'hyper'] : C.MODE_IDS.includes(which) ? [which] : [];
modes.forEach(buildMode);
if (which === 'all' || which === 'original') buildOriginal();

// Index: every campaign file present, in mode order, the original last.
const order = ['cozy', 'vivid', 'hyper'];
const entries = fs.readdirSync(OUT).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => {
  const c = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  return { id: c.id, file: f, mode: c.mode, title: c.title, theme: c.theme, blurb: c.blurb || '', levels: c.levels.length, cover: 'covers/' + c.id + '.jpg', extra: c.id === 'bennys-original' || undefined };
});
const known = {};
for (const m of order) (require('fs').existsSync(path.join(__dirname, 'campaigns', m + '.cjs')) ? require(path.join(__dirname, 'campaigns', m + '.cjs')) : []).forEach((c, i) => { known[c.id] = order.indexOf(m) * 10 + i; });
entries.sort((a, b) => (a.extra ? 999 : (known[a.id] !== undefined ? known[a.id] : 500)) - (b.extra ? 999 : (known[b.id] !== undefined ? known[b.id] : 500)));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ format: L.FORMAT, campaigns: entries }, null, 2) + '\n');
console.log('\nindex:', entries.map(e => e.id).join(', '));
