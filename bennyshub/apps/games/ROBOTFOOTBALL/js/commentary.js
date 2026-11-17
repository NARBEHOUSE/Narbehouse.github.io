/* ROBOTFOOTBALL — the commentary director: turns game events into broadcast lines (js/broadcast.js).
 *
 * The home team is always the player's team, and this is the home broadcast. What it replaces:
 * ONLY the system voice's live calls (the player's catch, interception and broken tackle, every kick,
 * touchdowns, quarters and the final whistle), and only when the commentary will be heard. Everything the
 * player decides with stays in the system voice, unchanged: menus and scanning, the receiver scan, down and
 * distance, aim cues, the visitors' "Make the tackle" prompts and every result line with its yardage.
 *
 * event(e) returns true when it has taken over the game's own spoken line for that event.
 */
(function (global) {
  'use strict';

  const CALL = 3;
  // How the game words each kick (simulation.js) -> the family that calls it.
  const KICKS = [[/onside/i, 'onside'], [/punt/i, 'punt'], [/field goal/i, 'fieldGoalUp'], [/extra point/i, 'extraPointUp'], [/kickoff|here comes the kick/i, 'kickoff']];

  function create(ctx) {
    // ctx: { bc, state() -> { sim, home, away, gameMode, season }, voiced() -> commentary will be heard }
    const bc = ctx.bc;
    let lastLive = null, looseCalled = false, last = { h: 0, a: 0 }, worst = 0, extra = null;

    const S = () => ctx.state();
    const team = which => ({ team: which.name.charAt(0) + which.name.slice(1).toLowerCase(), _key: which.id });
    const gainOf = r => { const m = /(Gain|Loss) of (\d+)/.exec((r && r.detail) || ''); return m ? (m[1] === 'Gain' ? 1 : -1) * +m[2] : 0; };

    function startGame() { lastLive = null; looseCalled = false; last = { h: 0, a: 0 }; worst = 0; extra = null; bc.reset(); }

    /** The pre-game: the PA's welcome, Penny and CAL's hello, then maybe the season or the opponent.
     *  Returns true when something will be heard (the game holds the coin toss for it, skippable). */
    function intro() {
      const { sim, home, away, gameMode, season } = S();
      if (!ctx.voiced()) return false;
      const o = { stale: 20, force: true };
      const d = gameMode === 'season' && season && season.data;
      if (sim.options.practice) { bc.say('helloPractice', null, CALL, o); return true; }
      if (d && d.stage === 'championship') bc.say('introChampionship', null, CALL, o);
      else if (d && d.stage === 'playoffs') bc.say('introPlayoff', null, CALL, o);
      else bc.say('intro', team(home), CALL, o);
      bc.say('hello', null, CALL, o);
      // Where the season stands, or a joke about tonight's opponent, waits for the first quiet moment after the
      // opening kickoff: the pre-game stays short (the PA and the hello).
      extra = [seasonLine(d, gameMode), 'opp_' + away.id].filter(Boolean);
      return true;
    }
    function seasonLine(d, gameMode) {
      if (gameMode !== 'season') return 'exhibition';
      if (!d || d.stage !== 'regular') return null;
      const regular = d.results.filter(r => r.stage === 'regular');
      const streak = (want) => { let n = 0; for (let i = regular.length - 1; i >= 0 && want(regular[i]); i--) n++; return n; };
      if (d.gamesPlayed === 0) return 'seasonOpener';
      if (d.gamesPlayed === 15) return 'finalRegular';
      if (d.wins === 9) return 'clinchChance';
      if (d.wins === d.gamesPlayed && d.gamesPlayed >= 3) return 'unbeaten';
      if (streak(r => r.win) >= 3) return 'winStreak';
      if (streak(r => !r.win && !r.tie) >= 2) return 'losingStreak';
      return null;
    }

    /** After a score: one line about where the game now stands, if any applies. */
    function situation(scorer, s) {
      const diff = s.homeScore - s.awayScore, prev = last.h - last.a;
      if (scorer === 'home') {
        if (diff === 0) return 'tiedUp';
        if (prev <= 0 && diff > 0) return 'takeLead';
        if (diff >= 14 && prev < 14) return 'bigLead';
        if (diff < 0) return 'cutDeficit';
      } else if (prev >= 0 && diff < 0) return 'visitorsLead';
      return null;
    }
    function scored(scorer, quipFamily, s) {
      const sit = situation(scorer, s);
      if (!(sit && bc.say(sit))) bc.say(quipFamily);
    }
    function note(s) { if (!s) return; last = { h: s.homeScore, a: s.awayScore }; worst = Math.min(worst, s.homeScore - s.awayScore); }

    function event(e) {
      const { sim, home, away } = S(), s = e.state || (sim && sim.s);
      if (!s) return false;
      const ours = s.possession === 'home';
      const loud = ctx.voiced();                                // a replaced line is heard as a recording/voice
      let replaced = false;
      const call = (family, slots) => { const t = bc.say(family, slots, CALL); if (t && loud) replaced = true; return t; };
      switch (e.type) {
        case 'snap': lastLive = null; looseCalled = false; break;
        case 'throw':
          if (ours && s.playId === 'verticals') bc.say('longPass', null, 2);
          break;
        case 'catch':
          if (!ours || !e.text) break;
          if (/^Intercepted/.test(e.text)) { lastLive = 'int'; call('interception'); }
          else if (/Run it back/.test(e.text)) { lastLive = 'return'; call('returnCatch'); }
          else if (/Diving/i.test(e.text)) call('divingCatch');
          else call('catch');
          break;
        case 'broken': if (ours) call('broken'); break;
        case 'kick': {
          const k = KICKS.find(([re]) => re.test(e.text || ''));
          if (k) call(k[1]);
          break;
        }
        case 'touchdown':
          if (ours) {
            call(lastLive === 'int' ? 'pickSix' : lastLive === 'return' ? 'returnTouchdown' : 'touchdownCall');
            call('touchdownPA', team(home));
            scored('home', 'touchdownQuip', s);
          } else {
            call('touchdownPA', team(away));
            scored('away', 'visitorScore', s);
          }
          break;
        case 'period': {
          const diff = s.homeScore - s.awayScore;
          if (/Overtime/.test(e.text)) call('overtime');
          else if (/Quarter 2/.test(e.text)) call('quarter2');
          else if (/Quarter 3/.test(e.text)) {
            call(Math.random() < .6 ? 'halftime' : 'quarter3');
            bc.say(diff > 0 ? 'halftimeLead' : diff < 0 ? 'halftimeTrail' : 'halftimeTied');
          } else if (/Quarter 4/.test(e.text)) {
            call('quarter4');
            if (Math.abs(diff) <= 7) bc.say('closeLate');
          }
          break;
        }
        case 'final': replaced = final(s) && loud; break;
        case 'result': result(s, ours); break;
      }
      note(s);
      return replaced;
    }

    function result(s, ours) {
      const { home, away } = S(), r = s.result || {}, title = r.title || '', gain = gainOf(r);
      const pick = (family, slots, pri) => bc.say(family, slots, pri);
      if (/^First down/.test(title)) return ours ? (gain >= 20 ? pick('bigGain', null, 2) : pick('firstDown')) : pick('visitorFirstDown');
      if (ours && /^(Tackled|Out of bounds|Forward progress|Runner stopped)$/.test(title))
        return gain >= 20 ? pick('bigGain', null, 2) : gain < 0 ? pick('loss') : pick('shortGain');
      if (!ours && /^(Tackle!|Runner stopped|Tackled)$/.test(title)) return pick('defenseStop');
      if (!ours && /^Sack/.test(title)) return pick('sack', null, 2);
      if (ours && /^(Incomplete pass|Overthrown|Thrown short|Knocked down)$/.test(title)) return pick('incomplete');
      if (!ours && /^(Interception return|Intercepted!)$/.test(title)) return pick('intercepted');
      if (/^Field goal!/.test(title)) { pick('fieldGoalPA', team(home), CALL); return scored('home', 'fieldGoalQuip', s); }
      if (/^Visitors field goal/.test(title)) { pick('fieldGoalPA', team(away), CALL); return scored('away', 'visitorScore', s); }
      if (ours && /^Kick (wide|short)/.test(title)) return pick('fieldGoalMiss', null, 2);
      if (!ours && /^Kick blocked/.test(title)) return pick('fieldGoalBlocked', null, CALL);
      if (ours && /^Extra point good/.test(title)) return pick('extraPointGood');
      if (ours && /^Extra point missed/.test(title)) return pick('extraPointMiss');
      if (ours && /^Two-point conversion/.test(title)) return pick('twoPointGood', null, 2);
      if (ours && /^Conversion stopped/.test(title)) return pick('twoPointStopped');
      if (!ours && /^Conversion denied/.test(title)) return pick('defenseStop');
      if (/^Safety/.test(title)) {
        const homeScored = s.homeScore > last.h;
        pick('safety', team(homeScored ? home : away), CALL);
        return homeScored ? pick('safetyQuip') : pick('visitorScore');
      }
      if (/^Turnover on downs/.test(title)) return ours ? pick('downsLost', null, 2) : pick('downsWon', null, 2);
      if (!ours && /^Punt blocked/.test(title)) return pick('puntBlocked', null, CALL);
      if (ours && /^Punt return/.test(title)) return pick('puntReturn');
      // the quiet moments of a kick: room for CAL's side jobs and his feud with the stadium PA
      if (/Touchback|Kick return|Punt away|Visitors punt/.test(title)) {
        if (extra) { const fams = extra; extra = null; for (const fam of fams) if (pick(fam)) return; }
        if (/Touchback/.test(title) && pick('touchback')) return;
        return pick('sideJob') || pick('paFeud');
      }
    }

    function final(s) {
      const { home, away, gameMode, season } = S(), diff = s.homeScore - s.awayScore;
      const d = gameMode === 'season' && season && season.data;
      const o = { stale: 12 };
      let said = false;
      if (diff === 0) said = !!bc.say('finalTie', null, CALL, o);
      else said = !!bc.say('finalWinPA', team(diff > 0 ? home : away), CALL, o);
      if (diff > 0 && d && d.stage === 'championship') { bc.say('championsPA', team(home), CALL, o); bc.say('champions', null, CALL, o); }
      else if (diff > 0 && worst <= -7) bc.say('comebackWin', null, CALL, o);
      else if (diff > 0 && s.awayScore === 0) bc.say('shutoutWin', null, CALL, o);
      else if (diff > 0) bc.say('finalWin', null, CALL, o);
      else if (diff < 0) bc.say('finalLoss', null, CALL, o);
      return said;
    }

    /** Every frame in live play: a long run breaking free, or the visitors getting away. */
    function live(s) {
      if (looseCalled || !['run', 'defend'].includes(s.phase) || s.controlGrace > 0) return;
      const carrier = s.players && s.players.find(p => p.id === s.carrierId);
      if (!carrier) return;
      const returning = (!!s.kickoff || !!s.kickReturn) && Number.isFinite(s.returnFrom), from = returning ? s.returnFrom : s.lineOfScrimmage;
      const gain = (carrier.z - from) * (s.possession === 'home' ? 1 : -1);
      if (s.phase === 'run' && gain >= 15) { looseCalled = true; bc.say('loose', null, 2); }
      else if (s.phase === 'defend' && gain >= 12) { looseCalled = true; bc.say('visitorsLoose', null, 2); }
    }

    return { startGame, intro, event, live };
  }

  global.FootballCommentary = { create };
})(typeof window !== 'undefined' ? window : globalThis);
