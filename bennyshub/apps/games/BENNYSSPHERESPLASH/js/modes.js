/** Benny's Sphere Splash - the three preset modes, as sets of individual toggles.
 *
 * A mode is only a named starting point. Every system reads its own toggle through
 * rules(season) - never the mode's name - so any Custom mix works, and a toggle
 * changed mid-season just takes effect from the next check.
 */
(function (root) {
  'use strict';
  const SS = root.SS = root.SS || {};

  const TOGGLES = {
    competition:  { label: 'Competition', values: ['exhibition', 'leagueThenCup', 'cycles'],
                    names: { exhibition: 'One match', leagueThenCup: 'League, then a Cup', cycles: 'League and Cup, repeating' } },
    matchLength:  { label: 'Match length', values: ['short', 'standard'], names: { short: 'Short halves', standard: 'Full halves' } },
    stops:        { label: 'Decision stops', values: ['ours', 'both', 'key', 'coach'],
                    names: { ours: 'Our ball only', both: 'Attack and defense', key: 'Key moments', coach: 'Coach (watch)' } },
    gamePlan:     { label: 'Game plan', values: ['auto', 'card', 'manual'],
                    names: { auto: 'Automatic', card: 'One card before each match', manual: 'Full control' } },
    techniques:   { label: 'Techniques', values: ['auto', 'manual'], names: { auto: 'Equipped for you', manual: 'You equip them' } },
    levels:       { label: 'Levels and XP', values: [false, true] },
    contracts:    { label: 'Contracts and salaries', values: [false, true] },
    scouting:     { label: 'Scouting', values: [false, true] },
    training:     { label: 'Training and fatigue', values: [false, true] },
    injuries:     { label: 'Injuries', values: [false, true] },
    unlocks:      { label: 'Formations unlock by wins', values: [false, true] },
    techCopy:     { label: 'Tech Copy', values: [false, true] },
  };

  const PRESETS = {
    quick: { name: 'Quick Game', rules: {
      competition: 'exhibition', matchLength: 'short', stops: 'both', gamePlan: 'auto', techniques: 'auto',
      levels: false, contracts: false, scouting: false, training: false, injuries: false, unlocks: false, techCopy: false } },
    simple: { name: 'Simple Season', rules: {
      competition: 'leagueThenCup', matchLength: 'standard', stops: 'both', gamePlan: 'card', techniques: 'auto',
      levels: true, contracts: false, scouting: false, training: false, injuries: false, unlocks: true, techCopy: false } },
    full: { name: 'Full Season', rules: {
      competition: 'cycles', matchLength: 'standard', stops: 'both', gamePlan: 'manual', techniques: 'manual',
      levels: true, contracts: true, scouting: true, training: true, injuries: false, unlocks: true, techCopy: true } },
  };

  /** The effective rules for a season: its preset, overlaid with any custom changes. */
  function rules(season) {
    const base = PRESETS[(season && season.preset) || 'quick'].rules;
    return Object.assign({}, base, (season && season.custom) || {});
  }

  /** Match length in game seconds for these rules. */
  function halfLength(r) { return r.matchLength === 'short' ? SS.DATA.RULES.HALF_SHORT : SS.DATA.RULES.HALF_STANDARD; }

  SS.modes = { TOGGLES, PRESETS, rules, halfLength };
})(typeof window !== 'undefined' ? window : globalThis);
