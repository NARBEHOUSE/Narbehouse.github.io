/**
 * NARBE Build n Ride - boot, game flow and the way back to the hub.
 *
 * Ride: pick a route, then the train runs round it for ever, stopping at every
 * station; View, Look, Horn and Speed are always in the scan, and so is Pause.
 *
 * Build (js/build.js for the logic, BNR.Scene.loadBuild for the looks): lay the
 * track a piece at a time; a see-through piece shows where the highlighted
 * button would put it. Connect finishes the loop, piece by piece, back to the
 * start station. A finished loop is saved to My Tracks and Ride rides it.
 * A Build in progress waits while you visit the menu (Pause, New Track starts
 * again).
 *
 * Quick Build: pick a design (a route); each Build press lays the next few
 * pieces (hold Enter to keep going); when it closes, Ride rides that route.
 *
 * My Tracks: saved loops (BNR.Tracks), each to Ride or Delete.
 */

window.BNR = window.BNR || {};

BNR.Game = (function () {
    'use strict';

    let mode = 'ride';           // what Pause and How to Play are about: ride | build | quick
    let session = null;          // the Build in progress (kept while you visit the menu)
    let quickSession = null;     // the Quick Build in progress
    let connecting = null;       // Connect's steps while it lays the way home
    let connectWait = 0;
    let customId = null;         // the home-made loop being ridden (its My Tracks id), if any
    // The shipped route pictures' version (images/routes/): bump it when tools/route-pictures.cjs remakes them.
    const ROUTE_PICTURES = '2026.11.18.1';

    function S() { return BNR.Settings; }
    function rig() { return BNR.Stage.rig(); }
    function playing() { return BNR.UI.current() === 'play' && !BNR.Stage.paused(); }
    function building() { return BNR.UI.current() === 'build' && !BNR.Stage.paused(); }
    function quality() { return BNR.Stage.qualityLevel(); }
    /** The share of the world's buildings standing at this graphics level (Build keeps track out of them). */
    function buildDetail() { return BNR.World.DETAIL[quality()] || 1; }

    function ensureRoute(id) {
        const r = BNR.Scene.route();
        if (r && r.id === id && !BNR.Scene.isBuild()) return;
        BNR.Scene.load({ route: id }, { quality: quality(), budget: 30, speed: S().get('speedIndex') });
    }

    // --- Ride ----------------------------------------------------------------------------

    function beginRide(line) {
        mode = 'ride';
        BNR.Scene.setSpeed(S().get('speedIndex'));
        BNR.Stage.setPaused(false);
        BNR.Stage.setMode('ride');
        BNR.UI.show('play', { line: line });
    }

    function startRide(id) {
        customId = null;
        ensureRoute(id);
        const r = BNR.Scene.route();
        beginRide((r ? r.name : 'Ride') + '. ' + rig().viewName() + ' view.');
    }

    /** Ride a home-made loop: a finished Build session (its world and track as they are). */
    function rideSession(s, name, id) {
        customId = id || null;
        const routeDef = { id: 'track:' + (id || 'new'), name: name || 'My Track', events: BNR.Build.eventsFor(s.track, s.world, s.sites), thumb: null };
        BNR.Scene.load({ world: s.world, track: s.track, routeDef: routeDef, sites: s.sites.slice() }, { quality: quality(), budget: 30, speed: S().get('speedIndex') });
        beginRide(routeDef.name + '. ' + rig().viewName() + ' view.');
    }

    /** One of My Tracks. */
    function rideTrack(id) {
        const rec = BNR.Tracks.get(id);
        if (!rec) { BNR.UI.openSelect('tracks'); return; }
        let s = null;
        try { s = BNR.Build.restore(rec); } catch (e) { console.warn('[BNR] could not open track', e); }
        if (!s || !s.closed()) { BNR.Input.announce('Sorry, that track would not open.'); return; }
        rideSession(s, rec.name, rec.id);
    }

    function nextView() {
        if (BNR.UI.current() !== 'play') return;
        const name = rig().nextView();
        S().set('view', rig().view());
        BNR.Sound.play('swoosh', 0.6);
        BNR.UI.bounce('view');
        BNR.UI.refreshPlay();
        BNR.Input.announce(name + ' view.');
    }

    function look() {
        if (BNR.UI.current() !== 'play') return;
        const name = rig().cycleLook();
        BNR.Sound.play('swoosh', 0.4);
        BNR.UI.bounce('look');
        BNR.UI.refreshPlay();
        BNR.Input.announce(rig().view() === 'cab' ? 'Looking ' + name.toLowerCase() + '.' : 'From the ' + name.toLowerCase() + '.');
    }

    /** The cause-and-effect button: the whistle, a big puff, the lamp flares, birds fly up. */
    function horn() {
        if (BNR.UI.current() !== 'play') return;
        BNR.Scene.horn();
        BNR.Sound.horn();
        BNR.UI.bounce('horn');
        BNR.UI.callout('Toot toot!', 'toot');
    }

    function speed() {
        if (BNR.UI.current() !== 'play') return;
        const i = (S().get('speedIndex') + 1) % BNR.Ride.SPEEDS.length;
        S().set('speedIndex', i);
        BNR.Scene.setSpeed(i);
        BNR.Sound.play('choose', 0.5);
        BNR.UI.bounce('speed');
        BNR.UI.refreshPlay();
        BNR.Input.announce('Speed, ' + BNR.Ride.SPEEDS[i].name + '.');
    }

    // --- Build ---------------------------------------------------------------------------

    function current() { return mode === 'quick' ? quickSession : session; }

    /** What the Build bar shows. */
    function buildState() {
        const s = current();
        if (!s || (mode !== 'build' && mode !== 'quick')) return null;
        const live = s.mode === 'build' && !s.closed() && !connecting;
        return {
            mode: s.mode, closed: s.closed(), busy: !!connecting,
            // Pieces: one a press (a Long Straight is one; a Quick Build press lays one piece of
            // the design). sections: the track sections underneath (3 to 5 a Quick Build press).
            pieces: s.mode === 'build' ? s.pieceCount() : s.pressed(),
            total: s.mode === 'quick' ? s.presses : null,
            sections: s.mode === 'build' ? s.sections() : s.track.pieces.length,
            stations: s.sites.length, progress: s.progress ? s.progress() : 0,
            name: s.route ? s.route.name : 'Build', canUndo: s.canUndo(),
            // Why each piece button can't lay track now (null: it can); the pieces the player may lay.
            blocked: live ? s.blocked() : {},
            max: s.mode === 'build' ? s.pieceLimit : null,
            left: live ? s.piecesLeft() : null
        };
    }

    const PIECE_NAMES = { S: 'Straight', LS: 'Long Straight', L: 'Turn Left', R: 'Turn Right' };
    /** Why a piece can't go down: a short word for the button and its scan, and what to say. */
    const REFUSED = {
        high: { short: 'Too high', say: 'Too high! Track only goes two levels up.' },
        stuck: { short: 'No way on', say: 'Not that way: the track would have nowhere to go.' },
        steep: { short: 'Too steep', say: 'Too steep: no room for a ramp up here.' },
        full: { short: 'Out of track', say: 'That is all the track! Choose Connect to take it home.' }
    };

    /** A press that can't lay track: a soft sound and what to try instead. */
    function refuse(kind, why) {
        const s = session;
        const r = REFUSED[why] || REFUSED.high;
        BNR.Sound.play('unsnap', 0.3);
        BNR.UI.callout(r.short + '!', '');
        const b = s.blocked();
        const can = Object.keys(PIECE_NAMES).filter(k => !b[k]).map(k => PIECE_NAMES[k]);
        let tip = '';
        if (why !== 'full') tip = can.length ? ' Try ' + (can.length > 1 ? can.slice(0, -1).join(', ') + ' or ' + can[can.length - 1] : can[0]) + '.' : ' Choose Undo or Connect.';
        BNR.Input.announce(r.say + tip);
    }

    function enterBuild(s, line) {
        connecting = null;
        BNR.Scene.loadBuild(s, { quality: quality(), budget: 30 });
        BNR.Stage.setPaused(false);
        BNR.Stage.setMode('build');
        BNR.UI.show('build', { line: line });
        refreshGhost();
    }

    function startBuild() {
        mode = 'build';
        customId = null;
        if (!session || session.closed()) {
            // The latest track left unfinished (My Tracks), if there is one: carry on with it.
            const wip = BNR.Tracks.list().find(r => r.finished === false);
            if (wip) { openSaved(wip, 'Build. Carry on with ' + wip.name + ': the end of the track is where you left it.'); return; }
            session = BNR.Build.create({ detail: buildDetail });
        }
        enterBuild(session, session.pieceCount() ? 'Build. Keep going: the end of the track is where you left it.'
            : 'Build. Lay the track one piece at a time. Connect finishes the loop.');
    }

    function newTrack() {
        saveWip();                               // the one in hand stays in My Tracks
        mode = 'build';
        session = BNR.Build.create({ detail: buildDetail });
        enterBuild(session, 'A new track. Lay the first piece.');
    }

    // --- saving a track in progress, and building on a saved one ---------------------------------

    let wipTimer = null;
    /** A Build track still being built is saved in My Tracks (unfinished): soon after a change, and on leaving. */
    function wipChanged() {
        if (mode !== 'build' || !session) return;
        clearTimeout(wipTimer);
        wipTimer = setTimeout(saveWip, 2500);
    }
    function saveWip() {
        clearTimeout(wipTimer);
        wipTimer = null;
        const s = session;
        if (!s || s.mode !== 'build' || s.closed() || connecting || !s.pieceCount()) return;
        try {
            const saved = BNR.Tracks.put(s.record(), s.world, s.track, s.savedId);
            s.savedId = saved.id; s.savedName = saved.name;
        } catch (e) { console.warn('[BNR] could not save the track in progress', e); }
    }

    /** Build on a saved track: built again press by press (behind the loading card for a big one). */
    function openSaved(rec, line, edit) {
        if (session && session.savedId === rec.id && !session.closed()) { mode = 'build'; enterBuild(session, line); return; }
        saveWip();
        mode = 'build';
        customId = null;
        BNR.UI.show('loading', { line: 'Getting ' + rec.name + ' ready.' });
        setTimeout(function () {
            session = BNR.Build.resume(rec, { detail: buildDetail });
            session.savedId = rec.id; session.savedName = rec.name;
            // An edited loop is unfinished again (it can't be ridden until it is connected).
            if (edit) { try { BNR.Tracks.put(session.record(), session.world, session.track, rec.id); } catch (e) { /* storage full */ } }
            enterBuild(session, line);
        }, 60);
    }
    /** My Tracks: Keep Building an unfinished track. */
    function keepBuilding(id) {
        const rec = BNR.Tracks.get(id);
        if (rec) openSaved(rec, 'Keep building ' + rec.name + '. The end of the track is where you left it.');
    }
    /** My Tracks: Edit a finished loop, opened where Connect took over. */
    function editTrack(id) {
        const rec = BNR.Tracks.get(id);
        if (rec) openSaved(rec, 'Editing ' + rec.name + '. Undo takes pieces back: hold Enter on Undo to keep going back. Then build on, and Connect when it is ready.', true);
    }

    function startQuick(id) {
        mode = 'quick';
        customId = null;
        if (!quickSession || quickSession.routeId !== id || quickSession.closed()) quickSession = BNR.Build.quick(id);
        enterBuild(quickSession, 'Quick Build, ' + quickSession.route.name + ', ' + quickSession.presses + ' pieces. Choose Build to lay the next piece. Hold Enter to keep building.');
    }

    function withLifts(p) {
        const t = current().track;
        return Object.assign({}, p, { liftIn: t.liftIn(p.i), liftOut: t.liftOut(p.i) });
    }

    /** Free Build: buildings in the track's (or a new station's) way make way, each with a puff of dust where it stood. */
    function makeWay(res) {
        if (mode !== 'build' || !session) return;
        const ter = BNR.Scene.terrain();
        BNR.Build.clearedBy(session, res).forEach(function (b) {
            const y = ter ? ter.heightAt(b.x, b.z) : session.track.datumAt(b.x, b.z);
            BNR.FX.dust(b.x, y + 1, b.z, 12, 2.4, '#dcd2c2');
            BNR.FX.dust(b.x, y + 4, b.z, 8, 1.8, '#e8e0d2');
        });
    }

    /** What happened as new track landed: a word for a bridge, tunnel or crossing, and new stations. */
    function landed(res, o) {
        o = o || {};
        BNR.Scene.buildChanged();
        BNR.Sound.play('snap', o.quiet ? 0.5 : 0.85);
        makeWay(res);
        const words = [];
        res.kinds.forEach(k => { const w = { tunnel: 'Tunnel!', bridge: 'Bridge!', overpass: 'Over the top!' }[k]; if (w) words.push(w); });
        (res.newSites || []).forEach(function (st) { words.push('New station, ' + st.name + '!'); BNR.Sound.play('chime', 0.6); });
        // Once, when the track is running out: time to head home.
        const s = current();
        if (s && s.mode === 'build' && !connecting && !s.closed() && !s.warnedLow && s.piecesLeft() <= 30) {
            s.warnedLow = true;
            words.push('Running low on track. Head for home soon!');
        }
        if (words.length) {
            BNR.UI.callout(words[words.length - 1].replace('New station, ', ''), (res.newSites || []).length ? 'good' : 'toot');
            if (!o.quiet || (res.newSites || []).length) BNR.Voice.say(words.join(' '));
        }
        BNR.UI.refreshBuild();
        if (connecting) return;                 // Connect finishes the loop when its last step is done
        wipChanged();
        if (res.closes) finished(); else refreshGhost();
    }

    function placePiece(kind) {
        const s = session;
        if (mode !== 'build' || !s || s.closed() || connecting || !building()) return;
        BNR.Scene.buildLand();                  // a quick second press: the last piece lands first
        const res = s.add(kind);
        if (!res) return;
        if (res.blocked) { refuse(kind, res.blocked); return; }
        BNR.UI.bounce(kind);
        BNR.Scene.buildGhost(null);
        BNR.Scene.buildDrop(res.placed.map(withLifts), function () { landed(res); });
    }

    /** Build's Zoom: the camera stands Close, Far or Very Far (remembered). */
    function zoom() {
        if (BNR.UI.current() !== 'build') return;
        const i = S().cycle('buildZoomIndex', S().ZOOMS.length);
        BNR.Sound.play('choose', 0.5);
        BNR.UI.bounce('zoom');
        BNR.UI.refreshBuild();
        BNR.Input.announce('Zoom, ' + S().ZOOMS[i].name + '.');
    }

    function undoPiece() {
        const s = session;
        if (mode !== 'build' || !s || connecting || !building()) return;
        BNR.Scene.buildLand();
        if (!s.canUndo()) { BNR.Input.announce('Nothing to undo. This is the start station.'); return; }
        const gone = s.lastGroup().map(p => BNR.Track.piecePoint(p, 0.5));
        const res = s.undo();
        if (!res) return;
        BNR.UI.bounce('undo');
        BNR.Sound.play('unsnap', 0.8);
        gone.forEach(p => BNR.FX.dust(p.x, s.track.datumAt(p.x, p.z) + 1, p.z, 5, 1.0, '#e8dcc6'));
        BNR.Scene.buildChanged({ removed: gone });
        const lost = res.lostSites.map(x => x.name);
        // Held on Undo it repeats quickly: say "Undo" once, and any station that goes.
        const t = Date.now(), quick = t - lastUndoAt < 700;
        lastUndoAt = t;
        if (!quick || lost.length) BNR.Input.announce((quick ? '' : 'Undo.') + (lost.length ? ' ' + lost.join(' and ') + ' station is gone.' : ''));
        BNR.UI.refreshBuild();
        refreshGhost();
        wipChanged();
    }
    let lastUndoAt = 0;

    /** Connect: the way home, laid a piece at a time with the camera following (frame() steps it). */
    function connect() {
        const s = session;
        if (mode !== 'build' || !s || s.closed() || connecting || !building()) return;
        BNR.Scene.buildLand();
        BNR.UI.bounce('connect');
        BNR.Scene.buildGhost(null);
        connecting = s.connectSteps();
        connectWait = 0.25;
        connectPer = 1; planLeft = null; pendingStep = null;
        BNR.UI.refreshBuild();
        BNR.Input.refresh(false);                // only Pause while it lays the track
        BNR.Input.announce('Connecting! Back to the start station.');
    }

    /**
     * Connect's pace: a piece a step on a short way home; on a long one several together (worked
     * out when each plan starts), so even the longest way home is down in about ten seconds.
     */
    let connectPer = 1, planLeft = null, pendingStep = null;
    function stepConnect(dt) {
        if (!connecting || BNR.Scene.buildBusy()) return;
        connectWait -= dt;
        if (connectWait > 0) return;
        const r = pendingStep ? { done: false, value: pendingStep } : connecting.next();
        pendingStep = null;
        if (r.done) {
            connecting = null;
            BNR.UI.refreshBuild();
            BNR.Input.refresh(false);
            if (session && session.closed()) finished();
            return;
        }
        const st = r.value;
        if (st.op === 'add') {
            if (st.left !== undefined && (planLeft === null || st.left >= planLeft)) connectPer = Math.max(1, Math.min(40, Math.ceil((st.left + 1) / 50)));
            if (st.left !== undefined) planLeft = st.left;
            const batch = [st];
            while (batch.length < connectPer) {
                const r2 = connecting.next();
                if (r2.done) break;
                if (r2.value.op !== 'add') { pendingStep = r2.value; break; }
                batch.push(r2.value);
                if (r2.value.left !== undefined) planLeft = r2.value.left;
            }
            const res = batch.length === 1 ? st : {
                placed: [].concat.apply([], batch.map(b => b.placed)), closes: batch[batch.length - 1].closes,
                kinds: Array.from(new Set([].concat.apply([], batch.map(b => b.kinds || [])))),
                newSites: [].concat.apply([], batch.map(b => b.newSites || [])), lostSites: []
            };
            BNR.Scene.buildDrop(res.placed.map(withLifts), function () { landed(res, { quiet: true }); }, 0.16);
            connectWait = 0.05;
        } else if (st.op === 'undo') {
            BNR.Scene.buildChanged({ removed: st.removed });
            BNR.Sound.play('unsnap', 0.4);
            connectWait = 0.05;
        } else if (st.op === 'sites') {
            BNR.Scene.buildChanged();
            makeWay(st);
            st.newSites.forEach(function (x) { BNR.Sound.play('chime', 0.6); BNR.UI.callout(x.name, 'good'); BNR.Voice.say('New station, ' + x.name + '!'); });
            BNR.UI.refreshBuild();
        }
    }

    let finishedFor = null;
    /** The loop is closed: confetti, a tune, save it (Build), and Ride takes over. */
    function finished() {
        const s = current();
        if (!s || finishedFor === s) return;
        finishedFor = s;
        connecting = null;
        BNR.Scene.buildGhost(null);
        BNR.Scene.buildChanged({ full: true });
        BNR.Scene.buildCelebrate();
        BNR.Sound.play('fanfare', 0.9);
        BNR.Sound.horn();
        let line = 'You did it! The loop is finished, with ' + s.sites.length + (s.sites.length === 1 ? ' station.' : ' stations.');
        if (s.mode === 'build') {
            clearTimeout(wipTimer);
            const saved = BNR.Tracks.put(s.record(), s.world, s.track, s.savedId);
            s.savedId = saved.id;
            s.savedName = saved.name;
            line += saved.saved ? ' It is saved in My Tracks as ' + saved.name + '.' : '';
        }
        BNR.UI.callout('Loop complete!', 'good');
        BNR.UI.refreshBuild();
        BNR.Input.refresh(false);
        BNR.Voice.say(line + ' Choose Ride to ride it!');
    }

    /** Ride the loop just finished. */
    function rideBuilt() {
        const s = current();
        if (!s || !s.closed()) return;
        if (s.mode === 'quick') { quickSession = null; startRide(s.routeId); return; }
        session = null;
        rideSession(s, s.savedName || 'My Track', s.savedId);
    }

    function quickNext() {
        const s = quickSession;
        if (mode !== 'quick' || !s || s.closed() || !building()) return;
        BNR.Scene.buildLand();
        const res = s.next();
        if (!res) return;
        BNR.UI.bounce('quick');
        BNR.Scene.buildDrop(res.placed.map(withLifts), function () { landed(res); }, 0.26);
    }

    /**
     * The see-through preview follows the highlight: the piece a button would lay, Undo's red,
     * Connect's gold; in Quick Build, the pieces the next Build press lays.
     */
    function refreshGhost() {
        if (mode === 'quick') {
            const q = quickSession;
            const on = q && !q.closed() && BNR.UI.current() === 'build' && BNR.Input.focusedId() === 'build:quick';
            BNR.Scene.buildGhost(on ? q.peek() : null, 'next');
            return;
        }
        if (mode !== 'build' || !session || BNR.UI.current() !== 'build' || connecting || session.closed()) { BNR.Scene.buildGhost(null); return; }
        const id = BNR.Input.focusedId();
        const kind = id && id.indexOf('build:') === 0 ? id.slice(6) : null;
        if (kind && BNR.Build.PIECES[kind]) BNR.Scene.buildGhost(session.preview(kind).pieces, session.check(kind).ok ? 'next' : 'blocked');
        else if (kind === 'undo') BNR.Scene.buildGhost(session.lastGroup(), 'undo');
        else if (kind === 'connect') BNR.Scene.buildGhost(session.planPieces(), 'plan');
        else BNR.Scene.buildGhost(null);
    }

    // --- pause and the menu --------------------------------------------------------------------

    function pause() {
        const sc = BNR.UI.current();
        if (sc !== 'play' && sc !== 'build') return;
        BNR.Stage.setPaused(true);
        BNR.Voice.cancel();
        BNR.Scene.buildGhost(null);
        BNR.UI.show('pause');
    }

    function resume() {
        BNR.Stage.setPaused(false);
        if (mode === 'build' || mode === 'quick') {
            BNR.UI.show('build', { line: connecting ? 'Connecting.' : 'Building.' });
            refreshGhost();
        } else BNR.UI.show('play', { line: 'Riding.' });
    }

    function toMenu() {
        BNR.Voice.cancel();
        BNR.Stage.setPaused(false);
        if (connecting && session) {
            // Leaving while Connect works: finish the loop at once (it is nearly home anyway).
            for (let r = connecting.next(); !r.done; r = connecting.next()) { /* lay the rest */ }
            connecting = null;
            if (session.closed()) {
                BNR.Scene.buildChanged({ full: true });
                const saved = BNR.Tracks.put(session.record(), session.world, session.track, session.savedId);
                session.savedId = saved.id; session.savedName = saved.name;
                finishedFor = session;
            }
        }
        BNR.Scene.buildLand();
        BNR.Scene.buildGhost(null);
        if (mode === 'build') saveWip();
        mode = 'ride';
        BNR.Stage.setMode('menu');
        BNR.UI.show('menu');
    }

    function exit() {
        BNR.Voice.speak('Goodbye.');
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        } catch (e) {
            console.warn('[BNR] Could not message the hub:', e);
        }
    }

    // --- what the scene tells us -----------------------------------------------------------------

    function wireScene() {
        const Sc = BNR.Scene;
        Sc.on('arrive', function (st) {
            if (!playing()) return;
            BNR.Sound.toot();
            BNR.UI.callout(st.name, 'good');
            BNR.Voice.say(st.name + '.');
            BNR.UI.refreshPlay();
        });
        Sc.on('depart', function () {
            if (!playing()) return;
            BNR.UI.refreshPlay();
        });
        Sc.on('event', function (e) {
            if (!playing() || !e.say) return;
            BNR.UI.callout(e.say, 'toot');
            BNR.Voice.say(e.say);
        });
        Sc.on('chuff', function (e) { if (playing()) BNR.Sound.chuff(e.speed, e.inTunnel); });
        Sc.on('clack', function (e) { if (playing()) BNR.Sound.clack(e.inTunnel); });
        Sc.on('sound', function (e) { if (playing()) BNR.Sound.play(e.name, e.gain); });
    }

    // Sound loops, Connect's steps and the HUD, every frame.
    let hudT = 0, ambT = 0, tunnelK = 0;
    const amb = {};
    function frame(dt, rawDt) {
        const on = playing() || building();
        const ts = BNR.Scene.trainState();
        if (ts) tunnelK += ((ts.inTunnel && playing() ? 1 : 0) - tunnelK) * Math.min(1, rawDt * 3);
        ambT -= rawDt;
        if (ambT <= 0 && ts && BNR.Scene.world()) {
            ambT = 0.5;
            BNR.Sound.AMBIENTS.forEach(k => { amb[k] = 0; });
            const f = BNR.Scene.isBuild() ? BNR.Scene.buildFocus() : ts.pos;
            const mix = BNR.Scene.world().mix(f.x, f.z).color;
            for (const id in mix) {
                const a = 'amb-' + (BNR.Biomes.get(id).ambient || 'birds');
                if (a in amb) amb[a] += mix[id];
            }
        }
        BNR.Sound.setScene(amb, tunnelK, on, BNR.Weather ? BNR.Weather.state.wet : 0);
        BNR.Sound.update(rawDt);
        if (building() && connecting) stepConnect(dt);
        if (BNR.UI.current() === 'play') {
            hudT -= rawDt;
            if (hudT <= 0) { hudT = 0.5; BNR.UI.refreshPlay(); }
        }
    }

    /** Facts for the route tiles (lap minutes, stations, pieces), then their pictures, once the menu is up. */
    function makeThumbnails() {
        const ids = BNR.Routes.LIST.map(r => r.id);
        const factIds = ids.slice();
        (function facts() {
            const id = factIds.shift();
            if (!id) { pictures(); return; }
            try { BNR.Routes.facts(id); BNR.Build.quickFacts(id); } catch (e) { console.warn('[BNR] no facts for ' + id, e); }
            setTimeout(facts, 60);
        })();
        // Each route's picture ships as a file (images/routes/<id>.jpg, made by tools/route-pictures.cjs).
        // Building them here meant a whole little world per route, each a quarter second (over a second
        // on a slower computer) with the page frozen, so the menu's camera stuttered for the first
        // seconds (the user, 2026-11-18). A route with no file yet still gets its picture built.
        function pictures() {
            const id = ids.shift();
            if (!id) return;
            const url = 'images/routes/' + id + '.jpg?v=' + ROUTE_PICTURES;
            const img = new Image();
            img.onload = function () { BNR.UI.setThumb(id, url); pictures(); };
            img.onerror = function () { build(id); };
            img.src = url;
        }
        function build(id) {
            let d = null;
            try { d = BNR.Scene.diorama(id, 480, 320); } catch (e) { console.warn('[BNR] no picture for ' + id, e); setTimeout(pictures, 50); return; }
            BNR.Stage.snapshot(d, 480, 320).then(function (url) {
                try { d.dispose(); } catch (e) { /* ignore */ }
                BNR.UI.setThumb(id, url);
                setTimeout(pictures, 120);
            });
        }
    }

    // --- boot ---------------------------------------------------------------------------------

    function boot() {
        BNR.UI.build();
        BNR.Sound.init();
        BNR.Input.init();
        BNR.Input.setProvider(BNR.UI.scannables);
        BNR.Input.onHighlight(function () { if (BNR.UI.current() === 'build') refreshGhost(); });
        BNR.UI.show('loading', { line: '' });
        // Closing the game (or the hub) keeps the track in progress.
        try { window.addEventListener('pagehide', function () { if (mode === 'build') saveWip(); }); } catch (e) { /* no window */ }

        BNR.Weather.setModes(S().weatherModes());
        BNR.Stage.init(BNR.UI.stageEl()).then(function () {
            wireScene();
            BNR.Scene.setViewer(BNR.Stage.camera());
            BNR.Scene.load({ route: BNR.Routes.LIST[0].id }, { quality: quality(), budget: 30, speed: S().get('speedIndex') });
            BNR.Stage.setMode('menu');
            BNR.UI.show('menu');
            // The Look label eases back by itself; keep the button's words in step.
            let lastLook = '';
            BNR.Stage.onFrame(function (dt, rawDt) {
                frame(dt, rawDt);
                if (BNR.UI.current() !== 'play') return;
                const now = rig().lookName();
                if (now !== lastLook) { lastLook = now; BNR.UI.refreshPlay(); }
            });
            setTimeout(makeThumbnails, 900);
            try {
                window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                    if (loaded && BNR.UI.current() === 'menu' && !(BNR.Input.state() || {}).id) BNR.Input.announce('Build n Ride.');
                });
            } catch (e) { /* no voice manager */ }
        }).catch(function (e) {
            console.error('[BNR] could not start', e);
            BNR.UI.showError('This computer could not start the 3D graphics this game needs.');
        });

        // A small read-only window for automated checks (no effect on play).
        window.__bnr = function () {
            const st = BNR.Input.state() || {};
            const r = rig();
            const ts = BNR.Scene.trainState();
            const ride = BNR.Scene.ride();
            const b = buildState();
            return {
                screen: BNR.UI.current(), highlighted: st.id || null, paused: BNR.Stage.paused(), mode: BNR.Stage.mode(), game: mode,
                route: BNR.Scene.route() && BNR.Scene.route().id, view: r && r.view(), look: r && r.lookName(),
                s: ts ? Math.round(ts.s * 10) / 10 : null, v: ts ? Math.round(ts.speed * 10) / 10 : null,
                speed: ride ? ride.speedName() : null, phase: ride ? ride.phase : null,
                events: BNR.Scene.events() ? BNR.Scene.events().count() : 0,
                chunks: BNR.Scene.terrain() ? BNR.Scene.terrain().count() : 0,
                build: b, tracks: BNR.Tracks.list().length, custom: customId
            };
        };
    }

    return {
        boot: boot,
        mode: function () { return mode; },
        startRide: startRide,
        rideTrack: rideTrack,
        startBuild: startBuild,
        startQuick: startQuick,
        newTrack: newTrack,
        placePiece: placePiece,
        undoPiece: undoPiece,
        connect: connect,
        zoom: zoom,
        keepBuilding: keepBuilding,
        editTrack: editTrack,
        quickNext: quickNext,
        rideBuilt: rideBuilt,
        buildState: buildState,
        nextView: nextView,
        look: look,
        horn: horn,
        speed: speed,
        pause: pause,
        resume: resume,
        toMenu: toMenu,
        exit: exit
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', BNR.Game.boot);
} else {
    BNR.Game.boot();
}
