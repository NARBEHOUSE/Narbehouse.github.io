// Hardwood court: procedural maple planks, painted lines and branding, optional live floor reflections.
// World units are feet. The rim centre is at (0, 10, -9.2); the backboard face is at z = -10.4.
(function () {
    const BASELINE = -14.4;            // 4 ft behind the backboard face
    const RIM_Z = -9.2;
    const FT_LINE = BASELINE + 19;     // free-throw line
    const THREE_R = 27;                // 3-point arc (stylised to match the game's 25 ft two / 30 ft three)
    const THREE_X = 24;                // corner three distance from centre
    const HALF = BASELINE + 47;        // half-court line
    const AREA = { x0: -32, x1: 32, z0: -20, z1: 44 };   // feet covered by the court texture
    const PX = 32;                     // texture pixels per foot
    const TEAM = '#123c8c', TEAM_DARK = '#0b2357', ACCENT = '#f2a900';

    function rand(seed) { // small deterministic PRNG so the floor looks the same every load
        let s = seed >>> 0;
        return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }

    function drawWood(ctx, w, h, rnd) {
        const plankW = 0.1875 * PX; // 2.25 inch boards running toward the basket
        for (let x = 0, i = 0; x < w; x += plankW, i++) {
            const tone = 0.88 + rnd() * 0.16;
            const r = Math.round(232 * tone), g = Math.round(190 * tone), b = Math.round(132 * tone);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, 0, plankW + 0.5, h);
            // board ends (staggered joints)
            let y = -rnd() * 10 * PX;
            while (y < h) {
                y += (4 + rnd() * 8) * PX;
                ctx.fillStyle = 'rgba(90,55,25,0.35)';
                ctx.fillRect(x, y, plankW, 1.2);
            }
            // grain streaks
            ctx.strokeStyle = `rgba(120,75,35,${0.08 + rnd() * 0.08})`;
            ctx.lineWidth = 0.8;
            for (let k = 0; k < 3; k++) {
                const gx = x + rnd() * plankW;
                ctx.beginPath();
                ctx.moveTo(gx, 0);
                for (let gy = 0; gy < h; gy += 40) ctx.lineTo(gx + Math.sin(gy * 0.01 + i) * 1.4, gy);
                ctx.stroke();
            }
            // seam between boards
            ctx.fillStyle = 'rgba(70,40,15,0.28)';
            ctx.fillRect(x, 0, 0.8, h);
        }
    }

    function buildTexture(logoImg) {
        const W = (AREA.x1 - AREA.x0) * PX, H = (AREA.z1 - AREA.z0) * PX;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const X = x => (x - AREA.x0) * PX, Z = z => (z - AREA.z0) * PX;
        const rnd = rand(1984);

        drawWood(ctx, W, H, rnd);

        // Out-of-bounds apron in team colour, inside the court a lighter natural maple
        ctx.save();
        ctx.fillStyle = TEAM_DARK;
        ctx.globalAlpha = 0.93;
        ctx.fillRect(0, 0, W, Z(BASELINE));                       // behind the baseline
        ctx.fillRect(0, 0, X(-25), H);                            // left of the sideline
        ctx.fillRect(X(25), 0, W - X(25), H);                     // right of the sideline
        ctx.restore();

        // Darker stain outside the 3-point line for depth
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(-25), Z(BASELINE), X(25) - X(-25), Z(AREA.z1) - Z(BASELINE));
        ctx.moveTo(X(-THREE_X), Z(BASELINE));
        ctx.lineTo(X(-THREE_X), Z(RIM_Z + Math.sqrt(THREE_R ** 2 - THREE_X ** 2)));
        ctx.arc(X(0), Z(RIM_Z), THREE_R * PX, Math.PI - Math.acos(THREE_X / THREE_R), Math.acos(THREE_X / THREE_R), true);
        ctx.lineTo(X(THREE_X), Z(BASELINE));
        ctx.closePath();
        ctx.fillStyle = 'rgba(140,80,30,0.18)';
        ctx.fill('evenodd');
        ctx.restore();

        // Painted key
        ctx.fillStyle = TEAM;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(X(-8), Z(BASELINE), 16 * PX, (FT_LINE - BASELINE) * PX);
        ctx.globalAlpha = 1;

        // Lines
        const line = 0.17 * PX;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = line;
        ctx.lineCap = 'butt';
        const path = fn => { ctx.beginPath(); fn(); ctx.stroke(); };
        path(() => ctx.rect(X(-25), Z(BASELINE), 50 * PX, (HALF - BASELINE) * PX));       // boundary
        path(() => { ctx.moveTo(X(-25), Z(HALF)); ctx.lineTo(X(25), Z(HALF)); });         // half court
        path(() => ctx.rect(X(-8), Z(BASELINE), 16 * PX, (FT_LINE - BASELINE) * PX));     // key
        path(() => ctx.arc(X(0), Z(FT_LINE), 6 * PX, 0, Math.PI));                        // FT circle (court side)
        ctx.setLineDash([1.3 * PX, 1 * PX]);
        path(() => ctx.arc(X(0), Z(FT_LINE), 6 * PX, Math.PI, 2 * Math.PI));              // dashed inside the key
        ctx.setLineDash([]);
        path(() => ctx.arc(X(0), Z(RIM_Z), 4 * PX, 0, Math.PI));                          // restricted area
        path(() => {                                                                       // three-point line
            const a = Math.acos(THREE_X / THREE_R);
            ctx.moveTo(X(-THREE_X), Z(BASELINE));
            ctx.lineTo(X(-THREE_X), Z(RIM_Z + Math.sqrt(THREE_R ** 2 - THREE_X ** 2)));
            ctx.arc(X(0), Z(RIM_Z), THREE_R * PX, Math.PI - a, a, true);
            ctx.lineTo(X(THREE_X), Z(BASELINE));
        });
        for (const s of [-1, 1]) {                                                         // lane hash marks
            for (const z of [BASELINE + 7, BASELINE + 8, BASELINE + 11, BASELINE + 14]) {
                path(() => { ctx.moveTo(X(s * 8), Z(z)); ctx.lineTo(X(s * 8.7), Z(z)); });
            }
        }
        path(() => ctx.arc(X(0), Z(HALF), 6 * PX, 0, Math.PI * 2));                        // centre circle
        ctx.fillStyle = TEAM;
        ctx.beginPath(); ctx.arc(X(0), Z(HALF), 6 * PX - line, 0, Math.PI * 2); ctx.fill();

        // Wordmarks on the apron behind the baseline (readable from the court)
        ctx.save();
        ctx.fillStyle = ACCENT;
        ctx.font = `bold ${3.2 * PX}px "Bebas Neue", Impact, "Arial Black", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("BENNY'S HUB", X(-15.5), Z(BASELINE - 2.6));
        ctx.fillText("BEAMIN' BENNY", X(15.5), Z(BASELINE - 2.6));
        ctx.font = `bold ${2.4 * PX}px "Bebas Neue", Impact, "Arial Black", sans-serif`;
        ctx.fillStyle = '#ffffff';
        for (const s of [-1, 1]) {
            ctx.save();
            ctx.translate(X(s * 28.5), Z(8));
            ctx.rotate(s * Math.PI / 2);
            ctx.fillText('NARBE FOUNDATION', 0, 0);
            ctx.restore();
        }
        ctx.restore();

        // Logos: centre court and a faded one in the lane
        if (logoImg) {
            const size = 11 * PX;
            ctx.drawImage(logoImg, X(0) - size / 2, Z(HALF) - size / 2, size, size);
            ctx.globalAlpha = 0.28;
            const lane = 7 * PX;
            ctx.drawImage(logoImg, X(0) - lane / 2, Z(BASELINE + 10.5) - lane / 2, lane, lane);
            ctx.globalAlpha = 1;
        }

        // Varnish: soft sheen toward the hoop
        const sheen = ctx.createRadialGradient(X(0), Z(RIM_Z + 6), PX, X(0), Z(RIM_Z + 6), 40 * PX);
        sheen.addColorStop(0, 'rgba(255,240,210,0.10)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.10)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, W, H);
        return canvas;
    }

    function build(scene, renderer, { quality = 'high', envMap = null } = {}) {
        const group = new THREE.Group();
        scene.add(group);

        const canvas = buildTexture(null);
        const tex = new THREE.CanvasTexture(canvas);
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const mat = new THREE.MeshPhysicalMaterial({
            map: tex, color: 0xbdbdbd, roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.22,
            envMap, envMapIntensity: 0.18, transparent: false, opacity: 1,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 // always wins the depth test against the planes beneath it
        });
        const W = AREA.x1 - AREA.x0, H = AREA.z1 - AREA.z0;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set((AREA.x0 + AREA.x1) / 2, 0, (AREA.z0 + AREA.z1) / 2);
        floor.receiveShadow = true;
        group.add(floor);

        // Dark surround under the stands
        const outer = new THREE.Mesh(
            new THREE.PlaneGeometry(260, 260),
            new THREE.MeshStandardMaterial({ color: 0x0c0d14, roughness: 0.9 })
        );
        outer.rotation.x = -Math.PI / 2;
        outer.position.y = -0.3;
        outer.receiveShadow = true;
        group.add(outer);

        // Live reflections under a slightly see-through varnished floor (high quality only)
        let reflector = null;
        if (THREE.Reflector) {
            reflector = new THREE.Reflector(new THREE.PlaneGeometry(W, H), {
                textureWidth: Math.round(window.innerWidth * 0.5),
                textureHeight: Math.round(window.innerHeight * 0.5),
                clipBias: 0.003, color: 0x8a8a8a
            });
            reflector.rotation.x = -Math.PI / 2;
            reflector.position.set(floor.position.x, -0.02, floor.position.z);
            group.add(reflector);
        }

        function setQuality(q) {
            const reflect = q === 'high' && reflector;
            if (reflector) reflector.visible = !!reflect;
            mat.transparent = !!reflect;
            mat.opacity = reflect ? 0.9 : 1;
            mat.needsUpdate = true;
        }
        setQuality(quality);

        // Repaint once the logo and display font are ready
        const logo = new Image();
        logo.onload = () => {
            const redraw = () => {
                const c = buildTexture(logo);
                tex.image = c;
                tex.needsUpdate = true;
            };
            if (document.fonts && document.fonts.load) {
                Promise.race([document.fonts.load('40px "Bebas Neue"'), new Promise(r => setTimeout(r, 2500))])
                    .then(redraw, redraw);
            } else redraw();
        };
        logo.src = 'images/beamin-benny.png';

        return { group, floor, reflector, setQuality, BASELINE, RIM_Z, FT_LINE, THREE_R, HALF };
    }

    window.BB = window.BB || {};
    window.BB.Court = { build, TEAM, TEAM_DARK, ACCENT };
})();
