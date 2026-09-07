/**
 * The thirty-five quests of Whispering Lake, and where each one happens.
 *
 *   node tools/gen_quests.js          # report
 *   node tools/gen_quests.js --write  # write content/quests.json and the places
 *
 * THIS IS THE STORY, from the master game plan: a kid with five dollars, Walt's
 * Tackle Shop & Research Station, thirty years of broken propellers blamed on
 * a lake monster called Old Whisper, and the truth - Barnaby, a giant sturgeon
 * left guarding a sunken sanctuary by the 1994 Lake Warden. Every line Walt
 * says is here, keyed to the audio file it will be recorded as (`walt_q01a`
 * and so on), and every line the player picks is here too, read by the system
 * voice for accessibility.
 *
 * WHAT A QUEST IS MADE OF
 *
 *   need      what has to be true to hand it in. Fish are TAGGED AND RELEASED,
 *             never kept, so a fish quest counts tags. Salvage comes up on the
 *             magnet. The rest are things done at the counter or out on the
 *             water: buying a boat, patching a hull, clearing the tab, reaching
 *             the fog.
 *   needs     the quests that must be finished first. Stated, not implied by
 *             order, so the editor can show the shape and refuse an edit that
 *             strands one.
 *   stage     which vessel's water it is in. The water gates the quest, not
 *             the other way round.
 *   reward    Walt's Warden Bounty on upload, and whatever he hands over.
 *   say       Walt, in three beats: giving the job, nudging when you come back
 *             without it, and on completion. `lines` carries every recorded
 *             cue in order for tools/record.js.
 *   player    the choice the player speaks, by system TTS.
 *
 * PLACES ARE FOUND, not typed. A salvage or a story quest needs a point on the
 * lake at the right depth, in the reach of its stage, away from the others.
 * Picking those by hand off a chart is how a quest item ends up under an
 * island; this searches the real chart for them.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RT = require(path.join(ROOT, 'js', 'lake.js'));
const WRITE = process.argv.includes('--write');

const lakeDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/lake.json'), 'utf8'));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/roster.json'), 'utf8'));
const L = RT.chart(lakeDoc);

/* Walt's lines, by cue id. One place, so the recording script and the game
   read the same words. */
const W = {
  q01a: "Well, hey there, kid! Welcome to Whispering Lake Research and Tackle. Don't see many new faces down at the dock this early in the morning.",
  q01a2: "Truth be told, I don't see many faces at all any more. Folks still buy their line and their hooks off me - I'm cheaper than town - but they don't fish here. Look out there. Not one boat on the water. Not any more.",
  q01b: "They'll tell you the lake's cursed. Something big out in the middle that takes the propeller clean off a boat. I stopped arguing about it years ago. So this is a research station now: I study what's in the water, and I write up what I find.",
  q01b2: "And what I'd give to know what's down in the middle, where it drops past a hundred feet. Nobody's been out there and come back with anything but a story.",
  q01c: "Five bucks, huh? Everybody starts somewhere. What I need is a pair of young hands - we catch them, tag them, log them and put every one straight back. Nothing gets kept on my dock. Start me here: my survey tank's empty and I need to know what's growing along the shore this year. Take this hand net, scoop me up thirty minnows and shiners - a netful at a time - and I'll pay you twenty-five dollars cash. Deal?",
  q02a: "Look at all those minnows! Fantastic work, kid. Here's your twenty-five dollars cash, fair and square.",
  q02b: "You can use that money right now to buy this bamboo rod and a container of earthworms. Now, see these bluegills hanging around the dock? We don't keep 'em to eat - we tag 'em! Catch three bluegills, clip a field tag on their fin, and let 'em go. Bring me the tag data when you're done.",
  q03a: "Tag data uploaded! Excellent work. You've got a real gentle touch with those fish, kid.",
  q03b: "Next up: yellow perch! They love hiding right next to the wooden dock pilings. Catch and tag three of 'em so we can track how fast they're growing this summer.",
  q04a: "Logbook updated! Perfect. Hey, while you're standing out on the dock, look down near the reed beds. Someone left a bunch of floating trash!",
  q04b: "Grab your hand net and scoop out five pieces of litter. We keep this water clean so the baby fish have a safe place to grow.",
  q05a: "Thanks for clearing out that trash. The lake looks better already, and I put twelve bucks in your hand for the trouble.",
  q05b: "You're moving fast, Junior Warden! Tag five more mixed panfish off the dock edge. Once you upload that data, you'll have enough cash to put a deposit down on my rental canoe and get off this dock!",
  q06a: "Here are the canoe oars, kid! You earned 'em. That red canoe at the end of the slip is all yours for the day.",
  q06b: "Head out into Shallow Bay, near the lily pads in fifteen feet of water. Largemouth bass love ambush hunting under those big green leaves. Tag two of 'em and bring back the log!",
  q07a: "Two largemouth bass, healthy and tagged! Outstanding.",
  q07b: "Black crappies travel in schools near the outer weed edges in twenty feet of water. Paddle out steady, drop your line right along the weedline, and tag four of 'em for the sanctuary database.",
  q08a: "Before you paddle back out, take this - Magnet Lure Number One! It attaches right to your line.",
  q08b: "Drop it over the shallow scrap markers out in the bay. People have been dropping iron and lost gear in this lake for fifty years. Pull me up three pieces of scrap metal, and I'll clean those scuffs off your canoe for free!",
  q09a: "Whoa! Hold on a second... where did you pull this up?!",
  q09b: "Look at those blade marks! This bronze propeller belonged to Big Mac's speedboat back in 2008. He used to tear through those shallow weeds like he owned the place, scaring off all the spawning bass.",
  q09c: "Big Mac swore a lake monster bit his boat! But look closely - Old Whisper didn't bite it. He jammed a thick, hardened tree root straight into the drive pin! Stopped his motor dead and taught Mac a lesson. Keep your eyes open out there, kid...",
  q10a: "I put that prop in the scrap bin - we can reuse that brass! Now, back to business.",
  q10b: "There's a giant five-pound largemouth bass lurking in the deepest lily pads on the west side. Set your hook clean, tag her up, and let her go!",
  q11a: "What in the world... let me see that!",
  q11b: "It's caked in lake mud, but under the grime... that's solid brass. It looks like a frame for some old mechanical device. See these mounting brackets?",
  q11c: "I'm setting this right here on the corner of my workbench in a tray of oil to soak off the rust. Whatever this was... it didn't sink by accident.",
  q12a: "The sun's getting low over the trees, kid. Perfect timing for catfish!",
  q12b: "Channel catfish feed along the muddy shallow banks right around dusk. Get two of 'em tagged and logged before you head into the dock for the night.",
  q13a: "Logbook updated! Nice catfish.",
  q13b: "Hey, if you've got five pieces of scrap metal in your inventory from magnet-fishing, trade 'em to me at the counter. I'll give you fifty dollars of shop credit toward your gear!",
  q14a: "You're doing great, kid. You're almost there!",
  q14b: "Tag and release six more shallow bay fish. Once you upload that logbook, you'll have enough cash to buy your very own yellow Kayak! No more paying daily canoe rentals.",
  q15a: "She's all yours! That yellow Kayak is sleek, fast, and can handle deeper water.",
  q15b: "She'll easily take you past the thirty-five-foot drop-off. Just keep an eye on her hull durability bar down at the bottom of your screen. Hitting submerged logs out there will scuff her up, but you can always bring her back to me for repairs!",
  q16a: "Welcome to the Deep Hole, kid! The bottom drops like a cliff right past those buoys, all the way down to seventy-five feet.",
  q16b: "Northern pike love patrolling those deep rock ledges around thirty-five to fifty feet. Paddle out in your new kayak, set your line deep, and tag two northern pike!",
  q17a: "Those northern pike put up a real fight, didn't they? Great tags.",
  q17b: "Drop your line straight down to the bottom mud in fifty feet of water. The really big channel catfish stay down there out of the sunlight. Tag three of 'em!",
  q18a: "Aha! Look at this!",
  q18b: "These gear teeth match the brass frame you found earlier! Look - they interlock perfectly! Whoever built this knew exactly what they were doing. Let me mount these cogs right inside the frame...",
  q19a: "You've been putting some miles on that kayak, kid! See those scuffs on the bottom?",
  q19b: "Bring her up to the dock workshop. A little resin patch and some scrap metal will have her running smooth again. Give it a shot!",
  q20a: "Looks good as new!",
  q20b: "There's a rumor of a massive ten-pound northern pike hanging around the submerged log jam in sixty feet of water. Keep your line tight so he doesn't wrap you around the branches, tag him, and bring me the data!",
  q21a: "Kid... look at these fine metal tines. It's a music box comb!",
  q21b: "When I pluck it, it vibrates at a super low frequency. This wasn't built to play a song for human ears. It was built to echo underwater through deep thermoclines!",
  q22a: "You hauled this up from seventy-five feet deep?! Kid... this iron lockbox has the official 1994 Lake Warden seal!",
  q22b: "Listen to this journal entry from the old Warden: 'The flood of ninety-four sank our underwater sanctuary station. My loyal sturgeon stayed behind to guard the baby fish. I call him Barnaby...'",
  q22c: "Barnaby... Old Whisper's real name is Barnaby! He isn't a monster, kid... he's been guarding the sunken sanctuary for thirty years!",
  q23a: "All these years, people thought he was a mean beast... turns out he was just doing his job.",
  q23b: "We need to check the cold-water species down near the thermocline. Tag two lake trout in seventy feet of water so we know how they're holding up.",
  q24a: "Logbook updated! You're doing incredible work out there.",
  q24b: "Tag eight more deep-water fish. Upload that data, and you'll hit one thousand dollars - enough to buy my brand new motorboat!",
  q25a: "She's all yours! A real motorboat with a steering wheel and a throttle.",
  q25b: "But listen to me very carefully, kid. Stay away from the center fog. The water out there drops into an abyssal trench over one hundred and twenty feet deep. No boat engine has survived out there in thirty years!",
  q26a: "I told you, kid! I warned ya!",
  q26b: "I'm glad you're not hurt, but look at that motorboat stern - the propeller drive pin is snapped clean off, and the engine is dead. I towed you back, but that repair tab is gonna cost ya. You didn't hit a rock out there... Barnaby stopped your boat!",
  q27a: "Barnaby doesn't mind kayaks - no noisy motors! Take your kayak back out to the edge of the fog where your boat broke down.",
  q27b: "Magnet-fish right where you stalled out. There's gotta be one last piece of the puzzle down there!",
  q28a: "You found the winding key! And look at this paper from the 1994 lockbox... it's a blueprint schematic!",
  q28b: "Kid! The brass frame, the gears, the sound comb, the winding key... we haven't been building a random music box on my counter... we've been building the old Warden's Acoustic Sonar!",
  q29a: "Hand me those three heavy scrap metal pieces! I'm using the brass from Big Mac's old prop to forge the outer housing.",
  q29b: "Done! The Acoustic Sonar is mounted right to your motorboat stern. Instead of noisy motor vibrations, it sends out gentle, warm musical chimes that Barnaby recognizes!",
  q30a: "Take this Pro Rod. While I do the final electrical wiring checks on the sonar, take your motorboat to the fog boundary and tag three deep lake trout at ninety feet.",
  q31a: "A fifteen-pound lake trout from a hundred feet down! Wow! That Pro Rod handled the line tension beautifully.",
  q31b: "You've become a master angler, kid. Truly.",
  q32a: "Every single dollar of your repair debt is paid off from your tag bounties! You're completely square with the shop, Junior Warden.",
  q33a: "Heavy magnet equipped, Pro Rod ready, Acoustic Sonar online.",
  q33b: "Head out to the center fog in one hundred and twenty feet of water. Cut your engine, turn on the Acoustic Sonar, and let the music play into the water. Good luck, kid.",
  q34a: "I hear the sonar chimes echoing through my shop radio, kid... low and warm. Keep steady out there.",
  q34b: "Look at your sonar screen... a massive shadow is rising from a hundred feet down... it's him!",
  q35a: "Look at him, kid... That's Barnaby! Thirty years old, silver scales... and look what he's holding in his mouth... it's the old Warden's tarnished brass bell!",
  q35b: "He isn't fighting us. He's passing the bell to you. Reach out and take it...",
  q35c: "He did it! Barnaby knows the lake is in good hands now! From this day on, the deep center is an official Wildlife Sanctuary, and you are officially the Chief Junior Warden of Whispering Lake! I'm so proud of you, kid!",
};

/* Nudges: what Walt says when you come back without the job done. Not in the
   master plan, which only has the giving and the finishing - so these are
   short, in his voice, and point back at the water. Recorded like the rest. */
const NUDGE = {
  q01: "No rush, kid. Thirty little fish - the shoreline's full of 'em. Dip the net where the water's knee-deep.",
  q02: "Three bluegills, tagged and let go. They're right under the boards.",
  q03: "Perch hug those pilings. Three tags, and bring me the data.",
  q04: "That litter's still floating by the reeds. Five pieces, kid.",
  q05: "Five more panfish and that canoe deposit is yours.",
  q06: "The bass are under the lily pads in fifteen feet. Two tags.",
  q07: "Crappies run the outer weedline in twenty feet. Four of 'em.",
  q08: "Drop that magnet over the scrap markers. Three pieces gets your canoe cleaned.",
  q09: "Whatever's out by the west weeds, the magnet'll find it.",
  q10: "She's a five-pounder, in the deepest pads on the west side. Take your time.",
  q11: "Something's in the mud at the shallow drop-off. Keep dragging that magnet.",
  q12: "Catfish come up the muddy banks at dusk. Two tags before dark.",
  q13: "Five pieces of scrap at the counter, and it's fifty dollars of credit.",
  q14: "Six more bay fish and that kayak's yours.",
  q15: "The yellow kayak's two hundred and fifty. Come see me at the counter.",
  q16: "Pike patrol the rock ledges past the buoys. Two tags, kid.",
  q17: "Straight down to the mud at fifty feet. Three big catfish.",
  q18: "There's more of that brass down the drop-off. Keep the magnet down.",
  q19: "Bring the kayak up to the workshop and we'll patch her.",
  q20: "Ten-pounder, at the log jam in sixty feet. Keep him out of the branches.",
  q21: "Try the magnet at the deep log jam. Something's still down there.",
  q22: "The seventy-five-foot edge, kid. Heavy magnet work.",
  q23: "Two lake trout in seventy feet. Cold water, deep line.",
  q24: "Eight deep-water fish and that motorboat's yours.",
  q25: "A thousand dollars, and she's yours. Come to the counter.",
  q26: "Well - you'll find out what's in that fog soon enough.",
  q27: "Right where you stalled. The kayak won't bother him.",
  q28: "Bring me that blueprint from the lockbox, kid.",
  q29: "Three heavy pieces of scrap and I'll forge the housing.",
  q30: "Three trout at ninety feet, on the Pro Rod.",
  q31: "There's a fifteen-pounder down at a hundred feet. Let the rod do the work.",
  q32: "Square the tab and we're ready.",
  q33: "Heavy magnet, Pro Rod, sonar. Then the fog.",
  q34: "Cut the engine out there and let the sonar play.",
  q35: "Take the bell, kid. He's offering it to you.",
};

/* ── The ladder ─────────────────────────────────────────────────────────── */
const Q = [
  /* STAGE 1 - the dock and the shoreline, 0-10 ft */
  { id: 'q01', stage: 'foot', kind: 'net', title: 'The First Dollar',
    card: "Scoop 30 minnows and shiners for Walt's survey tank",
    need: { type: 'catchCount', amount: 30, netOnly: true },
    reward: { money: 25 }, needs: [],
    player: "I want to become a real fisherman! ...But I only have five dollars.",
    brief: ['q01a', 'q01a2', 'q01b', 'q01b2', 'q01c'], done: ['q02a'],
    replies: ["I want to become a real fisherman! ...But I only have five dollars.", "Cursed? What's out there?", "So you study them instead of catching them?", "Why has nobody been to the middle?", "Deal."] },
  { id: 'q02', stage: 'foot', kind: 'tag', title: 'Panfish Tagging',
    card: 'Catch, tag and release 3 Bluegills off the dock edge',
    need: { type: 'catchCount', speciesId: 'bluegill', amount: 3 },
    reward: { money: 15 }, needs: ['q01'], shopHint: ['bamboo_rod'],
    player: 'What should I buy first?',
    brief: ['q02b'], done: ['q03a'] },
  { id: 'q03', stage: 'foot', kind: 'tag', title: 'Perch Patrol',
    card: 'Catch, tag and release 3 Yellow Perch from the dock pilings',
    need: { type: 'catchCount', speciesId: 'perch', amount: 3 },
    reward: { money: 18 }, needs: ['q02'],
    player: 'What fish are we logging next?',
    brief: ['q03b'], done: ['q04a'] },
  { id: 'q04', stage: 'foot', kind: 'net', title: 'Shoreline Clean-up',
    card: 'Net 5 pieces of floating litter near the reeds',
    need: { type: 'recoverItem', itemId: 'floating_litter', amount: 5 },
    place: { depth: [0.5, 6], near: 'dock', label: 'the reed beds' },
    reward: { money: 12 }, needs: ['q03'],
    player: 'I can clean that up right now.',
    brief: ['q04b'], done: ['q05a'] },
  { id: 'q05', stage: 'foot', kind: 'tag', title: 'The Canoe Fund',
    card: 'Tag and release 5 mixed panfish off the dock edge',
    need: { type: 'catchCount', amount: 5 },
    reward: { money: 30 }, needs: ['q04'], unlocks: ['canoe'],
    player: 'How do I get out onto the lake?',
    brief: ['q05b'], done: ['q06a'] },

  /* STAGE 2 - the shallow bay and the weedbeds, 10-35 ft */
  { id: 'q06', stage: 'canoe', kind: 'tag', title: 'Weed Bed Bass',
    card: 'Tag and release 2 Largemouth Bass under the lily pads',
    need: { type: 'catchCount', speciesId: 'bass', amount: 2 },
    reward: { money: 35 }, needs: ['q05'],
    player: 'Where is the best fishing spot in the bay?',
    brief: ['q06b'], done: ['q07a'] },
  { id: 'q07', stage: 'canoe', kind: 'tag', title: 'Crappie Craze',
    card: 'Tag and release 4 Black Crappies along the outer weed edge',
    need: { type: 'catchCount', speciesId: 'crappie', amount: 4 },
    reward: { money: 30 }, needs: ['q06'],
    player: 'Where are the crappies hiding?',
    brief: ['q07b'], done: ['q08a'] },
  { id: 'q08', stage: 'canoe', kind: 'salvage', title: 'The First Magnet Drop',
    card: 'Haul up 3 pieces of scrap metal with Magnet Lure #1',
    need: { type: 'recoverItem', itemId: 'scrap_metal', amount: 3 },
    place: { depth: [12, 30], label: 'the shallow scrap markers' },
    reward: { money: 25, grantsToolId: 'magnet_1', repair: true }, needs: ['q07'],
    player: 'How does magnet fishing work?',
    brief: ['q08b'], done: ['q09a'] },
  { id: 'q09', stage: 'canoe', kind: 'clue', title: 'Mystery Clue #1: The Snapped Propeller',
    card: 'Magnet-fish near the west weeds for the snapped propeller',
    need: { type: 'recoverItem', itemId: 'snapped_propeller', amount: 1 },
    place: { depth: [12, 30], west: true, label: 'the west weed beds' },
    reward: { money: 0 }, needs: ['q08'],
    player: 'I found it near the west weed beds!',
    brief: ['q09a', 'q09b', 'q09c'], done: ['q10a'] },
  { id: 'q10', stage: 'canoe', kind: 'tag', title: 'Big Bass Challenge',
    card: 'Tag and release a Largemouth Bass over 5 lbs in the deep weeds',
    need: { type: 'catchWeightOne', speciesId: 'bass', amount: 5 },
    reward: { money: 40 }, needs: ['q09'],
    player: 'Are there bigger bass out in thirty feet of water?',
    brief: ['q10b'], done: ['q11a'] },
  { id: 'q11', stage: 'canoe', kind: 'clue', title: 'Mystery Clue #2: The Brass Frame',
    card: 'Magnet-fish the shallow drop-off for the waterlogged brass frame',
    need: { type: 'recoverItem', itemId: 'brass_frame', amount: 1 },
    place: { depth: [28, 35], label: 'the shallow drop-off' },
    reward: { money: 0 }, needs: ['q10'],
    player: 'It was buried under thirty feet of mud.',
    brief: ['q11a', 'q11b', 'q11c'], done: ['q12a'] },
  { id: 'q12', stage: 'canoe', kind: 'tag', title: 'Night Night Catfish',
    card: 'Tag and release 2 Channel Catfish along the muddy banks',
    need: { type: 'catchCount', speciesId: 'catfish', amount: 2 },
    reward: { money: 35 }, needs: ['q11'],
    player: 'Where do catfish go when it gets dark?',
    brief: ['q12b'], done: ['q13a'] },
  { id: 'q13', stage: 'canoe', kind: 'trade', title: 'Shallow Scrap Drive',
    card: 'Trade 5 pieces of scrap metal to Walt at the counter',
    need: { type: 'tradeScrap', amount: 5 }, at: 'counter',
    reward: { money: 50 }, needs: ['q12'],
    player: 'What can I do with all this scrap metal?',
    brief: ['q13b'], done: ['q14a'] },
  { id: 'q14', stage: 'canoe', kind: 'tag', title: 'The Kayak Goal',
    card: 'Tag and release 6 shallow bay fish',
    need: { type: 'catchCount', amount: 6 },
    reward: { money: 60 }, needs: ['q13'],
    player: 'How close am I to buying the Kayak?',
    brief: ['q14b'], done: ['q15a'] },
  { id: 'q15', stage: 'canoe', kind: 'buy', title: 'Buying the Kayak',
    card: 'Buy the yellow Kayak ($250)',
    need: { type: 'ownVessel', vesselId: 'kayak' }, at: 'counter',
    reward: { money: 0 }, needs: ['q14'],
    player: 'How deep can I go in this Kayak?',
    brief: ['q15a', 'q15b'], done: ['q16a'] },

  /* STAGE 3 - the deep hole and the drop-off, 35-75 ft */
  { id: 'q16', stage: 'kayak', kind: 'tag', title: 'Deep Waters',
    card: 'Tag and release 2 Northern Pike off the drop-off',
    need: { type: 'catchCount', speciesId: 'pike', amount: 2 },
    reward: { money: 50 }, needs: ['q15'],
    player: 'What fish patrol the deep cliff ledges?',
    brief: ['q16b'], done: ['q17a'] },
  { id: 'q17', stage: 'kayak', kind: 'tag', title: 'Catfish Depth',
    card: 'Tag and release 3 Channel Catfish from the bottom mud at 50 ft',
    need: { type: 'catchCount', speciesId: 'catfish', amount: 3, minDepthFt: 40 },
    reward: { money: 45 }, needs: ['q16'],
    player: 'Are there catfish down at fifty feet?',
    brief: ['q17b'], done: ['q18a'] },
  { id: 'q18', stage: 'kayak', kind: 'clue', title: 'Mystery Clue #3: The Gear Assembly',
    card: 'Magnet-fish the drop-off for the gear assembly',
    need: { type: 'recoverItem', itemId: 'gear_assembly', amount: 1 },
    place: { depth: [38, 55], label: 'the drop-off ledges' },
    reward: { money: 0 }, needs: ['q17'],
    player: 'Do these gears belong to the brass frame?',
    brief: ['q18a', 'q18b'], done: ['q19a'] },
  { id: 'q19', stage: 'kayak', kind: 'repair', title: 'Kayak Care',
    card: 'Repair the Kayak at the dock workshop',
    need: { type: 'repairVessel' }, at: 'counter',
    reward: { money: 0 }, needs: ['q18'],
    player: 'How do I patch up the hull?',
    brief: ['q19a', 'q19b'], done: ['q20a'] },
  { id: 'q20', stage: 'kayak', kind: 'tag', title: 'Pike Hunter',
    card: 'Tag and release a Northern Pike over 10 lbs at the log jam',
    need: { type: 'catchWeightOne', speciesId: 'pike', amount: 10 },
    reward: { money: 60 }, needs: ['q19'],
    player: 'Is there a trophy fish near the deep log jam?',
    brief: ['q20b'], done: ['q21a'] },
  { id: 'q21', stage: 'kayak', kind: 'clue', title: 'Mystery Clue #4: The Sound Comb',
    card: 'Magnet-fish the deep log jam for the sound comb',
    need: { type: 'recoverItem', itemId: 'sound_comb', amount: 1 },
    place: { depth: [55, 68], label: 'the submerged log jam' },
    reward: { money: 0 }, needs: ['q20'],
    player: 'Why are the tines so thick and heavy?',
    brief: ['q21a', 'q21b'], done: ['q22a'] },
  { id: 'q22', stage: 'kayak', kind: 'clue', title: 'The 1994 Lockbox',
    card: "Haul up the Warden's Lockbox from the 75 ft edge",
    need: { type: 'recoverItem', itemId: 'warden_lockbox', amount: 1 },
    place: { depth: [68, 75], label: 'the seventy-five-foot edge' },
    reward: { money: 0 }, needs: ['q21'],
    player: "What does the Warden's journal say?",
    brief: ['q22a', 'q22b', 'q22c'], done: ['q23a'] },
  { id: 'q23', stage: 'kayak', kind: 'tag', title: 'Deep Trout Survey',
    card: 'Tag and release 2 Lake Trout in 70 ft of cold water',
    need: { type: 'catchCount', speciesId: 'laketrout', amount: 2 },
    reward: { money: 65 }, needs: ['q22'],
    player: "How do we check on the fish near Barnaby's lair?",
    brief: ['q23a', 'q23b'], done: ['q24a'] },
  { id: 'q24', stage: 'kayak', kind: 'tag', title: 'Motorboat Savings',
    card: 'Tag and release 8 deep-hole fish',
    need: { type: 'catchCount', amount: 8, minDepthFt: 35 },
    reward: { money: 100 }, needs: ['q23'],
    player: 'Am I ready for the Motorboat?',
    brief: ['q24b'], done: ['q25a'] },
  { id: 'q25', stage: 'kayak', kind: 'buy', title: 'Buying the Motorboat',
    card: 'Buy the Motorboat ($1,000)',
    need: { type: 'ownVessel', vesselId: 'motorboat' }, at: 'counter',
    reward: { money: 0 }, needs: ['q24'],
    player: 'Where can I take this motorboat?',
    brief: ['q25a', 'q25b'], done: ['q26a'] },

  /* STAGE 4 - the centre fog and the incident, 75-120+ ft */
  { id: 'q26', stage: 'motorboat', kind: 'incident', title: "Walt's Warning Ignored",
    card: 'Drive the Motorboat into the 120 ft trench fog',
    need: { type: 'reachSpot', flag: 'stalled_in_fog', amount: 1 },
    place: { depth: [105, 130], label: 'the centre fog', breakdown: true },
    reward: { money: 0, debt: 180 }, needs: ['q25'],
    player: 'The engine just stopped in hundred-foot water!',
    brief: ['q26a', 'q26b'], done: ['q27a'] },
  { id: 'q27', stage: 'kayak', kind: 'clue', title: 'Kayak Recon',
    card: 'Take the Kayak to the fog edge and magnet-fish the winding key',
    need: { type: 'recoverItem', itemId: 'winding_key', amount: 1, vesselId: 'kayak' },
    place: { depth: [64, 74], label: 'the edge of the fog' },
    reward: { money: 0 }, needs: ['q26'],
    player: 'What am I magnet-fishing for out in the fog?',
    brief: ['q27a', 'q27b'], done: ['q28a'] },
  { id: 'q28', stage: 'motorboat', kind: 'story', title: 'The Sonar Schematic',
    card: 'Bring the Lockbox blueprint to Walt',
    need: { type: 'reachSpot', flag: 'blueprint_shown', amount: 1 }, at: 'counter',
    reward: { money: 0 }, needs: ['q27'],
    player: 'What were all these brass parts for?',
    brief: ['q28a', 'q28b'], done: ['q29a'] },
  { id: 'q29', stage: 'motorboat', kind: 'trade', title: 'Assembling the Sonar',
    card: 'Trade 3 heavy scrap pieces to complete the Acoustic Sonar',
    need: { type: 'tradeScrap', amount: 3 }, at: 'counter',
    reward: { money: 0, grantsToolId: 'acoustic_sonar' }, needs: ['q28'],
    player: 'Will this sonar keep Barnaby calm?',
    brief: ['q29a'], done: ['q29b', 'q30a'] },
  { id: 'q30', stage: 'motorboat', kind: 'tag', title: 'Deep Sanctuary Survey',
    card: 'Tag and release 3 Lake Trout at 90 ft near the fog boundary',
    need: { type: 'catchCount', speciesId: 'laketrout', amount: 3, minDepthFt: 80 },
    reward: { money: 80, grantsRodId: 'pro_rod' }, needs: ['q29'],
    player: 'Heading out to ninety feet now!',
    brief: ['q30a'], done: ['q31a'] },
  { id: 'q31', stage: 'motorboat', kind: 'tag', title: 'Pro Rod Mastery',
    card: 'Tag and release a Lake Trout over 15 lbs at 100 ft',
    need: { type: 'catchWeightOne', speciesId: 'laketrout', amount: 15 },
    reward: { money: 100 }, needs: ['q30'],
    player: 'The line held up great in the trench!',
    brief: ['q31a', 'q31b'], done: ['q32a'] },
  { id: 'q32', stage: 'motorboat', kind: 'debt', title: 'Cleared Tabs',
    card: 'Pay off every dollar of the repair tab',
    need: { type: 'clearDebt' }, at: 'counter',
    reward: { money: 0 }, needs: ['q31'],
    player: "All tabs cleared! What's next?",
    brief: ['q32a'], done: ['q33a'] },
  { id: 'q33', stage: 'motorboat', kind: 'buy', title: 'Final Checks',
    card: 'Equip the Heavy Magnet with the Pro Rod and the Acoustic Sonar',
    need: { type: 'ownTool', toolId: 'heavy_magnet' }, at: 'counter',
    reward: { money: 0 }, needs: ['q32'],
    player: "I'm ready to enter the Abyssal Trench.",
    brief: ['q33a', 'q33b'], done: ['q34a'] },

  /* STAGE 5 - the climax, 120+ ft */
  { id: 'q34', stage: 'motorboat', kind: 'story', title: 'The Chime on the Water',
    card: 'Motor into the 120 ft trench, cut the engine and play the sonar',
    need: { type: 'reachSpot', flag: 'sonar_played', amount: 1 },
    place: { depth: [110, 130], label: 'the abyssal trench', sameAs: 'q26' },
    reward: { money: 0 }, needs: ['q33'],
    player: 'The sonar rings are sending musical waves 120 feet down...',
    brief: ['q34a'], done: ['q34b', 'q35a'] },
  { id: 'q35', stage: 'motorboat', kind: 'finale', title: 'Passing the Torch',
    card: "Take the Warden's Bell from Barnaby and bring it home",
    need: { type: 'ringBell', amount: 1 },
    place: { depth: [110, 130], label: 'the abyssal trench', sameAs: 'q26' },
    reward: { money: 0, grantsItemId: 'warden_bell', title: 'Chief Junior Warden of Whispering Lake' },
    needs: ['q34'],
    player: "He's floating right alongside the boat...",
    action: "Take the Warden's Bell",
    brief: ['q35a', 'q35b'], done: ['q35c'] },
];

/* ── Places ─────────────────────────────────────────────────────────────── */
const STAGE = {};
L.stages.forEach((s) => { STAGE[s.id] = s; });
const taken = [];
const found = {};

function findPlace(q) {
  const spec = q.place;
  if (spec.sameAs && found[spec.sameAs]) return found[spec.sameAs];
  const reach = (STAGE[q.stage] || { reach: 3200 }).reach;
  const e = L.extent;
  let best = null;
  for (let x = e.minX; x <= e.maxX; x += 25) {
    for (let z = e.minZ; z <= e.maxZ; z += 25) {
      const ft = L.depthAt(x, z);
      if (ft < spec.depth[0] || ft >= spec.depth[1]) continue;
      const r = L.fromDock(x, z);
      if (r > reach * 0.95) continue;
      if (spec.near === 'dock' && r > 90) continue;
      if (spec.west && x > -350) continue;
      if (L.toShore(x, z) < (spec.near ? 8 : 40)) continue;
      let clash = false;
      for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < 180) { clash = true; break; }
      if (clash) continue;
      // Deepest first for the trench, nearest otherwise: a clue should be
      // findable, an incident should be as far into the fog as possible.
      const score = spec.breakdown || spec.depth[0] >= 100 ? ft * 10 : -r * 0.05 + ft;
      if (!best || score > best.score) best = { x, z, ft, r, score };
    }
  }
  if (best) { taken.push(best); found[q.id] = best; }
  return best;
}

console.log('WHISPERING LAKE  ' + Q.length + ' quests');
console.log();
console.log('id    stage      kind      pay   requirement                          place');
/* What each job puts out on Walt's shelf. Gear is not for sale before the
   quest that is about it: the canoe appears with the job about saving for a
   canoe, the heavy magnet with the job that needs one. What a quest HANDS
   over (the net, the magnets, the pro rod) is never sold at all. */
const SELLS = {
  q02: ['bamboo_rod'], q05: ['canoe'], q06: ['fiber_rod'], q14: ['kayak'],
  q08: ['magnet_1'], q16: ['carbon_rod'], q24: ['motorboat'], q33: ['heavy_magnet'],
};

/* What each job pays. Every dollar in the game is here: a fish is tagged and
   let go, scrap is traded because a job asks for it, and an artifact is worth
   nothing but the story. So these numbers ARE the economy, and each purchase
   is paid for by the jobs just before it. */
const PAY = {
  "q01": 25,
  "q02": 20,
  "q03": 20,
  "q04": 12,
  "q05": 35,
  "q06": 45,
  "q07": 40,
  "q08": 40,
  "q09": 0,
  "q10": 50,
  "q11": 0,
  "q12": 45,
  "q13": 50,
  "q14": 140,
  "q15": 0,
  "q16": 95,
  "q17": 85,
  "q18": 75,
  "q19": 0,
  "q20": 105,
  "q21": 65,
  "q22": 65,
  "q23": 115,
  "q24": 590,
  "q25": 0,
  "q26": 0,
  "q27": 100,
  "q28": 0,
  "q29": 0,
  "q30": 130,
  "q31": 160,
  "q32": 0,
  "q33": 0,
  "q34": 0,
  "q35": 0
};
Q.forEach((q) => { if (PAY[q.id] !== undefined) q.reward.money = PAY[q.id]; });

const places = [];
let problems = 0;
Q.forEach((q) => {
  let p = null;
  if (q.place) {
    p = findPlace(q);
    if (!p) problems++;
    else {  // every quest with a place gets its own record, even at a shared spot
      places.push({ id: q.id + '.place', quest: q.id, kind: q.kind, label: q.place.label,
                    x: Math.round(p.x), z: Math.round(p.z), depthFt: Math.round(p.ft),
                    breakdown: !!q.place.breakdown,
                    note: 'Found by tools/gen_quests.js. Drag it in the editor.' });
    }
  }
  const n = q.need;
  const req = n.type + (n.speciesId ? ' ' + n.speciesId : '') + (n.itemId ? ' ' + n.itemId : '') +
    (n.vesselId ? ' ' + n.vesselId : '') + (n.toolId ? ' ' + n.toolId : '') +
    (n.amount ? ' x' + n.amount : '') + (n.minDepthFt ? ' >' + n.minDepthFt + 'ft' : '');
  console.log('  ' + q.id + '  ' + q.stage.padEnd(10) + q.kind.padEnd(9) +
    ('$' + q.reward.money).padStart(5) + '   ' + req.padEnd(36) +
    (q.place ? (p ? Math.round(p.ft) + ' ft at ' + Math.round(p.x) + ',' + Math.round(p.z) : 'NO PLACE') : (q.at || '-')));
});

/* Dependencies: a shape, not a tangle. */
const byId = {}; Q.forEach((q) => { byId[q.id] = q; });
Q.forEach((q, i) => (q.needs || []).forEach((d) => {
  if (!byId[d]) { console.log('  ' + q.id + ' needs ' + d + ' which does not exist'); problems++; }
  else if (Q.indexOf(byId[d]) > i) { console.log('  ' + q.id + ' needs ' + d + ' which comes later'); problems++; }
}));
const reach = new Set(); let grew = true;
while (grew) { grew = false; Q.forEach((q) => { if (!reach.has(q.id) && (q.needs || []).every((d) => reach.has(d))) { reach.add(q.id); grew = true; } }); }
Q.forEach((q) => { if (!reach.has(q.id)) { console.log('  ' + q.id + ' can never be reached'); problems++; } });

/* Every cue Walt speaks must exist, and every id must be spoken somewhere. */
const spoken = new Set();
Q.forEach((q) => [].concat(q.brief, q.done).forEach((c) => {
  if (!W[c]) { console.log('  ' + q.id + ' cues ' + c + ', which has no line'); problems++; }
  spoken.add(c);
}));
Object.keys(W).forEach((c) => { if (!spoken.has(c)) { console.log('  line ' + c + ' is never spoken'); problems++; } });
Q.forEach((q) => { if (!NUDGE[q.id]) { console.log('  ' + q.id + ' has no nudge'); problems++; } });

/* Money: the bounties against the shop, stage by stage. */
console.log();
console.log('THE MONEY');
const price = {}; [].concat(roster.rods, roster.vessels, roster.tools).forEach((g) => { price[g.id] = g.price || 0; });
const BUYS = { foot: ['bamboo_rod'], canoe: ['canoe', 'fiber_rod', 'magnet_1', 'kayak'],
               kayak: ['carbon_rod', 'magnet_2', 'motorboat'], motorboat: ['heavy_magnet'] };
let bank = 5;
['foot', 'canoe', 'kayak', 'motorboat'].forEach((st) => {
  const earned = Q.filter((q) => q.stage === st).reduce((s, q) => s + q.reward.money, 0);
  const cost = (BUYS[st] || []).reduce((s, id) => s + (price[id] || 0), 0);
  bank += earned - cost;
  console.log('  ' + st.padEnd(11) + ('bounties $' + earned).padEnd(15) +
    ('gear $' + cost + ' (' + (BUYS[st] || []).join(', ') + ')').padEnd(56) +
    (bank >= 0 ? 'left $' + bank : 'SHORT $' + (-bank)));
});
console.log('  Scrap sales and the q13 credit are on top; the bounties are tight on purpose.');

console.log();
console.log(problems ? problems + ' problem(s) - not written' : 'no problems');
if (!WRITE) { console.log('(report only - pass --write)'); process.exit(problems ? 1 : 0); }
if (problems) process.exit(1);

/* ── AND IT WILL NOT UNDO WHAT CAME AFTER IT ────────────────────────────
   This wrote content/quests.json once. Everything since has been edited in
   the file itself, and this script knows none of it - so --write is not a
   rebuild, it is a restore to the day it was written. The README says so;
   this makes the file say so, out loud, before it is too late to hear. */
(function () {
  let live = null;
  try {
    live = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/quests.json'), 'utf8'));
  } catch (e) { return; }                    // nothing there yet: authoring is the point
  const mine = new Set(Q.map((q) => q.id));
  const theirs = (live.quests || []).map((q) => q.id);
  const lost = theirs.filter((id) => !mine.has(id));
  const cues = Object.keys(live.walt || {}).filter((c) => !(c in W));
  const pools = Object.keys(live.waltPools || {}).length;
  if (!lost.length && !cues.length && !pools) return;   // still the file it wrote

  console.log();
  console.log('REFUSING TO WRITE. content/quests.json has been edited since this');
  console.log('script authored it, and this script has no idea about any of it:');
  if (lost.length) console.log('  jobs it would delete   : ' + lost.join(', '));
  if (cues.length) console.log('  lines it would delete  : ' + cues.length +
                               ' of Walt\'s cues, including ' + cues.slice(0, 4).join(', '));
  if (pools) console.log('  and the ' + pools + ' pools of counter lines');
  console.log();
  console.log('Edit content/quests.json (or editor.html) instead, then run');
  console.log('python tools/build_content.py. Run this without --write for the report.');
  process.exit(1);
})();

const doc = {
  _README: {
    what: 'The thirty-five quests of Whispering Lake: a kid, five dollars, Walt, and the truth about Old Whisper.',
    voices: "Walt's lines are in `lines`, keyed by cue id, and recorded to audio/ by tools/record.js. The player's line in `player` is spoken by the system voice for accessibility. `nudge` is what Walt says when you come back without the job done.",
    mechanics: 'Fish are tagged and released - a fish quest counts tags, never keeps. `stage` is the vessel whose water the quest is in, and the water gates the quest. `needs` are the quests that must be finished first.',
    workflow: 'Edit in editor.html, then run tools/build_content.py.',
  },
  quests: Q.map((q, i) => ({
    id: q.id, n: i + 1, stage: q.stage, kind: q.kind, title: q.title, card: q.card,
    needs: q.needs, need: q.need, at: q.at, reward: q.reward,
    unlocks: q.unlocks, shopHint: q.shopHint, action: q.action,
    player: q.player,
    say: { brief: q.brief.map((c) => W[c]).join(' '), nudge: NUDGE[q.id],
           done: q.done.map((c) => W[c]).join(' ') },
    lines: { brief: q.brief, done: q.done },
  })),
  walt: W,
  nudges: NUDGE,
};
fs.writeFileSync(path.join(ROOT, 'content/quests.json'), JSON.stringify(doc, null, 1));
lakeDoc.places = places;
fs.writeFileSync(path.join(ROOT, 'content/lake.json'), JSON.stringify(lakeDoc, null, 1));
console.log('content/quests.json written; ' + places.length + ' places on the chart');
