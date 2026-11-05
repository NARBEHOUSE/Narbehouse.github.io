/**
 * NARBE Build n Bash - boot, game flow and the way back to the hub.
 *
 * A cause and effect game: each Build press puts the next wooden block in
 * place until a castle, a train or a space station stands finished; Destroy,
 * any time, sends something silly to knock it all down. There is no score,
 * no timer and nothing to lose.
 */

window.BNB = window.BNB || {};

BNB.Game = (function () {
    'use strict';

    let pendingDone = false;
    let fromPlay = false;

    function S() { return BNB.Settings; }

    function applySettings() {
        BNB.Sim.setOptions({ chunked: S().get('chunked'), calm: S().get('motion') === 'calm', pieceNames: S().get('pieceNames') });
        document.getElementById('bnb').dataset.motion = S().get('motion');
        if (BNB.UI.current() === 'play') BNB.UI.playChanged();
    }

    /** A finished build behind the main menu, slowly swaying. */
    function showcase() {
        const done = BNB.Builds.LIST.filter(b => S().timesBuilt(b.id) > 0);
        const pool = done.length ? done : BNB.Builds.LIST;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        BNB.Sim.load(pick.id, { quality: BNB.Stage.qualityLevel() });
        BNB.Sim.showFinished();
        BNB.Stage.setMode('menu');
        BNB.Stage.snap();
        BNB.Stage.setPaused(false);
    }

    function playLine() {
        const b = BNB.Sim.build();
        const placed = BNB.Sim.placed();
        if (!b) return '';
        if (placed === 0) return b.name + '. Choose Build.';
        return b.name + ', ' + placed + ' of ' + b.blocks.length + '.';
    }

    // --- flow ----------------------------------------------------------------------------

    function startBuild(id) {
        pendingDone = false;
        fromPlay = false;
        BNB.Sim.load(id, { quality: BNB.Stage.qualityLevel() });
        BNB.Stage.setMode('play');
        BNB.Stage.snap();
        BNB.Stage.setPaused(false);
        BNB.UI.show('play', { line: playLine() });
    }

    function build() {
        if (BNB.UI.current() !== 'play') return;
        if (BNB.Sim.addBlock() < 0) return;
        BNB.UI.playChanged();
    }

    function destroy() {
        if (BNB.UI.current() !== 'play') return;
        const info = BNB.Sim.destroy();
        BNB.UI.playChanged();
        if (!info) return;
    }

    function pause() {
        if (BNB.UI.current() !== 'play') return;
        BNB.Stage.setPaused(true);
        BNB.Voice.cancel();
        BNB.UI.show('pause');
    }

    function resume() {
        BNB.Stage.setPaused(false);
        if (pendingDone) { showDone(); return; }
        BNB.UI.show('play', { line: playLine() });
    }

    function startOver() {
        const b = BNB.Sim.build();
        if (b) startBuild(b.id);
    }

    function pickAnother() {
        fromPlay = true;
        BNB.Stage.setPaused(true);
        BNB.Voice.cancel();
        BNB.UI.show('select');
    }

    function buildAgain() {
        pendingDone = false;
        BNB.Sim.clearRubble();
        BNB.Stage.setPaused(false);
        BNB.UI.show('play', { line: '' });
    }

    function showDone() {
        pendingDone = false;
        BNB.Sound.play('popup', 0.8);
        BNB.UI.show('done');
    }

    function toMenu() {
        pendingDone = false;
        fromPlay = false;
        BNB.Voice.cancel();
        if (BNB.Stage.mode() !== 'menu') showcase();
        BNB.UI.show('menu');
    }

    function exit() {
        BNB.Voice.speak('Goodbye.');
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        } catch (e) {
            console.warn('[BNB] Could not message the hub:', e);
        }
    }

    // --- what the simulation tells us -------------------------------------------------------

    function wireSim() {
        const Sim = BNB.Sim;
        Sim.on('place', function () { BNB.UI.playChanged(); });
        Sim.on('land', function (e) {
            BNB.Sound.land(e.size, e.zeroG);
            if (e.spec.n && S().get('pieceNames') && BNB.UI.current() === 'play') BNB.Voice.say(e.spec.n);
            BNB.UI.refreshPlay();
        });
        Sim.on('complete', function (e) {
            S().markBuilt(e.id);
            BNB.Sound.play('complete', 0.9);
            BNB.Stage.celebrate();
            if (BNB.UI.current() === 'play') {
                BNB.UI.callout('You built it!', 'built');
                // Replaces the last piece's name: finishing is the line that matters.
                BNB.Voice.sayNow('You built the ' + e.name + '!');
            }
            BNB.UI.playChanged();
        });
        Sim.on('bashStart', function (info) {
            BNB.UI.callout(info.name + '!', 'bash');
            if (BNB.UI.current() === 'play') BNB.Voice.sayNow(info.say);
            BNB.UI.playChanged();
        });
        Sim.on('bashEnd', function () { BNB.UI.playChanged(); });
        Sim.on('allDown', function () {
            S().markBashed();
            BNB.UI.playChanged();
            // Let the last tumble and its speech finish, then ask what next.
            setTimeout(function () {
                if (BNB.Sim.state() !== 'down') return;
                if (BNB.UI.current() === 'play') showDone(); else pendingDone = true;
            }, 700);
        });
        Sim.on('cleared', function () {
            if (BNB.UI.current() !== 'play') return;
            BNB.UI.playChanged();
            BNB.Input.announce('Ready to build. Choose Build.');
        });
        Sim.on('tok', function (e) { BNB.Sound.tok(e.gain); });
        Sim.on('sound', function (e) { BNB.Sound.play(e.name, e.gain); });
    }

    // --- boot ---------------------------------------------------------------------------------

    function boot() {
        BNB.UI.build();
        BNB.Sound.init();
        BNB.Input.init();
        BNB.Input.setProvider(BNB.UI.scannables);
        BNB.Input.onHighlight(function (item) {
            BNB.Sim.setGhost(!!item && item.id === 'play:build' && S().get('hint') && BNB.UI.current() === 'play');
        });
        BNB.UI.show('loading', { line: '' });

        const physics = BNB.Physics.init().catch(function (e) { console.warn('[BNB] physics unavailable', e); return null; });
        Promise.all([physics, BNB.Stage.init(BNB.UI.stageEl())]).then(function () {
            wireSim();
            applySettings();
            showcase();
            BNB.UI.show('menu');
            // Build Select pictures, rendered quietly while the menu is up.
            setTimeout(function () {
                BNB.Stage.thumbnails(BNB.Builds.LIST.map(b => b.id), BNB.UI.setThumb);
            }, 800);
            try {
                window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                    if (loaded && BNB.UI.current() === 'menu' && !(BNB.Input.state() || {}).id) BNB.Input.announce('Build n Bash.');
                });
            } catch (e) { /* no voice manager */ }
        }).catch(function (e) {
            console.error('[BNB] could not start', e);
            BNB.UI.showError('This computer could not start the 3D graphics this game needs.');
        });

        // A small read-only window for automated checks (no effect on play).
        window.__bnb = function () {
            const st = BNB.Input.state() || {};
            return { screen: BNB.UI.current(), highlighted: st.id || null, sim: BNB.Sim.state(), placed: BNB.Sim.placed(), total: BNB.Sim.total(),
                build: BNB.Sim.build() && BNB.Sim.build().id, paused: BNB.Stage.paused() };
        };
    }

    return {
        boot: boot,
        startBuild: startBuild,
        build: build,
        destroy: destroy,
        pause: pause,
        resume: resume,
        startOver: startOver,
        pickAnother: pickAnother,
        buildAgain: buildAgain,
        toMenu: toMenu,
        exit: exit,
        applySettings: applySettings
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', BNB.Game.boot);
} else {
    BNB.Game.boot();
}
