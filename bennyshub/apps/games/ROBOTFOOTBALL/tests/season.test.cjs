'use strict';
/* Run with: node bennyshub/apps/games/ROBOTFOOTBALL/tests/season.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({ Math, Date });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/season.js'), 'utf8'), ctx);
const Season = ctx.FootballSeason;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function memory() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}
function make(storage = memory()) { return new Season({ random: () => 0.25, storage }); }
function result(season, home = 21, away = 7) { return season.recordResult(home, away, season.data.matchId); }
function regular(season, wins, ties = 0) {
  let outcome;
  for (let i = 0; i < 16; i++) outcome = result(season, i < wins ? 21 : i < wins + ties ? 7 : 0, 7);
  return outcome;
}
test('robot teams retain all ten stable color IDs and palettes', () => {
  const classic = { Red:'#d32f2f', Blue:'#1565c0', Green:'#2e7d32', Gold:'#f9a825', Purple:'#6a1b9a',
    Orange:'#ef6c00', Teal:'#00838f', Pink:'#c2185b', Navy:'#283593', Black:'#37474f' };
  assert.equal(Season.TEAMS.length, 10);
  for (const team of Season.TEAMS) {
    assert.equal(team.color, classic[team.colorName]);
    assert.equal(team.id, team.colorName.toLowerCase());
    assert.equal(Season.getTeam(team.colorName), team);
    assert.match(team.accent, /^#[0-9a-f]{6}$/);
  }
  assert.equal(Season.getTeam('unknown'), null);
});
test('a new schedule faces every other color before repeats', () => {
  for (const team of Season.TEAMS) {
    const season = make();
    assert.equal(season.start(team.id).teamId, team.id);
    assert.equal(season.data.schedule.length, 16);
    assert.equal(new Set(season.data.schedule.slice(0, 9)).size, 9);
    assert.ok(!season.data.schedule.includes(team.id));
    assert.equal(season.currentOpponent().id, season.data.schedule[0]);
    assert.equal(season.currentMatchupLabel(), 'Game 1 of 16');
  }
});
test('fewer than ten wins ends the season outside the playoffs', () => {
  const season = make(); season.start('blue');
  const outcome = regular(season, 9);
  assert.equal(outcome.outcome, 'missed_playoffs');
  assert.equal(season.data.wins, 9);
  assert.equal(season.data.losses, 7);
  assert.equal(season.data.gamesPlayed, 16);
  assert.equal(season.data.stage, 'failed');
  assert.equal(season.isActive(), false);
  assert.equal(season.isSeasonOver(), true);
  assert.equal(season.data.matchId, null);
});
test('ten wins reaches all three playoff rounds with distinct opponents', () => {
  const season = make(); season.start('green');
  assert.equal(regular(season, 10).outcome, 'made_playoffs');
  assert.equal(season.currentMatchupLabel(), 'Playoffs: Wild Card');
  const opponents = [season.data.opponentId];
  assert.equal(result(season).outcome, 'advanced_playoff');
  assert.equal(season.currentMatchupLabel(), 'Playoffs: Conference');
  opponents.push(season.data.opponentId);
  assert.equal(result(season).outcome, 'advanced_playoff');
  assert.equal(season.data.stage, 'championship');
  assert.equal(season.currentMatchupLabel(), 'Championship Game');
  opponents.push(season.data.opponentId);
  assert.equal(result(season).outcome, 'champions');
  assert.equal(new Set(opponents).size, 3);
  assert.equal(season.data.results.length, 19);
  assert.equal(season.data.wins, 10);
  assert.equal(season.data.gamesPlayed, 16);
  assert.equal(season.isSeasonOver(), true);
});
test('a perfect sixteen-and-zero season goes directly to the championship', () => {
  const season = make(); season.start('gold');
  assert.equal(regular(season, 16).outcome, 'perfect_to_championship');
  assert.equal(season.data.stage, 'championship');
  assert.equal(season.data.playoffRound, 2);
  assert.equal(result(season).outcome, 'champions');
  assert.equal(season.data.results.length, 17);
  assert.equal(season.currentMatchupLabel(), 'Season Champions');
});
test('a postseason loss ends the run without changing the regular record', () => {
  const season = make(); season.start('purple'); regular(season, 11);
  assert.equal(result(season, 0, 14).outcome, 'eliminated');
  assert.equal(season.data.stage, 'done');
  assert.equal(season.data.wins, 11);
  assert.equal(season.data.losses, 5);
  assert.equal(season.isActive(), false);
  const perfect = make(); perfect.start('pink'); regular(perfect, 16);
  assert.equal(result(perfect, 7, 14).outcome, 'lost_championship');
});
test('regular ties count as ties and cannot qualify as a perfect season', () => {
  const season = make(); season.start('orange');
  assert.equal(regular(season, 15, 1).outcome, 'made_playoffs');
  assert.equal(season.data.wins, 15);
  assert.equal(season.data.ties, 1);
  assert.equal(season.data.losses, 0);
  assert.equal(season.data.stage, 'playoffs');
  const allTies = make(); allTies.start('teal');
  assert.equal(regular(allTies, 0, 16).outcome, 'missed_playoffs');
  assert.equal(allTies.data.ties, 16);
  assert.equal(allTies.data.losses, 0);
});
test('postseason ties replay the same opponent with a fresh match id', () => {
  const storage = memory(), season = make(storage);
  season.start('navy'); regular(season, 10);
  const opponent = season.data.opponentId, oldMatch = season.data.matchId;
  const tied = result(season, 14, 14);
  assert.equal(tied.outcome, 'postseason_tie');
  assert.equal(season.data.opponentId, opponent);
  assert.equal(season.data.playoffRound, 0);
  assert.notEqual(season.data.matchId, oldMatch);
  assert.equal(season.data.ties, 0);
  const resumed = make(storage);
  assert.equal(resumed.data.matchId, season.data.matchId);
  assert.equal(resumed.data.opponentId, opponent);
  assert.equal(resumed.recordResult(14, 14, oldMatch).duplicate, true);
  assert.equal(result(resumed).outcome, 'advanced_playoff');
  assert.notEqual(resumed.data.opponentId, opponent);
});
test('championship ties do not award a title or eliminate the team', () => {
  const season = make(); season.start('black'); regular(season, 16);
  const opponent = season.data.opponentId;
  assert.equal(result(season, 21, 21).outcome, 'postseason_tie');
  assert.equal(season.data.stage, 'championship');
  assert.equal(season.isSeasonOver(), false);
  assert.equal(season.data.opponentId, opponent);
  assert.equal(result(season).outcome, 'champions');
});
test('duplicate results remain idempotent after reload and season completion', () => {
  const storage = memory(), season = make(storage); season.start('blue');
  const firstId = season.data.matchId;
  result(season);
  const after = JSON.stringify(season.data);
  const duplicate = season.recordResult(21, 7, firstId);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.recorded, false);
  assert.equal(JSON.stringify(season.data), after);
  const resumed = make(storage);
  assert.equal(resumed.recordResult(21, 7, firstId).duplicate, true);
  assert.equal(resumed.data.gamesPlayed, 1);
  for (let i = 1; i < 16; i++) result(resumed);
  const finalId = resumed.data.matchId;
  result(resumed);
  const done = make(storage);
  assert.equal(done.recordResult(21, 7, finalId).duplicate, true);
  assert.equal(done.data.results.length, 17);
  assert.equal(done.isSeasonOver(), true);
});
test('stale ids and malformed scores cannot alter the season', () => {
  const season = make(); season.start('red');
  const before = JSON.stringify(season.data);
  assert.equal(season.recordResult(7, 0, 'some-other-season:m1').outcome, 'stale_match');
  for (const home of [-1, 1.5, NaN, Infinity, '7', 1000]) {
    assert.equal(season.recordResult(home, 0, season.data.matchId).outcome, 'invalid_result');
  }
  assert.equal(season.recordResult(7, 0).outcome, 'invalid_result');
  assert.equal(JSON.stringify(season.data), before);
  assert.equal(season.start('unknown'), false);
  assert.equal(JSON.stringify(season.data), before);
});
test('regular, playoff, tie and completed seasons reload consistently', () => {
  const storage = memory(), season = make(storage); season.start('teal');
  for (let i = 0; i < 16; i++) {
    result(season, i < 10 ? 21 : 0, 7);
    const resumed = make(storage);
    assert.equal(JSON.stringify(resumed.data), JSON.stringify(season.data));
  }
  for (const scores of [[7,7],[14,7],[7,7],[14,7],[14,7]]) {
    result(season, ...scores);
    assert.equal(JSON.stringify(make(storage).data), JSON.stringify(season.data));
  }
});
test('corrupt persistence is rejected by replaying and validating its history', () => {
  const storage = memory(), season = make(storage); season.start('pink'); result(season);
  const good = JSON.stringify(season.data);
  const tamper = change => {
    const data = JSON.parse(good); change(data);
    storage.setItem(Season.STORAGE_KEY, JSON.stringify(data));
    assert.equal(make(storage).data, null);
    assert.equal(storage.getItem(Season.STORAGE_KEY), null);
  };
  tamper(d => d.wins++);
  tamper(d => d.matchId = 'wrong');
  tamper(d => d.schedule[5] = d.teamId);
  tamper(d => d.results[0].opponentId = d.teamId);
  tamper(d => d.results[0].outcome = 'champions');
  tamper(d => d.results[0].home = -100);
  tamper(d => d.stage = 'champions');
  storage.setItem(Season.STORAGE_KEY, '{bad json');
  assert.equal(make(storage).data, null);
});
test('storage errors do not block play and reset leaves classic saves alone', () => {
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } };
  const season = make(denied);
  assert.equal(season.start('red').teamId, 'red');
  assert.equal(result(season).recorded, true);
  season.reset(); assert.equal(season.data, null);
  const storage = memory(), saved = make(storage);
  storage.setItem('bennyFootball_season', 'classic-save');
  saved.start('red'); saved.reset();
  assert.equal(storage.getItem(Season.STORAGE_KEY), null);
  assert.equal(storage.getItem('bennyFootball_season'), 'classic-save');
});
console.log('\n' + passed + ' season tests passed.');
