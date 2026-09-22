// Field movement shared by offense, defense and returns. Positions are feet on
// the field; no actor has more than one movement owner at a time.
class FootballMotion {
    constructor(scene) {
        this.scene = scene;
        this.routes = new Map();
        this.epoch = 0;
        this.elapsed = 0;
    }

    players() { return [...(this.scene.offense || []), ...(this.scene.defense || [])]; }
    point(x, y) {
        return { x: Math.max(FIELD.LEFT + 14, Math.min(FIELD.RIGHT - 14, x)),
            y: Math.max(FIELD.TOP + 22, Math.min(FIELD.BOTTOM - 20, y)) };
    }
    own(p) {
        if (p._moveTween) { p._moveTween.stop(); p._moveTween = null; }
        this.scene.tweens.killTweensOf(p);
        this.scene.stopBob(p);
        this.routes.delete(p);
        p._vx = 0; p._vy = 0;
    }
    reset() {
        this.epoch++;
        this.scene._lineFormationReady = false;
        this.routes.clear(); this.live = null; this.pocket = null;
        this.players().forEach(p => {
            p._vx = 0; p._vy = 0; p._facePoint = null; p._blocking = false;
        });
    }
    after(ms, callback) {
        const epoch = this.epoch;
        return this.scene.time.delayedCall(ms, () => {
            if (this.epoch === epoch) callback();
        });
    }
    face(p, target) {
        p._facePoint = target;
        if (!p._spr || Math.hypot(target.x - p.x, target.y - p.y) < .5) return;
        const heading = Math.atan2(target.y - p.y, target.x - p.x);
        const facing = Math.PI / 2 + p._spr.dir * Math.PI / 4;
        const turn = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));
        if (Math.abs(turn) > Math.PI / 8 + PLAYER_SPRITE.turnMargin)
            p._spr.dir = spriteDirIndex(heading);
    }
    route(p, points, speed = 105, done) {
        this.own(p);
        p._facePoint = null;
        this.routes.set(p, { points: points.map(pt => this.point(pt.x, pt.y)), index: 0, speed, done });
    }
    steer(p, target, speed, dt, stop = 0) {
        const pt = this.point(target.x, target.y);
        const dx = pt.x - p.x, dy = pt.y - p.y, dist = Math.hypot(dx, dy);
        if (dist <= stop + .7) { p._vx = p._vy = 0; return true; }
        // Acceleration and a braking distance keep cuts and stops from snapping.
        const desired = Math.min(speed, Math.sqrt(Math.max(0, dist - stop) * 650));
        const vx = dx / dist * desired, vy = dy / dist * desired;
        const dvx = vx - (p._vx || 0), dvy = vy - (p._vy || 0);
        const dv = Math.hypot(dvx, dvy), blend = dv ? Math.min(1, 520 * dt / dv) : 1;
        p._vx = (p._vx || 0) + dvx * blend;
        p._vy = (p._vy || 0) + dvy * blend;
        const step = Math.hypot(p._vx, p._vy) * dt;
        const scale = step > dist - stop ? Math.max(0, (dist - stop) / step) : 1;
        const next = this.point(p.x + p._vx * dt * scale, p.y + p._vy * dt * scale);
        p.x = next.x; p.y = next.y;
        return false;
    }

    holdPass(receivers, qb, attack, defend, dir) {
        this.pocket = { receivers, qb, attack, defend, dir, time: 0,
            qbX: qb.x, qbY: qb.y, anchors: new Map(this.players().map(p => [p, { x: p.x, y: p.y }])) };
        this.players().forEach(p => this.own(p));
    }

    followPocket(p, target, dt) {
        // Critically damped tracking has no arrival dead zone. A slowly moving
        // target no longer produces repeated stop / accelerate / stop bursts.
        const goal = this.point(target.x, target.y), response = 3;
        const decay = Math.exp(-response * dt);
        for (const [axis, velocity] of [['x','_vx'], ['y','_vy']]) {
            const offset = p[axis] - goal[axis];
            const step = ((p[velocity] || 0) + response * offset) * dt;
            p[axis] = goal[axis] + (offset + step) * decay;
            p[velocity] = ((p[velocity] || 0) - response * step) * decay;
        }
        const bounded = this.point(p.x, p.y);
        p.x = bounded.x; p.y = bounded.y;
    }

    updatePocket(dt) {
        const h = this.pocket;
        h.time += dt * PASS_MOTION.focusScale;
        // Start each working route at its real arrival position, with no
        // phase-offset jump as focus mode takes over from the route animation.
        const drift = (rate, phase, amplitude) =>
            (Math.sin(h.time * rate + phase) - Math.sin(phase)) * amplitude;
        const assigned = new Set([h.qb]);
        h.receivers.forEach((r, i) => {
            const anchor = h.anchors.get(r.player);
            // Small lateral working routes preserve announced yardage and scan targets.
            const target = this.point(anchor.x, anchor.y + drift(1.15, i * 1.7, 8));
            this.followPocket(r.player, target, dt);
            this.face(r.player, h.qb);
            r.x = r.player.x; r.y = r.player.y;
            assigned.add(r.player);
            (r.defenders || []).forEach((d, k) => {
                this.followPocket(d, this.point(r.player.x + h.dir * (18 + k * 8),
                    r.player.y + (k ? -16 : 16)), dt);
                this.face(d, r.player); assigned.add(d);
            });
        });
        this.followPocket(h.qb, { x: h.qbX, y: h.qbY + drift(.8, 0, 3) }, dt);
        this.face(h.qb, this.scene.target ? this.scene.target.player : { x: h.qbX + h.dir * 100, y: h.qbY });
        for (const p of [...h.attack, ...h.defend]) {
            if (assigned.has(p)) continue;
            const anchor = h.anchors.get(p), i = this.players().indexOf(p);
            this.followPocket(p, { x: anchor.x + drift(1.2, i, 2),
                y: anchor.y + drift(.9, i, 3) }, dt);
            this.face(p, h.defend.includes(p) ? h.qb : { x: p.x + h.dir * 80, y: p.y });
        }
    }

    run({ runner, attack, defend, endX, laneY, dir, onFinish, breakaway = false, sack = false }) {
        this.reset();
        this.players().forEach(p => this.own(p));
        const goalX = dir > 0 ? FIELD.GOAL_R : FIELD.GOAL_L;
        const lane = this.point(endX, laneY);
        const startX = runner.x;
        const blockers = attack.filter(p => p !== runner && p !== attack[0] && (!sack || p === attack[5]));
        const available = new Set(defend);
        const blocks = blockers.map(p => {
            const d = [...available].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
            if (d) available.delete(d);
            return { p, d, engaged: 0, spent: false };
        });
        this.live = { runner, attack, defend, dir, goalX, lane, startX, elapsed: 0,
            quality: Math.max(0, Math.min(1, ((endX - startX) * dir - 46) / 70)),
            blocks, onFinish, breakaway, sack, finishing: false, contact: null };
        this.scene.ball.carrier = runner; this.scene.ball.visible = true;
        this.scene.ball.flying = false;
    }

    updateRun(dt) {
        const r = this.live;
        if (r.finishing) return;
        r.elapsed += dt;
        this.players().forEach(p => { p._blocking = false; });
        const p = r.runner, dir = r.dir;
        // A runner cuts into the called lane, then turns upfield. Reaching a
        // probability-model target is never a reason to freeze and wait for a hit.
        const forward = Math.max(0, (p.x - r.startX) * dir);
        const laneY = r.sack ? p.y : r.lane.y;
        const approaching = Math.max(0, (r.lane.x - p.x) * dir);
        const speed = r.sack ? 40 : (r.breakaway ? 132 : approaching > 10 ? 108 : 76);
        const aimX = r.sack ? r.lane.x : p.x + dir * (forward < 20 ? 26 : 58);
        this.steer(p, { x: aimX, y: laneY }, speed, dt);

        const engaged = new Set();
        for (const block of r.blocks) {
            const { p: blocker, d } = block;
            if (!d) continue;
            const distance = Math.hypot(blocker.x - d.x, blocker.y - d.y);
            if (!block.spent && distance < 24 && r.elapsed > .12) block.engaged += dt;
            if (block.engaged > (r.breakaway ? 1.8 : .45 + r.quality * 1.5)) block.spent = true;
            if (!block.spent && block.engaged > 0 && distance < 30) {
                engaged.add(d);
                blocker._blocking = true; d._blocking = true;
                this.face(blocker, d); this.face(d, blocker);
                this.steer(blocker, { x: d.x - dir * 19, y: d.y }, 30, dt, 2);
                this.steer(d, { x: d.x + dir * 4, y: d.y }, 12, dt);
            } else if (!block.spent) {
                // Get between the defender and the runner; no block takes effect at a distance.
                const dx = p.x - d.x, dy = p.y - d.y, length = Math.hypot(dx, dy) || 1;
                this.steer(blocker, { x: d.x + dx / length * 21,
                    y: d.y + dy / length * 21 }, 117, dt);
            } else {
                const i = r.blocks.indexOf(block);
                this.steer(blocker, { x: p.x - dir * (30 + i * 11),
                    y: p.y + (i % 2 ? -1 : 1) * (28 + i * 6) }, 98, dt);
            }
        }
        const ranked = [...r.defend].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
        ranked.forEach((d, i) => {
            if (engaged.has(d)) return;
            d._facePoint = null;
            const distance = Math.hypot(d.x - p.x, d.y - p.y);
            const lead = Math.min(.5, distance / 250);
            // Nearest defender closes; others take pursuit angles and preserve leverage.
            const outside = i < 2 ? 0 : (i % 2 ? -1 : 1) * 18;
            const target = { x: p.x + (p._vx || dir * speed) * lead,
                y: p.y + (p._vy || 0) * lead + outside };
            const reaction = r.sack ? .10 : .22 + r.quality * .55 + i * .035;
            if (r.elapsed >= reaction) this.steer(d, target, r.breakaway ? 119 : 130 - i * 2, dt, i < 2 ? 10 : 22);
            else {
                // Read the back and shuffle into the run lane before committing downhill.
                this.steer(d, { x: d.x, y: p.y }, 35, dt, 10);
                this.face(d, p);
            }
            if (r.elapsed > .22 && Math.hypot(d.x - p.x, d.y - p.y) <= 23 && !r.contact) r.contact = d;
        });
        // Quarterbacks trail a handoff rather than becoming another lead blocker.
        if (r.attack[0] !== p) {
            this.steer(r.attack[0], { x: p.x - dir * 55, y: p.y + 30 }, 78, dt);
        }
        if (r.sack) r.attack.slice(1, 5).forEach((receiver, i) => {
            this.steer(receiver, { x: receiver.x + dir * 45,
                y: FIELD.MID_Y + [-70, -130, 130, 45][i] }, 90, dt);
        });
        this.separate([...r.attack, ...r.defend], p, dt);
        if ((p.x - r.goalX) * dir >= 0) {
            this.finishRun(true, null);
        } else if (r.contact) {
            this.finishRun(false, r.contact);
        }
    }

    separate(players, carrier, dt) {
        // Small collision corrections keep feet from stacking without moving
        // the ball carrier (and thus the official spot) after contact detection.
        for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
            const a = players[i], b = players[j];
            const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
            if (dist >= 15) continue;
            const nx = dist > .01 ? dx / dist : (i % 2 ? 1 : -1), ny = dist > .01 ? dy / dist : 0;
            const push = Math.min((15 - dist) * .5, 28 * dt);
            if (a !== carrier) { const pt = this.point(a.x - nx * push, a.y - ny * push); a.x = pt.x; a.y = pt.y; }
            if (b !== carrier) { const pt = this.point(b.x + nx * push, b.y + ny * push); b.x = pt.x; b.y = pt.y; }
        }
    }

    finishRun(touchdown, tackler) {
        const r = this.live;
        if (!r || r.finishing) return;
        r.finishing = true;
        const spot = this.point(r.runner.x, r.runner.y);
        const finish = () => {
            if (this.live !== r) return;
            this.live = null;
            r.onFinish({ x: spot.x, y: spot.y, touchdown, tackler });
        };
        this.players().forEach(p => {
            p._facePoint = null;
            p._blocking = false;
            p._vx = p._vy = 0;
            if (p === r.runner || p === tackler) return;
            // Brake clear of the contact instead of all joining a pile.
            const dx = p.x - spot.x, dy = p.y - spot.y, d = Math.hypot(dx, dy) || 1;
            this.route(p, [{ x: p.x + dx / d * 12, y: p.y + dy / d * 12 }], 48);
        });
        if (touchdown) {
            this.route(r.runner, [{ x: spot.x + r.dir * 23, y: spot.y }], 72, finish);
        } else {
            this.scene.facePlayer(tackler, r.runner);
            this.scene.audio.play('tackle');
            this.scene.tackleShake(r.runner);
            this.scene.ball.carrier = r.runner;
            this.after(620, finish);
        }
    }

    update(delta) {
        if (this.scene.paused) return;
        const dt = Math.max(0, Math.min(delta, 50)) / 1000;
        this.elapsed += dt;
        for (const [p, route] of [...this.routes]) {
            const target = route.points[route.index];
            if (!target) { this.routes.delete(p); if (route.done) route.done(); continue; }
            if (this.steer(p, target, route.speed, dt, .5)) {
                route.index++;
                if (route.index === route.points.length) {
                    this.routes.delete(p);
                    if (route.done) route.done();
                }
            }
        }
        if (this.pocket) this.updatePocket(dt);
        if (this.live) this.updateRun(dt);
    }
}
