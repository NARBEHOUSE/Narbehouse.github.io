/**
 * NARBE Animal Friends - the DOM interface layer.
 *
 * Everything the player reads, selects or is highlighted on lives here, on top
 * of the stage. Nothing in this file touches WebGL. That is what makes the scan
 * highlight a real CSS outline you can prove is correct, keeps focus, speech and
 * the input contract testable, and leaves the whole accessibility surface
 * inspectable in devtools.
 *
 * Screens: menu, play, settings, pause, help.
 * The scan list for whichever screen is up is returned by scannables().
 */

window.NAF = window.NAF || {};

NAF.UI = (function () {
    'use strict';

    const STAMP_SLOTS = 5;

    let screen = 'menu';
    let settingsFrom = 'menu';
    let nameEditing = false;
    /** Row-then-key drill-down for the name keyboard - see the note above
     *  nameEditorScannables(). 'rows': scanning across whole rows. 'keys':
     *  scanning across the keys of nameKbRow, one row drilled into. */
    let nameKbMode = 'rows';
    let nameKbRow = 0;
    let el = {};

    function S() { return NAF.Settings; }

    /**
     * The How to Play directions, written once.
     *
     * Printed on the help screen AND read aloud when its title is chosen, from
     * this one array - so the words a player hears are always the words on the
     * page. Two copies of the same instructions is exactly the sort of thing
     * that drifts, and the version that goes stale is invariably the spoken
     * one, which is the version the players who most need it are using.
     *
     * *Asterisks* mark emphasis: they become <b> in print and are stripped for
     * speech. Keeping the source as plain sentences is what lets it be spoken
     * at all - HTML in here would be read out as tags or need unpicking first.
     * One sentence per line, because each line is queued as its own utterance
     * and a full stop is where a voice should draw breath.
     */
    const HELP_LINES = [
        'Choose a place to visit: the barn, the aquarium or the safari.',
        'Then choose to open it. An animal comes out to say hello.',
        '*Tap Space* to move the highlight. *Hold Space* to go back.',
        '*Enter* chooses what is highlighted.',
        'Choose *Pause* to stop and change things.',
        'In *Settings* you can toggle the sounds and music on or off, and change ' +
            'highlight settings and more.',
        'There is no score, no timer and no way to lose.'
    ];

    // --- helpers ----------------------------------------------------------------

    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }

    function button(cls, parent, label) {
        const b = node('button', 'naf-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }

    /** A settings row: label on the left, current value on the right. */
    function row(parent, label, value) {
        const b = button('naf-row', parent);
        node('span', 'naf-row-label', b, label);
        node('span', 'naf-row-value', b, value === undefined ? '' : value);
        return b;
    }

    function onOff(v) { return v ? 'On' : 'Off'; }

    /**
     * Chunky line icons for the menus. Inline SVG in the DOM layer, where the
     * WebGL "SVGs need an explicit width and height" trap does not apply - these
     * are never uploaded as textures. Purely decorative: every item is still
     * named in text and spoken, so nothing depends on reading the picture.
     */
    const ICON = (function () {
        function svg(body) {
            return '<svg class="naf-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
                body + '</svg>';
        }
        function gear() {
            // A hub, a rim, and eight short teeth between them - without the rim
            // the spokes read as a sun rather than a gear.
            let teeth = '';
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI / 4) * i;
                const x1 = 24 + Math.cos(a) * 13.5, y1 = 24 + Math.sin(a) * 13.5;
                const x2 = 24 + Math.cos(a) * 18.5, y2 = 24 + Math.sin(a) * 18.5;
                teeth += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
                    '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
                    '" stroke-width="5.5"/>';
            }
            return svg('<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5.5"/>' + teeth);
        }
        return {
            barn: svg('<path d="M6 21 24 8l18 13"/><path d="M10 21v19h28V21"/>' +
                      '<path d="M18 40V28h12v12"/><line x1="24" y1="28" x2="24" y2="40"/>'),
            // A tank: a glass box with a wave line and a fish, so it reads as an
            // aquarium and not just a rectangle.
            tank: svg('<rect x="7" y="11" width="34" height="27" rx="3"/>' +
                      '<path d="M7 20c5-3 7 3 11 0s7 3 11 0 7 3 12 0"/>' +
                      '<path d="M18 30c3-4 8-4 11 0-3 4-8 4-11 0z"/>' +
                      '<path d="M29 30l5-3v6z"/>'),
            // A gate: two leaves with a diagonal brace each, between two posts.
            gate: svg('<path d="M9 12v26"/><path d="M39 12v26"/>' +
                      '<rect x="13" y="17" width="10" height="16"/>' +
                      '<rect x="25" y="17" width="10" height="16"/>' +
                      '<path d="M13 33l10-16"/><path d="M35 33L25 17"/>'),
            animal: svg('<circle cx="24" cy="27" r="12"/>' +
                        '<path d="M15 17 12 6l10 6"/><path d="M33 17 36 6 26 12"/>' +
                        '<circle cx="19" cy="26" r="1.6" class="naf-icon-dot"/>' +
                        '<circle cx="29" cy="26" r="1.6" class="naf-icon-dot"/>'),
            listen: svg('<path d="M9 19h7l9-7v24l-9-7H9z"/>' +
                        '<path d="M32 18a9 9 0 0 1 0 12"/><path d="M37 13a16 16 0 0 1 0 22"/>'),
            help: svg('<circle cx="24" cy="24" r="17"/>' +
                      '<path d="M19 19a5 5 0 1 1 5 7v2"/>' +
                      '<circle cx="24" cy="34" r="1.8" class="naf-icon-dot"/>'),
            settings: gear(),
            home: svg('<path d="M8 23 24 10l16 13"/><path d="M12 23v17h24V23"/>' +
                      '<path d="M20 40V30h8v10"/>'),
            play: svg('<circle cx="24" cy="24" r="17"/><path d="M20 17l12 7-12 7z"/>'),
            exit: svg('<path d="M28 10H12v28h16"/><path d="M24 24h14"/><path d="M32 18l6 6-6 6"/>'),
            check: svg('<circle cx="24" cy="24" r="17"/><path d="M16 24.5l6 6 11-13"/>'),
            cross: svg('<circle cx="24" cy="24" r="17"/><path d="M18 18l12 12"/><path d="M30 18L18 30"/>')
        };
    })();

    /**
     * A menu button: icon chip, then the label.
     *
     * `labelHtml` is for a label with a part the layout may drop - "Visit the"
     * ahead of the zone's name, which a short landscape screen hides so three
     * places fit across one row. The full text stays in the DOM either way, so
     * what a screen reader reads never depends on the viewport.
     */
    function menuButton(parent, label, iconName, tone, labelHtml) {
        const b = button('naf-menu-item', parent);
        if (tone) b.dataset.tone = tone;
        const chip = node('span', 'naf-icon-chip', b);
        chip.innerHTML = ICON[iconName] || '';
        const l = node('span', 'naf-menu-label', b, labelHtml ? '' : label);
        if (labelHtml) l.innerHTML = labelHtml;
        return b;
    }

    function ttsOn() {
        try { return !!window.NarbeVoiceManager.getSettings().ttsEnabled; } catch (e) { return false; }
    }
    function voiceName() {
        try {
            return window.NarbeVoiceManager.getVoiceDisplayName(window.NarbeVoiceManager.getCurrentVoice());
        } catch (e) { return 'Default'; }
    }
    function autoScanOn() {
        try { return !!window.NarbeScanManager.getSettings().autoScan; } catch (e) { return false; }
    }
    function scanSpeedLabel() {
        try { return (window.NarbeScanManager.getScanInterval() / 1000) + ' s'; } catch (e) { return '2 s'; }
    }

    /**
     * A card shaped like the barn: a pitched roof with a hay loft above the wall
     * the buttons sit on. The roof is one SVG polygon stretched to the card's
     * width, so the shape holds at any size while the outline stays even.
     * Returns the wall, which is where callers put their content.
     */
    /**
     * A barn: gambrel roof with a loft window, plank walls, and the buttons on
     * its doors. Two animals stand at the sides, drawn from the same registry as
     * the ones in the game, so they upgrade with the rest of the art.
     */
    function barnCard(parent, titleText, titleTag) {
        const frame = node('div', 'naf-barnframe', parent);
        // The sign hangs above the barn, on the sky, rather than inside it.
        node(titleTag || 'h2', 'naf-title naf-title-above', frame, titleText);

        // The roof holds two independent things: the drawn art (SVG + loft
        // feature), rebuilt wholesale by skinFrame() every time the zone
        // changes, and the question text, appended once and never touched
        // again. They have to be separate elements - skinFrame replaces the
        // art wrapper's innerHTML outright, and doing that to .naf-roof
        // itself would silently delete the question the next time the
        // highlight passed over a different place on the menu.
        const roof = node('div', 'naf-roof', frame);
        node('div', 'naf-roof-art', roof);
        const wall = node('div', 'naf-card naf-card-barn', frame);
        skinFrame(frame, NAF.Zones.current());
        return wall;
    }

    /**
     * Bubbles drifting up behind the card, for the tank.
     *
     * Real elements rather than the overlay's ::before/::after, because an
     * element only HAS those two - which is why the tank previously looked
     * like it had a single bubble in it. Each one gets its own column, size,
     * speed and start delay from CSS custom properties, so the five of them
     * never move as a set.
     *
     * Built for every zone and left in place; only the tank's CSS makes them
     * visible, so scanning between places never rebuilds any DOM.
     */
    const BUBBLES = [
        { x: 12, size: 18, secs: 11, delay: 0, drift: 14 },
        { x: 30, size: 11, secs: 8.5, delay: 2.2, drift: -10 },
        { x: 51, size: 22, secs: 13, delay: 4.6, drift: 18 },
        { x: 71, size: 13, secs: 9.5, delay: 1.3, drift: -13 },
        { x: 88, size: 16, secs: 12, delay: 6.1, drift: 9 }
    ];

    function bubbleLayer(overlay) {
        const layer = node('div', 'naf-bubbles', overlay);
        BUBBLES.forEach(function (b) {
            const el2 = node('div', 'naf-bubble', layer);
            el2.style.setProperty('--b-x', b.x + '%');
            el2.style.setProperty('--b-size', b.size + 'px');
            el2.style.setProperty('--b-secs', b.secs + 's');
            el2.style.setProperty('--b-delay', b.delay + 's');
            el2.style.setProperty('--b-drift', b.drift + 'px');
        });
        return layer;
    }

    /**
     * The question - "Choose a place...", "Which way would you like to play?" -
     * painted inside the roof rather than sitting on the wall above the doors.
     * A board hanging under the loft window/porthole/sign, matching the size and
     * weight of the buttons it is asking about, with its own background so it
     * reads over vertical boards, a glass dome or a straw fringe alike.
     */
    function roofCta(frame, text) {
        const roof = frame && frame.querySelector('.naf-roof');
        if (!roof) return node('p', 'naf-sub', null, text);
        return node('p', 'naf-roof-cta', roof, text);
    }

    /**
     * Dress a barn-shaped frame as one particular zone: a gambrel barn, a glass
     * tank under a domed hood, or a thatched lodge.
     *
     * The frame's STRUCTURE never changes - a sign above, a roof, a wall with the
     * buttons on its doors, a hint below - so the player's mental model of the
     * menu holds however the building is painted. What changes is the roof's
     * shape and every colour in it, which come straight from the same zone theme
     * the 3D stage draws from, so the menu and the game agree.
     *
     * Called on build and again whenever the zone changes, including while the
     * highlight is only PASSING OVER a zone on the menu.
     */
    function skinFrame(frame, zone) {
        if (!frame) return;
        const t = zone.theme;
        frame.dataset.shape = t.shape;
        frame.style.setProperty('--frame-wall', t.wall);
        frame.style.setProperty('--frame-edge', t.wallEdge);
        frame.style.setProperty('--frame-trim', t.trim);
        frame.style.setProperty('--frame-batten', t.batten);
        frame.style.setProperty('--frame-roof', t.roof);
        frame.style.setProperty('--frame-glass', t.gableGlass);
        frame.style.setProperty('--frame-lamp', t.lamp);
        // Text on the wall. Cream reads on red planks and on timber; on the
        // tank's pale glass it disappears, so that one flips to dark ink.
        const dark = (t.shape === 'tank');
        frame.style.setProperty('--frame-ink', dark ? t.wallEdge : '#fff6e4');
        frame.style.setProperty('--frame-ink-shadow',
            dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.32)');
        const art = frame.querySelector('.naf-roof-art');
        if (art) art.innerHTML = roofSvg(t, (skinFrame.n = (skinFrame.n || 0) + 1));
    }

    /**
     * The roof, as inline SVG stretched to the frame's width.
     *
     * All three are drawn in the same 200x100 box with
     * preserveAspectRatio="none", so the frame can be any size and the roof
     * always meets the wall exactly. Stretching is safe for the detail in each:
     * vertical boards stay vertical, a dome stays a dome, and a fan of straw
     * stays a fan.
     */
    function roofSvg(t, uid) {
        const open = '<svg viewBox="0 0 200 100" preserveAspectRatio="none" ' +
            'aria-hidden="true" focusable="false">';
        const loft = '<span class="naf-loft" aria-hidden="true"></span>';

        if (t.shape === 'tank') {
            // The hood, drawn to match the one tankFacade() puts on the tank in
            // the game - see js/scenery.js. Every number below is that hood's
            // own geometry converted into this box, so the menu and the stage
            // are the same object rather than two things that merely rhyme.
            //
            // In the game the hood runs from SHELF (7.85) to TOP (9.8), so it is
            // 1.95 units tall and 14.3 wide across HOOD_X. Its shape is NOT one
            // big arch: the sides go straight up for the first half and only
            // then dome over in a shallow cap. HOOD_TOP is 8.85, which puts the
            // shoulder at 51% of the hood's height - so here, where y=100 is
            // the shelf and y=0 the crown, the shoulder lands at y=49.
            //
            // What is NOT copied is the overall proportion. In the game the
            // hood is about 7:1; this box is 3.5:1, because the menu's roof
            // also has to hold the question text (see .naf-roof-cta). Matching
            // the features and where they sit WITHIN the hood is what makes it
            // recognisable; matching the aspect ratio would just make a sliver.
            const SHOULDER = 48.7;
            const hood = 'M2,100 L2,' + SHOULDER + ' Q49,0 100,0 Q151,0 198,' +
                SHOULDER + ' L198,100 Z';

            // Five vent slots, not seven, at the game's own spacing: 1.15 units
            // apart about the centre, which is 15.8 units here. They are flat
            // 3:1 slots in the game (0.30 by 0.10) - and because this box is
            // stretched 1.75x horizontally (a 200x100 viewBox in a 3.5:1 frame,
            // preserveAspectRatio="none"), an ellipse needs rx/ry of about
            // 1.71 to COME OUT 3:1 on screen rather than going in as 3:1 and
            // rendering over five to one.
            let vents = '';
            for (let i = -2; i <= 2; i++) {
                vents += '<ellipse cx="' + (100 + i * 15.8).toFixed(1) +
                    '" cy="16.9" rx="4.5" ry="2.6" fill="rgba(0,0,0,0.26)"/>';
            }

            return open +
                '<defs><linearGradient id="nafhood' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
                // The game's sheen, stop for stop.
                '<stop offset="0" stop-color="#fff" stop-opacity="0.26"/>' +
                '<stop offset="0.55" stop-color="#fff" stop-opacity="0.04"/>' +
                '<stop offset="1" stop-color="#000" stop-opacity="0.18"/>' +
                '</linearGradient></defs>' +
                '<path d="' + hood + '" fill="' + t.roof + '" stroke="' + t.wallEdge +
                '" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
                '<path d="' + hood + '" fill="url(#nafhood' + uid + ')"/>' +
                vents +
                // The lamp under the front lip, which is what lights the water.
                // Inset 0.28 units either side and 0.26 tall in the game, so
                // 3.8 in from each edge and the bottom 13.3% of the hood.
                '<rect x="5.8" y="86.7" width="188.4" height="13.3" fill="' + t.lamp + '"/>' +
                // NO loft feature. The game's tank has nothing above the hatch
                // since the riveted port came out (theme.gable is 'none' - see
                // gableFeature in scenery.js), and a porthole here was the last
                // thing making the menu tank and the played tank different
                // objects.
                '</svg>';
        }

        if (t.shape === 'thatch') {
            // Straw: a pointed roof with edges that bow outward, a fringe of
            // hanging tassels along the eave, a fan of stalks and a bound peak.
            //
            // BASE is the box's own bottom edge (y=100), where the wall sits
            // immediately below in the DOM. The roof's own silhouette is a
            // plain solid shape that reaches BASE at every x - a scalloped
            // boundary cut into the shape itself (the earlier approach here)
            // only touches BASE at its own anchor points, and a quadratic
            // notch between two anchors reaches barely halfway back up to its
            // control point, leaving a real, wall-width gap of bare sky in
            // every notch. Instead the ragged "hanging straw" look comes from
            // small tassel shapes drawn ON TOP of this solid base afterwards,
            // overhanging its bottom edge by a few units - decoration layered
            // over an already-sealed roof, so nothing can ever show through
            // between them even where two tassels don't quite meet.
            const BASE = 100, APEX = 4, X0 = 4, X1 = 196;
            const roofPath = 'M100,' + APEX +
                ' Q40,' + (APEX + (BASE - APEX) * 0.62).toFixed(1) + ' ' + X0 + ',' + BASE +
                ' L' + X1 + ',' + BASE +
                ' Q160,' + (APEX + (BASE - APEX) * 0.62).toFixed(1) + ' 100,' + APEX + ' Z';

            // A nominal baseline for the decorative strokes below - not the path
            // boundary itself, just where the fan of straw and the binding line
            // sit, proportionally similar to where they sat before.
            const EAVE_LINE = BASE - 10;
            let fan = '';
            const tones = ['rgba(226,190,110,0.50)', 'rgba(255,232,158,0.28)',
                           'rgba(52,36,14,0.32)'];
            for (let i = 0; i <= 46; i++) {
                const ex = X0 - 6 + (i / 46) * (X1 - X0 + 12);
                const mx = 100 + (ex - 100) * 0.60;
                fan += '<path d="M100,' + (APEX + 6) + ' Q' + mx.toFixed(1) + ',' +
                    (APEX + (EAVE_LINE - APEX) * 0.55).toFixed(1) + ' ' + ex.toFixed(1) + ',' +
                    (EAVE_LINE + 8) + '" stroke="' + tones[i % 3] +
                    '" stroke-width="1.6" fill="none" vector-effect="non-scaling-stroke"/>';
            }

            // Tassels: small rounded clumps of straw hanging past the roof's
            // own bottom edge, drawn AFTER (so on top of) the solid fill and
            // NOT clipped to roofPath - the whole point is that they overhang
            // past it. Their tops sit a couple of units above BASE so they
            // overlap the solid fill rather than butting a hairline seam
            // against it.
            let tassels = '';
            const TUFTS = 15;
            const tuftStep = (X1 - X0) / TUFTS;
            for (let i = 0; i <= TUFTS; i++) {
                const x = X0 + i * tuftStep;
                const droop = 6 + (i % 3) * 3;
                const w = tuftStep * 0.92;
                tassels += '<path d="M' + (x - w / 2).toFixed(1) + ',' + (BASE - 3) +
                    ' Q' + x.toFixed(1) + ',' + (BASE + droop) + ' ' +
                    (x + w / 2).toFixed(1) + ',' + (BASE - 3) +
                    ' Z" fill="' + t.roof + '" stroke="' + t.wallEdge +
                    '" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
            }

            // Everything drawn INSIDE the roof is clipped to it. The fan of straw
            // and the binding line both run wider than the roof at the height
            // they sit at, and without this they hang out either side of it as
            // loose lines in the sky.
            const clip = 'nafthatch' + uid;
            return open +
                '<defs><clipPath id="' + clip + '">' +
                '<path d="' + roofPath + '"/></clipPath></defs>' +
                '<path d="' + roofPath + '" fill="' + t.roof + '" stroke="' + t.wallEdge +
                '" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
                '<g clip-path="url(#' + clip + ')">' + fan +
                '<path d="M' + X0 + ',' + (EAVE_LINE - 22) + ' L' + X1 + ',' + (EAVE_LINE - 22) +
                '" stroke="rgba(52,36,14,0.30)" stroke-width="3" fill="none" ' +
                'vector-effect="non-scaling-stroke"/>' +
                '</g>' +
                tassels +
                '<ellipse cx="100" cy="' + (APEX + 8) + '" rx="9" ry="7" fill="' + t.roof +
                '" stroke="' + t.wallEdge + '" stroke-width="2.5" ' +
                'vector-effect="non-scaling-stroke"/>' +
                '</svg>' + loft;
        }

        // A gambrel: a steep lower slope to a knee, then a shallow run to the
        // apex. It is the shape that reads as "barn" rather than "house".
        // The bottom edge runs to the very bottom of the box so the roof and the
        // wall meet as one shape, with no sliver of sky between them.
        //
        // The fill is a boarded pattern: VERTICAL lines running down the slope,
        // like the roof on a real barn.
        return open +
            '<defs><pattern id="nafboards' + uid + '" width="7" height="100" ' +
            'patternUnits="userSpaceOnUse">' +
            '<rect width="7" height="100" fill="' + t.roof + '"/>' +
            '<rect x="5.6" width="1.1" height="100" fill="' + t.roofDetail + '"/>' +
            '</pattern></defs>' +
            '<polygon points="3,100 30,51 100,5 170,51 197,100" ' +
            'fill="url(#nafboards' + uid + ')"/>' +
            // The ridge where the gambrel's two slopes meet. Knee to knee
            // exactly: drawn any wider it juts out past the roof's slanted edges.
            '<path d="M30,51 L170,51" stroke="' + t.roofDetail +
            '" stroke-width="2.5" fill="none"/>' +
            '</svg>' + loft;
    }

    // --- build ------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('naf');

        el.stage = node('div', 'naf-stage', el.root);

        // The scannable thing the player came here to press. It is a plain,
        // visible button below the barn - the barn itself is the picture and is
        // never focused, so the highlight always lands on something with a label
        // on it rather than on an invisible region of the scene.
        // Its icon and wording are the zone's, refreshed by show().
        el.openBarn = button('naf-open-barn', el.root);
        el.openChip = node('span', 'naf-icon-chip', el.openBarn);
        el.openLabel = node('span', 'naf-menu-label', el.openBarn, 'Open the Barn');

        el.hud = node('div', 'naf-hud', el.root);
        el.stamps = node('div', 'naf-stamps', el.hud);
        el.pauseBtn = button('naf-pause-btn', el.hud);
        el.pauseBtn.setAttribute('aria-label', 'Pause');
        el.pauseBtn.innerHTML = '<span aria-hidden="true">II</span>';

        el.choices = node('div', 'naf-choices', el.root);

        el.banner = node('div', 'naf-banner', el.root);

        // --- overlays ---
        el.menu = node('div', 'naf-overlay naf-menu', el.root);
        bubbleLayer(el.menu);
        const menuCard = barnCard(el.menu, 'NARBE Animal Friends', 'h1');
        el.menuFrame = el.menu.querySelector('.naf-barnframe');
        // The question lives IN the roof, not on the wall - a painted board
        // hanging under the loft window, porthole or sign, the way the sign
        // above the whole building hangs on the sky. roofCta() finds the roof
        // itself, since barnCard() only hands back the wall.
        el.menuSub = roofCta(el.menuFrame, '');
        // The buttons sit on the barn doors, inset from the walls. The three
        // places get the full width of the doors; How to Play, Settings and Exit
        // share a shorter row below them. Six equal buttons stacked would have
        // made fitCard shrink every one of them below a comfortable target size,
        // and the places are what the player came here to choose.
        el.menuDoors = node('div', 'naf-doors naf-menu-doors', menuCard);
        el.menuList = node('div', 'naf-list', el.menuDoors);
        el.menuUtil = node('div', 'naf-list naf-util-row', el.menuDoors);
        node('p', 'naf-hint', menuCard, 'Tap Space = next · hold Space = back · Enter = choose');

        el.modes = node('div', 'naf-overlay naf-modes', el.root);
        bubbleLayer(el.modes);
        // Titled with the zone, filled in by renderModes - the sign over the
        // door is how the player knows which place they walked into.
        const modesCard = barnCard(el.modes, 'Barn', 'h2');
        el.modesFrame = el.modes.querySelector('.naf-barnframe');
        el.modesTitle = el.modes.querySelector('.naf-title-above');
        el.modesSub = roofCta(el.modesFrame, 'Which way would you like to play?');
        el.modesList = node('div', 'naf-list naf-doors', modesCard);
        node('p', 'naf-hint', modesCard, 'Tap Space = next · hold Space = back · Enter = choose');

        el.settings = node('div', 'naf-overlay naf-settings', el.root);
        const setCard = node('div', 'naf-card', el.settings);
        el.settingsTitle = node('h2', 'naf-title', setCard, 'Settings');
        el.settingsList = node('div', 'naf-list', setCard);

        el.pause = node('div', 'naf-overlay naf-pause', el.root);
        const pauseCard = node('div', 'naf-card', el.pause);
        node('h2', 'naf-title', pauseCard, 'Paused');
        el.pauseList = node('div', 'naf-list', pauseCard);

        el.help = node('div', 'naf-overlay naf-help', el.root);
        const helpCard = node('div', 'naf-card', el.help);
        // The title IS the button that reads the page out - it is the first
        // thing in the scan order because it is the first thing on the screen,
        // so choosing what you have just landed on is what starts the reading.
        // A separate "read this to me" button below the text was one more thing
        // to scan past for everyone who did not need it.
        el.helpTitle = node('button', 'naf-title naf-title-btn', helpCard, 'How to Play');
        el.helpTitle.type = 'button';
        el.helpBody = node('div', 'naf-help-body', helpCard);
        // Printed from the same lines that get read aloud - see HELP_LINES.
        el.helpBody.innerHTML = HELP_LINES.map(function (line) {
            return '<p>' + line.replace(/\*(.+?)\*/g, '<b>$1</b>') + '</p>';
        }).join('');
        el.helpList = node('div', 'naf-list', helpCard);

        el.pauseBtn.addEventListener('click', function () {
            if (screen === 'play') openPause();
        });

        // The backdrop and both frames start as the zone the player left off in.
        skinZone(NAF.Zones.current());
        renderStamps();
        return el;
    }

    // --- stamp board -------------------------------------------------------------

    function renderStamps() {
        el.stamps.innerHTML = '';
        const stamps = S().progress().stamps;
        // Newest first, empty slots showing as outlines so there is always
        // something visibly left to fill.
        for (let i = 0; i < STAMP_SLOTS; i++) {
            const slot = node('div', 'naf-stamp', el.stamps);
            const id = stamps[stamps.length - 1 - i];
            if (id) {
                const a = NAF.Animals.byId(id);
                slot.classList.add('filled');
                if (a) {
                    const art = NAF.Animals.artFor(a, 'idle');
                    const img = node('img', '', slot);
                    img.alt = a.name;
                    img.src = (art.kind === 'url') ? art.src : art.src.toDataURL('image/png');
                }
            } else {
                slot.classList.add('empty');
            }
        }
    }

    /**
     * `line` is the NAF.Say.rowComplete() sentence already built and spoken by
     * the caller - not rebuilt here, since that call rotates through a few
     * phrasings on its own counter and calling it twice would skip every
     * other one. Timed the same way the reveal's own caption is: as long as
     * the words take to say, plus a short tail, rather than a fixed guess
     * that could cut a longer phrasing off early or leave a short one
     * hanging around.
     */
    function celebrateRow(line) {
        showBanner(line, NAF.Voice.estimateMs(line) + 500);
    }

    /**
     * Captions QUEUE rather than replace each other.
     *
     * Two of them genuinely overlap in normal play: on the fifth stamp, the
     * filled-board cheer is spoken about 900ms into a reveal, while the
     * reveal's own name-and-fact caption goes up around 1200ms. Whichever
     * called second used to cancel the first outright - which is why the
     * cheer flashed past in a third of a second, and why the fact's own
     * caption could vanish early. Both are also SPOKEN, one after the other,
     * because NAF.Voice queues speech; showing them in the same order for
     * their own individual durations is what keeps the words on screen
     * matching the words being said.
     *
     * Scanning stays suspended across the whole run of them, not just one -
     * an auto-scan tick (or a switch press) moving the highlight, refreshing
     * the choice row, or starting the next round while a fact is still being
     * read is exactly the interruption this is meant to prevent. Restored
     * once the LAST queued caption is done, so nothing has to remember to
     * turn it back on.
     */
    let bannerTimer = null;
    let bannerUntil = 0;
    let bannerQueue = [];
    /**
     * A caption with no timer on it - see stickyBanner. Tracked separately
     * from the queue above because it is deliberately NOT "busy": a timed
     * caption is something the game is in the middle of saying, whereas a
     * sticky one is a question already asked and now just sitting there while
     * the player takes as long as they need.
     */
    let bannerSticky = false;
    let stickyTimer = null;

    /**
     * How much longer captions will be on screen: what is left of the one
     * showing now, plus everything still waiting behind it. The reveal uses
     * this to hold the animal until the reading is actually over rather than
     * retreating on a duration it worked out before the cheer existed.
     */
    function bannerBusyMs() {
        let ms = Math.max(0, bannerUntil - Date.now());
        bannerQueue.forEach(function (q) { ms += q.ms; });
        return ms;
    }

    function paintBanner(text, ms) {
        // A timed caption takes the element over from any sticky question.
        dropSticky();
        el.banner.textContent = text;
        el.banner.classList.add('show');
        NAF.Input.setEnabled(false);
        bannerUntil = Date.now() + ms;
        bannerTimer = setTimeout(function () {
            bannerTimer = null;
            bannerUntil = 0;
            if (bannerQueue.length) {
                const next = bannerQueue.shift();
                paintBanner(next.text, next.ms);
                return;
            }
            el.banner.classList.remove('show');
            NAF.Input.setEnabled(true);
        }, ms);
    }

    function showBanner(text, ms) {
        if (bannerTimer) { bannerQueue.push({ text: text, ms: ms }); return; }
        paintBanner(text, ms);
    }

    /** Forget the sticky state without touching the element or the scanner. */
    function dropSticky() {
        bannerSticky = false;
        if (stickyTimer) { clearTimeout(stickyTimer); stickyTimer = null; }
    }

    /**
     * A question that STAYS on screen until it is answered.
     *
     * Listen and Find asks which animal a clue describes, and the answer is a
     * card the player then has to scan to and choose. A caption that cleared
     * itself after the reading took the question away with it, several presses
     * before the player could act on it - so this one has no timer. Scanning
     * is held only for `pauseMs`, the length of the reading, and released
     * after: the words stay put, the player scans at their own pace, and the
     * caption comes down when they answer (clearSticky, from pickAnimal).
     *
     * `text` may be empty, which holds the scanner for the reading without
     * printing anything - what Show Text off should do.
     */
    function stickyBanner(text, pauseMs) {
        if (bannerTimer) clearTimeout(bannerTimer);
        bannerTimer = null;
        bannerUntil = 0;
        bannerQueue = [];
        dropSticky();

        if (text) {
            bannerSticky = true;
            el.banner.textContent = text;
            el.banner.classList.add('show');
        } else {
            el.banner.classList.remove('show');
        }

        NAF.Input.setEnabled(false);
        stickyTimer = setTimeout(function () {
            stickyTimer = null;
            NAF.Input.setEnabled(true);
        }, Math.max(0, pauseMs || 0));
    }

    /** Take a sticky question down - the player has answered it. */
    function clearSticky() {
        if (!bannerSticky && !stickyTimer) return;
        dropSticky();
        el.banner.classList.remove('show');
        NAF.Input.setEnabled(true);
    }

    /**
     * Drop every caption, shown and queued, and give scanning back. Called
     * when a reveal is cut short: its caption is about to be wrong, and a
     * backlog left behind would keep the scanner switched off long after the
     * thing it was protecting stopped happening.
     */
    function clearBanners() {
        if (bannerTimer) clearTimeout(bannerTimer);
        bannerTimer = null;
        bannerUntil = 0;
        bannerQueue = [];
        dropSticky();
        el.banner.classList.remove('show');
        NAF.Input.setEnabled(true);
    }

    function banner(text, ms) {
        showBanner(text, ms || 2200);
    }

    // --- choice rows -------------------------------------------------------------

    /** Render a row of animals to choose from. Targets are large and well spaced. */
    function showChoices(animals, prompt) {
        el.choices.innerHTML = '';
        el.choices.classList.add('show');
        // The scale for a large pool goes on the inner wrapper, so the backdrop
        // behind it still spans the full width of the screen.
        const inner = node('div', 'naf-choices-inner', el.choices);
        el.choicesInner = inner;
        if (prompt) {
            node('div', 'naf-choice-prompt', inner, prompt);
        }
        // More than four animals go on two EVEN rows rather than one long line.
        // Splitting evenly matters: a 5-and-3 split reads as a mistake.
        const perRow = animals.length > 4 ? Math.ceil(animals.length / 2) : animals.length;

        // The gap is set from here too, so this sum and the CSS can never drift.
        // It tightens on a narrow screen, which is what buys the cards the width
        // they need to stay on one line each.
        const width = el.root.clientWidth || window.innerWidth;
        const gap = width < 520 ? 6 : (width < 760 ? 9 : 12);

        // Container padding plus a margin, so the end cards are not flush against
        // the edges of the screen.
        const avail = width - (width < 520 ? 34 : 60);
        const fits = Math.floor((avail - (perRow - 1) * gap) / perRow);

        // The row must NEVER wrap - a wrapped row is what made the bottom look
        // lopsided on a phone - so the cards shrink to fit instead. The floor is
        // what the hub asks for as a minimum target; below that we simply cannot
        // honour both "even rows" and "big enough to hit", and even rows win
        // because a card you cannot find is worse than one that is a little small.
        // Raised twice now, from an original 52-88: the longest single-word
        // names (Hedgehog, Butterfly, Crocodile) were sitting close enough to
        // the card's own edge to read as off-centre rather than framed, and
        // .naf-choice-name's word-break: keep-all means a card too small for
        // one of these can only be honoured by running past the edge, not by
        // breaking the word. Every card in a row still shares this one size.
        const size = Math.max(80, Math.min(116, fits));

        let rowEl = null;
        animals.forEach(function (a, i) {
            if (i % perRow === 0) {
                rowEl = node('div', 'naf-choice-row', inner);
                rowEl.style.setProperty('--choice-gap', gap + 'px');
                rowEl.style.setProperty('--choice-w', size + 'px');
            }
            const b = button('naf-choice', rowEl);
            b.dataset.animal = a.id;
            const art = NAF.Animals.artFor(a, 'idle');
            const img = node('img', '', b);
            img.alt = '';
            img.src = (art.kind === 'url') ? art.src : art.src.toDataURL('image/png');
            node('span', 'naf-choice-name', b, a.name);
        });
        fitCard();
    }

    function hideChoices() {
        el.choices.classList.remove('show');
        el.choices.innerHTML = '';
    }

    function choiceElements() {
        return Array.prototype.slice.call(el.choices.querySelectorAll('.naf-choice'));
    }

    /** Point back at the target after a wrong pick. No fail state, just a nudge. */
    function pointAt(animalId) {
        choiceElements().forEach(function (b) {
            b.classList.toggle('naf-point', b.dataset.animal === animalId);
        });
        setTimeout(function () {
            choiceElements().forEach(function (b) { b.classList.remove('naf-point'); });
        }, 2400);
    }

    // --- screens -----------------------------------------------------------------

    /**
     * Nothing in this game scrolls and nothing is clipped. The overlay card lays
     * out at its natural size; if the viewport cannot hold it, it is scaled down
     * to fit so every item is still on one page and still selectable.
     *
     * offsetHeight/offsetWidth report the pre-transform layout box, so this is
     * safe to run repeatedly without the scale feeding back into itself.
     */
    /**
     * Scale one box down until it fits its overlay.
     *
     * The scale is reset first and the size read back from getBoundingClientRect,
     * which forces a fresh layout - measuring offsetHeight alone picked up stale
     * numbers while the roof's aspect-ratio was still resolving, and under-scaled.
     * A second pass corrects against what actually painted.
     */
    function fitBox(box, overlay) {
        const availH = overlay.clientHeight - 16;
        const availW = overlay.clientWidth - 16;
        if (availH <= 0 || availW <= 0) return;

        box.style.setProperty('--card-scale', '1');
        const natural = box.getBoundingClientRect();
        if (!natural.height || !natural.width) return;

        let k = Math.min(1, availH / natural.height, availW / natural.width);
        box.style.setProperty('--card-scale', k.toFixed(4));

        const painted = box.getBoundingClientRect();
        if (painted.height > availH + 0.5 || painted.width > availW + 0.5) {
            k *= Math.min(availH / painted.height, availW / painted.width);
            box.style.setProperty('--card-scale', k.toFixed(4));
        }
    }

    let fitRaf = 0;
    function fitCard() {
        cancelAnimationFrame(fitRaf);
        fitRaf = requestAnimationFrame(function () {
            const overlay = el.root.querySelector('.naf-overlay.show');
            if (overlay) {
                // A barn-shaped card scales as one piece, roof included.
                const box = overlay.querySelector('.naf-barnframe') ||
                            overlay.querySelector('.naf-card');
                if (box) fitBox(box, overlay);
            }

            // The choice row grows upward from the bottom. Cap it at a third of
            // the screen so it stays a strip along the bottom rather than a slab
            // over the barn.
            if (el.choicesInner && el.choices.classList.contains('show') && el.choicesInner.offsetHeight) {
                const budget = el.root.clientHeight * 0.36;
                const k = Math.min(1, budget / el.choicesInner.offsetHeight);
                el.choices.style.setProperty('--choices-scale', k.toFixed(4));
            }

            fitStage();
        });
    }

    /**
     * Tell the renderer which horizontal band of the screen is actually free, so
     * it can frame the barn inside it. Whatever the interface takes - the stamp
     * board above, the choice row or the Open the Barn button below - the barn
     * shrinks and shifts to sit clear of it rather than being covered by it.
     */
    function fitStage() {
        const stage = NAF.Game && NAF.Game.stage && NAF.Game.stage();
        if (!stage || !stage.setSafeArea) return;

        const h = el.root.clientHeight;
        let top = 0;
        let bottom = h;
        // How much clear ground to leave under the barn. It depends on WHAT is
        // below it: the Open the Barn button sits right under the doors, which
        // swing wide open and need real room. The choice row only has a line of
        // text under the barn, so the barn can come down close to it and fill
        // the ground rather than leaving a strip of empty grass.
        let bottomMargin = 30;

        if (el.hud.classList.contains('show')) {
            const s = el.stamps.getBoundingClientRect();
            if (s.height) top = s.bottom;
            // Pause sits bottom left normally but moves to the top left on a
            // phone, so which edge it bounds is decided by where it actually is
            // rather than assumed.
            const p = el.pauseBtn.getBoundingClientRect();
            if (p.height) {
                if (p.top + p.height / 2 < h / 2) {
                    if (p.bottom > top) top = p.bottom;
                } else if (p.top < bottom) {
                    bottom = p.top;
                }
            }
        }
        // Measure the choice row from its INNER wrapper: that element carries the
        // scale, so its bounding rect is the space the cards actually occupy. The
        // outer container's layout box ignores the transform and would reserve
        // far more room than the cards really take.
        if (el.choicesInner && el.choices.classList.contains('show')) {
            const r = el.choicesInner.getBoundingClientRect();
            if (r.height && r.top - 12 < bottom) {
                bottom = r.top - 12;
                bottomMargin = 10;
            }
        }
        if (el.openBarn && el.openBarn.classList.contains('show')) {
            const r = el.openBarn.getBoundingClientRect();
            if (r.height && r.top < bottom) {
                bottom = r.top;
                bottomMargin = 30;
            }
        }

        stage.setSafeArea(top, Math.max(top + 80, bottom), h, bottomMargin);
    }

    function show(name) {
        screen = name;
        // Leaving Settings always drops the name panel, so it can never be the
        // thing waiting when the player next opens Settings.
        if (name !== 'settings') nameEditing = false;
        el.menu.classList.toggle('show', name === 'menu');
        el.modes.classList.toggle('show', name === 'modes');
        el.settings.classList.toggle('show', name === 'settings');
        el.pause.classList.toggle('show', name === 'pause');
        el.help.classList.toggle('show', name === 'help');
        el.hud.classList.toggle('show', name === 'play');
        el.openBarn.classList.toggle('show', name === 'play' && NAF.Game.mode() === 'barn');
        el.root.dataset.screen = name;

        // The menu theme plays behind every menu; the zone's own theme takes
        // over the moment the player is actually in the game, so an animal's
        // call is never competing with the menu music, and the two never play
        // together. Stepping between menus does not restart the menu theme -
        // start() on an already-playing loop is a no-op - and returning to the
        // SAME zone's game screen does not restart its theme either.
        if (name === 'play') {
            NAF.Music.stop();
            NAF.GameSong.start(NAF.Zones.current().id);
        } else {
            NAF.GameSong.stop();
            NAF.Music.start();
        }
        el.root.dataset.zone = NAF.Zones.current().id;

        // The open button belongs to whichever zone we are in: a barn, a tank
        // or a gate, named and pictured as such.
        const zw = NAF.Zones.current();
        el.openChip.innerHTML = ICON[zw.icon] || '';
        el.openLabel.textContent = zw.words.openLabel;

        // The friend board belongs to the zone, so it is redrawn on every screen
        // change rather than only when a friend is earned - otherwise walking
        // from the barn into the aquarium leaves a row of barn animals up.
        renderStamps();

        if (name === 'menu') renderMenu();
        if (name === 'modes') renderModes();
        if (name === 'settings') renderSettings();
        if (name === 'pause') renderPause();
        if (name === 'help') renderHelp();

        fitCard();
        NAF.Input.refresh(true);

        // Nothing is highlighted on arrival, so there is no item to read out.
        // The screen announces itself instead - otherwise a player who does not
        // see it gets a silent change and no idea where they are. The play
        // screens are left alone: startMode already speaks their own prompt.
        const arriving = {
            menu: function () { return NAF.Say.greeting(); },
            modes: function () {
                return NAF.Zones.current().name + '. Which way would you like to play?';
            },
            settings: function () { return nameEditing ? null : 'Settings.'; },
            pause: function () { return 'Paused.'; },
            // Says that the directions CAN be read out, rather than reading
            // the whole page at somebody who only wanted to glance at it.
            // Choosing the title is what starts them.
            help: function () {
                return 'How to play. Choose the title to hear the directions.';
            }
        }[name];
        if (arriving) {
            const line = arriving();
            if (line) NAF.Voice.speak(line);
        }
    }

    function current() { return screen; }

    // --- main menu ---------------------------------------------------------------

    /**
     * The main menu is the map. Rather than a Play Game button leading to a
     * separate zone screen, the three places ARE the top three items: one press
     * per zone, no extra level to get lost in. Choosing one sets the zone and
     * goes straight to that zone's ways to play.
     */
    function menuItems() {
        const items = NAF.Zones.list.map(function (z) {
            return {
                id: 'zone:' + z.id,
                zone: z.id,
                label: z.words.visit,
                labelHtml: '<span class="naf-visit">Visit the </span>' + z.name,
                icon: z.icon,
                tone: z.tone,
                speak: z.words.visit + '. ' + z.animals.length + ' animals to meet.'
            };
        });
        return items.concat([
            { id: 'help', label: 'How to Play', icon: 'help', tone: 'teal',
              util: true, speak: 'How to play.' },
            { id: 'settings', label: 'Settings', icon: 'settings', tone: 'plum',
              util: true, speak: 'Settings.' },
            { id: 'exit', label: 'Exit Game', icon: 'exit', tone: 'slate',
              util: true, speak: 'Exit game. Goes back to the hub.' }
        ]);
    }

    /**
     * The three ways to play. The same three everywhere - only the first one's
     * wording changes, because "Open the Barn" is not what you do to a fish
     * tank. Rebuilt per visit so it always names the zone you are standing in.
     */
    function modeItems() {
        const w = NAF.Zones.current().words;
        return [
            { id: 'barn', label: w.openLabel, icon: NAF.Zones.current().icon, tone: 'red',
              speak: w.openSpoken + '. Press to see who comes out.' },
            { id: 'pick', label: 'Pick an Animal', icon: 'animal', tone: 'green',
              speak: 'Pick an animal. Choose who comes out.' },
            { id: 'find', label: 'Listen and Find', icon: 'listen', tone: 'blue',
              speak: 'Listen and find. Hear an animal, then find it. Nothing to lose.' },
            { id: 'back', label: 'Back', icon: 'exit', tone: 'slate',
              speak: 'Back to the main menu.' }
        ];
    }

    function renderMenu() {
        // The barnyard belongs to the player once they have told us their name.
        el.menuSub.textContent = NAF.Say.greeting();
        el.menuList.innerHTML = '';
        el.menuUtil.innerHTML = '';
        menuItems().forEach(function (m) {
            const b = menuButton(m.util ? el.menuUtil : el.menuList,
                m.label, m.icon, m.tone, m.labelHtml);
            b.dataset.menu = m.id;
            if (m.util) b.classList.add('naf-menu-util');
            // The zone you were last in is marked, so coming back to the menu
            // shows where you have been without saying anything.
            if (m.zone && m.zone === NAF.Zones.current().id) b.classList.add('naf-menu-here');
        });
    }

    function menuScannables() {
        return menuItems().map(function (m) {
            return {
                id: 'menu:' + m.id,
                el: el.menuDoors.querySelector('[data-menu="' + m.id + '"]'),
                speak: m.speak,
                // Landing the highlight on a place turns the whole menu into that
                // place - building and background both - before anything is
                // chosen. For a switch user that is the only preview they get:
                // they cannot hover, so the scan itself has to show them where
                // they are pointed. The other three items deliberately have no
                // onFocus, so scanning past How to Play, Settings or Exit leaves
                // whichever place is showing exactly as it is.
                onFocus: m.zone ? function () { NAF.Game.previewZone(m.zone); } : null,
                action: function () {
                    if (m.id === 'exit') return NAF.Game.exit();
                    if (m.id === 'settings') { settingsFrom = 'menu'; return show('settings'); }
                    if (m.id === 'help') return show('help');
                    NAF.Game.enterZone(m.zone);
                }
            };
        });
    }

    /**
     * Dress both barn-shaped screens as a zone. The menu calls this while the
     * highlight only passes over a place; entering one calls it for real.
     * Re-skinning is cheap - a data attribute, a few custom properties and one
     * SVG string - so it is safe to call on every scan tick.
     */
    function skinZone(zone) {
        skinBackdrop(zone);
        skinFrame(el.menuFrame, zone);
        skinFrame(el.modesFrame, zone);
        // fitCard, because the tank's hood and the thatch's fringe are not the
        // same height as the gambrel and the frame has to be re-measured.
        fitCard();
    }

    /**
     * The scenery behind a menu. The overlay covers the 3D canvas, so on a
     * menu screen the stage is not what the player is looking at - but the
     * backdrop should still be the SAME place the game itself shows, not a
     * flat approximation of it.
     *
     * So this draws the menu's sky, hills, dressing and flower bed with
     * js/scenery.js - the very same canvas painters the 3D stage builds its
     * textures from, given the very same zone theme. A hand-written CSS
     * imitation of each zone was the previous approach here and it read as
     * plain next to the real thing, which is exactly what you would expect of
     * a second, separate drawing of the same view: it can only ever
     * approximate, and it drifts the moment a theme changes. NAF.Scenery has
     * no Three.js dependency (it is pure 2D canvas), so a DOM backdrop can
     * use it directly.
     *
     * Cached per zone: these are a handful of canvases each and the menu
     * re-skins on every scan tick as the highlight passes over a place.
     *
     * Set on the root, so every overlay - menu, ways to play, settings, pause,
     * help - shares one backdrop and none of them flashes a different sky.
     */
    const backdropCache = {};
    function backdropFor(zone) {
        if (backdropCache[zone.id]) return backdropCache[zone.id];
        const t = zone.theme;
        const url = function (c) { return 'url("' + c.toDataURL('image/png') + '")'; };
        // Bottom layer last, the way background shorthand stacks: sky behind
        // hills, hills behind the dressing, the flower bed in front of it all.
        const built = {
            bed: url(NAF.Scenery.bed(t)),
            dressing: url(NAF.Scenery.dressing(t)),
            hills: url(NAF.Scenery.hills(t)),
            sky: url(NAF.Scenery.sky(t))
        };
        backdropCache[zone.id] = built;
        return built;
    }

    function skinBackdrop(zone) {
        if (!el.root) return;
        el.root.dataset.zone = zone.id;
        const s = el.root.style;

        // The cloud drifting across every menu is the zone's own cloud colour.
        const bg = zone.theme.menuBg;
        if (bg) s.setProperty('--bg-cloud', bg.cloud);

        let art;
        try {
            art = backdropFor(zone);
        } catch (e) {
            // A backdrop is decoration. If canvas is unavailable the menu must
            // still be usable, so fall back to the flat gradient in style.css
            // rather than leaving the overlay unpainted.
            console.warn('[NAF] Could not draw the menu backdrop:', e);
            return;
        }
        s.setProperty('--bg-sky-art', art.sky);
        s.setProperty('--bg-hills-art', art.hills);
        s.setProperty('--bg-dressing-art', art.dressing);
        s.setProperty('--bg-bed-art', art.bed);
    }

    function renderModes() {
        const zone = NAF.Zones.current();
        skinFrame(el.modesFrame, zone);
        el.modesTitle.textContent = zone.name;
        el.modesSub.textContent = 'Which way would you like to play?';
        el.modesList.innerHTML = '';
        modeItems().forEach(function (m) {
            const b = menuButton(el.modesList, m.label, m.icon, m.tone);
            b.dataset.mode = m.id;
        });
    }

    function modesScannables() {
        return modeItems().map(function (m) {
            return {
                id: 'modes:' + m.id,
                el: el.modesList.querySelector('[data-mode="' + m.id + '"]'),
                speak: m.speak,
                action: function () {
                    if (m.id === 'back') return show('menu');
                    NAF.Game.startMode(m.id);
                }
            };
        });
    }

    // --- pause -------------------------------------------------------------------

    function openPause() {
        NAF.Reveal.cancel();
        show('pause');
    }

    const PAUSE_ITEMS = [
        { label: 'Continue', icon: 'play', tone: 'green' },
        { label: 'Play a Different Game', icon: 'animal', tone: 'blue' },
        { label: 'Settings', icon: 'settings', tone: 'plum' },
        { label: 'How to Play', icon: 'help', tone: 'teal' },
        { label: 'Main Menu', icon: 'home', tone: 'red' },
        { label: 'Exit Game', icon: 'exit', tone: 'slate' }
    ];

    function renderPause() {
        el.pauseList.innerHTML = '';
        PAUSE_ITEMS.forEach(function (m, i) {
            const b = menuButton(el.pauseList, m.label, m.icon, m.tone);
            b.dataset.pause = String(i);
        });
    }

    function pauseScannables() {
        function at(i) { return el.pauseList.querySelector('[data-pause="' + i + '"]'); }
        return [
            { id: 'pause:0', el: at(0), speak: 'Continue playing.', action: function () { show('play'); } },
            { id: 'pause:1', el: at(1),
              speak: 'Play a different game. Choose another way to play.',
              action: function () { NAF.Game.toModes(); } },
            { id: 'pause:2', el: at(2), speak: 'Settings.', action: function () { settingsFrom = 'pause'; show('settings'); } },
            // The same How to Play screen the main menu opens, with the printed
            // directions and the read-aloud title. Its Back comes here rather
            // than to the main menu while a game is running - see
            // helpScannables - so the player lands back where they left off.
            { id: 'pause:3', el: at(3), speak: 'How to play.', action: function () { show('help'); } },
            { id: 'pause:4', el: at(4), speak: 'Main menu.', action: function () { NAF.Game.toMenu(); } },
            { id: 'pause:5', el: at(5), speak: 'Exit game. Goes back to the hub.', action: function () { NAF.Game.exit(); } }
        ];
    }

    // --- help --------------------------------------------------------------------

    /**
     * Read a run of lines out, and hold the scanner still while it happens.
     *
     * The hold is the point. Every OTHER spoken line in this game is short
     * enough to finish between two scan ticks; this one is nine sentences, and
     * with auto scan on the highlight would move a couple of seconds in,
     * announce whatever it landed on, and cancel the reading - the player would
     * hear the first sentence and a half of the directions, every time.
     *
     * But it is a hold, not a lock: any press stops the reading and gives the
     * scanner straight back, so "press to skip" works and nobody is stuck
     * listening to the whole thing. Held for the estimated length of the
     * speech, since the shared voice manager has no way to tell us it finished
     * (see NAF.Voice.busyMs).
     */
    function readAloud(lines) {
        // The first line clears anything already queued; the rest line up
        // behind it so they are read in order rather than cancelling it.
        lines.forEach(function (line, i) {
            NAF.Voice.speak(line.replace(/\*/g, ''), { interrupt: i === 0 });
        });

        let released = false;
        function release() {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            NAF.Input.setEnabled(true);
        }
        function onPress() {
            NAF.Voice.cancel();
            release();
        }

        NAF.Input.setEnabled(false);
        const timer = setTimeout(release, NAF.Voice.busyMs() + 400);
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }

    function renderHelp() {
        el.helpList.innerHTML = '';
        const b = menuButton(el.helpList, 'Back', 'exit', 'slate');
        b.dataset.help = 'back';
    }

    function helpScannables() {
        return [
            {
                // The title, at the top of the screen - see build().
                id: 'help:read',
                el: el.helpTitle,
                speak: 'How to play. Choose this to hear the directions.',
                action: function () { readAloud(HELP_LINES); }
            },
            {
                id: 'help:back',
                el: el.helpList.querySelector('[data-help="back"]'),
                speak: 'Back.',
                action: function () {
                    // Leaving mid-reading stops it, rather than talking over
                    // whatever the next screen announces.
                    NAF.Voice.cancel();
                    show(NAF.Game.started() ? 'pause' : 'menu');
                }
            }
        ];
    }

    // --- settings ----------------------------------------------------------------
    //
    // One page, in the hub's canonical order, short enough for a single scan pass.
    // The game's finer tuning - phrasing, timings, which animals are in the barn,
    // per-sound options - stays at the defaults in settings.js rather than on
    // screen, so nothing sits between the player and the game.

    let settingsCache = [];

    /**
     * Every row is described here as data. `speak` says what the option MEANS,
     * not just its value, because the person changing it is often a caregiver
     * setting the game up for somebody else.
     */
    function settingsItems() {
        const s = S();

        return [
            {
                label: 'Speaking', value: onOff(ttsOn()),
                speak: function () {
                    return ttsOn() ? 'Speaking on. Everything is read aloud.' : 'Speaking off.';
                },
                action: function () {
                    try { window.NarbeVoiceManager.toggleTTS(); } catch (e) { /* no voice manager */ }
                }
            },
            {
                // Separate from Speaking above on purpose - see showCaptions in
                // settings.js. Turning this off leaves the voice reading
                // everything out as before, with nothing printed over the
                // animal.
                label: 'Show Text', value: onOff(s.get('showCaptions')),
                speak: function () {
                    return s.get('showCaptions')
                        ? 'Show text on. What is spoken is also written on the screen.'
                        : 'Show text off. Everything is still read aloud.';
                },
                action: function () { s.toggle('showCaptions'); }
            },
            {
                label: 'Voice', value: voiceName(),
                speak: function () { return 'Voice. ' + voiceName() + '. This is the voice you will hear.'; },
                action: function () {
                    try { window.NarbeVoiceManager.cycleVoice(); } catch (e) { /* no voice manager */ }
                }
            },
            {
                label: 'Player Name', value: s.get('playerName') || 'Not set',
                speak: function () {
                    const n = s.get('playerName');
                    return n
                        ? ('Player name. ' + n + '. The game says your name while you play.')
                        : 'Player name. Someone else can type a name here, and the game will use it while you play.';
                },
                action: openNameEditor
            },
            {
                label: 'Auto Scan', value: autoScanOn() ? 'On — One Switch' : 'Off — Two Switches',
                speak: function () {
                    return autoScanOn()
                        ? 'Auto scan on. One switch. The highlight moves by itself and Enter chooses.'
                        : 'Auto scan off. Two switches. Space moves the highlight, Enter chooses.';
                },
                action: function () {
                    try { window.NarbeScanManager.toggleAutoScan(); } catch (e) { /* no scan manager */ }
                    NAF.Input.restartAutoScan();
                }
            },
            {
                label: 'Scan Speed', value: scanSpeedLabel(),
                speak: function () { return 'Scan speed ' + scanSpeedLabel() + '. How long you have to press.'; },
                action: function () {
                    try { window.NarbeScanManager.cycleScanSpeed(); } catch (e) { /* no scan manager */ }
                    NAF.Input.restartAutoScan();
                }
            },
            {
                // The two highlight settings sit next to each other and next to
                // Scan Speed: everything about "how do I see and move the
                // highlight" is in one run of the list rather than scattered.
                label: 'Highlight Style',
                value: s.get('highlightStyle') === 'full' ? 'Block' : 'Bold Band',
                speak: function () {
                    return s.get('highlightStyle') === 'full'
                        ? 'Highlight style, block. The whole button fills with colour.'
                        : 'Highlight style, bold band. A thick band is drawn around the button.';
                },
                action: function () {
                    s.set('highlightStyle', s.get('highlightStyle') === 'full' ? 'outline' : 'full');
                }
            },
            {
                label: 'Highlight Color', value: s.highlightColorName(),
                speak: function () {
                    return 'Highlight color, ' + s.highlightColorName() +
                        '. This is the colour that shows you where you are.';
                },
                action: function () {
                    s.cycle('highlightColorIndex', s.HIGHLIGHT_COLORS.length);
                }
            },
            {
                // Only the animals' recordings. It does NOT touch the music
                // (that has its own row, below) and it does not touch the
                // doors, footsteps or blips - see animalSounds in settings.js.
                // Nothing else needs refreshing: the next reveal simply asks
                // again before it plays.
                label: 'Animal Sounds', value: onOff(s.get('animalSounds')),
                speak: function () {
                    return s.get('animalSounds')
                        ? 'Animal sounds on. You hear each animal when it comes out.'
                        : 'Animal sounds off. The animal\'s sound is spoken instead.';
                },
                action: function () { s.toggle('animalSounds'); }
            },
            {
                label: 'Music', value: onOff(s.get('musicEnabled')),
                speak: function () {
                    return s.get('musicEnabled')
                        ? 'Music on. It plays quietly behind the menus and while you play.'
                        : 'Music off.';
                },
                action: function () {
                    s.toggle('musicEnabled');
                    NAF.Music.refresh();
                    NAF.GameSong.refresh();
                }
            },
            {
                label: '← Back', value: '', nav: true,
                speak: 'Back.',
                action: function () { show(settingsFrom === 'pause' ? 'pause' : 'menu'); }
            }
        ];
    }

    function renderSettings() {
        settingsCache = settingsItems();
        el.settingsTitle.textContent = nameEditing ? 'Player Name' : 'Settings';
        el.settingsList.innerHTML = '';
        if (nameEditing) {
            renderNameEditor();
            fitCard();
            return;
        }
        settingsCache.forEach(function (item, i) {
            const b = row(el.settingsList, item.label, item.value);
            b.dataset.setting = String(i);
        });
        fitCard();
    }

    // --- player name -------------------------------------------------------------
    //
    // An on-screen keyboard, laid out and worded the way the hub's own keyboard
    // tools are - letters in ABC order rather than QWERTY, a Space key, a single
    // Backspace, and the same row-then-key drill-down every other scannable
    // keyboard in the hub uses: scan across whole ROWS first, choose one, then
    // scan across just the KEYS in it. A flat sweep of all 38 keys one at a time
    // was a special case found nowhere else in the hub, and a slower one.
    //
    // The hub's own keyboard tool drives that drill-down with its own
    // document-level Space/Enter listeners and a hold-to-escape gesture, which
    // would both fight NAF.Input's if this game loaded it as-is and which
    // ACCESSIBILITY.md section 12 asks new games to avoid (a hold gesture as the
    // only way out of somewhere is a locked door for a player who cannot sustain
    // a press). So the two levels are built the same way every other screen in
    // this game already is - as two different scan lists from
    // nameEditorScannables(), the row list while nameKbMode is 'rows' and one
    // row's keys while it is 'keys'. "Back to rows" is an invisible stop at
    // the end of a row's own keys rather than a visible button: since the
    // scan list wraps, that one stop is also what scanning backwards from
    // the row's first key lands on, so it reads as a deadzone bracketing the
    // row on both sides rather than a key of its own. It has no element to
    // highlight (see nameEditorScannables) but is still spoken, so a switch
    // user always knows where they landed even with nothing lit up. Same
    // input model as the rest of this game either way - Enter chooses
    // whatever is currently highlighted, deadzone included.
    //
    // Handled the way ACCESSIBILITY.md section 7 asks regardless: it is SPOKEN
    // the moment it opens, the scan is trapped inside it, and the safe way out
    // (Done) is always reachable - it is the LAST item in the ROW scan order,
    // which in a list that wraps means it is one scan backwards from the
    // opening position. It is not a one-way door, and a switch user who lands
    // here by a mis-scan simply leaves the name as it was.
    //
    // The text field is read-only and never takes focus (see renderNameEditor)
    // - it shows the name being spelled, it does not take one. A real keyboard
    // typing straight into it would let a name be entered without ever
    // touching the scannable keys, which is exactly the route around scanning
    // this is trying to close. Every letter comes from a key: reached by
    // scanning to its row and then to it, or - for a caregiver with a mouse or
    // a touchscreen - typed by tapping the key itself, which is the one place
    // in the game where a pointer does NOT mean "select the highlighted thing"
    // (see the listener in renderNameEditor for why).

    /** ABC order, not QWERTY - matching the hub's own keyboard tools. */
    const NAME_KEY_ROWS = [
        ['A', 'B', 'C', 'D', 'E', 'F'],
        ['G', 'H', 'I', 'J', 'K', 'L'],
        ['M', 'N', 'O', 'P', 'Q', 'R'],
        ['S', 'T', 'U', 'V', 'W', 'X'],
        ['Y', 'Z', '0', '1', '2', '3'],
        ['4', '5', '6', '7', '8', '9']
    ];

    function openNameEditor() {
        nameEditing = true;
        nameKbMode = 'rows';
        nameKbRow = 0;
        renderSettings();
        NAF.Input.refresh(true);
        NAF.Voice.speak('Player name. Scan to a row and choose it, then scan to a letter ' +
            'in that row and choose it to spell your name. Choose Done at any time to keep it.');
    }

    function renderNameEditor() {
        const wrap = node('div', 'naf-name-editor', el.settingsList);
        node('p', 'naf-name-note', wrap,
            'Scan to a row and choose it, then scan to a letter and choose it to spell ' +
            'your name. Someone else can also choose letters with a touchscreen or a ' +
            'mouse. Choose Done to keep it.');

        // Read-only: this shows the name being spelled, it does not take one.
        // A real keyboard typing straight into it would skip the on-screen
        // keys entirely - every letter has to come from scanning to a key or
        // touching/clicking one, same as everything else in this game.
        const input = node('input', 'naf-name-input', wrap);
        input.type = 'text';
        input.maxLength = 20;
        input.value = S().get('playerName') || '';
        input.placeholder = 'Spell a name below';
        input.readOnly = true;
        input.tabIndex = -1;
        input.setAttribute('aria-label', 'Player name');
        el.nameInput = input;

        // The on-screen keyboard: one .naf-key-row per row, each independently
        // scannable as a whole before its keys are - see nameEditorScannables
        // for how "back to rows" is reached from inside one without a visible
        // button of its own.
        const kb = node('div', 'naf-keyboard', wrap);
        el.nameKbEl = kb;

        // A tap or click on a KEY types that key, in either mode, and nothing
        // else - it never chooses the row the key sits in, and it never moves
        // the switch user's highlight or drills in and back out of a row.
        //
        // This has to be its own capture-phase listener rather than leaning on
        // NAF.Input's generic click wiring, because that wiring selects the
        // scannable an element belongs to. While the scan is on ROWS the
        // scannable containing a letter IS its row, so a caregiver clicking "K"
        // was choosing row G-L instead of typing anything. Choosing a row is
        // what Space and Enter are for; a pointer is pointing AT a letter and
        // means that letter. Capturing on the way down and stopping the event
        // there is what keeps it from reaching either the row's click handler
        // or the key's own one in 'keys' mode.
        //
        // A click that lands on the padding BETWEEN keys is not on a key, so it
        // falls through and behaves as it always did.
        kb.addEventListener('click', function (e) {
            const key = e.target && e.target.closest ? e.target.closest('.naf-key') : null;
            if (!key || !kb.contains(key)) return;
            e.preventDefault();
            e.stopPropagation();
            typeNameKey(key.dataset.key);
        }, true);

        NAME_KEY_ROWS.forEach(function (row, ri) {
            const rowEl = node('div', 'naf-key-row', kb);
            rowEl.dataset.row = String(ri);
            row.forEach(function (k) {
                const key = node('button', 'naf-key', rowEl, k);
                key.type = 'button';
                key.dataset.key = k;
            });
        });
        const ctrlRow = node('div', 'naf-key-row naf-key-row-ctrl', kb);
        ctrlRow.dataset.row = 'ctrl';
        const space = node('button', 'naf-key naf-key-wide', ctrlRow, 'Space');
        space.type = 'button';
        space.dataset.key = 'Space';
        const back = node('button', 'naf-key naf-key-wide', ctrlRow, '⌫ Backspace');
        back.type = 'button';
        back.dataset.key = 'Backspace';

        const done = menuButton(wrap, 'Done', 'check', 'green');
        done.dataset.name = 'done';
        const clear = menuButton(wrap, 'Clear the Name', 'cross', 'slate');
        clear.dataset.name = 'clear';
    }

    function closeNameEditor() {
        nameEditing = false;
        nameKbMode = 'rows';
        el.nameInput = null;
        renderSettings();
        NAF.Input.refresh(true);
        NAF.Voice.speak('Settings.');
    }

    /** The rows of the name keyboard, in on-screen order - the alphabet/digit
     *  rows, then the Space/Backspace row, matching NAME_KEY_ROWS plus one. */
    function nameKbRowEls() {
        return el.nameKbEl ? Array.prototype.slice.call(el.nameKbEl.querySelectorAll('.naf-key-row')) : [];
    }

    /**
     * The spoken label for one row: every key in it, in order.
     *
     * "A, B, C, D, E, F" rather than "A through F". A player scanning rows is
     * deciding which row to drill into, and that decision needs the letters
     * themselves - "A through F" makes them work out the middle four on their
     * own, which is exactly the wrong thing to ask of someone who cannot see
     * the screen. The commas matter too: they are where the voice draws
     * breath, so the letters come out as six separate letters rather than as
     * one run-together word.
     *
     * The two-key row keeps "Space and Backspace", which is how anyone would
     * actually say it.
     */
    function nameKbRowLabel(rowEl) {
        const keys = Array.prototype.slice.call(rowEl.querySelectorAll('.naf-key'))
            .map(function (b) { return b.dataset.key; });
        if (keys.length > 2) return keys.join(', ');
        return keys.join(' and ');
    }

    /**
     * Type one key into the name field. Mutates el.nameInput.value directly
     * rather than re-rendering, so pressing a letter never rebuilds the
     * keyboard under the player's highlight - only the text on screen changes.
     *
     * Capitalises the first letter of the name and of each new word, the same
     * rule the hub's keyboard tool uses, so a typed name looks like a name
     * without needing a Shift key.
     */
    function typeNameKey(k) {
        if (!el.nameInput) return;
        let v = el.nameInput.value || '';
        if (k === 'Backspace') {
            v = v.slice(0, -1);
        } else if (k === 'Space') {
            if (v.length < 20 && v.length > 0) v += ' ';
        } else if (v.length < 20) {
            const prev = v.slice(-1);
            const upper = !prev || prev === ' ';
            v += upper ? k.toUpperCase() : k.toLowerCase();
        }
        el.nameInput.value = v;
        NAF.Audio.play('blip', 0.5);
    }

    /**
     * Leave 'keys' mode and land back on the row just used, in the ROWS list -
     * the same "stay where you were" behaviour typing a letter falls back to in
     * the hub's own keyboard tool.
     *
     * The rows ARE the start of that list (see nameEditorScannables), so a
     * row's index in it is its own index. This used to be `2 + nameKbRow`,
     * back when Done and Clear came first.
     */
    function backToNameKbRows() {
        nameKbMode = 'rows';
        NAF.Input.refresh(false);
        NAF.Input.setIndex(nameKbRow);
        NAF.Input.speakFocused();
    }

    function nameEditorScannables() {
        if (nameKbMode === 'keys') {
            const rowEl = nameKbRowEls()[nameKbRow];
            const list = [];
            if (rowEl) {
                Array.prototype.slice.call(rowEl.querySelectorAll('.naf-key')).forEach(function (btn) {
                    const k = btn.dataset.key;
                    list.push({
                        id: 'name:key:' + k,
                        el: btn,
                        speak: k === 'Space' ? 'Space' : (k === 'Backspace' ? 'Backspace' : k),
                        action: function () {
                            typeNameKey(k);
                            backToNameKbRows();
                        }
                    });
                });
            }
            // An invisible stop at the end of the row's own keys, with no
            // button of its own (no `el`, so nothing is highlighted here -
            // NAF.Input's paint() only ever lights up an item that HAS one).
            // In a list that wraps, one stop placed after the last key is
            // also the very thing scanned BACKWARDS from the first key, so
            // this single entry serves as the "before the first key" and
            // "after the last key" deadzone both. Choosing it (Enter) is the
            // way back to row scanning, spoken so a switch user still knows
            // where they landed even though nothing lit up.
            list.push({
                id: 'name:deadzone',
                el: null,
                speak: 'Back to rows.',
                action: backToNameKbRows
            });
            return list;
        }

        // 'rows' mode: the KEY ROWS FIRST, top row first, so the very first
        // scan lands on A, B, C, D, E, F.
        //
        // Done and Clear used to lead this list, on the reasoning that a
        // mis-scan into the keyboard should land on something safe. In practice
        // that reasoning had it backwards: spelling a name is the only thing
        // this screen is for, so leading with two things that are NOT spelling
        // put two stops in front of every single letter anyone ever typed.
        // They sit at the end instead - still one scan away by going
        // backwards, since the list wraps.
        const list = [];
        nameKbRowEls().forEach(function (rowEl, ri) {
            list.push({
                id: 'name:row:' + ri,
                el: rowEl,
                speak: 'Row: ' + nameKbRowLabel(rowEl) + '.',
                action: function () {
                    nameKbMode = 'keys';
                    nameKbRow = ri;
                    NAF.Input.refresh(false);
                    NAF.Input.setIndex(0);
                    NAF.Input.speakFocused();
                }
            });
        });
        list.push({
            id: 'name:done',
            el: el.settingsList.querySelector('[data-name="done"]'),
            speak: 'Done. Keeps the name and goes back.',
            action: function () {
                if (el.nameInput) S().set('playerName', el.nameInput.value.trim().slice(0, 20));
                const n = S().get('playerName');
                closeNameEditor();
                if (n) NAF.Voice.speak('Hello ' + n + '!');
            }
        });
        list.push({
            id: 'name:clear',
            el: el.settingsList.querySelector('[data-name="clear"]'),
            speak: 'Clear the name.',
            action: function () {
                S().set('playerName', '');
                if (el.nameInput) el.nameInput.value = '';
                NAF.Voice.speak('Name cleared.');
            }
        });
        return list;
    }

    function settingsScannables() {
        if (nameEditing) return nameEditorScannables();
        return settingsCache.map(function (item, i) {
            return {
                id: 'set:' + i,
                el: el.settingsList.querySelector('[data-setting="' + i + '"]'),
                speak: item.speak,
                action: function () {
                    item.action();
                    if (item.nav || nameEditing) return;        // already repainted
                    if (!el.settings.classList.contains('show')) return;
                    // Re-render and stay on the same row, so the player hears the
                    // new value without losing their place.
                    renderSettings();
                    NAF.Input.refresh(false);
                    NAF.Input.setIndex(Math.min(i, settingsCache.length - 1));
                    NAF.Input.speakFocused();
                }
            };
        });
    }

    // --- in-game scan list --------------------------------------------------------

    function playScannables() {
        const list = [];
        const mode = NAF.Game.mode();

        // These two start something that takes time to play out, so they are
        // gated on whether it is still playing rather than on a fixed delay:
        // once pressed, they cannot be pressed again until the barn has finished
        // its business. The short cooldown on top only covers the moment right
        // after it ends, so a bounce cannot immediately restart it.
        const stillRunning = function () { return NAF.Game.isBusy(); };

        if (mode === 'barn') {
            list.push({
                id: 'play:barn',
                el: el.openBarn,
                cooldown: 500,
                busy: stillRunning,
                speak: function () { return NAF.Say.barnPrompt(); },
                action: function () { NAF.Game.pressBarn(); }
            });
        } else {
            choiceElements().forEach(function (b) {
                const a = NAF.Animals.byId(b.dataset.animal);
                list.push({
                    id: 'play:choice:' + b.dataset.animal,
                    el: b,
                    cooldown: 500,
                    busy: stillRunning,
                    speak: function () { return a ? a.name : ''; },
                    action: function () { NAF.Game.pickAnimal(a); }
                });
            });
        }

        // Pause is always in the scan cycle, and always last, so the thing the
        // player came here to do is the first thing the highlight reaches.
        //
        // Just the word. Most rows in this game explain what an option MEANS,
        // because a caregiver is often the one setting it up - but this one is
        // passed on the way to something else, over and over, and a sentence
        // read out every time the highlight goes by is noise standing between
        // the player and the animal. Pause needs no explaining.
        list.push({
            id: 'play:pause',
            el: el.pauseBtn,
            speak: 'Pause.',
            action: openPause
        });
        return list;
    }

    // --- the provider -------------------------------------------------------------

    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'modes': return modesScannables();
            case 'settings': return settingsScannables();
            case 'pause': return pauseScannables();
            case 'help': return helpScannables();
            case 'play': return playScannables();
            default: return [];
        }
    }

    function applyChrome() {
        el.root.classList.toggle('naf-no-hints', !S().get('grownUpPrompts'));
    }

    return {
        build: build,
        show: show,
        current: current,
        scannables: scannables,
        renderStamps: renderStamps,
        skinZone: skinZone,
        celebrateRow: celebrateRow,
        banner: banner,
        stickyBanner: stickyBanner,
        clearSticky: clearSticky,
        bannerBusyMs: bannerBusyMs,
        clearBanners: clearBanners,
        showChoices: showChoices,
        hideChoices: hideChoices,
        pointAt: pointAt,
        openPause: openPause,
        applyChrome: applyChrome,
        fit: fitCard,
        stageEl: function () { return el.stage; }
    };
})();
