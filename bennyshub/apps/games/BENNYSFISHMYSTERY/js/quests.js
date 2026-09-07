/**
 * Benny's FishMaster — the written game, in the shape the engine runs.
 *
 * content/quests.json is the story: thirty-five quests down one lake, with
 * Walt's lines, the player's lines, and what each one depends on. This turns
 * them into mission objects, so the engine's ladder, its cards and its scoring
 * work unchanged.
 *
 * WHAT THE ENGINE HAS TO SCORE. Fish are TAGGED AND RELEASED here, never kept,
 * so a fish quest is a count of tags - catchCount is the right word for the
 * wrong reason and is kept because a dozen call sites know it. The rest:
 *
 *   catchCount      tags, of one species or any, optionally deeper than N ft
 *   catchWeight     pounds of net-caught bait, all told (quest 1)
 *   catchWeightOne  one fish of one species over N lb
 *   recoverItem     the magnet brings up a named thing, or N of them
 *   reachSpot       a place reached, or a thing done at the counter (a flag)
 *   ringBell        the finale
 *   collectSet      all ten of a set - the mystery fish, or the unique finds
 *   collectSet      all ten of a set - the mystery fish, or the unique finds
 *   tradeScrap      N scrap handed over at the counter
 *   ownVessel       the kayak, or the motorboat, bought
 *   ownTool         a tool bought
 *   repairVessel    the hull patched, once
 *   clearDebt       the tab paid off
 *
 * The last five are not counted up - they are TRUE or not, read off the save
 * at turn-in. game.js checks them in stateComplete() rather than in the catch
 * pipeline, because nothing about them arrives on a line.
 *
 * DEPENDENCIES ARE STATED. `needs` is which quests must be done first. The
 * ladder is still walked in order - one current quest at a time is what a
 * one-switch player can hold in their head - but `needs` is what the editor
 * draws and what stops an edit stranding a quest.
 */
window.RT = window.RT || {};

RT.quests = (function () {
  'use strict';

  /** The stage a quest belongs to gives its water, as the engine names it. */
  const STAGE_WATERS = {
    foot: ['shoreline'],
    canoe: ['shoreline', 'bay'],
    kayak: ['bay', 'dropoff'],
    motorboat: ['dropoff', 'trench'],
    /* AFTER THE STORY. The whole lake, because that is the point of the two
       jobs that live here: ten fish and ten finds, anywhere at all, and
       nobody to tell you where. */
    postgame: ['shoreline', 'bay', 'dropoff', 'trench'],
  };

  /** One quest's requirement, in the engine's vocabulary. */
  function toTarget(need) {
    const t = need.type;
    const out = { type: t, amount: need.amount || 1 };
    if (need.speciesId) out.speciesId = need.speciesId;
    if (need.itemId) out.itemId = need.itemId;
    if (need.flag) out.flag = need.flag;
    if (need.minDepthFt) out.minDepthFt = need.minDepthFt;
    if (need.netOnly) out.netOnly = true;
    if (need.vesselId) out.vesselId = need.vesselId;
    if (need.toolId) out.toolId = need.toolId;
    /* Which collection: the ten mystery fish, or the ten unique finds. Read
       off the save rather than counted up, so it survives every trip. */
    if (need.set) out.set = need.set;
    /* Which collection: the ten mystery fish, or the ten unique finds. Read
       off the save rather than counted up, so it survives every trip. */
    if (need.set) out.set = need.set;
    if (t === 'catchWeight' && need.pounds) out.amount = need.pounds;
    if (t === 'catchWeightOne' && need.pounds) out.amount = need.pounds;
    if (t === 'catchLength' && need.inches) out.amount = need.inches;
    return out;
  }

  /**
   * Everything written, as missions, in playing order.
   * Returns { missions, secrets } or null with no content, so a checkout
   * without a built bundle still loads.
   */
  function build() {
    const C = RT.content;
    if (!C || !C.quests || !C.quests.quests) return null;
    const quests = C.quests.quests;

    const missions = quests.map(function (q, i) {
      const reward = q.reward || {};
      const m = {
        n: i + 1,
        id: q.id,
        stage: q.stage,
        kind: q.kind,
        title: q.title,
        text: q.card,
        needs: q.needs || [],
        at: q.at || null,
        biomes: (STAGE_WATERS[q.stage] || ['shoreline']).slice(),
        target: toTarget(q.need),
        say: q.say || null,
        player: q.player || null,
        lines: q.lines || null,
        action: q.action || null,
        payout: reward.money || 0,
        hidden: false,
        finale: q.kind === 'finale' || q.need.type === 'ringBell',
        /* The rod and bait are whatever the player HOLDS, not something the
           quest names - the shop sells the ladder, the quests do not hand it
           out. The two exceptions below are the ones Walt gives over. */
        rodId: null, baitId: null,
      };
      if (reward.grantsRodId) m.grantsRodId = reward.grantsRodId;
      if (reward.grantsToolId) m.grantsToolId = reward.grantsToolId;
      if (reward.grantsItemId) m.grantsItemId = reward.grantsItemId;
      if (reward.debt) m.addsDebt = reward.debt;          // the incident's tow
      if (reward.repair) m.freeRepair = true;
      /* A tank on the house. There was a field for a free repair and none for
         fuel, so the only way Walt could be generous was with the hull. */
      if (reward.fuel) m.freeFuel = true;
      if (reward.title) m.awardsTitle = reward.title;
      if (q.unlocks) m.unlocks = q.unlocks;
      /* Handed over WITH the brief, not on completion: Walt's net on the first
         morning is what makes quest one possible at all. */
      if (q.gives) m.gives = q.gives;
      if (q.shopHint) m.shopHint = q.shopHint;
      /* What this job puts out on Walt's shelf. The ladder decides what is for
         sale, so nothing can be bought before the job that is about it. */
      if (q.sells) m.sells = q.sells;
      /* Your side of the conversation, where the script writes it. */
      if (q.replies) m.replies = q.replies;
      return m;
    });

    return { missions: missions, secrets: [] };
  }

  /** Walt's line for a cue id, for the recorder and for the shop. */
  function line(cue) {
    const C = RT.content;
    return (C && C.quests && C.quests.walt && C.quests.walt[cue]) || '';
  }

  return { build: build, line: line, STAGE_WATERS: STAGE_WATERS };
})();
