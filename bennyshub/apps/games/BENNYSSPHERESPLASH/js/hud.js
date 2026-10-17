/** Benny's Sphere Splash - the match HUD, at the edges so the centre stays on the action.
 *
 *  Top centre: the score bug (both teams, a big stroked score, the clock and the half,
 *  and STOPPED while play is frozen). Top left: formation and decision-stop setting.
 *  Top right: the ball carrier - name, number, an HP bar, and status in words.
 *  Centre: big stroked pops for the moments that matter (GOAL!, SAVED!), one at a
 *  time, highest priority first; a goal gets the banner instead - a band right across
 *  the screen in the scorers' kit, GOAL! in giant type, the scorer and the new score
 *  under it. During a goal replay: a REPLAY tag top left, and a wipe in the scorers'
 *  colours across the screen going in and out. The kickoff sweep: a plate for each team
 *  as the camera passes it (ours bottom left, theirs bottom right), or one for the second
 *  half. A technique: its name in giant type on a burst of its colour (techFlourish).
 *  Right: the pause-hold ring. Bottom centre: captions
 *  (broadcast.js writes those). Layout and sizing follow NARBE Racer's hud.js.
 */
SS.hud = (function () {
  'use strict';

  const U = SS.util;
  const RING_R = 48, RING_LEN = 2 * Math.PI * RING_R;
  let root, el = {}, shown = false, popQ = [], popTimer = null, last = {}, bannerTimer = null;

  function build() {
    root = U.$('hud');
    root.innerHTML =
      '<div class="bug"><div class="side s0"><i class="crest"></i><span class="tn"></span></div>' +
        '<div class="mid"><div class="score"><b class="g0">0</b><em>–</em><b class="g1">0</b></div>' +
        '<div class="clock"><span class="time">0:00</span><span class="half"></span></div>' +
        '<div class="stopped">Stopped</div></div>' +
        '<div class="side s1"><span class="tn"></span><i class="crest"></i></div></div>' +
      '<div class="info"><span class="form"></span><span class="theirs"></span><span class="stops"></span></div>' +
      '<div class="carrier"><div class="who"><span class="num"></span><span class="nm"></span></div>' +
        '<div class="hp"><i></i><span></span></div><div class="st"></div></div>' +
      '<div class="pop"></div>' +
      '<div class="teamplate"><i class="crest"></i><div><b class="nm"></b><span class="sub"></span></div></div>' +
      '<div class="techfx"><div class="burst"></div><b class="nm"></b><span class="who"></span></div>' +
      '<div class="replaytag"><b><i></i>Replay</b><span>Press to skip</span></div>' +
      '<div class="goalbanner"><div class="band"><b class="word">GOAL!</b></div><div class="line"><span class="who"></span><span class="sc"></span></div></div>' +
      '<div class="ring"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="' + RING_R + '"></circle>' +
        '<circle class="fill" cx="60" cy="60" r="' + RING_R + '" stroke-dasharray="' + RING_LEN.toFixed(1) +
        '" stroke-dashoffset="' + RING_LEN.toFixed(1) + '"></circle></svg><span class="lbl">Keep<br>holding</span></div>';
    const q = s => root.querySelector(s);
    el = { bug: q('.bug'), tn0: q('.s0 .tn'), tn1: q('.s1 .tn'), c0: q('.s0 .crest'), c1: q('.s1 .crest'),
      g0: q('.g0'), g1: q('.g1'), time: q('.time'), half: q('.half'), stopped: q('.stopped'),
      form: q('.info .form'), theirs: q('.info .theirs'), stops: q('.info .stops'), carrier: q('.carrier'), num: q('.carrier .num'),
      nm: q('.carrier .nm'), hpBar: q('.hp i'), hpTx: q('.hp span'), st: q('.carrier .st'),
      pop: q('.pop'), ring: q('.ring'), ringFill: q('.ring .fill'),
      banner: q('.goalbanner'), bWho: q('.goalbanner .who'), bSc: q('.goalbanner .sc'),
      replay: q('.replaytag'), plate: q('.teamplate'), plNm: q('.teamplate .nm'), plSub: q('.teamplate .sub'), plCrest: q('.teamplate .crest'),
      tech: q('.techfx'), techNm: q('.techfx .nm'), techWho: q('.techfx .who') };
    // The wipe covers the badges too, so it sits over the world layer, not in the HUD.
    el.wipe = document.createElement('div'); el.wipe.className = 'wipe'; el.wipe.innerHTML = '<div class="band"></div>';
    document.body.appendChild(el.wipe); el.wipeBand = el.wipe.firstChild;
  }

  function setTeams(teams) {
    [0, 1].forEach(t => {
      el['tn' + t].textContent = teams[t].short || teams[t].name;
      el['c' + t].style.background = U.hex(teams[t].kit);
      el['c' + t].className = 'crest ' + (t ? 'diamond' : 'round');
    });
  }

  function visible(on) { shown = on; root.classList.toggle('on', on); }

  const HALF = { 1: '1st half', 2: '2nd half' };
  /** Called every frame with the match state (cheap: writes only what changed). */
  function update(s, frozen, labels) {
    if (!shown || !s) return;
    const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
    set('g0', s.score[0], v => { el.g0.textContent = v; });
    set('g1', s.score[1], v => { el.g1.textContent = v; });
    set('time', U.fmtClock(s.periodLength - s.clock), v => { el.time.textContent = v; });
    set('half', s.period > 2 ? 'Overtime' : HALF[s.period], v => { el.half.textContent = v; });
    set('frozen', !!frozen, v => el.bug.classList.toggle('frozen', v));
    if (labels) {
      set('form', labels.formation, v => { el.form.textContent = v; });
      set('theirs', labels.theirs, v => { el.theirs.textContent = v; });
      set('stops', labels.stops, v => { el.stops.textContent = v; });
    }
    const j = s.ball.owner != null ? s.ball.owner : (s.pending ? s.pending.carrier : null);
    const pl = j != null ? s.players[j] : null;
    set('carrier', pl ? j : -1, () => {
      el.carrier.classList.toggle('on', !!pl);
      if (!pl) return;
      el.num.textContent = labels.numberOf(j);
      el.num.className = 'num team-' + pl.team + (pl.team ? ' diamond' : ' round');
      el.num.style.setProperty('--bg', U.hex(labels.kitOf(pl.team)));
      el.nm.textContent = pl.name;
    });
    if (pl) {
      const frac = Math.max(0, pl.hp / pl.maxHp);
      set('hp', Math.round(pl.hp), v => {
        el.hpBar.style.width = (frac * 100).toFixed(1) + '%';
        el.hpTx.textContent = 'HP ' + v;
        el.carrier.classList.toggle('low', pl.hp < SS.DATA.RULES.LOW_HP * pl.maxHp);
      });
      const st = [pl.poison > 0 ? 'Stung' : '', pl.sleep > 0 ? 'Dozing' : '', pl.wilt ? 'Wilted' : '',
        pl.hp < SS.DATA.RULES.LOW_HP * pl.maxHp ? 'Tired' : ''].filter(Boolean).join(' · ');
      set('st', st, v => { el.st.textContent = v; });
    }
  }

  /* ── pops: one at a time, the most important first ──────────────────── */
  function pop(text, kind, priority) {
    popQ.push({ text, kind: kind || 'info', pri: priority || 1 });
    popQ.sort((a, b) => b.pri - a.pri);
    if (popQ.length > 3) popQ.length = 3;
    if (!popTimer) nextPop();
  }
  function nextPop() {
    const p = popQ.shift();
    if (!p) { popTimer = null; el.pop.classList.remove('on'); return; }
    el.pop.textContent = p.text;
    el.pop.className = 'pop k-' + p.kind;
    void el.pop.offsetWidth; el.pop.classList.add('on');
    popTimer = setTimeout(nextPop, p.kind === 'goal' ? 2400 : 1500);
  }
  function clearPops() { popQ = []; clearTimeout(popTimer); popTimer = null; if (el.pop) el.pop.classList.remove('on'); }

  /** The goal banner: { kit, accent (hex numbers), who: '#9 Duke', score: 'BEA 2 – 1 GUL' }. */
  const BANNER_SECS = 3.4;
  function goalBanner(o) {
    clearPops();
    el.banner.style.setProperty('--kit', U.hex(o.kit));
    el.banner.style.setProperty('--accent', U.hex(o.accent));
    el.bWho.textContent = o.who; el.bSc.textContent = o.score;
    el.banner.classList.remove('on', 'out'); void el.banner.offsetWidth; el.banner.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      el.banner.classList.add('out');
      bannerTimer = setTimeout(hideBanner, 450);
    }, (BANNER_SECS - 0.45) * 1000);
  }
  /** The REPLAY tag (and the score bug's info row makes way for it). */
  function replayTag(on) { el.replay.classList.toggle('on', !!on); root.classList.toggle('replaying', !!on); }
  /** The wipe: p 0..1 across the screen (it covers it all for the middle third), or null. */
  function wipe(p, kit, accent) {
    if (p == null) { el.wipe.classList.remove('on'); return; }
    if (kit != null) { el.wipe.style.setProperty('--kit', U.hex(kit)); el.wipe.style.setProperty('--accent', U.hex(accent)); }
    el.wipe.classList.add('on');
    if (U.reducedMotion()) { el.wipeBand.style.transform = 'none'; el.wipeBand.style.opacity = Math.min(1, 3 - Math.abs(p - 0.5) * 6).toFixed(2); return; }
    el.wipeBand.style.transform = 'translateX(' + (-200 + 300 * p).toFixed(2) + 'vw) skewX(-12deg)';
  }
  /** A kickoff plate: { name, sub, kit, accent, side: 'left' | 'right' | 'centre', round } or null to hide. */
  let plateKey = '';
  function teamPlate(o) {
    const key = o ? o.name + '|' + o.side : '';
    if (key === plateKey) return;
    plateKey = key;
    if (!o) { el.plate.classList.remove('on'); return; }
    el.plate.style.setProperty('--kit', U.hex(o.kit)); el.plate.style.setProperty('--accent', U.hex(o.accent));
    el.plNm.textContent = o.name; el.plSub.textContent = o.sub || '';
    el.plCrest.className = 'crest ' + (o.round ? 'round' : 'diamond');
    el.plCrest.style.display = o.side === 'centre' ? 'none' : '';
    el.plate.className = 'teamplate s-' + o.side;
    void el.plate.offsetWidth; el.plate.classList.add('on');
  }
  /** A technique's moment: { name, who, colour (hex number), kit (hex number) }. */
  let techTimer = null;
  function techFlourish(o) {
    el.tech.style.setProperty('--fx', U.hex(o.colour)); el.tech.style.setProperty('--kit', U.hex(o.kit));
    el.techNm.textContent = o.name + '!'; el.techWho.textContent = o.who;
    el.tech.classList.remove('on'); void el.tech.offsetWidth; el.tech.classList.add('on');
    clearTimeout(techTimer);
    techTimer = setTimeout(() => el.tech.classList.remove('on'), 1900);
  }
  function hideTech() { clearTimeout(techTimer); if (el.tech) el.tech.classList.remove('on'); }
  function hideBanner() { clearTimeout(bannerTimer); bannerTimer = null; if (el.banner) el.banner.classList.remove('on', 'out'); }

  /** The pause hold: 0 hides the ring, 0..1 fills it. */
  function ring(f) {
    if (last.ring === f) return;
    last.ring = f;
    el.ring.classList.toggle('on', f > 0);
    el.ringFill.setAttribute('stroke-dashoffset', (RING_LEN * (1 - Math.min(1, f))).toFixed(1));
  }

  function reset() { last = {}; clearPops(); hideBanner(); replayTag(false); wipe(null); teamPlate(null); hideTech(); ring(0); }

  return { build, setTeams, visible, update, pop, clearPops, goalBanner, hideBanner, replayTag, wipe, teamPlate, techFlourish, hideTech, ring, reset };
})();
