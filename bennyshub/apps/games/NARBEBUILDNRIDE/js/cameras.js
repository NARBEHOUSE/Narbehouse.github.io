/**
 * NARBE Build n Ride - the ride cameras.
 *
 *   bird    Bird's Eye: high above and behind the train, turning lazily with it
 *   chase   Third Person: just behind the train, riding the track (inside
 *           tunnels it stays in the bore)
 *   cab     Conductor: from the cab window, looking up the line
 *
 * Look: in Conductor view it turns your head Ahead > Right > Back > Left > Ahead
 * (the cycle Left, Ahead, Right, Back); in the other views it walks the camera
 * round the train in quarter turns (Behind > Right side > Front > Left side).
 * After LOOK_DRIFT seconds it eases back to Ahead / Behind on its own.
 *
 * Comfort Mode: no head bob, a longer look up the line and slower turning in
 * Conductor view, and slower Look turns everywhere.
 *
 * Everything eases; nothing cuts or spins. Changing view swoops from the old
 * view to the new one over about a second.
 */

window.BNR = window.BNR || {};

BNR.Cameras = (function () {
    'use strict';

    const U = BNR.Util;
    const VIEWS = ['bird', 'chase', 'cab'];
    const NAMES = { bird: 'Bird’s Eye', chase: 'Third Person', cab: 'Conductor' };
    const LOOK_DRIFT = 6;
    // Look steps, clockwise. Yaw offsets: + is to the train's left (see update()).
    const CAB_LOOKS = [{ name: 'Ahead', yaw: 0 }, { name: 'Right', yaw: -Math.PI / 2 }, { name: 'Back', yaw: Math.PI }, { name: 'Left', yaw: Math.PI / 2 }];
    const ORBIT_LOOKS = [{ name: 'Behind', yaw: 0 }, { name: 'Right side', yaw: Math.PI / 2 }, { name: 'Front', yaw: Math.PI }, { name: 'Left side', yaw: -Math.PI / 2 }];
    const FOV = { bird: 50, chase: 58, cab: 66 };

    function create(THREE, camera) {
        let view = 'chase';
        let look = 0, lookCur = 0, lookT = 0;
        let yawS = null, cabYaw = null, cabPitch = 0;
        let blend = 1;
        let fov = FOV.chase;
        const prevP = new THREE.Vector3(), prevT = new THREE.Vector3();
        const P = new THREE.Vector3(), T = new THREE.Vector3();
        const chaseP = new THREE.Vector3();
        let chaseReady = false, tunnelK = 0, first = true;
        const q = {}, fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), p = new THREE.Vector3(), cab = new THREE.Vector3();
        const orb = new THREE.Vector3(), onTrack = new THREE.Vector3(), mid = new THREE.Vector3();

        function looks() { return view === 'cab' ? CAB_LOOKS : ORBIT_LOOKS; }

        function setView(v) {
            if (VIEWS.indexOf(v) < 0 || v === view) return;
            prevP.copy(camera.position);
            camera.getWorldDirection(tmp);
            prevT.copy(camera.position).addScaledVector(tmp, 20);
            blend = 0;
            view = v;
            look = 0;
            lookCur = 0;
            cabYaw = null;
        }

        function nextView() { setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]); return NAMES[view]; }

        /** One Look press; returns what you now see ("Right", "Front", ...). */
        function cycleLook() {
            look = (look + 1) % 4;
            lookT = 0;
            return looks()[look].name;
        }

        /**
         * ctx: { sampler, s (the train's head), train, inTunnel, comfort, calm }
         */
        function update(dt, ctx) {
            const comfort = !!ctx.comfort;
            const train = ctx.train;
            lookT += dt;
            if (look !== 0 && lookT > LOOK_DRIFT) look = 0;
            // In a tunnel, or under other track (a corkscrew's loop above, an overpass), Third Person
            // rides low and close, below whatever is overhead, and doesn't walk round the train.
            const low = !!(ctx.inTunnel || ctx.covered);
            if (view === 'chase' && low) look = 0;
            const goal = looks()[look].yaw;
            // Turning to look is brisk; drifting home is gentle; Comfort is gentler still.
            const rate = (look === 0 ? 0.9 : 2.2) * (comfort ? 0.6 : 1);
            lookCur = U.dampAngle(lookCur, goal, rate, dt);
            tunnelK = U.damp(tunnelK, low ? 1 : 0, 3, dt);

            train.position(p);
            train.forward(fwd);
            const yaw = Math.atan2(fwd.x, fwd.z);
            yawS = yawS === null || first ? yaw : U.dampAngle(yawS, yaw, view === 'bird' ? 0.7 : 1.5, dt);

            const orbit = function (a, back, up, out) {
                return out.set(p.x - Math.sin(a) * back, p.y + up, p.z - Math.cos(a) * back);
            };

            if (view === 'bird') {
                orbit(yawS + lookCur, 44, 66, P);
                T.set(p.x + Math.sin(yawS) * 10, p.y, p.z + Math.cos(yawS) * 10);
            } else if (view === 'chase') {
                // On the track behind the train (follows every curve, stays in tunnels)...
                // Above the first coach, looking past the loco up the line; lower and closer in tunnels.
                ctx.sampler.at(ctx.s - (19 - 7 * tunnelK), q);
                onTrack.set(q.x, q.y + 8.6 - 4.4 * tunnelK, q.z);
                if (!chaseReady || first) { chaseP.copy(onTrack); chaseReady = true; }
                chaseP.lerp(onTrack, 1 - Math.exp(-4 * dt));
                // ...or walked round the train by Look.
                const away = Math.min(1, Math.abs(U.angleDiff(0, lookCur)) / (Math.PI / 4)) * (1 - tunnelK);
                orbit(yawS + lookCur, 16, 6.5, orb);
                P.copy(chaseP).lerp(orb, away);
                ctx.sampler.at(ctx.s + 12 - 6 * tunnelK, q);
                T.set(q.x, q.y + 1.6, q.z).lerp(mid.set(p.x, p.y + 1.8, p.z), away);
            } else {
                train.cab(cab);
                const ahead = comfort ? 34 : 20;
                ctx.sampler.at(ctx.s + ahead, q);
                const dx = q.x - cab.x, dy = q.y + 2.4 - cab.y, dz = q.z - cab.z;
                const yA = Math.atan2(dx, dz), pA = Math.atan2(dy, Math.hypot(dx, dz));
                if (cabYaw === null || first) { cabYaw = yA; cabPitch = pA; }
                cabYaw = U.dampAngle(cabYaw, yA, comfort ? 1.8 : 4.5, dt);
                cabPitch = U.damp(cabPitch, pA, comfort ? 1.5 : 4, dt);
                const bob = comfort || ctx.calm ? 0 : 0.045 * Math.sin(ctx.s * 1.9) + 0.02 * Math.sin(ctx.s * 4.3);
                const sway = comfort || ctx.calm ? 0 : 0.03 * Math.sin(ctx.s * 0.9);
                P.set(cab.x + Math.cos(cabYaw) * sway, cab.y + bob, cab.z - Math.sin(cabYaw) * sway);
                const a = cabYaw + lookCur;
                T.set(P.x + Math.sin(a) * Math.cos(cabPitch) * 10, P.y + Math.sin(cabPitch) * 10, P.z + Math.cos(a) * Math.cos(cabPitch) * 10);
            }

            if (blend < 1) {
                blend = Math.min(1, blend + dt / (comfort ? 1.6 : 1.1));
                const e = blend * blend * (3 - 2 * blend);
                P.lerpVectors(prevP, P, e);
                T.lerpVectors(prevT, T, e);
            }
            camera.position.copy(P);
            camera.lookAt(T);
            const f = U.damp(fov, FOV[view], 3, dt);
            if (Math.abs(f - camera.fov) > 0.01 || first) { fov = f; camera.fov = f; camera.updateProjectionMatrix(); }
            first = false;
        }

        return {
            setView: setView,
            nextView: nextView,
            view: function () { return view; },
            viewName: function () { return NAMES[view]; },
            cycleLook: cycleLook,
            lookName: function () { return looks()[look].name; },
            looking: function () { return look !== 0; },
            snap: function () { first = true; blend = 1; },
            update: update
        };
    }

    return { create: create, VIEWS: VIEWS, NAMES: NAMES, LOOK_DRIFT: LOOK_DRIFT };
})();
