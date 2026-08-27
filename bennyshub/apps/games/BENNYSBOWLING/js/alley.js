/*
 * alley.js -- procedural bowling alley geometry for Benny's Bowling.
 *
 * Every visible surface here is derived from the collision constants declared in
 * bowlphysics.js, so the picture can never drift away from the simulation:
 *
 *   lane bed top      y = BASE_HEIGHT      (0.150)  ball + pin feet rest here
 *   gutter bed        y = BOTTOM_HEIGHT + GUTTER_HEIGHT  (0.100)
 *   pit floor         y = BOTTOM_HEIGHT    (0.050)
 *   kickback walls    x = +/- TRACK_HALF_WIDTH         (0.770)
 *   lane edges        x = +/- LANE_HALF_WIDTH          (0.530)
 *   foul line         z = TRACK_START_Z    (3.00)
 *   pin deck end      z = LANE_END_Z       (-0.90)
 *   pit back wall     z = TRACK_END_Z      (-1.60)
 *
 * Surfaces that a body can touch are drawn exactly on the collision plane.
 * Surfaces a body can only approach from one side are pushed WALL_EPS clear so
 * Bullet's contact margin never pokes a pin through the paint.
 */

var BowlAlley = (function () {
	"use strict";

	// --- derived geometry -------------------------------------------------
	var WALL_EPS = 0.004;              // clearance for one-sided surfaces
	var LANE_TOP = BASE_HEIGHT;        // 0.150
	var GUTTER_BED = BOTTOM_HEIGHT + GUTTER_HEIGHT;   // 0.100
	var PIT_FLOOR = BOTTOM_HEIGHT;     // 0.050
	var KICK_X = TRACK_HALF_WIDTH + WALL_EPS;         // 0.774
	var KICK_TOP = TOP_HEIGHT - 0.01;  // just under the invisible ceiling box
	var PIT_WALL_Z = TRACK_END_Z + WALL_EPS;          // -1.596
	var HALF_PITCH = 0.5 * (TRACK_WIDTH + 0.1);       // 0.82, half of TRACK_DISTANCE
	var DECK_KICK_Z = 0.35;            // kickbacks go full height from here forward
	var APPROACH_END_Z = TRACK_START_Z + 4.0;         // 7.0
	var MASK_BOTTOM = TOP_HEIGHT + 0.01;
	var MASK_TOP = 2.05;

	// Board layout: a real lane is 39 boards wide.
	var BOARDS = 39;
	var FOOT = (TRACK_START_Z - 0.0) / 60.0;          // one "foot" in world units

	// --- tiny helpers -----------------------------------------------------
	function makeCanvas(w, h, draw) {
		var c = document.createElement("canvas");
		c.width = w; c.height = h;
		draw(c.getContext("2d"), w, h);
		return c;
	}

	function tex(canvas, opts) {
		opts = opts || {};
		var t = new THREE.CanvasTexture(canvas);
		t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
		if (opts.repeat) { t.repeat.set(opts.repeat[0], opts.repeat[1]); }
		// Colour maps are authored in sRGB; data maps (roughness) are not.
		if (!opts.data) { t.encoding = THREE.sRGBEncoding; }
		t.anisotropy = 8;
		t.needsUpdate = true;
		return t;
	}

	// Deterministic noise so the wood grain is identical every launch.
	function rng(seed) {
		var s = seed >>> 0;
		return function () {
			s = (s * 1664525 + 1013904223) >>> 0;
			return s / 4294967296;
		};
	}

	function mix(a, b, t) {
		var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
		var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
		return "rgb(" + Math.round(ar + (br - ar) * t) + "," +
			Math.round(ag + (bg - ag) * t) + "," +
			Math.round(ab + (bb - ab) * t) + ")";
	}

	function hex(c) { return "#" + ("000000" + (c >>> 0).toString(16)).slice(-6); }

	// --- palettes ---------------------------------------------------------
	// One entry per entry in THEMES (bowlchallenge.js). Every palette is built
	// through pal() so they all have the same shape and a missing key is
	// impossible. `glow` drives the emissive map on the lane markings, which is
	// what sells the neon themes; 0x000000 means "this theme doesn't glow".
	function pal(maple, pine, seam, marks, foul, gutter, gutterRim, capping,
			kick, pit, mask, maskInk, carpet, carpetInk, glow, oil) {
		return {
			maple: maple, pine: pine, seam: seam, marks: marks, foul: foul,
			gutter: gutter, gutterRim: gutterRim, capping: capping, kick: kick,
			pit: pit, mask: mask, maskInk: maskInk, carpet: carpet,
			carpetInk: carpetInk, glow: glow, oil: oil
		};
	}

	var PALETTES = {
		//                maple     pine      seam      marks     foul      gutter    gutRim    capping   kick      pit       mask      maskInk   carpet    carpInk   glow      oil
		"Classic":    pal(0xcea26a, 0xad7c4a, 0x6b4522, 0x241206, 0x9c1f1f, 0x2f3843, 0x8b96a2, 0x4a2f19, 0x39424c, 0x14181d, 0x252b33, 0xc7a25a, 0x3a2340, 0x7a4f8a, 0x000000, 0.16),
		"Ocean":      pal(0xe6cb9a, 0xcaa974, 0x8a6a45, 0x143b4d, 0x1f6f9c, 0x14424f, 0x63c7d6, 0x2c4a5c, 0x2a6076, 0x0b1c24, 0x123a48, 0x8fe3f0, 0x0f3140, 0x2f8fa8, 0x000000, 0.12),
		"Neon Night": pal(0x4a3a26, 0x362a1c, 0x1b1409, 0x0a1a12, 0x00ff99, 0x07120e, 0x00ffcc, 0x14251d, 0x0b1a14, 0x050a08, 0x061410, 0x00ffcc, 0x061a14, 0x00b380, 0x00ff99, 0.10),
		"Retro 80s":  pal(0x8a6a4a, 0x6e5238, 0x3a2a1c, 0x2a0a3a, 0xff66ff, 0x180a2a, 0xff66ff, 0x2b1442, 0x1e0f33, 0x0a0418, 0x140a24, 0x66ffff, 0x1a0a2e, 0xff66ff, 0xff66ff, 0.10),
		"Cyber Grid": pal(0x3d3a30, 0x2c2a24, 0x151410, 0x04140f, 0x00ffaa, 0x061210, 0x00ffaa, 0x0c1a16, 0x08120f, 0x030807, 0x04100d, 0x00ffaa, 0x04120e, 0x00cc88, 0x00ffaa, 0.09),
		"Sunset Blvd":pal(0xe0a878, 0xbf8354, 0x6f4527, 0x2c1408, 0xd94f2a, 0x40252a, 0xffb08a, 0x59301f, 0x63363a, 0x1a0f10, 0x33191c, 0xffc9a0, 0x3a1d22, 0xd97a55, 0x000000, 0.15),
		"Aurora":     pal(0x9fb8a8, 0x7d9a8b, 0x3d5348, 0x0a2430, 0x64ffda, 0x0e2b33, 0x88ffdd, 0x17383f, 0x123138, 0x061418, 0x0b2830, 0xaaffee, 0x0b2630, 0x3fbfa8, 0x64ffda, 0.11),
		"Lava Lanes": pal(0x6b3a20, 0x4f2916, 0x2a1409, 0x1a0603, 0xff5a1e, 0x1d0c07, 0xff8a3d, 0x33170c, 0x2a1109, 0x120604, 0x1e0a05, 0xffaa55, 0x210a06, 0xcc4411, 0xff6622, 0.12),
		"Snow Day":   pal(0xe9f2fb, 0xcfe0ef, 0x8fa6bb, 0x2a4257, 0x3d7fb5, 0x8ba9c2, 0xffffff, 0x9fb6cb, 0x9db6cc, 0x5c7183, 0xbfd4e6, 0x2a4257, 0xa8c4dc, 0x5f8bb0, 0x000000, 0.18),
		"Cosmic Bowl":pal(0x4a4666, 0x37344f, 0x1c1a2c, 0x0a0820, 0x8fb8ff, 0x0b0a1c, 0x9ec2ff, 0x171531, 0x100e24, 0x050411, 0x0a0820, 0xbbaaff, 0x0c0a20, 0x5a4fa0, 0x88aaff, 0.11)
	};

	function paletteFor(name) { return PALETTES[name] || PALETTES["Classic"]; }

	// --- lane surface texture --------------------------------------------
	// mode: 'color' | 'glow' | 'rough'
	function laneCanvas(p, mode) {
		var W = 512, H = 2048;
		var L = LANE_LENGTH, zTop = TRACK_START_Z;
		var rowOf = function (z) { return (1 - (zTop - z) / L) * H; };
		var colOf = function (x) { return (x + LANE_HALF_WIDTH) / LANE_WIDTH * W; };
		var bw = W / BOARDS;
		var glow = (mode === "glow"), rough = (mode === "rough");

		return makeCanvas(W, H, function (ctx) {
			if (rough) {
				// White = dry/matte, black = glossy. Real houses oil the first
				// ~40ft and leave the back end dry.
				ctx.fillStyle = "#9a9a9a";
				ctx.fillRect(0, 0, W, H);
				var oilEnd = rowOf(TRACK_START_Z - 40 * FOOT);
				var g = ctx.createLinearGradient(0, H, 0, oilEnd);
				var lvl = Math.round(p.oil * 255);
				g.addColorStop(0.0, "rgb(" + lvl + "," + lvl + "," + lvl + ")");
				g.addColorStop(0.72, "rgb(" + lvl + "," + lvl + "," + lvl + ")");
				g.addColorStop(1.0, "#9a9a9a");
				ctx.fillStyle = g;
				ctx.fillRect(0, oilEnd, W, H - oilEnd);
				// Slightly drier outside boards 8 / 32 (typical house shot).
				ctx.fillStyle = "rgba(160,160,160,0.45)";
				ctx.fillRect(0, oilEnd, bw * 7, H - oilEnd);
				ctx.fillRect(W - bw * 7, oilEnd, bw * 7, H - oilEnd);
				// Pin deck is bare wood.
				ctx.fillStyle = "#a8a8a8";
				ctx.fillRect(0, 0, W, rowOf(0.32));
				return;
			}

			if (glow) {
				ctx.fillStyle = "#000000";
				ctx.fillRect(0, 0, W, H);
			} else {
				var rand = rng(20250816);
				// Maple heads (first 15ft), pine mid-lane, maple pin deck.
				var headRow = rowOf(TRACK_START_Z - 15 * FOOT);
				var deckRow = rowOf(0.32);
				for (var b = 0; b < BOARDS; b++) {
					var jitter = (rand() - 0.5) * 0.16;
					ctx.fillStyle = mix(p.pine, p.maple, 0.5 + jitter);
					ctx.fillRect(b * bw, 0, bw + 1, H);
				}
				// Zone tinting over the boards.
				ctx.globalAlpha = 0.55;
				ctx.fillStyle = hex(p.maple);
				ctx.fillRect(0, headRow, W, H - headRow);   // heads
				ctx.fillRect(0, 0, W, deckRow);             // deck
				ctx.globalAlpha = 1.0;

				// Lengthwise grain.
				ctx.lineWidth = 1;
				for (var i = 0; i < 1400; i++) {
					var gx = rand() * W;
					var gy = rand() * H;
					var gl = 60 + rand() * 400;
					ctx.strokeStyle = "rgba(0,0,0," + (0.03 + rand() * 0.05).toFixed(3) + ")";
					ctx.beginPath();
					ctx.moveTo(gx, gy);
					ctx.bezierCurveTo(gx + (rand() - 0.5) * 4, gy + gl * 0.4,
						gx + (rand() - 0.5) * 4, gy + gl * 0.7, gx, gy + gl);
					ctx.stroke();
				}
				// Board seams.
				ctx.strokeStyle = "rgba(" + ((p.seam >> 16) & 255) + "," +
					((p.seam >> 8) & 255) + "," + (p.seam & 255) + ",0.55)";
				ctx.lineWidth = 1.5;
				for (var s = 1; s < BOARDS; s++) {
					ctx.beginPath();
					ctx.moveTo(s * bw, 0);
					ctx.lineTo(s * bw, H);
					ctx.stroke();
				}
				// Zone joins.
				ctx.strokeStyle = "rgba(0,0,0,0.12)";
				ctx.lineWidth = 2;
				[headRow, deckRow].forEach(function (r) {
					ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(W, r); ctx.stroke();
				});
			}

			// ---- markings (drawn in both colour and glow passes) ----
			var ink = glow ? hex(p.glow) : hex(p.marks);
			var foulInk = glow ? hex(p.glow) : hex(p.foul);
			if (glow && p.glow === 0x000000) { return; }  // theme has no glow

			// Foul line: a solid band across the very back of the map.
			ctx.fillStyle = foulInk;
			ctx.fillRect(0, rowOf(TRACK_START_Z - 0.028), W, H);

			// Seven targeting arrows. Board 20 is the centre; outer arrows sit
			// progressively closer to the foul line, as on a real lane.
			var boardX = function (n) { return (n - 20) * (LANE_WIDTH / BOARDS); };
			var arrows = [[5, 12], [10, 13], [15, 14], [20, 15], [25, 14], [30, 13], [35, 12]];
			ctx.fillStyle = ink;
			arrows.forEach(function (a) {
				var cx = colOf(boardX(a[0]));
				var tipRow = rowOf(TRACK_START_Z - a[1] * FOOT);
				var baseRow = tipRow + (0.115 / L) * H;
				var halfW = 0.019 / LANE_WIDTH * W;
				ctx.beginPath();
				ctx.moveTo(cx, tipRow);
				ctx.lineTo(cx + halfW, baseRow);
				ctx.lineTo(cx - halfW, baseRow);
				ctx.closePath();
				ctx.fill();
			});

			// Pin spots on the deck.
			ctx.fillStyle = ink;
			ctx.globalAlpha = glow ? 0.85 : 0.5;
			for (var pi = 0; pi < PIN_POSITIONS.length; pi++) {
				var pp = PIN_POSITIONS[pi];
				var px = colOf(pp[0]);
				var py = rowOf(pp[2]);
				var rx = 0.028 / LANE_WIDTH * W;
				var ry = 0.028 / L * H;
				ctx.beginPath();
				ctx.ellipse(px, py, rx, Math.max(ry, 2), 0, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1.0;

			// Tail plank line where the deck begins.
			ctx.strokeStyle = ink;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(0, rowOf(0.32)); ctx.lineTo(W, rowOf(0.32)); ctx.stroke();
		});
	}

	// --- approach texture -------------------------------------------------
	function approachCanvas(p, glow) {
		var W = 512, H = 512;
		var len = APPROACH_END_Z - TRACK_START_Z;
		// Same convention as laneCanvas: the plane is laid down with
		// rotation.x = -PI/2, so canvas row 0 is the *smallest* z it covers.
		// For the approach that is the foul line end.
		var rowOf = function (z) { return ((z - TRACK_START_Z) / len) * H; };
		var colOf = function (x) { return (x + HALF_PITCH) / (2 * HALF_PITCH) * W; };
		return makeCanvas(W, H, function (ctx) {
			if (glow) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
			else {
				var rand = rng(770077);
				var bw = W / (BOARDS + 12);
				for (var b = 0; b * bw < W; b++) {
					ctx.fillStyle = mix(p.pine, p.maple, 0.35 + (rand() - 0.5) * 0.2);
					ctx.fillRect(b * bw, 0, bw + 1, H);
				}
				ctx.strokeStyle = "rgba(0,0,0,0.22)";
				ctx.lineWidth = 1;
				for (var s = 1; s * bw < W; s++) {
					ctx.beginPath(); ctx.moveTo(s * bw, 0); ctx.lineTo(s * bw, H); ctx.stroke();
				}
				ctx.fillStyle = "rgba(0,0,0,0.10)";
				ctx.fillRect(0, 0, W, H);
			}
			if (glow && p.glow === 0x000000) { return; }
			var ink = glow ? hex(p.glow) : hex(p.marks);

			// Foul line, hard against the lane at z = TRACK_START_Z.
			ctx.fillStyle = glow ? hex(p.glow) : hex(p.foul);
			ctx.fillRect(0, 0, W, rowOf(TRACK_START_Z + 0.03));

			// Approach dots: 7 at 12ft, 5 at 15ft behind the line. The canvas is
			// square but the plane it lands on is not, so the radii have to be
			// converted separately or the dots come out as ovals.
			ctx.fillStyle = ink;
			var boardX = function (n) { return (n - 20) * (LANE_WIDTH / BOARDS); };
			var dotR = 0.020;
			var rx = dotR / (2 * HALF_PITCH) * W;
			var ry = dotR / len * H;
			function dotRow(boards, ft) {
				var r = rowOf(TRACK_START_Z + ft * FOOT);
				boards.forEach(function (n) {
					ctx.beginPath();
					ctx.ellipse(colOf(boardX(n)), r, rx, ry, 0, 0, Math.PI * 2);
					ctx.fill();
				});
			}
			dotRow([5, 10, 15, 20, 25, 30, 35], 12);
			dotRow([10, 15, 20, 25, 30], 15);
		});
	}

	// --- simple tiling textures ------------------------------------------
	function gutterCanvas(p) {
		return makeCanvas(128, 512, function (ctx, w, h) {
			var g = ctx.createLinearGradient(0, 0, w, 0);
			g.addColorStop(0.0, hex(p.gutterRim));
			g.addColorStop(0.16, hex(p.gutter));
			g.addColorStop(0.5, mix(p.gutter, 0x000000, 0.35));
			g.addColorStop(0.84, hex(p.gutter));
			g.addColorStop(1.0, hex(p.gutterRim));
			ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
			// Faint lengthwise scuffing.
			var rand = rng(4242);
			ctx.strokeStyle = "rgba(255,255,255,0.05)";
			for (var i = 0; i < 60; i++) {
				var x = rand() * w;
				ctx.beginPath(); ctx.moveTo(x, rand() * h); ctx.lineTo(x, rand() * h); ctx.stroke();
			}
		});
	}

	function kickCanvas(p) {
		return makeCanvas(256, 256, function (ctx, w, h) {
			ctx.fillStyle = hex(p.kick); ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			for (var y = 0; y < h; y += 64) { ctx.fillRect(0, y, w, 3); }
			// Ball scuffs near the bottom, like a real kickback.
			var rand = rng(99);
			for (var i = 0; i < 90; i++) {
				ctx.strokeStyle = "rgba(0,0,0," + (0.05 + rand() * 0.12).toFixed(3) + ")";
				ctx.lineWidth = 1 + rand() * 2;
				var x = rand() * w, y = h * (0.55 + rand() * 0.45);
				ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand() * 40 - 20, y + rand() * 8 - 4); ctx.stroke();
			}
		});
	}

	function pitCanvas(p) {
		return makeCanvas(256, 256, function (ctx, w, h) {
			ctx.fillStyle = hex(p.pit); ctx.fillRect(0, 0, w, h);
			var rand = rng(7);
			for (var i = 0; i < 400; i++) {
				ctx.fillStyle = "rgba(255,255,255," + (rand() * 0.035).toFixed(3) + ")";
				ctx.fillRect(rand() * w, rand() * h, 2, 2);
			}
		});
	}

	function cushionCanvas(p) {
		// Padded pit curtain: vertical rolls.
		return makeCanvas(256, 128, function (ctx, w, h) {
			for (var x = 0; x < w; x += 16) {
				var g = ctx.createLinearGradient(x, 0, x + 16, 0);
				g.addColorStop(0, mix(p.pit, 0x000000, 0.5));
				g.addColorStop(0.5, mix(p.pit, 0xffffff, 0.18));
				g.addColorStop(1, mix(p.pit, 0x000000, 0.5));
				ctx.fillStyle = g; ctx.fillRect(x, 0, 16, h);
			}
		});
	}

	function maskCanvas(p, glow) {
		return makeCanvas(512, 256, function (ctx, w, h) {
			if (glow) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); }
			else {
				var g = ctx.createLinearGradient(0, 0, 0, h);
				g.addColorStop(0, mix(p.mask, 0x000000, 0.45));
				g.addColorStop(1, hex(p.mask));
				ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
			}
			var ink = glow ? (p.glow ? hex(p.glow) : "#000") : hex(p.maskInk);
			if (glow && !p.glow) { return; }
			// Chevron band across the lower third -- the classic masking-unit
			// motif, kept quiet so it reads as decor and not as a warning sign.
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, h * 0.58, w, h * 0.30);
			ctx.clip();
			ctx.globalAlpha = glow ? 0.7 : 0.30;
			ctx.strokeStyle = ink;
			ctx.lineWidth = 14;
			// Four chevrons across a 1.64m unit: any finer and it reads as a
			// chain-link fence rather than a masking unit.
			for (var i = -1; i < 5; i++) {
				ctx.beginPath();
				ctx.moveTo(i * 128, h);
				ctx.lineTo(i * 128 + 64, h * 0.5);
				ctx.lineTo(i * 128 + 128, h);
				ctx.stroke();
			}
			ctx.restore();
			// Trim lines top and bottom of the band.
			ctx.globalAlpha = glow ? 0.9 : 0.55;
			ctx.fillStyle = ink;
			ctx.fillRect(0, h * 0.56, w, 3);
			ctx.fillRect(0, h * 0.88, w, 2);
			ctx.globalAlpha = 1.0;
		});
	}

	function carpetCanvas(p) {
		return makeCanvas(256, 256, function (ctx, w, h) {
			ctx.fillStyle = hex(p.carpet); ctx.fillRect(0, 0, w, h);
			var rand = rng(31337);
			// Loud bowling-centre carpet: scattered confetti shapes.
			for (var i = 0; i < 260; i++) {
				ctx.fillStyle = mix(p.carpetInk, 0xffffff, rand() * 0.5);
				ctx.globalAlpha = 0.35 + rand() * 0.4;
				var x = rand() * w, y = rand() * h, s = 3 + rand() * 9;
				ctx.save();
				ctx.translate(x, y); ctx.rotate(rand() * Math.PI);
				ctx.fillRect(-s * 0.5, -s * 0.15, s, s * 0.3);
				ctx.restore();
			}
			ctx.globalAlpha = 1;
			// Speckle for a fabric feel.
			for (var j = 0; j < 2500; j++) {
				ctx.fillStyle = "rgba(0,0,0," + (rand() * 0.15).toFixed(3) + ")";
				ctx.fillRect(rand() * w, rand() * h, 1, 1);
			}
		});
	}

	function wallCanvas(p) {
		return makeCanvas(256, 256, function (ctx, w, h) {
			ctx.fillStyle = mix(p.mask, 0x000000, 0.35); ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = "rgba(0,0,0,0.3)";
			for (var y = 0; y < h; y += 32) { ctx.fillRect(0, y, w, 2); }
		});
	}

	// --- geometry helpers -------------------------------------------------
	// Extrude a 2D cross-section (in X/Y) along Z. Used for the gutter cove.
	function extrudeAlongZ(profile, z0, z1, uRepeat, vRepeat) {
		var n = profile.length;
		var pos = [], nrm = [], uv = [], idx = [];
		var arc = [0], i;
		for (i = 1; i < n; i++) {
			var dx = profile[i][0] - profile[i - 1][0];
			var dy = profile[i][1] - profile[i - 1][1];
			arc.push(arc[i - 1] + Math.sqrt(dx * dx + dy * dy));
		}
		var total = arc[n - 1] || 1;
		var pn = [];
		for (i = 0; i < n; i++) {
			var a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)];
			var tx = b[0] - a[0], ty = b[1] - a[1];
			var len = Math.sqrt(tx * tx + ty * ty) || 1;
			pn.push([-ty / len, tx / len]);
		}
		for (var s = 0; s <= 1; s++) {
			var z = s === 0 ? z0 : z1;
			for (i = 0; i < n; i++) {
				pos.push(profile[i][0], profile[i][1], z);
				nrm.push(pn[i][0], pn[i][1], 0);
				uv.push(arc[i] / total * (uRepeat || 1), s * (vRepeat || 1));
			}
		}
		for (i = 0; i < n - 1; i++) {
			idx.push(i, n + i, i + 1, i + 1, n + i, n + i + 1);
		}
		var g = new THREE.BufferGeometry();
		g.addAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
		g.addAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
		g.addAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
		g.setIndex(idx);
		return g;
	}

	// Cove cross-section for one gutter. Flat across the middle (exactly on the
	// collision plane) and lifting to lane height at both lips. The x^8 falloff
	// keeps the whole curve clear of a ball resting on the bed.
	function gutterProfile(side) {
		var inner = side * LANE_HALF_WIDTH;
		var outer = side * KICK_X;
		var cx = 0.5 * (inner + outer), half = 0.5 * Math.abs(outer - inner);
		var pts = [];
		var samples = 20;
		for (var i = 0; i <= samples; i++) {
			var x = inner + (outer - inner) * (i / samples);
			var u = (x - cx) / half;
			pts.push([x, GUTTER_BED + (LANE_TOP - GUTTER_BED) * Math.pow(Math.abs(u), 8)]);
		}
		if (side < 0) { pts.reverse(); }   // keep every profile left-to-right
		return pts;
	}

	function plane(w, h, mat) { return new THREE.Mesh(new THREE.PlaneBufferGeometry(w, h), mat); }
	function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxBufferGeometry(w, h, d), mat); }

	// --- materials --------------------------------------------------------
	var M = null;      // shared material set, created once
	var envMap = null;

	function buildEnvMap(p) {
		var faces = [];
		for (var i = 0; i < 6; i++) {
			faces.push(makeCanvas(32, 32, function (ctx, w, h) {
				var g = ctx.createLinearGradient(0, 0, 0, h);
				g.addColorStop(0, mix(p.mask, 0xffffff, 0.55));
				g.addColorStop(1, mix(p.pit, 0x000000, 0.3));
				ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
			}));
		}
		var t = new THREE.CubeTexture(faces);
		t.format = THREE.RGBFormat;
		t.encoding = THREE.sRGBEncoding;
		t.needsUpdate = true;
		return t;
	}

	function buildMaterials() {
		if (M) { return M; }
		var std = function (extra) {
			return new THREE.MeshStandardMaterial(Object.assign({
				color: 0xffffff, roughness: 0.85, metalness: 0.0
			}, extra || {}));
		};
		M = {
			lane: std({ roughness: 1.0, metalness: 0.05 }),
			laneEdge: std({ roughness: 0.7 }),
			approach: std({ roughness: 0.6 }),
			gutter: std({ roughness: 0.35, metalness: 0.35, side: THREE.DoubleSide }),
			capping: std({ roughness: 0.55 }),
			kick: std({ roughness: 0.75, side: THREE.DoubleSide }),
			pit: std({ roughness: 0.95 }),
			cushion: std({ roughness: 0.9 }),
			mask: std({ roughness: 0.6, side: THREE.DoubleSide }),
			carpet: std({ roughness: 1.0 }),
			wall: std({ roughness: 0.9, side: THREE.DoubleSide }),
			ceiling: std({ roughness: 1.0, side: THREE.DoubleSide }),
			light: new THREE.MeshBasicMaterial({ color: 0xfff2d0 })
		};
		return M;
	}

	// --- one alley --------------------------------------------------------
	var proto = null;

	function buildAlleyProto() {
		var m = buildMaterials();
		var g = new THREE.Group();
		g.name = "Alley";

		var laneMidZ = LANE_MID_Z, laneLen = LANE_LENGTH;

		// Lane bed body (top stops just under the play surface so the two faces
		// never z-fight).
		var bodyTop = LANE_TOP - 0.001;
		var bodyH = bodyTop - PIT_FLOOR;
		var bed = box(LANE_WIDTH, bodyH, laneLen, m.laneEdge);
		bed.position.set(0, PIT_FLOOR + bodyH * 0.5, laneMidZ);
		bed.receiveShadow = true;
		g.add(bed);

		// The play surface, sitting exactly on the collision plane.
		var surf = plane(LANE_WIDTH, laneLen, m.lane);
		surf.rotation.x = -Math.PI / 2;
		surf.position.set(0, LANE_TOP, laneMidZ);
		surf.receiveShadow = true;
		g.add(surf);

		// Gutters.
		[-1, 1].forEach(function (side) {
			var gut = new THREE.Mesh(
				extrudeAlongZ(gutterProfile(side), TRACK_START_Z, LANE_END_Z, 1, laneLen / 0.6),
				m.gutter);
			gut.receiveShadow = true;
			g.add(gut);

			// Cap the pit end of the gutter so you don't see through it.
			var cap = box(GUTTER_WIDTH, LANE_TOP - PIT_FLOOR, 0.02, m.laneEdge);
			cap.position.set(side * (LANE_HALF_WIDTH + GUTTER_WIDTH * 0.5),
				(LANE_TOP + PIT_FLOOR) * 0.5, LANE_END_Z - 0.01);
			g.add(cap);
		});

		// Capping boards run beside the gutters down the length of the lane,
		// entirely outside the collision wall.
		[-1, 1].forEach(function (side) {
			var w = HALF_PITCH - KICK_X;                    // 0.046
			var capLen = TRACK_START_Z - DECK_KICK_Z;
			var cap = box(w, 0.16, capLen, m.capping);
			cap.position.set(side * (KICK_X + w * 0.5), LANE_TOP - 0.02,
				DECK_KICK_Z + capLen * 0.5);
			cap.castShadow = true;
			cap.receiveShadow = true;
			g.add(cap);
		});

		// Kickbacks around the pin deck and pit.
		[-1, 1].forEach(function (side) {
			var kh = KICK_TOP - PIT_FLOOR;
			var klen = DECK_KICK_Z - TRACK_END_Z;
			var k = plane(klen, kh, m.kick);
			k.rotation.y = side * -Math.PI / 2;
			k.position.set(side * KICK_X, PIT_FLOOR + kh * 0.5, TRACK_END_Z + klen * 0.5);
			k.receiveShadow = true;
			g.add(k);

			// Close the wedge between the capping board and the kickback.
			var fill = box(HALF_PITCH - KICK_X, kh, klen, m.kick);
			fill.position.set(side * (KICK_X + (HALF_PITCH - KICK_X) * 0.5),
				PIT_FLOOR + kh * 0.5, TRACK_END_Z + klen * 0.5);
			g.add(fill);
		});

		// Pit floor and the padded back cushion.
		var pitLen = LANE_END_Z - TRACK_END_Z;
		var pitFloor = plane(2 * HALF_PITCH, pitLen, m.pit);
		pitFloor.rotation.x = -Math.PI / 2;
		pitFloor.position.set(0, PIT_FLOOR, TRACK_END_Z + pitLen * 0.5);
		pitFloor.receiveShadow = true;
		g.add(pitFloor);

		var cushionH = KICK_TOP - PIT_FLOOR;
		var cushion = plane(2 * HALF_PITCH, cushionH, m.cushion);
		cushion.position.set(0, PIT_FLOOR + cushionH * 0.5, PIT_WALL_Z);
		cushion.receiveShadow = true;
		g.add(cushion);

		// Masking unit above the pit.
		var maskH = MASK_TOP - MASK_BOTTOM;
		var mask = plane(2 * HALF_PITCH, maskH, m.mask);
		mask.position.set(0, MASK_BOTTOM + maskH * 0.5, TRACK_END_Z);
		g.add(mask);

		// Approach, flush with the lane at the foul line.
		var appLen = APPROACH_END_Z - TRACK_START_Z;
		var app = plane(2 * HALF_PITCH, appLen, m.approach);
		app.rotation.x = -Math.PI / 2;
		app.position.set(0, LANE_TOP, TRACK_START_Z + appLen * 0.5);
		app.receiveShadow = true;
		g.add(app);

		// Skirt under the approach so it reads as a raised platform. Its top
		// stops short of the approach plane -- coplanar faces z-fight, and the
		// skirt would win and paint out the whole approach.
		var skirtH = 0.5;
		var skirtTop = LANE_TOP - 0.002;
		var skirt = box(2 * HALF_PITCH, skirtH, appLen, m.capping);
		skirt.position.set(0, skirtTop - skirtH * 0.5, TRACK_START_Z + appLen * 0.5);
		g.add(skirt);

		proto = g;
		return g;
	}

	function create() {
		if (!proto) { buildAlleyProto(); }
		return proto.clone();
	}

	// --- house ------------------------------------------------------------
	var house = null;

	function createHouse(opts) {
		if (house) { return house; }
		opts = opts || {};
		var m = buildMaterials();
		var g = new THREE.Group();
		g.name = "House";

		var slots = opts.slots || [-2, -1, 0, 1, 2];
		var alleys = {};
		var decorPins = {};
		slots.forEach(function (slot) {
			var a = create();
			a.position.x = slot * (TRACK_WIDTH + 0.1);
			g.add(a);
			alleys[slot] = a;

			// Standing racks on every neighbouring lane so the house looks busy.
			// The outer pair are small on screen but their absence reads as two
			// empty lanes right at the edge of frame.
			if (slot !== 0 && typeof opts.makePins === "function") {
				var pins = opts.makePins();
				if (pins) {
					pins.position.x = a.position.x;
					g.add(pins);
					decorPins[slot] = pins;
				}
			}
		});

		// The house has to stay sealed at wide aspect ratios: the camera's
		// horizontal field of view grows with the window, and any floor or wall
		// that stops short lets the background show through as a bright band.
		var halfSpan = 2.5 * (TRACK_WIDTH + 0.1) + 4.0;   // out past the last lane
		var houseZ = TRACK_START_Z;
		var houseLen = 24.0;   // from well behind the pits to behind the camera

		// Concourse floor. It runs the full depth of the house, not just behind
		// the approaches, or the corners past the end lanes open onto nothing.
		var floor = plane(halfSpan * 2, houseLen, m.carpet);
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(0, LANE_TOP - 0.55, houseZ);
		floor.receiveShadow = true;
		g.add(floor);

		// Side walls and ceiling.
		var wallH = 4.2;
		[-1, 1].forEach(function (side) {
			var w = plane(houseLen, wallH, m.wall);
			w.rotation.y = side * -Math.PI / 2;
			w.position.set(side * halfSpan, LANE_TOP - 0.55 + wallH * 0.5, houseZ);
			g.add(w);
		});

		var ceil = plane(halfSpan * 2, houseLen, m.ceiling);
		ceil.rotation.x = Math.PI / 2;
		ceil.position.set(0, LANE_TOP - 0.55 + wallH, houseZ);
		g.add(ceil);

		// Ceiling light strips.
		for (var i = 0; i < 5; i++) {
			var strip = plane(halfSpan * 1.7, 0.22, m.light);
			strip.rotation.x = Math.PI / 2;
			strip.position.set(0, LANE_TOP - 0.55 + wallH - 0.02, 4.0 - i * 2.2);
			g.add(strip);
		}

		// Backdrop behind the masking units. Oversized on purpose so it still
		// fills the frame on an ultrawide window.
		var backdrop = plane(halfSpan * 2.4, wallH * 1.4, m.wall);
		backdrop.position.set(0, LANE_TOP - 0.55 + wallH * 0.5, TRACK_END_Z - 0.4);
		g.add(backdrop);

		house = { group: g, alleys: alleys, decorPins: decorPins, backdrop: backdrop, ceiling: ceil };
		return house;
	}

	function setDecorPinsVisible(slot, visible) {
		if (house && house.decorPins[slot]) { house.decorPins[slot].visible = !!visible; }
	}

	// --- theming ----------------------------------------------------------
	var currentTheme = null;

	function applyTheme(name) {
		var m = buildMaterials();
		var p = paletteFor(name);
		if (currentTheme === name) { return p; }
		currentTheme = name;

		envMap = buildEnvMap(p);

		function set(mat, map, opts) {
			opts = opts || {};
			if (mat.map) { mat.map.dispose(); }
			mat.map = map || null;
			if (mat.emissiveMap) { mat.emissiveMap.dispose(); mat.emissiveMap = null; }
			if (opts.emissiveMap) {
				mat.emissiveMap = opts.emissiveMap;
				mat.emissive.setHex(p.glow || 0x000000);
			} else if (mat.emissive) {
				mat.emissive.setHex(0x000000);
			}
			if (opts.roughnessMap !== undefined) {
				if (mat.roughnessMap) { mat.roughnessMap.dispose(); }
				mat.roughnessMap = opts.roughnessMap;
			}
			if (opts.color !== undefined) { mat.color.setHex(opts.color); }
			else { mat.color.setHex(0xffffff); }
			if (opts.roughness !== undefined) { mat.roughness = opts.roughness; }
			if (opts.metalness !== undefined) { mat.metalness = opts.metalness; }
			mat.envMap = opts.noEnv ? null : envMap;
			mat.envMapIntensity = opts.envIntensity !== undefined ? opts.envIntensity : 0.35;
			mat.needsUpdate = true;
		}

		var glowOn = (p.glow !== 0x000000);

		set(m.lane, tex(laneCanvas(p, "color"), { clamp: true }), {
			roughness: 1.0, metalness: 0.05, envIntensity: 0.9,
			roughnessMap: tex(laneCanvas(p, "rough"), { clamp: true, data: true }),
			emissiveMap: glowOn ? tex(laneCanvas(p, "glow"), { clamp: true }) : null
		});
		set(m.laneEdge, null, { color: p.seam, roughness: 0.7, envIntensity: 0.15 });
		set(m.approach, tex(approachCanvas(p, false), { clamp: true }), {
			roughness: 0.55, envIntensity: 0.4,
			emissiveMap: glowOn ? tex(approachCanvas(p, true), { clamp: true }) : null
		});
		set(m.gutter, tex(gutterCanvas(p), { repeat: [1, LANE_LENGTH / 0.6] }), {
			roughness: 0.3, metalness: 0.45, envIntensity: 0.8
		});
		set(m.capping, null, { color: p.capping, roughness: 0.55, envIntensity: 0.2 });
		set(m.kick, tex(kickCanvas(p), { repeat: [3, 1] }), { roughness: 0.8, envIntensity: 0.15 });
		set(m.pit, tex(pitCanvas(p), { repeat: [3, 2] }), { roughness: 0.95, noEnv: true });
		set(m.cushion, tex(cushionCanvas(p), { repeat: [6, 1] }), { roughness: 0.9, noEnv: true });
		set(m.mask, tex(maskCanvas(p, false), { repeat: [1, 1] }), {
			roughness: 0.6, envIntensity: 0.2,
			emissiveMap: glowOn ? tex(maskCanvas(p, true), { repeat: [1, 1] }) : null
		});
		set(m.carpet, tex(carpetCanvas(p), { repeat: [10, 10] }), { roughness: 1.0, noEnv: true });
		set(m.wall, tex(wallCanvas(p), { repeat: [8, 3] }), { roughness: 0.9, noEnv: true });
		set(m.ceiling, null, { color: mixHex(p.pit, 0x000000, 0.2), roughness: 1.0, noEnv: true });
		m.light.color.setHex(glowOn ? p.glow : 0xfff2d0);

		return p;
	}

	function mixHex(a, b, t) {
		var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
		var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
		return (Math.round(ar + (br - ar) * t) << 16) |
			(Math.round(ag + (bg - ag) * t) << 8) |
			Math.round(ab + (bb - ab) * t);
	}

	return {
		create: create,
		createHouse: createHouse,
		applyTheme: applyTheme,
		materials: buildMaterials,
		setDecorPinsVisible: setDecorPinsVisible,
		paletteFor: paletteFor,
		getEnvMap: function () { return envMap; },
		LANE_TOP: LANE_TOP,
		HALF_PITCH: HALF_PITCH
	};
})();
