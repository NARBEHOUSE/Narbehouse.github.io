/**
 * GENERATED - do not edit.
 *
 * Everything in content/, in one file: the lake's chart, the roster of
 * fish and gear, and the quests. Rebuild with:
 *
 *     python tools/build_content.py
 *
 * The bundle is deliberately the SAME SHAPE as the files it came from.
 * An earlier version rearranged the map on the way through, and the game -
 * which read the shape the file had - built a lake in the wrong place and
 * drew a chart of somewhere else.
 */
window.RT = window.RT || {};
RT.content = {
 "lake": {
  "_README": {
   "what": "Whispering Lake. One body of water; progress is how far out and how deep you can get.",
   "workflow": "Drag the shoreline, the island, the soundings, the ledges and the places in editor.html. The bed is not authored - it is interpolated from the soundings and stepped at the ledges - so one chart edit moves the world, the map and the editor together.",
   "units": "Distances in world units (the hull is 9.4 long, so a unit is about half a metre). Depths in feet, because that is how the tiers and the dialogue talk about them.",
   "axes": "-Z is north, matching the engine. The dock is the origin.",
   "ledges": "A ledge is where the bottom STEPS. Soundings alone cannot say that: blending 16 ft and 32 ft gives a slope, and a slope is not a drop-off. `nearFt` is the side the dock is on."
  },
  "name": "Whispering Lake",
  "dock": {
   "x": 0,
   "z": 0
  },
  "shore": [
   [
    60,
    70
   ],
   [
    430,
    40
   ],
   [
    790,
    -70
   ],
   [
    1020,
    -310
   ],
   [
    1130,
    -570
   ],
   [
    1040,
    -830
   ],
   [
    330,
    -1010
   ],
   [
    470,
    -1190
   ],
   [
    1090,
    -1290
   ],
   [
    1260,
    -1610
   ],
   [
    1220,
    -1990
   ],
   [
    980,
    -2330
   ],
   [
    560,
    -2530
   ],
   [
    60,
    -2590
   ],
   [
    -430,
    -2490
   ],
   [
    -810,
    -2270
   ],
   [
    -1010,
    -1950
   ],
   [
    -990,
    -1610
   ],
   [
    -770,
    -1310
   ],
   [
    -250,
    -1130
   ],
   [
    -430,
    -970
   ],
   [
    -1090,
    -890
   ],
   [
    -1490,
    -710
   ],
   [
    -1530,
    -390
   ],
   [
    -1260,
    -150
   ],
   [
    -790,
    -30
   ],
   [
    -300,
    50
   ]
  ],
  "island": [
   [
    140,
    -1930
   ],
   [
    360,
    -2000
   ],
   [
    430,
    -2160
   ],
   [
    300,
    -2300
   ],
   [
    60,
    -2310
   ],
   [
    -110,
    -2180
   ],
   [
    -80,
    -1990
   ]
  ],
  "soundings": [
   {
    "x": 0,
    "z": -25,
    "ft": 2
   },
   {
    "x": 0,
    "z": -80,
    "ft": 5
   },
   {
    "x": 0,
    "z": -150,
    "ft": 8
   },
   {
    "x": 300,
    "z": -110,
    "ft": 7
   },
   {
    "x": -260,
    "z": -95,
    "ft": 5
   },
   {
    "x": 640,
    "z": -230,
    "ft": 15
   },
   {
    "x": -680,
    "z": -280,
    "ft": 15
   },
   {
    "x": -1060,
    "z": -480,
    "ft": 22
   },
   {
    "x": -1230,
    "z": -700,
    "ft": 18
   },
   {
    "x": -820,
    "z": -640,
    "ft": 25
   },
   {
    "x": -430,
    "z": -480,
    "ft": 18
   },
   {
    "x": -700,
    "z": -860,
    "ft": 28
   },
   {
    "x": 130,
    "z": -400,
    "ft": 18
   },
   {
    "x": 520,
    "z": -520,
    "ft": 25
   },
   {
    "x": 860,
    "z": -640,
    "ft": 28
   },
   {
    "x": -120,
    "z": -700,
    "ft": 28
   },
   {
    "x": 450,
    "z": -840,
    "ft": 32
   },
   {
    "x": 755,
    "z": -775,
    "ft": 35
   },
   {
    "x": 40,
    "z": -1230,
    "ft": 72
   },
   {
    "x": -180,
    "z": -1350,
    "ft": 68
   },
   {
    "x": 620,
    "z": -1330,
    "ft": 80
   },
   {
    "x": 470,
    "z": -1520,
    "ft": 75
   },
   {
    "x": 830,
    "z": -1375,
    "ft": 70
   },
   {
    "x": 790,
    "z": -1620,
    "ft": 72
   },
   {
    "x": 120,
    "z": -1560,
    "ft": 80
   },
   {
    "x": -330,
    "z": -1620,
    "ft": 70
   },
   {
    "x": -600,
    "z": -1860,
    "ft": 118
   },
   {
    "x": 0,
    "z": -1800,
    "ft": 78
   },
   {
    "x": 640,
    "z": -1960,
    "ft": 124
   },
   {
    "x": 830,
    "z": -2250,
    "ft": 105
   },
   {
    "x": 320,
    "z": -2430,
    "ft": 52
   },
   {
    "x": -320,
    "z": -2260,
    "ft": 95
   },
   {
    "x": 220,
    "z": -1880,
    "ft": 25
   },
   {
    "x": 490,
    "z": -2100,
    "ft": 22
   },
   {
    "x": 80,
    "z": -2370,
    "ft": 32
   }
  ],
  "ledges": [
   {
    "id": "dropoff",
    "name": "The Drop-Off",
    "note": "Across the narrows. Thirty-five feet on the town side, seventy-five on the far one, over about seventy units. The bottom drops like a cliff past the buoys - the reason a kayak is worth buying, and where the pike patrol.",
    "line": [
     [
      -250,
      -1080
     ],
     [
      -40,
      -1055
     ],
     [
      180,
      -1040
     ],
     [
      330,
      -1030
     ]
    ],
    "nearFt": 35,
    "farFt": 75,
    "width": 70,
    "reach": 320
   },
   {
    "id": "islandshelf",
    "name": "The Island Shelf",
    "note": "The bottom comes up hard on the south side of Foggy Island - twelve feet of gravel with the best part of fifty either side of it. The shallowest water in the lake sits in the middle of the deepest, which is the sort of thing people build stories about.",
    "line": [
     [
      -60,
      -1900
     ],
     [
      190,
      -1855
     ],
     [
      430,
      -1900
     ],
     [
      520,
      -2050
     ]
    ],
    "nearFt": 118,
    "farFt": 22,
    "width": 60,
    "reach": 220
   }
  ],
  "stages": [
   {
    "id": "foot",
    "name": "The Shoreline",
    "vessel": null,
    "reach": 95,
    "speed": 0,
    "depthFt": [
     0,
     10
    ],
    "water": "the dock and the shoreline"
   },
   {
    "id": "canoe",
    "name": "The Shallow Bay",
    "vessel": "canoe",
    "reach": 780,
    "speed": 8.5,
    "depthFt": [
     10,
     35
    ],
    "water": "the shallow bay and the weedbeds"
   },
   {
    "id": "kayak",
    "name": "The Deep Drop-Off",
    "vessel": "kayak",
    "reach": 1650,
    "speed": 12.5,
    "depthFt": [
     35,
     75
    ],
    "water": "the drop-off and the deep hole"
   },
   {
    "id": "motorboat",
    "name": "The Abyssal Trench",
    "vessel": "motorboat",
    "reach": 3200,
    "speed": 22,
    "depthFt": [
     75,
     999
    ],
    "water": "the centre fog and the trench"
   }
  ],
  "extent": {
   "minX": -1499,
   "maxX": 1235,
   "minZ": -2565,
   "maxZ": 62
  },
  "places": [
   {
    "id": "q04.place",
    "quest": "q04",
    "kind": "net",
    "label": "the reed beds",
    "x": 1,
    "z": -65,
    "depthFt": 5,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q08.place",
    "quest": "q08",
    "kind": "salvage",
    "label": "the shallow scrap markers",
    "x": 101,
    "z": -315,
    "depthFt": 17,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q09.place",
    "quest": "q09",
    "kind": "clue",
    "label": "the west weed beds",
    "x": -374,
    "z": -340,
    "depthFt": 17,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q11.place",
    "quest": "q11",
    "kind": "clue",
    "label": "the shallow drop-off",
    "x": 251,
    "z": -690,
    "depthFt": 28,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q18.place",
    "quest": "q18",
    "kind": "clue",
    "label": "the drop-off ledges",
    "x": 176,
    "z": -1040,
    "depthFt": 55,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q21.place",
    "quest": "q21",
    "kind": "clue",
    "label": "the submerged log jam",
    "x": -74,
    "z": -1090,
    "depthFt": 67,
    "breakdown": false,
    "note": "The submerged log jam. `feature` is what is actually HERE - the lake builds the timber at these coordinates whether or not the job that mentions it is the one you are on.",
    "feature": "logjam"
   },
   {
    "id": "q22.place",
    "quest": "q22",
    "kind": "clue",
    "label": "the seventy-five-foot edge",
    "x": -249,
    "z": -1140,
    "depthFt": 73,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q26.place",
    "quest": "q26",
    "kind": "incident",
    "label": "the centre fog",
    "x": 676,
    "z": -1940,
    "depthFt": 124,
    "breakdown": true,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q27.place",
    "quest": "q27",
    "kind": "clue",
    "label": "the edge of the fog",
    "x": 76,
    "z": -1190,
    "depthFt": 74,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q34.place",
    "quest": "q34",
    "kind": "story",
    "label": "the abyssal trench",
    "x": 676,
    "z": -1940,
    "depthFt": 124,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   },
   {
    "id": "q35.place",
    "quest": "q35",
    "kind": "finale",
    "label": "the abyssal trench",
    "x": 676,
    "z": -1940,
    "depthFt": 124,
    "breakdown": false,
    "note": "Found by tools/gen_quests.js. Drag it in the editor."
   }
  ]
 },
 "roster": {
  "_README": {
   "what": "Everything Whispering Lake is stocked with, for the Junior Warden game: the fish you tag and release, the artifacts on the bottom that become the Acoustic Sonar, and the gear ladder that gets you out to them.",
   "workflow": "Edited in editor.html, or by hand. tools/build_content.py bundles this into js/content.generated.js so the game loads one file.",
   "tagging": "Fish are never kept. You reel one in, clip a field tag on its fin, log it and let it go. The logbook is what Walt is paying for - the job is the wage, not the fish. Quest 1 is the one exception to the hook: the minnows and shiners are netted, and they go in the survey tank.",
   "depths": "Every fish has a depth band in FEET and the chart says how deep it is anywhere, so where a fish lives is a fact about the lake. The four zones are the shoreline (0-10), the shallow bay (10-35), the deep drop-off (35-75) and the abyssal trench (75-120+). A rod has a depth rating, and a line cast into deeper water than its rating is too short to reach the fish.",
   "gear": "A net nets and a rod hooks. `netOnly` fish cannot be caught on a hook and `needsHook` fish cannot be netted. A magnet turns the rod into a salvage tool; nothing on the bottom comes up without one. A rod has two numbers: castFt is how far it throws and rangeFt is how deep it fishes. Both are in feet, and the world is built at 0.61 units to the foot, so the game throws exactly the distance printed on the rod.",
   "money": "Jobs are the wage. The one exception is the growth study: Walt pays a couple of dollars a tag for the three common fish he is tracking (studyBounty), which is what fills a tank or patches a hull. It is deliberately small - it can be earned off the dock on foot, so an empty tank and an empty tin is a morning's fishing rather than a dead end, and it will never buy a motorboat.",
   "art": "Each fish carries headFacing - which way it is painted, left or right. The game hangs a landed fish from the hook in its jaw, so it has to turn the picture a quarter turn the right way round; guessing put the head-left ones upside down.",
   "depth": "depthFt is where a fish can be hooked, and it is set by the lake's summer layers rather than by what the quest ladder would find convenient. Whispering Lake stratifies: warm to about twenty-five feet, a thermocline through the thirties and forties, and cold water below that. Warmwater fish - bass, bluegill, crappie, catfish - stay above it. Coldwater fish - cisco, lake trout - live below it and cannot come up in summer. Pike, perch and walleye work the band in between. Changing a range here changes which vessel can reach that fish, so run tools/playtest.js after.",
   "litter": "Junk is what the lake gives you instead of a fish, and there are six of them so it is not the same snag every time. Anything with a value is LITTER - Walt pays a dollar or three at the counter for taking it out of the water, which is a small good deed rather than a living. The weeds are worth nothing because weeds are not litter. None of it counts as scrap: that is iron off the bottom, on a magnet.",
   "tags": "studyBounty is what Walt pays for a TAG - the fish measured, logged and put back. Every fish has one: a dollar for the shoreline minnows, five for a lake trout, and a great deal for the one nobody has landed. It is deliberately small money against the jobs, which are the wage: a trip's tags fill a tank or patch a hull. What it is never is nothing, because 'he will take that tag for $0' is the game thanking a player for their morning with a shrug."
  },
  "fish": [
   {
    "id": "minnow",
    "name": "Minnow",
    "note": "Silver and wriggling in the shoreline shallows. Scooped by the netful for Walt's survey tank - three to eight a dip.",
    "depthFt": [
     0,
     8
    ],
    "tier": 1,
    "netOnly": true,
    "needsHook": false,
    "lengthIn": [
     1.5,
     3.5
    ],
    "weightLb": [
     0.02,
     0.1
    ],
    "perLb": 0,
    "colour": "#c9d4c0",
    "headFacing": "left",
    "studyBounty": 2
   },
   {
    "id": "golden_shiner",
    "name": "Golden Shiner",
    "note": "Shoals of them in the weedy shallows along the shore, brassy gold on the flank. The commonest bait minnow there is, and what Walt wants in the survey tank - three to five inches of them, a netful at a time.",
    "depthFt": [
     0,
     8
    ],
    "tier": 1,
    "netOnly": true,
    "needsHook": false,
    "lengthIn": [
     2.5,
     5
    ],
    "weightLb": [
     0.03,
     0.12
    ],
    "perLb": 0,
    "colour": "#d9b451",
    "headFacing": "left",
    "studyBounty": 2
   },
   {
    "id": "sunfish",
    "name": "Sunfish",
    "note": "Beds in the shallows in spring; through the summer the big ones sit on the deep weed edge in twelve or fifteen feet. Bluegill, pumpkinseed, redear - Walt logs them all as sunfish, and pays a couple of dollars a tag for the growth record.",
    "depthFt": [
     1,
     18
    ],
    "tier": 1,
    "needsHook": true,
    "lengthIn": [
     4,
     9
    ],
    "weightLb": [
     0.2,
     1.1
    ],
    "perLb": 0,
    "colour": "#f4bf3a",
    "headFacing": "right",
    "studyBounty": 2
   },
   {
    "id": "perch",
    "name": "Yellow Perch",
    "note": "The deepest of the panfish - schools working the flats and the top of the break, down to thirty feet in the heat. Walt is tracking their growth year on year, and pays a couple of dollars a tag for the record.",
    "depthFt": [
     4,
     32
    ],
    "tier": 2,
    "needsHook": true,
    "lengthIn": [
     5,
     12
    ],
    "weightLb": [
     0.2,
     1.6
    ],
    "perLb": 0,
    "colour": "#e0a83c",
    "headFacing": "right",
    "studyBounty": 4
   },
   {
    "id": "bass",
    "name": "Largemouth Bass",
    "note": "Cover fish: lily pads, sunk timber, the shade under the boards. Four to twenty feet, and out to twenty-four on deep structure when it turns hot.",
    "depthFt": [
     4,
     24
    ],
    "tier": 3,
    "needsHook": true,
    "lengthIn": [
     9,
     23
    ],
    "weightLb": [
     0.9,
     7.5
    ],
    "perLb": 0,
    "colour": "#4f9c3f",
    "headFacing": "right",
    "studyBounty": 6
   },
   {
    "id": "crappie",
    "name": "Black Crappie",
    "note": "Brush in eight or ten feet early on, then suspended out over twenty and thirty as the water warms. Walt is tracking their growth year on year, and pays a couple of dollars a tag for the record.",
    "depthFt": [
     8,
     30
    ],
    "tier": 2,
    "needsHook": true,
    "lengthIn": [
     7,
     15
    ],
    "weightLb": [
     0.4,
     2.8
    ],
    "perLb": 0,
    "colour": "#7f97b3",
    "headFacing": "right",
    "studyBounty": 4
   },
   {
    "id": "catfish",
    "name": "Channel Catfish",
    "note": "Bottom fish, and a warmwater one - it holds above the cold layer and will not drop into it. Twelve to forty-five feet by day, right down onto the thermocline, and up into the shallows after dark.",
    "depthFt": [
     12,
     45
    ],
    "tier": 4,
    "needsHook": true,
    "lengthIn": [
     13,
     34
    ],
    "weightLb": [
     1.5,
     22
    ],
    "perLb": 0,
    "colour": "#7d7166",
    "headFacing": "right",
    "studyBounty": 8
   },
   {
    "id": "pike",
    "name": "Northern Pike",
    "note": "Lies in the weed and along the edge where it stops. Six to twenty feet for most of them; the big ones follow the break down onto the thermocline at forty-five in high summer, which is as deep as a pike will go.",
    "depthFt": [
     6,
     45
    ],
    "tier": 4,
    "needsHook": true,
    "lengthIn": [
     16,
     40
    ],
    "weightLb": [
     1.8,
     14
    ],
    "perLb": 0,
    "colour": "#5c7a4a",
    "headFacing": "right",
    "studyBounty": 8
   },
   {
    "id": "walleye",
    "name": "Walleye",
    "note": "The breakline fish - fifteen to thirty-five feet, out to forty-five in clear water. Those eyes are built for low light, which is why they feed at dusk and go quiet under a bright sky.",
    "depthFt": [
     12,
     45
    ],
    "tier": 3,
    "needsHook": true,
    "lengthIn": [
     12,
     30
    ],
    "weightLb": [
     0.8,
     11
    ],
    "perLb": 0,
    "colour": "#a08a3c",
    "headFacing": "right",
    "studyBounty": 6
   },
   {
    "id": "cisco",
    "name": "Cisco",
    "note": "Lake herring: a small silver schooling fish of the cold layer, forty-five feet and down, where the water holds at fifty degrees all summer. Half of what a lake trout eats out here is cisco.",
    "depthFt": [
     42,
     95
    ],
    "tier": 2,
    "needsHook": true,
    "lengthIn": [
     8,
     15
    ],
    "weightLb": [
     0.3,
     1.6
    ],
    "perLb": 0,
    "colour": "#a9c0cf",
    "headFacing": "left",
    "studyBounty": 4
   },
   {
    "id": "laketrout",
    "name": "Lake Trout",
    "note": "Cold water below the thermocline - fifty feet and deeper, and the big ones at ninety and a hundred off the fog boundary. They cannot come up in summer; the top of this lake would cook them.",
    "depthFt": [
     50,
     125
    ],
    "tier": 5,
    "needsHook": true,
    "lengthIn": [
     18,
     38
    ],
    "weightLb": [
     3,
     26
    ],
    "perLb": 0,
    "colour": "#6f8c9c",
    "headFacing": "left",
    "studyBounty": 10
   },
   {
    "id": "barnaby",
    "name": "Barnaby",
    "note": "THE FINALE. Old Whisper - a thirty-year-old giant Lake Sturgeon, silver-scaled, trained by the 1994 Lake Warden. Not a monster: he has been guarding the sunken sanctuary and pulling propellers off noisy boats. He rises to the sonar's chime, not to a hook.",
    "depthFt": [
     110,
     130
    ],
    "tier": 6,
    "secret": true,
    "needsHook": false,
    "lengthIn": [
     72,
     96
    ],
    "weightLb": [
     120,
     200
    ],
    "perLb": 0,
    "colour": "#a9b7c6",
    "headFacing": "right",
    "studyBounty": 80
   },
   {
    "id": "ghost_perch",
    "name": "Ghost Perch",
    "note": "An albino yellow perch - no stripes, no gold, pink through the gill plate. One in a hundred thousand hatches like this and none of them lives long in clear water. This one is full grown.",
    "depthFt": [
     2,
     10
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "earthworm",
     "biomeId": "shoreline",
     "chance": 0.005
    },
    "lengthIn": [
     7,
     13
    ],
    "weightLb": [
     0.3,
     1.4
    ],
    "perLb": 0,
    "colour": "#e8e4d8",
    "headFacing": "right",
    "studyBounty": 25
   },
   {
    "id": "chrome_dace",
    "name": "Chrome Dace",
    "note": "A dace the length of your hand with scales like new nickel, chasing a spoon in a foot of water. Nobody has ever put one in a book.",
    "depthFt": [
     0,
     9
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "spoon",
     "biomeId": "shoreline",
     "chance": 0.005
    },
    "lengthIn": [
     4,
     7
    ],
    "weightLb": [
     0.05,
     0.2
    ],
    "perLb": 0,
    "colour": "#dfe6ea",
    "headFacing": "left",
    "studyBounty": 25
   },
   {
    "id": "bowfin",
    "name": "Bowfin",
    "note": "A living fossil with a lung: an olive log of a fish that has been in fresh water since before there were lakes to be in. It can breathe air, and it will bite the boat.",
    "depthFt": [
     8,
     30
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "shiner_bait",
     "biomeId": "bay",
     "chance": 0.005
    },
    "lengthIn": [
     20,
     34
    ],
    "weightLb": [
     3,
     12
    ],
    "perLb": 0,
    "colour": "#4d5a3a",
    "headFacing": "left",
    "studyBounty": 25
   },
   {
    "id": "white_catfish",
    "name": "White Catfish",
    "note": "Pale as a peeled stick, blue-white in the barbels. A southern fish that has no business this far north, sat in the mud of the bay as if it grew there.",
    "depthFt": [
     12,
     34
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "stinkbait",
     "biomeId": "bay",
     "chance": 0.005
    },
    "lengthIn": [
     14,
     22
    ],
    "weightLb": [
     1.2,
     6
    ],
    "perLb": 0,
    "colour": "#cfd3cf",
    "headFacing": "right",
    "studyBounty": 25
   },
   {
    "id": "tiger_muskie",
    "name": "Tiger Muskellunge",
    "note": "A muskellunge crossed with a northern pike - barred down the flank like its name, sterile, and never stocked in this water. Something put it here.",
    "depthFt": [
     10,
     34
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "spoon",
     "biomeId": "bay",
     "chance": 0.005
    },
    "lengthIn": [
     34,
     48
    ],
    "weightLb": [
     9,
     26
    ],
    "perLb": 0,
    "colour": "#a3873f",
    "headFacing": "right",
    "studyBounty": 25
   },
   {
    "id": "burbot",
    "name": "Burbot",
    "note": "The only freshwater cod there is: mottled, eel-tailed, cold-water, and awake at night when nothing else is. Fishermen call it the lawyer. Nobody is sure why.",
    "depthFt": [
     38,
     74
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "earthworm",
     "biomeId": "dropoff",
     "chance": 0.005
    },
    "lengthIn": [
     18,
     30
    ],
    "weightLb": [
     2,
     9
    ],
    "perLb": 0,
    "colour": "#6a6247",
    "headFacing": "right",
    "studyBounty": 25
   },
   {
    "id": "sterlet",
    "name": "Sterlet",
    "note": "A young sturgeon. Bony plates down the back, a snout like a trowel, and the same slow patient eye as something a great deal bigger further out. Barnaby has not been alone down there.",
    "depthFt": [
     40,
     75
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "deep_rig",
     "biomeId": "dropoff",
     "chance": 0.005
    },
    "lengthIn": [
     22,
     36
    ],
    "weightLb": [
     3,
     11
    ],
    "perLb": 0,
    "colour": "#9aa7b4",
    "headFacing": "left",
    "studyBounty": 25
   },
   {
    "id": "american_eel",
    "name": "American Eel",
    "note": "Born in the Sargasso Sea and swum here, up rivers and over wet grass, to sit in the ledges for twenty years. Every eel in this lake was a long way away once.",
    "depthFt": [
     36,
     75
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "stinkbait",
     "biomeId": "dropoff",
     "chance": 0.005
    },
    "lengthIn": [
     26,
     44
    ],
    "weightLb": [
     1.5,
     7
    ],
    "perLb": 0,
    "colour": "#43483a",
    "headFacing": "right",
    "studyBounty": 25
   },
   {
    "id": "blue_pike",
    "name": "Blue Pike",
    "note": "Declared extinct in 1983. A blue-backed walleye of the deep cold water with an eye the size of a dime, and there has not been a confirmed one in forty years. This is a confirmed one.",
    "depthFt": [
     78,
     125
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "deep_rig",
     "biomeId": "trench",
     "chance": 0.005
    },
    "lengthIn": [
     15,
     22
    ],
    "weightLb": [
     1.4,
     4.5
    ],
    "perLb": 0,
    "colour": "#6f93b8",
    "headFacing": "right",
    "studyBounty": 25
   },
   {
    "id": "deepwater_cisco",
    "name": "Deepwater Cisco",
    "note": "Gone from every lake anybody thought to look in. It lives below eighty feet and nowhere else, which is exactly the water that has been shut behind a log jam and a fog bank for thirty years.",
    "depthFt": [
     80,
     130
    ],
    "tier": 4,
    "secret": true,
    "needsHook": true,
    "mystery": {
     "baitId": "shiner_bait",
     "biomeId": "trench",
     "chance": 0.005
    },
    "lengthIn": [
     12,
     18
    ],
    "weightLb": [
     0.6,
     2.2
    ],
    "perLb": 0,
    "colour": "#b9c8d4",
    "headFacing": "left",
    "studyBounty": 25
   }
  ],
  "items": [
   {
    "id": "floating_litter",
    "name": "Floating Litter",
    "kind": "junk",
    "value": 0,
    "netOnly": true,
    "note": "Cans, wrappers, a bag. Netted off the surface near the reed beds, because the baby fish need somewhere clean to grow. The job pays; the litter does not.",
    "mass": true,
    "weight": 14
   },
   {
    "id": "tincan",
    "name": "Rusty Can",
    "kind": "junk",
    "value": 2,
    "note": "Empty, and has been for years. Taking it out of the water is worth a dollar to Walt and rather more than that to the fry that would otherwise swim into it.",
    "weight": 18
   },
   {
    "id": "weeds",
    "name": "Tangle of Weeds",
    "kind": "junk",
    "value": 0,
    "note": "Half the weed bed, wound round your hook. Not litter, not worth anything - just what happens when you fish an edge.",
    "weight": 34
   },
   {
    "id": "boot",
    "name": "Old Boot",
    "kind": "junk",
    "value": 2,
    "note": "The left one. Nobody has ever found the right. Out of the lake it goes.",
    "weight": 15
   },
   {
    "id": "wallet",
    "name": "Soggy Wallet",
    "kind": "junk",
    "value": 4,
    "note": "No cash, just receipts, and the card in it expired a long time ago. Walt bins it and pays you for the trouble.",
    "weight": 2.5
   },
   {
    "id": "phone",
    "name": "Cracked Cell Phone",
    "kind": "junk",
    "value": 4,
    "note": "Somebody leaned out too far. It has been in the lake longer than it was ever in a pocket, and it is full of things that should not be.",
    "weight": 4
   },
   {
    "id": "tire",
    "name": "Waterlogged Tire",
    "kind": "junk",
    "value": 6,
    "note": "Heavy, filthy and full of lake. A tyre in the shallows leaches into the water for fifty years, so this is the most useful thing you will land all day.",
    "weight": 12
   },
   {
    "id": "scrap_metal",
    "name": "Scrap Metal",
    "kind": "scrap",
    "value": 6,
    "note": "Fifty years of dropped iron and lost gear. Walt has no use for it by the pound - but when a job calls for scrap, this is the scrap.",
    "mass": true,
    "art": [
     "scrap_metal",
     "scrap_wire",
     "scrap_sheet",
     "scrap_tube"
    ],
    "weight": 30
   },
   {
    "id": "lost_anchor",
    "name": "Lost Anchor",
    "kind": "scrap",
    "value": 9,
    "note": "A mushroom anchor somebody cut loose rather than haul up. Heavy, honest iron, and it counts as scrap when a job wants some.",
    "weight": 8
   },
   {
    "id": "ring",
    "name": "Gold Ring",
    "kind": "valuable",
    "value": 30,
    "note": "A plain gold band, no inscription anybody can read any more. Somebody somewhere has a story about losing this, and it is not a happy one.",
    "weight": 0.8
   },
   {
    "id": "watch",
    "name": "Stopped Wristwatch",
    "kind": "valuable",
    "value": 14,
    "note": "Stopped at twenty past four, some year or other. Walt says the case is worth something to somebody even if the works are finished.",
    "weight": 1.2
   },
   {
    "id": "snapped_propeller",
    "name": "Snapped Propeller",
    "kind": "story",
    "value": 0,
    "note": "CLUE 1. Bronze, off Big Mac's 2008 speedboat. Not bitten - a hardened tree root jammed straight into the drive pin."
   },
   {
    "id": "brass_frame",
    "name": "Waterlogged Brass Frame",
    "kind": "story",
    "value": 0,
    "note": "CLUE 2. Solid brass under the mud, with mounting brackets. Walt sets it in a tray of oil on the workbench."
   },
   {
    "id": "gear_assembly",
    "name": "Gear Assembly",
    "kind": "story",
    "value": 0,
    "note": "CLUE 3. The teeth match the brass frame exactly. Walt mounts them inside it."
   },
   {
    "id": "sound_comb",
    "name": "Sound Comb",
    "kind": "story",
    "value": 0,
    "note": "CLUE 4. Music-box tines, thick and heavy, tuned far too low for human ears - built to carry through deep water."
   },
   {
    "id": "warden_lockbox",
    "name": "1994 Warden's Lockbox",
    "kind": "story",
    "value": 0,
    "note": "The iron lockbox with the 1994 Lake Warden seal. Inside: the Warden's journal, the sonar blueprint, and the name Barnaby."
   },
   {
    "id": "winding_key",
    "name": "Winding Key",
    "kind": "story",
    "value": 0,
    "note": "The last piece. Right where the motorboat stalled at the edge of the fog."
   },
   {
    "id": "warden_bell",
    "name": "The Warden's Bell",
    "kind": "story",
    "value": 0,
    "granted": true,
    "note": "Tarnished brass. Barnaby carries it up from the sanctuary and passes it over the gunwale. Not on the bottom - handed to you."
   },
   {
    "id": "silver_locket",
    "name": "Silver Locket",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "shoreline",
     "chance": 0.005
    },
    "note": "Oval, tarnished black, and it still opens. There is a photograph inside and the water never got to it."
   },
   {
    "id": "brass_harmonica",
    "name": "Brass Harmonica",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "shoreline",
     "chance": 0.005
    },
    "note": "A ten-hole harp, green with the lake, every reed rusted flat. Somebody sat on this dock and played it."
   },
   {
    "id": "gold_bracelet",
    "name": "Gold Bracelet",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "bay",
     "chance": 0.005
    },
    "note": "Fine chain, a broken clasp, and not a mark of corrosion on it - gold does not care how long it sits in a lake."
   },
   {
    "id": "railroad_watch",
    "name": "Railroad Pocket Watch",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "bay",
     "chance": 0.005
    },
    "note": "A railwayman's watch, seventeen jewels, the case screwed shut against the weather. The hands stopped at twenty past four."
   },
   {
    "id": "skeleton_key",
    "name": "Skeleton Key",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "bay",
     "chance": 0.005
    },
    "note": "Iron, hand-cut, longer than your finger. Whatever it opened has not existed for a very long time."
   },
   {
    "id": "brass_compass",
    "name": "Brass Boat Compass",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "dropoff",
     "chance": 0.005
    },
    "note": "Binnacle-mounted, gimbals seized, the card still floating in its oil. It points north. It has been pointing north down there the whole time."
   },
   {
    "id": "steel_cash_box",
    "name": "Steel Cash Box",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "dropoff",
     "chance": 0.005
    },
    "note": "A shop strongbox with the lid sprung and the lake inside it. Empty, and it was thrown in that way."
   },
   {
    "id": "dog_tags",
    "name": "Dog Tags",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "dropoff",
     "chance": 0.005
    },
    "note": "Two stamped tags on a ball chain. The name is still readable, and Walt goes very quiet and says he knows who to give them to."
   },
   {
    "id": "ships_lantern",
    "name": "Ship's Lantern",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "trench",
     "chance": 0.005
    },
    "note": "A brass oil lantern off a working boat, glass unbroken, wick still in it. Nothing on this lake has carried one of these in sixty years."
   },
   {
    "id": "service_revolver",
    "name": "Rusted Revolver",
    "kind": "relic",
    "value": 0,
    "unique": true,
    "relic": {
     "biomeId": "trench",
     "chance": 0.005
    },
    "note": "Seized solid with rust, cylinder full of lake mud, and Walt does not touch it twice - it goes straight in a bag for the sheriff, and he writes down where it came up."
   }
  ],
  "vessels": [
   {
    "id": "foot",
    "name": "On foot",
    "price": 0,
    "owned": true,
    "reach": 95,
    "speed": 0,
    "note": "Standing on the boards. Where everyone starts, with five dollars and a mesh net."
   },
   {
    "id": "canoe",
    "name": "Red Rental Canoe",
    "price": 20,
    "rental": true,
    "reach": 780,
    "speed": 8.5,
    "wearRate": 0,
    "maxDepthFt": 35,
    "note": "Walt's rental. Twenty dollars puts the deposit down and the oars in your hands; it is not yours, so there is nothing to repair. Opens the shallow bay and the weedbeds. It does not like the drop-off."
   },
   {
    "id": "kayak",
    "name": "Yellow Kayak",
    "price": 250,
    "durability": true,
    "reach": 1650,
    "speed": 12.5,
    "wearRate": 1.0,
    "maxDepthFt": 75,
    "note": "Yours, permanently, with a hull to look after. Sleek and fast, and takes you past the thirty-five-foot drop-off. Submerged logs scuff her; Walt patches her for cash or scrap."
   },
   {
    "id": "motorboat",
    "name": "Motorboat",
    "price": 1000,
    "durability": true,
    "burnsFuel": true,
    "reach": 3200,
    "speed": 22,
    "wearRate": 1.2,
    "maxDepthFt": 999,
    "note": "A wheel and a throttle. The only thing that reaches the centre fog."
   }
  ],
  "rods": [
   {
    "id": "hand_net",
    "name": "Mesh Hand Net",
    "price": 0,
    "owned": false,
    "tier": 1,
    "isNet": true,
    "canHook": false,
    "rangeFt": 4,
    "note": "Walt's, handed over the counter on the first morning and never asked for back. Scoops minnows, shiners and litter off the shoreline.",
    "castFt": 8,
    "rodClass": 1
   },
   {
    "id": "bamboo_rod",
    "name": "Bamboo Rod",
    "price": 20,
    "tier": 1,
    "canHook": true,
    "rangeFt": 12,
    "note": "Bought with the first twenty-five dollars, with a tub of earthworms. Thirty feet, which is the dock edge and the pilings. Fishes twelve feet down.",
    "bundlesBait": "earthworm",
    "castFt": 30,
    "rodClass": 2
   },
   {
    "id": "fiber_rod",
    "name": "Fiber Rod",
    "price": 45,
    "tier": 3,
    "canHook": true,
    "rangeFt": 35,
    "note": "Enough backbone for a bass, and sinks a line to the bottom of the shallow bay. Sixty feet - out past the lily pads, or across a weedbed from the canoe. Fishes to thirty-five.",
    "castFt": 60,
    "rodClass": 4
   },
   {
    "id": "carbon_rod",
    "name": "Carbon Rod",
    "price": 75,
    "tier": 4,
    "canHook": true,
    "rangeFt": 75,
    "note": "Holds a pike off the ledge and a catfish out of fifty feet of mud. Ninety feet, which reaches over the drop-off from the last water a kayak may sit in. Fishes to seventy-five.",
    "castFt": 90,
    "rodClass": 5
   },
   {
    "id": "pro_rod",
    "name": "Pro Rod",
    "price": 200,
    "tier": 6,
    "canHook": true,
    "rangeFt": 130,
    "note": "Walt hands it over before the deep survey. A hundred and thirty feet, from the edge of the fog into the deep hole. Fishes to a hundred and thirty down.",
    "castFt": 130,
    "rodClass": 6
   }
  ],
  "baits": [
   {
    "id": "earthworm",
    "name": "Earthworms",
    "price": 0,
    "free": true,
    "note": "A tub with the bamboo rod, and free forever after. Panfish.",
    "float": true
   },
   {
    "id": "shiner_bait",
    "name": "Live Shiners",
    "price": 3,
    "bias": {
     "bass": 40,
     "pike": 25,
     "cisco": 45
    },
    "note": "Out of the bait tank you filled yourself. A live shiner is what a bass or a pike would rather have than anything on a hook - and down in the cold layer it is the only thing a cisco is looking for.",
    "float": true
   },
   {
    "id": "spoon",
    "name": "Silver Spoon",
    "price": 8,
    "bias": {
     "pike": 45,
     "laketrout": 20
    },
    "note": "For anything that hunts by movement. Worked along the ledge. Fished without a float - the line runs straight to it.",
    "float": false
   },
   {
    "id": "stinkbait",
    "name": "Stink Bait",
    "price": 6,
    "bias": {
     "catfish": 55
    },
    "note": "Exactly as advertised. For the bottom mud. Fished without a float - the line runs straight to it.",
    "float": false
   },
   {
    "id": "deep_rig",
    "name": "Deep Rig",
    "price": 15,
    "bias": {
     "laketrout": 50
    },
    "note": "Gets a bait down past the thermocline and keeps it there. Fished without a float - the line runs straight to it.",
    "float": false
   }
  ],
  "tools": [
   {
    "id": "tagging_tool",
    "name": "Warden Tagging Tool",
    "price": 0,
    "owned": true,
    "kind": "tag",
    "note": "On the rod from the start. Clips a numbered field tag to the fin so the fish can go straight back."
   },
   {
    "id": "magnet_1",
    "name": "Magnet Lure #1",
    "price": 30,
    "kind": "magnet",
    "power": 1,
    "note": "Attaches to the line. Drops over the shallow scrap markers in the bay and brings up iron - and, once, a propeller."
   },
   {
    "id": "magnet_2",
    "name": "Magnet #2",
    "price": 50,
    "kind": "magnet",
    "power": 2,
    "note": "Stronger, and works down the drop-off. What the gear assembly and the sound comb come up on."
   },
   {
    "id": "heavy_magnet",
    "name": "Heavy Magnet",
    "price": 100,
    "kind": "magnet",
    "power": 3,
    "note": "Lifts from the trench. Needed for the final checks before the sanctuary."
   },
   {
    "id": "acoustic_sonar",
    "name": "Acoustic Sonar",
    "price": 0,
    "kind": "sonar",
    "crafted": true,
    "note": "Not bought - BUILT, piece by piece on Walt's workbench from the brass frame, the gears, the sound comb, the winding key and three scrap pieces. Sends warm low chimes into the water instead of motor noise. Barnaby knows the tune."
   }
  ]
 },
 "quests": {
  "_README": {
   "what": "The thirty-five quests of Whispering Lake: a kid, five dollars, Walt, and the truth about Old Whisper.",
   "voices": "Walt's lines are in `lines`, keyed by cue id, and recorded to audio/ by tools/record.js. The player's line in `player` is spoken by the system voice for accessibility. `nudge` is what Walt says when you come back without the job done.",
   "mechanics": "Fish are tagged and released - a fish quest counts tags, never keeps. `stage` is the vessel whose water the quest is in, and the water gates the quest. `needs` are the quests that must be finished first.",
   "workflow": "Edit in editor.html, then run tools/build_content.py."
  },
  "quests": [
   {
    "id": "q01",
    "n": 1,
    "stage": "foot",
    "kind": "net",
    "title": "The First Dollar",
    "card": "Scoop 30 minnows and shiners for Walt's survey tank",
    "needs": [],
    "need": {
     "type": "catchCount",
     "amount": 30,
     "netOnly": true
    },
    "reward": {
     "money": 30
    },
    "player": "I want to become a real fisherman!",
    "say": {
     "brief": "Well, hey there, kid! Welcome to Whispering Lake Research and Tackle. Don't see many new faces down at the dock this early in the morning. Truth be told, I don't see many faces at all any more. Folks still buy their line and their hooks off me - I'm cheaper than town - but they don't fish here. Look out there. Not one boat on the water. Not any more. They'll tell you the lake's cursed. Something big out in the middle that takes the propeller clean off a boat. I stopped arguing about it years ago. So this is a research station now: I study what's in the water, and I write up what I find. And what I'd give to know what's down in the middle, where it drops past a hundred feet. Nobody's been out there and come back with anything but a story. Five bucks, huh? Everybody starts somewhere. What I need is a pair of young hands - we catch them, tag them, log them and put every one straight back. Nothing gets kept on my dock. Start me here: my survey tank's empty and I need to know what's growing along the shore this year. Take this hand net, scoop me up thirty minnows and shiners - a netful at a time - and I'll pay you twenty-five dollars cash. Deal? Hold on, one more thing before you go. Here's a map of the lake - take it, you're gonna need it. Whole thing's on there: the shoreline, the bay, the drop-off, and the deep water out in the middle. It won't tell you where the fish are. Nothing will. But it'll stop you getting turned around out there, and on this lake that matters.",
     "nudge": "No rush, kid. Thirty little fish - the shoreline's full of 'em. Dip the net where the water's knee-deep.",
     "done": "Look at all those minnows! Fantastic work, kid - that's my survey tank stocked for the season. Here's your twenty-five dollars cash, fair and square."
    },
    "lines": {
     "brief": [
      "q01a",
      "q01a2",
      "q01b",
      "q01b2",
      "q01c",
      "q01d"
     ],
     "done": [
      "q02a"
     ]
    },
    "gives": {
     "rodId": "hand_net",
     "map": true
    },
    "replies": [
     "I want to become a real fisherman!",
     "What's out there?",
     "Have you ever studied what's out in the middle?",
     "I'd go out there and look for you... but all I've got is five dollars and no boat.",
     "Deal.",
     "Thanks, Walt."
    ]
   },
   {
    "id": "q02",
    "n": 2,
    "stage": "foot",
    "kind": "tag",
    "title": "Panfish Tagging",
    "card": "Catch, tag and release 3 Sunfish off the dock edge",
    "needs": [
     "q01"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "sunfish",
     "amount": 3
    },
    "reward": {
     "money": 25
    },
    "shopHint": [
     "bamboo_rod"
    ],
    "player": "What should I buy first?",
    "say": {
     "brief": "You can use that money right now to buy this bamboo rod and a container of earthworms. Now, see these sunfish hanging around the dock? We don't keep 'em to eat - we tag 'em! Catch three sunfish, clip a field tag on their fin, and let 'em go. Bring me the tag data when you're done.",
     "nudge": "Three sunfish, tagged and let go. They're right under the boards.",
     "done": "Tag data uploaded! Excellent work. You've got a real gentle touch with those fish, kid."
    },
    "lines": {
     "brief": [
      "q02b"
     ],
     "done": [
      "q03a"
     ]
    },
    "sells": [
     "bamboo_rod"
    ]
   },
   {
    "id": "q03",
    "n": 3,
    "stage": "foot",
    "kind": "tag",
    "title": "Perch Patrol",
    "card": "Catch, tag and release 3 Yellow Perch from the dock pilings",
    "needs": [
     "q02"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "perch",
     "amount": 3
    },
    "reward": {
     "money": 25
    },
    "player": "What fish are we logging next?",
    "say": {
     "brief": "Next up: yellow perch! They love hiding right next to the wooden dock pilings. Catch and tag three of 'em so we can track how fast they're growing this summer.",
     "nudge": "Perch hug those pilings. Three tags, and bring me the data.",
     "done": "Logbook updated! Perfect. Hey, while you're standing out on the dock, look down near the reed beds. Someone left a bunch of floating trash!"
    },
    "lines": {
     "brief": [
      "q03b"
     ],
     "done": [
      "q04a"
     ]
    }
   },
   {
    "id": "q04",
    "n": 4,
    "stage": "foot",
    "kind": "net",
    "title": "Shoreline Clean-up",
    "card": "Net 5 pieces of floating litter near the reeds",
    "needs": [
     "q03"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "floating_litter",
     "amount": 5
    },
    "reward": {
     "money": 15
    },
    "player": "I can clean that up right now.",
    "say": {
     "brief": "Grab your hand net and scoop out five pieces of litter. We keep this water clean so the baby fish have a safe place to grow.",
     "nudge": "That litter's still floating by the reeds. Five pieces, kid.",
     "done": "Thanks for clearing out that trash. The lake looks better already, and I put twelve bucks in your hand for the trouble."
    },
    "lines": {
     "brief": [
      "q04b"
     ],
     "done": [
      "q05a"
     ]
    }
   },
   {
    "id": "q05",
    "n": 5,
    "stage": "foot",
    "kind": "tag",
    "title": "The Canoe Fund",
    "card": "Tag and release 5 mixed panfish off the dock edge",
    "needs": [
     "q04"
    ],
    "need": {
     "type": "catchCount",
     "amount": 5
    },
    "reward": {
     "money": 45
    },
    "unlocks": [
     "canoe"
    ],
    "player": "How do I get out onto the lake?",
    "say": {
     "brief": "You're moving fast, Junior Warden! Tag five more mixed panfish off the dock edge. Once you upload that data, you'll have enough cash to put a deposit down on my rental canoe and get off this dock!",
     "nudge": "Five more panfish and that canoe deposit is yours.",
     "done": "Five panfish tagged and logged - and that's your deposit money, kid. Twenty dollars puts the oars in your hands and that red canoe at the end of the slip is yours for the day. Say the word and she's yours."
    },
    "lines": {
     "brief": [
      "q05b"
     ],
     "done": [
      "q06a"
     ]
    },
    "sells": [
     "canoe"
    ]
   },
   {
    "id": "q06",
    "n": 6,
    "stage": "canoe",
    "kind": "tag",
    "title": "Weed Bed Bass",
    "card": "Tag and release 2 Largemouth Bass under the lily pads",
    "needs": [
     "q05"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "bass",
     "amount": 2,
     "minDepthFt": 12
    },
    "reward": {
     "money": 55
    },
    "player": "Where is the best fishing spot in the bay?",
    "say": {
     "brief": "Head out into Shallow Bay, near the lily pads in fifteen feet of water. Largemouth bass love ambush hunting under those big green leaves. Tag two of 'em and bring back the log!",
     "nudge": "The bass are under the lily pads in fifteen feet. Two tags.",
     "done": "Two largemouth bass, healthy and tagged! Outstanding."
    },
    "lines": {
     "brief": [
      "q06b"
     ],
     "done": [
      "q07a"
     ]
    },
    "sells": [
     "fiber_rod",
     "shiner_bait"
    ]
   },
   {
    "id": "q07",
    "n": 7,
    "stage": "canoe",
    "kind": "tag",
    "title": "Crappie Craze",
    "card": "Tag and release 4 Black Crappies along the outer weed edge",
    "needs": [
     "q06"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "crappie",
     "amount": 4
    },
    "reward": {
     "money": 50
    },
    "player": "Where are the crappies hiding?",
    "say": {
     "brief": "Black crappies travel in schools near the outer weed edges in twenty feet of water. Paddle out steady, drop your line right along the weedline, and tag four of 'em for the sanctuary database.",
     "nudge": "Crappies run the outer weedline in twenty feet. Four of 'em.",
     "done": "Before you paddle back out, take this - Magnet Lure Number One! It attaches right to your line."
    },
    "lines": {
     "brief": [
      "q07b"
     ],
     "done": [
      "q08a"
     ]
    }
   },
   {
    "id": "q08",
    "n": 8,
    "stage": "canoe",
    "kind": "salvage",
    "title": "The First Magnet Drop",
    "card": "Haul up 3 pieces of scrap metal with Magnet Lure #1",
    "needs": [
     "q07"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "scrap_metal",
     "amount": 3
    },
    "reward": {
     "money": 50
    },
    "player": "How does magnet fishing work?",
    "say": {
     "brief": "Drop it over the shallow scrap markers out in the bay. People have been dropping iron and lost gear in this lake for fifty years. Pull me up three pieces of scrap metal, and I'll clean those scuffs off your canoe for free!",
     "nudge": "Drop that magnet over the scrap markers. Three pieces gets your canoe cleaned.",
     "done": "Three good pieces of iron, and every one of them worth having. Bring the canoe round and those scuffs come off her, on me, like I said. Nice work with that magnet, kid."
    },
    "lines": {
     "brief": [
      "q08b"
     ],
     "done": [
      "q08_done"
     ]
    },
    "sells": [
     "magnet_1"
    ]
   },
   {
    "id": "q09",
    "n": 9,
    "stage": "canoe",
    "kind": "clue",
    "title": "Mystery Clue #1: Something in the Weeds",
    "card": "Magnet-fish near the west weeds and see what comes up",
    "needs": [
     "q08"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "snapped_propeller",
     "amount": 1
    },
    "reward": {
     "money": 0
    },
    "player": "I found it near the west weed beds!",
    "say": {
     "brief": "Big Mac lost something out by the west weed beds back in 2008 - swore blind a lake monster bit his boat, and he has never shut up about it since. Take the magnet out there and drag the bottom. I would dearly love to know what actually happened to that motor.",
     "nudge": "Whatever's out by the west weeds, the magnet'll find it.",
     "done": "Whoa! Hold on a second... where did you pull this up?! Look at those blade marks! This bronze propeller belonged to Big Mac's speedboat back in 2008. He used to tear through those shallow weeds like he owned the place, scaring off all the spawning bass. Big Mac swore a lake monster bit his boat! But look closely - Old Whisper didn't bite it. He jammed a thick, hardened tree root straight into the drive pin! Stopped his motor dead and taught Mac a lesson. Keep your eyes open out there, kid... I put that prop in the scrap bin - we can reuse that brass! Now, back to business."
    },
    "lines": {
     "brief": [
      "q09_send"
     ],
     "done": [
      "q09a",
      "q09b",
      "q09c",
      "q10a"
     ]
    }
   },
   {
    "id": "q10",
    "n": 10,
    "stage": "canoe",
    "kind": "tag",
    "title": "Big Bass Challenge",
    "card": "Tag and release a Largemouth Bass over 5 lbs from the deep pads",
    "needs": [
     "q09"
    ],
    "need": {
     "type": "catchWeightOne",
     "speciesId": "bass",
     "amount": 5,
     "minDepthFt": 14
    },
    "reward": {
     "money": 60
    },
    "player": "Are the big ones down in the deeper pads?",
    "say": {
     "brief": "There's a giant five-pound largemouth bass lurking in the deepest lily pads on the west side. Set your hook clean, tag her up, and let her go!",
     "nudge": "She's a five-pounder, in the deep pads - fourteen feet and down. Take your time.",
     "done": "Five pounds if she's an ounce, tagged and swimming. That's a proper bass, kid."
    },
    "lines": {
     "brief": [
      "q10b"
     ],
     "done": [
      "q10_done"
     ]
    }
   },
   {
    "id": "q11",
    "n": 11,
    "stage": "canoe",
    "kind": "clue",
    "title": "Mystery Clue #2: Something in the Mud",
    "card": "Magnet-fish the shallow drop-off — something's caught in the mud",
    "needs": [
     "q10"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "brass_frame",
     "amount": 1
    },
    "reward": {
     "money": 0
    },
    "player": "It was buried under thirty feet of mud.",
    "say": {
     "brief": "There's a shallow drop-off where the mud goes soft, and every so often somebody's magnet comes back heavier than it went down. Work that edge for me. Something metal is sitting in that mud, and I don't think it fell there on its own.",
     "nudge": "Something's in the mud at the shallow drop-off. Keep dragging that magnet.",
     "done": "What in the world... let me see that! It's caked in lake mud, but under the grime... that's solid brass. It looks like a frame for some old mechanical device. See these mounting brackets? I'm setting this right here on the corner of my workbench in a tray of oil to soak off the rust. Whatever this was... it didn't sink by accident. The sun's getting low over the trees, kid. Perfect timing for catfish!"
    },
    "lines": {
     "brief": [
      "q11_send"
     ],
     "done": [
      "q11a",
      "q11b",
      "q11c",
      "q12a"
     ]
    }
   },
   {
    "id": "q12",
    "n": 12,
    "stage": "canoe",
    "kind": "tag",
    "title": "Night Night Catfish",
    "card": "Tag and release 2 Channel Catfish along the muddy banks",
    "needs": [
     "q11"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "catfish",
     "amount": 2
    },
    "reward": {
     "money": 55
    },
    "player": "Where do catfish go when it gets dark?",
    "say": {
     "brief": "Channel catfish feed along the muddy shallow banks right around dusk. Get two of 'em tagged and logged before you head into the dock for the night.",
     "nudge": "Catfish come up the muddy banks at dusk. Two tags before dark.",
     "done": "Logbook updated! Nice catfish."
    },
    "lines": {
     "brief": [
      "q12b"
     ],
     "done": [
      "q13a"
     ]
    },
    "sells": [
     "stinkbait"
    ]
   },
   {
    "id": "q13",
    "n": 13,
    "stage": "canoe",
    "kind": "trade",
    "title": "Shallow Scrap Drive",
    "card": "Trade 5 pieces of scrap metal to Walt at the counter",
    "needs": [
     "q12"
    ],
    "need": {
     "type": "tradeScrap",
     "amount": 5
    },
    "at": "counter",
    "reward": {
     "money": 60
    },
    "player": "What can I do with all this scrap metal?",
    "say": {
     "brief": "Hey, if you've got five pieces of scrap metal in your inventory from magnet-fishing, trade 'em to me at the counter. I'll give you fifty dollars of shop credit toward your gear!",
     "nudge": "Five pieces of scrap at the counter, and it's fifty dollars of credit.",
     "done": "You're doing great, kid. You're almost there!"
    },
    "lines": {
     "brief": [
      "q13b"
     ],
     "done": [
      "q14a"
     ]
    }
   },
   {
    "id": "q14",
    "n": 14,
    "stage": "canoe",
    "kind": "tag",
    "title": "The Kayak Goal",
    "card": "Tag and release 6 shallow bay fish",
    "needs": [
     "q13"
    ],
    "need": {
     "type": "catchCount",
     "amount": 6
    },
    "reward": {
     "money": 175
    },
    "player": "How close am I to buying the Kayak?",
    "say": {
     "brief": "Tag and release six more shallow bay fish. Once you upload that logbook, you'll have enough cash to buy your very own yellow Kayak! No more paying daily canoe rentals.",
     "nudge": "Six more bay fish and that kayak's yours.",
     "done": "That is the money, kid - enough for the kayak. She is tied up at the end of the boards whenever you are ready for her."
    },
    "lines": {
     "brief": [
      "q14b"
     ],
     "done": [
      "q14_done"
     ]
    },
    "sells": [
     "kayak"
    ]
   },
   {
    "id": "q15",
    "n": 15,
    "stage": "canoe",
    "kind": "buy",
    "title": "Buying the Kayak",
    "card": "Buy the yellow Kayak ($250)",
    "needs": [
     "q14"
    ],
    "need": {
     "type": "ownVessel",
     "vesselId": "kayak"
    },
    "at": "counter",
    "reward": {
     "money": 0
    },
    "player": "How deep can I go in this Kayak?",
    "say": {
     "brief": "She's all yours! That yellow Kayak is sleek, fast, and can handle deeper water. She'll easily take you past the thirty-five-foot drop-off. Just keep an eye on her hull durability bar down at the bottom of your screen. Hitting submerged logs out there will scuff her up, but you can always bring her back to me for repairs!",
     "nudge": "The yellow kayak's two hundred and fifty. Come see me at the counter.",
     "done": "Welcome to the Deep Hole, kid! The bottom drops like a cliff right past those buoys, all the way down to seventy-five feet."
    },
    "lines": {
     "brief": [
      "q15a",
      "q15b"
     ],
     "done": [
      "q16a"
     ]
    },
    "replies": [
     "How deep can I go in this Kayak?",
     "Thanks, Walt."
    ]
   },
   {
    "id": "q16",
    "n": 16,
    "stage": "kayak",
    "kind": "tag",
    "title": "Deep Waters",
    "card": "Tag and release 2 Northern Pike off the drop-off",
    "needs": [
     "q15"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "pike",
     "amount": 2
    },
    "reward": {
     "money": 120
    },
    "player": "What fish patrol the deep cliff ledges?",
    "say": {
     "brief": "Northern pike hang on the weed edge and follow the break down - thirty-five to forty-five feet is as deep as they go, and that is the deepest water your kayak will sit over. Paddle out, work the edge, and tag two of them for me.",
     "nudge": "Pike patrol the rock ledges past the buoys. Two tags, kid.",
     "done": "Those northern pike put up a real fight, didn't they? Great tags."
    },
    "lines": {
     "brief": [
      "q16b"
     ],
     "done": [
      "q17a"
     ]
    },
    "sells": [
     "carbon_rod",
     "spoon"
    ]
   },
   {
    "id": "q17",
    "n": 17,
    "stage": "kayak",
    "kind": "tag",
    "title": "Catfish Depth",
    "card": "Tag and release 3 Channel Catfish off the bottom at 40 ft",
    "needs": [
     "q16"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "catfish",
     "amount": 3,
     "minDepthFt": 30
    },
    "reward": {
     "money": 105
    },
    "player": "Are there catfish down at fifty feet?",
    "say": {
     "brief": "Drop your line to the bottom in forty feet. Catfish are a warmwater fish - they hold on the mud above the cold layer and will not go down into it, whatever anybody tells you. Tag three of the big ones for me.",
     "nudge": "Straight down to the mud at fifty feet. Three big catfish.",
     "done": "Three catfish off the mud and all three logged. You're getting the hang of the deep water."
    },
    "lines": {
     "brief": [
      "q17b"
     ],
     "done": [
      "q17_done"
     ]
    }
   },
   {
    "id": "q17b",
    "n": 18,
    "stage": "kayak",
    "kind": "tag",
    "title": "Breakline Walleye",
    "card": "Tag two Walleye out on the breakline, 20 ft or deeper",
    "needs": [
     "q17"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "walleye",
     "amount": 2,
     "minDepthFt": 20
    },
    "reward": {
     "money": 55
    },
    "player": "Where do walleye sit?",
    "say": {
     "brief": "Now then. There is a fish out on that breakline I have got no numbers on at all - walleye. Eyes like a cat's, feeds when the light goes flat, and gone the second the sun comes out. Twenty feet down off the drop, kid. Two of them tagged and I will have something to write in the column that has been empty since ninety-four.",
     "nudge": "Two walleye, out on the breakline, twenty feet down.",
     "done": "Walleye. Both tagged, both back in. That column is not empty any more, and it is your handwriting in it."
    },
    "lines": {
     "brief": [
      "q17b_a",
      "q17b_b"
     ],
     "done": [
      "q17b_done"
     ]
    }
   },
   {
    "id": "q18",
    "n": 19,
    "stage": "kayak",
    "kind": "clue",
    "title": "Mystery Clue #3: More of the Same",
    "card": "Magnet-fish the drop-off — there's more where that came from",
    "needs": [
     "q17"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "gear_assembly",
     "amount": 1
    },
    "reward": {
     "money": 95
    },
    "player": "Do these gears belong to the brass frame?",
    "say": {
     "brief": "That brass frame has empty mountings in it, kid - whatever bolted into them is still down there. The drop-off is where the frame came from, so that's where the rest of it will be. Get the magnet down deep and drag it.",
     "nudge": "There's more of that brass down the drop-off. Keep the magnet down.",
     "done": "Aha! Look at this! These gear teeth match the brass frame you found earlier! Look - they interlock perfectly! Whoever built this knew exactly what they were doing. Let me mount these cogs right inside the frame..."
    },
    "lines": {
     "brief": [
      "q18_send"
     ],
     "done": [
      "q18a",
      "q18b"
     ]
    }
   },
   {
    "id": "q19",
    "n": 20,
    "stage": "kayak",
    "kind": "repair",
    "title": "Kayak Care",
    "card": "Repair the Kayak at the dock workshop",
    "needs": [
     "q18"
    ],
    "need": {
     "type": "repairVessel"
    },
    "at": "counter",
    "reward": {
     "money": 0
    },
    "player": "How do I patch up the hull?",
    "say": {
     "brief": "You've been putting some miles on that kayak, kid! See those scuffs on the bottom? Bring her up to the dock workshop. A little resin patch and some scrap metal will have her running smooth again. Give it a shot!",
     "nudge": "Bring the kayak up to the workshop and we'll patch her.",
     "done": "Looks good as new!"
    },
    "lines": {
     "brief": [
      "q19a",
      "q19b"
     ],
     "done": [
      "q20a"
     ]
    }
   },
   {
    "id": "q20",
    "n": 21,
    "stage": "kayak",
    "kind": "tag",
    "title": "Pike Hunter",
    "card": "Tag and release a Northern Pike over 10 lbs on the deep weed line",
    "needs": [
     "q19"
    ],
    "need": {
     "type": "catchWeightOne",
     "speciesId": "pike",
     "amount": 10
    },
    "reward": {
     "money": 130
    },
    "player": "Is there a trophy fish near the deep log jam?",
    "say": {
     "brief": "There is a ten-pounder working the outside weed line in forty feet of water - the old ones drop down the break as the day warms. Tag her and let her go, and mind your line.",
     "nudge": "Ten-pounder, at the log jam in sixty feet. Keep him out of the branches.",
     "done": "A ten-pound pike off the deep weed edge! Tagged, logged and back in. That's the biggest thing in this lake with teeth - well, the biggest one anybody's ever landed."
    },
    "lines": {
     "brief": [
      "q20b"
     ],
     "done": [
      "q20_done"
     ]
    }
   },
   {
    "id": "q21",
    "n": 22,
    "stage": "kayak",
    "kind": "clue",
    "title": "Mystery Clue #4: Something in the Log Jam",
    "card": "Magnet-fish the deep log jam and see what comes up",
    "needs": [
     "q20"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "sound_comb",
     "amount": 1
    },
    "reward": {
     "money": 80
    },
    "player": "Why are the tines so thick and heavy?",
    "say": {
     "brief": "There's a log jam out in the deep water, and things collect in a log jam. If the rest of this machine went in where the frame did, the current will have walked it out that way. Take the magnet to the deep jam and see what comes up.",
     "nudge": "Try the magnet at the deep log jam. Something's still down there.",
     "done": "Kid... would you look at these. Fine little metal tines, packed in tight — that's not scrap, that's a comb out of a music box. Pluck one and it hums way down low, lower than anything I'd tune for a tune. This wasn't built to play for people. Somebody built this to talk to something underwater."
    },
    "lines": {
     "brief": [
      "q21_send"
     ],
     "done": [
      "q21a",
      "q21b"
     ]
    }
   },
   {
    "id": "q22",
    "n": 23,
    "stage": "kayak",
    "kind": "clue",
    "title": "Mystery Clue #5: The Deep Edge",
    "card": "Haul something heavy up from the 75 ft edge",
    "needs": [
     "q21"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "warden_lockbox",
     "amount": 1
    },
    "reward": {
     "money": 80
    },
    "player": "What's down at seventy-five feet?",
    "say": {
     "brief": "Seventy-five feet, kid - the deep edge. The old Warden's station went down somewhere along there in the flood, and a station means records. That's heavy magnet work and a long haul up, but if there's anything left of ninety-four, that's where it is.",
     "nudge": "The seventy-five-foot edge, kid. Heavy magnet work.",
     "done": "Whoa — hold on, let me get a grip on that. That is heavy for a box that size. Would you look at that seal, stamped right into the lid. Lake Warden, nineteen ninety-four. This has been sitting down there since the flood took the station. There's a journal in here, kid. Water's got into it, but I can just make out the last page... 'The flood of ninety-four sank our underwater sanctuary station. My loyal sturgeon stayed behind to guard the baby fish. I call him...' ...and that's as far as I can get. Rest of the page is stuck together. Give me tonight to dry it out proper before it falls apart in my hands."
    },
    "lines": {
     "brief": [
      "q22_send"
     ],
     "done": [
      "q22a",
      "q22b",
      "q22c"
     ]
    }
   },
   {
    "id": "q22b",
    "n": 24,
    "stage": "kayak",
    "kind": "tag",
    "title": "Deep Trout Survey",
    "card": "Tag and release 2 Lake Trout in 70 ft of cold water while Walt works on the journal",
    "needs": [
     "q22"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "laketrout",
     "amount": 2
    },
    "reward": {
     "money": 145
    },
    "player": "Anything I can do while you work on that?",
    "say": {
     "brief": "While I work on that page, there's a survey I keep putting off. Lake trout - cold-water fish, down below the thermocline where it stays cold all summer, and they will not come up for anybody. Seventy feet, kid. Tag two of them for me and put them back, and I should have something to tell you in the morning.",
     "nudge": "Seventy feet, kid, down where it stays cold. Two lake trout - I'll be here with the journal.",
     "done": "Logbook updated! You're doing incredible work out there."
    },
    "lines": {
     "brief": [
      "q23_send"
     ],
     "done": [
      "q24a"
     ]
    },
    "sells": [
     "deep_rig"
    ]
   },
   {
    "id": "q23",
    "n": 25,
    "stage": "kayak",
    "kind": "story",
    "title": "The Dried Page",
    "card": "Hear what Walt got off the Warden's last page",
    "needs": [
     "q22b"
    ],
    "need": {
     "type": "reachSpot",
     "flag": "name_read",
     "amount": 1
    },
    "reward": {
     "money": 0
    },
    "player": "Barnaby? So he's got a name.",
    "say": {
     "brief": "Kid! Dried that page out overnight, careful as I could. Warden's own hand, plain as day: 'I call him Barnaby.' Barnaby. That's not what you name a monster. Thirty years we've all been calling him Old Whisper, blaming him for every snapped line and every bad night out there — and near as I can tell, he's just an old sturgeon doing exactly what he was told to do back in ninety-four. Guarding this place. Which means whatever is left of that station is still out in the middle of this lake, and the middle is the one part of it neither of us can reach. Not in a kayak.",
     "nudge": "Come and see me, kid. I got that page dried out.",
     "done": "Thirty years of stories, and it turns out he was only ever doing his job."
    },
    "lines": {
     "brief": [
      "q23a",
      "q23b",
      "q23c"
     ],
     "done": [
      "q23_done"
     ]
    },
    "at": "counter",
    "replies": [
     "Barnaby? So he's got a name.",
     "I'm listening.",
     "Then we need a boat."
    ]
   },
   {
    "id": "q24",
    "n": 26,
    "stage": "kayak",
    "kind": "tag",
    "title": "Motorboat Savings",
    "card": "Tag and release 8 deep-hole fish",
    "needs": [
     "q23"
    ],
    "need": {
     "type": "catchCount",
     "amount": 8,
     "minDepthFt": 35
    },
    "reward": {
     "money": 740
    },
    "player": "Am I ready for the Motorboat?",
    "say": {
     "brief": "Tag eight more deep-water fish. Upload that data, and you'll hit one thousand dollars - enough to buy my brand new motorboat!",
     "nudge": "Eight deep-water fish and that motorboat's yours.",
     "done": "A thousand dollars, kid. That is the motorboat paid for, whenever you want to sign for her."
    },
    "lines": {
     "brief": [
      "q24b"
     ],
     "done": [
      "q24_done"
     ]
    },
    "sells": [
     "motorboat"
    ]
   },
   {
    "id": "q25",
    "n": 27,
    "stage": "kayak",
    "kind": "buy",
    "title": "Buying the Motorboat",
    "card": "Buy the Motorboat ($1,000)",
    "needs": [
     "q24"
    ],
    "need": {
     "type": "ownVessel",
     "vesselId": "motorboat"
    },
    "at": "counter",
    "reward": {
     "money": 0
    },
    "player": "So I can take her anywhere now, right?",
    "say": {
     "brief": "She's all yours! A real motorboat with a steering wheel and a throttle. But listen to me very carefully, kid. Stay away from the center fog. The water out there drops into an abyssal trench over one hundred and twenty feet deep. No boat engine has survived out there in thirty years!",
     "nudge": "A thousand dollars, and she's yours. Come to the counter.",
     "done": "She is fuelled and tied off at the end of the boards. And kid - I meant every word about the middle of this lake."
    },
    "lines": {
     "brief": [
      "q25a",
      "q25b"
     ],
     "done": [
      "q25_done"
     ]
    },
    "replies": [
     "So I can take her anywhere now, right?",
     "Understood. Nowhere near the fog."
    ]
   },
   {
    "id": "q26",
    "n": 28,
    "stage": "motorboat",
    "kind": "incident",
    "title": "Walt's Warning Ignored",
    "card": "Drive the Motorboat into the 120 ft trench fog",
    "needs": [
     "q25"
    ],
    "need": {
     "type": "reachSpot",
     "flag": "stalled_in_fog",
     "amount": 1
    },
    "reward": {
     "money": 0,
     "debt": 180
    },
    "player": "...I'll be careful, Walt.",
    "say": {
     "brief": "I know that look, kid. You are going to go and see for yourself, aren't you. Everybody does. Go on then - but keep her slow, keep your eyes up, and if that engine so much as coughs out there, you sit tight and you get on the radio. I will come and get you.",
     "nudge": "Well - you'll find out what's in that fog soon enough.",
     "done": "I told you, kid! I warned ya! I'm glad you're not hurt, but look at that motorboat stern - the propeller drive pin is snapped clean off, and the engine is dead. I towed you back, but that repair tab is gonna cost ya. You didn't hit a rock out there... Barnaby stopped your boat!"
    },
    "lines": {
     "brief": [
      "q26_send"
     ],
     "done": [
      "q26a",
      "q26b"
     ]
    },
    "replies": [
     "...I'll be careful, Walt."
    ]
   },
   {
    "id": "q27",
    "n": 29,
    "stage": "kayak",
    "kind": "clue",
    "title": "Kayak Recon",
    "card": "Take the Kayak to the fog edge and magnet-fish where the motorboat stalled out",
    "needs": [
     "q26"
    ],
    "need": {
     "type": "recoverItem",
     "itemId": "winding_key",
     "amount": 1,
     "vesselId": "kayak"
    },
    "reward": {
     "money": 125
    },
    "player": "What am I magnet-fishing for out in the fog?",
    "say": {
     "brief": "Barnaby doesn't mind kayaks - no noisy motors! Take your kayak back out to the edge of the fog where your boat broke down. Magnet-fish right where you stalled out. There's gotta be one last piece of the puzzle down there!",
     "nudge": "Right where you stalled. The kayak won't bother him.",
     "done": "The winding key. Well I never - that is the last of them, kid. Bring it here and let me see the lot together."
    },
    "lines": {
     "brief": [
      "q27a",
      "q27b"
     ],
     "done": [
      "q27_done"
     ]
    }
   },
   {
    "id": "q28",
    "n": 30,
    "stage": "motorboat",
    "kind": "story",
    "title": "Piecing It Together",
    "card": "Bring the Lockbox blueprint to Walt",
    "needs": [
     "q27"
    ],
    "need": {
     "type": "reachSpot",
     "flag": "blueprint_shown",
     "amount": 1
    },
    "at": "counter",
    "reward": {
     "money": 0
    },
    "player": "What were all these brass parts for?",
    "say": {
     "brief": "You found the winding key! And look at this paper from the 1994 lockbox... it's a blueprint schematic! Kid! The brass frame, the gears, the sound comb, the winding key... we haven't been building a random music box on my counter... we've been building the old Warden's Acoustic Sonar!",
     "nudge": "Bring me that blueprint from the lockbox, kid.",
     "done": "A blueprint. Thirty years and the answer was in a box on the bottom of the lake. Right - I am going to need iron."
    },
    "lines": {
     "brief": [
      "q28a",
      "q28b"
     ],
     "done": [
      "q28_done"
     ]
    },
    "replies": [
     "What were all these brass parts for?",
     "He built it to talk to him. That is what it was always for."
    ]
   },
   {
    "id": "q29",
    "n": 31,
    "stage": "motorboat",
    "kind": "trade",
    "title": "Assembling the Sonar",
    "card": "Trade 3 heavy scrap pieces to complete the Acoustic Sonar",
    "needs": [
     "q28"
    ],
    "need": {
     "type": "tradeScrap",
     "amount": 3
    },
    "at": "counter",
    "reward": {
     "money": 0,
     "grantsToolId": "acoustic_sonar",
     "repair": true
    },
    "player": "Will this sonar keep Barnaby calm?",
    "say": {
     "brief": "Hand me those three heavy scrap metal pieces! I'm using the brass from Big Mac's old prop to forge the outer housing.",
     "nudge": "Three heavy pieces of scrap and I'll forge the housing.",
     "done": "Done! The Acoustic Sonar is mounted right to your motorboat stern. Instead of noisy motor vibrations, it sends out gentle, warm musical chimes that Barnaby recognizes!"
    },
    "lines": {
     "brief": [
      "q29a"
     ],
     "done": [
      "q29b"
     ]
    },
    "replies": [
     "Here you go - all three of them."
    ]
   },
   {
    "id": "q29b",
    "n": 32,
    "stage": "motorboat",
    "kind": "tag",
    "title": "The Cold Layer",
    "card": "Tag three Cisco down in the cold layer, 50 ft or deeper",
    "needs": [
     "q29"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "cisco",
     "amount": 3,
     "minDepthFt": 50
    },
    "reward": {
     "money": 90
    },
    "player": "Cisco? Where do they sit?",
    "say": {
     "brief": "One more thing before you go deep again. Every trout I have ever opened up out there had the same fish in it - cisco. Lake herring. Little silver things down in the cold layer. Fifty feet and below, on live shiners. Three of them tagged, kid, and then I will know what the trout are living on out there.",
     "nudge": "Three cisco, down in the cold layer. Fifty feet and below.",
     "done": "Three cisco. That is the bottom of the whole food chain out there, written down at last - and it explains the size of what is eating them."
    },
    "lines": {
     "brief": [
      "q29b_a",
      "q29b_b"
     ],
     "done": [
      "q29b_done"
     ]
    }
   },
   {
    "id": "q30",
    "n": 33,
    "stage": "motorboat",
    "kind": "tag",
    "title": "Deep Sanctuary Survey",
    "card": "Tag and release 3 Lake Trout at 90 ft near the fog boundary",
    "needs": [
     "q29"
    ],
    "need": {
     "type": "catchCount",
     "speciesId": "laketrout",
     "amount": 3,
     "minDepthFt": 80
    },
    "reward": {
     "money": 160
    },
    "player": "Heading out to ninety feet now!",
    "say": {
     "brief": "Take this Pro Rod. While I do the final electrical wiring checks on the sonar, take your motorboat to the fog boundary and tag three deep lake trout at ninety feet.",
     "nudge": "Three trout at ninety feet, on the Pro Rod.",
     "done": "Three lake trout off the bottom at ninety feet, all three tagged and back in the cold. Nobody has that data, kid. Nobody."
    },
    "lines": {
     "brief": [
      "q30a"
     ],
     "done": [
      "q30_done"
     ]
    },
    "gives": {
     "rodId": "pro_rod"
    }
   },
   {
    "id": "q31",
    "n": 34,
    "stage": "motorboat",
    "kind": "tag",
    "title": "Pro Rod Mastery",
    "card": "Tag and release a Lake Trout over 15 lbs down at 80 ft or deeper",
    "needs": [
     "q30"
    ],
    "need": {
     "type": "catchWeightOne",
     "speciesId": "laketrout",
     "amount": 15,
     "minDepthFt": 80
    },
    "reward": {
     "money": 200
    },
    "player": "A fifteen-pounder, down in the cold.",
    "say": {
     "brief": "One more piece of rod work and we are done with it. There is an old lake trout down in that trench that will go fifteen pounds - eighty feet and better, right down in the cold. That Pro Rod was built for exactly that fish. Tag her, put her straight back, and I will have the last of my numbers.",
     "nudge": "There's a fifteen-pounder down at a hundred feet. Let the rod do the work.",
     "done": "A fifteen-pound lake trout from a hundred feet down! Wow! That Pro Rod handled the line tension beautifully. You've become a master angler, kid. Truly. That is a proper day's data, kid. Now then - that repair tab of yours. Those tag bounties will square it."
    },
    "lines": {
     "brief": [
      "q31_send"
     ],
     "done": [
      "q31a",
      "q31b",
      "q31_done"
     ]
    },
    "replies": [
     "A fifteen-pounder, down in the cold. I will find her."
    ]
   },
   {
    "id": "q32",
    "n": 35,
    "stage": "motorboat",
    "kind": "debt",
    "title": "Cleared Tabs",
    "card": "Pay off every dollar of the repair tab",
    "needs": [
     "q31"
    ],
    "need": {
     "type": "clearDebt"
    },
    "at": "counter",
    "reward": {
     "money": 0,
     "repair": true
    },
    "player": "All tabs cleared! What's next?",
    "say": {
     "brief": "Every single dollar of your repair debt is paid off from your tag bounties! You're completely square with the shop, Junior Warden.",
     "nudge": "Square the tab and we're ready.",
     "done": "Not a dollar owing. You and me are square, kid - and I am glad it was you that pulled all this up."
    },
    "lines": {
     "brief": [
      "q32a"
     ],
     "done": [
      "q32_done"
     ]
    },
    "replies": [
     "Feels good, being square."
    ]
   },
   {
    "id": "q33",
    "n": 36,
    "stage": "motorboat",
    "kind": "buy",
    "title": "Final Checks",
    "card": "Equip the Heavy Magnet with the Pro Rod and the Acoustic Sonar",
    "needs": [
     "q32"
    ],
    "need": {
     "type": "ownTool",
     "toolId": "heavy_magnet"
    },
    "at": "counter",
    "reward": {
     "money": 0,
     "repair": true,
     "fuel": true
    },
    "player": "I'm ready to enter the Abyssal Trench.",
    "say": {
     "brief": "Heavy magnet equipped, Pro Rod ready, Acoustic Sonar online. Head out to the center fog in one hundred and twenty feet of water. Cut your engine, turn on the Acoustic Sonar, and let the music play into the water. Good luck, kid.",
     "nudge": "Heavy magnet, Pro Rod, sonar. Then the fog.",
     "done": "Everything checks out. Take her out, kid, and let us hear what he makes of it."
    },
    "lines": {
     "brief": [
      "q33a",
      "q33b"
     ],
     "done": [
      "q33_done"
     ]
    },
    "sells": [
     "heavy_magnet"
    ]
   },
   {
    "id": "q34",
    "n": 37,
    "stage": "motorboat",
    "kind": "story",
    "title": "The Chime on the Water",
    "card": "Motor into the 120 ft trench, cut the engine and play the sonar",
    "needs": [
     "q33"
    ],
    "need": {
     "type": "reachSpot",
     "flag": "sonar_played",
     "amount": 1
    },
    "reward": {
     "money": 0
    },
    "player": "I will call you when the sonar is down.",
    "say": {
     "brief": "Right then. That is everything, and it is all aboard. Out to the middle, kid, cut your engine, and let the sonar play down into it. I will have the radio on beside me the whole time - whatever happens out there, you are not out there on your own.",
     "nudge": "Cut the engine out there and let the sonar play.",
     "done": "You SAW him. After thirty years of stories, somebody finally saw him - and he came up to look at you. Sit down a minute, kid, before you tell me the rest."
    },
    "lines": {
     "brief": [
      "q34_send"
     ],
     "done": [
      "q34_done"
     ]
    },
    "replies": [
     "I will call you when the sonar is down."
    ]
   },
   {
    "id": "q35",
    "n": 38,
    "stage": "motorboat",
    "kind": "finale",
    "title": "Passing the Torch",
    "card": "Motor out to the trench and ring the Warden's bell where he can hear it",
    "needs": [
     "q34"
    ],
    "need": {
     "type": "ringBell",
     "amount": 1
    },
    "reward": {
     "money": 0,
     "grantsItemId": "warden_bell",
     "title": "Chief Junior Warden of Whispering Lake"
    },
    "action": "Take the Warden's Bell",
    "player": "What do I do when I find him?",
    "say": {
     "brief": "Then go back out there and meet him properly. Take the sonar, take your time, and whatever he does - let him do it. I will be right here on the radio.",
     "nudge": "Take the bell, kid. He's offering it to you.",
     "done": "He did it! Barnaby knows the lake is in good hands now! From this day on, the deep center is an official Wildlife Sanctuary, and you are officially the Chief Junior Warden of Whispering Lake! I'm so proud of you, kid!"
    },
    "lines": {
     "brief": [
      "q35_send"
     ],
     "done": [
      "q35c"
     ]
    }
   },
   {
    "id": "q36",
    "n": 39,
    "stage": "postgame",
    "kind": "collect",
    "title": "What The Jam Kept",
    "card": "Catch all ten fish that are in no book - any lure, anywhere",
    "needs": [
     "q35"
    ],
    "need": {
     "type": "collectSet",
     "set": "mystery",
     "amount": 10
    },
    "reward": {
     "money": 500
    },
    "player": "The fog's gone? I thought that jam would be there for ever.",
    "say": {
     "brief": "Sit down a minute, Chief Warden. Something has happened out there. That fog is off the water for the first time since I was your age, and Barnaby has pulled the whole log jam apart - shoved it clean off the channel like it was brush. Which means the lake is calm, kid. All of it. No fog, no timber, no hull getting chewed up just for being out in the deep - you can go anywhere on this water now and take your time about it. And I will tell you what I think is out there. Thirty years shut behind that jam, nothing fished, nothing counted - there could be a dozen fish in this lake that are not in any book I own. So go and find them. Every lure in that box, every corner of the water, and no map for it - I have not got one. Ten of them, kid. Catch all ten and report back to me.",
     "nudge": "Ten fish nobody has in a book. Every lure, every corner - and no, I cannot tell you where.",
     "done": "Ten. TEN fish, and not one of them in a book on my shelf - a perch with no colour in it, a pike crossed with something, and a blue pike that has been extinct since before you were born. This is not a logbook any more, kid. This is a paper."
    },
    "lines": {
     "brief": [
      "q36_a",
      "q36_b",
      "q36_c",
      "q36_d"
     ],
     "done": [
      "q36_done"
     ]
    }
   },
   {
    "id": "q37",
    "n": 40,
    "stage": "postgame",
    "kind": "collect",
    "title": "Everything Somebody Lost",
    "card": "Bring up all ten unique finds on the Heavy Magnet",
    "needs": [
     "q36"
    ],
    "need": {
     "type": "collectSet",
     "set": "relics",
     "amount": 10
    },
    "reward": {
     "money": 500,
     "title": "Warden of the Whole Lake"
    },
    "player": "Everything's still down there?",
    "say": {
     "brief": "One more thing, and it is the last I will ask of you. That bottom out there has been shut away since the sixties, and everything that ever went over the side of a boat is still lying on it. Heavy magnet, kid. That is the only thing that will lift what I am after. Ten unique things - not scrap, not tin cans. Things somebody lost and wanted back. They will be a long time coming. They are lying anywhere at all and there is one of each, so when you have got one that is the only one there is. Bring me all ten.",
     "nudge": "Heavy magnet, and ten unique things off the bottom. Take your time.",
     "done": "All ten. A locket with a face still in it, a watch stopped at twenty past four, and a set of tags I am going to drive round to a house tonight. You gave this lake its memory back, kid. Go on - go fishing. It is yours now."
    },
    "lines": {
     "brief": [
      "q37_a",
      "q37_b",
      "q37_c"
     ],
     "done": [
      "q37_done"
     ]
    }
   }
  ],
  "walt": {
   "q01a": "Well, hey there, kid! Welcome to Whispering Lake Research and Tackle. Don't see many new faces down at the dock this early in the morning.",
   "q01b": "They'll tell you the lake's cursed. Something big out in the middle that takes the propeller clean off a boat. I stopped arguing about it years ago. So this is a research station now: I study what's in the water, and I write up what I find.",
   "q01c": "Five bucks, huh? Everybody starts somewhere. What I need is a pair of young hands - we catch them, tag them, log them and put every one straight back. Nothing gets kept on my dock. Start me here: my survey tank's empty and I need to know what's growing along the shore this year. Take this hand net, scoop me up thirty minnows and shiners - a netful at a time - and I'll pay you twenty-five dollars cash. Deal?",
   "q01d": "Hold on, one more thing before you go. Here's a map of the lake - take it, you're gonna need it. Whole thing's on there: the shoreline, the bay, the drop-off, and the deep water out in the middle. It won't tell you where the fish are. Nothing will. But it'll stop you getting turned around out there, and on this lake that matters.",
   "q02a": "Look at all those minnows! Fantastic work, kid - that's my survey tank stocked for the season. Here's your twenty-five dollars cash, fair and square.",
   "q02b": "You can use that money right now to buy this bamboo rod and a container of earthworms. Now, see these sunfish hanging around the dock? We don't keep 'em to eat - we tag 'em! Catch three sunfish, clip a field tag on their fin, and let 'em go. Bring me the tag data when you're done.",
   "q03a": "Tag data uploaded! Excellent work. You've got a real gentle touch with those fish, kid.",
   "q03b": "Next up: yellow perch! They love hiding right next to the wooden dock pilings. Catch and tag three of 'em so we can track how fast they're growing this summer.",
   "q04a": "Logbook updated! Perfect. Hey, while you're standing out on the dock, look down near the reed beds. Someone left a bunch of floating trash!",
   "q04b": "Grab your hand net and scoop out five pieces of litter. We keep this water clean so the baby fish have a safe place to grow.",
   "q05a": "Thanks for clearing out that trash. The lake looks better already, and I put twelve bucks in your hand for the trouble.",
   "q05b": "You're moving fast, Junior Warden! Tag five more mixed panfish off the dock edge. Once you upload that data, you'll have enough cash to put a deposit down on my rental canoe and get off this dock!",
   "q06a": "Five panfish tagged and logged - and that's your deposit money, kid. Twenty dollars puts the oars in your hands and that red canoe at the end of the slip is yours for the day. Say the word and she's yours.",
   "q06b": "Head out into Shallow Bay, near the lily pads in fifteen feet of water. Largemouth bass love ambush hunting under those big green leaves. Tag two of 'em and bring back the log!",
   "q07a": "Two largemouth bass, healthy and tagged! Outstanding.",
   "q07b": "Black crappies travel in schools near the outer weed edges in twenty feet of water. Paddle out steady, drop your line right along the weedline, and tag four of 'em for the sanctuary database.",
   "q08a": "Before you paddle back out, take this - Magnet Lure Number One! It attaches right to your line.",
   "q08b": "Drop it over the shallow scrap markers out in the bay. People have been dropping iron and lost gear in this lake for fifty years. Pull me up three pieces of scrap metal, and I'll clean those scuffs off your canoe for free!",
   "q09a": "Whoa! Hold on a second... where did you pull this up?!",
   "q09b": "Look at those blade marks! This bronze propeller belonged to Big Mac's speedboat back in 2008. He used to tear through those shallow weeds like he owned the place, scaring off all the spawning bass.",
   "q09c": "Big Mac swore a lake monster bit his boat! But look closely - Old Whisper didn't bite it. He jammed a thick, hardened tree root straight into the drive pin! Stopped his motor dead and taught Mac a lesson. Keep your eyes open out there, kid...",
   "q10a": "I put that prop in the scrap bin - we can reuse that brass! Now, back to business.",
   "q10b": "There's a giant five-pound largemouth bass lurking in the deepest lily pads on the west side. Set your hook clean, tag her up, and let her go!",
   "q11a": "What in the world... let me see that!",
   "q11b": "It's caked in lake mud, but under the grime... that's solid brass. It looks like a frame for some old mechanical device. See these mounting brackets?",
   "q11c": "I'm setting this right here on the corner of my workbench in a tray of oil to soak off the rust. Whatever this was... it didn't sink by accident.",
   "q12a": "The sun's getting low over the trees, kid. Perfect timing for catfish!",
   "q12b": "Channel catfish feed along the muddy shallow banks right around dusk. Get two of 'em tagged and logged before you head into the dock for the night.",
   "q13a": "Logbook updated! Nice catfish.",
   "q13b": "Hey, if you've got five pieces of scrap metal in your inventory from magnet-fishing, trade 'em to me at the counter. I'll give you fifty dollars of shop credit toward your gear!",
   "q14a": "You're doing great, kid. You're almost there!",
   "q14b": "Tag and release six more shallow bay fish. Once you upload that logbook, you'll have enough cash to buy your very own yellow Kayak! No more paying daily canoe rentals.",
   "q15a": "She's all yours! That yellow Kayak is sleek, fast, and can handle deeper water.",
   "q15b": "She'll easily take you past the thirty-five-foot drop-off. Just keep an eye on her hull durability bar down at the bottom of your screen. Hitting submerged logs out there will scuff her up, but you can always bring her back to me for repairs!",
   "q16a": "Welcome to the Deep Hole, kid! The bottom drops like a cliff right past those buoys, all the way down to seventy-five feet.",
   "q16b": "Northern pike hang on the weed edge and follow the break down - thirty-five to forty-five feet is as deep as they go, and that is the deepest water your kayak will sit over. Paddle out, work the edge, and tag two of them for me.",
   "q17a": "Those northern pike put up a real fight, didn't they? Great tags.",
   "q17b": "Drop your line to the bottom in forty feet. Catfish are a warmwater fish - they hold on the mud above the cold layer and will not go down into it, whatever anybody tells you. Tag three of the big ones for me.",
   "q18a": "Aha! Look at this!",
   "q18b": "These gear teeth match the brass frame you found earlier! Look - they interlock perfectly! Whoever built this knew exactly what they were doing. Let me mount these cogs right inside the frame...",
   "q19a": "You've been putting some miles on that kayak, kid! See those scuffs on the bottom?",
   "q19b": "Bring her up to the dock workshop. A little resin patch and some scrap metal will have her running smooth again. Give it a shot!",
   "q20a": "Looks good as new!",
   "q20b": "There is a ten-pounder working the outside weed line in forty feet of water - the old ones drop down the break as the day warms. Tag her and let her go, and mind your line.",
   "q21a": "Kid... would you look at these. Fine little metal tines, packed in tight — that's not scrap, that's a comb out of a music box.",
   "q21b": "Pluck one and it hums way down low, lower than anything I'd tune for a tune. This wasn't built to play for people. Somebody built this to talk to something underwater.",
   "q22a": "Whoa — hold on, let me get a grip on that. That is heavy for a box that size.",
   "q22b": "Would you look at that seal, stamped right into the lid. Lake Warden, nineteen ninety-four. This has been sitting down there since the flood took the station.",
   "q22c": "There's a journal in here, kid. Water's got into it, but I can just make out the last page... 'The flood of ninety-four sank our underwater sanctuary station. My loyal sturgeon stayed behind to guard the baby fish. I call him...' ...and that's as far as I can get. Rest of the page is stuck together. Give me tonight to dry it out proper before it falls apart in my hands.",
   "q23a": "Kid! Dried that page out overnight, careful as I could. Warden's own hand, plain as day: 'I call him Barnaby.' Barnaby. That's not what you name a monster.",
   "q23b": "Thirty years we've all been calling him Old Whisper, blaming him for every snapped line and every bad night out there — and near as I can tell, he's just an old sturgeon doing exactly what he was told to do back in ninety-four. Guarding this place.",
   "q24a": "Logbook updated! You're doing incredible work out there.",
   "q24b": "Tag eight more deep-water fish. Upload that data, and you'll hit one thousand dollars - enough to buy my brand new motorboat!",
   "q25a": "She's all yours! A real motorboat with a steering wheel and a throttle.",
   "q25b": "But listen to me very carefully, kid. Stay away from the center fog. The water out there drops into an abyssal trench over one hundred and twenty feet deep. No boat engine has survived out there in thirty years!",
   "q26a": "I told you, kid! I warned ya!",
   "q26b": "I'm glad you're not hurt, but look at that motorboat stern - the propeller drive pin is snapped clean off, and the engine is dead. I towed you back, but that repair tab is gonna cost ya. You didn't hit a rock out there... Barnaby stopped your boat!",
   "q27a": "Barnaby doesn't mind kayaks - no noisy motors! Take your kayak back out to the edge of the fog where your boat broke down.",
   "q27b": "Magnet-fish right where you stalled out. There's gotta be one last piece of the puzzle down there!",
   "q28a": "You found the winding key! And look at this paper from the 1994 lockbox... it's a blueprint schematic!",
   "q28b": "Kid! The brass frame, the gears, the sound comb, the winding key... we haven't been building a random music box on my counter... we've been building the old Warden's Acoustic Sonar!",
   "q29a": "Hand me those three heavy scrap metal pieces! I'm using the brass from Big Mac's old prop to forge the outer housing.",
   "q29b": "Done! The Acoustic Sonar is mounted right to your motorboat stern. Instead of noisy motor vibrations, it sends out gentle, warm musical chimes that Barnaby recognizes!",
   "q30a": "Take this Pro Rod. While I do the final electrical wiring checks on the sonar, take your motorboat to the fog boundary and tag three deep lake trout at ninety feet.",
   "q31a": "A fifteen-pound lake trout from a hundred feet down! Wow! That Pro Rod handled the line tension beautifully.",
   "q31b": "You've become a master angler, kid. Truly.",
   "q32a": "Every single dollar of your repair debt is paid off from your tag bounties! You're completely square with the shop, Junior Warden.",
   "q33a": "Heavy magnet equipped, Pro Rod ready, Acoustic Sonar online.",
   "q33b": "Head out to the center fog in one hundred and twenty feet of water. Cut your engine, turn on the Acoustic Sonar, and let the music play into the water. Good luck, kid.",
   "q34a": "I hear the sonar chimes echoing through my shop radio, kid... low and warm. Keep steady out there.",
   "q34b": "Look at your sonar screen... a massive shadow is rising from a hundred feet down... it's him!",
   "q35c": "He did it! Barnaby knows the lake is in good hands now! From this day on, the deep center is an official Wildlife Sanctuary, and you are officially the Chief Junior Warden of Whispering Lake! I'm so proud of you, kid!",
   "q01a2": "Truth be told, I don't see many faces at all any more. Folks still buy their line and their hooks off me - I'm cheaper than town - but they don't fish here. Look out there. Not one boat on the water. Not any more.",
   "q01b2": "And what I'd give to know what's down in the middle, where it drops past a hundred feet. Nobody's been out there and come back with anything but a story.",
   "tackle_lost_1": "Bare line, huh? No hook, no float, nothing. Yeah. THIS is why people don't come here any more, kid - they lose a rig, then another, and they go fish somewhere sensible. Here. New hook, new float, on me. Get back out there.",
   "tackle_lost_again": "Again? Hm. Take another setup - no charge, I keep a drawer of them. Something strange about this water. One of these days I'd like to know what it is.",
   "q09_send": "Big Mac lost something out by the west weed beds back in 2008 - swore blind a lake monster bit his boat, and he has never shut up about it since. Take the magnet out there and drag the bottom. I would dearly love to know what actually happened to that motor.",
   "q11_send": "There's a shallow drop-off where the mud goes soft, and every so often somebody's magnet comes back heavier than it went down. Work that edge for me. Something metal is sitting in that mud, and I don't think it fell there on its own.",
   "q18_send": "That brass frame has empty mountings in it, kid - whatever bolted into them is still down there. The drop-off is where the frame came from, so that's where the rest of it will be. Get the magnet down deep and drag it.",
   "q21_send": "There's a log jam out in the deep water, and things collect in a log jam. If the rest of this machine went in where the frame did, the current will have walked it out that way. Take the magnet to the deep jam and see what comes up.",
   "q22_send": "Seventy-five feet, kid - the deep edge. The old Warden's station went down somewhere along there in the flood, and a station means records. That's heavy magnet work and a long haul up, but if there's anything left of ninety-four, that's where it is.",
   "q08_done": "Three good pieces of iron, and every one of them worth having. Bring the canoe round and those scuffs come off her, on me, like I said. Nice work with that magnet, kid.",
   "q10_done": "Five pounds if she's an ounce, tagged and swimming. That's a proper bass, kid.",
   "q17_done": "Three catfish off the mud and all three logged. You're getting the hang of the deep water.",
   "q20_done": "A ten-pound pike off the deep weed edge! Tagged, logged and back in. That's the biggest thing in this lake with teeth - well, the biggest one anybody's ever landed.",
   "walt_log_1": "In they go. Every one of them's in the book now, and every one of them's back in the water where I want it.",
   "walt_log_2": "Logged, the lot of them. That's how a survey gets done, kid - one fish at a time, week after week.",
   "walt_log_3": "Right. Names, lengths, weights, all of it down. You'd be amazed what a year of this tells you.",
   "walt_log_4": "That's the record updated. Nobody else on this lake is writing any of this down, you know.",
   "walt_log_5": "Good. The book's a little fatter than it was this morning.",
   "walt_logbig_1": "Now that one's worth the ink. I'll put a star beside it.",
   "walt_logbig_2": "Look at the size of that entry. Not many of those come across this counter, kid.",
   "walt_logbig_3": "Well now. That one's going in underlined.",
   "walt_logmany_1": "You have been busy! Hold on, let me turn the page.",
   "walt_logmany_2": "That's a proper day's work. My hand's going to ache writing this lot up.",
   "walt_logmany_3": "All of them? Good grief. Right - one at a time.",
   "walt_logone_1": "One's one, kid. The book doesn't care how fast you fill it.",
   "walt_logone_2": "In it goes. Small entries add up.",
   "walt_hold_1": "You've got a boat full there. Bring them here and I'll get them logged.",
   "walt_hold_2": "Something in the boat, I see. Let's have them in the book.",
   "walt_hold_3": "Ah, you've been out. Hand them over and I'll write them up.",
   "q23_send": "While I work on that page, there's a survey I keep putting off. Lake trout - cold-water fish, down below the thermocline where it stays cold all summer, and they will not come up for anybody. Seventy feet, kid. Tag two of them for me and put them back, and I should have something to tell you in the morning.",
   "q23c": "Which means whatever is left of that station is still out in the middle of this lake, and the middle is the one part of it neither of us can reach. Not in a kayak.",
   "walt_done_1": "That's the job done, kid. Let's settle up.",
   "walt_done_2": "Well now. That is exactly what I asked for. Bring it here and we'll square it away.",
   "walt_done_3": "Job's done, and done properly. Let's get you paid.",
   "q23_done": "Thirty years of stories, and it turns out he was only ever doing his job.",
   "q14_done": "That is the money, kid - enough for the kayak. She is tied up at the end of the boards whenever you are ready for her.",
   "q24_done": "A thousand dollars, kid. That is the motorboat paid for, whenever you want to sign for her.",
   "q25_done": "She is fuelled and tied off at the end of the boards. And kid - I meant every word about the middle of this lake.",
   "q31_done": "That is a proper day's data, kid. Now then - that repair tab of yours. Those tag bounties will square it.",
   "q33_done": "Everything checks out. Take her out, kid, and let us hear what he makes of it.",
   "walt_hello": "Well, hey there, kid!",
   "walt_moment": "Come here a second.",
   "walt_grant": "Saving up for that? I have it right here.",
   "walt_scales": "Great catch! Let's have a look at those.",
   "walt_need": "This is what I need.",
   "walt_obliged": "Much obliged, kid.",
   "walt_bought_hand": "Good choice. That is the one in your hands now.",
   "walt_bought_boat": "Good choice. That is on your boat now.",
   "q27_done": "The winding key. Well I never - that is the last of them, kid. Bring it here and let me see the lot together.",
   "q28_done": "A blueprint. Thirty years and the answer was in a box on the bottom of the lake. Right - I am going to need iron.",
   "q30_done": "Three lake trout off the bottom at ninety feet, all three tagged and back in the cold. Nobody has that data, kid. Nobody.",
   "q32_done": "Not a dollar owing. You and me are square, kid - and I am glad it was you that pulled all this up.",
   "q34_done": "You SAW him. After thirty years of stories, somebody finally saw him - and he came up to look at you. Sit down a minute, kid, before you tell me the rest.",
   "q35_send": "Then go back out there and meet him properly. Take the sonar, take your time, and whatever he does - let him do it. I will be right here on the radio.",
   "q17b_a": "Now then. There is a fish out on that breakline I have got no numbers on at all - walleye. Eyes like a cat's, feeds when the light goes flat, and gone the second the sun comes out.",
   "q17b_b": "Twenty feet down off the drop, kid. Two of them tagged and I will have something to write in the column that has been empty since ninety-four.",
   "q17b_nudge": "Two walleye, out on the breakline, twenty feet down.",
   "q17b_done": "Walleye. Both tagged, both back in. That column is not empty any more, and it is your handwriting in it.",
   "q29b_a": "One more thing before you go deep again. Every trout I have ever opened up out there had the same fish in it - cisco. Lake herring. Little silver things down in the cold layer.",
   "q29b_b": "Fifty feet and below, on live shiners. Three of them tagged, kid, and then I will know what the trout are living on out there.",
   "q29b_nudge": "Three cisco, down in the cold layer. Fifty feet and below.",
   "q29b_done": "Three cisco. That is the bottom of the whole food chain out there, written down at last - and it explains the size of what is eating them.",
   "q36_a": "Sit down a minute, Chief Warden. Something has happened out there. That fog is off the water for the first time since I was your age, and Barnaby has pulled the whole log jam apart - shoved it clean off the channel like it was brush.",
   "q36_b": "Which means the lake is calm, kid. All of it. No fog, no timber, no hull getting chewed up just for being out in the deep - you can go anywhere on this water now and take your time about it.",
   "q36_c": "And I will tell you what I think is out there. Thirty years shut behind that jam, nothing fished, nothing counted - there could be a dozen fish in this lake that are not in any book I own.",
   "q36_d": "So go and find them. Every lure in that box, every corner of the water, and no map for it - I have not got one. Ten of them, kid. Catch all ten and report back to me.",
   "q36_nudge": "Ten fish nobody has in a book. Every lure, every corner - and no, I cannot tell you where.",
   "q36_done": "Ten. TEN fish, and not one of them in a book on my shelf - a perch with no colour in it, a pike crossed with something, and a blue pike that has been extinct since before you were born. This is not a logbook any more, kid. This is a paper.",
   "q37_a": "One more thing, and it is the last I will ask of you. That bottom out there has been shut away since the sixties, and everything that ever went over the side of a boat is still lying on it.",
   "q37_b": "Heavy magnet, kid. That is the only thing that will lift what I am after. Ten unique things - not scrap, not tin cans. Things somebody lost and wanted back.",
   "q37_c": "They will be a long time coming. They are lying anywhere at all and there is one of each, so when you have got one that is the only one there is. Bring me all ten.",
   "q37_nudge": "Heavy magnet, and ten unique things off the bottom. Take your time.",
   "q37_done": "All ten. A locket with a face still in it, a watch stopped at twenty past four, and a set of tags I am going to drive round to a house tonight. You gave this lake its memory back, kid. Go on - go fishing. It is yours now.",
   "q26_send": "I know that look, kid. You are going to go and see for yourself, aren't you. Everybody does. Go on then - but keep her slow, keep your eyes up, and if that engine so much as coughs out there, you sit tight and you get on the radio. I will come and get you.",
   "q31_send": "One more piece of rod work and we are done with it. There is an old lake trout down in that trench that will go fifteen pounds - eighty feet and better, right down in the cold. That Pro Rod was built for exactly that fish. Tag her, put her straight back, and I will have the last of my numbers.",
   "q34_send": "Right then. That is everything, and it is all aboard. Out to the middle, kid, cut your engine, and let the sonar play down into it. I will have the radio on beside me the whole time - whatever happens out there, you are not out there on your own."
  },
  "nudges": {
   "q01": "No rush, kid. Thirty little fish - the shoreline's full of 'em.",
   "q02": "Three sunfish, tagged and let go. They're right under the boards.",
   "q03": "Perch hug those pilings. Three tags, and bring me the data.",
   "q04": "That litter's still floating by the reeds. Five pieces, kid.",
   "q05": "Five more panfish and that canoe deposit is yours.",
   "q06": "The bass are under the lily pads in fifteen feet. Two tags.",
   "q07": "Crappies run the outer weedline in twenty feet. Four of 'em.",
   "q08": "Drop that magnet over the scrap markers. Three pieces gets your canoe cleaned.",
   "q09": "Whatever's out by the west weeds, the magnet'll find it.",
   "q10": "She's a five-pounder, in the deepest pads on the west side. Take your time.",
   "q11": "Something's in the mud at the shallow drop-off. Keep dragging that magnet.",
   "q12": "Catfish come up the muddy banks at dusk. Two tags before dark.",
   "q13": "Five pieces of scrap at the counter, and it's fifty dollars of credit.",
   "q14": "Six more bay fish and that kayak's yours.",
   "q15": "The yellow kayak's two hundred and fifty. Come see me at the counter.",
   "q16": "Pike patrol the rock ledges past the buoys. Two tags, kid.",
   "q17": "Straight down to the mud at fifty feet. Three big catfish.",
   "q18": "There's more of that brass down the drop-off. Keep the magnet down.",
   "q19": "Bring the kayak up to the workshop and we'll patch her.",
   "q20": "Ten-pounder, at the log jam in sixty feet. Keep him out of the branches.",
   "q21": "Try the magnet at the deep log jam. Something's still down there.",
   "q22": "The seventy-five-foot edge, kid. Heavy magnet work.",
   "q23": "Two lake trout in seventy feet. Cold water, deep line.",
   "q24": "Eight deep-water fish and that motorboat's yours.",
   "q25": "A thousand dollars, and she's yours. Come to the counter.",
   "q26": "Well - you'll find out what's in that fog soon enough.",
   "q27": "Right where you stalled. The kayak won't bother him.",
   "q28": "Bring me that blueprint from the lockbox, kid.",
   "q29": "Three heavy pieces of scrap and I'll forge the housing.",
   "q30": "Three trout at ninety feet, on the Pro Rod.",
   "q31": "There's a fifteen-pounder down at a hundred feet. Let the rod do the work.",
   "q32": "Square the tab and we're ready.",
   "q33": "Heavy magnet, Pro Rod, sonar. Then the fog.",
   "q34": "Cut the engine out there and let the sonar play.",
   "q35": "Take the bell, kid. He's offering it to you."
  },
  "waltPools": {
   "log": [
    "walt_log_1",
    "walt_log_2",
    "walt_log_3",
    "walt_log_4",
    "walt_log_5"
   ],
   "logBig": [
    "walt_logbig_1",
    "walt_logbig_2",
    "walt_logbig_3"
   ],
   "logMany": [
    "walt_logmany_1",
    "walt_logmany_2",
    "walt_logmany_3"
   ],
   "logOne": [
    "walt_logone_1",
    "walt_logone_2"
   ],
   "hold": [
    "walt_hold_1",
    "walt_hold_2",
    "walt_hold_3"
   ],
   "done": [
    "walt_done_1",
    "walt_done_2",
    "walt_done_3"
   ]
  }
 }
};
