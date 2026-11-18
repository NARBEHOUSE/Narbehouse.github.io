/**
 * NARBE Build n Ride - what building looks like (the visuals only; js/build.js is the logic).
 *
 *   ghost(pieces, style)   a see-through preview, pulsing: 'next' (blue, the piece a button
 *                          would lay), 'undo' (red, what Undo takes back), 'plan' (gold,
 *                          the way home Connect would take). ghost(null) clears it.
 *   drop(pieces, onLand)   new track falls into place; onLand runs as it
 *                          lands (the real track is redrawn then, with a puff of dust and a click)
 *   arrow                  a chevron on the ground at the end of the track: the next piece goes here
 *   celebrate(points)      confetti and sparkles along the finished loop
 *
 * Pieces are track pieces ({ cx, cz, h, type, len }) with liftIn and liftOut; heights come
 * from the track's datum, so previews sit where the real track will.
 */

window.BNR = window.BNR || {};

BNR.BuildView = (function () {
    'use strict';

    const STYLES = {
        next: { color: '#48cfff', rail: '#ffffff', opacity: 0.62 },
        undo: { color: '#ff5a4f', rail: '#ffe1de', opacity: 0.66 },
        plan: { color: '#ffd84a', rail: '#fff6c8', opacity: 0.5 },
        // A piece that can't go down (too high, no way on, no room for a ramp, out of track): faint grey.
        blocked: { color: '#8d8a86', rail: '#c9c5bf', opacity: 0.32 }
    };
    const FALL = 0.32;             // seconds for a piece to drop into place
    const HIGH = 7;                // ...from this far above

    function create(THREE, o) {
        const root = new THREE.Group();
        root.name = 'build view';
        o.scene.add(root);
        const track = o.track;
        // Previews draw over everything (they still show where the track goes into a hill).
        const ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false });
        const dropMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        const arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff'), transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false });
        let ghost = null, ghostStyle = null, t = 0;
        let falling = null;     // { mesh, t, onLand, pieces }

        /** Samples along a piece: position, tangent, height (datum + eased lift). */
        function samples(p, step) {
            const n = Math.max(2, Math.round(p.len / (step || 1)));
            const out = [];
            for (let k = 0; k <= n; k++) {
                const u = k / n;
                const q = BNR.Track.piecePoint(p, u);
                const e = u * u * (3 - 2 * u);
                const lift = (p.liftIn || 0) + ((p.liftOut || 0) - (p.liftIn || 0)) * e;
                out.push({ x: q.x, z: q.z, tx: q.tx, tz: q.tz, rx: -q.tz, rz: q.tx, y: track.datumAt(q.x, q.z) + lift });
            }
            return out;
        }

        /** See-through preview: a bed and two bright rails. */
        function ghostGeometry(list, st) {
            const b = BNR.Geo.builder();
            list.forEach(function (p, idx) {
                const S = samples(p, 1);
                for (let k = 0; k + 1 < S.length; k++) {
                    const a = S[k], c = S[k + 1];
                    const P = (s, lat, up) => [s.x + s.rx * lat, s.y + up, s.z + s.rz * lat];
                    b.quad(P(a, -2.1, 0.08), P(c, -2.1, 0.08), P(c, 2.1, 0.08), P(a, 2.1, 0.08), st.color);
                    [-0.75, 0.75].forEach(function (lat) {
                        b.quad(P(a, lat - 0.13, 0.5), P(c, lat - 0.13, 0.5), P(c, lat + 0.13, 0.5), P(a, lat + 0.13, 0.5), st.rail);
                    });
                }
                // An arrowhead on the last piece shows which way it runs.
                if (idx === list.length - 1) {
                    const e = S[S.length - 1];
                    const tip = [e.x + e.tx * 3.2, e.y + 0.6, e.z + e.tz * 3.2];
                    b.tri([e.x + e.rx * 2.2, e.y + 0.6, e.z + e.rz * 2.2], tip, [e.x - e.rx * 2.2, e.y + 0.6, e.z - e.rz * 2.2], st.rail);
                }
            });
            return b.geometry();
        }

        /** Solid new track, as it will look once down: ballast, sleepers and rails. */
        function dropGeometry(list) {
            const b = BNR.Geo.builder();
            let next = 0.4;
            list.forEach(function (p) {
                const S = samples(p, 1);
                let s0 = 0;
                for (let k = 0; k + 1 < S.length; k++) {
                    const a = S[k], c = S[k + 1];
                    const len = Math.hypot(c.x - a.x, c.z - a.z);
                    const P = (s, lat, up) => [s.x + s.rx * lat, s.y + up, s.z + s.rz * lat];
                    b.quad(P(a, -1.65, 0), P(c, -1.65, 0), P(c, 1.65, 0), P(a, 1.65, 0), '#9a948a');
                    b.quad(P(a, -2.5, -0.62), P(c, -2.5, -0.62), P(c, -1.65, 0), P(a, -1.65, 0), '#857f75');
                    b.quad(P(a, 1.65, 0), P(c, 1.65, 0), P(c, 2.5, -0.62), P(a, 2.5, -0.62), '#857f75');
                    [-0.75, 0.75].forEach(lat => b.beam(P(a, lat, 0.34), P(c, lat, 0.34), 0.22, 0.24, '#7d8189'));
                    while (next < s0 + len) {
                        const u = (next - s0) / len;
                        const x = a.x + (c.x - a.x) * u, y = a.y + (c.y - a.y) * u, z = a.z + (c.z - a.z) * u;
                        b.box(x, y + 0.11, z, 2.55, 0.22, 0.42, '#6b4a33', { ry: Math.atan2(a.tx, a.tz) });
                        next += 1.15;
                    }
                    s0 += len;
                    next -= s0; s0 = 0;
                }
            });
            return b.geometry();
        }

        // --- the end arrow ------------------------------------------------------------------------
        const arrowGeo = new THREE.BufferGeometry();
        // A chevron pointing the way the track runs (+z before it is turned): two triangles.
        arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-2.4, 0, -1.2, 0, 0, 0.2, 0, 0, 1.8, 0, 0, 0.2, 2.4, 0, -1.2, 0, 0, 1.8], 3));
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.name = 'next piece arrow';
        arrow.renderOrder = 31;
        root.add(arrow);
        const endP = { x: 0, y: 0, z: 0, h: 1 };
        function placeArrow() {
            if (track.closed()) { arrow.visible = false; return; }
            const e = track.end();
            const d = BNR.Track.DIRS[e.h];
            const x = (e.cx + 0.5 - d[0] * 0.5) * BNR.Track.TILE, z = (e.cz + 0.5 - d[1] * 0.5) * BNR.Track.TILE;
            endP.x = x + d[0] * 3; endP.z = z + d[1] * 3; endP.h = e.h;
            endP.y = track.datumAt(x, z) + e.lift;
            arrow.position.set(endP.x, endP.y + 0.7, endP.z);
            arrow.rotation.set(0, Math.atan2(d[0], d[1]), 0);
            arrow.visible = !ghost && !falling;
        }

        // --- the API --------------------------------------------------------------------------------

        function setGhost(list, style) {
            if (ghost) { root.remove(ghost); ghost.geometry.dispose(); ghost = null; }
            ghostStyle = null;
            if (list && list.length) {
                const st = STYLES[style] || STYLES.next;
                ghost = new THREE.Mesh(ghostGeometry(list, st), ghostMat);
                ghost.renderOrder = 30;
                ghost.name = 'ghost ' + style;
                root.add(ghost);
                ghostStyle = st;
            }
            placeArrow();
        }

        function land() {
            if (!falling) return;
            const f = falling;
            falling = null;
            root.remove(f.mesh);
            f.mesh.geometry.dispose();
            // Dust where it landed.
            f.pieces.forEach(function (p) {
                const q = BNR.Track.piecePoint(p, 0.5);
                BNR.FX.dust(q.x, track.datumAt(q.x, q.z) + (p.liftOut || 0) + 0.3, q.z, 6, 1.0, '#e8dcc6');
            });
            if (f.onLand) f.onLand();
            placeArrow();
        }

        function drop(list, onLand, fall) {
            land();   // one at a time: a new press finishes the last drop at once
            if (!list || !list.length) { if (onLand) onLand(); return; }
            const mesh = new THREE.Mesh(dropGeometry(list), dropMat);
            mesh.castShadow = true;
            mesh.position.y = HIGH;
            mesh.name = 'falling track';
            root.add(mesh);
            falling = { mesh: mesh, t: 0, onLand: onLand, pieces: list, fall: fall || FALL };
            arrow.visible = false;
        }

        function update(dt) {
            t += dt;
            if (ghost && ghostStyle) ghostMat.opacity = ghostStyle.opacity * (0.7 + 0.3 * Math.sin(t * 4.2));
            if (arrow.visible) {
                arrowMat.opacity = 0.55 + 0.35 * Math.sin(t * 3.6);
                arrow.position.y = endP.y + 0.7 + 0.25 * Math.sin(t * 3.6);
            }
            if (falling) {
                falling.t += dt;
                const u = Math.min(1, falling.t / falling.fall);
                // Falls faster and faster (ease-in) and lands with a click.
                const y = u < 1 ? HIGH * (1 - u * u) : 0;
                falling.mesh.position.y = y;
                if (u >= 1) land();
            }
        }

        /** Confetti and sparkles at these points ({ x, y, z }). */
        function celebrate(points) {
            (points || []).forEach(function (p, i) {
                BNR.FX.party(p.x, p.y + 2, p.z, 6, 46);
                BNR.FX.twinkle(p.x, p.y + 4, p.z, 14, i % 2 ? '#ffd84a' : '#ffffff');
            });
        }

        placeArrow();

        return {
            root: root,
            ghost: setGhost,
            drop: drop,
            land: land,
            busy: function () { return !!falling; },
            update: update,
            refresh: placeArrow,
            celebrate: celebrate,
            end: function () { return endP; },
            setTrack: function () { placeArrow(); },
            dispose: function () {
                setGhost(null);
                if (falling) { root.remove(falling.mesh); falling.mesh.geometry.dispose(); falling = null; }
                o.scene.remove(root);
                arrowGeo.dispose(); ghostMat.dispose(); dropMat.dispose(); arrowMat.dispose();
            }
        };
    }

    return { create: create, STYLES: STYLES, FALL: FALL };
})();
