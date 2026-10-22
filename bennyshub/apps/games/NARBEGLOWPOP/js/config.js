/**
 * NARBE Glow Pop - all the easy-to-change numbers, colors and options.
 * START HERE.
 *
 * A cause and effect game designed for players with CVI (cortical visual
 * impairment) and early learners. One giant glowing ball (or bug) on a plain
 * dark screen. Any press pops it into sparkles, and a new one appears in the
 * same spot.
 *
 * Adding a new option to any list here automatically adds it to the setting
 * that uses that list (each Enter on a setting moves to the next option).
 */

window.NGP = window.NGP || {};

NGP.CONFIG = {
    shapes: {
        ball:    { label: 'Ball' },
        ladybug: { label: 'Ladybug' },
        bee:     { label: 'Bee' }
    },
    // Radius as a fraction of the shorter side of the screen.
    sizes: {
        large: { label: 'Large',           radius: 0.24 },
        xl:    { label: 'Extra Large',     radius: 0.32 },
        giant: { label: 'Giant',           radius: 0.40 },
        fill:  { label: 'Fill the Screen', radius: 0.47 }
    },
    // Bright, saturated colors. Red and yellow are often easiest to see with CVI.
    // For the ladybug and bee, this is the body color.
    colors: {
        yellow: { label: 'Yellow',     hex: '#ffd60a' },
        red:    { label: 'Red',        hex: '#ff2b2b' },
        orange: { label: 'Orange',     hex: '#ff8c00' },
        green:  { label: 'Green',      hex: '#2bea6a' },
        blue:   { label: 'Blue',       hex: '#2f8bff' },
        pink:   { label: 'Pink',       hex: '#ff4fd8' },
        turns:  { label: 'Take Turns', hex: null }   // cycles through the colors above
    },
    // Plain, dark backgrounds make the glow stand out.
    backgrounds: {
        black:  { label: 'Black',  hex: '#000000' },
        navy:   { label: 'Navy',   hex: '#06113a' },
        purple: { label: 'Purple', hex: '#1b0833' }
    },
    outlines: {
        off:   { label: 'Off',   hex: null },
        white: { label: 'White', hex: '#ffffff' },
        black: { label: 'Black', hex: '#000000' }
    },
    // Optional ring around the object when Pop is selected in Scan to Pause.
    selectionRings: {
        off:    { label: 'Off',    hex: null },
        yellow: { label: 'Yellow', hex: '#ffd700' },
        cyan:   { label: 'Cyan',   hex: '#00e5ff' },
        blue:   { label: 'Blue',   hex: '#2f8bff' },
        green:  { label: 'Green',  hex: '#2bea6a' },
        pink:   { label: 'Pink',   hex: '#ff4fd8' },
        white:  { label: 'White',  hex: '#ffffff' }
    },
    // x and y are fractions of the screen (0.5, 0.5 is the middle).
    positions: {
        center: { label: 'Center', x: 0.5, y: 0.5 },
        lower:  { label: 'Lower',  x: 0.5, y: 0.66 },
        left:   { label: 'Left',   x: 0.3, y: 0.5 },
        right:  { label: 'Right',  x: 0.7, y: 0.5 }
    },
    // delay: seconds after a pop before the next one starts appearing
    // grow:  seconds it takes to grow into place
    comesBack: {
        instant: { label: 'Instant', delay: 0,    grow: 0.12 },
        quick:   { label: 'Quick',   delay: 0.25, grow: 0.25 },
        slow:    { label: 'Slow',    delay: 0.7,  grow: 0.45 }
    },
    tapStyles: {
        every: { label: 'Every Press Counts', note: 'Every press gets a reaction, even while the sparkles are still going. Nothing is ever ignored.' },
        build: { label: 'Build Up',           note: 'Each press makes it grow and glow brighter. A few presses in a row make it pop with an extra big burst.' },
        wait:  { label: 'Wait for It',        note: 'It comes back dim, then lights up with a chime when it is ready. Only a press after the chime makes the big pop. Presses before that get a tiny, quiet sparkle, so the player is never ignored.' }
    },
    // Wait for It: how long it stays dim before it lights up and is ready.
    waitTimes: {
        half:  { label: '½ Second',  speak: 'half a second', seconds: 0.5 },
        one:   { label: '1 Second',  seconds: 1 },
        two:   { label: '2 Seconds', seconds: 2 },
        three: { label: '3 Seconds', seconds: 3 },
        five:  { label: '5 Seconds', seconds: 5 }
    },
    reactions: {
        same: { label: 'Same Every Time', note: 'The same sound and pattern on each pop, for a familiar, predictable response.' },
        mix:  { label: 'Mix It Up',       note: 'Bubbly pops, boings, chimes and other playful sounds take turns. Variety changes the burst shape too.' }
    },
    popShapes: {
        variety: { label: 'Variety' },
        star:    { label: 'Stars' },
        circle:  { label: 'Circles' },
        heart:   { label: 'Hearts' },
        flower:  { label: 'Flowers' },
        diamond: { label: 'Diamonds' }
    },

    buildUpTaps: 4,          // Build Up: presses needed to pop
    squashTime: 0.14,        // seconds the ladybug or bee squishes before bursting
    tapCooldown: 0.1,        // seconds; presses closer together than this count as one
    pulseAmount: 0.04,       // how much the waiting shape gently breathes (0 turns it off)
    sparkleCount: 18,        // sparkles per pop
    waitingBrightness: 0.35, // Wait for It: how dim it is before it's ready (0 to 1)
    appearSound: true,       // soft sound when a new one appears, to help the player find it

    defaults: {
        shape: 'ball', size: 'xl', color: 'yellow', background: 'black', outline: 'off', position: 'center',
        comesBack: 'quick', tapStyle: 'every', waitTime: 'one', reactions: 'same', popShape: 'variety',
        selectionRing: 'off'
    }
};
