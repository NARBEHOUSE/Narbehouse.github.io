/** Chasing Rainbows - the card catalogue.
 *
 *  One entry per card TYPE (Red, Wild, Fog Skip...). The deck holds copies of these;
 *  every copy of a type is identical in play, which is why the menus offer one choice
 *  per type ("Red, you have 2") rather than one per card.
 *
 *  Names are spoken exactly as Inclusive Imagination prints them on the cards.
 *  Pure data and helpers: no DOM, so the rules engine and the Node tests load it too.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CRCards = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];

  // cls: color | core | legend | weather. order = rainbow sort order in a hand.
  const TYPES = {
    red:    { cls: 'color', name: 'Red',    copies: 3, art: 'red',    hue: '#ff0a3c' },
    orange: { cls: 'color', name: 'Orange', copies: 3, art: 'orange', hue: '#ff8000' },
    yellow: { cls: 'color', name: 'Yellow', copies: 3, art: 'yellow', hue: '#ffde00' },
    green:  { cls: 'color', name: 'Green',  copies: 3, art: 'green',  hue: '#92d800' },
    blue:   { cls: 'color', name: 'Blue',   copies: 3, art: 'blue',   hue: '#00b4e8' },
    indigo: { cls: 'color', name: 'Indigo', copies: 3, art: 'indigo', hue: '#7a4ad8' },
    violet: { cls: 'color', name: 'Violet', copies: 3, art: 'violet', hue: '#d548d6' },
    wild:   { cls: 'color', name: 'Wild',   copies: 4, art: 'wild',   hue: 'rainbow' },
    sun:    { cls: 'core',  name: 'Sun',    copies: 3, art: 'sun',    hue: '#ffde00' },
    rain:   { cls: 'core',  name: 'Rain',   copies: 3, art: 'rain',   hue: '#00b4e8' },
    day:    { cls: 'legend', name: 'Day',   copies: 1, art: 'day',    hue: '#ffffff' },
    night:  { cls: 'legend', name: 'Night', copies: 1, art: 'night',  hue: '#000000' },
    cloud:  { cls: 'weather', name: 'Cloud Block',   copies: 3, art: 'cloud',  hue: '#adadad' },
    double: { cls: 'weather', name: 'Double Draw',   copies: 3, art: 'double', hue: '#adadad' },
    fog:    { cls: 'weather', name: 'Fog Skip',      copies: 3, art: 'fog',    hue: '#adadad' },
    storm:  { cls: 'weather', name: 'Storm Shuffle', copies: 3, art: 'storm',  hue: '#adadad' },
    wind:   { cls: 'weather', name: 'Wind Trade',    copies: 3, art: 'wind',   hue: '#adadad' },
  };
  const ORDER = Object.keys(TYPES);
  ORDER.forEach((id, i) => { TYPES[id].id = id; TYPES[id].order = i; });

  const WEATHER = ['cloud', 'double', 'fog', 'storm', 'wind'];
  const CORE = ['sun', 'rain'];
  const LEGEND = ['day', 'night'];

  /** The rule each card follows, in the words the game speaks the first time it comes up. */
  const RULES = {
    color: 'A rainbow needs one of each color: red, orange, yellow, green, blue, indigo and violet.',
    wild: 'A Wild can stand in for any color in your rainbow.',
    sun: 'Sun and Rain together make your Sun and Rain combo. You need it to win.',
    rain: 'Sun and Rain together make your Sun and Rain combo. You need it to win.',
    day: 'Day is a Legend. Legends can never be discarded. Play it with Night, or trade it away with Wind.',
    night: 'Night is a Legend. It can only be discarded as your very last card, to win. That is Night, Night!',
    cloud: 'Cloud Block stops another player\'s weather card, any time it is played.',
    double: 'Double Draw: draw two more cards.',
    fog: 'Fog Skip: pick a player. They miss their next turn.',
    storm: 'Storm Shuffle: name a card. Every copy, in every hand and the discard pile, goes back in the deck. Yours too.',
    wind: 'Wind Trade: give a player one of your cards, and take a random card from them.',
  };
  const ruleFor = id => RULES[id] || RULES[TYPES[id] && TYPES[id].cls] || '';

  const COMBOS = {
    rainbow: { name: 'Rainbow', say: 'your Rainbow' },
    core:    { name: 'Sun & Rain', say: 'Sun and Rain' },
    legend:  { name: 'Day & Night', say: 'Day and Night' },
  };

  const typeOf = card => (typeof card === 'string' ? card : card.t);
  const info = card => TYPES[typeOf(card)];
  const nameOf = card => info(card).name;
  /** Spoken form: "&" reads badly in some voices. */
  const sayName = card => nameOf(card).replace('&', 'and');
  const isWeather = card => info(card).cls === 'weather';
  const isColor = card => info(card).cls === 'color';
  const isLegend = card => info(card).cls === 'legend';

  /** Sort a hand (cards or type ids) into rainbow order. */
  function sortHand(cards) {
    return cards.slice().sort((a, b) => info(a).order - info(b).order);
  }

  /** [{t, n}] - one entry per type, in rainbow order. */
  function group(cards) {
    const counts = {};
    cards.forEach(c => { const t = typeOf(c); counts[t] = (counts[t] || 0) + 1; });
    return ORDER.filter(t => counts[t]).map(t => ({ t, n: counts[t] }));
  }

  /** "Red, Red, and Wild" -> "2 Reds and a Wild" style list for speech. */
  function sayGroup(cards) {
    const parts = group(cards).map(g => (g.n > 1 ? g.n + ' ' + TYPES[g.t].name + 's' : TYPES[g.t].name));
    return list(parts);
  }
  function list(parts) {
    if (parts.length === 0) return 'nothing';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }

  return {
    COLORS, TYPES, ORDER, WEATHER, CORE, LEGEND, COMBOS, RULES,
    typeOf, info, nameOf, sayName, isWeather, isColor, isLegend, ruleFor,
    sortHand, group, sayGroup, list,
  };
});
