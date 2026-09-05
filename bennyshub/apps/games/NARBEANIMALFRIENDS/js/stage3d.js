/**
 * NARBE Animal Friends - the WebGL stage.
 *
 * 2D cutouts in a 3D scene. Every layer is a flat plane at a fixed Z and nothing
 * rotates except the two door hinges. The camera is FIXED - a gentle dolly on Z
 * and a very slight idle drift, nothing more. No orbit, no rotation around
 * anything, ever. That is what stops flat art reading as a cardboard standee.
 *
 * The canvas is the stage only. Every menu, setting, button, stamp, scan
 * highlight and piece of text lives in the DOM layer on top of it.
 *
 * Hard rules this file obeys:
 *   - No AudioContext, and therefore no THREE.AudioListener or
 *     THREE.PositionalAudio - they are Web Audio underneath and can take down
 *     the renderer in the Electron desktop build.
 *   - No SVG textures. All stage art is PNG or a canvas we drew ourselves.
 *     Self-hosted SVGs blank out in WebGL without explicit width and height.
 *   - No CDN art. Cross-origin images without CORS headers blank out in WebGL.
 *   - No GLTFLoader, no animation system, no physics, no OrbitControls.
 *
 * Depth of field and bloom are baked, not post-processed: the interior wall and
 * the foreground grass ship pre-blurred, and the bloom is an additive quad.
 * EffectComposer is not in the vendored build and is not worth the bundle.
 */

window.NAF = window.NAF || {};

NAF.Stage3D = (function () {
    'use strict';

    // --- scene constants --------------------------------------------------------

    const Z = {
        sky: -40, hills: -30, clouds: -34, fence: -26, interior: -20,
        flowers: -14, barn: -8, shaft: -12, grass: 4
    };
    // Sized so the whole barn, roof included, sits inside the frame at 4:3.
    const DOOR_W = 2.4, DOOR_H = 5.4, OPENING_HALF = 2.4;
    const ANIMAL_Z_IN = -14, ANIMAL_Z_OUT = -6;
    /** Doubles every animal's on-screen size once it is fully out, for low
     *  vision - it is applied on top of the per-animal scale rather than
     *  replacing it, so small and large animals stay sized relative to each
     *  other. It does not shrink the doorway itself, so a fully out animal
     *  now reads as bigger than the frame it stepped through, by design. */
    const REVEAL_SCALE = 2;

    /** World height of the barn, floor to roof apex. Drives the framing solve. */
    const BARN_TOP = 9.8;
    /** Overall width across the eaves. The framing solve has to fit this too, or
     *  the barn is clipped at the sides on a narrow screen. */
    const BARN_W = 14.4;
    /** Where the gambrel's lower slope meets its upper one. */
    const EAVE_Y = 5.9, KNEE_Y = 7.9, KNEE_X = 5.2, EAVE_X = 7.2;
    /** How far the camera travels back from its closest point during the dolly. */
    const DOLLY_RANGE = 1.6;
    /** Seconds for one pass of the slow weather. Long enough that it is never the
     *  thing a player is watching, short enough that a session sees it change. */
    const WEATHER_CYCLE = 210;

    // Framing is SOLVED from the free band of screen the interface leaves, not
    // hard-coded - see setSafeArea. These are the starting values, replaced on the
    // first layout pass. The camera is translated rather than pitched, so the
    // angle the art is drawn at never changes however the framing moves.
    let CAM_Z_REST = 14.5, CAM_Z_DOLLY = 12.9;
    let CAM_Y = 2.9, LOOK_Y = 3.4;

    let renderer = null, scene = null, camera = null;
    let raf = 0, clock0 = 0;
    let mounted = false;
    let preset = 'full';
    let motion = 'lively';
    let animal = null;
    let poseTex = {};
    let bobPhase = 0;

    const nodes = {};                 // named meshes/groups
    let dust = null;
    let sun = null, rim = null, ambient = null;

    // Animation state, all driven from one rAF loop.
    const anim = {
        door: 0, doorTarget: 0, doorRate: 1,
        out: 0, outTarget: 0, outRate: 1,
        dolly: 0, dollyTarget: 0,
        seam: 0, shake: 0, nudge: 0, pop: 0, bloom: 0,
        animalOut: false
    };

    // --- the zone -----------------------------------------------------------------

    /**
     * The zone being rendered. Everything the scene looks like comes from here,
     * and setZone() below swaps it without rebuilding the scene: the canvases
     * scenery.js returns are the same size whatever the zone, so a zone change is
     * an upload of new pixels to textures that already exist.
     *
     * Defaulted rather than read from settings at load time, because this file is
     * parsed before the player's zone is known; mount() picks up the real one.
     */
    let zone = NAF.Zones.byId('barn');
    let theme = zone.theme;

    /**
     * The envelope and the openings the facade is drawn to. Shared with
     * scenery.js, which draws it.
     *
     * TOP and WIDTH are the box every zone's silhouette must stay inside, because
     * they are exactly what the framing solve fits to the screen. The rest are the
     * gambrel's own dimensions and the door opening every shape has to leave
     * clear.
     */
    function geom() {
        return {
            TOP: BARN_TOP, WIDTH: BARN_W,
            EAVE_Y: EAVE_Y, KNEE_Y: KNEE_Y, KNEE_X: KNEE_X, EAVE_X: EAVE_X,
            OPENING_HALF: OPENING_HALF, DOOR_H: DOOR_H,
            // The aquarium has no door at all - the animal swims into view
            // across the glass instead of stepping out of an opening. Told to
            // scenery.js as part of the geometry rather than the theme, since
            // it changes what shape gets drawn, not just what colour.
            NO_DOOR: (zone.doors === 'swim')
        };
    }

    // --- canvas art (delegated to scenery.js) ------------------------------------
    //
    // Thin named wrappers rather than calls scattered through buildScene, so that
    // setZone() and buildScene() ask for artwork by exactly the same name and
    // cannot drift apart.

    const S = NAF.Scenery;

    function skyCanvas(flat) { return S.sky(theme, flat); }
    function hillsCanvas() { return S.hills(theme); }
    function cloudCanvas() { return S.cloud(theme); }
    function facadeCanvas() { return S.facade(theme, geom()); }
    function doorCanvas() { return S.door(theme, zone.doors); }
    function plainDoorCanvas() { return S.plainDoor(); }
    function interiorCanvas() { return S.interior(theme); }
    function floorCanvas() { return S.floor(theme); }
    function grassCanvas() { return S.fringe(theme); }
    function shaftFloorCanvas() { return S.shaftFloor(theme); }
    function shaftHazeCanvas() { return S.shaftHaze(theme); }
    function fenceCanvas() { return S.dressing(theme); }
    function flowersCanvas() { return S.bed(theme); }
    function glowCanvas() { return S.glow(theme); }
    function dotCanvas() { return S.dot(theme); }

    function tex(c, srgb) {
        const t = new THREE.CanvasTexture(c);
        if (srgb !== false && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
        return t;
    }

    function plane(w, h, material) {
        return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    }

    // --- build ------------------------------------------------------------------

    function supported() {
        try {
            if (typeof THREE === 'undefined') return false;
            const c = document.createElement('canvas');
            return !!(window.WebGLRenderingContext &&
                (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
        } catch (e) {
            return false;
        }
    }

    function mount(container) {
        if (!supported()) return false;
        // The zone the player is actually in. Read here rather than at load time,
        // because settings.js may not have been read when this file was parsed.
        zone = NAF.Zones.current();
        theme = zone.theme;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
        } catch (e) {
            console.warn('[NAF] WebGL failed to start, falling back to the Simple renderer:', e);
            renderer = null;
            return false;
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = 'naf-stage-canvas';
        container.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.5, 180);
        camera.position.set(0, CAM_Y, CAM_Z_REST);
        camera.lookAt(0, LOOK_Y, -8);

        buildScene();
        setPreset(preset);
        resize();

        mounted = true;
        clock0 = performance.now();
        loop();
        return true;
    }

    function buildScene() {
        // Every zone-dependent texture comes from the cache, so the set built
        // here is the same set a later setZone reuses rather than a duplicate.
        const t = texturesFor(zone);

        // Sky
        nodes.sky = plane(130, 76, new THREE.MeshBasicMaterial({ map: t.skyFull, depthWrite: false }));
        nodes.sky.position.set(0, 8, Z.sky);
        scene.add(nodes.sky);

        // Hills
        nodes.hills = plane(80, 20, new THREE.MeshBasicMaterial({
            map: t.hills, transparent: true, depthWrite: false
        }));
        nodes.hills.position.set(0, 6, Z.hills);
        scene.add(nodes.hills);

        // Clouds
        const cloudTex = t.cloud;
        nodes.clouds = new THREE.Group();
        // A handful at different heights and sizes, so the sky has some depth and
        // there is usually something moving somewhere in it.
        [[-34, 17, 1.1], [-14, 13, 0.8], [4, 20, 1.3], [22, 15, 0.9], [40, 22, 1.15]]
            .forEach(function (c) {
            const m = plane(14 * c[2], 7 * c[2], new THREE.MeshBasicMaterial({
                map: cloudTex, transparent: true, depthWrite: false, opacity: 0.9
            }));
            m.position.set(c[0], c[1], Z.clouds);
            nodes.clouds.add(m);
        });
        scene.add(nodes.clouds);

        // Whatever stands behind the building - a picket fence, a reef wall, a
        // line of acacias. Out past its back wall, so the doorway still looks
        // into the dark interior rather than out at the dressing.
        nodes.dressing = plane(78, 2.6, new THREE.MeshBasicMaterial({
            map: t.dressing, transparent: true, depthWrite: false
        }));
        nodes.dressing.position.set(0, 1.3, Z.fence);
        scene.add(nodes.dressing);

        // Growth out in front, one cluster each side - flowers, anemones or dry
        // scrub. Placed clear of the building's silhouette so they never sit on
        // it, and far enough back that they appear well above the cards along
        // the bottom of the screen.
        const flowerTex = t.bed;
        [-1, 1].forEach(function (side) {
            const bed = plane(15, 3.2, new THREE.MeshBasicMaterial({
                map: flowerTex, transparent: true, depthWrite: false
            }));
            bed.position.set(side * 14.5, 1.6, Z.flowers);
            // Mirror one side so the two clusters are not obviously the same art.
            bed.scale.x = side;
            scene.add(bed);
            nodes.beds = nodes.beds || [];
            nodes.beds.push(bed);
        });

        // Interior back wall - pre-blurred, which is the depth of field
        // Sized to cover everything visible through the opening while staying
        // hidden behind the barn body, so it never pokes out around the facade.
        nodes.interior = plane(13, 11, new THREE.MeshStandardMaterial({
            map: t.interior, roughness: 1, metalness: 0
        }));
        nodes.interior.position.set(0, 3.4, Z.interior);
        nodes.interior.receiveShadow = true;
        scene.add(nodes.interior);

        // A wide apron of plain grass under everything else.
        //
        // The detailed floor below only covers the barn and the near yard. On the
        // framings that push the camera well back - Pick an Animal, where two rows
        // of cards leave the barn less room - the floor's near edge stopped short
        // of the bottom of the frame, and the SKY plane's warm lower stops showed
        // through the gap as a tan band along the bottom. This is sized so it can
        // never run out, whatever distance the framing solve picks.
        //
        // Its colour is the same green as the floor texture's grass, and it uses
        // the same material type and roughness, so the two are lit identically and
        // meet without a seam.
        nodes.groundFar = plane(500, 500, new THREE.MeshStandardMaterial({
            color: 0x5b8933, roughness: 1, metalness: 0
        }));
        nodes.groundFar.rotation.x = -Math.PI / 2;
        nodes.groundFar.position.set(0, -0.05, 0);
        scene.add(nodes.groundFar);

        // Floor, running from the interior out into the yard
        const floorMat = new THREE.MeshStandardMaterial({ map: t.floor, roughness: 1, metalness: 0 });
        nodes.floor = plane(44, 40, floorMat);
        nodes.floor.rotation.x = -Math.PI / 2;
        nodes.floor.position.set(0, 0, -4);
        nodes.floor.receiveShadow = true;
        scene.add(nodes.floor);

        // The sunlight patch and the airborne haze
        nodes.shaftFloor = plane(6, 10, new THREE.MeshBasicMaterial({
            map: t.shaftFloor, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0
        }));
        nodes.shaftFloor.rotation.x = -Math.PI / 2;
        nodes.shaftFloor.position.set(0, 0.02, -13);
        scene.add(nodes.shaftFloor);

        nodes.shaftHaze = plane(5.6, 6, new THREE.MeshBasicMaterial({
            map: t.shaftHaze, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0
        }));
        nodes.shaftHaze.position.set(0, 2.9, Z.shaft);
        scene.add(nodes.shaftHaze);

        // Dust motes in the shaft
        buildDust(t.dot);

        // Animal - an outline plane behind, the animal in front. The outline is a
        // requirement of the brief, not decoration: it is what keeps the animal
        // readable against the dark interior and for a low vision player.
        nodes.animalGroup = new THREE.Group();
        nodes.animalGroup.position.set(0, 0, ANIMAL_Z_IN);

        // High contrast sits the animal against a pool of light instead of an
        // outline. The outline is the animal's own texture drawn larger and
        // tinted dark; on black there is nothing for a dark tint to read against,
        // and tinting it light stops tinting at all and just paints a second
        // copy of the animal behind the first.
        nodes.animalGlow = plane(6.4, 6.4, new THREE.MeshBasicMaterial({
            map: t.glow, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0
        }));
        nodes.animalGlow.position.set(0, 1.85, -0.06);
        nodes.animalGlow.visible = false;
        nodes.animalGroup.add(nodes.animalGlow);

        nodes.animalOutline = plane(3.7, 3.7, new THREE.MeshBasicMaterial({
            transparent: true, depthWrite: false, color: 0x1a0f0a, opacity: 0
        }));
        nodes.animalOutline.position.set(0, 1.85, -0.02);
        nodes.animalGroup.add(nodes.animalOutline);

        nodes.animal = plane(3.6, 3.6, new THREE.MeshStandardMaterial({
            transparent: true, alphaTest: 0.35, roughness: 0.9, metalness: 0,
            side: THREE.DoubleSide
        }));
        nodes.animal.material.shadowSide = THREE.DoubleSide;
        nodes.animal.position.set(0, 1.8, 0);
        nodes.animal.castShadow = true;
        nodes.animalGroup.add(nodes.animal);
        nodes.animalGroup.visible = false;
        scene.add(nodes.animalGroup);

        // Barn facade with the opening cut out
        nodes.facade = plane(26, 16, new THREE.MeshStandardMaterial({
            map: t.facade, transparent: true, alphaTest: 0.4,
            roughness: 1, metalness: 0, side: THREE.DoubleSide
        }));
        nodes.facade.position.set(0, 3, Z.barn);
        nodes.facade.receiveShadow = true;
        scene.add(nodes.facade);

        // Two leaves. Which edge each one is hinged to, which way it turns and
        // whether it turns at all is layoutDoors()' business - the geometry here
        // is only the pair of panels and the groups they hang from.
        const doorTex = t.door;
        nodes.doorTex = doorTex;
        nodes.plainDoorTex = tex(plainDoorCanvas());
        nodes.doorPanels = [];
        function door(sign) {
            const g = new THREE.Group();
            const m = plane(DOOR_W, DOOR_H, new THREE.MeshStandardMaterial({
                map: doorTex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide
            }));
            m.material.shadowSide = THREE.DoubleSide;
            m.castShadow = true;
            g.add(m);
            scene.add(g);
            nodes.doorPanels.push(m);
            return g;
        }
        nodes.doorL = door(-1);
        nodes.doorR = door(1);

        // The thin line of light at the seam, during wait-and-wonder. Sized and
        // turned by layoutDoors: down the middle between two leaves, along the
        // bottom under a hatch that lifts.
        nodes.seam = plane(1, 1, new THREE.MeshBasicMaterial({
            color: 0xffd88a, transparent: true, opacity: 0, depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        scene.add(nodes.seam);

        layoutDoors();

        // The naming bloom
        nodes.bloom = plane(16, 12, new THREE.MeshBasicMaterial({
            map: t.bloom, transparent: true, opacity: 0,
            depthWrite: false, blending: THREE.AdditiveBlending
        }));
        nodes.bloom.position.set(0, 4, Z.barn + 0.4);
        scene.add(nodes.bloom);

        // Foreground grass, a thin band, slightly out of focus
        nodes.grass = plane(30, 4, new THREE.MeshBasicMaterial({
            map: t.fringe, transparent: true, depthWrite: false
        }));
        nodes.grass.position.set(0, -1.5, Z.grass);
        scene.add(nodes.grass);

        // Lights: one warm sun, low and side-on, plus a soft sky ambient.
        // Recoloured per zone by applyTheme(); these are the barn's values.
        sun = new THREE.DirectionalLight(0xfff0cf, 2.6);
        sun.position.set(-10, 9, 10);
        sun.target.position.set(0, 0, -8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.left = -16;
        sun.shadow.camera.right = 16;
        sun.shadow.camera.top = 16;
        sun.shadow.camera.bottom = -16;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 60;
        sun.shadow.bias = -0.0012;
        scene.add(sun);
        scene.add(sun.target);

        // Warm fill from the sun side, catching the animal's edge as it steps
        // into the light. A true rim needs a shader, and a flat cutout facing the
        // camera would get nothing from a light placed behind it - so this sits
        // in front and off to the side instead, where it actually reaches.
        rim = new THREE.DirectionalLight(0xffb066, 1.1);
        rim.position.set(7, 3.5, 4);
        scene.add(rim);

        ambient = new THREE.HemisphereLight(0xbfe0ff, 0x50401f, 1.1);
        scene.add(ambient);

        applyTheme();
    }

    // --- door mechanics -----------------------------------------------------------

    /**
     * How far each leaf turns, in radians. Not one number, because the three
     * mechanics need different travel to look right: barn doors swing wide into
     * the yard, a park gate only has room to fold back against the inside of the
     * stockade before it would pass through the wall.
     */
    const SWING_OPEN = 1.95;
    const GATE_OPEN = 1.62;

    /**
     * How far off to the side the animal starts/ends up when it swims, in world
     * units. Comfortably past the eaves (EAVE_X = 7.2, so the frame's own
     * silhouette never reaches wider than that) and the framing solve only ever
     * makes the visible frame a further 4% wider than BARN_W - so anything past
     * about 7.5 is off screen at every size the solve produces.
     */
    const SWIM_OFFSCREEN_X = 9;

    /**
     * Hang the leaves for the current zone's mechanic. Called once at build and
     * again on every zone change; it only ever moves existing nodes.
     *
     *   swing  hinged at their OUTER edges, turning OUT into the open. In front
     *          of the facade, so they are seen against the wall as they swing.
     *   gate   hinged at their outer posts too, but turning IN, folding back
     *          against the inside of the stockade. Behind the facade, so the wall
     *          hides them once they are back. Hinging a pair of gates at their
     *          inner edges instead - which is what "opening inward" first
     *          suggests - swings both leaves through each other and leaves them
     *          standing edge-on in the middle of the doorway, right across
     *          whoever is walking out of it.
     *   swim   no leaves at all. Both panels are hidden and never move; the
     *          facade itself has no opening cut into it (see scenery.js), so
     *          there is nothing here for a door to be.
     */
    function layoutDoors() {
        if (!nodes.doorL) return;
        const kind = zone.doors;
        const L = nodes.doorL, R = nodes.doorR;
        const pL = nodes.doorPanels[0], pR = nodes.doorPanels[1];

        L.rotation.y = R.rotation.y = 0;
        L.position.y = R.position.y = 0;
        pL.scale.set(1, 1, 1);
        pR.scale.set(1, 1, 1);

        if (kind === 'swim') {
            L.visible = false;
            R.visible = false;
            nodes.seam.scale.set(0.001, 0.001, 1);
            return;
        }

        L.visible = true;
        R.visible = true;
        // Same hinges for both; only the direction of travel and which side
        // of the wall they are on differ.
        const inward = (kind === 'gate');
        const z = Z.barn + (inward ? -0.06 : 0.05);
        L.position.set(-OPENING_HALF, 0, z);
        R.position.set(OPENING_HALF, 0, z);
        pL.position.set(DOOR_W / 2, DOOR_H / 2, 0);
        pR.position.set(-DOOR_W / 2, DOOR_H / 2, 0);

        nodes.seam.scale.set(0.32, DOOR_H * 0.92, 1);
        nodes.seam.position.set(0, DOOR_H / 2, Z.barn + 0.12);
    }

    /** How far the leaves have travelled, 0..1, applied per mechanic. Does
     *  nothing for 'swim' - there are no leaves to drive. */
    function driveDoors(d, shake) {
        const kind = zone.doors;
        if (kind === 'swim') return;
        // A gate turns the other way from a barn door, which is the whole of
        // what makes it fold inward rather than swing out.
        const gate = (kind === 'gate');
        const travel = (gate ? GATE_OPEN : SWING_OPEN) * (gate ? -1 : 1);
        nodes.doorL.rotation.y = -d * travel + shake;
        nodes.doorR.rotation.y = d * travel - shake;
    }

    // --- theming ------------------------------------------------------------------

    /** Every colour that is a light or a material tint rather than a canvas. */
    function applyTheme() {
        if (!scene) return;
        sun.color.setHex(theme.sun);
        rim.color.setHex(theme.rim);
        ambient.color.setHex(theme.ambientSky);
        ambient.groundColor.setHex(theme.ambientGround);
        // The wide apron under everything is the near end of the ground ramp, so
        // it meets the detailed floor without a seam wherever the floor runs out.
        nodes.groundFar.material.color.set(theme.ground[2]);
        nodes.groundFar.material.needsUpdate = true;
        nodes.seam.material.color.setHex(theme.seam);
    }

    /**
     * Every texture a zone needs, drawn once and kept.
     *
     * The menu previews a zone as the highlight lands on it, which means a zone
     * change can happen on every scan tick. Redrawing a 1024x1024 facade, a
     * blurred interior and a floor on each of those was a visible hitch, so the
     * set is built on the zone's first visit and reused after that. Three zones
     * of flat art is a small, bounded amount of GPU memory, and it is freed with
     * the renderer in destroy().
     */
    const zoneTex = {};

    function texturesFor(z) {
        if (zoneTex[z.id]) return zoneTex[z.id];
        // The canvas wrappers read the module-level `theme`, so point it at the
        // zone being built and put it back afterwards. setZone is the only caller
        // and sets it properly straight after, but a half-applied theme is the
        // kind of thing that bites later.
        const wasZone = zone, wasTheme = theme;
        zone = z; theme = z.theme;
        const t = {
            skyFull: tex(skyCanvas(false)),
            skyFlat: tex(skyCanvas(true)),
            hills: tex(hillsCanvas()),
            cloud: tex(cloudCanvas()),
            facade: tex(facadeCanvas()),
            interior: tex(interiorCanvas()),
            floor: tex(floorCanvas()),
            fringe: tex(grassCanvas()),
            shaftFloor: tex(shaftFloorCanvas()),
            shaftHaze: tex(shaftHazeCanvas()),
            bloom: tex(shaftHazeCanvas()),
            dressing: tex(fenceCanvas()),
            bed: tex(flowersCanvas()),
            glow: tex(glowCanvas()),
            dot: tex(dotCanvas()),
            door: tex(doorCanvas())
        };
        zone = wasZone; theme = wasTheme;
        zoneTex[z.id] = t;
        return t;
    }

    /** Point a material at a texture. Never disposes: the cache owns them. */
    function useTex(material, t) {
        if (material.map === t) return;
        material.map = t;
        material.needsUpdate = true;
    }

    /**
     * Move the whole stage to another zone.
     *
     * Nothing is added or removed: every plane keeps its size, its position and
     * its place in the draw order, and only its pixels and the door rig change.
     * That is what keeps the camera framing solve valid across a zone change -
     * the silhouettes differ, but they are drawn inside the same envelope, which
     * is the only thing the solve fits.
     */
    function setZone(z) {
        zone = z || NAF.Zones.byId('barn');
        theme = zone.theme;
        if (!scene) return;

        const t = texturesFor(zone);

        // The sky is left to setPreset at the bottom of this function - it is the
        // one texture that depends on the preset as well as the zone.
        useTex(nodes.hills.material, t.hills);
        useTex(nodes.facade.material, t.facade);
        useTex(nodes.interior.material, t.interior);
        useTex(nodes.floor.material, t.floor);
        useTex(nodes.grass.material, t.fringe);
        useTex(nodes.shaftFloor.material, t.shaftFloor);
        useTex(nodes.shaftHaze.material, t.shaftHaze);
        useTex(nodes.bloom.material, t.bloom);
        useTex(nodes.dressing.material, t.dressing);
        useTex(nodes.animalGlow.material, t.glow);
        if (dust) useTex(dust.material, t.dot);

        // The clouds and the two beds each share one texture between several
        // planes.
        nodes.clouds.children.forEach(function (c) { useTex(c.material, t.cloud); });
        nodes.beds.forEach(function (b) { useTex(b.material, t.bed); });

        // The doors keep their own texture handle, because High contrast swaps it
        // out for the plain one and has to be able to swap it back.
        nodes.doorTex = t.door;

        layoutDoors();
        applyTheme();
        // Re-run the preset last: it decides which of the two door textures is on
        // the panels, and what is visible at all.
        setPreset(preset);
    }

    function buildDust(dotTex) {
        const count = 160;
        const positions = new Float32Array(count * 3);
        const seeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 4.6;
            positions[i * 3 + 1] = Math.random() * 5;
            positions[i * 3 + 2] = Z.barn - 1 - Math.random() * 8;
            seeds[i] = Math.random() * Math.PI * 2;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        dust = new THREE.Points(geo, new THREE.PointsMaterial({
            map: dotTex, size: 0.13, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true
        }));
        dust.userData.seeds = seeds;
        dust.userData.base = positions.slice();
        scene.add(dust);
    }

    // --- presets ----------------------------------------------------------------

    function setPreset(p) {
        preset = p;
        if (!scene) return;

        const full = (p === 'full');
        const bright = (p === 'bright');
        const contrast = (p === 'contrast');

        nodes.hills.visible = full;
        nodes.clouds.visible = full;
        nodes.grass.visible = full;
        // Scene dressing, so it goes with the hills and clouds: Full farm only.
        nodes.dressing.visible = full;
        nodes.beds.forEach(function (b) { b.visible = full; });
        nodes.sky.visible = full || bright;
        if (dust) dust.visible = full;

        // Bright uses the flat two-stop sky. Reasserted in BOTH directions: it
        // used only to be set on the way in, so coming back from Bright - or
        // changing zone while in it - left the wrong sky up.
        const zt = texturesFor(zone);
        useTex(nodes.sky.material, bright ? zt.skyFlat : zt.skyFull);

        if (contrast) {
            scene.background = new THREE.Color(0x000000);
            nodes.interior.visible = false;
            nodes.floor.visible = false;
            nodes.groundFar.visible = false;
            nodes.facade.visible = false;
            sun.intensity = 3.4;
            rim.intensity = 2.0;
            ambient.intensity = 0.25;
        } else {
            scene.background = null;
            nodes.interior.visible = true;
            nodes.floor.visible = true;
            nodes.groundFar.visible = true;
            nodes.facade.visible = true;
            sun.intensity = bright ? 3.0 : 2.6;
            rim.intensity = 1.1;
            ambient.intensity = bright ? 1.5 : 1.1;
        }

        // No texture on anything but the animal in High contrast: the doors keep
        // a flat fill and a hard white edge so the opening still reads.
        nodes.doorPanels.forEach(function (m) {
            m.material.map = contrast ? nodes.plainDoorTex : nodes.doorTex;
            m.material.needsUpdate = true;
        });

        // The animal must not depend on the scene lighting in High contrast, so
        // it is rendered at full brightness from its own texture.
        nodes.animal.material.emissiveIntensity = contrast ? 0.9 : 0;
        nodes.animal.material.emissive.setHex(contrast ? 0xffffff : 0x000000);
        nodes.animal.material.needsUpdate = true;

        // Outline: subtle on Full farm, thickened on Bright. High contrast uses
        // the pool of light instead, so the outline is switched off entirely -
        // it is what was producing the doubled image there.
        const grow = bright ? 1.09 : 1.045;
        nodes.animalOutline.scale.set(grow, grow, 1);
        nodes.animalOutline.visible = !contrast;
        nodes.animalGlow.visible = contrast;

        // Camera dolly is off in High contrast.
        anim.dollyTarget = 0;
        camera.position.z = CAM_Z_REST;
    }

    function dollyOn() { return preset !== 'contrast'; }

    // --- animal -----------------------------------------------------------------

    const loader = { tl: null };
    function textureFor(art) {
        if (art.kind === 'canvas') return tex(art.src);
        if (!loader.tl) loader.tl = new THREE.TextureLoader();
        const t = loader.tl.load(art.src, undefined, undefined, function () {
            console.warn('[NAF] Could not load art "' + art.src + '".');
        });
        if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }

    function setAnimal(a) {
        animal = a;
        poseTex = {};
        if (!a || !scene) return;
        ['idle', 'call', 'happy'].forEach(function (pose) {
            poseTex[pose] = textureFor(NAF.Animals.artFor(a, pose));
        });
        const s = (a.scale || 1) * REVEAL_SCALE;
        nodes.animalGroup.scale.set(s, s, 1);
        bobPhase = (a.id.charCodeAt(0) % 17) / 17 * Math.PI * 2;
        setPose('idle');
    }

    function setPose(pose) {
        const t = poseTex[pose] || poseTex.idle;
        if (!t || !nodes.animal) return;
        nodes.animal.material.map = t;
        nodes.animal.material.emissiveMap = t;   // used only by High contrast
        nodes.animal.material.needsUpdate = true;
        nodes.animalOutline.material.map = t;
        nodes.animalOutline.material.alphaTest = 0.35;
        nodes.animalOutline.material.needsUpdate = true;
    }

    /**
     * Where the animal comes to rest. For every zone but the aquarium this is
     * also where position.x is set immediately, since the animal simply fades
     * and grows in place. The aquarium remembers it instead, as restX, and
     * lets the loop drive position.x every frame between the swim's start/end
     * point (swimTargetX) and here - see bringOut/putAway and the loop below.
     */
    let restX = 0;
    /**
     * Which edge the animal swims in from: +1 is screen-right (see setPosition,
     * where 'right' is +x). ALWAYS the right, so every aquarium animal travels
     * right to left.
     *
     * This used to pick a side at random each reveal, for variety. That was a
     * mistake, because the artwork does not turn round: every fish, the shark,
     * the dolphin, the orca and the rest are all drawn facing LEFT. Swimming in
     * from the left meant travelling right while pointing left - the animal
     * moving backwards, tail first, which is exactly how it read on screen.
     * Variety is not worth an animal that appears to swim backwards half the
     * time, so the direction now follows the art instead of a coin flip.
     */
    const SWIM_IN_FROM = 1;
    let swimSide = SWIM_IN_FROM;
    let swimTargetX = 0;

    function setPosition(where) {
        const x = where === 'left' ? -1.7 : (where === 'right' ? 1.7 : 0);
        restX = x;
        if (zone.doors !== 'swim' && nodes.animalGroup) nodes.animalGroup.position.x = x;
    }

    function setMotion(m) { motion = m; }

    // --- the beats --------------------------------------------------------------

    function nudge() { anim.nudge = 1; }

    function anticipate(ms) {
        anim.shake = 1;
        anim.seam = 1;
        anim.shakeMs = ms;
    }

    function openDoors(ms) {
        anim.doorTarget = 1;
        anim.doorRate = 1000 / Math.max(120, ms);
        if (dollyOn()) anim.dollyTarget = 1;
    }

    function closeDoors(ms) {
        anim.doorTarget = 0;
        anim.doorRate = 1000 / Math.max(120, ms);
        anim.dollyTarget = 0;
    }

    function bringOut(ms) {
        anim.animalOut = true;
        anim.outTarget = 1;
        anim.outRate = 1000 / Math.max(120, ms);
        if (zone.doors === 'swim') {
            // In from the right, every time - see SWIM_IN_FROM.
            swimSide = SWIM_IN_FROM;
            swimTargetX = swimSide * SWIM_OFFSCREEN_X;
        }
        if (nodes.animalGroup) nodes.animalGroup.visible = true;
    }

    function putAway(ms) {
        anim.outTarget = 0;
        anim.outRate = 1000 / Math.max(120, ms);
        anim.animalOut = false;
        if (zone.doors === 'swim') {
            // Swims on across the tank and out the OPPOSITE side it came in,
            // rather than reversing back the way it arrived - which keeps it
            // pointing the way it is going for the whole reveal, and is the
            // other half of not looking like it swims backwards.
            swimTargetX = -swimSide * SWIM_OFFSCREEN_X;
        }
    }

    function pop() { anim.pop = 1; }
    function bloom() { anim.bloom = 1; }

    function reset() {
        anim.doorTarget = 0; anim.door = 0;
        anim.outTarget = 0; anim.out = 0;
        anim.dollyTarget = 0;
        anim.seam = 0; anim.shake = 0; anim.pop = 0; anim.bloom = 0; anim.nudge = 0;
        anim.animalOut = false;
        if (nodes.animalGroup) nodes.animalGroup.visible = false;
    }

    // --- loop -------------------------------------------------------------------

    function approach(current, target, rate, dt) {
        if (current === target) return target;
        const step = rate * dt;
        if (current < target) return Math.min(target, current + step);
        return Math.max(target, current - step);
    }

    let last = 0;
    function loop() {
        raf = requestAnimationFrame(loop);
        if (!renderer || !scene) return;

        const now = performance.now();
        const dt = Math.min(0.05, (now - (last || now)) / 1000);
        last = now;
        const t = (now - clock0) / 1000;

        anim.door = approach(anim.door, anim.doorTarget, anim.doorRate, dt);
        anim.out = approach(anim.out, anim.outTarget, anim.outRate, dt);
        anim.dolly = approach(anim.dolly, anim.dollyTarget, 0.9, dt);
        anim.seam = Math.max(0, anim.seam - dt * 0.9);
        anim.shake = Math.max(0, anim.shake - dt * 1.1);
        anim.nudge = Math.max(0, anim.nudge - dt * 4);
        anim.pop = Math.max(0, anim.pop - dt * 2.6);
        anim.bloom = Math.max(0, anim.bloom - dt * 1.4);

        // Doors. Ease out so the travel settles rather than stopping dead. What
        // that travel IS - a swing, a lift or a gate folding inward - is the
        // zone's, and driveDoors is the only place that knows the difference.
        const d = 1 - Math.pow(1 - anim.door, 2.2);
        const shake = anim.shake > 0 ? Math.sin(t * 40) * 0.035 * anim.shake : 0;
        driveDoors(d, shake);

        // The seam of warm light, pulsing while the player waits and wonders.
        nodes.seam.material.opacity = anim.seam * (0.55 + 0.45 * Math.sin(t * 7)) * (1 - d);

        // The shaft opens up as the doors do.
        nodes.shaftFloor.material.opacity = d * (preset === 'contrast' ? 0.5 : 0.85);
        nodes.shaftHaze.material.opacity = d * (preset === 'contrast' ? 0.25 : 0.5);
        if (dust) {
            dust.material.opacity = d * 0.75;
            const base = dust.userData.base;
            const seeds = dust.userData.seeds;
            const pos = dust.geometry.attributes.position;
            for (let i = 0; i < seeds.length; i++) {
                pos.array[i * 3] = base[i * 3] + Math.sin(t * 0.35 + seeds[i]) * 0.6;
                pos.array[i * 3 + 1] = base[i * 3 + 1] + ((t * 0.22 + seeds[i]) % 2.4) - 1.2;
                pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.28 + seeds[i]) * 0.5;
            }
            pos.needsUpdate = true;
        }

        // The animal moves forward on Z, growing with real perspective. Overshoot
        // on arrival, then a squash as it lands. The aquarium replaces the Z
        // move with a swim across X instead - see bringOut/putAway/setPosition
        // above for swimTargetX/restX/swimSide - because there is no dark
        // interior for it to walk out of, only open water it is already in.
        if (nodes.animalGroup.visible) {
            const o = anim.out;
            const eased = o < 1 ? 1 - Math.pow(1 - o, 3) : 1;
            const overshoot = o >= 1 ? 0 : Math.sin(o * Math.PI) * 0.35;

            if (zone.doors === 'swim') {
                nodes.animalGroup.position.z = ANIMAL_Z_OUT;
                nodes.animalGroup.position.x = swimTargetX + (restX - swimTargetX) * eased;
            } else {
                nodes.animalGroup.position.z = ANIMAL_Z_IN + (ANIMAL_Z_OUT - ANIMAL_Z_IN) * eased + overshoot;
            }

            const amp = motion === 'still' ? 0 : (motion === 'gentle' ? 0.45 : 1);
            const bob = anim.animalOut ? Math.sin(t * 1.5 + bobPhase) * 0.16 * amp : 0;
            const tilt = anim.animalOut ? Math.sin(t * 1.15 + bobPhase) * 0.035 * amp : 0;
            const popScale = 1 + anim.pop * 0.16;
            const squash = 1 - anim.pop * 0.10;

            nodes.animal.position.y = 1.8 + bob;
            nodes.animalOutline.position.y = 1.85 + bob;
            nodes.animal.rotation.z = tilt;
            nodes.animalOutline.rotation.z = tilt;
            nodes.animal.scale.set(popScale, squash, 1);

            const s = (animal ? (animal.scale || 1) : 1) * REVEAL_SCALE;
            nodes.animalGroup.scale.set(s * (0.55 + 0.45 * eased), s * (0.55 + 0.45 * eased), 1);
            nodes.animalOutline.material.opacity = o * 0.75;
            nodes.animalGlow.material.opacity = o * 0.9;
            nodes.animalGlow.position.y = 1.85 + bob * 0.5;
            nodes.animal.material.opacity = o;
            if (o <= 0.001 && !anim.animalOut) nodes.animalGroup.visible = false;
        }

        nodes.bloom.material.opacity = anim.bloom * 0.55;

        // The weather, over a slow few minutes. Only the SKY and the CLOUDS move:
        // the sun and the ambient are deliberately left alone, because the DOM
        // band behind the choice cards is matched to a measured grass colour and
        // drifting the lighting would open that seam back up.
        if (nodes.sky.visible) {
            const phase = (t % WEATHER_CYCLE) / WEATHER_CYCLE;   // 0..1
            const warm = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);          // hazy noon <-> golden
            const cover = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2 - 1.1);   // clear <-> cloudy

            nodes.sky.material.color.setRGB(
                1.0 - 0.04 * (1 - warm),
                0.98 + 0.02 * warm,
                0.92 + 0.08 * (1 - warm)
            );

            nodes.clouds.children.forEach(function (c, i) {
                // Drift speed breathes with the weather: still on a clear day,
                // brisker when it clouds over.
                c.position.x += dt * (0.12 + i * 0.05 + cover * 0.5);
                if (c.position.x > 52) c.position.x = -52;
                c.material.opacity = 0.32 + cover * 0.62;
                c.scale.setScalar(0.85 + cover * 0.4);
            });
        }

        // The camera: a dolly on Z and a very slight idle drift. Nothing else.
        const dollyEase = 1 - Math.pow(1 - anim.dolly, 2);
        camera.position.z = CAM_Z_REST + (CAM_Z_DOLLY - CAM_Z_REST) * dollyEase;
        camera.position.x = Math.sin(t * 0.13) * 0.10;
        camera.position.y = CAM_Y + Math.sin(t * 0.17) * 0.05 - anim.nudge * 0.05;
        camera.lookAt(0, LOOK_Y, -8);

        renderer.render(scene, camera);
    }

    /**
     * Frame the barn inside the band of screen the interface is not using.
     *
     * The camera always looks at (0, LOOK_Y, -8), so at the barn plane the frame
     * spans a height H = 2*d*tan(fov/2) centred on LOOK_Y. For a world height y
     * the fraction down the screen is (LOOK_Y + H/2 - y) / H, which gives
     *
     *     base (y = 0)         fb = 0.5 + LOOK_Y / H
     *     apex (y = BARN_TOP)  fa = fb - BARN_TOP / H
     *
     * so H = BARN_TOP / (fb - fa) and LOOK_Y = (fb - 0.5) * H. Two targets in,
     * an exact camera out - no magic numbers, and it re-solves on every resize
     * and whenever the interface below the barn changes size.
     *
     * The solve is done for the CLOSEST point of the dolly. Pulling back from
     * there only ever moves the roof down and the base up, so the barn cannot
     * grow into the stamp board or the choice row at any point in the reveal.
     */
    function setSafeArea(topPx, bottomPx, heightPx, bottomMargin) {
        if (!camera || !heightPx) return;
        // Asymmetric on purpose. Above the barn there is only the thin stamp row,
        // so a small margin there gives back height that would be wasted. Below,
        // the caller decides: the doors swing wide open and need real room when
        // something sits directly under them.
        const fa = Math.max(0, (topPx + 8) / heightPx);
        const fb = Math.min(1, (bottomPx - (bottomMargin === undefined ? 30 : bottomMargin)) / heightPx);

        // Never let the solve blow up if the band is squeezed to nothing.
        const span = Math.max(0.20, Math.min(0.92, fb - fa));
        const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

        // Fit the barn's HEIGHT into the band...
        let H = BARN_TOP / span;

        // ...and its WIDTH into the screen. On a phone held upright the frame is
        // far narrower than it is tall, and fitting height alone put the eaves off
        // both sides. Taking whichever constraint needs the bigger frame satisfies
        // both: a bigger H means a camera further back, so a barn that fits.
        const aspect = camera.aspect || 1;
        const widthH = (BARN_W * 1.04) / aspect;
        if (widthH > H) H = widthH;

        // The upper bound is generous on purpose: clamping the solve short is
        // what would let the barn spill out of the band it was given.
        let d = THREE.MathUtils.clamp(H / (2 * tanHalf), 11, 140);
        H = 2 * d * tanHalf;

        LOOK_Y = (fb - 0.5) * H;
        CAM_Y = LOOK_Y - 0.5;               // the slight upward look the art assumes
        CAM_Z_DOLLY = Z.barn + d;
        CAM_Z_REST = CAM_Z_DOLLY + DOLLY_RANGE;
    }

    /**
     * Where the barn's roof apex and floor land on screen, in CSS pixels. The
     * DOM layer does not need this, but it is the only way to prove the framing
     * solve above really keeps the barn inside the band it was given.
     */
    const spanV = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
    function barnScreenSpan() {
        if (!renderer || !camera || !spanV) return null;
        const h = renderer.domElement.clientHeight;
        const w = renderer.domElement.clientWidth;
        function yOf(worldY) {
            spanV.set(0, worldY, Z.barn).project(camera);
            return (-spanV.y * 0.5 + 0.5) * h;
        }
        function xOf(worldX) {
            spanV.set(worldX, 0, Z.barn).project(camera);
            return (spanV.x * 0.5 + 0.5) * w;
        }
        return {
            apex: yOf(BARN_TOP), base: yOf(0),
            left: xOf(-EAVE_X), right: xOf(EAVE_X),
            height: h, width: w
        };
    }

    function resize() {
        if (!renderer || !camera) return;
        const parent = renderer.domElement.parentNode;
        if (!parent) return;
        const w = parent.clientWidth || window.innerWidth;
        const h = parent.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        // Widen the field of view on a tall screen so the barn still fits.
        camera.fov = camera.aspect < 1 ? 56 : 40;
        camera.updateProjectionMatrix();
    }

    function destroy() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        mounted = false;
        if (renderer) {
            if (renderer.domElement && renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
            renderer.dispose();
        }
        // The cached zone textures belong to the renderer that uploaded them, so
        // they go with it. Keeping them would hand stale GL handles to the next
        // mount, which is the sort of failure that shows up as a black scene.
        Object.keys(zoneTex).forEach(function (id) {
            const set = zoneTex[id];
            Object.keys(set).forEach(function (k) {
                if (set[k] && set[k].dispose) set[k].dispose();
            });
            delete zoneTex[id];
        });
        renderer = null; scene = null; camera = null; dust = null;
    }

    return {
        id: '3d',
        supported: supported,
        mount: mount,
        destroy: destroy,
        resize: resize,
        setPreset: setPreset,
        setZone: setZone,
        setMotion: setMotion,
        setPosition: setPosition,
        setAnimal: setAnimal,
        setPose: setPose,
        setSafeArea: setSafeArea,
        barnScreenSpan: barnScreenSpan,
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
