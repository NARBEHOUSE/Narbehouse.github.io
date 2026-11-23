/**
 * NARBE Space Explorer - the game: what each choice does, and what the world
 * tells the player.
 *
 * Flow: main menu -> flying (the ship flies itself; steer or choose Next
 * Stop) -> "Do you want to go here?" -> glide into orbit -> orbit (Fly Low,
 * Scan, Visit a Moon, View, Leave Orbit) -> fly on. Warp (from the galaxy
 * map) jumps to a new star or galaxy. Everything visited is written in the
 * logbook, with a picture, and can be visited again.
 *
 * No score, no timer, no fail state. The world waits while paused, while the
 * galaxy map is open and while a menu covers the screen.
 */

window.NSE = window.NSE || {};

NSE.Game = (function () {
    'use strict';

    const U = NSE.Util;
    const UV = NSE.Universe;
    const STATE_KEY = 'nse-state-v1';

    let flight = null;
    let mode = 'menu';             // menu | fly | glide | orbit | low | warp | galaxy | enter | exit
    let target = null;             // the object orbited (or being glided to)
    let surface = null;            // the Fly Low world
    let surfaceShip = null;
    let pauseFrom = 'fly';
    let pendingPrompt = null;
    let hailT = -1, hailDone = false, talkingUntil = 0;
    let snapWait = null;
    let warp = null;
    let saveT = 0, musicT = 0, hudT = 0;
    let hinted = false;
    let scanFrom = 'orbit';
    let scanList = null;
    let trans = null;              // going down into an atmosphere (enter) or back up (exit)
    let heading = null;            // words for where a long glide is going ("the Zeon system")
    let exploreList = null;        // what Explore System offers (the worlds here, or nearby stars)
    let gflow = null;              // a new galaxy seen from outside: reveal, look, dive

    function S() { return NSE.Settings; }
    function UI() { return NSE.UI; }
    function st() { return flight.state; }
    function galaxy() { return UV.galaxy(st().galaxy); }

    // --- saving where you are --------------------------------------------------------------------

    function loadState() {
        try { const raw = localStorage.getItem(STATE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function saveState() {
        try {
            const s = st();
            // In orbit or gliding, save a point just outside, facing away (you set off from there next time).
            let pos = s.pos, yaw = s.yaw, pitch = s.pitch;
            if (s.mode !== 'fly' && target) {
                const c = flight.centreOf(target);
                const d = flight._vec.norm(flight._vec.sub(s.pos, c));
                pos = flight._vec.add(c, flight._vec.mul(d, flight.orbitRadius(target) + (target.trigger || 60) + 80));
                const a = NSE.Flight.anglesOf(d);
                yaw = a.yaw; pitch = 0;
            }
            localStorage.setItem(STATE_KEY, JSON.stringify({ galaxy: s.galaxy, pos: pos, yaw: yaw, pitch: pitch }));
        } catch (e) { /* storage unavailable */ }
    }

    // --- words --------------------------------------------------------------------------------------

    function kindWord(o) {
        if (o.kind === 'star') return o.special === 'blackhole' ? 'A black hole!' : o.special === 'nebula' ? 'A star in a nebula!' : o.pair ? 'Two stars!' : 'A star!';
        return o.world.rings ? 'A planet with rings!' : 'A planet!';
    }

    function factsLine(w) {
        if (!S().get('facts')) return '';
        return UV.facts(w).map(f => f.say).join(' ');
    }

    function starFacts(o) {
        const s = o.star;
        if (o.special === 'blackhole') return ['Nothing escapes a black hole, not even light.', 'The glowing disk around it is hot gas, spinning very fast.'];
        const lines = [];
        if (o.pair) lines.push('Two stars that circle each other: ' + o.sys.stars[0].label + ' and ' + o.sys.stars[1].label + '.');
        lines.push('Its surface is about ' + s.temperature.toLocaleString('en-US') + ' degrees.');
        lines.push({ yellow: 'Stars like this one can warm planets where life can grow.', orange: 'Orange stars shine steadily for a very long time.', red: 'Red dwarfs are small and cool, and the most common stars of all.', blue: 'Blue giants are huge, bright and very hot.', white: 'A white dwarf is the tiny, glowing core left behind by an old star.' }[s.type] || '');
        if (o.special === 'nebula') lines.push('The nebula around it is a cloud of glowing gas where new stars are born.');
        lines.push(o.sys.planets.length ? 'It has ' + U.plural(o.sys.planets.length, 'planet') + '.' : 'No planets go round it.');
        return lines.filter(Boolean);
    }

    // --- HUD and marker ---------------------------------------------------------------------------------

    function hudState() {
        const s = st();
        const g = galaxy();
        const sp = 'Speed: ' + S().speedName();
        if (mode === 'orbit' && target) {
            const w = target.world;
            return {
                title: 'Orbiting ' + target.name,
                sub: target.kind === 'star' ? target.short : w.short + (w.moons && w.moons.length ? ' · ' + U.plural(w.moons.length, 'moon') : ''),
                canFlyLow: target.kind !== 'star',
                moonLabel: moonLabel()
            };
        }
        if (mode === 'low' && target) return { title: 'Flying low over ' + target.name, sub: target.short };
        if (mode === 'glide') return { title: target ? 'Heading for ' + target.name : heading ? 'Flying to ' + heading : 'Flying on', sub: 'The ship is flying itself' };
        if (mode === 'warp') return { title: 'Warp!', sub: '' };
        if (mode === 'galaxy') return { title: 'The ' + g.name + ' Galaxy', sub: '' };
        if (mode === 'enter' && target) return { title: 'Flying down to ' + target.name, sub: 'Into the atmosphere' };
        if (mode === 'exit' && target) return { title: 'Climbing back to orbit', sub: target.name };
        return { title: s.system ? s.system.name + ' system' : 'Deep space', sub: 'The ' + g.name + ' Galaxy · ' + sp, inSystem: !!s.system };
    }

    function moonLabel() {
        if (!target || target.kind === 'star') return null;
        if (target.kind === 'moon') return 'Back to ' + target.parentWorld.name;
        const m = target.world.moons;
        if (!m.length) return null;
        return m.length === 1 ? 'Visit ' + m[0].name : 'Visit a Moon';
    }

    function marker() {
        const s = st();
        if (s.prompting) return { pos: s.prompting.pos, name: s.prompting.name, tone: 'ask' };
        if (s.autopilot && mode === 'fly') return { pos: s.autopilot.pos, name: s.autopilot.name, tone: 'go' };
        return null;
    }

    // --- music -------------------------------------------------------------------------------------------

    function pickMusic() {
        if (mode === 'menu') return 'amb-menu';
        if (mode === 'low') return 'amb-surface';
        const sys = st().system;
        if (!sys) return 'amb-deep';
        if (sys.kind === 'binary' || sys.kind === 'nebula' || sys.kind === 'blackhole') return 'amb-' + sys.kind;
        return 'amb-' + sys.stars[0].type;
    }

    // --- starting ------------------------------------------------------------------------------------------

    function hasSave() { return !!loadState(); }

    function startExploring() {
        NSE.Stage.setMenu(false);
        flight.setHeld(false);
        mode = st().mode === 'orbit' ? 'orbit' : st().mode === 'travel' ? 'glide' : 'fly';
        if (mode === 'orbit') { UI().show('orbit', { line: 'Orbiting ' + target.name + '.' }); return; }
        if (mode === 'glide') { UI().show('glide', { line: target ? 'Heading for ' + target.name + '.' : 'Flying on.' }); return; }
        const sys = st().system;
        let line = 'Flying through the ' + galaxy().name + ' Galaxy.' + (sys ? ' The ' + sys.name + ' system is close by.' : '');
        if (!hinted) { line += ' Choose Next Stop to head for somewhere new.'; hinted = true; }
        UI().show('fly', { line: line });
    }

    // --- flying ------------------------------------------------------------------------------------------

    function nextStop() {
        const o = flight.nextStop();
        if (!o) { NSE.Input.announce('Nothing close by. Try Warp.'); return; }
        NSE.Input.announce('Heading for ' + o.name + ', ' + (o.kind === 'star' ? o.label : 'a planet') + '.');
    }

    function turn(dir) {
        flight.turn(dir);
        NSE.Sound.play('thrust', 0.7);
        NSE.Input.announce(dir > 0 ? 'Turning left.' : 'Turning right.');
    }

    function climb(dir) {
        if (!flight.climb(dir)) { NSE.Input.announce(dir > 0 ? 'Can’t go up any more.' : 'Can’t go down any more.'); return; }
        NSE.Sound.play('thrust', 0.7);
        NSE.Input.announce(dir > 0 ? 'Going up.' : 'Going down.');
    }

    function setSpeedIndex(i) {
        S().set('speedIndex', i);
        flight.setSpeed(S().speed());
    }

    function speed(dir) {
        const i = S().get('speedIndex'), n = S().SPEEDS.length;
        const j = U.clamp(i + dir, 0, n - 1);
        if (j === i) { NSE.Input.announce(dir > 0 ? 'Already the fastest.' : 'Already the slowest.'); return; }
        setSpeedIndex(j);
        NSE.Sound.play(dir > 0 ? 'faster' : 'slower', 0.7);
        NSE.Input.announce('Speed, ' + S().speedName() + '.');
        UI().refreshHUD();
    }

    const VIEWS = ['cockpit', 'chase', 'wide'];
    function switchView() {
        const v = VIEWS[(VIEWS.indexOf(NSE.Stage.view()) + 1) % VIEWS.length];
        S().set('viewChosen', true);
        S().set('view', v);
        NSE.Stage.setView(v);
        UI().refreshHUD();
        NSE.Input.announce({ cockpit: 'Cockpit view. From the pilot’s seat.', chase: 'Chase view. Behind the ship.', wide: 'Wide view. For sightseeing.' }[v]);
    }

    // --- Explore System / Nearby Stars, and Steer ------------------------------------------------------

    /**
     * Pick a world here (or a nearby star system) instead of steering to it. No menu card: the
     * camera rises up over the whole system and each world lights up where it is as the scan
     * reaches it (the user's idea). The ship waits meanwhile.
     */
    function explore() {
        const s = st();
        flight.setHeld(true);
        if (s.system) {
            exploreList = { mode: 'worlds', sys: s.system, objs: UV.objectsOf(s.system) };
        } else {
            const near = UV.systemsNear(s.galaxy, s.pos, 2).slice(0, 6).map(function (sys) {
                const d = UV.dist(sys.pos, s.pos) - sys.radius;
                return { sys: sys, far: d < 7000 ? 'close by' : d < 13000 ? 'a short trip' : 'further away' };
            });
            exploreList = { mode: 'stars', list: near };
        }
        openSurvey();
    }

    /**
     * What the shot over the system must fit in: every world where it is drawn there (orbits spread
     * a little like a diagram, NSE.Universe.surveySpread) and the whole outermost orbit; the ship
     * too when it is among the planets. Or, in deep space, the nearby stars round the ship.
     */
    function surveyPlan(list) {
        const s = st();
        const f = NSE.Flight.forwardOf(s.yaw, s.pitch);
        const back = { x: -f.x, y: 0, z: -f.z };
        if (list.mode === 'stars') {
            return { centre: s.pos, from: s.pos, withShip: true, back: back, pitch: 0.95, fov: 50, points: list.list.map(it => ({ x: it.sys.pos.x, y: it.sys.pos.y, z: it.sys.pos.z, r: 0 })) };
        }
        const sys = list.sys, spread = UV.surveySpread(sys), c = sys.pos;
        const pts = list.objs.map(function (o) {
            const r = o.kind === 'star' ? (o.special === 'blackhole' ? o.sys.disk.outer : o.radius * 1.4) : (o.world.rings ? o.world.rings.outer : o.radius);
            const k = o.kind === 'planet' ? spread[o.id] || 1 : 1;
            return { x: c.x + (o.pos.x - c.x) * k, y: c.y + (o.pos.y - c.y) * k, z: c.z + (o.pos.z - c.z) * k, r: r };
        });
        const last = sys.planets[sys.planets.length - 1];
        if (last) for (let k = 0; k < 8; k++) { const q = UV.planetPos(sys, last.orbit, k / 8 * Math.PI * 2); pts.push({ x: q.x, y: q.y, z: q.z, r: 0 }); }
        const outer = last ? last.orbit : sys.radius;
        return { centre: c, from: s.pos, withShip: UV.dist(s.pos, c) <= outer * 1.05, back: back, pitch: 0.65, fov: 50, points: pts };
    }

    function openSurvey() {
        NSE.Stage.setSurvey(surveyPlan(exploreList));
        UI().show('system', { data: exploreList });
    }

    function closeExplore() {
        NSE.Stage.setSurvey(null);
        flight.setHeld(false);
        UI().show('fly', { line: '', restore: 'fly:explore' });
    }

    function chooseWorld(i) {
        const o = exploreList && exploreList.objs && exploreList.objs[i];
        if (!o) return;
        NSE.Stage.setSurvey(null);      // the camera comes back down to the ship as it sets off
        flight.setHeld(false);
        pendingPrompt = null;
        flight.enterOrbit(o);
        target = o;
        heading = null;
        mode = 'glide';
        UI().show('glide', { line: 'Going to ' + o.name + '.' });
    }

    function chooseStar(i) {
        const it = exploreList && exploreList.list && exploreList.list[i];
        if (!it) return;
        const sys = it.sys, s = st();
        flight.setHeld(false);
        pendingPrompt = null;
        // Come in a short way outside the system, facing its star.
        const V = flight._vec;
        const back = V.norm(V.sub(s.pos, sys.pos));
        const point = V.add(sys.pos, V.mul(back, sys.radius + 400));
        const dist = UV.dist(point, s.pos);
        target = null;
        heading = 'the ' + sys.name + ' system';
        if (!flight.flyTo(point, V.mul(back, -1), U.clamp(dist / 1200, 3, 8), function () {
            heading = null;
            mode = 'fly';
            const here = st().system || sys;
            exploreList = { mode: 'worlds', sys: here, objs: UV.objectsOf(here), arrived: true };
            flight.setHeld(true);
            // Up over the system just reached, to pick a world there.
            openSurvey();
        })) { flight.setHeld(true); heading = null; NSE.Input.announce('Can’t fly there right now.'); return; }
        NSE.Stage.setSurvey(null);      // down to the ship for the trip
        mode = 'glide';
        UI().show('glide', { line: 'Flying to the ' + sys.name + ' system.' });
    }

    function openSteer() { UI().show('steer', { line: 'Steer. Speed is ' + S().speedName() + '.' }); }
    function closeSteer() { UI().show('fly', { line: '', restore: 'fly:steer' }); }

    /** One Speed button: Very Slow, Slow, Medium, Fast, Very Fast, and round again. */
    function cycleSpeed() {
        const n = S().SPEEDS.length;
        const i = (S().get('speedIndex') + 1) % n;
        setSpeedIndex(i);
        NSE.Sound.play(i === 0 ? 'slower' : 'faster', 0.7);
        NSE.Input.announce('Speed, ' + S().speedName() + '.');
        UI().refreshHUD();
    }

    // --- the prompt -------------------------------------------------------------------------------------

    function onDiscover(o) {
        if (UI().current() !== 'fly' && UI().current() !== 'steer') { pendingPrompt = o; return; }
        showPrompt(o);
    }

    function showPrompt(o) {
        pendingPrompt = null;
        NSE.Sound.play('chime', 0.9);
        const what = o.kind === 'planet' ? o.label + (o.world.rings ? ' with rings' : '') : o.label;
        const people = o.kind === 'planet' && o.world.civ ? ' Its lights are on: people live there!' : '';
        UI().show('prompt', { data: { obj: o }, line: kindWord(o) + ' ' + o.name + ', ' + what + '.' + people + ' Do you want to go here?' });
    }

    function answer(yes) {
        const o = st().prompting;
        flight.answer(yes);
        if (yes && o) {
            target = o;
            mode = 'glide';
            UI().show('glide', { line: 'Going to ' + o.name + '.' });
        } else {
            mode = 'fly';
            UI().show('fly', { line: 'Okay, flying on.' });
        }
    }

    // --- orbit ---------------------------------------------------------------------------------------------

    function onArrive(o) {
        target = o;
        mode = 'orbit';
        NSE.Sound.play('arrive', 0.8);
        const part = NSE.Space.partFor(o.id);
        if (part && part.mesh.detail) part.mesh.detail();
        // The logbook.
        const w = o.world;
        const info = {
            id: o.id, kind: o.kind, name: o.name, galaxy: st().galaxy, galaxyName: galaxy().name,
            type: w ? w.type : o.star.type, short: o.short, label: o.label,
            systemName: o.sys ? o.sys.name : (w ? w.systemName : ''), parentName: o.kind === 'moon' ? o.parentWorld.name : '',
            facts: w ? UV.facts(w).map(f => ({ k: f.k, v: f.v, say: f.say })) : [{ k: 'Surface', v: o.star.temperature.toLocaleString('en-US') + '°', say: 'Its surface is about ' + o.star.temperature.toLocaleString('en-US') + ' degrees.' }],
            civ: w && w.civ ? w.civ.people : null
        };
        const rec = NSE.Logbook.visit(info);
        snapWait = { t: 0, o: o };
        let line = 'Orbiting ' + o.name + ', ' + o.label + '. ';
        if (w) line += factsLine(w) || (w.civ ? 'The ' + w.civ.people + ' live here, with cities and starships.' : '');
        else if (S().get('facts')) line += starFacts(o).slice(0, 2).join(' ');
        if (rec.first) line += ' Added to your logbook.';
        // Inhabited worlds: ships fly up to meet you, and sometimes someone calls.
        hailT = -1; hailDone = false;
        if (w && w.civ) {
            NSE.Space.startGreeters(w, w.civ.ships);
            NSE.Sound.play('flyby', 0.6);
            line += ' Ships are flying up to meet you!';
            const p = { often: 0.9, sometimes: 0.45, off: 0 }[S().get('hails')];
            if (Math.random() < p) hailT = S().get('hails') === 'often' ? 7 : 11;
        }
        UI().callout(o.name, 'good');
        UI().show('orbit', { line: line.trim() });
    }

    function planetObjectFor(world) {
        const sys = UV.findById(world.id).sys;
        return UV.objectsOf(sys).find(x => x.id === world.id);
    }

    function moonButton() {
        if (!target) return;
        if (target.kind === 'moon') {
            const p = planetObjectFor(target.parentWorld);
            if (!p || !flight.visit(p)) return;
            beginGlide(p, 'Flying back to ' + p.name + '.');
            return;
        }
        const moons = target.world.moons;
        if (moons.length === 1) visitMoon(0);
        else if (moons.length > 1) UI().show('moons', { data: { planet: target.world } });
    }

    function visitMoon(i) {
        const planet = target.kind === 'moon' ? target.parentWorld : target.world;
        const m = planet.moons[i];
        if (!m) return;
        const o = flight.moonObject(planet, m);
        if (!flight.visit(o)) return;
        beginGlide(o, 'Flying to ' + m.name + ', ' + m.label + '.');
    }

    function closeMoons() { UI().show('orbit', { restore: 'orbit:moon' }); }

    function beginGlide(o, line) {
        NSE.Space.endGreeters();
        target = o;
        mode = 'glide';
        hailT = -1;
        UI().show('glide', { line: line });
    }

    function leaveOrbit() {
        if (!flight.leaveOrbit()) return;
        NSE.Space.endGreeters();
        hailT = -1;
        mode = 'glide';
        UI().show('glide', { line: 'Leaving orbit.' });
    }

    function onLeft() {
        target = null;
        mode = 'fly';
        UI().show('fly', { line: 'Flying on.' });
    }

    // --- Fly Low --------------------------------------------------------------------------------------------

    /** What grows and lives here, in words for Fly Low. */
    function lifeWords(w, life) {
        const pl = UV.plants(w);
        if (life) return 'Look out for creatures! Choose Scan to look closer.' + (pl ? ' ' + pl.charAt(0).toUpperCase() + pl.slice(1) + ' grow here too.' : '');
        if (pl) return pl.charAt(0).toUpperCase() + pl.slice(1) + ' grow here, but no creatures were found.';
        return 'Nothing seems to live here.';
    }

    function fadeColour(w) {
        if (!w.atmosphere) return '#05060f';
        const c = U.mix(U.hex(w.atmosphere.color), U.hex('#0a1030'), S().calm() ? 0.65 : 0.3);
        return U.toHex(c);
    }

    /**
     * Fly Low: dive from orbit down toward the surface, through a soft fade in the sky's
     * colour, then come down from high above to skim the ground (the user asked for a way in,
     * not a cut). Back to Orbit is the same, backwards.
     */
    function flyLow() {
        if (!target || target.kind === 'star' || !NSE.Surface || trans) return;
        NSE.Space.endGreeters();
        hailT = -1;
        trans = { type: 'enter', t: 0, colour: fadeColour(target.world), faded: false, built: false, cleared: false };
        mode = 'enter';
        UI().show('warp', { line: 'Flying down to ' + target.name + '.' });
    }

    function backToOrbit() {
        if (trans || !surface) return;
        trans = { type: 'exit', t: 0, colour: fadeColour(target.world), faded: false, swapped: false, cleared: false };
        mode = 'exit';
        UI().show('warp', { line: 'Climbing back up to orbit.' });
    }

    function diveInfo(climb) {
        const o = target, w = o.world;
        // The nose glows warm, tinted by the sky it is entering (only where there is air).
        const heat = w && w.atmosphere && !climb ? U.toHex(U.mix(U.hex('#ff9a50'), U.hex(w.atmosphere.color), 0.35)) : null;
        return { centre: () => flight.centreOf(o), radius: o.radius, heat: heat, climb: !!climb };
    }

    const DIVE = 3.8;      // seconds from orbit down to the cloud tops
    const INTRO = 2.8;     // seconds from high in the sky down to skimming the ground
    const CLIMB = 2.4;     // seconds climbing away from the ground on the way back up

    /** How thick the air looks during the dive (dive k 0..1), for the haze. */
    function hazeAt(k) { return target && target.world && target.world.atmosphere ? U.smooth((k - 0.45) / 0.55) * 0.9 : 0; }

    function stepTrans(dt) {
        const tr = trans;
        tr.t += dt;
        if (tr.type === 'enter') {
            if (tr.t < DIVE) {
                const k = tr.t / DIVE;
                NSE.Stage.setDive(k, diveInfo());
                UI().haze(hazeAt(k), tr.colour);
            }
            if (tr.t >= DIVE && !tr.faded) { tr.faded = true; UI().fade(true, tr.colour); }
            if (tr.t >= DIVE + 0.35 && !tr.built) {
                tr.built = true;
                NSE.Stage.setDive(null);
                if (!makeSurface()) { trans = null; UI().fade(false); mode = 'orbit'; UI().show('orbit', { line: 'Fly Low is not working right now.' }); return; }
                NSE.Stage.setSurfaceIntro(0);
            }
            if (tr.t >= DIVE + 0.5 && !tr.cleared) { tr.cleared = true; UI().fade(false); }
            if (tr.built) NSE.Stage.setSurfaceIntro((tr.t - DIVE - 0.35) / INTRO, 1 / INTRO);
            if (tr.t >= DIVE + 0.35 + INTRO) {
                NSE.Stage.setSurfaceIntro(1);
                trans = null;
                mode = 'low';
                const life = surface.species ? surface.species().length : 0;
                UI().show('low', { line: 'Flying low over ' + target.name + '. ' + (target.world.type === 'gas' ? 'Skimming the clouds. ' : '') + lifeWords(target.world, life) });
            }
        } else {
            // Climb away from the ground (nose up, the camera riding along), into the sky's colour,
            // then out of the top of the air and back up to the orbit.
            if (tr.t < CLIMB) NSE.Stage.setSurfaceIntro(1 - tr.t / CLIMB, -1 / CLIMB);
            if (tr.t >= CLIMB - 0.7 && !tr.faded) { tr.faded = true; UI().fade(true, tr.colour); }
            if (tr.t >= CLIMB && !tr.swapped) { tr.swapped = true; endSurface(); NSE.Stage.setDive(1, diveInfo(true)); }
            if (tr.swapped) {
                const k = Math.max(0, 1 - (tr.t - CLIMB) / (DIVE - 0.4));
                NSE.Stage.setDive(k, diveInfo(true));
                // Out of the fade into the haze, which thins as the ship climbs.
                if (tr.t >= CLIMB + 0.15) UI().haze(hazeAt(k), tr.colour);
            }
            if (tr.t >= CLIMB + DIVE - 0.4) {
                NSE.Stage.setDive(null);
                UI().fade(false);
                trans = null;
                mode = 'orbit';
                UI().show('orbit', { line: 'Back in orbit around ' + target.name + '.', restore: 'orbit:low' });
            }
        }
    }

    /** Turn left or right while flying low (one press, one smooth turn). */
    function steerLow(dir) {
        if (!surface || !surface.steer) return;
        surface.steer(dir);
        NSE.Sound.play('thrust', 0.6);
        NSE.Input.announce(dir > 0 ? 'Turning left.' : 'Turning right.');
    }

    function makeSurface() {
        const w = target.world;
        const THREE = window.THREE;
        surfaceShip = NSE.Ship.build(THREE);
        const sys = target.kind === 'moon' ? UV.findById(target.parentWorld.id).sys : target.sys;
        const opts = { ship: surfaceShip.group, detail: NSE.Stage.qualityLevel(), starColor: sys ? sys.stars[0].light : '#ffffff' };
        if (target.kind === 'moon') opts.skyPlanet = { color: target.parentWorld.palette.mid, radius: target.parentWorld.radius };
        try {
            surface = NSE.Surface.create(THREE, w, opts);
        } catch (e) {
            console.error('[NSE] Fly Low could not start', e);
            surfaceShip.dispose(); surfaceShip = null;
            return false;
        }
        NSE.Stage.setSurface(surface);
        NSE.Stage.setMode('surface');
        return true;
    }

    function endSurface() {
        NSE.Stage.setSurfaceIntro(1);
        if (!surface) return;
        NSE.Stage.setMode('space');
        NSE.Stage.setSurface(null);
        try { surface.dispose(); } catch (e) { /* ignore */ }
        if (surfaceShip) surfaceShip.dispose();
        surface = null; surfaceShip = null;
    }


    // --- scanning --------------------------------------------------------------------------------------------

    function scan() {
        if (!target) return;
        scanFrom = mode;
        NSE.Sound.play('scan', 0.7);
        const w = target.world;
        if (target.kind === 'star') { showScanner(starScan()); return; }
        let specs = [];
        if (mode === 'low' && surface && surface.species) specs = surface.species();
        else if (w.life && NSE.Creatures) specs = w.life.species.map(seed => NSE.Creatures.spec(seed, w));
        // An advanced civilisation: its people come first in the scanner, then the wildlife.
        if (w.civ && NSE.Creatures) {
            const ps = NSE.Creatures.spec(w.civ.seed, w);
            ps.people = true;
            specs = [ps].concat(specs);
        }
        if (!specs.length) { showScanner(worldScan()); return; }
        let index = 0;
        if (mode === 'low' && surface.nearestCreature) {
            const n = surface.nearestCreature();
            if (n && n.spec) index = Math.max(0, specs.findIndex(x => x.seed === n.spec.seed));
        }
        scanList = specs;
        showScanner(creatureScan(index));
    }

    function creatureScan(i) {
        const spec = scanList[i];
        if (spec.people) return peopleScan(i, spec);
        const lines = NSE.Creatures.words ? NSE.Creatures.words(spec) : [spec.sizeWords, spec.moveWords, spec.fact, spec.sound];
        const fresh = NSE.Logbook.addCreature(target.id, spec.name);
        return {
            kind: 'creature', index: i, count: scanList.length, nextLabel: 'Next Creature',
            name: spec.name, what: 'Lives on ' + target.name,
            lines: lines.filter(l => !/^This is /.test(l)),
            speech: 'Scanning. ' + lines.join(' ') + (fresh ? ' New in your logbook!' : ''),
            viewer: { kind: 'creature', subject: spec }
        };
    }

    /** The people of an advanced civilisation (their look comes from the civilisation's seed). */
    function peopleScan(i, spec) {
        const civ = target.world.civ;
        const one = civ.people.replace(/s$/, '');
        const mood = { friendly: 'They are friendly and love visitors.', curious: 'They are curious about everything.', grumpy: 'They are a bit grumpy, but they mean well.', loud: 'They are very, very loud.' }[civ.mood];
        const lines = [
            'An advanced civilisation.',
            'They build cities, space stations and starships.',
            'Each ' + one + ' is ' + spec.sizeWords.replace(/^about/, 'about') + '.',
            mood
        ];
        return {
            kind: 'creature', index: i, count: scanList.length, nextLabel: 'Next',
            name: 'The ' + civ.people, what: 'The people of ' + target.name,
            lines: lines,
            speech: 'Scanning. These are the ' + civ.people + ' of ' + target.name + '. ' + lines.join(' '),
            viewer: { kind: 'creature', subject: spec }
        };
    }

    function worldScan() {
        const w = target.world;
        const facts = UV.facts(w);
        const ground = { ice: 'Frozen ground and ice.', ocean: 'Deep blue seas with little islands.', earth: 'Land, water and clouds, a bit like home.', desert: 'Sand dunes and rocky cliffs.', lava: 'Rivers of glowing melted rock.', crystal: 'Giant shining crystals.', toxic: 'Green bubbling pools and thick haze.', gas: 'No ground at all, just swirling clouds, deeper and deeper.', rock: 'Grey dust and craters.' }[w.type];
        return {
            kind: 'world', index: 0, count: 1, name: w.name, what: w.label.charAt(0).toUpperCase() + w.label.slice(1),
            lines: [ground].concat(facts.map(f => f.say)).concat(w.life || UV.plants(w) ? [] : ['No creatures found here.']),
            speech: 'Scanning ' + w.name + '. ' + ground + ' ' + facts.map(f => f.say).join(' ') + (w.life || UV.plants(w) ? '' : ' No creatures found here.'),
            viewer: { kind: 'world', subject: w }
        };
    }

    function starScan() {
        const lines = starFacts(target);
        return {
            kind: 'star', index: 0, count: 1, name: target.name, what: target.short,
            lines: lines, speech: 'Scanning ' + target.name + '. ' + lines.join(' '),
            viewer: target.special === 'blackhole' ? null : { kind: 'star', subject: target.star }
        };
    }

    function showScanner(d, restore) {
        UI().show('scanner', { data: d, line: d.speech, restore: restore });
    }

    function scanNext() {
        if (!scanList) return;
        const d = UI().data();
        NSE.Sound.play('scan', 0.6);
        showScanner(creatureScan((d.index + 1) % scanList.length), 'scan:next');
    }

    function closeScanner() {
        scanList = null;
        UI().show(scanFrom === 'low' && surface ? 'low' : 'orbit', { restore: scanFrom === 'low' ? 'low:scan' : 'orbit:scan' });
    }

    // --- alien calls --------------------------------------------------------------------------------------------

    function startHail() {
        hailDone = true;
        const w = target && target.world;
        if (!w || !w.civ || UI().current() !== 'orbit') return;
        const alien = NSE.Aliens.make(w);
        const line = alien.greeting();
        NSE.Sound.play('hail', 0.8);
        UI().show('hail', { data: { alien: alien, line: line, waved: false }, line: '' });
        NSE.Voice.sayNow('Incoming call from the ' + alien.people + '!');
        alienSpeaks(alien, line);
        NSE.Logbook.metAliens(target.id);
    }

    function alienSpeaks(alien, line) {
        setTimeout(function () { NSE.Sound.play('alien-' + alien.mood, 0.85); talkingUntil = Date.now() + 2400; }, NSE.Voice.on() ? 1600 : 300);
        NSE.Voice.say(line.alien, { pitch: alien.voice.pitch, rate: alien.voice.rate });
        NSE.Voice.say(line.translation);
    }

    function hailWave() {
        const d = UI().data();
        if (!d.alien) return;
        d.waved = true;
        d.line = d.alien.reply();
        UI().show('hail', { data: d, line: '', restore: 'hail:bye' });
        NSE.Voice.sayNow('You wave hello.');
        alienSpeaks(d.alien, d.line);
    }

    function hailBye() {
        NSE.Voice.sayNow('Goodbye!');
        talkingUntil = 0;
        UI().show('orbit', { line: '' });
    }

    // --- warp -------------------------------------------------------------------------------------------------------

    function openMap() {
        flight.setHeld(true);
        UI().show('map', { data: { galaxy: galaxy(), shipPos: st().pos } });
    }

    function closeMap() {
        flight.setHeld(false);
        UI().show('fly', { line: 'Flying.', restore: 'fly:warp' });
    }

    /**
     * One big press: lines of light stretch and rush past, a deep whoosh, and
     * you come out somewhere new. dest() is called at the jump and places the ship.
     */
    function startWarp(dest, arriveLine, after, reveal) {
        endSurface();
        NSE.Space.endGreeters();
        NSE.Stage.setSurvey(null);
        NSE.Stage.setMenu(false);
        NSE.Stage.setPaused(false);
        flight.setHeld(true);
        target = null;
        mode = 'warp';
        NSE.Sound.play('warp', 1);
        UI().show('warp', { line: '' });
        NSE.Voice.sayNow('Warp! Hold on!');
        trans = null; NSE.Stage.setDive(null); UI().fade(false);
        warp = { t: 0, jumped: false, dest: dest, arriveLine: arriveLine, after: after, reveal: !!reveal };
    }

    function stepWarp(dt) {
        const w = warp;
        w.t += dt;
        const calm = S().calm();
        const k = w.t < 1.7 ? U.smooth(w.t / 1.7) : w.t < 2.5 ? 1 : 1 - U.smooth((w.t - 2.5) / 1.6);
        NSE.Stage.setWarp(calm ? k * 0.6 : k);
        if (!w.jumped && w.t >= 2.1) {
            w.jumped = true;
            w.dest();
            NSE.Space.resetPoints();
            // A new galaxy: see it whole from outside first, then choose to fly in.
            if (w.reveal) { warp = null; NSE.Stage.setWarp(0); startReveal(); return; }
        }
        if (w.t >= 4.1) {
            NSE.Stage.setWarp(0);
            warp = null;
            flight.setHeld(false);
            mode = 'fly';
            const line = typeof w.arriveLine === 'function' ? w.arriveLine() : w.arriveLine;
            if (w.after) w.after();
            if (mode === 'fly') UI().show('fly', { line: line });
            else UI().show('glide', { line: line });
            saveState();
        }
    }

    function arrivalWords(newGalaxy) {
        const g = galaxy();
        const sys = st().system || (st().near && st().near[0]);
        return (newGalaxy ? 'Welcome to the ' + g.name + ' Galaxy! ' : 'A new star system! ') + (sys ? 'Ahead is the ' + sys.name + ' system.' : '');
    }

    /** Jump to a new galaxy (placing the ship among its stars, ready for when you fly in). */
    function jumpToNewGalaxy() {
        const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
        const g = UV.newGalaxySeed(st().galaxy, seed);
        const r = U.rng(seed);
        const s = UV.startNear(g, { x: r.range(-20, 20) * UV.SECTOR, y: 0, z: r.range(-20, 20) * UV.SECTOR });
        flight.place(g, s.pos, s.yaw, 0);
        flight.setHeld(true);
        NSE.Space.setGalaxy(UV.galaxy(g));
    }

    function startReveal() {
        mode = 'galaxy';
        flight.setHeld(true);
        NSE.Stage.setGalaxyView(NSE.GalaxyView.create(window.THREE, galaxy(), NSE.Stage.qualityLevel()));
        NSE.Stage.setMode('galaxy');
        NSE.Stage.setGalaxyPhase('reveal', 0);
        gflow = { phase: 'reveal', t: 0 };
        UI().refreshHUD();
    }

    function stepGalaxy(dt) {
        const gf = gflow;
        gf.t += dt;
        if (gf.phase === 'reveal') {
            NSE.Stage.setGalaxyPhase('reveal', Math.min(1, gf.t / 2.8));
            if (gf.t >= 2.8) {
                gf.phase = 'look';
                NSE.Stage.setGalaxyPhase('look', 0);
                UI().show('galaxy', { data: { galaxy: galaxy() } });
            }
        } else if (gf.phase === 'dive') {
            NSE.Stage.setGalaxyPhase('dive', Math.min(1, gf.t / GDIVE));
            if (gf.t >= GDIVE - 0.7 && !gf.faded) { gf.faded = true; UI().fade(true, '#050818'); }
            if (gf.t >= GDIVE) {
                gflow = null;
                NSE.Stage.setGalaxyView(null);
                NSE.Stage.setMode('space');
                UI().fade(false);
                UI().refreshHUD();
                // Come out among the stars the way a warp does (the lines of light easing off
                // while the picture fades back in), not a cut to a still scene.
                const g = galaxy();
                mode = 'warp';
                warp = {
                    t: 3.0, jumped: true, dest: function () {}, after: null, reveal: false,
                    arriveLine: function () {
                        const sys = st().system || (st().near && st().near[0]);
                        return 'Exploring the ' + g.name + ' Galaxy.' + (sys ? ' Ahead is the ' + sys.name + ' system.' : '');
                    }
                };
            }
        }
    }

    const GDIVE = 4.2;     // seconds diving into a new galaxy after Fly In

    function flyIn() {
        if (!gflow || gflow.phase !== 'look') return;
        gflow = { phase: 'dive', t: 0 };
        NSE.Sound.play('arrive', 0.8);
        UI().show('warp', { line: 'Flying in!' });
    }

    function anotherGalaxy() {
        if (!gflow || gflow.phase !== 'look') return;
        NSE.Sound.play('warp', 1);
        NSE.Voice.sayNow('Warp!');
        jumpToNewGalaxy();
        UI().show('warp', { line: '' });
        startReveal();
    }

    function warpTo(kind) {
        flight.setHeld(false);
        const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
        if (kind === 'galaxy') {
            startWarp(jumpToNewGalaxy, function () { return arrivalWords(true); }, null, true);
        } else {
            startWarp(function () {
                const r = U.rng(seed);
                const here = st().pos;
                const p = { x: here.x + r.range(8, 30) * r.sign() * UV.SECTOR, y: r.range(-1, 1) * UV.SECTOR, z: here.z + r.range(8, 30) * r.sign() * UV.SECTOR };
                const s = UV.startNear(st().galaxy, p);
                flight.place(st().galaxy, s.pos, s.yaw, 0);
            }, function () { return arrivalWords(false); });
        }
    }

    /** From the logbook: warp straight back to a place, and go into orbit. */
    function visitAgain(id) {
        const f = UV.findById(id);
        if (!f) { NSE.Input.announce('That place could not be found.'); return; }
        const gs = f.sys.galaxy;
        let obj = null;
        startWarp(function () {
            const objs = UV.objectsOf(f.sys);
            if (f.moon) obj = flight.moonObject(f.planet, f.moon);
            else if (f.planet) obj = objs.find(o => o.id === f.planet.id);
            else obj = objs.find(o => o.kind === 'star');
            const c = obj.kind === 'moon' ? UV.moonPos(f.planet, f.moon, st().time) : obj.pos;
            const away = { x: c.x + 1, y: c.y + 0.2, z: c.z + 0.6 };
            const dir = flight._vec.norm(flight._vec.sub(away, c));
            const dist = flight.orbitRadius(obj) + 140;
            const pos = flight._vec.add(c, flight._vec.mul(dir, dist));
            const a = NSE.Flight.anglesOf(flight._vec.mul(dir, -1));
            flight.place(gs, pos, a.yaw, a.pitch);
            NSE.Space.setGalaxy(UV.galaxy(gs));
        }, function () { return 'Going back to ' + obj.name + '.'; }, function () {
            flight.enterOrbit(obj);
            target = obj;
            mode = 'glide';
        });
    }

    // --- pause and menus ------------------------------------------------------------------------------------------

    function pause() {
        const sc = UI().current();
        if (['fly', 'steer', 'glide', 'orbit', 'low'].indexOf(sc) < 0) return;
        pauseFrom = sc;
        NSE.Stage.setPaused(true);
        flight.setHeld(true);
        NSE.Voice.cancel();
        UI().show('pause');
    }

    function resume() {
        NSE.Stage.setPaused(false);
        flight.setHeld(false);
        const words = { fly: 'Flying.', steer: 'Steer.', glide: 'Flying on.', orbit: target ? 'Orbiting ' + target.name + '.' : 'Orbiting.', low: target ? 'Flying low over ' + target.name + '.' : 'Flying low.' };
        const back = pauseFrom === 'glide' && st().mode === 'orbit' ? 'orbit' : pauseFrom === 'glide' && st().mode === 'fly' ? 'fly' : pauseFrom;
        if ((back === 'fly' || back === 'steer') && (pendingPrompt || st().prompting)) { UI().show('fly', { line: '' }); showPrompt(pendingPrompt || st().prompting); return; }
        UI().show(back, { line: words[back] || '' });
    }

    function toMenu() {
        NSE.Voice.cancel();
        trans = null; NSE.Stage.setDive(null); UI().fade(false);
        if (gflow) { gflow = null; NSE.Stage.setGalaxyView(null); NSE.Stage.setMode('space'); }
        endSurface();
        NSE.Space.endGreeters();
        NSE.Stage.setSurvey(null);
        NSE.Stage.setPaused(false);
        flight.setHeld(true);
        // Don't come back to a half-finished glide or an old question.
        if (st().prompting) flight.answer(false);
        mode = 'menu';
        NSE.Stage.setMenu(true);
        saveState();
        UI().show('menu');
    }

    function exit() {
        saveState();
        NSE.Voice.speak('Goodbye.');
        try { NSE.Sound.silence(); } catch (e) { /* none */ }
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        } catch (e) {
            console.warn('[NSE] Could not message the hub:', e);
        }
    }

    function applyMotion() {
        flight.setCalm(S().calm());
        NSE.Space.setCalm(S().calm());
    }

    // --- every frame ------------------------------------------------------------------------------------------------

    function frame(dt, rawDt) {
        flight.step(dt);
        if (warp) stepWarp(rawDt);
        if (trans) stepTrans(rawDt);
        // Faint speed lines on a long fast glide (Nearby Stars), unless a warp or a dive owns them.
        if (!warp && !trans && !gflow) NSE.Space.setWarp(st().mode === 'travel' ? U.clamp((st().speedNow - 500) / 2500, 0, S().calm() ? 0.12 : 0.3) : 0);
        if (gflow) stepGalaxy(rawDt);
        NSE.UI.tick();
        NSE.Sound.update(rawDt);
        musicT -= rawDt;
        if (musicT <= 0) { musicT = 1; NSE.Sound.setMusic(pickMusic()); }
        hudT -= rawDt;
        if (hudT <= 0) { hudT = 0.5; UI().refreshHUD(); }
        if (mode !== 'menu' && dt > 0) {
            saveT -= dt;
            if (saveT <= 0) { saveT = 5; saveState(); }
        }
        // Someone calls, a few seconds into an orbit.
        if (hailT > 0 && !hailDone && dt > 0) {
            hailT -= dt;
            if (hailT <= 0) {
                if (UI().current() === 'orbit') startHail();
                else hailT = 2;    // busy (scanning, moons): try again shortly
            }
        }
        // The logbook picture, once the camera has settled and the maps are painted.
        if (snapWait && dt > 0) {
            snapWait.t += dt;
            if (snapWait.t > 2 && (NSE.Planets.pending() === 0 || snapWait.t > 7)) {
                const o = snapWait.o;
                snapWait = null;
                if (target === o && st().mode === 'orbit') {
                    const c = flight.centreOf(o);
                    const sys = o.sys || (o.kind === 'moon' ? UV.findById(o.parentWorld.id).sys : null);
                    const sun = o.kind === 'star' ? { x: c.x + 600, y: c.y + 200, z: c.z + 300 } : sys ? sys.pos : { x: 0, y: 0, z: 0 };
                    const extent = o.kind === 'star' ? (o.special === 'blackhole' ? o.sys.disk.outer : o.radius * 1.3) : o.world.rings ? o.world.rings.outer : o.radius;
                    NSE.Stage.snapshot({ center: c, radius: o.radius, extent: extent, sun: sun }, function (url) { if (url) NSE.Logbook.setPicture(o.id, url); });
                }
            }
        }
    }

    function alienTalking() { return Date.now() < talkingUntil; }

    // --- boot ---------------------------------------------------------------------------------------------------------

    function boot() {
        flight = NSE.Flight.create();
        NSE.UI.build();
        NSE.Sound.init();
        NSE.Input.init();
        NSE.Input.setProvider(NSE.UI.scannables);
        NSE.UI.show('loading', { line: '' });
        try { window.addEventListener('pagehide', saveState); } catch (e) { /* no window */ }

        flight.setSpeed(S().speed());
        flight.on('discover', onDiscover);
        flight.on('arrive', onArrive);
        flight.on('left', onLeft);
        flight.on('system', function (sys) { NSE.Space.setSystem(sys); });

        NSE.Stage.setView(S().get('view'));
        NSE.Stage.init(NSE.UI.stageEl(), flight).then(function () {
            applyMotion();
            const saved = loadState();
            let g = UV.HOME_GALAXY, start;
            if (saved && saved.pos && isFinite(saved.pos.x)) {
                g = saved.galaxy >>> 0 || UV.HOME_GALAXY;
                start = { pos: saved.pos, yaw: saved.yaw || 0, pitch: saved.pitch || 0 };
            } else {
                start = UV.startNear(g);
            }
            NSE.Space.setGalaxy(UV.galaxy(g));
            flight.place(g, start.pos, start.yaw, start.pitch);
            flight.setHeld(true);
            NSE.Space.setSystem(st().system);
            NSE.Stage.setMenu(true);
            NSE.Stage.onFrame(frame);
            mode = 'menu';
            NSE.UI.show('menu');
            try {
                window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                    if (loaded && NSE.UI.current() === 'menu' && !(NSE.Input.state() || {}).id) NSE.Input.announce('Space Explorer.');
                });
            } catch (e) { /* no voice manager */ }
        }).catch(function (e) {
            console.error('[NSE] could not start', e);
            NSE.UI.showError('This computer could not start the 3D graphics this game needs.');
        });

        // A small read-only window for automated checks (no effect on play).
        window.__nse = function () {
            const s = flight.state, inp = NSE.Input.state() || {};
            return {
                screen: NSE.UI.current(), highlighted: inp.id || null, mode: mode, flight: s.mode,
                galaxy: s.galaxy, system: s.system ? s.system.name : null, target: target ? target.name : null,
                prompting: s.prompting ? s.prompting.name : null, autopilot: s.autopilot ? s.autopilot.name : null,
                view: NSE.Stage.view(), paused: NSE.Stage.paused(), logbook: NSE.Logbook.list().length,
                warp: !!warp, surface: !!surface, survey: NSE.Stage.surveying()
            };
        };
        window.__nseFlight = flight;
    }

    return {
        boot: boot,
        hasSave: hasSave,
        hudState: hudState,
        marker: marker,
        shipPos: function () { return flight.state.pos; },
        startExploring: startExploring,
        nextStop: nextStop,
        turn: turn,
        climb: climb,
        speed: speed,
        setSpeedIndex: setSpeedIndex,
        switchView: switchView,
        answer: answer,
        moonButton: moonButton,
        visitMoon: visitMoon,
        closeMoons: closeMoons,
        leaveOrbit: leaveOrbit,
        flyLow: flyLow,
        explore: explore,
        closeExplore: closeExplore,
        chooseWorld: chooseWorld,
        chooseStar: chooseStar,
        openSteer: openSteer,
        closeSteer: closeSteer,
        cycleSpeed: cycleSpeed,
        steerLow: steerLow,
        flyIn: flyIn,
        anotherGalaxy: anotherGalaxy,
        backToOrbit: backToOrbit,
        scan: scan,
        scanNext: scanNext,
        closeScanner: closeScanner,
        hailWave: hailWave,
        hailBye: hailBye,
        alienTalking: alienTalking,
        openMap: openMap,
        closeMap: closeMap,
        warp: warpTo,
        visitAgain: visitAgain,
        pause: pause,
        resume: resume,
        toMenu: toMenu,
        exit: exit,
        applyMotion: applyMotion
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NSE.Game.boot);
} else {
    NSE.Game.boot();
}
