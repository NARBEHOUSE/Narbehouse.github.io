/**
 * NARBE Switch Stories - all the easy-to-change numbers, words and options.
 * START HERE.
 *
 * A switch-accessible, read-aloud picture book library for young and early
 * learner players, including players with CVI (cortical visual impairment).
 * Each page is read aloud, then one thing happens on the page, then a press
 * turns to the next page.
 *
 * The stories themselves live in stories/ (one folder each, listed in
 * stories/list.js). This file only holds how the game behaves.
 *
 * Adding a choice to any setting list here adds it to that setting in the
 * Settings menu (each Enter on a setting moves on to the next choice). The
 * first choice in each list is just the order they come in; the starting
 * choice is set in `defaults` at the bottom.
 */

window.NSS = window.NSS || {};

NSS.CONFIG = {
    /**
     * What can happen on a page.
     *   seconds  how long it takes
     *   sound    the built-in sound it makes (a page's own actionSound file
     *            plays instead when it has one)
     */
    actions: {
        wave:      { seconds: 1.4, sound: 'woof' },
        wag:       { seconds: 1.6, sound: 'woof' },
        jump:      { seconds: 1.1, sound: 'boing' },
        chase:     { seconds: 2.4, sound: 'boing' },     // the ball rolls away and the character runs after it
        fly:       { seconds: 3.4, sound: 'tweet' },     // the bird flies over the character's head, then away
        splash:    { seconds: 1.3, sound: 'splash' },    // the sound plays when the character lands
        sleep:     { seconds: 1.7, sound: 'lullaby' },
        celebrate: { seconds: 1.6, sound: 'fanfare' },   // everyone cheers and stars burst
        // For stories with a cast and background pictures ("Lily Loves Books"):
        roll:      { seconds: 2.4, sound: 'roll' },      // the actor rolls from `from` to their place
        arrive:    { seconds: 2.8, sound: 'roll' },      // rolls in, and the afterBackground (doors open) fades in
        press:     { seconds: 1.0, sound: 'click' },     // a switch press: the pose changes (the tablet page turns)
        popup:     { seconds: 1.8, sound: 'twinkle' },   // the object pops up out of the tablet and twinkles
        rise:      { seconds: 2.2, sound: 'whoosh' },    // the object rises up out of the tablet
        hopout:    { seconds: 2.6, sound: 'boing' },     // the object jumps out of the tablet and hops
        hopacross: { seconds: 3.0, sound: 'boing' },     // hops left to right inside the illustrated screen
        gather:    { seconds: 2.4, sound: 'twinkle' },   // friends move closer and turn to one another
        glow:      { seconds: 2.0, sound: 'twinkle' },   // a soft warm glow around everyone
        // Layered picture-book actions; the illustration keeps its own motion.
        drive:     { seconds: 2.6, sound: 'roll' },
        breeze:    { seconds: 3.2, sound: 'whoosh' },
        swim:      { seconds: 2.0, sound: 'splash' },
        seahello:  { seconds: 2.8, sound: 'twinkle' },
        snack:     { seconds: 2.2, sound: 'click' },
        tears:     { seconds: 2.4, sound: null },
        idea:      { seconds: 2.2, sound: 'twinkle' },
        dig:       { seconds: 2.8, sound: 'whoosh' },
        tide:      { seconds: 3.0, sound: 'splash' },
        protect:   { seconds: 3.0, sound: 'splash' },
        hooray:    { seconds: 2.6, sound: 'fanfare' },
        sunset:    { seconds: 3.4, sound: 'lullaby' },
        blink:     { seconds: 2.8, sound: 'twinkle' },
        shine:     { seconds: 2.8, sound: null },
        blur:      { seconds: 2.4, sound: null },
        rock:      { seconds: 2.8, sound: 'click' },
        trace:     { seconds: 3.6, sound: null },
        sharewarmth: { seconds: 3.2, sound: 'twinkle' },
        sunglasses: { seconds: 3.0, sound: null },
        beachwalk: { seconds: 4.2, sound: null },
        surf:      { seconds: 3.4, sound: 'splash' },
        oceanlisten: { seconds: 3.8, sound: 'splash' },
        sigh:      { seconds: 4.0, sound: null },
        stargaze:  { seconds: 4.0, sound: 'twinkle' },
        canesweep: { seconds: 3.6, sound: null },
        listen:    { seconds: 3.6, sound: 'twinkle' },
        canedip:   { seconds: 3.6, sound: null },
        sandsift:  { seconds: 3.8, sound: null },
        goldwater: { seconds: 4.2, sound: 'twinkle' },
        planktonglow: { seconds: 4.2, sound: 'twinkle' },
        wavecurl:  { seconds: 4.0, sound: 'splash' },
        bookopen:  { seconds: 3.8, sound: null },
        readtogether: { seconds: 3.8, sound: null },
        proudjump: { seconds: 3.2, sound: null },
        friendscheer: { seconds: 4.0, sound: 'twinkle' },
        none:      { seconds: 0,   sound: null }         // nothing happens (a title page): the words are read, then a press turns the page
    },

    /** Things that can be drawn on a page, next to the character. */
    objects: ['ball', 'bird', 'puddle', 'moon'],

    /**
     * This game's own settings. `note` is said (and is true) after the
     * choice is made; scanning only says the setting's name and value.
     */
    settings: {
        imageDescriptions: {
            off: { label: 'Off', note: 'Read the story without extra picture descriptions.' },
            on: { label: 'On', note: 'Describe each picture before reading and each action afterward. Press to continue. Descriptions speak only when Read Aloud is on.' }
        },
        readAloud: {
            on:  { label: 'On',  note: 'The words on each page are read aloud.' },
            off: { label: 'Off', note: 'Nothing is read aloud during the story, so you or a helper can read it.' }
        },
        rate: {
            normal: { label: 'Normal', rate: 0.92 },
            slow:   { label: 'Slow',   rate: 0.75 }
        },
        look: {
            book: { label: 'Picture Book', note: 'A colored page behind each picture.' },
            // For players with CVI (cortical visual impairment).
            cvi:  { label: 'Simple High Contrast', note: 'Black background, a bigger character and white words.' }
        },
        textSize: {
            large: { label: 'Large' },
            xl:    { label: 'Extra Large' }
        },
        // Simple High Contrast only: the colour of the thick line around the
        // character and the things on the page. Yellow is how they are drawn
        // (the moon and star keep their white edge, so they still stand out);
        // Off leaves no coloured edge at all.
        outline: {
            yellow: { label: 'Yellow', color: null,      note: 'A bright yellow edge around Rocky and the things on the page.' },
            white:  { label: 'White',  color: '#ffffff', note: 'A white edge around Rocky and the things on the page.' },
            red:    { label: 'Red',    color: '#ff2020', note: 'A red edge around Rocky and the things on the page.' },
            off:    { label: 'Off',    color: '#000000', note: 'No coloured edge.' }
        },
        // Simple High Contrast only. Large aims for twice the size, fitted
        // to the available space with room for the caption and action.
        characterSize: {
            regular: { label: 'Regular', scale: 1 },
            large:   { label: 'Large',   scale: 2, note: 'Characters and objects fill more of the screen, with room for the words and actions.' }
        }
    },

    /**
     * The menus' background picture, behind the library, Settings and How to
     * Play (Picture Book look only; Simple High Contrast keeps the menus
     * plain black). It holds still, with a few soft fireflies to catch the
     * player's eye. If the file is missing, the menus simply stay dark.
     */
    // (A 1920-wide copy, light enough for older tablets; the full-size original is in the local reference archive; see ASSET-OPTIMIZATION.md.)
    libraryBackground: 'images/library-background.jpg',
    fireflies: 12,

    tapCooldown: 0.15,       // seconds; presses in the story closer together than this count as one
    storiesPerScreen: 6,     // maximum per library page; smaller windows show fewer readable cards
    maxPixelRatio: 2,        // crisp on 2x displays; cap the cost on very dense screens

    defaults: {
        readAloud: 'on', rate: 'normal', imageDescriptions: 'off',
        look: 'book', textSize: 'large', outline: 'yellow', characterSize: 'regular'
    }
};
