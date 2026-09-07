# Benny's FishMaster — The Mystery of Whispering Lake

One lake, four depths, thirty-five quests. You start on the boards with five
dollars and a mesh net, and finish in a motorboat over the trench with a
sonar Walt built from what you dragged off the bottom. Fish are **tagged and
released** — the money is Walt's Warden Bounty when you upload the logbook.

## How it fits together

```
content/lake.json     the chart: shoreline, island, soundings, ledges, dock, places
content/roster.json   fish, items, vessels, rods, baits, tools
content/quests.json   the 35 quests, Walt's lines by cue id, the player's lines
        │
        ▼  python tools/build_content.py
js/content.generated.js      one file the game loads (same shape as the three above)
        │
        ▼
js/lake.js      chart(doc): depthAt / inWater / fromDock / stageAt — ONE implementation
js/world.js     buildLake(scene, {chart, ...}): the bed, the water, the banks, the fog
js/data.js      derives FISH / RODS / VESSELS / ITEM_TABLE from the roster
js/quests.js    turns quests.json into the engine's mission objects
js/minimap.js   the chart in the corner, cropped round the boat
js/game.js      the game: dock, shop, trips, casting, tagging, places, economy
js/ui.js        the cards, the HUD, the counter
editor.html     edit the chart and the quests in a browser, download the JSON
```

## Editing the story or the lake

Open `editor.html` in a browser (it reads `js/content.generated.js`).
Drag shore points, soundings and quest places; edit quests, needs, rewards,
dependencies and Walt's lines; the panel on the right flags anything that
would strand a quest (a place the stage's vessel cannot reach, a dependency
on a later quest, a cue with no line). Then:

1. **Download quests.json** and **Download lake.json** into `content/`.
2. `python tools/build_content.py`
3. `node tools/check_content.js && node tools/smoke.js && node tools/playtest.js`

`tools/gen_quests.js` and `tools/gen_lake.js` were the one-time authors of
those files from the script and the sketch. Once you have edited in the
editor, **do not re-run them with `--write`** — they will overwrite your edits.

## Proving it works (no browser needed)

| command | what it proves |
| --- | --- |
| `node tools/check_content.js` | every fish has water it can live in and a rod that reaches it; every vessel opens new water |
| `node tools/smoke.js` | the world builds from the chart; bed and chart agree; land is above water |
| `node tools/dockcheck.js` | the shop, sign and props stand ON the bank; the boat floats; the camera is above ground |
| `node tools/playtest.js` | the real `game.js`, headless, plays all 35 quests to the finale (`--verbose` for a trip log) |

These run the real code through a stub browser. If one fails, the game is
broken in that way; if they all pass, it runs — how it *looks* still needs
eyes.

## Rules the code keeps

- **Depth is the progression.** On foot 0–10 ft; rental canoe 10–35 (rated to
  35, it slides along the drop-off); kayak to 75; motorboat everywhere. A rod
  is rated to a depth: cast deeper and the game says *Line too short!*
- **Nothing is kept.** A hooked keeper is tagged, logged and released; the
  bounty is paid at the counter, and every dollar clears the tab first.
- **Places are shoals.** A quest's place on the chart is cued, pulled over
  onto and fished like any shoal, and takes priority over the fish around it.
- **The chart is authoritative.** The world, the cue, the minimap and the
  editor all read `RT.lake.chart(...)`. Nothing draws a second lake.
