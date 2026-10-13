// HORSE: two players, the leader picks a spot and shoots.
//  - Leader makes it: the other player must make the same shot or take a letter.
//    The leader keeps picking spots until they miss.
//  - Leader misses: no letter; the other player becomes the leader and picks next.
//  - First to spell H-O-R-S-E loses.
(function () {
    const WORD = 'HORSE';

    // dist (ft) and angle (deg) from the hoop reference point, same convention as the single-player shots.
    // Every spot was physics-tested to score with a centred aim at 50% power.
    const SPOTS = [
        { id: 'free_throw', label: 'FREE THROW LINE', dist: 15, angle: 0 },
        { id: 'left_elbow', label: 'LEFT ELBOW', dist: 16, angle: -32 },
        { id: 'right_elbow', label: 'RIGHT ELBOW', dist: 16, angle: 32 },
        { id: 'left_block', label: 'LEFT BLOCK', dist: 12, angle: -60, boost: 1.06 },   // boost: close shots need a little extra speed
        { id: 'right_block', label: 'RIGHT BLOCK', dist: 12, angle: 60, boost: 1.06 },
        { id: 'left_wing', label: 'LEFT WING', dist: 23, angle: -45 },
        { id: 'top_key', label: 'TOP OF THE KEY', dist: 24, angle: 0 },
        { id: 'right_wing', label: 'RIGHT WING', dist: 23, angle: 45 },
        { id: 'left_corner', label: 'LEFT CORNER', dist: 22, angle: -78 },
        { id: 'right_corner', label: 'RIGHT CORNER', dist: 22, angle: 78 },
        { id: 'half_court', label: 'HALF COURT', dist: 43, angle: 0 }
    ];

    function spotXZ(spot) {
        const a = spot.angle * Math.PI / 180;
        return { x: Math.sin(a) * spot.dist, z: Math.cos(a) * spot.dist - 10 };
    }

    function newGame(rand = Math.random) {
        const leader = rand() < 0.5 ? 0 : 1;
        return {
            players: [{ name: 'PLAYER 1', letters: 0 }, { name: 'PLAYER 2', letters: 0 }],
            leader, shooter: leader, phase: 'pick', spot: null, winner: null
        };
    }

    function letters(n) { return WORD.slice(0, n); }

    function chooseSpot(g, spot) {
        g.spot = spot;
        g.phase = 'set';
        g.shooter = g.leader;
    }

    // Apply a shot result. Returns an event describing what happened, for announcements.
    function shotResult(g, made) {
        const other = 1 - g.leader;
        if (g.phase === 'set') {
            if (made) {
                g.phase = 'match';
                g.shooter = other;
                return { type: 'set_made', shooter: g.leader, next: other };
            }
            g.leader = other;
            g.shooter = other;
            g.phase = 'pick';
            return { type: 'set_missed', shooter: 1 - other, next: other };
        }
        if (g.phase === 'match') {
            const follower = other;
            if (made) {
                g.phase = 'pick';
                g.shooter = g.leader;
                return { type: 'matched', shooter: follower, next: g.leader };
            }
            const p = g.players[follower];
            p.letters = Math.min(WORD.length, p.letters + 1);
            if (p.letters >= WORD.length) {
                g.phase = 'over';
                g.winner = g.leader;
                return { type: 'win', shooter: follower, winner: g.leader, letters: letters(p.letters) };
            }
            g.phase = 'pick';
            g.shooter = g.leader;
            return { type: 'letter', shooter: follower, letters: letters(p.letters), letter: WORD[p.letters - 1], next: g.leader };
        }
        return { type: 'none' };
    }

    // Top-down half court with numbered spot markers (feet; hoop at the top).
    function courtSVG() {
        const RIM_Z = -9.2, BASE = -14.4, FT = 4.6, R3 = 27, X3 = 24;
        const a3 = Math.acos(X3 / R3);
        const arcY = RIM_Z + Math.sqrt(R3 * R3 - X3 * X3);
        const markers = SPOTS.map((s, i) => {
            const p = spotXZ(s);
            return `<g class="spot-marker" id="marker-${s.id}" data-spot="${s.id}" transform="translate(${p.x.toFixed(2)} ${p.z.toFixed(2)})">
                <circle class="spot-ring" r="3.3"/><circle class="spot-dot" r="2.3"/>
                <text class="spot-num" y="0.9">${i + 1}</text></g>`;
        }).join('');
        return `<svg class="court-svg" viewBox="-27 -17 54 54" role="img" aria-label="Court seen from above with shooting spots">
            <rect x="-27" y="-17" width="54" height="54" class="apron"/>
            <rect x="-25" y="${BASE}" width="50" height="${33 - BASE}" class="wood"/>
            <rect x="-8" y="${BASE}" width="16" height="${FT - BASE}" class="paint"/>
            <g class="lines">
              <rect x="-25" y="${BASE}" width="50" height="${33 - BASE}"/>
              <rect x="-8" y="${BASE}" width="16" height="${FT - BASE}"/>
              <path d="M -6 ${FT} A 6 6 0 0 0 6 ${FT}"/>
              <path d="M ${-X3} ${BASE} L ${-X3} ${arcY.toFixed(2)} A ${R3} ${R3} 0 0 0 ${X3} ${arcY.toFixed(2)} L ${X3} ${BASE}"/>
              <line x1="-25" y1="33" x2="25" y2="33"/>
            </g>
            <line x1="-3" y1="-10.4" x2="3" y2="-10.4" class="board"/>
            <circle cx="0" cy="${RIM_Z}" r="1.3" class="rim"/>
            ${markers}
        </svg>`;
    }

    window.BB = window.BB || {};
    window.BB.Horse = { SPOTS, WORD, spotXZ, newGame, chooseSpot, shotResult, letters, courtSVG };
    if (typeof module !== 'undefined') module.exports = window.BB.Horse;
})();
