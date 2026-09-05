/**
 * NARBE Animal Friends - the DOM-only renderer.
 *
 * This is the Simple visual preset, and it is also the fallback when WebGL
 * cannot start or the device is too weak. It is a complete, shipping renderer,
 * not a degraded version of the 3D scene - which is the only way to guarantee
 * Simple has no leftover gradient, bloom or gloss.
 *
 * It implements exactly the same interface as stage3d.js. reveal.js drives both
 * through that interface and knows nothing about either.
 *
 * Movement stays even here: motion is often the most reliably preserved visual
 * channel when object recognition is impaired, so the animal keeps its idle bob.
 * It is clutter that gets removed, not life.
 */

window.NAF = window.NAF || {};

NAF.Stage2D = (function () {
    'use strict';

    let root = null;
    let el = {};
    let preset = 'simple';
    let motion = 'lively';
    let animal = null;
    let poseSrc = {};
    let bobRaf = 0;
    let bobPhase = Math.random() * Math.PI * 2;
    let bobEnabled = true;
    let animalOut = false;
    let zone = NAF.Zones.byId('barn');

    /** Doubles every animal's on-screen size once revealed, for low vision -
     *  see the matching constant and its note in stage3d.js. Applied on top
     *  of the per-animal --animal-scale rather than replacing it. */
    const REVEAL_SCALE = 2;

    function make(cls, parent) {
        const d = document.createElement('div');
        d.className = cls;
        (parent || root).appendChild(d);
        return d;
    }

    function mount(container) {
        destroy();
        zone = NAF.Zones.current();
        root = document.createElement('div');
        root.className = 's2d';
        container.appendChild(root);

        el.sky = make('s2d-sky');
        el.ground = make('s2d-ground');
        el.barn = make('s2d-barn');
        el.interior = make('s2d-interior', el.barn);
        el.shaft = make('s2d-shaft', el.barn);
        el.animalWrap = make('s2d-animal-wrap', el.barn);
        el.animal = document.createElement('img');
        el.animal.className = 's2d-animal';
        el.animal.alt = '';
        el.animalWrap.appendChild(el.animal);
        el.seam = make('s2d-seam', el.barn);
        el.doorL = make('s2d-door s2d-door-l', el.barn);
        el.doorR = make('s2d-door s2d-door-r', el.barn);
        el.facade = make('s2d-facade', el.barn);

        setPreset(preset);
        startBob();
        return true;
    }

    function destroy() {
        stopBob();
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
        el = {};
    }

    function setPreset(p) {
        preset = p;
        if (!root) return;
        root.className = 's2d s2d-preset-' + p;
        // className was just rewritten, so the zone has to go back on.
        applyZone();
    }

    /**
     * Move to another zone.
     *
     * Where the 3D stage redraws canvases, this hands the stylesheet the zone's
     * palette as custom properties and its door mechanic as a data attribute -
     * so the three mechanics are three CSS rules rather than three code paths,
     * and the DOM renderer stays what it is meant to be: markup and a stylesheet.
     */
    function setZone(z) {
        zone = z || NAF.Zones.byId('barn');
        applyZone();
    }

    function applyZone() {
        if (!root) return;
        const t = zone.theme;
        root.dataset.doors = zone.doors;
        // Only the handful the DOM renderer actually paints with. The rest of a
        // theme describes canvas artwork, which this renderer does not draw.
        const vars = {
            '--s2d-sky-top': t.sky[0],
            '--s2d-sky-mid': t.sky[1],
            '--s2d-sky-low': t.sky[2],
            '--s2d-ground-far': t.ground[0],
            '--s2d-ground-near': t.ground[2],
            '--s2d-wall': t.wall,
            '--s2d-wall-edge': t.wallEdge,
            '--s2d-trim': t.trim,
            '--s2d-door': t.door,
            '--s2d-interior': t.interior[0],
            '--s2d-shaft': t.shaft[0],
            '--s2d-shaft-out': t.shaft[2],
            '--s2d-seam': '#' + ('000000' + t.seam.toString(16)).slice(-6)
        };
        Object.keys(vars).forEach(function (k) { root.style.setProperty(k, vars[k]); });

        // Leaving the aquarium mid-swim would otherwise strand an inline
        // translateX on the wrap, offsetting the next zone's animal until the
        // following reveal overwrites it. Every other zone expects transform
        // to simply be whatever the stylesheet says.
        if (zone.doors !== 'swim' && el.animalWrap) {
            el.animalWrap.style.transition = 'none';
            el.animalWrap.style.transform = '';
            void el.animalWrap.offsetWidth;
            el.animalWrap.style.transition = '';
        }
    }

    function setMotion(m) {
        motion = m;
        bobEnabled = (m !== 'still');
        if (!bobEnabled && el.animalWrap) el.animalWrap.style.transform = '';
    }

    function setPosition(where) {
        if (!root) return;
        root.classList.remove('s2d-at-left', 's2d-at-right', 's2d-at-middle');
        root.classList.add('s2d-at-' + (where || 'middle'));
    }

    /** Resolve the best available art for each pose into an <img> src. */
    function setAnimal(a) {
        animal = a;
        poseSrc = {};
        if (!a) return;
        ['idle', 'call', 'happy'].forEach(function (pose) {
            const art = NAF.Animals.artFor(a, pose);
            poseSrc[pose] = (art.kind === 'url') ? art.src : art.src.toDataURL('image/png');
        });
        if (el.animalWrap) {
            el.animalWrap.style.setProperty('--animal-scale', String((a.scale || 1) * REVEAL_SCALE));
        }
        setPose('idle');
        // Phase-offset per animal so two animals are never in sync.
        bobPhase = (a.id.charCodeAt(0) % 17) / 17 * Math.PI * 2;
    }

    function setPose(pose) {
        if (!el.animal || !animal) return;
        const src = poseSrc[pose] || poseSrc.idle;
        if (src && el.animal.getAttribute('src') !== src) el.animal.setAttribute('src', src);
    }

    // --- the beats --------------------------------------------------------------

    function flash(node, cls, ms) {
        if (!node) return;
        node.classList.remove(cls);
        // Force a reflow so the animation restarts on a repeat press.
        void node.offsetWidth;
        node.classList.add(cls);
        if (ms) setTimeout(function () { node.classList.remove(cls); }, ms);
    }

    function nudge() {
        flash(el.barn, 's2d-nudge', 260);
    }

    function anticipate(ms) {
        flash(el.doorL, 's2d-shake', ms);
        flash(el.doorR, 's2d-shake', ms);
        if (el.seam) {
            el.seam.style.setProperty('--seam-ms', ms + 'ms');
            flash(el.seam, 's2d-seam-on', ms);
        }
    }

    function openDoors(ms) {
        if (!root) return;
        root.style.setProperty('--door-ms', ms + 'ms');
        root.classList.add('s2d-open');
    }

    function closeDoors(ms) {
        if (!root) return;
        root.style.setProperty('--door-ms', ms + 'ms');
        root.classList.remove('s2d-open');
    }

    /**
     * Which edge the animal swims in from and back out of, for the aquarium.
     *
     * Driven as a plain inline transform on el.animalWrap rather than through a
     * class-toggled stylesheet rule: an inline style always wins the cascade
     * over any selector regardless of specificity, which sidesteps a real
     * failure mode two rules of different specificity ran into here - the
     * class meant to override the "resting" rule's transform never actually
     * took effect, and the animal stayed pinned at its off-screen position the
     * whole reveal. Driving it from here removes the ambiguity entirely.
     */
    /**
     * +1 is screen-right, since that is the sign translateX takes. ALWAYS the
     * right, so every aquarium animal travels right to left.
     *
     * Matches SWIM_IN_FROM in stage3d.js, and for the same reason: the artwork
     * faces LEFT for every animal in the tank, so entering from the left meant
     * the animal travelled right while pointing left - swimming backwards.
     */
    const SWIM_IN_FROM = 1;
    let swimSide = SWIM_IN_FROM;

    /** Jump to an off-screen X with no transition, so the next change to
     *  transform is the only motion the player sees. */
    function swimJumpTo(side) {
        if (!el.animalWrap) return;
        el.animalWrap.style.transition = 'none';
        el.animalWrap.style.transform = 'translateX(' + (side * 130) + '%)';
        void el.animalWrap.offsetWidth;     // flush the jump before re-enabling
        el.animalWrap.style.transition = '';
    }

    function bringOut(ms) {
        if (!root) return;
        animalOut = true;
        root.style.setProperty('--out-ms', ms + 'ms');
        if (zone.doors === 'swim' && el.animalWrap) {
            // In from the right, every time - see SWIM_IN_FROM.
            swimSide = SWIM_IN_FROM;
            swimJumpTo(swimSide);
            // The transition list (opacity, scale, transform) is already set
            // up on the element by the stylesheet; setting the real target now
            // is what actually animates the swim in.
            el.animalWrap.style.transform = 'translateX(0)';
        }
        root.classList.add('s2d-out');
    }

    function putAway(ms) {
        if (!root) return;
        animalOut = false;
        root.style.setProperty('--out-ms', ms + 'ms');
        if (zone.doors === 'swim' && el.animalWrap) {
            // Swims on across the tank and out the OPPOSITE side it came in,
            // rather than reversing back the way it arrived.
            el.animalWrap.style.transform = 'translateX(' + (-swimSide * 130) + '%)';
        }
        root.classList.remove('s2d-out');
    }

    function pop() {
        flash(el.animalWrap, 's2d-pop', 420);
    }

    function bloom() {
        flash(el.shaft, 's2d-bloom', 700);
    }

    /** Snap everything back to closed and hidden, for an interrupted reveal. */
    function reset() {
        if (!root) return;
        animalOut = false;
        root.classList.remove('s2d-open', 's2d-out');
        if (el.animalWrap) el.animalWrap.classList.remove('s2d-pop');
        if (el.shaft) el.shaft.classList.remove('s2d-bloom');
        if (el.seam) el.seam.classList.remove('s2d-seam-on');
    }

    // --- idle life --------------------------------------------------------------

    /**
     * The bob targets el.animal (the inner <img>), NOT el.animalWrap. It used
     * to write straight to the wrap's transform every frame, which was fine
     * right up until the swim mechanic needed the wrap's OWN transform for the
     * side-to-side travel - the bob's per-frame overwrite (a plain style
     * assignment, not a transition) stomped that value on the very next frame
     * and left the animal pinned wherever the swim had barely started from.
     * Keeping the two on separate elements means neither has to know the
     * other exists: the wrap slides, the image inside it wobbles, and CSS
     * composes both without either side writing to a property the other owns.
     */
    function startBob() {
        stopBob();
        const start = performance.now();
        function frame(now) {
            bobRaf = requestAnimationFrame(frame);
            if (!el.animal) return;
            if (!bobEnabled || !animalOut) { el.animal.style.transform = ''; return; }
            const amp = motion === 'gentle' ? 0.5 : 1;
            const t = (now - start) / 1000;
            const y = Math.sin(t * 1.4 + bobPhase) * 8 * amp;
            const rot = Math.sin(t * 1.1 + bobPhase) * 1.6 * amp;
            el.animal.style.transform = 'translateY(' + y.toFixed(2) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
        }
        bobRaf = requestAnimationFrame(frame);
    }

    function stopBob() {
        if (bobRaf) cancelAnimationFrame(bobRaf);
        bobRaf = 0;
    }

    /**
     * Fit the barn into the band of screen the interface is not using, the same
     * contract stage3d.js implements with its camera. Keeps a barn-ish 4:5 shape.
     */
    function setSafeArea(topPx, bottomPx, heightPx, bottomMargin) {
        if (!el.barn || !root) return;
        const w = root.clientWidth || window.innerWidth;
        const top = topPx + 8;
        const band = Math.max(90, (bottomPx - (bottomMargin === undefined ? 30 : bottomMargin)) - top);

        const h = Math.min(band, (heightPx || root.clientHeight) * 0.66);
        const width = Math.min(h * 0.8, w * 0.72);

        el.barn.style.height = h + 'px';
        el.barn.style.width = width + 'px';
        el.barn.style.top = (top + (band - h) / 2) + 'px';
        el.barn.style.transform = 'translateX(-50%)';
    }

    function resize() { /* CSS handles it */ }

    return {
        setSafeArea: setSafeArea,
        id: '2d',
        mount: mount,
        destroy: destroy,
        resize: resize,
        setPreset: setPreset,
        setZone: setZone,
        setMotion: setMotion,
        setPosition: setPosition,
        setAnimal: setAnimal,
        setPose: setPose,
        nudge: nudge,
        anticipate: anticipate,
        openDoors: openDoors,
        closeDoors: closeDoors,
        bringOut: bringOut,
        putAway: putAway,
        pop: pop,
        bloom: bloom,
        reset: reset
    };
})();
