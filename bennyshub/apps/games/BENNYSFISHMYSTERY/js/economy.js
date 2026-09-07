/**
 * Benny's FishMaster — fuel and wear.
 *
 * Two meters that give money somewhere to go between rods. Fuel is the
 * metronome: it burns at a flat rate, so a tank is a predictable running cost
 * you learn to budget for. Wear is the slow one — it creeps for hours and then
 * asks for a large sum at once, which is a different kind of decision.
 *
 * THE RULE THIS MUST NOT BREAK. game.js states it plainly: nothing can fail,
 * there is no game over, and no wait can be lost to. So neither meter is ever
 * allowed to stop play:
 *
 *   * Running dry does not strand you. You get towed in, and if you cannot
 *     pay, the shortfall becomes debt that sales pay off first. You always
 *     leave the dock with enough fuel to fish again. (Redesign doc §2.7.)
 *   * Wear never disables the boat. At its worst it costs a fifth of your top
 *     speed — felt, and never a wall. A slow boat still catches every fish.
 *
 * Both prices are LINEAR in how much you need and capped, because the player
 * has to be able to predict them. "Half a tank costs half of three hundred" is
 * a rule a switch user can hold in their head; a curve is not.
 */
window.RT = window.RT || {};

RT.economy = (function () {
  'use strict';

  /* A full tank is about fourteen minutes of trolling at BOAT_SPEED — a bit
     longer than one lap of a zone, so a careful trip round and back is always
     affordable and a wandering one is not quite. */
  const TANK_UNITS = 14000;

  /* Wear is deliberately an order of magnitude slower: roughly six laps of
     ordinary water before it is worth paying to put right. */
  const WEAR_UNITS = 62000;
  /* A hull's condition is a bar, and a bar is a hundred points. Three minutes
     afloat costs one of them - asked for in those words. */
  const POINT = 0.01;
  const SOAK_SECS = 180;

  const GAS_CAP = 80;       // a bone-dry tank, filled
  const REPAIR_CAP = 150;   // a wreck, put right. A kayak is $250; this is not a second kayak.

  /* How hard a zone is on a hull. Straight out of the fiction: a sheltered
     millpond barely marks the boat, and open water at the edge of the chart
     works it constantly. This is the main reason to keep an eye on the meter
     as the game opens up rather than treating repairs as a fixed tax. */
  const ZONE_WEAR = {
    1: 0.55,   // Cattail Creek — a millpond
    2: 0.80,   // Broadwater Flats — a slow river
    3: 1.00,   // The Drowned Town — dead calm, but structure everywhere
    4: 1.50,   // Gantry Shoals — open lake, real chop
    5: 1.40,   // Hull Cove — rock shelves and wreck ribs
    6: 1.65    // Longshadow Light — open water, real swell
  };

  const st = {
    fuel: 1,        // 1 = full
    wear: 0,        // 0 = pristine, 1 = wrecked
    debt: 0,        // owed after an unpayable tow
    towed: 0        // how many times, for the keeper to be dry about
  };

  /* ── State ────────────────────────────────────────────────────────────── */

  function load(saved) {
    if (!saved) return;
    if (typeof saved.fuel === 'number') st.fuel = clamp01(saved.fuel);
    if (typeof saved.wear === 'number') st.wear = clamp01(saved.wear);
    if (typeof saved.debt === 'number') st.debt = Math.max(0, saved.debt | 0);
    if (typeof saved.towed === 'number') st.towed = Math.max(0, saved.towed | 0);
  }
  function save() {
    return { fuel: st.fuel, wear: st.wear, debt: st.debt, towed: st.towed };
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* ── Burn ─────────────────────────────────────────────────────────────── */

  /**
   * Advance both meters by a distance travelled.
   *
   * Called with the DELTA rather than an absolute distance, because `dist`
   * keeps climbing across laps and the meters must not care how many times
   * you have been round.
   */
  /**
   * Distance travelled, in this vessel.
   *
   * `wearRate` is the vessel's own (a rental canoe wears nothing you pay for,
   * the motorboat scuffs faster than the kayak) and only a vessel that burns
   * fuel drains the tank. On foot nothing is called at all.
   */
  function travel(units, wearRate, burnsFuel) {
    if (!(units > 0)) return;
    if (burnsFuel) st.fuel = clamp01(st.fuel - units / TANK_UNITS);
    const harsh = (typeof wearRate === 'number') ? wearRate : 1;
    st.wear = clamp01(st.wear + (units * harsh) / WEAR_UNITS);
  }

  /**
   * Time afloat, in this vessel.
   *
   * A hull is in the lake whether or not you are paddling it, and wear used
   * to be distance alone - so an afternoon spent sat over one shoal working a
   * magnet cost nothing at all. A point every three minutes, which is a
   * little under a fifth of a bar on a long trip.
   */
  function soak(seconds, wearRate) {
    if (!(seconds > 0)) return;
    const harsh = (typeof wearRate === 'number') ? wearRate : 1;
    st.wear = clamp01(st.wear + (seconds / SOAK_SECS) * POINT * harsh);
  }

  /**
   * A hull straight off the shelf.
   *
   * Wear is one number, for whatever you are sitting in - so a kayak's
   * thousand units of scuffing was still on the meter when the motorboat was
   * bought. A new boat is new.
   */
  function newHull() { st.wear = 0; }

  /** Something put on the tab that was not a tow: the incident's recovery. */
  function addDebt(n) { st.debt += Math.max(0, n | 0); }

  /** Out of fuel — but never out of the game. */
  function dry() { return st.fuel <= 0.0001; }

  /**
   * What the wear is costing you right now.
   *
   * Never below 0.8: a worn boat is slower, not broken. Anything that could
   * stop the player reaching a spot would turn wear into a fail state.
   */
  function speedFactor() { return 1 - 0.20 * st.wear; }

  /* ── Prices ───────────────────────────────────────────────────────────── */

  function gasPrice() { return Math.ceil((1 - st.fuel) * GAS_CAP); }
  function repairPrice() { return Math.ceil(st.wear * REPAIR_CAP); }

  /** Fuel to the nearest whole dollar's worth, for a partial fill. */
  function gasFor(money) {
    const need = gasPrice();
    if (need <= 0) return 0;
    return Math.min(need, Math.max(0, money | 0));
  }

  /**
   * Buy `spend` dollars of fuel. Returns what was actually spent, so the
   * caller stays the single owner of the wallet.
   */
  function buyGas(spend) {
    spend = Math.min(Math.max(0, spend | 0), gasPrice());
    if (spend <= 0) return 0;
    st.fuel = clamp01(st.fuel + spend / GAS_CAP);
    return spend;
  }

  function buyRepair(spend) {
    spend = Math.min(Math.max(0, spend | 0), repairPrice());
    if (spend <= 0) return 0;
    st.wear = clamp01(st.wear - spend / REPAIR_CAP);
    return spend;
  }

  /* ── The tow ──────────────────────────────────────────────────────────── */

  /**
   * Run dry and you are towed in. Charged if you can afford it, put on the
   * slate if you cannot, and either way you leave with a courtesy quarter tank
   * — because the alternative is a player who cannot fish, and this game does
   * not have that state.
   */
  const TOW_FEE = 60;
  function tow(money) {
    st.towed++;
    const paid = Math.min(TOW_FEE, Math.max(0, money | 0));
    st.debt += TOW_FEE - paid;
    st.fuel = Math.max(st.fuel, 0.25);
    return { paid: paid, owed: TOW_FEE - paid, fuel: st.fuel };
  }

  /** Sales clear the slate before they reach the wallet. */
  function settle(income) {
    income = Math.max(0, income | 0);
    if (st.debt <= 0) return { kept: income, paid: 0 };
    const paid = Math.min(st.debt, income);
    st.debt -= paid;
    return { kept: income - paid, paid: paid };
  }

  /* ── For the HUD and the shop ─────────────────────────────────────────── */

  function status() {
    return {
      fuel: st.fuel,
      wear: st.wear,
      debt: st.debt,
      towed: st.towed,
      gasPrice: gasPrice(),
      repairPrice: repairPrice(),
      dry: dry(),
      speedFactor: speedFactor(),
      /* Plain words, because a percentage is one more thing to decode. These
         are what the HUD and the keeper both say. */
      fuelWord: st.fuel > 0.66 ? 'Full' : st.fuel > 0.33 ? 'Half' :
                st.fuel > 0.08 ? 'Low' : 'Empty',
      wearWord: st.wear < 0.15 ? 'Sound' : st.wear < 0.4 ? 'Worn' :
                st.wear < 0.7 ? 'Rough' : 'Bad'
    };
  }

  function zoneWear(n) { return ZONE_WEAR[n] || 1; }

  return {
    soak: soak, newHull: newHull,
    load, save, travel, dry, speedFactor,
    gasPrice, repairPrice, gasFor, buyGas, buyRepair,
    tow, settle, status, zoneWear, addDebt,
    TANK_UNITS, WEAR_UNITS, GAS_CAP, REPAIR_CAP, TOW_FEE
  };
})();
