/* ROBOTFOOTBALL — sixteen-game seasons and color-coded robot teams. */
(function (global) {
  'use strict';
  const STORAGE_KEY = 'bennys-stadium-season-v1';
  const TEAMS = Object.freeze([
    { id: 'red', colorName: 'Red', name: 'RUSTBOTS', unitName: 'RUSTBOT', playerName: 'RUSTBOT', shortName: 'RST', color: '#d32f2f', accent: '#ff6659' },
    { id: 'blue', colorName: 'Blue', name: 'BLUEBORGS', unitName: 'BLUEBORG', playerName: 'BLUEBORG', shortName: 'BLU', color: '#1565c0', accent: '#5e92f3' },
    { id: 'green', colorName: 'Green', name: 'GREENTRONS', unitName: 'GREENTRON', playerName: 'GREENTRON', shortName: 'GRN', color: '#2e7d32', accent: '#60ad5e' },
    { id: 'gold', colorName: 'Gold', name: 'GOLDBOTS', unitName: 'GOLDBOT', playerName: 'GOLDBOT', shortName: 'GLD', color: '#f9a825', accent: '#ffd95a' },
    { id: 'purple', colorName: 'Purple', name: 'VIOLETRONS', unitName: 'VIOLETRON', playerName: 'VIOLETRON', shortName: 'VIO', color: '#6a1b9a', accent: '#9c4dcc' },
    { id: 'orange', colorName: 'Orange', name: 'COPPERBOTS', unitName: 'COPPERBOT', playerName: 'COPPERBOT', shortName: 'CPR', color: '#ef6c00', accent: '#ff9d3f' },
    { id: 'teal', colorName: 'Teal', name: 'TEALTRONS', unitName: 'TEALTRON', playerName: 'TEALTRON', shortName: 'TEL', color: '#00838f', accent: '#4fb3bf' },
    { id: 'pink', colorName: 'Pink', name: 'ROSEBOTS', unitName: 'ROSEBOT', playerName: 'ROSEBOT', shortName: 'ROS', color: '#c2185b', accent: '#fa5788' },
    { id: 'navy', colorName: 'Navy', name: 'NAVYDROIDS', unitName: 'NAVYDROID', playerName: 'NAVYDROID', shortName: 'NVY', color: '#283593', accent: '#5f5fc4' },
    { id: 'black', colorName: 'Black', name: 'CARBONBOTS', unitName: 'CARBONBOT', playerName: 'CARBONBOT', shortName: 'CRB', color: '#37474f', accent: '#62727b' }
  ].map(Object.freeze));
  const ROUNDS = Object.freeze(['Wild Card', 'Conference', 'Championship']);
  const FINISHED = ['failed', 'done', 'champions'];
  let serial = 0;
  const teamFor = id => TEAMS.find(t => t.id === String(id || '').toLowerCase()) || null;
  const scoreOK = n => Number.isInteger(n) && n >= 0 && n <= 999;
  const clone = value => JSON.parse(JSON.stringify(value));
  const matchIdFor = d => d.seasonId + ':m' + (d.results.length + 1);
  function advance(d, home, away) {
    const win = home > away, tie = home === away;
    if (d.stage === 'regular') {
      d.gamesPlayed++;
      if (win) d.wins++; else if (tie) d.ties++; else d.losses++;
      if (d.gamesPlayed < 16) return 'next_game';
      if (d.wins === 16) {
        d.stage = 'championship'; d.playoffRound = 2;
        return 'perfect_to_championship';
      }
      if (d.wins >= 10) {
        d.stage = 'playoffs'; d.playoffRound = 0;
        return 'made_playoffs';
      }
      d.stage = 'failed'; d.active = false;
      return 'missed_playoffs';
    }
    if (tie) return 'postseason_tie';
    if (d.stage === 'championship') {
      d.stage = win ? 'champions' : 'done'; d.active = false;
      return win ? 'champions' : 'lost_championship';
    }
    if (!win) { d.stage = 'done'; d.active = false; return 'eliminated'; }
    d.playoffRound++;
    if (d.playoffRound === 2) d.stage = 'championship';
    return 'advanced_playoff';
  }
  function messageFor(outcome) {
    return ({
      next_game: 'Result saved. Your next regular-season game is ready.',
      perfect_to_championship: 'Sixteen wins, no losses. You advance directly to the championship.',
      made_playoffs: 'You made the playoffs. The Wild Card game is next.',
      missed_playoffs: 'Season complete. Ten wins are needed to reach the playoffs.',
      advanced_playoff: 'Playoff win. You advance to the next round.',
      eliminated: 'Your playoff run is over. Your season results are saved.',
      champions: 'Champions! You won the championship.',
      lost_championship: 'Championship complete. Your season results are saved.',
      postseason_tie: 'Postseason tie. Replay this round against the same opponent.',
      invalid_result: 'This result could not be recorded.',
      stale_match: 'This game is not the current season matchup.'
    })[outcome] || '';
  }
  class FootballSeason {
    constructor(options) {
      options = options || {};
      this.random = typeof options.random === 'function' ? options.random :
        typeof options.rng === 'function' ? options.rng : Math.random;
      this.storage = null;
      try { this.storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : global.localStorage; } catch (_) {}
      this.data = null;
      this.load();
    }
    _rand() {
      const value = Number(this.random());
      return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
    }
    getTeam(id) { return teamFor(id); }
    isActive() { return !!(this.data && this.data.active); }
    isSeasonOver() { return !!(this.data && FINISHED.includes(this.data.stage)); }
    currentOpponent() { return this.data ? teamFor(this.data.opponentId) : null; }
    currentMatchupLabel() {
      const d = this.data;
      if (!d) return '';
      if (d.stage === 'regular') return 'Game ' + (d.gamesPlayed + 1) + ' of 16';
      if (d.stage === 'playoffs') return 'Playoffs: ' + ROUNDS[d.playoffRound];
      if (d.stage === 'championship') return 'Championship Game';
      if (d.stage === 'champions') return 'Season Champions';
      return 'Season Complete';
    }
    _buildSchedule(teamId) {
      const others = TEAMS.filter(t => t.id !== teamId).map(t => t.id), schedule = [];
      while (schedule.length < 16) {
        const group = others.slice();
        for (let i = group.length - 1; i > 0; i--) {
          const j = Math.floor(this._rand() * (i + 1));
          [group[i], group[j]] = [group[j], group[i]];
        }
        schedule.push.apply(schedule, group.slice(0, 16 - schedule.length));
      }
      return schedule;
    }
    _nextOpponent() {
      const d = this.data;
      if (d.stage === 'regular') return d.schedule[d.gamesPlayed];
      const used = new Set([d.teamId].concat(d.results.filter(r => r.stage !== 'regular').map(r => r.opponentId)));
      const choices = TEAMS.filter(t => !used.has(t.id));
      return choices[Math.floor(this._rand() * choices.length)].id;
    }
    start(teamId) {
      const team = teamFor(teamId);
      if (!team) return false;
      const id = Date.now().toString(36) + '-' + Math.floor(this._rand() * 0xFFFFFFFF).toString(36) + '-' + (++serial).toString(36);
      this.data = {
        version: 1, seasonId: id, teamId: team.id, opponentId: null,
        wins: 0, losses: 0, ties: 0, gamesPlayed: 0, schedule: this._buildSchedule(team.id),
        results: [], stage: 'regular', playoffRound: 0, active: true, matchId: null
      };
      this.data.opponentId = this._nextOpponent();
      this.data.matchId = matchIdFor(this.data);
      this.save();
      return this.data;
    }
    reset() {
      this.data = null;
      try { if (this.storage) this.storage.removeItem(STORAGE_KEY); } catch (_) {}
    }
    save() {
      try {
        if (!this.storage) return false;
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        return true;
      } catch (_) { return false; }
    }
    load() {
      try {
        const raw = this.storage && this.storage.getItem(STORAGE_KEY);
        if (!raw) { this.data = null; return false; }
        if (raw.length > 1000000) throw new Error('Invalid season size');
        const candidate = JSON.parse(raw);
        if (!this._valid(candidate)) throw new Error('Invalid season');
        this.data = clone(candidate); return true;
      } catch (_) {
        this.data = null;
        try { if (this.storage) this.storage.removeItem(STORAGE_KEY); } catch (_) {}
        return false;
      }
    }
    _reply(outcome, recorded, duplicate, result) {
      return {
        outcome: outcome, recorded: !!recorded, duplicate: !!duplicate,
        seasonOver: this.isSeasonOver(), nextMatchId: this.data ? this.data.matchId : null,
        message: messageFor(outcome), result: result ? clone(result) : null
      };
    }
    recordResult(home, away, matchId) {
      const d = this.data;
      if (!d || typeof matchId !== 'string') return this._reply('invalid_result', false, false);
      const existing = d.results.find(r => r.matchId === matchId);
      if (existing) return this._reply(existing.outcome, false, true, existing);
      if (!d.active || matchId !== d.matchId) return this._reply('stale_match', false, false);
      if (!scoreOK(home) || !scoreOK(away)) return this._reply('invalid_result', false, false);
      const result = {
        matchId: matchId, opponentId: d.opponentId, home: home, away: away,
        win: home > away, tie: home === away, stage: d.stage, playoffRound: d.playoffRound
      };
      const outcome = advance(d, home, away);
      result.outcome = outcome;
      d.results.push(result);
      if (d.active) {
        // A tied postseason game earns a new id, but keeps the same round/opponent.
        if (outcome !== 'postseason_tie') d.opponentId = this._nextOpponent();
        d.matchId = matchIdFor(d);
      } else d.matchId = null;
      this.save();
      return this._reply(outcome, true, false, result);
    }
    _valid(d) {
      if (!d || typeof d !== 'object' || d.version !== 1 ||
          typeof d.seasonId !== 'string' || !/^[a-z0-9-]{3,80}$/.test(d.seasonId) ||
          !teamFor(d.teamId) || teamFor(d.teamId).id !== d.teamId ||
          !Array.isArray(d.schedule) || d.schedule.length !== 16 ||
          !d.schedule.every(id => teamFor(id) && id !== d.teamId && teamFor(id).id === id) ||
          new Set(d.schedule.slice(0, 9)).size !== 9 ||
          new Set(d.schedule.slice(9)).size !== 7 ||
          !Array.isArray(d.results) || d.results.length > 4096) return false;
      const replay = {
        seasonId: d.seasonId, teamId: d.teamId, wins: 0, losses: 0, ties: 0,
        gamesPlayed: 0, results: [], stage: 'regular', playoffRound: 0, active: true
      };
      const usedPostseason = new Set();
      let tiedOpponent = null;
      for (const r of d.results) {
        if (!r || !replay.active || r.matchId !== matchIdFor(replay) ||
            !scoreOK(r.home) || !scoreOK(r.away) ||
            !teamFor(r.opponentId) || r.opponentId === d.teamId ||
            teamFor(r.opponentId).id !== r.opponentId ||
            r.stage !== replay.stage || r.playoffRound !== replay.playoffRound ||
            r.win !== (r.home > r.away) || r.tie !== (r.home === r.away)) return false;
        if (replay.stage === 'regular') {
          if (r.opponentId !== d.schedule[replay.gamesPlayed]) return false;
        } else {
          if (tiedOpponent ? r.opponentId !== tiedOpponent : usedPostseason.has(r.opponentId)) return false;
        }
        const outcome = advance(replay, r.home, r.away);
        if (r.outcome !== outcome) return false;
        if (r.stage !== 'regular') {
          if (outcome === 'postseason_tie') tiedOpponent = r.opponentId;
          else { usedPostseason.add(r.opponentId); tiedOpponent = null; }
        }
        replay.results.push(r);
      }
      for (const key of ['wins','losses','ties','gamesPlayed','stage','playoffRound','active']) {
        if (d[key] !== replay[key]) return false;
      }
      if (!teamFor(d.opponentId) || d.opponentId === d.teamId || teamFor(d.opponentId).id !== d.opponentId) return false;
      if (d.active) {
        if (d.matchId !== matchIdFor(replay)) return false;
        if (d.stage === 'regular') {
          if (d.opponentId !== d.schedule[d.gamesPlayed]) return false;
        } else if (tiedOpponent ? d.opponentId !== tiedOpponent : usedPostseason.has(d.opponentId)) return false;
      } else {
        if (d.matchId !== null || !d.results.length || d.opponentId !== d.results[d.results.length - 1].opponentId) return false;
      }
      return true;
    }
  }
  FootballSeason.TEAMS = TEAMS;
  FootballSeason.PLAYOFF_ROUNDS = ROUNDS;
  FootballSeason.STORAGE_KEY = STORAGE_KEY;
  FootballSeason.getTeam = teamFor;
  global.FootballSeason = FootballSeason;
  if (typeof module !== 'undefined' && module.exports) module.exports = FootballSeason;
})(typeof window !== 'undefined' ? window : globalThis);
