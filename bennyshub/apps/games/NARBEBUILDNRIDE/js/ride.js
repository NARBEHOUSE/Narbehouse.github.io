/**
 * NARBE Build n Ride - driving the train round a loop.
 *
 * The train runs at the chosen speed, eases into each station (a smooth
 * braking curve, never a jolt), stands for DWELL seconds, then pulls away
 * gently. Events fire as the train's head passes their trigger points, on
 * every lap. The loop goes on until the player pauses (the stage simply stops
 * calling update while paused).
 *
 *   const r = BNR.Ride.create({ length, stations: [{ sStop, ... }], events: [{ sTrigger, ... }], startS, speed })
 *   r.update(dt) -> [{ type: 'arrive' | 'depart' | 'event', station | event }]
 *   r.s, r.v, r.phase ('run' | 'dwell'), r.setSpeed(i), r.next() (the next station ahead)
 * Runs in Node.
 */

window.BNR = window.BNR || {};

BNR.Ride = (function () {
    'use strict';

    const SPEEDS = [
        { id: 'slow', name: 'Slow', v: 5 },
        { id: 'medium', name: 'Medium', v: 9 },
        { id: 'fast', name: 'Fast', v: 14 }
    ];
    const DWELL = 3.0;      // seconds stopped at a station
    const BRAKE = 1.15;     // braking into a station (units per second, per second)
    const ACCEL = 1.35;     // pulling away (Fast in about 10 s)
    const CREEP = 0.7;      // the slowest it rolls before stopping

    function create(o) {
        const L = o.length;
        const stations = (o.stations || []).slice().sort((a, b) => a.sStop - b.sStop);
        const events = (o.events || []).slice();
        let speed = o.speed === undefined ? 1 : o.speed;
        const r = {
            s: o.startS || 0,
            v: 0,
            phase: 'run',
            dwell: 0,
            station: null,       // the station we are standing at (or just left)
            laps: 0,
            stations: stations,
            setSpeed: function (i) { speed = Math.max(0, Math.min(SPEEDS.length - 1, i | 0)); },
            speed: function () { return speed; },
            speedName: function () { return SPEEDS[speed].name; },
            cruise: function () { return SPEEDS[speed].v; },
            next: next,
            update: update,
            /** Start standing at station k (the ride begins at a station). */
            standAt: function (k, seconds) {
                const st = stations[k];
                if (!st) return;
                r.s = st.sStop;
                r.v = 0;
                r.phase = 'dwell';
                r.dwell = seconds === undefined ? DWELL : seconds;
                r.station = st;
            }
        };

        /** Distance ahead (along the loop) to a position. */
        function ahead(pos) { return ((pos - r.s) % L + L) % L; }

        /** The next station ahead, and how far. The one we just left doesn't count until we're past it. */
        function next() {
            let best = null, bd = Infinity;
            for (const st of stations) {
                let d = ahead(st.sStop);
                if (st === r.station && d < 1) d += L;
                if (d < bd) { bd = d; best = st; }
            }
            return best ? { station: best, d: bd } : null;
        }

        function update(dt) {
            const out = [];
            const s0 = r.s;
            if (r.phase === 'dwell') {
                r.v = 0;
                r.dwell -= dt;
                if (r.dwell <= 0) { r.phase = 'run'; out.push({ type: 'depart', station: r.station }); }
            } else {
                const nx = next();
                let vt = SPEEDS[speed].v;
                if (nx) vt = Math.min(vt, Math.max(CREEP, Math.sqrt(2 * BRAKE * nx.d)));
                if (r.v < vt) r.v = Math.min(vt, r.v + ACCEL * dt * (r.v < 1.5 ? 1.5 : 1));
                else r.v = Math.max(vt, r.v - BRAKE * 1.8 * dt);
                let ds = r.v * dt;
                if (nx && ds >= nx.d) {
                    ds = nx.d;
                    r.phase = 'dwell';
                    r.dwell = DWELL;
                    r.station = nx.station;
                    r.v = 0;
                    out.push({ type: 'arrive', station: nx.station });
                }
                r.s += ds;
            }
            // Events: fire as the head passes each trigger, on every lap.
            if (r.s > s0) {
                for (const ev of events) {
                    const a = Math.floor((s0 - ev.sTrigger) / L), b = Math.floor((r.s - ev.sTrigger) / L);
                    if (b > a) out.push({ type: 'event', event: ev });
                }
                if (Math.floor(r.s / L) > Math.floor(s0 / L)) r.laps++;
            }
            return out;
        }

        return r;
    }

    return { create: create, SPEEDS: SPEEDS, DWELL: DWELL };
})();
