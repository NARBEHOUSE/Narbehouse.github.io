/**
 * Benny's FishMaster — painted icons, shared.
 *
 * The game used browser emoji for every small picture in the interface: the
 * money in the tin, the lure a job wants, the tick on a finished count. An
 * emoji is drawn by whatever font the machine happens to ship, so none of them
 * matched anything else on screen — and everything else on screen is now one
 * hand: ink line, granulated watercolour wash, the same as the fish and the
 * treasure and the six keepers.
 *
 * Two sources, and the distinction matters:
 *
 *   ic('fuel')     a UI icon from images/icons/ — a thing that stands for an
 *                  idea (fuel, repairs, a tip, a warning).
 *   item('boot')   the game's OWN art for that object from images/items/. A
 *                  boot in a sentence should be the boot you actually pull out
 *                  of the pond, not a second drawing of one.
 *
 * Lives here rather than inside ui.js because game.js and data.js need it too,
 * and a helper in one module's closure is not shareable.
 *
 * A missing file hides rather than showing a broken-image glyph: mid-sentence,
 * nothing is better than a placeholder.
 */
window.RT = window.RT || {};

RT.icons = (function () {
  'use strict';

  function img(dir, name) {
    return '<img class="inlineIcon" src="images/' + dir + '/' + name + '.png" ' +
           'alt="" onerror="this.style.display=\'none\'">';
  }

  /** A UI icon, sized to sit on a line of text. */
  function ic(name) { return img('icons', name); }

  /** The game's own artwork for a treasure item. */
  function item(id) { return img('items', id); }

  /** A fish's own artwork, for the log and the reveal card. */
  function fish(id) { return img('fish', id); }

  /**
   * A card-sized icon rather than an inline one — for a panel heading.
   * `fb` is a fallback glyph, kept so a missing file degrades to what was
   * there before rather than to a blank card.
   */
  function big(name, fb, cls) {
    return '<img src="images/icons/' + name + '.png" alt=""' +
           (cls ? ' class="' + cls + '"' : '') +
           ' data-fb="' + String(fb || '').replace(/"/g, '&quot;') + '"' +
           ' onerror="this.outerHTML=this.dataset.fb||\'\'">';
  }

  return { ic: ic, item: item, fish: fish, big: big };
})();
