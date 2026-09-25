# Default campaigns

Three independent campaigns, 24 levels each: 72 encounters in four seasonal chapters. Every level requires defeating every guard. Levels 14 and 22 also require destroying the powder kegs. Levels 18–24 require protecting the marked friendly characters. Ammo crates are optional supplies, not story collectibles.

Buildings include cottages, workshops, storehouses, gate spans, watchtowers, paired keeps and fortified compounds. The original seven milestone castles retain their persistent IDs. New stages have separate IDs.

## Bramblewick

| Level | Encounter | Season | Setting | Time | Extra goal |
| --- | --- | --- | --- | --- | --- |
| 1 | Woodland Huts | spring | woodland | day | — |
| 2 | Sawmill Clearing | spring | woodland | dawn | — |
| 3 | Applecart Cottages | spring | orchard | sunset | — |
| 4 | Bellringer Village | spring | village | day | — |
| 5 | Mill Road Crossing | spring | riverside | twilight | — |
| 6 | Harvest Yard | spring | farmland | night | — |
| 7 | Twin Lookouts | summer | meadow | day | — |
| 8 | Copperpot Manor | summer | orchard | dawn | — |
| 9 | Carpenters Court | summer | village | sunset | — |
| 10 | Thornwood Checkpoint | summer | woodland | day | — |
| 11 | Orchard Keeps | summer | orchard | twilight | — |
| 12 | Bramblewick Gate | summer | farmland | night | — |
| 13 | Lantern Courtyard | autumn | village | day | — |
| 14 | Powder Barns | autumn | farmland | dawn | Destroy powder kegs |
| 15 | Westfield Castles | autumn | meadow | sunset | — |
| 16 | Thistledown Keep | autumn | meadow | day | — |
| 17 | Highwatch Towers | autumn | mountains | twilight | — |
| 18 | Roadside Market | autumn | village | night | Protect friends |
| 19 | Three Hearth Halls | winter | woodland | day | Protect friends |
| 20 | Festival Fortress | winter | village | dawn | Protect friends |
| 21 | Crown Road Castles | winter | riverside | sunset | Protect friends |
| 22 | Royal Powder Yard | winter | farmland | day | Destroy powder kegs; Protect friends |
| 23 | Last Watch | winter | riverside | twilight | Protect friends |
| 24 | Bramblewick Crown Castle | winter | riverside | night | Protect friends |

## Coppercoast

| Level | Encounter | Season | Setting | Time | Extra goal |
| --- | --- | --- | --- | --- | --- |
| 1 | Fishermen’s Huts | summer | harbor | day | — |
| 2 | Netmakers Yard | summer | harbor | dawn | — |
| 3 | Saltwind Cottages | summer | riverside | sunset | — |
| 4 | Harbor Cottages | summer | harbor | day | — |
| 5 | Dock Road Crossing | summer | harbor | twilight | — |
| 6 | Sailmakers Yard | summer | harbor | night | — |
| 7 | Beacon Lookouts | autumn | island | day | — |
| 8 | Admiral’s Manor | autumn | harbor | dawn | — |
| 9 | Shipwright Court | autumn | harbor | sunset | — |
| 10 | Tideway Checkpoint | autumn | riverside | day | — |
| 11 | Clifftop Keeps | autumn | mountains | twilight | — |
| 12 | Harbor Gatehouse | autumn | harbor | night | — |
| 13 | Lantern Quay | winter | harbor | day | — |
| 14 | Powder Warehouses | winter | island | dawn | Destroy powder kegs |
| 15 | Sister Island Castles | winter | island | sunset | — |
| 16 | Seabreeze Keep | winter | island | day | — |
| 17 | Stormwatch Towers | winter | mountains | twilight | — |
| 18 | Shelter Quay | winter | lake | night | Protect friends |
| 19 | Three Harbor Halls | spring | harbor | day | Protect friends |
| 20 | Breakwater Fortress | spring | island | dawn | Protect friends |
| 21 | Admiralty Castles | spring | island | sunset | Protect friends |
| 22 | Naval Powder Yard | spring | harbor | day | Destroy powder kegs; Protect friends |
| 23 | Last Beacons | spring | island | twilight | Protect friends |
| 24 | Coppercoast Island Castle | spring | island | night | Protect friends |

## Mossmere

| Level | Encounter | Season | Setting | Time | Extra goal |
| --- | --- | --- | --- | --- | --- |
| 1 | Foresters’ Huts | autumn | woodland | day | — |
| 2 | Woodcutters Clearing | autumn | woodland | dawn | — |
| 3 | Reedbank Lodges | autumn | marsh | sunset | — |
| 4 | Willow Lodges | autumn | riverside | day | — |
| 5 | Old Road Crossing | autumn | riverside | twilight | — |
| 6 | Foresters Yard | autumn | woodland | night | — |
| 7 | Pine Lookouts | winter | mountains | day | — |
| 8 | Warden’s Manor | winter | woodland | dawn | — |
| 9 | Woodland Workshop | winter | woodland | sunset | — |
| 10 | Rootway Checkpoint | winter | marsh | day | — |
| 11 | Ridgewatch Keeps | winter | mountains | twilight | — |
| 12 | Old Forest Gate | winter | ruins | night | — |
| 13 | Moonlit Courtyard | spring | ruins | day | — |
| 14 | Powder Lodges | spring | woodland | dawn | Destroy powder kegs |
| 15 | Stonegrove Castles | spring | ruins | sunset | — |
| 16 | Fernwatch Keep | spring | woodland | day | — |
| 17 | Stonepine Towers | spring | mountains | twilight | — |
| 18 | Forest Market | spring | village | night | Protect friends |
| 19 | Three Woodland Halls | summer | woodland | day | Protect friends |
| 20 | Mosswall Fortress | summer | woodland | dawn | Protect friends |
| 21 | Warden Road Castles | summer | lake | sunset | Protect friends |
| 22 | Citadel Powder Yard | summer | ruins | day | Destroy powder kegs; Protect friends |
| 23 | Last Sentinels | summer | lake | twilight | Protect friends |
| 24 | Mossmere Grand Citadel | summer | lake | night | Protect friends |

## Existing saves

Save version 3 preserves settings, custom castles, ammo unlocks, stars and scores from version 2. A partial run resumes immediately after its last cleared original milestone. A completed seven-level campaign resumes at level 2, the first added encounter, while keeping its prior scores. Migration happens once. Restart progress remains available per campaign.

## Verification

Run tests/verify-expansion.cjs for content and migration checks, tests/verify-campaign.cjs for all 24 sequential completion screens, tests/verify-playability-all.cjs for limited-ammo real-physics playthroughs, and tests/verify-patrols.cjs for live routes. tests/verify-destruction.cjs includes every campaign build in the editor stability test. Set BALLISTA_LEVELS to comma-separated zero-based global level indices for a focused playability rerun. Generated reports and screenshots are disposable.
