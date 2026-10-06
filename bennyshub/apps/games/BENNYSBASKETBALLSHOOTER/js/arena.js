// Arena: seating bowl with an animated crowd, LED ribbon and baseline boards, end-wall
// videoboard, rafter banners, ceiling light rig and light beams.
(function () {
    const FONT = '"Bebas Neue", Impact, "Arial Black", sans-serif';
    const TEAM = '#123c8c', GOLD = '#f2a900', RED = '#c8102e';

    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return [c, c.getContext('2d')];
    }
    function tex(c, { srgb = true, repeatX = 1 } = {}) {
        const t = new THREE.CanvasTexture(c);
        if (srgb) t.encoding = THREE.sRGBEncoding;
        if (repeatX !== 1) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = repeatX; }
        return t;
    }

    // ---------- Crowd ----------
    // One InstancedMesh per body part; a vertex-shader bounce driven by uExcite keeps it cheap.
    function crowdMaterial(color, uniforms) {
        const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
        m.onBeforeCompile = shader => {
            shader.uniforms.uTime = uniforms.uTime;
            shader.uniforms.uExcite = uniforms.uExcite;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;\nuniform float uExcite;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
                    float jump = uExcite * abs(sin(uTime * 7.0 + aPhase * 6.283)) * (0.6 + 0.6 * fract(aPhase * 7.13));
                    float sway = 0.05 * sin(uTime * 1.6 + aPhase * 12.0);
                    transformed.y += jump + sway;
                    transformed.x += 0.12 * uExcite * sin(uTime * 5.0 + aPhase * 9.0) * position.y;`);
        };
        return m;
    }

    function buildBowl(group, uniforms) {
        const seats = [];   // {x,y,z,ry}
        const riserMat = new THREE.MeshStandardMaterial({ color: 0x1b1e29, roughness: 0.95 });
        const fasciaMat = new THREE.MeshStandardMaterial({ color: 0x0d0f17, roughness: 0.6 });

        // Each section: rows step back along `out` and up; seats spaced along `along`.
        function section(origin, along, out, length, rows, upperGap) {
            const ry = Math.atan2(-out.x, -out.z); // seats face back toward the court
            for (let r = 0; r < rows; r++) {
                const upper = r >= upperGap;
                const step = r + (upper ? 1.5 : 0);
                const base = origin.clone().addScaledVector(out, step * 2.7);
                const y = 2 + step * 1.55 + (upper ? 3 : 0);
                // riser block
                const riser = new THREE.Mesh(new THREE.BoxGeometry(length, y, 2.7), riserMat);
                riser.position.copy(base).addScaledVector(along, length / 2);
                riser.position.y = y / 2;
                riser.rotation.y = ry;
                riser.receiveShadow = true;
                group.add(riser);
                for (let s = 0.8; s < length - 0.5; s += 2.0) {
                    const p = base.clone().addScaledVector(along, s);
                    seats.push({ x: p.x, y, z: p.z, ry, upper });
                }
            }
            // fascia between decks (ribbon board host)
            const f = origin.clone().addScaledVector(out, upperGap * 2.7 + 0.4);
            return { start: f, along, length, y: 2 + upperGap * 1.55 + 1.2, ry, out };
        }

        const fascias = [];
        fascias.push(section(new THREE.Vector3(-50, 0, -21), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), 100, 24, 12));
        fascias.push(section(new THREE.Vector3(-31, 0, -21), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), 75, 24, 12));
        fascias.push(section(new THREE.Vector3(31, 0, 54), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), 75, 24, 12));

        // Seats (all) and fans (about 75% of seats)
        const seatGeo = new THREE.BoxGeometry(1.5, 1.2, 1.3);
        seatGeo.translate(0, 0.6, 0.2);
        const seatMesh = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ color: 0x9a1b2b, roughness: 0.7 }), seats.length);
        const fans = seats.filter((s, i) => ((i * 2654435761) % 100) < 76);

        const bodyGeo = new THREE.CylinderGeometry(0.42, 0.55, 1.7, 7);
        bodyGeo.translate(0, 0.85, 0);
        const headGeo = new THREE.IcosahedronGeometry(0.34, 1);
        headGeo.translate(0, 2.05, 0);
        const bodyMesh = new THREE.InstancedMesh(bodyGeo, crowdMaterial(0xffffff, uniforms), fans.length);
        const headMesh = new THREE.InstancedMesh(headGeo, crowdMaterial(0xffffff, uniforms), fans.length);
        const phase = new Float32Array(fans.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
        const shirts = [0x123c8c, 0x123c8c, 0x1d4fb8, 0xf2a900, 0xffffff, 0xc8102e, 0x2a2a2a, 0x3d8f3d, 0x7a3fa0, 0xff7a00];
        const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x5c3a1e];
        const color = new THREE.Color();
        seats.forEach((s, i) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry);
            m.compose(pos.set(s.x, s.y, s.z), q, sc);
            seatMesh.setMatrixAt(i, m);
        });
        fans.forEach((s, i) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry);
            const h = 0.9 + ((i * 7919) % 23) / 100;
            m.compose(pos.set(s.x, s.y + 0.2, s.z), q, sc.set(1, h, 1));
            bodyMesh.setMatrixAt(i, m);
            headMesh.setMatrixAt(i, m);
            bodyMesh.setColorAt(i, color.setHex(shirts[(i * 31 + Math.floor(i / 7)) % shirts.length]));
            headMesh.setColorAt(i, color.setHex(skins[(i * 17) % skins.length]));
            phase[i] = ((i * 2246822519) % 1000) / 1000;
        });
        sc.set(1, 1, 1);
        bodyGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
        headGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
        [seatMesh, bodyMesh, headMesh].forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; group.add(mesh); });

        // A few fans holding up signs
        const signs = [];
        const signTexts = ["LET'S GO\nBENNY!", 'SWISH!', 'DEFENSE', '#1 FAN', 'BEAMIN!', 'BUCKETS!', 'HORSE\nCHAMP', 'NARBE\nNATION'];
        fans.filter((f, i) => i % 97 === 13 && !f.upper).slice(0, 18).forEach((f, i) => {
            const [c, ctx] = canvas(256, 160);
            const bg = [GOLD, '#ffffff', RED, TEAM][i % 4];
            ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 160);
            ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 152);
            ctx.fillStyle = bg === '#ffffff' || bg === GOLD ? '#111' : '#fff';
            ctx.font = `bold 58px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const lines = signTexts[i % signTexts.length].split('\n');
            lines.forEach((l, k) => ctx.fillText(l, 128, 80 + (k - (lines.length - 1) / 2) * 56));
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.8, side: THREE.DoubleSide }));
            sign.position.set(f.x, f.y + 3.1, f.z);
            sign.rotation.y = f.ry;
            sign.userData.baseY = sign.position.y;
            sign.userData.phase = i;
            group.add(sign);
            signs.push(sign);
        });

        return { fascias, signs, fanCount: fans.length };
    }

    // ---------- LED boards ----------
    function ribbonTexture(messages, h = 64) {
        const [c, ctx] = canvas(2048, h);
        ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, 2048, h);
        let x = 0;
        const seg = 2048 / messages.length;
        messages.forEach((msg, i) => {
            const g = ctx.createLinearGradient(x, 0, x + seg, 0);
            g.addColorStop(0, msg.bg[0]); g.addColorStop(1, msg.bg[1]);
            ctx.fillStyle = g; ctx.fillRect(x + 2, 3, seg - 4, h - 6);
            ctx.fillStyle = msg.fg;
            ctx.font = `bold ${Math.round(h * 0.72)}px ${FONT}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(msg.text, x + seg / 2, h / 2 + 2);
            x += seg;
        });
        // LED dot grid (kept faint: a hard 1px grid shimmers as it scrolls)
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let yy = 0; yy < h; yy += 4) ctx.fillRect(0, yy, 2048, 1);
        for (let xx = 0; xx < 2048; xx += 4) ctx.fillRect(xx, 0, 1, h);
        return tex(c, { repeatX: 1 });
    }

    const RIBBON = [
        { text: "BENNY'S HUB", fg: '#ffffff', bg: [TEAM, '#1d4fb8'] },
        { text: "LET'S GO BENNY!", fg: '#111111', bg: [GOLD, '#ffd25a'] },
        { text: 'NARBE FOUNDATION', fg: '#ffffff', bg: ['#0f6b3a', '#1d9a55'] },
        { text: 'DEFENSE!', fg: '#ffffff', bg: [RED, '#ff3b4e'] }
    ];
    const BASE_ADS = [
        { text: "BEAMIN' BENNY", fg: '#111111', bg: [GOLD, '#ffd25a'] },
        { text: 'SWISH CITY', fg: '#ffffff', bg: ['#5b1fa0', '#8a3fe0'] },
        { text: "BENNY'S HUB", fg: '#ffffff', bg: [TEAM, '#1d4fb8'] },
        { text: 'MAKE SOME NOISE', fg: '#ffffff', bg: [RED, '#ff5a3b'] }
    ];

    function ledBoard(group, w, h, texture, position, ry, scrollers) {
        const t = texture.clone();
        t.needsUpdate = true;
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.x = Math.max(1, w / 60);
        t.anisotropy = 8; // stays sharp at grazing angles instead of smearing
        // polygonOffset: the board face must always win the depth test against its housing
        const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.position.copy(position);
        mesh.rotation.y = ry;
        group.add(mesh);
        scrollers.push({ tex: t, speed: 0.025 + Math.random() * 0.01 });
        return mesh;
    }

    // ---------- Videoboard ----------
    function makeVideoboard(group) {
        const [c, ctx] = canvas(1024, 512);
        const t = tex(c);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(46, 22, 2), new THREE.MeshStandardMaterial({ color: 0x11131b, metalness: 0.6, roughness: 0.4 }));
        frame.position.set(0, 38, -51);
        group.add(frame);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(44, 20), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
        screen.position.set(0, 38, -49.9);
        group.add(screen);
        // glowing trim
        const trim = new THREE.Mesh(new THREE.BoxGeometry(46.6, 0.5, 2.2), new THREE.MeshBasicMaterial({ color: 0x3a7bff, toneMapped: false }));
        trim.position.set(0, 26.9, -51);
        group.add(trim);
        const trimTop = trim.clone(); trimTop.position.y = 49.1; group.add(trimTop);

        const logo = new Image();
        logo.src = 'images/beamin-benny.png';
        let state = { mode: 'single', score: 0, shot: '1/12', best: 0, p: null, flash: null, flashStart: 0 };

        function led() { // scanline/dot texture overlay
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            for (let y = 0; y < 512; y += 4) ctx.fillRect(0, y, 1024, 1);
            for (let x = 0; x < 1024; x += 4) ctx.fillRect(x, 0, 1, 512);
        }
        function draw(now = performance.now()) {
            const g = ctx.createLinearGradient(0, 0, 0, 512);
            g.addColorStop(0, '#061025'); g.addColorStop(1, '#0a1f4a');
            ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (state.flash && now - state.flashStart < 2400) {
                const k = (now - state.flashStart) / 2400;
                const hue = (now / 6) % 360;
                ctx.fillStyle = `hsl(${hue},90%,55%)`;
                ctx.fillRect(0, 0, 1024, 512);
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000'; ctx.lineWidth = 10;
                const size = 170 + Math.sin(k * Math.PI * 6) * 14;
                ctx.font = `bold ${size}px ${FONT}`;
                ctx.strokeText(state.flash, 512, 256); ctx.fillText(state.flash, 512, 256);
                led();
                t.needsUpdate = true;
                return true;
            }
            state.flash = null;
            if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 24, 30, 170, 175);
            ctx.fillStyle = GOLD; ctx.font = `bold 46px ${FONT}`;
            ctx.fillText("BENNY'S HUB ARENA", 600, 70);
            if (state.mode === 'horse' && state.p) {
                state.p.forEach((pl, i) => {
                    const x = i === 0 ? 300 : 760;
                    ctx.fillStyle = pl.active ? '#ffd25a' : '#9fb3d9';
                    ctx.font = `bold 54px ${FONT}`;
                    ctx.fillText(pl.name, x, 170);
                    'HORSE'.split('').forEach((ch, k) => {
                        const on = k < pl.letters;
                        ctx.fillStyle = on ? '#ff3b3b' : 'rgba(255,255,255,0.18)';
                        ctx.font = `bold 110px ${FONT}`;
                        ctx.fillText(ch, x - 160 + k * 80, 290);
                    });
                });
                ctx.fillStyle = '#ffffff'; ctx.font = `bold 48px ${FONT}`;
                ctx.fillText(state.status || 'H-O-R-S-E', 512, 420);
            } else {
                const col = (label, value, x, color) => {
                    ctx.fillStyle = '#9fb3d9'; ctx.font = `bold 44px ${FONT}`; ctx.fillText(label, x, 170);
                    ctx.fillStyle = color; ctx.font = `bold 170px ${FONT}`; ctx.fillText(value, x, 300);
                };
                col('SCORE', String(state.score), 330, '#ff5a5a');
                col('SHOT', state.shot, 620, '#5ad7ff');
                col('BEST', String(state.best), 880, '#ffd25a');
                ctx.fillStyle = '#ffffff'; ctx.font = `bold 44px ${FONT}`;
                ctx.fillText(state.status || "LET'S GO BENNY!", 512, 440);
            }
            led();
            t.needsUpdate = true;
            return false;
        }
        logo.onload = () => draw();
        draw();
        return {
            set(next) { state = Object.assign(state, next); draw(); },
            flash(text) { state.flash = text; state.flashStart = performance.now(); },
            update(now) { if (state.flash) draw(now); }
        };
    }

    // ---------- Rafter banners (replace the old posters) ----------
    function bannerTexture(kind, logo) {
        const [c, ctx] = canvas(512, 1024);
        const shape = () => {
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(512, 0); ctx.lineTo(512, 860); ctx.lineTo(256, 1010); ctx.lineTo(0, 860); ctx.closePath();
        };
        const styles = {
            logo: ['#0b2357', '#123c8c', GOLD],
            champs: ['#7a0d1d', RED, GOLD],
            jersey: ['#0b2357', '#123c8c', '#ffffff'],
            narbe: ['#0f4d2c', '#167a45', '#ffffff'],
            fame: ['#3a1863', '#5b2a96', GOLD],
            horse: ['#1a1a1a', '#333333', GOLD]
        }[kind];
        shape();
        const g = ctx.createLinearGradient(0, 0, 0, 1024);
        g.addColorStop(0, styles[1]); g.addColorStop(1, styles[0]);
        ctx.fillStyle = g; ctx.fill();
        ctx.save(); shape(); ctx.clip();
        ctx.strokeStyle = styles[2]; ctx.lineWidth = 22; shape(); ctx.stroke();
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.moveTo(30, 30); ctx.lineTo(482, 30); ctx.lineTo(482, 845); ctx.lineTo(256, 975); ctx.lineTo(30, 845); ctx.closePath(); ctx.stroke();
        ctx.restore();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const text = (t, y, size, color = '#ffffff') => {
            ctx.font = `bold ${size}px ${FONT}`; ctx.fillStyle = color; ctx.fillText(t, 256, y);
        };
        const star = (x, y, r, color) => {
            ctx.fillStyle = color; ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
                ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
        };
        if (kind === 'logo') {
            if (logo) ctx.drawImage(logo, 76, 90, 360, 370);
            text("BEAMIN'", 560, 120, GOLD); text('BENNY', 680, 140); text('HALL OF FAME', 800, 54, GOLD);
        } else if (kind === 'champs') {
            star(256, 150, 70, GOLD);
            text("BENNY'S HUB", 290, 80); text('CHAMPIONS', 400, 96, GOLD);
            ['2024', '2025', '2026'].forEach((y, i) => text(y, 540 + i * 100, 92));
        } else if (kind === 'jersey') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(150, 130); ctx.lineTo(210, 110); ctx.quadraticCurveTo(256, 160, 302, 110); ctx.lineTo(362, 130);
            ctx.lineTo(420, 230); ctx.lineTo(370, 260); ctx.lineTo(360, 620); ctx.lineTo(152, 620); ctx.lineTo(142, 260); ctx.lineTo(92, 230);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = TEAM; ctx.font = `bold 70px ${FONT}`; ctx.fillText('BENNY', 256, 300);
            ctx.font = `bold 260px ${FONT}`; ctx.fillText('1', 256, 470);
            text('RETIRED', 740, 90, GOLD); text('#1 FAN FOREVER', 840, 50);
        } else if (kind === 'narbe') {
            ctx.beginPath(); ctx.arc(256, 220, 120, 0, Math.PI * 2); ctx.fillStyle = '#ff7a00'; ctx.fill();
            ctx.strokeStyle = '#3a1a00'; ctx.lineWidth = 8;
            ctx.beginPath(); ctx.moveTo(136, 220); ctx.lineTo(376, 220); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(256, 100); ctx.lineTo(256, 340); ctx.stroke();
            ctx.beginPath(); ctx.arc(256, 220, 120, -0.9, 0.9); ctx.stroke();
            ctx.beginPath(); ctx.arc(256, 220, 120, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
            text('NARBE', 480, 140); text('FOUNDATION', 610, 82, GOLD); [0, 1, 2].forEach(i => star(146 + i * 110, 760, 40, '#ffffff'));
        } else if (kind === 'fame') {
            [0, 1, 2].forEach(i => star(146 + i * 110, 160, 46, GOLD));
            text('SHOOTOUT', 330, 92); text('LEGENDS', 440, 104, GOLD);
            text('12 FOR 12', 600, 80); text('PERFECT GAME', 700, 60);
        } else if (kind === 'horse') {
            text('H', 170, 120, GOLD); text('O', 290, 120, GOLD); text('R', 410, 120, GOLD); text('S', 530, 120, GOLD); text('E', 650, 120, GOLD);
            text('HORSE', 790, 60); text('CHAMPIONS', 850, 56);
        }
        return tex(c);
    }

    function buildBanners(group) {
        const kinds = ['champs', 'logo', 'jersey', 'narbe', 'fame', 'horse'];
        const xs = [-58, -44, -30, 30, 44, 58];
        const banners = [];
        const logo = new Image();
        kinds.forEach((kind, i) => {
            const map = bannerTexture(kind, null);
            const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.35, transparent: true, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide });
            const geo = new THREE.PlaneGeometry(10, 20);
            geo.translate(0, -10, 0); // pivot at the top edge so it sways like cloth
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(xs[i], 64, -89);
            mesh.userData.phase = i * 1.3;
            group.add(mesh);
            banners.push({ mesh, kind });
            // hanging rod
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 11, 6), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }));
            rod.rotation.z = Math.PI / 2;
            rod.position.set(xs[i], 64.1, mesh.position.z);
            group.add(rod);
        });
        logo.onload = () => {
            banners.forEach(b => {
                if (b.kind !== 'logo') return;
                b.mesh.material.map = b.mesh.material.emissiveMap = bannerTexture('logo', logo);
                b.mesh.material.needsUpdate = true;
            });
        };
        logo.src = 'images/beamin-benny.png';
        const redraw = () => banners.forEach(b => {
            if (b.kind === 'logo' && !logo.complete) return;
            b.mesh.material.map = b.mesh.material.emissiveMap = bannerTexture(b.kind, b.kind === 'logo' ? logo : null);
            b.mesh.material.needsUpdate = true;
        });
        if (document.fonts && document.fonts.load) document.fonts.load(`40px "Bebas Neue"`).then(redraw, () => {});
        return banners;
    }

    // ---------- Ceiling rig, light beams and lights ----------
    function buildRig(group) {
        const truss = new THREE.MeshStandardMaterial({ color: 0x23262f, metalness: 0.7, roughness: 0.5 });
        const glow = new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false });
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x07080d, roughness: 1 }));
        ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 78; group.add(ceiling);
        for (let i = -2; i <= 2; i++) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 150), truss);
            beam.position.set(i * 22, 70, -10); group.add(beam);
            const cross = new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 1.2), truss);
            cross.position.set(0, 70, -60 + (i + 2) * 30); group.add(cross);
        }
        const fixtures = [];
        for (let gx = -2; gx <= 2; gx++) {
            for (let gz = -2; gz <= 2; gz++) {
                const f = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 2.6), glow);
                f.position.set(gx * 22, 69, -10 + gz * 18);
                group.add(f);
                fixtures.push(f);
            }
        }
        // soft light shafts toward the key
        const beams = [];
        const beamMat = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(0xfff2d8) }, uOpacity: { value: 0.075 } },
            vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
                void main() { vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vY;
                void main() { float face = abs(dot(normalize(vN), normalize(vV)));
                    float along = smoothstep(0.0, 0.75, vY) * (1.0 - smoothstep(0.9, 1.0, vY));
                    gl_FragColor = vec4(uColor * pow(face, 2.5) * along * uOpacity, 1.0); }`,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        [[-22, -28], [22, -28], [-22, 8], [22, 8]].forEach(([x, z]) => {
            const geo = new THREE.CylinderGeometry(1.2, 9, 66, 32, 1, true);
            geo.translate(0, -33, 0);
            const mat = beamMat;
            const cone = new THREE.Mesh(geo, mat);
            cone.position.set(x, 69, z);
            cone.lookAt(0, 0, -9);
            cone.rotateX(-Math.PI / 2);
            group.add(cone);
            beams.push(cone);
        });
        return { fixtures, beams };
    }

    function build(scene, { quality = 'high' } = {}) {
        const group = new THREE.Group();
        scene.add(group);
        const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
        const bowl = buildBowl(group, uniforms);
        const scrollers = [];
        const ribbonTex = ribbonTexture(RIBBON, 64);
        bowl.fascias.forEach(f => {
            const center = f.start.clone().addScaledVector(f.along, f.length / 2);
            center.y = f.y;
            const mesh = ledBoard(group, f.length - 4, 2.6, ribbonTex, center, f.ry, scrollers);
            mesh.position.addScaledVector(f.out, -0.2);
        });
        const adTex = ribbonTexture(BASE_ADS, 96);
        ledBoard(group, 70, 2.8, adTex, new THREE.Vector3(0, 1.45, -18.12), 0, scrollers);   // just in front of the housing face (z -18.2)
        ledBoard(group, 46, 2.8, adTex, new THREE.Vector3(-28.42, 1.45, 6), Math.PI / 2, scrollers);
        ledBoard(group, 46, 2.8, adTex, new THREE.Vector3(28.42, 1.45, 6), -Math.PI / 2, scrollers);
        // board housings
        const housing = new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 0.5, metalness: 0.4 });
        [[0, -18.4, 71, 0], [-28.7, 6, 47, Math.PI / 2], [28.7, 6, 47, -Math.PI / 2]].forEach(([x, z, w, ry]) => {
            const b = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, 0.4), housing);
            b.position.set(x, 1.5, z); b.rotation.y = ry; group.add(b);
        });

        const videoboard = makeVideoboard(group);
        const banners = buildBanners(group);
        const rig = buildRig(group);

        // Lighting
        const hemi = new THREE.HemisphereLight(0x8fa6d8, 0x2a1d10, 0.22);
        scene.add(hemi);
        const key = new THREE.SpotLight(0xfff1dd, 0.95, 0, 0.42, 0.55, 1);
        key.position.set(6, 68, 6);
        key.target.position.set(0, 0, -6);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 30; key.shadow.camera.far = 110;
        key.shadow.bias = -0.0004;
        scene.add(key, key.target);
        const fills = [];
        [[-30, 60, -30], [30, 60, -30], [0, 60, 30]].forEach(([x, y, z]) => {
            const s = new THREE.SpotLight(0xdde6ff, 0.26, 0, 0.6, 0.7, 1);
            s.position.set(x, y, z); s.target.position.set(0, 0, -6);
            scene.add(s, s.target); fills.push(s);
        });
        const stands = new THREE.DirectionalLight(0x9db0ff, 0.14);
        stands.position.set(0, 40, 60);
        scene.add(stands);

        let excite = 0;
        function update(dt, now) {
            uniforms.uTime.value = now / 1000;
            excite = Math.max(0, excite - dt * 0.4);
            uniforms.uExcite.value = excite;
            scrollers.forEach(s => { s.tex.offset.x = (s.tex.offset.x + dt * s.speed) % 1; });
            banners.forEach(b => { b.mesh.rotation.z = Math.sin(now / 1700 + b.mesh.userData.phase) * 0.025; b.mesh.rotation.x = Math.sin(now / 2300 + b.mesh.userData.phase) * 0.03; });
            bowl.signs.forEach(s => { s.position.y = s.userData.baseY + Math.abs(Math.sin(now / 180 + s.userData.phase)) * (0.2 + excite * 1.2); });
            videoboard.update(now);
        }
        function setQuality(q) {
            key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
            if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
            rig.beams.forEach(b => { b.visible = q === 'high'; });
        }
        setQuality(quality);

        return {
            group, update, setQuality, videoboard,
            cheer(level = 1) { excite = Math.min(1.2, Math.max(excite, level)); },
            calm() { excite = 0; },
            keyLight: key, fanCount: bowl.fanCount
        };
    }

    window.BB = window.BB || {};
    window.BB.Arena = { build };
})();
