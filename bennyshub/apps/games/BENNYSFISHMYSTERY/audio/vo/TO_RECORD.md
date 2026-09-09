# Walt's lines still to record

Voice: **Matthew Schmitz** - the warm mountain man Walt already speaks in.

8 lines. Each one is saved into `audio/vo/` under the filename given,
as an mp3. The filename IS the wiring: the game looks a line up by its
cue id, so `q09_send.mp3` is what makes q09_send play instead of the
system voice reading it out.

Every one of these is a line whose WORDS CHANGED in the script, so the
recording no longer matches what the player reads on screen. Seven of them
still have their old file sitting in the folder - saving over it is the fix.
None of them is a new scene, and in every case the delivery is unchanged:
it is Walt saying something he already said, said correctly this time.

Read them in the order below - the four "logbook" ones are all the same
small change and are easiest done as a run.

When the files are in, add them to `audio/vo/index.json` under `lines`
(`"q09_send": "q09_send.mp3"`), or just run `python tools/record_voice.py`
which writes the manifest itself. `node tools/voicecheck.js` confirms it.

---

## The logbook four

Walt keeps a paper ledger - "my hand's going to ache writing this lot up",
"I'll put a star beside it", "let me turn the page". Four lines had him
saying "upload", which is a wireless-data verb in a game built to feel like
the opposite - and one of them said "upload that logbook", which you cannot
do to a book. "Logbook updated!" was already his phrase in three other
lines, so nothing new is being invented here.

*All four: same warmth, same pace as the old takes. Only the verb moved.*

### `q03a.mp3`

*Job 2, hand-in. REPLACES the file in the folder.*
*Old: "Tag data uploaded! Excellent work..."*

> Logbook updated! Excellent work. You've got a real gentle touch with those fish, kid.

### `q05b.mp3`

*Job 5, briefing. REPLACES the file in the folder.*
*Old: "...Once you upload that data, you'll have enough cash..."*

> You're moving fast, Junior Warden! Tag five more mixed panfish off the dock edge. Once that data's logged, you'll have enough cash to put a deposit down on my rental canoe and get off this dock!

### `q14b.mp3`

*Job 14, briefing. REPLACES the file in the folder.*
*Old: "...Once you upload that logbook, you'll have enough cash..."*

> Tag and release six more shallow bay fish. Once that's logged, you'll have enough cash to buy your very own yellow Kayak! No more paying daily canoe rentals.

### `q24b.mp3`

*Job 26, briefing. REPLACES the file in the folder.*
*Old: "...Upload that data, and you'll hit one thousand dollars..."*

> Tag eight more deep-water fish. Get it logged, and you'll hit one thousand dollars - enough to buy my brand new motorboat!

---

## The corrections

### `q08_done.mp3`

*Job 8, at the counter, when you hand Walt three pieces of scrap metal.
NO FILE IN THE FOLDER - the old one was deleted because it gave the ending
away, so right now the system voice reads this. Nothing is overwritten.*

*Old: "Three good pieces of iron - that's the sonar housing sorted. Nice
work with that magnet, kid." The sonar is a mystery until job 30 - Walt
does not know what he is building yet - so the clause is gone.*

*How it should sound: pleased with you, and nothing more than that. Warm
and easy. This is an early job and nothing mysterious has happened yet -
do NOT play it like he knows something.*

> Three good pieces of iron. Nice work with that magnet, kid.

### `q16b.mp3`

*Job 16, sending you out for pike. REPLACES the file in the folder.*

*Old take ended "...as deep as they go, and that is the deepest water your
kayak will sit over." The kayak is rated to seventy-five feet, so that was
untrue and it contradicted his own sales pitch when he sold you the thing.
Forty-five feet is a fact about PIKE, not about the boat. The clause is
gone and nothing replaces it - he just stops at "as deep as they go."*

> Northern pike hang on the weed edge and follow the break down - thirty-five to forty-five feet is as deep as they go. Paddle out, work the edge, and tag two of them for me.

### `q17_nudge.mp3`

*Job 17, when you ask Walt again what you are meant to be doing. REPLACES
the file in the folder, which says "fifty feet" - his own briefing for the
same job says forty, so the two contradicted each other.*

*How it should sound: short, practical, a reminder rather than a briefing.
He has already explained this once.*

> Straight down to the mud at forty feet. Three big catfish.

### `q20_nudge.mp3`

*Job 21 (quest id q20), same situation. REPLACES the file in the folder,
which sends you to "the log jam in sixty feet" - his own briefing sends you
to the outside weed line in forty, and pike do not live at sixty feet at
all, so both the place and the depth were wrong.*

*How it should sound: short and practical like the other nudges, with a bit
of "mind how you go" on the last clause - a ten-pounder will run straight
for the salad.*

> Ten-pounder, on the outside weed line in forty feet. Keep him out of the pads.
