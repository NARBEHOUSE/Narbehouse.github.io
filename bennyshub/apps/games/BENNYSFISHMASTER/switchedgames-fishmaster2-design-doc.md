# Benny's FishMaster II — Design Doc

**Project:** SwitchedGames.org title
**Folder:** `bennyshub/apps/games/BENNYSFISHMASTER2/` (working name — see §12)
**Engine:** Three.js r155, vendored from `BENNYSRACETRACKS/js/three.min.js` — no CDN, works offline
**Target platform:** Benny's Hub game library (switch-accessible)
**Primary audience:** Ben and other switch-access users; casual, low-vision-friendly

**Status: DESIGN ONLY — nothing built yet.** The existing
[`BENNYSFISHMASTER`](../BENNYSFISHMASTER/) stays in place and stays registered in
`games.json` until this replaces it.

A rewrite, not a patch. FishMaster I is a 2D canvas pond driven by a scan list
and a charge meter. This is **Race Tracks with a fishing rod**: the boat drives
itself along a lake track, fish zones come past on the left and the right, and
the player's whole job is deciding where to pull over.

> **Doc revision 3.1.** Rev 1 built a five-lane route with a confirming press. Rev
> 2 threw that out for an open lake with steered heading, a two-object dock and a
> tackle shop. Rev 3 lands where the design was actually heading: **the boat
> auto-drives a track, the only input is pulling over left or right, there is no
> shopping at all, and progression is a mission ladder that upgrades the player's
> gear for him.** Rev 3.1 puts the pull-over on Race Tracks' armed-side one-switch
> scheme, so left-versus-right survives on a single button. Changes are marked
> inline.

---

## 1. What changes

FishMaster I makes the player set up every cast by hand. Before a line is in the
water he picks a lake, picks a bait, decides whether a rod is worth buying, scans
through five directions, and fills a power meter to a level he has to judge for
himself. Then landing the fish is a two-to-five step Red/Blue sequence.

Ben stalls out somewhere in that setup. It is not difficulty — nothing in that
game can fail him — it is the amount of setting up between him and a fish.

**FishMaster II does the setting up for him.**

| | FishMaster I | FishMaster II |
|---|---|---|
| Where to fish | pick a lake from a menu | one lake, the same one every time |
| Which way to cast | scan through five directions | the boat drives itself; you pull over |
| How far to cast | fill a power meter | automatic |
| Which bait | pick from a list | matched to the target for you |
| Which rod | save up and buy one | upgrades itself as you go |
| Landing the fish | match 2–5 Red/Blue steps | hold the switch, ease off when it's tight |

What is left for the player is two things, and both are about water he can see in
front of him:

- **a fish zone is coming up on the left or the right — pull over, or keep going?**
- **he's parked at the zone — cast here, or keep trolling for better water?**

Everything else runs itself. The boat has no throttle and no steering. The money
spends itself, so there is no shop and nothing to save for. Nothing anywhere can
fail, time out, or be done wrong.

**Core promise, unchanged from FishMaster I and Race Tracks:** two-button or
one-button control, four-channel guidance for low vision, no fail state, no
timers, big payoff for small physical effort, all progress in local storage.

---

## 2. Flow

```
Title Screen
 ├─ Play Game
 ├─ Settings
 └─ Exit Game                     (back to the hub)

Play Game
   ↓
THE DOCK  ──  one press  ──►  MISSION CARD  ("Mission 4 — Catch 2 Northern Pike")
                                    ↓
                        ┌───────────────────────────┐
                        │  ON THE TRACK             │
                        │  boat drives itself        │
                        │  zones pass left and right │
                        └──────┬────────────────────┘
                               │ pull over
                               ▼
                        ┌───────────────────────────┐
                        │  AT THE ZONE              │
                        │  ▸ Cast                   │
                        │  ▸ Keep trolling  ────────┼──► back on the track
                        └──────┬────────────────────┘
                               │ cast
                               ▼
                     bite → hook → reel → catch card
                               │
                               └──► Cast again / Keep trolling
                               
   target caught  ──►  RESULTS  ──►  gear upgrade (sometimes)  ──►  DOCK
```

A mission runs roughly 3–5 minutes.

---

## 3. Controls

### On the track — pull over

The boat drives forward on its own at trolling speed. The player never steers,
never accelerates, and never has to hold anything to stay safe. Doing nothing is
always fine.

**Two switches — Auto Scan off**
- **Space** → pull over to the **left** zone
- **Return** → pull over to the **right** zone

**One switch — Auto Scan on (Ben's rig)** — the Race Tracks armed-side scheme

Only **RETURN** does anything on the track; Space is inert.

A panel sits at each screen edge, and one of them is **armed**:

- **Tap Return** → arms the *other* side. Press once for left, press again for
  right, back and forth, as many times as you like. Nothing is committed by a tap.
- **Hold Return** → pulls over to whichever side is armed.
- **Do nothing** → the zone goes past. That is the other half of the decision and
  it costs nothing.

This is Race Tracks' one-switch scheme, in the same words: *press to aim, hold to
commit, and every press flips the side.* Ben already has the muscle memory, and
crucially it keeps the **left-versus-right choice intact on one switch** — he is
not reduced to yes/no on whatever the game happens to offer him.

> **Changed in rev 3.1.** Rev 3 offered one-switch players a single zone at a
> time and made Return take it, on the assumption that left/right could not
> survive on one button. It can — Race Tracks already solved this — and the
> concession cost Ben the more interesting half of the decision. **Zones now
> appear on both sides at once for everyone**, and the two-switch and one-switch
> schemes offer the same game.

**The panels are the whole HUD for driving.** Each one continuously shows what is
on that side of the boat right now, so the choice is a glance rather than a
memory test:

| Panel state | Means |
|---|---|
| dark and empty | no zone on this side |
| **green**, with the biome name | a zone holding your **target species** |
| **amber**, with the biome name | a zone with fish, but not your target |
| thick outline + arrow | this is the **armed** side — a hold goes here |

Flipping the armed side is spoken (*"left — weed bed, pike"*) and plays the same
low-for-left / high-for-right panned tone as every other direction cue in the
game, so the armed side is knowable with the screen off.

### The pull-over window is generous

A zone is **wide and long** — the boat is alongside it for **10–15 seconds**, and
the press is accepted at any point in that whole stretch. Nothing counts down and
no clock is shown. Pressing at the last possible moment gives exactly the same
fishing as pressing at the first.

> **Why not a timer.** A visible countdown is the single most fatiguing thing
> that could be added here — it turns a calm choice into a deadline. Making the
> window physical instead means the forgiveness is a property of the level
> layout, tunable in one constant (zone length in metres), and never visible to
> the player as pressure.

Pulling over is a smooth, automatic manoeuvre: the boat eases across, the motor
drops to idle, and it comes to rest at the zone. The player holds nothing.

### At the zone, and everywhere else — scanning

Every card in the game is an ordinary hub scan list: **Space** steps, **hold
Space** steps backward, **Return** selects, and with Auto Scan on the highlight
cycles by itself so **Return alone plays the whole game**. Scan speed, auto-scan,
sensitivity, TTS and voice all come from the shared `NarbeScanManager` /
`NarbeVoiceManager` — nothing is configured twice.

### Reeling

**Hold Return to reel** (§6). This is the only hold gesture in the game.

### Pause

**Hold RETURN for 5 seconds** (`PAUSE_HOLD_MS`, discovery ring at 2 s), or
**Escape**, or the on-screen Pause button. Only Return arms it. The menu opens
with **nothing focused** (`startIndex: -1`) and the triggering switch's repeat and
release swallowed — both non-negotiable, since omitting either made Race Tracks'
pause menu impossible to use.

Pause menu: **Continue / Restart Mission / Main Menu / Help.**

**The pause hold is disarmed during the reel.** Holding Return *is* reeling, and a
big fish will exceed five seconds constantly. Escape and the Pause button still
work. This is FishMaster I's "pause-menu conflict" rule applied to a new hold
gesture, and forgetting it makes every large fish open the pause menu mid-fight.

**On the track, hold now means two things, and the split is by duration.** A
pull-over needs about 0.4 s of hold; the pause needs five. So:

- **the pull-over commits on release**, any time between ~0.4 s and 5 s
- **past 5 s the hold becomes the pause** and the pull-over is cancelled
- the discovery ring still appears at 2 s, which doubles as the warning that
  this hold has stopped being a pull-over

Committing on release rather than at 0.4 s is what makes both gestures fit on one
switch without a mode. It is also strictly better than Race Tracks, whose own doc
still carries an open question about long steering holds firing the pause by
accident — there, holding is *continuous* movement, so it has no natural release
point to commit on. Here it does.

> **Swap Bait is gone from the pause menu.** In FishMaster I it sat one step from
> Resume because changing bait was the thing you wanted most mid-trip. Bait is now
> chosen for the player (§4), so there is nothing to swap.

---

## 4. Progression — the game upgrades the player

There is **no shop, no money to spend, and no purchase decision anywhere.**

> **Changed in rev 3.** Rev 2 had a tackle shop on the dock, selling on entry and
> a buy list of bait and rods. Buying was the last remaining abstract decision in
> the game — *is a $500 rod worth it yet?* is exactly the kind of question that
> stalls Ben out — so it is gone. The rod-reveal card that made buying feel good
> survives; only the choosing is removed.

### Missions

A fixed, numbered ladder, reusing Race Tracks' level system directly: sequential
unlock, repeatable, progress saved per mission.

Each mission is **one target**, drawn from FishMaster I's existing
`objectivePool` entries and stated in one line on a card before the trip:

> **Mission 4 — Catch 2 Northern Pike**

The target is the only objective. It is spoken, shown on the card, and kept in
the HUD with progress (*Northern Pike 1 / 2*) for the whole trip.

Targets escalate down the ladder — sunfish and bass early, pike and walleye in
the middle, sturgeon and muskie at the end — and each one is checked for
completability the way `pickLakeSetup()` already checks objectives: the species has
to live in a biome that has opened by this mission (§4.3), and the amount has to
sit inside the species' own range.

The ladder runs to the biggest fish in the lake — the sturgeon — and then does
not stop. Clearing it reveals **one more mission, hidden until then: catch the
Largemouth Dingus.** That is the true finale and the last fish in the game.

The Dingus needs no new machinery. FishMaster I already gates it on bait — it
only enters a bite pool when the secret *Vitamin T* is equipped — and bait is now
set per mission, so naming that bait on the final mission *is* the entire unlock.
Its stats stay exactly as they are: 12 inches, 5 lbs, worth nothing, an easy
fight. The joke is that the hardest fish in the game to find is an utterly
ordinary fish, and the ceremony carries it — FishMaster I's one-off
`dingusreveal` card survives untouched.

### Gear upgrades itself

Completing a mission banks the catch, and at set milestones the game hands over
the next piece of gear with the **full-art rod-reveal card** from FishMaster I:

> *"That's a good haul. Enough for a real rod."*
> **CastMaster 3000** — *casts up to 325 feet at full charge.*

Money still exists and still accrues from the catch — it is shown in the HUD and
on the results card, because *"you earned this"* is the whole emotional point of
the upgrade. What it no longer is, is a number the player has to make a plan
about.

**Upgrades fire on mission completion, not on a money threshold.** Both readings
were in the brief ("as we get the money" and "as we move up through the
missions"), and mission-triggered is the one that cannot break: a money
threshold can be missed by a run of bad luck, which would leave a player holding
a rod too short for the mission they have just been given. Mission-triggered
upgrades are impossible to desynchronise, and the money on screen still supplies
the reason.

Bait upgrades the same way — and the equipped bait is then **chosen
automatically to match the mission's target species**, reading the existing
`biasTable` in `data.js`. The player is always fishing with the right bait for
the fish they were asked to catch, and never has to know that bait exists.

### The lake opens up as you go

The lake is one body of water, and it **grows new biomes as missions are
cleared** — water that simply was not there in the early missions.

| Missions | Track runs through | Reachable with |
|---|---|---|
| early | Shallows, Weed Bed | Starter Rod — 175 ft |
| mid | + Rocky Shore, Drop-off | CastMaster 3000 — 325 ft |
| late | + Deep Channel | Longshot Pro — 425 ft |
| finale | the whole lake | Titanium Ace — 500 ft |

Two things move together here and they must stay in step: **which biomes the
track passes** and **which rod the player has been given**. Because both are
driven off mission number, they cannot drift apart — a biome never appears before
the rod that can fish it, and no zone the player is offered is ever out of reach.

> **Changed in rev 3.** Rev 2 drew out-of-reach zones in grey so the player could
> see good water before reaching it. With gear on rails that is now pointless
> cruelty: the player has no way to hurry an upgrade along, so showing them water
> they cannot use is information they can do nothing with. **Every zone offered
> is fishable.** New biomes get their own announcement instead — *"the channel's
> open to you now"* — which is a better moment than a grey ring ever was.

### The rod numbers still matter, and they are re-derived

Reach is no longer something the player controls, but it still decides which
biomes are legal at which mission, so the maths stays. One lake at
**`maxRadiusFt: 500`**, the existing band edges (`LG.BAND_FRAC` at
.28 / .52 / .78 / 1.0), one rod per ring:

| Rod | reachFt | reachFrac | Opens |
|---|---|---|---|
| Starter Rod | **175** | .35 | near shallows and mid water |
| CastMaster 3000 | **325** | .65 | the far water |
| Longshot Pro | **425** | .85 | the deep channel |
| Titanium Ace | **500** | 1.00 | the whole lake |

> **The old reachFt values do not work and must be replaced.** FishMaster I's
> 75 / 125 / 225 / 500 ft were tuned against *three* lakes of 225 / 350 / 475 ft,
> where the same rod deliberately slid down a tier on a bigger lake. With one lake
> there is nothing to slide against and the numbers collapse: 75 / 500 = .15,
> inside no band at all — the starter rod would reach nothing. The table above
> spaces four rods one per ring, keeps every value a multiple of 25 ft as
> `data.js` requires, and keeps all four `cost` values as flavour on the reveal
> card. **The `RODS` comment block documents the old three-lake derivation and
> must be rewritten, not amended.**

> **The Monte Carlo pass is deleted, not re-run.** FishMaster I needed thousands
> of `generateLake()` rolls to confirm each rod hit its band across five cast
> sectors, because reach was measured against a *painted, wobbly shoreline* whose
> radius varied with bearing. Zones here are placed along a track at an explicit
> ring, so reach gating is exact arithmetic with no seeded geometry in the middle.
> Nothing needs simulating. Worth not accidentally undoing: **if a future change
> makes a zone's ring depend on painted geometry again, the whole two-pass
> derivation comes back with it.**

---

## 5. On the track — zones, and the one real choice

### The track

A winding route across the lake, generated by Race Tracks' `world.js` almost
untouched: curves become the route bending around points and islands, hills
become gentle swells. The boat holds the centre line the whole way and the chase
camera sits behind it.

Zones are laid out along the route the way Race Tracks lays out obstacle
clusters, using the same layout-aware placement code — but zones sit **off to
the side** of the centre line rather than across it, because the boat is not
dodging them, it is choosing to visit them.

**There are no hazards.** Race Tracks' obstacle system becomes **scenery only** —
lily pads, buoys, deadheads, other boats — with collision reduced to a nudge and
a wake sound. A fishing trip that can go *wrong* is a fishing trip Ben has to
concentrate through, and the only thing this track can do is take longer.

### What a zone tells you before you commit

A zone is a patch of marked water: a glowing ring, the fish-finder arch over it,
and — this is the part that makes the decision real — **a sign naming what is in
it**.

Announced on all four of Race Tracks' guidance channels at once, ~3.5 s ahead:

- **spoken** — *"Weed bed on the right. Good for pike."*
- **stereo-panned tone** in the matching ear, low for left, high for right
- **a large on-screen arrow and the zone's name**
- **a screen-edge colour glow** on that side

Plus the ring's own colour, which is the fastest read on the screen:

- **Green ring** — this zone holds the **target species**. Take it.
- **Amber ring** — fish, but not the ones you were asked for.

That is the whole decision: green means yes, amber means *your call*.

### Wrong zones are not punished, only less likely

Pulling over into an amber zone is a perfectly reasonable thing to do — there are
fish in it, they sell for money, and the money is what upgrades your gear. What
it is not is efficient: the target species is **still possible there, just less
likely**, which drops straight out of FishMaster I's existing `rollBite()` /
`biteWeightedFishPool()` weighting with no new mechanic at all.

| Zone | Chance of the target species |
|---|---|
| Green — target's own biome | high; the weighting favours it and the auto-equipped bait favours it further |
| Amber — a biome the target also visits | moderate; species that list two biomes are genuinely findable in both |
| Amber — a biome the target never visits | low, and honest about it: *"you might get lucky"* |

A target that lives in exactly one biome can never be caught in the wrong zone at
all, and the narration says so rather than letting the player fish hopefully for
a minute: *"no pike in the rocks — worth moving on."*

Nothing is lost by a wrong pull-over: no time limit, no penalty, no lost bait,
and whatever *does* bite still counts and still sells.

### Missing a zone costs nothing

Straight from Race Tracks' Cruise mode, where a missed pickup is quietly moved
further up the road: **a zone the boat passes is re-seeded ahead**, so there is
always another one coming and the track can never strand the player. Zones keep
appearing until the mission is done.

The mix is weighted so a **green zone is never far away** — at least one in every
two or three — so holding out for the target is always a viable strategy rather
than a gamble.

**Zones come in pairs as often as singly**, one on each side, and that is where
the design gets its best moments: a green weed bed to port and an amber rock
shelf to starboard is a genuine choice, made with one switch by tapping once and
holding. A pair is never two greens — that would be a choice with no content —
and the pairing rate is one constant to tune.

---

## 6. At the zone — cast, or keep trolling

Pulling over fades into fishing over ~0.8 s. Same lake, same water, same boat,
re-framed: the camera swings **over the angler's shoulder, in the boat, looking
out over the bow** at the water you pulled into. The boat is static and bobbing,
the rod is in frame on the right with a live tip, and the shore and its landmarks
are still visible behind — so the player can see *where* they are, not a generic
fishing screen.

> *Filling a gap.* The brief's description of fishing mode cut off mid-sentence
> at "the same type of boat, and you're on the — in —". This framing is a
> proposal; §13 flags it.

### The card

A two-row scan list, and the second real decision in the game:

```
   ┌──────────────────────────────────────┐
   │  WEED BED                            │
   │  Good for: Northern Pike, Muskie     │
   │  Your target: Northern Pike  ✓       │
   │                                      │
   │  ▸ Cast                              │
   │  ▸ Keep trolling                     │
   └──────────────────────────────────────┘
```

**Cast** puts the line out. **Keep trolling** eases the boat back onto the track
and the trip resumes — no cost, no comment.

The card names the biome, what lives there, and whether the target is among them,
because that is what the choice is actually about. **Cast is pre-focused when the
zone is green; Keep trolling is pre-focused when it is amber** — so with Auto
Scan on, one press does the sensible thing and a second press is the deliberate
override.

> **Changed in rev 3.** Rev 2 had arrival auto-cast with no card at all, on the
> theory that driving there was already consent. That was wrong: it removed the
> player's last chance to change their mind, in the one place where the game
> knows something they might want to act on (*this is the wrong water*). Rev 3
> restores the choice as an explicit two-row card, which is also the thing that
> makes the whole design work on one switch (§3).

### The cast is automatic

No direction, no power meter. The rod casts once, out over the zone. The choice
of water was made on the track and is not asked again.

### The bite

Four to twelve seconds of nothing being asked, and it is *pleasant* — water
noise, a loon, the boat rocking. Then something takes the bait, announced on the
same four channels as everything else:

- **spoken** — *"Fish on!"*
- **a rising two-note tone**, centred, not panned — there is no direction here
- **big visual** — the bobber goes under, the rod tip bends, the line goes taut,
  and a large **HOOK IT — PRESS** prompt appears
- **a screen-edge glow**, breathing once every 2.4 s

The breathing wash is inherited from FishMaster I's catch light and keeps its
rules: *a lamp on a dimmer, not a strobe*, no deadline carried by the brightness,
and under `prefers-reduced-motion` it holds steady instead of breathing.

**Press Return to hook it.** There is no window to miss in any meaningful sense:
if the player does not press, the fish nibbles off, the game says *"it let go —
bait's still on"*, and another bite comes in a few seconds. No penalty, no lost
bait, no lost trip.

### The reel — hold to reel, ease off when it's tight

The one genuinely new mechanic, and the only place a live moment-to-moment
decision lives.

**Two bars, one control:**

```
  PROGRESS   ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░   how much line is in
  TENSION    ░░░░▓▓▓▓█████▓▓▓░░░░░   where the line is right now
                   └─ safe ─┘
```

- **Hold Return to reel.** Tension climbs while you hold and falls while you
  release. Progress advances only while tension is inside the safe band.
- **In the safe band:** green bar, green rim, prompt reads **REELING — KEEP
  GOING**, steady reel clicking. This is the nothing-to-decide state and the
  player is in it most of the time.
- **Too tight:** red, spoken ***"Ease off!"***, prompt reads **LET GO**, the line
  creaks.
- **Too slack:** amber, spoken ***"Reel!"***, prompt reads **PRESS AND HOLD**, the
  reel free-spools.

The safe band **drifts, and the fish pulls** — that is what makes it a fish and
not a metronome — but the drift is slow, always announced before it becomes a
problem, and the band is never narrower than something a switch can hold inside.

**Nothing here can fail.** Out-of-band time does not lose the fish and does not
end the fight; it only stops progress and costs **quality**. A player who does
nothing but hold Return start to finish lands the fish, at low quality, and it is
still the real fish. A player who never presses at all sits with a fish on the
line indefinitely while the game keeps saying *"press and hold to reel it in."*

**Fish size sets the fight, from data we already have.** Each species'
`difficultyTier` (2–5) — which in FishMaster I set Red/Blue sequence length — now
sets tension behaviour. Same field, same job, new shape:

| Tier | Safe band | Drift | Line | Feels like |
|---|---|---|---|---|
| 2 | wide | very slow | short | a sunfish; hold and you're done |
| 3 | wide | slow | medium | a bass; one or two ease-offs |
| 4 | medium | moderate | long | a pike; a real back-and-forth |
| 5 | narrow | lively, with surges | long | a sturgeon; an event |

Tier 5 is not *hard*, it is longer and more dramatic. The failure mode of a
tier-5 fish is a lower-quality sturgeon, never no sturgeon.

Both bars advance from the frame loop's `dt`, not from timers, so pausing freezes
the fight exactly where it was — the rule FishMaster I's charge meter and catch
light already follow.

### The catch card, then the choice again

The landed fish opens FishMaster I's **catch-reveal card**, essentially unchanged:
full art, then length / weight / quality for a fish, or a value and a quip for a
valuable, or a quip alone for junk — typewriter face, the player's Plaque or
Certificate background, High Contrast handling intact. A completed mission target
is called out on the card the moment it completes.

Dismissing the card returns to the same two-row choice — **Cast again** /
**Keep trolling** — with the zone's information refreshed:

- A zone **cools off** after three or four fish. The card says so
  (*"they've moved on"*), and **Keep trolling** takes the pre-focus.
- Otherwise **Cast again** stays pre-focused, because the player is somewhere
  that is working.

### When the mission is done

Catching the last of the target ends the trip: a short **results card** — what
was caught, what it earned, the mission ticked off — then any gear upgrade (§4),
then back to the dock with the next mission ready.

The boat keeps moving under the results card rather than freeze-framing, the way
Race Tracks' winning car coasts down its outro road. Ending on a still image felt
abrupt there and would feel abrupt here.

Nothing forces the player off the water early. Pause → **Restart Mission** is the
only way out of a trip in progress, and the trip itself has no end but success.

---

## 7. Quality, and what a catch is worth

The reel replaces the Red/Blue sequence as the **source** of the quality score.
Nothing downstream of the score changes:

- Quality is **time inside the safe band ÷ total fight time**, 0–100%.
- That percentage is a percentile into the species' existing `lengthRange` and
  `weightRange`, via the existing `rollFishCatch()`.

| Quality | Result |
|---|---|
| 75–100% | Excellent — top of the species' size range |
| 50–74% | Good |
| 25–49% | Fair |
| 1–24% | Poor — still the real fish, bottom of its range |
| Below 25% | The fish gets away; junk comes up instead (`demoted`) |

The junk/valuable roll still happens the moment something bites, independently of
the fight, and a demoted card still leads with *"`<Species>` Got Away"*. Sale
value is unchanged: `baseValuePerWeight × weight`, banked automatically at the end
of the trip.

> **One tuning note.** Under the old sequence, quality moved in big steps — one
> wrong press on a 2-step fish cost 50%. Tension time is continuous and far more
> forgiving, so scores will cluster high, and a pure hold-Return-forever run needs
> to actually land in the 1–24% Poor band rather than at 40%. Tune the per-tier
> band widths against that specific case: **hold-only should always land the fish,
> and should always land a bad one.**

> **A demoted target does not stall a mission.** If the target species gets away
> and comes up as junk, the mission counter does not advance — so a player having
> a bad run needs the zones to keep coming, which they do (§5). Worth watching in
> playtest: if a tier-5 finale target can be demoted repeatedly, the finale gets
> long. Raising the demotion floor for target species specifically is the lever.

---

## 8. The dock

Between missions the player is on the dock: the boat tied up, the shop shack
still standing there as scenery, the lake behind it. It is **one press to launch**
— the boat is the only interactive thing on it.

Its job is not to offer choices. It is where the mission card is read, where a
gear upgrade is handed over, and where the game is a *place* rather than a menu.
It also gives the player somewhere to be that is not moving, which matters more
than it sounds for a player who needs a moment between attempts.

> **Changed in rev 3.** Rev 2's dock had two interactive objects — boat and shop —
> and the shop sold gear. With gear on rails the shop has nothing to sell, so it
> stays as a building and stops being a destination.

Settings and Exit are reachable from the title screen and from the pause menu.

---

## 9. Auto-Scan interaction

**No new hub plumbing.** Carried from Race Tracks: the game derives its input
context purely from whether the menu overlay is visible.

- **Overlay visible** (title, dock, mission card, zone card, catch card, results,
  pause) → scanning is live and behaves like any other hub menu.
- **Overlay hidden** (driving, waiting for a bite, reeling) → auto-scan never
  starts; the switch is captured for the game. This is the scan dead zone.
- The pause menu opens the overlay, so scanning resumes automatically.

**Note the shape this game has settled into.** The whole game is three gestures
on one switch:

| Gesture | On the track | On a card | On a fish |
|---|---|---|---|
| **tap** | flip the armed side | select the highlighted row | hook it |
| **hold** | pull over (release commits) | — | reel |
| **do nothing** | let the zone pass | let auto-scan cycle | let the fish sit |

Three gestures, and *do nothing* is always safe in all three columns. That is the
entire input surface, and keeping it this small is the point of the rewrite.

---

## 10. Art direction

**Papercraft / diorama, identical to Race Tracks** — chunky flat-shaded primitives
over a shared procedural paper-fibre texture, warm saturated palette, ink outlines
on everything the player must react to (zone rings, the boat, the dock, the rod).
The UI is warm cream card stock with sticky-tape corners, thick ink borders, and
an unmistakable focus state (fill + outline + lift + scale).

`art.js` from Race Tracks is the starting kit. New meshes: **the boat**, **the
dock and shack**, **the rod, line and bobber**, **the zone ring and fish-finder
arch**, and **water**.

Water is the one real art problem, and the papercraft answer is the cheap one:
**layered flat planes with a scrolling paper-grain wash and a couple of
sine-driven vertex ripples**, ink-outlined at the shoreline, no reflections and no
transparency stack. Race Tracks' Deep Space already establishes that a surface
here can be suggested rather than simulated.

**Everything generated at runtime — with one exception.** Race Tracks has no asset
files at all, which is what lets it work offline with nothing to fail to load. The
3D world keeps that. The **catch-reveal card keeps FishMaster I's PNGs**: 15 fish,
4 junk, 4 valuables, 4 rods (full + `-icon`), the secret bait, and the `cardbg/`
plaque and certificate — all present, all already through the generate →
anatomy-check → chroma-key pipeline in `Projects\Assets\fishmaster-*\`. A
photo-real bass on a walnut plaque is the payoff the whole loop is built toward.

Copy the `images/` tree over as-is. `CATCH_PLACEHOLDER_EMOJI` stays as the
fallback for any id whose data ships before its art. Card art is `<img>` elements
in overlay HTML — a completely separate system from anything in `art.js`, as it
was in FishMaster I.

### Zone ring colour is load-bearing

Green-means-target / amber-means-not is the fastest read on the screen and it is
doing real work, so it cannot be the *only* channel: the spoken cue, the zone
name, and the card all state it in words too. Under **High Contrast** and for
colour-blind players the rings additionally differ in **shape** — the target ring
gets the fish-finder arch and a doubled outline, an amber one gets a single plain
ring — so the distinction survives with no colour at all.

### Accessibility profiles

All four colour profiles and High Contrast carry over with FishMaster I's rules
intact: biome colours are theme CSS variables read at draw time (**and any new
variable the 3D layer reads must also be listed in `PALETTE_VARS`, or `css()`
silently returns grey**); High Contrast means solid fills and heavy outlines
rather than a skin, and suppresses the card background photos while keeping the
catch art's grayscale+contrast filter.

`prefers-reduced-motion` kills the water shimmer, settles the bite ripples into
still rings, and holds the bite wash at steady brightness.

**Direction Help (Settings): On / Visual / Off**, carried from Race Tracks and
still presentation-only. On speaks and tones; Visual keeps the arrow, edge glow
and zone rings but drops the voice; Off drops the tones as well. **Off must not
hide the zone rings** — in Race Tracks hiding the green gates made a hard mode,
but here the rings are the only way to know what a zone holds, so hiding them
would make the game unplayable rather than harder.

---

## 11. Implementation notes

```
BENNYSFISHMASTER2/
  index.html      shell, overlays, HUD, all CSS
  images/         copied from BENNYSFISHMASTER (card art only)
  js/three.min.js three.js r155, copied from BENNYSRACETRACKS
  js/util.js      seeded RNG, math, storage, shared-manager helpers   [RT, as-is]
  js/audio.js     synthesised SFX, motor/water drone, panned cues     [RT, extend]
  js/art.js       papercraft kit + boat, dock, rod, water            [RT, extend]
  js/world.js     lake track, shoreline, biome regions, scenery      [RT, adapt]
  js/data.js      fish, rods, bait, items, quips, mission ladder     [FM, edit]
  js/game.js      dock, driving, zones, bite, reel, catch, missions  [new]
  js/ui.js        menus, scan engine, switch input, HUD              [RT, extend]
  js/main.js      renderer + animation loop                          [RT, as-is]
```

**RT** = Race Tracks, **FM** = FishMaster I.

### What comes over unchanged

- `FISH`, `BAIT`, `ITEM_TABLE`, `ITEM_QUIPS`, `BIOMES` in full — 14 species plus
  the secret Dingus, 6 bait, 4 junk, 4 valuables, all quips.
- `rollFishCatch()`, `resolveCatch()`, `rollBite()`, `biteWeightedFishPool()`,
  `pickQuip()`, `catchArtSrc()`, and the whole catch-reveal / rod-reveal overlay
  layer including `CARD_STYLES`.
- `LG.BAND_FRAC` and `reachFracOf()`.
- `pickLakeSetup()`'s completability *filter*, repurposed to vet one mission
  target at a time rather than a whole lake's objective set.
- Race Tracks' **level ladder and unlock/save structure**, scan engine, switch
  handling, pause gesture, four-channel guidance, layout-aware placement,
  finish-line/outro handling, and adaptive-resolution renderer.

Rev 3 reuses substantially more of Race Tracks than rev 2 did — the level system,
the auto-forward motion and the outro all come back into play, and the bespoke
open-water heading model is gone.

### What `data.js` actually needs

The only edits, and they should be made deliberately rather than as a side effect
of the port:

1. **`RODS`** — new `reachFt` values (175 / 325 / 425 / 500) and a rewritten
   derivation comment (§4). Names, costs, `reachNote` and `description` stay; cost
   is now flavour on the reveal card rather than a price.
2. **`LAKE_TEMPLATES`** — collapses to a single lake at `maxRadiusFt: 500`,
   carrying all five biomes rather than four.
3. **A new `MISSIONS` ladder** — an ordered list, each entry a target (species +
   amount, or a species-agnostic fallback) drawn from the three old
   `objectivePool` arrays, plus which biomes are open and which rod/bait the
   player holds by that point. This is the one genuinely new data structure and it
   is where the whole difficulty curve lives.
4. **`unlockLakeId`** on `FISH` and `BAIT` becomes unused — mission number is the
   gate now. Leave the field or strip it, but do not let anything read it.
5. **`objectivePool` / `objectiveCount` / `unlocks`** on the old lake templates
   are superseded by `MISSIONS`.

### What is genuinely new code

1. The **zone system** — placement along the track, biome and ring assignment,
   green/amber classification against the mission target, the 10–15 s pull-over
   window, one-at-a-time offering for one switch, re-seeding a missed zone.
2. The **pull-over manoeuvre** and the transition into fishing.
3. The **zone card** (Cast / Keep trolling) and its pre-focus logic.
4. The **bite and reel**, including the tension model and the quality score.
5. The **fishing-mode camera** and the rod/line/bobber rig.
6. **Water** rendering and the biome regions the track runs through.
7. The **mission ladder** and automatic gear progression.

### Carry Race Tracks' performance rules forward

The game targets low-powered hardware (a Surface Pro was visibly sluggish before
Race Tracks' optimisation pass). All three wins apply:

- **Batch static scenery** per material per 420 m chunk of track
  (`mergeScenery`) — this took a race from 3904 draw calls to ~390. The scene is
  draw-call bound, not vertex bound.
- **Distance-cull** zones, rings and scenery past ~620 m, where the fog has
  already swallowed them.
- **Adaptive resolution** — start at pixel ratio 1.25, measure frame rate, step
  down (disabling shadows at the floor) or up.

`RT.perf()` reports live draw-call / triangle / pixel-ratio counts — check it
after any change that adds objects to the scene.

Three Race Tracks conventions to respect:

- **Meshes face −Z.** The boat's Y rotation is `frame.yaw` (= −heading), never
  `frame.heading`. Getting this backwards looks fine at the dock and turns the
  boat sideways as the track curves. `debugAlignment()` reports the angle rather
  than making you eyeball it past a chase camera.
- **Anything laid flat on the water follows the banking** — place it via
  `world.pointAt` and roll it by `-frame.bank`, or zone rings will sink through
  the surface at their outer edge wherever the route banks.
- **Ground height is one function used twice** — `terrainRise()` + `bankOffset()`
  define the surface, and both the water ribbon and scenery placement must use
  them or props hover and sink.

### Saves

**New save key, version 1, no migration.** The structures do not correspond —
FishMaster I's save is built around cast sectors, per-lake seeds and three lakes,
none of which exist here. FishMaster I keeps its own save and stays playable.

Saved state is small now that gear is on rails: **highest mission reached, current
mission, per-mission best (biggest fish caught), lifetime money, and the creel.**
Gear is *derived* from mission number rather than stored, which removes a whole
class of desync bug.

Nothing about the lake's geometry is saved — only its seed, so reloading always
reproduces the same lake, exactly as FishMaster I does. Missions are fixed and
repeatable, seeded on `hash('mission:' + n)` the way Race Tracks seeds its levels.

### Testing

Race Tracks' strongest check was an **autopilot that steers only from the game's
own guidance cues** and completes a level with zero crashes. The equivalents here:

- a **green-only bot** that pulls over at every green zone and never at an amber
  one: it must complete every mission on the ladder, on many seeds. If it stalls,
  green zones are too rare or a target is not actually catchable at its mission.
- an **amber-only bot** that deliberately fishes the wrong water all game: it must
  still progress, slowly, and never deadlock. This is the real test of §5's "not
  punished, only less likely".
- a **never-press bot**: nothing anywhere may end, fail or time out. It must sit
  on the track indefinitely with zones cycling past forever, sit on a hooked fish
  indefinitely, and sit on the dock indefinitely.
- a **hold-Return-forever bot** through every reel tier: it must land every fish,
  and every fish must come in Poor (§7).
- a **one-switch bot** that only ever presses Return — tapping to flip and
  holding to commit — playing the entire game start to finish. This is Ben's
  actual rig and it is the acceptance test.
- a **gesture-boundary test** on the track: holds of 0.3 s, 0.5 s, 2 s, 4.9 s and
  5.1 s must produce, respectively, nothing, a pull-over, a pull-over, a
  pull-over, and the pause menu — with the pull-over cancelled in the last case
  and the boat still on the track.
- a **biome/rod step audit** down the whole ladder: no mission may ever offer a
  zone the player's current rod cannot reach (§4).

Drive the real game in Electron with synthetic switch events and screenshot, as
Race Tracks was tested.

### `games.json`

No `fetch()` of local JSON or WASM anywhere, same as FishMaster I, so `needsServer`
is **false** — unlike `BENNYSBALLISTA` and `TRIVIAMASTER`. Needs a thumbnail at
`images/games/<name>.png` alongside `bennysfishmaster.png` and
`bennysracetrack.png`.

---

## 12. Out of scope for V1

- **Shopping, currency management, or any purchase decision.**
- **Steering.** The boat drives itself; the player pulls over.
- **A throttle.** Speed is never a decision.
- **Hazards, hearts, or any fail state.**
- **More lakes.** One lake that opens up (§4).
- **Free roam.** The track is the level.
- **A hard mode / precision variant** — the tighter-window, accuracy-scored
  version Race Tracks also has parked.
- **Weather, time of day, seasons.**
- **Multiple boats.** Race Tracks' three vehicles were a real feature; here a
  second boat is cosmetic, since reach is on rails.
- **Fishing from the dock**, tempting as it is for a first-30-seconds tutorial.

---

## 13. Naming

`BENNYSFISHMASTER2` is a working folder name so both games can coexist during the
build. It should not ship. Candidates:

- **Benny's FishMaster** — take the name over when this replaces it. Cleanest for
  the player, who should never see a "2".
- **Benny's Lake Master** — sits beside *Race Tracks* nicely as a pair.
- **Benny's Fishing Trip** — describes what it actually is now.

Ari's call. Whatever it lands on, the folder, the `games.json` id, the save key and
the thumbnail all need to agree.

---

## 14. Open questions

**Still unanswered from the last round** — the design below assumes the answer in
brackets, and all three are cheap to change:

1. ~~**One-switch pull-over.**~~ **Resolved (rev 3.1):** Race Tracks' armed-side
   scheme — tap Return to flip the armed side, hold to pull over. Left/right
   survives on one switch, so zones appear on both sides for everyone. See §3.
2. **The dock.** §8 assumes **[keep it, one press to launch, no shop]**. Cutting
   it entirely (title → mission card → driving) is fewer screens.
3. **Trip end.** §6 assumes **[the trip ends when the mission target is caught]**.
   The alternative is a finish line the track runs to regardless.

**New:**

4. **What did the fishing-mode description end with?** The brief cut off at "the
   same type of boat, and you're on the — in —". §6's over-the-shoulder framing is
   a proposal filling that gap.
5. **How long is the ladder?** Ten missions matches Race Tracks and gives each of
   the four rods a couple of missions' life. Fewer and the upgrades come too fast
   to feel earned; more and the early rods outstay their welcome.
6. **Should a mission ever ask for two species?** One target is the cleanest thing
   to hold in your head, and it is what §4 specifies. A late-game "one pike and
   one walleye" would add variety at a real cost in clarity.
7. **Green-to-amber ratio.** §5 says at least one green in every two or three. Too
   generous and amber zones never get visited; too stingy and holding out stops
   feeling viable.
8. **How many fish before a zone cools off?** Three or four is a guess. Too few
   and the player is driving constantly; too many and the driving stops mattering.
9. **Is the bite wait (4–12 s) too long?** It is meant to be pleasant dead time,
   but dead time is exactly what a player with attention difficulty may not want.
10. ~~**Does the secret Dingus survive?**~~ **Resolved:** it is the last fish in
    the game — a hidden mission 11 revealed by clearing the sturgeon, with Vitamin
    T auto-equipped. See §4.
11. **`AGENTS.md` is missing.** FishMaster I's README cites `../../../../AGENTS.md`
    as "the rules every game in this hub is built to", and there is no such file
    anywhere in the hub. This doc is written to the rules as they are *practised*
    in Race Tracks and FishMaster I; if the real AGENTS.md turns up, check this
    against it.
