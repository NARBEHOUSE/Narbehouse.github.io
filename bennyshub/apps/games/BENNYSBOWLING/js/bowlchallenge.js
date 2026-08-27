const CAMERA_FOV = 50.0;
const CAMERA_NEAR = 0.1;
// Far enough to take in the neighbouring lanes and the back of the house.
const CAMERA_FAR = 60.0;

const FRAME_ROLL_TIME = 3.0;

const GRAB_BALL_THRESHOLD_INCH = 0.05;
const GRAB_BALL_THRESHOLD_INCH_SQUARED = GRAB_BALL_THRESHOLD_INCH * GRAB_BALL_THRESHOLD_INCH;
const GRAB_BALL_ROLL_POS_RATIO = Math.tan(BALL_ANGLE_MAX);

const TRACK_DISTANCE = TRACK_WIDTH + 0.1;

const IMITATION_EMERGING_TIME_MIN = 2.0;
const IMITATION_EMERGING_TIME_MAX = 10.0;
const IMITATION_THROW_TIME_MIN = 3.5;
const IMITATION_THROW_TIME_MAX = 7.0;
const IMITATION_THROW_POSITION_MAX = 0.3;
const IMITATION_THROW_ANGLE_MAX = Math.PI / 18.0;
const CHARGE_TIME_MAX = 5.0; // seconds for max charge (matches Benny's Mini Golf)
// >1 keeps an accidental tap weak. Tuned against CHARGE_TIME_MAX: at 2.5 a
// five-second window put 90% of the power in the last two seconds, which
// made every shot feeble unless held to the very end.
const CHARGE_POWER_CURVE = 1.6;
// Holding Enter opens the pause menu. It has to outlast a full charge, or
// winding a shot all the way up would pause the game instead of bowling it.
const PAUSE_HOLD_TIME = CHARGE_TIME_MAX + 3.0;
// Aiming audio cue: the miss distance treated as "completely off". There is no
// on-target constant -- that threshold falls out of the ball and pin radii in
// aimCueTarget().
const AIM_CUE_RANGE = 0.5;

var container, scene, camera, clock, renderer, ppi;
var ambientLight = null, dirLight = null; // global lights for theming
var deckLight = null, laneLight = null;   // lamps over the pin deck and mid-lane
var pauseUIButton = null; // clickable pause button for mouse users
var themeEnv = null; // environment meshes (floor, walls, backdrop)
var touchPoint, raycaster, pickPoint, dragPoint, releaseVector, pickSphere;
var ballProtoMesh, pinProtoMesh;
var players, imitations, scoresDiv;
var chargeBar, chargeFill; // UI for charge power

// Add concise help tips overlay
var helpTipsDiv = null;

var imitationPlayerId = 0;
var pickingBall = false;
var positioningBall = false;
var rollingBall = false;
var pickX = 0.0;
var pickY = 0.0;
var pickOffset = 0.0;
var pickTime = 0;

// Keyboard control: spacebar hold toggles left/right lane positioning
var spaceHeld = false;           // whether Space is currently held
var spaceNextDir = 1;            // next direction on hold start: 1 = to right, -1 = to left
var spaceHoldDir = 1;            // direction for the current hold
var spaceStartTime = 0.0;        // time when current hold started (seconds)
var spacePhase = 0.0;            // phase so that oscillation starts from current position

// Aiming state
var aimingMode = false;          // true when in aiming mode
var aimHeld = false;             // whether Space is held for aiming oscillation
var aimNextDir = 1;              // next direction for aiming oscillation
var aimHoldDir = 1;              // direction for the current aiming hold
var aimStartTime = 0.0;          // time when aiming space hold started
var aimPhase = 0.0;              // phase for aim oscillation to avoid snapping
var currentAimAngle = 0.0;       // last/active aim angle in radians
var charging = false;            // charging throw with Enter held
var chargeStartTime = 0.0;       // when Enter was pressed to charge

// Game state, menu and settings
var gameState = 'menu';          // 'menu' | 'playing' | 'paused'
var mainMenuDiv = null;          // main menu overlay
var settingsDiv = null;          // settings overlay
var pauseMenuDiv = null;         // pause menu overlay
var gameOverDiv = null;          // game over overlay
var celebrationDiv = null;       // strike celebration overlay
var celebrationHideTimer = null; // timeout handle for hiding celebration
var musicEl = null;              // background music element (optional)
var ambientEl = null;            // ambient bowling background loop
// Using SafeAudio for sound effects (HTML5 Audio - safe for Electron)
var SFX_ENABLED = true;          // reflects settings.sfx but cached for quick checks
var sfxInitialized = false;

// Initialize SafeAudio sounds
function initSafeAudio() {
	if (sfxInitialized || !window.SafeAudio) return;
	window.SafeAudio.preload('rolling', 'sound/rolling-ball.wav');
	window.SafeAudio.preload('pin', 'sound/single-pin.mp3');
	// No select.wav ships with the game; SafeAudio synthesises this one.
	window.SafeAudio.preload('select');
	sfxInitialized = true;
	console.log('[Bowling] SafeAudio initialized');
}

function playSfx(src, volume) {
	if (!SFX_ENABLED) return;
	
	// Initialize on first use
	if (!sfxInitialized) initSafeAudio();
	
	// Map sound file paths to SafeAudio names
	if (window.SafeAudio) {
		if (src.includes('rolling-ball')) {
			window.SafeAudio.play('rolling', volume);
		} else if (src.includes('single-pin')) {
			window.SafeAudio.play('pin', volume);
		} else if (src.includes('select')) {
			window.SafeAudio.play('select', volume);
		}
	}
}

// The rolling sample is under a second long, but a softly-thrown ball takes
// longer than that to reach the pins -- and for a player who can't see the ball,
// silence is indistinguishable from the ball having stopped. Loop it for the
// length of the roll and track the ball's speed with the volume.
//
// ROLL_VOLUME scales the whole roll -- both the one-shot on release and the loop.
// The sample was normalised up to sit level with the pin and strike hits, which
// left the roll itself louder than it needs to be; 0.7 pulls it back without
// touching the speed-tracking dynamics below.
const ROLL_VOLUME = 0.7;
var rollingLoopEl = null;
var rollingLoopPlaying = false;

function startRollingLoop() {
	if (!SFX_ENABLED) return;
	try {
		if (!rollingLoopEl) {
			rollingLoopEl = new Audio('sound/rolling-ball.wav');
			rollingLoopEl.loop = true;
		}
		rollingLoopEl.volume = ROLL_VOLUME;
		rollingLoopEl.currentTime = 0;
		var pr = rollingLoopEl.play();
		if (pr && pr.catch) pr.catch(function(){});
		rollingLoopPlaying = true;
	} catch (e) {}
}

function updateRollingLoop(player) {
	if (!rollingLoopPlaying || !rollingLoopEl) return;
	try {
		var body = player.physics.ballBody;
		var v = body.getLinearVelocity();
		var speed = Math.sqrt(v.x() * v.x() + v.y() * v.y() + v.z() * v.z());
		var onLane = player.ballMesh.position.z > LANE_END_Z;
		if (!player.physics.simulationActive || !onLane || speed < 0.6) {
			stopRollingLoop();
			return;
		}
		// Fade with speed so the roll audibly slows as the ball loses pace, but
		// keep a high floor: a softly-thrown ball still has to be clearly heard.
		rollingLoopEl.volume = ROLL_VOLUME * Math.max(0.6, Math.min(1.0, speed / BALL_VELOCITY_MAX));
	} catch (e) { stopRollingLoop(); }
}

function stopRollingLoop() {
	rollingLoopPlaying = false;
	if (!rollingLoopEl) return;
	try { rollingLoopEl.pause(); rollingLoopEl.currentTime = 0; } catch (e) {}
}

var ambientController = null;

function ensureAmbient() {
	// Ambient sound disabled for now
	return;
}

function startAmbient() {
	// Ambient sound disabled for now
	return;
}
function stopAmbient() {
	// Ambient sound disabled for now
	return;
}
var settings = {
	music: false,
	sfx: true,
	playerCount: 1,
	// One ball style per player; index 0 is player 1.
	ballStyles: [0, 6, 7, 9],
	themeIndex: 0,
	// Non-speech audio cues, independently switchable (see cues.js)
	chargeCues: true,
	aimCues: true,
	// Aimer color selection (0..5); default 2 = green
	aimerColorIndex: 2
};
// TTS and voice settings now managed entirely by NarbeVoiceManager
// Track if user has interacted (required for audio autoplay on HTTPS)
var userHasInteracted = false;

// Ball skins: name + preview + apply function
var BALL_SKINS = []; // will be filled by buildBallSkins()
var THEMES = [];

// Up to four players share one lane pair, hot-seat style. Each gets a colour
// that identifies them on the scoreboard, a default ball to match, and their own
// lane in the house so the camera has somewhere to move to.
const MAX_PLAYERS = 4;
const PLAYER_COLORS = [
	{ name: 'Red',    hex: 0xff5555, css: '#ff6b6b', ball: 0 },   // Classic Red
	{ name: 'Blue',   hex: 0x5599ff, css: '#6ba8ff', ball: 6 },   // Solid Blue
	{ name: 'Green',  hex: 0x55dd77, css: '#5ce08a', ball: 7 },   // Solid Green
	{ name: 'Orange', hex: 0xffaa44, css: '#ffb14d', ball: 9 }    // Solid Orange
];

var activePlayerIndex = 0;
var rebuildSettingsItems = function () {};   // assigned when the settings UI is built

// Aimer color presets
var AIM_COLORS = [
	{ name: 'White',  hex: 0xffffff },
	{ name: 'Blue',   hex: 0x3399ff },
	{ name: 'Green',  hex: 0x00ff66 },
	{ name: 'Yellow', hex: 0xffff66 },
	{ name: 'Red',    hex: 0xff5555 },
	{ name: 'Orange', hex: 0xffaa33 }
];

function buildThemes() {
	// Helper to make a vertical gradient texture
	function gradientTex(top, bottom) {
		var c = document.createElement('canvas'); c.width = 2; c.height = 256;
		var g = c.getContext('2d').createLinearGradient(0,0,0,256);
		g.addColorStop(0, top); g.addColorStop(1, bottom);
		var ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0,0,2,256);
		var tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; return tex;
	}

	// Simple canvas texture helpers for floors/walls/backdrops
	function makeCanvas(w,h,draw){ var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); draw(x,w,h); return c; }
	function texFromCanvas(c){ var t=new THREE.CanvasTexture(c); t.needsUpdate=true; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,1); return t; }
	function oceanBackdrop(){ return texFromCanvas(makeCanvas(1024,512,function(ctx,w,h){ var g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#9bd3ff'); g.addColorStop(0.55,'#9bd3ff'); g.addColorStop(0.56,'#2e7bb8'); g.addColorStop(1,'#0c3f66'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); // sun
		ctx.fillStyle='rgba(255,255,200,0.9)'; ctx.beginPath(); ctx.arc(w*0.75,h*0.2,30,0,Math.PI*2); ctx.fill(); // horizon sparkle
		ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1; for(var i=0;i<60;i++){ var y=h*0.56 + i*4; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
	})); }
	function snowTexture(){ return texFromCanvas(makeCanvas(512,512,function(ctx,w,h){ var grd=ctx.createLinearGradient(0,0,0,h); grd.addColorStop(0,'#f7fbff'); grd.addColorStop(1,'#dbe9f6'); ctx.fillStyle=grd; ctx.fillRect(0,0,w,h); ctx.fillStyle='rgba(255,255,255,0.6)'; for(var i=0;i<800;i++){ var x=Math.random()*w, y=Math.random()*h, r=Math.random()*1.5; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); } })); }
	function starBackdrop(){ return texFromCanvas(makeCanvas(1024,512,function(ctx,w,h){ ctx.fillStyle='#020214'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#fff'; for(var i=0;i<800;i++){ var x=Math.random()*w, y=Math.random()*h, r=Math.random()*1.5; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); } })); }
	function auroraBackdrop(){ return texFromCanvas(makeCanvas(1024,512,function(ctx,w,h){ var g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#081a3a'); g.addColorStop(1,'#083b42'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); var bands=['#64ffda','#aaffee','#77ff88']; for(var b=0;b<bands.length;b++){ ctx.fillStyle=bands[b]; ctx.globalAlpha=0.18; ctx.beginPath(); ctx.ellipse(w*0.4+b*120,h*0.3+b*30,220,60,0,0,Math.PI*2); ctx.fill(); } ctx.globalAlpha=1; })); }
	function sunsetBackdrop(){ return texFromCanvas(makeCanvas(1024,512,function(ctx,w,h){ var g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#ff7e5f'); g.addColorStop(1,'#2a2a72'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); })); }

	// The house is the whole bowling centre: our alley, the neighbouring lanes,
	// the concourse, walls and ceiling. The alley geometry itself lives in
	// alley.js, where every surface is derived from the collision constants.
	function ensureThemeEnvironment(){
		if (themeEnv) return themeEnv;
		if (typeof BowlAlley === 'undefined') return null;

		var built = BowlAlley.createHouse({
			slots: [-2, -1, 0, 1, 2],
			makePins: buildDecorPins
		});
		scene.add(built.group);

		themeEnv = {
			group: built.group,
			alleys: built.alleys,
			backdrop: built.backdrop,
			ceiling: built.ceiling,
			key: null
		};
		return themeEnv;
	}

	// A frozen rack of pins for the neighbouring lanes, so the house doesn't
	// look abandoned. Purely decorative: no bodies, no scoring.
	function buildDecorPins(){
		if (!pinProtoMesh) return null;
		var group = new THREE.Group();
		group.name = 'DecorPins';
		for (var i = 0; i < PIN_POSITIONS.length; i++) {
			var p = PIN_POSITIONS[i];
			var mesh = pinProtoMesh.clone();
			stylePin(mesh);
			mesh.position.set(p[0], p[1], p[2]);
			mesh.castShadow = true;
			group.add(mesh);
		}
		return group;
	}

	function setEnv(themeKey){
		var env = ensureThemeEnvironment();
		if (!env) return;
		BowlAlley.applyTheme(themeKey);
		applyEnvMapToActors();

		// The wall above the masking units is the one big surface the house
		// doesn't need for structure, so the fantasy themes get a mural there.
		// Classic and Lava keep a plain wall -- a sunset over lane 4 would look
		// like a bug, not a theme.
		var mural = null;
		switch(themeKey){
			case 'Ocean': mural = oceanBackdrop(); break;
			case 'Neon Night': case 'Cyber Grid': case 'Cosmic Bowl': mural = starBackdrop(); break;
			case 'Aurora': mural = auroraBackdrop(); break;
			case 'Snow Day': mural = snowTexture(); break;
			case 'Retro 80s': case 'Sunset Blvd': mural = sunsetBackdrop(); break;
		}
		if (env.backdrop && !env.backdropMaterial) {
			// Give the backdrop its own material so retexturing it doesn't
			// repaint every wall in the house.
			env.backdropMaterial = env.backdrop.material.clone();
			env.backdrop.material = env.backdropMaterial;
		}
		if (env.backdropMaterial) {
			var m = env.backdropMaterial;
			// Only ever dispose a mural we made -- falling back to the house
			// wall map means sharing a texture the whole house is using.
			if (env.muralTex) { try { env.muralTex.dispose(); } catch(e){} }
			env.muralTex = mural;
			if (mural) { mural.encoding = THREE.sRGBEncoding; mural.repeat.set(2, 1); mural.needsUpdate = true; }
			var wallMat = BowlAlley.materials().wall;
			m.map = mural || wallMat.map;
			m.color.copy(wallMat.color);
			m.needsUpdate = true;
		}
		env.key = themeKey;
	}

	THEMES = [
		{ name: 'Classic', apply: function(){ scene.background = new THREE.Color(0x708090); if (ambientLight){ ambientLight.color.set(0xffffff); ambientLight.intensity=0.4;} if(dirLight){ dirLight.color.set(0xffffff); dirLight.intensity=0.6; dirLight.position.set(-0.4,0.6,1.0);} setEnv('Classic'); } },
		{ name: 'Ocean', apply: function(){ scene.background = gradientTex('#004466','#001a33'); if (ambientLight){ ambientLight.color.set(0x66aacc); ambientLight.intensity=0.5;} if(dirLight){ dirLight.color.set(0x99ddff); dirLight.intensity=0.7;} setEnv('Ocean'); } },
		{ name: 'Neon Night', apply: function(){ scene.background = gradientTex('#000000','#001113'); if (ambientLight){ ambientLight.color.set(0x00ffcc); ambientLight.intensity=0.25;} if(dirLight){ dirLight.color.set(0x00ff99); dirLight.intensity=0.9;} setEnv('Neon Night'); } },
		{ name: 'Retro 80s', apply: function(){ scene.background = gradientTex('#2b0057','#0a0030'); if (ambientLight){ ambientLight.color.set(0xff66ff); ambientLight.intensity=0.3;} if(dirLight){ dirLight.color.set(0x66ffff); dirLight.intensity=0.8;} setEnv('Retro 80s'); } },
		{ name: 'Cyber Grid', apply: function(){ scene.background = gradientTex('#001010','#000000'); if (ambientLight){ ambientLight.color.set(0x00ffaa); ambientLight.intensity=0.2;} if(dirLight){ dirLight.color.set(0x00cc88); dirLight.intensity=0.9;} setEnv('Cyber Grid'); } },
		{ name: 'Sunset Blvd', apply: function(){ scene.background = gradientTex('#ff7e5f','#2a2a72'); if (ambientLight){ ambientLight.color.set(0xffc28a); ambientLight.intensity=0.45;} if(dirLight){ dirLight.color.set(0xffd1a8); dirLight.intensity=0.7;} setEnv('Sunset Blvd'); } },
		{ name: 'Aurora', apply: function(){ scene.background = gradientTex('#071b52','#0a2b3c'); if (ambientLight){ ambientLight.color.set(0x88ffdd); ambientLight.intensity=0.35;} if(dirLight){ dirLight.color.set(0xaaffee); dirLight.intensity=0.7;} setEnv('Aurora'); } },
		{ name: 'Lava Lanes', apply: function(){ scene.background = gradientTex('#2a0000','#1a0000'); if (ambientLight){ ambientLight.color.set(0xff6633); ambientLight.intensity=0.35;} if(dirLight){ dirLight.color.set(0xffaa33); dirLight.intensity=0.85;} setEnv('Lava Lanes'); } },
		{ name: 'Snow Day', apply: function(){ scene.background = gradientTex('#ddeeff','#99bbdd'); if (ambientLight){ ambientLight.color.set(0xffffff); ambientLight.intensity=0.6;} if(dirLight){ dirLight.color.set(0xffffff); dirLight.intensity=0.7;} setEnv('Snow Day'); } },
		{ name: 'Cosmic Bowl', apply: function(){ scene.background = gradientTex('#000010','#100022'); if (ambientLight){ ambientLight.color.set(0xbbaaff); ambientLight.intensity=0.35;} if(dirLight){ dirLight.color.set(0x99ccff); dirLight.intensity=0.75;} setEnv('Cosmic Bowl'); } }
	];
}

function applyTheme(index) {
	if (!THEMES || !THEMES.length) return;
	var t = THEMES[Math.abs(index|0) % THEMES.length];
	if (t && typeof t.apply === 'function') {
		try { t.apply(); applyThemeLighting(t.name); } catch(e){}
	}
}

// Per-theme lighting rig. The alley materials come from BowlAlley.applyTheme();
// this sets the lamps that fall on them.
function applyThemeLighting(themeName) {
	var pal = (typeof BowlAlley !== 'undefined') ? BowlAlley.paletteFor(themeName) : null;
	if (!deckLight) return;
	var warm = 0xfff0d8;
	switch(themeName){
		case 'Neon Night': warm = 0x66ffcc; break;
		case 'Retro 80s': warm = 0xff99ff; break;
		case 'Cyber Grid': warm = 0x88ffcc; break;
		case 'Aurora': warm = 0xaaffee; break;
		case 'Lava Lanes': warm = 0xffb070; break;
		case 'Ocean': warm = 0xcceeff; break;
		case 'Snow Day': warm = 0xffffff; break;
		case 'Cosmic Bowl': warm = 0xccbbff; break;
	}
	deckLight.color.setHex(warm);
	if (laneLight) laneLight.color.setHex(warm);
	// Dark themes need the deck lamp to carry more of the load.
	var dim = (themeName === 'Neon Night' || themeName === 'Cyber Grid'
			|| themeName === 'Cosmic Bowl' || themeName === 'Retro 80s');
	deckLight.intensity = dim ? 1.15 : 0.85;
	if (laneLight) laneLight.intensity = dim ? 0.55 : 0.4;

	// Fog keeps the far end of the house from reading as a flat cut-out.
	if (scene) {
		var fogHex = pal ? pal.pit : 0x101010;
		if (!scene.fog) { scene.fog = new THREE.Fog(fogHex, 7.0, 26.0); }
		else { scene.fog.color.setHex(fogHex); }
	}
}

// Build a set of ball skins with names, small preview swatches, and an apply(mesh) function
function buildBallSkins() {
	try {
		var makeCanvas = function(w, h, draw) {
			var c = document.createElement('canvas'); c.width = w; c.height = h;
			var ctx = c.getContext('2d');
			draw(ctx, w, h);
			return c;
		};
		var toTex = function(canvas) {
			var tex = new THREE.CanvasTexture(canvas);
			tex.anisotropy = (renderer && renderer.capabilities) ? renderer.capabilities.getMaxAnisotropy() : 1;
			tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
			tex.needsUpdate = true;
			return tex;
		};
		var applyBase = function(mesh, opts) {
			mesh.traverse(function(obj){
				if (obj.isMesh) {
					var mat = obj.material;
					if (Array.isArray(mat)) {
						mat.forEach(function(m){ applyProps(m, opts); });
					} else if (mat) {
						applyProps(mat, opts);
					}
				}
			});
		};
		var applyProps = function(mat, opts) {
			if (!mat) return;
			if (mat.color && opts.color !== undefined) mat.color.set(opts.color);
			if (mat.emissive && opts.emissive !== undefined) mat.emissive.set(opts.emissive);
			if (opts.map !== undefined) { mat.map = opts.map; if (mat.map) mat.map.needsUpdate = true; }
			if (typeof opts.metalness === 'number' && 'metalness' in mat) mat.metalness = opts.metalness;
			if (typeof opts.roughness === 'number' && 'roughness' in mat) mat.roughness = opts.roughness;
			if (typeof opts.envMapIntensity === 'number' && 'envMapIntensity' in mat) mat.envMapIntensity = opts.envMapIntensity;
			mat.needsUpdate = true;
		};

		// Texture generators
		var texSolid = function(color) {
			return toTex(makeCanvas(64, 64, function(ctx, w, h){ ctx.fillStyle = color; ctx.fillRect(0,0,w,h); }));
		};
		var texStripe = function(bg, stripe, count) {
			return toTex(makeCanvas(256, 256, function(ctx, w, h){
				ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);
				ctx.save();
				ctx.translate(w/2, h/2); ctx.rotate(-Math.PI/4);
				var spacing = h / count;
				ctx.fillStyle = stripe;
				for (var i=-count; i<=count; i++) {
					ctx.fillRect(-w, i*spacing - (spacing*0.15), w*2, spacing*0.3);
				}
				ctx.restore();
			}));
		};
		var texZebra = function(bg, stripe, count) {
			return toTex(makeCanvas(256,256,function(ctx,w,h){
				ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);
				ctx.fillStyle = stripe; var wStripe = Math.max(2, Math.floor(w/(count||16)));
				for (var i=0;i<w;i+=wStripe*2){ ctx.fillRect(i,0,wStripe,h); }
			}));
		};
		var texStarfield = function(bg, star, stars) {
			return toTex(makeCanvas(256, 256, function(ctx, w, h){
				var grd = ctx.createRadialGradient(w*0.3, h*0.3, 10, w*0.5, h*0.5, w*0.8);
				grd.addColorStop(0, bg);
				grd.addColorStop(1, '#000000');
				ctx.fillStyle = grd; ctx.fillRect(0,0,w,h);
				ctx.fillStyle = star;
				for (var i=0; i<stars; i++) {
					var x = Math.random()*w, y = Math.random()*h, r = Math.random()*1.8+0.2;
					ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
				}
			}));
		};
		var texFlame = function() {
			return toTex(makeCanvas(256, 256, function(ctx, w, h){
				var grd = ctx.createLinearGradient(0, h, 0, 0);
				grd.addColorStop(0, '#200');
				grd.addColorStop(0.3, '#a20');
				grd.addColorStop(0.6, '#ff6600');
				grd.addColorStop(1, '#ffcc00');
				ctx.fillStyle = grd; ctx.fillRect(0,0,w,h);
				ctx.globalAlpha = 0.2; ctx.fillStyle = '#fff';
				for (var i=0;i<20;i++) {
					var px = Math.random()*w, py = h*0.6 + Math.random()*h*0.4;
					var pw = 10+Math.random()*40, ph = 40+Math.random()*120;
					ctx.beginPath();
					ctx.moveTo(px, py);
					ctx.bezierCurveTo(px-pw, py-ph*0.3, px+pw, py-ph*0.7, px, py-ph);
					ctx.bezierCurveTo(px-pw*0.5, py-ph*0.6, px+pw*0.5, py-ph*0.4, px, py);
					ctx.fill();
				}
				ctx.globalAlpha = 1.0;
			}));
		};
		var texMarble = function(base) {
			return toTex(makeCanvas(256, 256, function(ctx, w, h){
				ctx.fillStyle = base; ctx.fillRect(0,0,w,h);
				ctx.strokeStyle = 'rgba(255,255,255,0.15)';
				ctx.lineWidth = 2;
				for (var i=0;i<60;i++) {
					ctx.beginPath();
					var x = Math.random()*w, y = Math.random()*h;
					var len = 20 + Math.random()*100;
					var ang = Math.random()*Math.PI*2;
					for (var t=0; t<10; t++) {
						ctx.lineTo(x + Math.cos(ang+t*0.3)*len*0.1*t, y + Math.sin(ang+t*0.3)*len*0.1*t);
					}
					ctx.stroke();
				}
			}));
		};

		BALL_SKINS = [
			{
				name: 'Classic Red',
				preview: makeCanvas(32, 32, (ctx,w,h)=>{ ctx.fillStyle='#aa1122'; ctx.beginPath(); ctx.arc(w/2,h/2, w/2, 0, Math.PI*2); ctx.fill(); }).toDataURL(),
				apply: function(mesh){
					applyBase(mesh, { color: 0xaa1122, emissive: 0x220000, metalness: 0.1, roughness: 0.6, map: texSolid('#aa1122') });
				}
			},
			{
				name: 'Blue Stripe',
				preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#113366'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='#ffffff'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(w,0); ctx.stroke(); }).toDataURL(),
				apply: function(mesh){
					var map = texStripe('#113366', '#ffffff', 10);
					applyBase(mesh, { color: 0x113366, emissive: 0x000011, metalness: 0.2, roughness: 0.5, map: map });
				}
			},
			{
				name: 'Neon Swirl',
				preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='#00ff99'; ctx.lineWidth=3; ctx.beginPath(); for (var a=0;a<6.28;a+=0.4){ var r=4+a*2; ctx.lineTo(w/2+Math.cos(a)*r, h/2+Math.sin(a)*r);} ctx.stroke(); }).toDataURL(),
				apply: function(mesh){
					var c = makeCanvas(256,256,function(ctx,w,h){ ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='#00ff99'; ctx.lineWidth=3; ctx.shadowColor='#00ff99'; ctx.shadowBlur=8; ctx.beginPath(); for (var a=0;a<Math.PI*8;a+=0.1){ var r=6+a*3; ctx.lineTo(w/2+Math.cos(a)*r, h/2+Math.sin(a)*r);} ctx.stroke(); });
					applyBase(mesh, { color: 0x000000, emissive: 0x001a12, metalness: 0.0, roughness: 0.9, map: toTex(c) });
				}
			},
			{
				name: 'Starfield',
				preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#fff'; for (var i=0;i<25;i++){ ctx.fillRect(Math.random()*w, Math.random()*h, 1,1);} }).toDataURL(),
				apply: function(mesh){
					var map = texStarfield('#001122', '#ffffff', 220);
					applyBase(mesh, { color: 0x001122, emissive: 0x000000, metalness: 0.05, roughness: 0.8, map: map });
				}
			},
			{
				name: 'Flame',
				preview: makeCanvas(32,32,(ctx,w,h)=>{ var g=ctx.createLinearGradient(0,h,0,0); g.addColorStop(0,'#200'); g.addColorStop(1,'#ff0'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); }).toDataURL(),
				apply: function(mesh){
					var map = texFlame();
					applyBase(mesh, { color: 0x662200, emissive: 0x220000, metalness: 0.15, roughness: 0.6, map: map });
				}
			},
			{
				name: 'Marble Green',
				preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#0a3'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(2,10); ctx.lineTo(30,22); ctx.stroke(); }).toDataURL(),
				apply: function(mesh){
					var map = texMarble('#0a3a2a');
					applyBase(mesh, { color: 0x0a3a2a, emissive: 0x001a12, metalness: 0.1, roughness: 0.7, map: map });
				}
			},
			// Additional 12+ styles
			{ name: 'Solid Blue', preview: makeCanvas(32,32,(c,w,h)=>{c.fillStyle='#2244aa'; c.fillRect(0,0,w,h);}).toDataURL(), apply: function(mesh){ applyBase(mesh, { color: 0x2244aa, emissive: 0x000011, metalness:0.1, roughness:0.7, map: texSolid('#2244aa')}); }},
			{ name: 'Solid Green', preview: makeCanvas(32,32,(c,w,h)=>{c.fillStyle='#1ea64a'; c.fillRect(0,0,w,h);}).toDataURL(), apply: function(mesh){ applyBase(mesh, { color: 0x1ea64a, emissive: 0x001a12, metalness:0.1, roughness:0.7, map: texSolid('#1ea64a')}); }},
			{ name: 'Solid Purple', preview: makeCanvas(32,32,(c,w,h)=>{c.fillStyle='#6a22aa'; c.fillRect(0,0,w,h);}).toDataURL(), apply: function(mesh){ applyBase(mesh, { color: 0x6a22aa, emissive: 0x110022, metalness:0.1, roughness:0.7, map: texSolid('#6a22aa')}); }},
			{ name: 'Solid Orange', preview: makeCanvas(32,32,(c,w,h)=>{c.fillStyle='#ff7f11'; c.fillRect(0,0,w,h);}).toDataURL(), apply: function(mesh){ applyBase(mesh, { color: 0xff7f11, emissive: 0x221100, metalness:0.1, roughness:0.7, map: texSolid('#ff7f11')}); }},
			{ name: 'Solid Black', preview: makeCanvas(32,32,(c,w,h)=>{c.fillStyle='#000000'; c.fillRect(0,0,w,h);}).toDataURL(), apply: function(mesh){ applyBase(mesh, { color: 0x000000, emissive: 0x000000, metalness:0.0, roughness:0.9, map: texSolid('#000000')}); }},
			{ name: 'Solid White', preview: makeCanvas(32,32,(c,w,h)=>{c.fillStyle='#ffffff'; c.fillRect(0,0,w,h);}).toDataURL(), apply: function(mesh){ applyBase(mesh, { color: 0xffffff, emissive: 0x111111, metalness:0.0, roughness:0.4, map: texSolid('#ffffff')}); }},
			{ name: 'Bubblegum Pink', preview: makeCanvas(32,32,(c,w,h)=>{c.fillStyle='#ff66cc'; c.fillRect(0,0,w,h);}).toDataURL(), apply: function(mesh){ applyBase(mesh, { color: 0xff66cc, emissive: 0x220011, metalness:0.1, roughness:0.6, map: texSolid('#ff66cc')}); }},
			{ name: 'Checkerboard', preview: makeCanvas(32,32,(ctx,w,h)=>{ for (var y=0;y<8;y++){ for(var x=0;x<8;x++){ ctx.fillStyle=((x+y)%2)?'#000':'#fff'; ctx.fillRect(x*4,y*4,4,4);} } }).toDataURL(), apply: function(mesh){ var c=makeCanvas(256,256,(ctx,w,h)=>{ for (var y=0;y<32;y++){ for(var x=0;x<32;x++){ ctx.fillStyle=((x+y)%2)?'#000':'#fff'; ctx.fillRect(x*8,y*8,8,8);} } }); applyBase(mesh, { color: 0xffffff, emissive: 0x111111, metalness:0.0, roughness:0.7, map: toTex(c)}); }},
			{ name: 'Zebra', preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#000'; for(var i=0;i<8;i++){ ctx.fillRect(i*4,0,2,32);} }).toDataURL(), apply: function(mesh){ var map=texZebra('#ffffff','#000000',16); applyBase(mesh,{ color:0xffffff, emissive:0x111111, metalness:0.0, roughness:0.8, map: map}); }},
			{ name: 'Rainbow', preview: makeCanvas(32,32,(ctx,w,h)=>{ var g=ctx.createLinearGradient(0,0,32,0); ['#ff0000','#ffa500','#ffff00','#00ff00','#0000ff','#4b0082','#ee82ee'].forEach((c,i)=>g.addColorStop(i/6,c)); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); }).toDataURL(), apply: function(mesh){ var c=makeCanvas(256,256,(ctx,w,h)=>{ var g=ctx.createLinearGradient(0,0,w,0); ['#ff0000','#ffa500','#ffff00','#00ff00','#0000ff','#4b0082','#ee82ee'].forEach((c,i)=>g.addColorStop(i/6,c)); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); }); applyBase(mesh,{ color:0xffffff, emissive:0x111111, metalness:0.0, roughness:0.6, map: toTex(c)}); }},
			{ name: 'Carbon Fiber', preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#222'; for(var y=0;y<32;y+=4){ for(var x=0;x<32;x+=4){ ctx.fillRect(x+(y%8?2:0),y,2,2);} } }).toDataURL(), apply: function(mesh){ var c=makeCanvas(256,256,(ctx,w,h)=>{ ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#222'; for(var y=0;y<h;y+=16){ for(var x=0;x<w;x+=16){ ctx.fillRect(x+((y%32)?8:0),y,8,8);} } }); applyBase(mesh,{ color:0x222222, emissive:0x000000, metalness:0.6, roughness:0.4, map: toTex(c)}); }},
			{ name: 'Chrome', preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#aaa'; ctx.fillRect(0,0,w,h); }).toDataURL(), apply: function(mesh){ applyBase(mesh,{ color:0xbbbbbb, emissive:0x000000, metalness:1.0, roughness:0.05, map: null}); }},
			{ name: 'Basketball', preview: makeCanvas(32,32,(ctx,w,h)=>{ ctx.fillStyle='#d35400'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,16); ctx.lineTo(32,16); ctx.moveTo(16,0); ctx.lineTo(16,32); ctx.stroke(); }).toDataURL(), apply: function(mesh){ var c=makeCanvas(256,256,(ctx,w,h)=>{ ctx.fillStyle='#d35400'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='#000'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke(); }); applyBase(mesh,{ color:0xd35400, emissive:0x220a00, metalness:0.1, roughness:0.9, map: toTex(c)}); }}
		];
	} catch(e) {
		// Fallback: at least one solid color skin
		BALL_SKINS = [
			{ name: 'Solid Blue', preview: null, apply: function(mesh){ mesh.traverse(function(obj){ if(obj.isMesh && obj.material && obj.material.color){ obj.material.color.set(0x2244aa);} }); } }
		];
	}
}
// Menu navigation state
var mainMenuItems = [];          // array of elements
var menuFocusIndex = -1;
var menuScanHeld = false;
var menuHoldStart = 0.0;
var menuLastBackStep = 0.0;
var menuBackScanAnnounced = false; // TTS announced flag
// Pre-game setup screen: the choices that belong to a match rather than to the
// machine, kept out of Settings so the settings scan list stays short.
var setupDiv = null;
var setupItems = [];
var setupFocusIndex = 0;
var setupScanHeld = false;
var setupHoldStart = 0.0;
var setupLastBackStep = 0.0;
var setupBackScanAnnounced = false;
var rebuildSetupItems = function () {};

var settingsItems = [];          // array of {el, key, type}
var settingsFocusIndex = 0;
var settingsScanHeld = false;
var settingsHoldStart = 0.0;
var settingsLastBackStep = 0.0;
var settingsBackScanAnnounced = false; // TTS announced flag
// Pause menu scan state
var pauseMenuItems = [];
var pauseFocusIndex = -1;
var pauseScanHeld = false;
var pauseHoldStart = 0.0;
var pauseLastBackStep = 0.0;
var pauseBackScanAnnounced = false; // TTS announced flag
var autoScanLastTime = 0.0; // Added for Auto Scan support
// Enter hold to pause
var enterHeld = false;
var enterHoldStart = 0.0;

class Player {
	constructor(id, local, physics, scores, ballMesh, pinMeshes) {
		this.id = id;
		this.local = local;
		this.physics = physics;
		this.scores = scores;
		this.ballMesh = ballMesh;
		this.pinMeshes = pinMeshes;
		this.aimHelper = null; // THREE.ArrowHelper for aiming visualization
	}
}

class Imitation {
	constructor(frames, emergingTime, slot) {
		this.frames = frames;
		this.waitingTime = emergingTime;
		this.slot = slot;
	}
}

function init() {
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0.7, 0.7, 0.7);

	camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight,
			CAMERA_NEAR, CAMERA_FAR);
	camera.position.set(0.0, 1.7, 5.0);
	camera.rotation.x = -25.0 / 180.0 * Math.PI;

	ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
	scene.add(ambientLight);

	dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
	dirLight.position.set(-0.4, 0.6, 1.0);
	scene.add(dirLight);

	// Overhead lamp on the pin deck. This is the only shadow caster: it gives
	// the pins and the ball a contact shadow, which is most of what sells the
	// deck as a real surface.
	deckLight = new THREE.SpotLight(0xfff0d8, 0.85, 6.0, 0.62, 0.55, 1.2);
	deckLight.position.set(0.0, 2.0, -0.35);
	deckLight.target.position.set(0.0, BASE_HEIGHT, -0.45);
	deckLight.castShadow = true;
	deckLight.shadow.mapSize.width = 1024;
	deckLight.shadow.mapSize.height = 1024;
	deckLight.shadow.camera.near = 0.5;
	deckLight.shadow.camera.far = 5.0;
	deckLight.shadow.bias = -0.0016;
	scene.add(deckLight);
	scene.add(deckLight.target);

	// A softer lamp further up the lane so the ball isn't lit from nowhere on
	// its way down. No shadow: one shadow map is plenty here.
	laneLight = new THREE.SpotLight(0xfff0d8, 0.4, 8.0, 0.75, 0.7, 1.2);
	laneLight.position.set(0.0, 2.2, 2.0);
	laneLight.target.position.set(0.0, BASE_HEIGHT, 1.6);
	scene.add(laneLight);
	scene.add(laneLight.target);

	touchPoint = new THREE.Vector2();
	pickPoint = new THREE.Vector3();
	dragPoint = new THREE.Vector3();
	releaseVector = new THREE.Vector3();
	raycaster = new THREE.Raycaster();
	pickSphere = new THREE.Sphere(new THREE.Vector3(), BALL_RADIUS);

	clock = new THREE.Clock();

	container = document.getElementById("container");

	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.gammaOutput = true;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	container.appendChild(renderer.domElement);

	scoresDiv = document.createElement("div");
	scoresDiv.style = "position: fixed; left: 50%; top: calc(8px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); transform-origin: 50% 0; z-index: 1000; will-change: transform;";
	container.appendChild(scoresDiv);

	// Charge bar UI (hidden by default)
	chargeBar = document.createElement("div");
	// Position under the scoreboard (will be refined dynamically)
	chargeBar.style = "position: fixed; left: 50%; top: 56px; transform: translateX(-50%); width: min(280px, 76vw); height: 14px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); border-radius: 8px; overflow: hidden; display: none; z-index: 1000;";
	chargeFill = document.createElement("div");
	chargeFill.style = "height: 100%; width: 0%; background: linear-gradient(90deg, #33cc33, #00ff99); box-shadow: 0 0 8px #00ff99;";
	chargeBar.appendChild(chargeFill);
	container.appendChild(chargeBar);

	// Help tips (hidden in menus/paused)
	helpTipsDiv = document.createElement('div');
	helpTipsDiv.style = [
		'position: fixed',
		'left: 50%','bottom: 12px','transform: translateX(-50%)',
		'z-index: 1400','pointer-events: none',
		'padding: 8px 12px','border-radius: 10px',
		'background: rgba(0,0,0,0.55)','color: #eaffff',
		'font: 700 11px "Courier New", monospace',
		'letter-spacing: 0.5px','text-align: center',
		'box-shadow: 0 0 10px rgba(0,255,153,0.35)',
		'border: 1px solid rgba(0,255,153,0.35)',
		'display: none'
	].join(';');
	helpTipsDiv.innerHTML = [
		'<div data-tips="full">Drag ball to position; drag forward to throw.</div>',
		'<div data-tips="full">Keyboard: Space = move, Enter = aim, Space = set angle, Hold Enter = charge, release to bowl.</div>',
		'<div data-tips="brief" style="display:none">Space = move &middot; Enter = aim &middot; hold Enter = bowl</div>'
	].join('');
	container.appendChild(helpTipsDiv);

	// Pause UI Button (mouse users)
	pauseUIButton = document.createElement('button');
	pauseUIButton.textContent = 'PAUSE';
	pauseUIButton.style = "position: fixed; left: 12px; bottom: 12px; z-index: 1500; padding:8px 12px; color:#00ff99; background:#000000; border:2px solid #00ff99; border-radius:8px; font-weight:800; letter-spacing:1px; cursor:pointer; box-shadow:0 0 8px #00ff99;";
	pauseUIButton.onclick = function(){ if (gameState === 'playing') { openPauseMenu(); } };
	pauseUIButton.style.display = 'none';   // only shown during play
	container.appendChild(pauseUIButton);

	// XXX How to get pixel density?
	ppi = 96 * window.devicePixelRatio;

	window.addEventListener("resize", resizeViewport, false);

	var loader = new THREE.GLTFLoader();
	loader.load("res/scene.gltf", (gltf) => {
		// The model's "Track" node is no longer used: the alley is built
		// procedurally in alley.js so it lines up with the collision shapes.
		ballProtoMesh = gltf.scene.children.find(child => child.name == "Ball");
		if (!ballProtoMesh) {
			throw new Error("Ball not found");
		}
		pinProtoMesh = gltf.scene.children.find(child => child.name == "Pin");
		if (!pinProtoMesh) {
			throw new Error("Pin not found");
		}

		var maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
		setAnisotropy(ballProtoMesh, maxAnisotropy);
		setAnisotropy(pinProtoMesh, maxAnisotropy);

		Ammo().then((Ammo) => {
			initScene();
		});
	});
}

function setAnisotropy(parent, anisotropy) {
	parent.traverse((object) => {
		if (object.isMesh && object.material && object.material.map) {
			object.material.map.anisotropy = anisotropy;
		}
	});
}

// Hot-seat multiplayer: exactly one player has the controls at a time, and
// that is the one every input path already asks for.
function getLocalPlayer() {
	if (!players || !players.length) {
		return undefined;
	}
	var i = Math.max(0, Math.min(players.length - 1, activePlayerIndex));
	return players[i];
}

// Everything below assumes exactly one player holds the controls at a time.
function syncActivePlayerFlags() {
	if (!players) return;
	for (var i = 0; i < players.length; i++) {
		players[i].local = (i === activePlayerIndex);
	}
}

function applyBallStylesToPlayers() {
	if (!players) return;
	for (var i = 0; i < players.length; i++) {
		applyBallStyle(players[i].ballMesh, ballStyleFor(players[i].index));
	}
}

// Clear anything left over from the previous player's shot so nobody inherits a
// half-finished aim or a live charge.
function resetShotState() {
	aimingMode = false;
	aimHeld = false;
	spaceHeld = false;
	charging = false;
	enterHeld = false;
	currentAimAngle = 0.0;
	if (chargeBar) chargeBar.style.display = 'none';
	if (typeof BowlCues !== 'undefined') BowlCues.stopAll();
	stopRollingLoop();
	var p = getLocalPlayer();
	if (p) setAimHelperVisible(p, false);
}

function allPlayersFinished() {
	if (!players || !players.length) return false;
	for (var i = 0; i < players.length; i++) {
		if (!players[i].scores.gameOver) return false;
	}
	return true;
}

// Hand over to the next player who still has frames left. With one player this
// just re-announces the frame, exactly as it did before.
function advanceTurn() {
	if (!players || !players.length) return;
	if (allPlayersFinished()) { showGameOver(); return; }

	var n = players.length;
	var next = activePlayerIndex;
	for (var k = 1; k <= n; k++) {
		var cand = (activePlayerIndex + k) % n;
		if (!players[cand].scores.gameOver) { next = cand; break; }
	}
	var spokeStrike = players[activePlayerIndex]._spokeStrikeThisRoll;
	players[activePlayerIndex]._spokeStrikeThisRoll = false;

	activePlayerIndex = next;
	syncActivePlayerFlags();
	resetShotState();
	renderScoreboard();

	var p = players[activePlayerIndex];
	var frameNo = p.scores.frameNumber + 1;
	var message = (players.length > 1)
			? (p.label + ', frame ' + frameNo)
			: ('Frame ' + frameNo);
	var announce = function () { speakText(message); };
	// Don't talk over the strike call that just fired.
	if (spokeStrike) { setTimeout(announce, 1200); } else { announce(); }
}

function playerCount() {
	return Math.max(1, Math.min(MAX_PLAYERS, settings.playerCount | 0));
}

function ballStyleFor(playerIndex) {
	var i = Math.max(0, Math.min(MAX_PLAYERS - 1, playerIndex | 0));
	var v = settings.ballStyles[i];
	return (typeof v === 'number') ? v : PLAYER_COLORS[i].ball;
}

function playerColor(playerIndex) {
	return PLAYER_COLORS[Math.max(0, Math.min(MAX_PLAYERS - 1, playerIndex | 0))];
}

function playerLabel(playerIndex) {
	return 'Player ' + (playerIndex + 1);
}

function addPlayer(id, local, slot) {
	var physics = new BowlPhysics();

	var scores = new Scores();

	var group = new THREE.Group();
	group.position.x = slot * TRACK_DISTANCE;
	scene.add(group);

	// The alley itself is part of the house (see ensureThemeEnvironment), so a
	// player only contributes its ball and pins. Hide the decorative rack on
	// whichever lane this player takes over.
	if (typeof BowlAlley !== 'undefined') {
		BowlAlley.setDecorPinsVisible(slot, false);
	}

	var ballMesh = ballProtoMesh.clone();
	// Object3D.clone() shares material references, so without this every
	// player's ball would be the same material and the last style applied
	// would repaint all of them.
	giveOwnMaterials(ballMesh);
	ballMesh.castShadow = true;
	group.add(ballMesh);

	var pinMeshes = new Array(PIN_COUNT);
	for (var i = 0; i < pinMeshes.length; i++) {
		var pinMesh = pinProtoMesh.clone();
		stylePin(pinMesh);
		pinMesh.castShadow = true;
		group.add(pinMesh);
		pinMeshes[i] = pinMesh;
	}

	var player = new Player(id, local, physics, scores, ballMesh, pinMeshes);
	player.slot = slot;
	buildReflections(player, group);

	if (!players) {
		players = new Array();
	}
	players.push(player);

	// After the push: applyEnvMapToActors walks the player list.
	applyEnvMapToActors();

	return player;
}

// Detach a cloned object's materials from the prototype it was cloned from, so
// it can be restyled without affecting its siblings.
function giveOwnMaterials(root) {
	root.traverse(function (obj) {
		if (!obj.isMesh || !obj.material) return;
		obj.material = Array.isArray(obj.material)
				? obj.material.map(function (m) { return m ? m.clone() : m; })
				: obj.material.clone();
	});
}

// Bright polished-white pin finish; the GLTF texture supplies the red bands.
function stylePin(pinMesh) {
	pinMesh.traverse(function(obj){
		if (!obj.isMesh || !obj.material) return;
		var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (var mi = 0; mi < mats.length; mi++) {
			var m = mats[mi];
			if (!m) continue;
			if (m.color) m.color.setHex(0xffffff);
			if ('metalness' in m) m.metalness = 0.0;
			// Pins are lacquered, so they hold a tight highlight.
			if ('roughness' in m) m.roughness = 0.22;
			if ('emissive' in m && m.emissive) m.emissive.setHex(0x060606);
			if ('envMapIntensity' in m) m.envMapIntensity = 0.5;
			m.needsUpdate = true;
		}
	});
}

// Push the house's environment map onto the ball and pins so they pick up the
// room instead of looking like matte plastic.
function applyEnvMapToActors() {
	if (typeof BowlAlley === 'undefined') return;
	var env = BowlAlley.getEnvMap();
	if (!env || !players) return;
	players.forEach(function(p){
		[p.ballMesh].concat(p.pinMeshes || []).forEach(function(root){
			if (!root) return;
			root.traverse(function(obj){
				if (!obj.isMesh || !obj.material) return;
				var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
				mats.forEach(function(m){
					if (!m || !('envMap' in m)) return;
					m.envMap = env;
					m.needsUpdate = true;
				});
			});
		});
	});
}

// --- lane sheen -------------------------------------------------------------
// A freshly oiled lane throws a bright smear back toward the bowler under
// anything standing on it. A true mirror would mean either a render target or
// mirrored geometry below an opaque lane -- and geometry below the lane has to
// skip the depth test to be visible at all, which makes it punch through the
// kickbacks from any angle but one. Instead each object gets a flat quad lying
// *in* the lane plane. It can't poke through anything, it depth-tests correctly
// from every camera, and at this grazing angle it reads the same.
const SHEEN_STRENGTH = 0.55;
const SHEEN_FADE_HEIGHT = 0.35;   // sheen dies out as things fly up off the lane

var sheenGradientTex = null;

function getSheenGradient() {
	if (sheenGradientTex) return sheenGradientTex;
	var c = document.createElement('canvas');
	c.width = 16; c.height = 128;
	var ctx = c.getContext('2d');
	// Row 0 is v=1, which is the end of the quad that touches the object.
	var g = ctx.createLinearGradient(0, 0, 0, 128);
	g.addColorStop(0.00, 'rgba(255,255,255,0.85)');
	g.addColorStop(0.25, 'rgba(255,255,255,0.42)');
	g.addColorStop(0.60, 'rgba(255,255,255,0.13)');
	g.addColorStop(1.00, 'rgba(255,255,255,0.0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 16, 128);
	// Taper the sides so the streak has soft edges rather than hard corners.
	var side = ctx.createLinearGradient(0, 0, 16, 0);
	side.addColorStop(0.0, 'rgba(0,0,0,1)');
	side.addColorStop(0.5, 'rgba(0,0,0,0)');
	side.addColorStop(1.0, 'rgba(0,0,0,1)');
	ctx.globalCompositeOperation = 'destination-out';
	ctx.fillStyle = side;
	ctx.fillRect(0, 0, 16, 128);
	sheenGradientTex = new THREE.CanvasTexture(c);
	sheenGradientTex.needsUpdate = true;
	return sheenGradientTex;
}

const SHEEN_LENGTH = 1.0;   // geometry length; scaled per frame

function makeSheen(width, colorHex) {
	var mat = new THREE.MeshBasicMaterial({
		map: getSheenGradient(),
		color: colorHex,
		transparent: true,
		opacity: SHEEN_STRENGTH,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		fog: false
	});
	var mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(width, SHEEN_LENGTH), mat);
	// Lie flat in the lane plane, a hair above it so it never z-fights.
	mesh.rotation.x = -Math.PI / 2;
	mesh.visible = false;
	return mesh;
}

function buildReflections(player, group) {
	player.ballSheen = makeSheen(2.1 * BALL_RADIUS, 0xffffff);
	group.add(player.ballSheen);
	player.pinSheens = player.pinMeshes.map(function(){
		var s = makeSheen(2.0 * PIN_RADIUS_MAX, 0xffffff);
		group.add(s);
		return s;
	});
}

// Lay the streak on the lane running from the object back toward the bowler.
// After the -90deg X rotation the quad's local +Y points at -Z, so v=1 (the
// bright end of the gradient) lands at the far edge -- put that edge on the
// object and the streak trails towards the camera.
function syncSheen(sheen, source, visible, radius) {
	if (!sheen) return;
	if (!visible) { sheen.visible = false; return; }
	var lift = Math.max(0.0, source.position.y - BASE_HEIGHT - radius);
	var fade = 1.0 - lift / SHEEN_FADE_HEIGHT;
	if (fade <= 0.02) { sheen.visible = false; return; }

	// Taller objects throw a longer streak; a pin on its side barely smears.
	var height = Math.max(0.04, source.position.y - BASE_HEIGHT);
	var len = Math.min(0.75, 2.6 * height);
	sheen.scale.set(1.0, len / SHEEN_LENGTH, 1.0);
	sheen.position.set(source.position.x, BASE_HEIGHT + 0.0012,
			source.position.z + len * 0.5);
	sheen.visible = true;
	sheen.material.opacity = SHEEN_STRENGTH * fade;
}

// Only draw sheen on the polished lane: a streak floating over a gutter or the
// pit would read as a bug.
function overLane(pos, radius) {
	return Math.abs(pos.x) < (LANE_HALF_WIDTH - radius)
			&& pos.z < TRACK_START_Z && pos.z > LANE_END_Z + radius;
}

function removePlayer(id) {
	if (!players) {
		return;
	}
	for (var i = 0; i < players.length; i++) {
		var player = players[i];
		if (player.id === id) {
			scene.remove(player.ballMesh.parent);
			// Hand the lane back to its decorative pin rack.
			if (typeof BowlAlley !== 'undefined') {
				BowlAlley.setDecorPinsVisible(player.slot, true);
			}
			players.splice(i, 1);
			return;
		}
	}
}

function createImitation(slot) {
	var frames = 1 + Math.floor(Math.random() * FRAME_COUNT);
	var emergingTime = IMITATION_EMERGING_TIME_MIN + Math.random()
			* (IMITATION_EMERGING_TIME_MAX - IMITATION_EMERGING_TIME_MAX);
	return new Imitation(frames, emergingTime, slot);
}

function addImitation(slot) {
	var imitation = createImitation(slot);
	if (!imitations) {
		imitations = new Array();
	}
	imitations.push(imitation);
	return imitation;
}

function restartImitation(imitation) {
	if (imitation.player) {
		removePlayer(imitation.player.id);
	}
	if (!imitations) {
		return;
	}
	var imitationIndex = imitations.findIndex(i => i === imitation);
	if (imitationIndex === undefined) {
		return;
	}
	imitations[imitationIndex] = createImitation(imitation.slot);
}

function updateImitation(imitation, dt) {
	imitation.waitingTime -= dt;
	if (imitation.waitingTime > 0.0) {
		return;
	}

	imitation.waitingTime = IMITATION_THROW_TIME_MIN + Math.random()
			* (IMITATION_THROW_TIME_MAX - IMITATION_THROW_TIME_MIN);

	if (!imitation.player) {
		imitation.player = addPlayer(++imitationPlayerId, false, imitation.slot);
	}

	if (imitation.player.scores.gameOver
			|| (imitation.player.scores.frameNumber >= imitation.frames)) {
		restartImitation(imitation);
		return;
	}

	var position = IMITATION_THROW_POSITION_MAX * 2.0 * (Math.random() - 0.5);
	var angle = IMITATION_THROW_ANGLE_MAX * 2.0 * (Math.random() - 0.5);
	var velocity = BALL_VELOCITY_MIN + Math.random() * (BALL_VELOCITY_MAX - BALL_VELOCITY_MIN);
	imitation.player.physics.positionBall(position, false);
	imitation.player.physics.releaseBall(velocity, angle);
	// SFX: ball rolling for imitation throws too. No looping roll here: that
	// element belongs to whoever is actually bowling.
	playSfx('sound/rolling-ball.wav', ROLL_VOLUME);
}

function initScene() {
	// Start in menu; the player is created when 'Play Game' is pressed

	renderer.domElement.addEventListener("mousedown", onDocumentMouseDown, false);
	renderer.domElement.addEventListener("mousemove", onDocumentMouseMove, false);
	renderer.domElement.addEventListener("mouseup", onDocumentMouseUp, false);
	renderer.domElement.addEventListener("touchstart", onDocumentTouchStart, false);
	renderer.domElement.addEventListener("touchmove", onDocumentTouchMove, false);
	renderer.domElement.addEventListener("touchend", onDocumentTouchEnd, false);

	// Keyboard: Spacebar to move ball left/right across the lane
	window.addEventListener("keydown", onDocumentKeyDown, false);
	window.addEventListener("keyup", onDocumentKeyUp, false);

	// Listen for cancelled inputs from scan-manager (e.g., too-short presses blocked by anti-tremor)
	document.addEventListener('narbe-input-cancelled', function(e) {
		// The shared scan manager filters out presses shorter than the user's
		// tremor threshold, and it swallows the keyup of a rejected press. Any
		// hold state we set on keydown must therefore be released here, or it
		// stays stuck and the game behaves as though the switch were still held
		// (ball oscillating, aim sweeping, charge bar filling). The hub pushes
		// its own, higher, threshold into this iframe over postMessage, which is
		// why this only ever bit when the game was launched from the hub.
		if (!e.detail) return;
		var tooShort = (e.detail.reason === 'too-short');
		var isSpace = (e.detail.key === ' ' || e.detail.code === 'Space');
		var isEnter = (e.detail.key === 'Enter' || e.detail.code === 'Enter'
				|| e.detail.code === 'NumpadEnter');

		if (isSpace) {
			menuScanHeld = false;
			menuHoldStart = 0.0;
			menuBackScanAnnounced = false;
			settingsScanHeld = false;
			settingsHoldStart = 0.0;
			settingsBackScanAnnounced = false;
			pauseScanHeld = false;
			pauseHoldStart = 0.0;
			pauseBackScanAnnounced = false;
			// Gameplay: stop the oscillation the swallowed keyup would have stopped.
			spaceHeld = false;
			aimHeld = false;
			setupScanHeld = false;
			setupHoldStart = 0.0;
			setupBackScanAnnounced = false;
			// If cancelled due to 'too-short', still perform forward scan in menu - user intended to press
			if (tooShort && (gameState === 'menu' || gameState === 'paused')) {
				if (setupIsOpen()) {
					setupFocusIndex = (setupFocusIndex + 1) % setupItems.length;
					applySetupFocus();
				} else if (settingsDiv && settingsDiv.style.display === 'flex') {
					settingsFocusIndex = (settingsFocusIndex + 1) % settingsItems.length;
					applySettingsFocus();
				} else if (gameState === 'menu') {
					menuFocusIndex = (menuFocusIndex + 1) % mainMenuItems.length;
					applyMenuFocus();
				} else {
					pauseFocusIndex = (pauseFocusIndex + 1) % pauseMenuItems.length;
					applyPauseFocus();
				}
			}
		}

		if (isEnter) {
			var wasEnterHeld = enterHeld;
			enterHeld = false;
			enterHoldStart = 0.0;
			// If cancelled due to 'too-short', still perform select in menu - user intended to press
			if (tooShort && wasEnterHeld && (gameState === 'menu' || gameState === 'paused')) {
				if (setupIsOpen()) {
					handleSetupEnter();
				} else if (settingsDiv && settingsDiv.style.display === 'flex') {
					handleSettingsEnter();
				} else if (gameState === 'menu') {
					handleMainMenuEnter();
				} else {
					handlePauseMenuEnter();
				}
			} else if (gameState === 'playing') {
				if (charging) {
					// Abort the charge rather than bowling: a press the filter
					// rejected was never meant to be a throw.
					cancelCharge();
				} else if (wasEnterHeld) {
					// Otherwise let the press stand as a normal release, so the
					// player can still advance from positioning into aiming.
					handleGameInputUp();
				}
			}
		}
	});

	// Build UI overlays
	buildMenus();
	showMainMenu();

	// Prepare celebration overlay (hidden by default)
	try {
		celebrationDiv = document.createElement('div');
		celebrationDiv.id = 'bb_celebration';
		celebrationDiv.style = [
			'position:fixed',
			'left:50%','top:22%','transform:translate(-50%, -50%) scale(0.8)',
			'opacity:0','z-index:2300','pointer-events:none',
			'font-family:"Courier New", monospace','font-weight:900','letter-spacing:3px',
			'font-size:clamp(26px, 9vw, 64px)','color:#ffe066',
			'text-shadow:0 0 12px #ffcc33, 0 0 24px #ffaa00, 0 0 40px #ff8800',
			'filter: drop-shadow(0 0 10px rgba(255,170,0,0.6))',
			'transition: opacity 380ms ease, transform 380ms ease'
		].join(';');
		celebrationDiv.textContent = '';
		document.body.appendChild(celebrationDiv);
	} catch(e) {}

	animate();
}

function updateGame(player, dt) {
	player.physics.updatePhysics(dt);

	// Initialize pin standing state when a new roll starts
	if (!player._prevSimActive && player.physics.simulationActive) {
		player._sfxPinStanding = new Array(PIN_COUNT);
		for (var si = 0; si < PIN_COUNT; si++) player._sfxPinStanding[si] = true;
	}

	// During simulation, detect pin drops and play per-pin SFX
	if (player.physics.simulationActive && player.physics.pinBodies) {
		try {
			for (var i = 0; i < player.physics.pinBodies.length; i++) {
				var pinBody = player.physics.pinBodies[i];
				if (!pinBody) continue;
				var transform = pinBody.getCenterOfMassTransform();
				var p = transform.getOrigin();
				var origin = PIN_POSITIONS[i];
				var dx = p.x() - origin[0];
				var dy = p.y() - origin[1];
				var dz = p.z() - origin[2];
				var distanceSquared = dx * dx + dy * dy + dz * dz;
				var upright = (transform.getBasis().getRow(1).y() > STANDING_PIN_COS_ANGLE_Y_MIN);
				var standingNow = (distanceSquared < STANDING_PIN_SQUARED_OFFSET_MAX) && upright;
				if (player._sfxPinStanding && player._sfxPinStanding[i] && !standingNow) {
					// Transition: standing -> fallen
					playSfx('sound/single-pin.mp3', 0.9);
				}
				if (player._sfxPinStanding) player._sfxPinStanding[i] = standingNow;
			}
		} catch(e) {}
	}

	if (player.physics.simulationActive && (player.physics.simulationTime > FRAME_ROLL_TIME)) {
		var standingPinsMask = player.physics.detectStandingPins();
		var beatenPinsMask = player.physics.currentPinsMask & (~standingPinsMask);
		var beatenPinCount = player.physics.countPins(beatenPinsMask);

		var prevFrameNumber = player.scores.frameNumber;
		// Apply scoring
		player.scores.addThrowResult(beatenPinCount);
		if (player.local) {
			renderScoreboard();
			// Announce outcome of this roll (TTS)
			// Prefer an emphatic "Strike!" when applicable
			try {
				var info = getLatestThrowInfo(player.scores);
				if (info && info.ch === 'X') {
					player._spokeStrikeThisRoll = true;
					speakText('Strike!');
					showStrikeCelebration();
				} else {
					speakLatestRollOutcome(player.scores);
				}
			} catch(e) { speakLatestRollOutcome(player.scores); }
		}

		// The turn ends when the frame closes -- on a strike that is the first
		// ball, otherwise the second. In the tenth frame closeFrame() sets
		// gameOver instead of advancing, so that counts as the frame ending too.
		var turnOver = (prevFrameNumber != player.scores.frameNumber) || player.scores.gameOver;

		if (!player.scores.gameOver) {
			var pinsMask;
			if (turnOver || (standingPinsMask == 0)) {
				pinsMask = -1;
			} else {
				pinsMask = standingPinsMask;
			}
			player.physics.resetPhysics(false, pinsMask);
		} else {
			// Done for the game: leave a full rack standing on their lane.
			player.physics.resetPhysics(false, -1);
		}

		if (player.local && turnOver) {
			if (allPlayersFinished()) {
				showGameOver();
				return; // stop further processing this frame
			}
			advanceTurn();
			return;
		}
	}

	syncView(player);
	if (player.local) updateRollingLoop(player);

	// Track simulation state transitions
	player._prevSimActive = player.physics.simulationActive;
}

function updateScene(dt) {
	if (imitations) {
		for (var i = 0; i < imitations.length; i++) {
			updateImitation(imitations[i], dt);
		}
	}

	// Handle menu/pause scanning timers when in menu or paused
	if (gameState === 'menu' || gameState === 'paused') {
		var now = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		
		// Auto Scan Logic (Forward)
		var sm = (typeof NarbeScanManager !== 'undefined') ? NarbeScanManager : null;
		var scanInt = (sm ? sm.getScanInterval() : 2000) / 1000.0;
		if (sm && sm.getSettings().autoScan) {
			if ((now - autoScanLastTime) >= scanInt) {
				// New game setup
				if (setupIsOpen() && !setupScanHeld) {
					setupFocusIndex = (setupFocusIndex + 1) % setupItems.length;
					applySetupFocus();
					autoScanLastTime = now;
				}
				// Settings
				else if (settingsDiv && settingsDiv.style.display === 'flex' && !settingsScanHeld) {
					settingsFocusIndex = (settingsFocusIndex + 1) % settingsItems.length;
					applySettingsFocus();
					autoScanLastTime = now;
				}
				// Menu
				else if (gameState === 'menu' && !setupIsOpen() && (!settingsDiv || settingsDiv.style.display !== 'flex') && !menuScanHeld) {
					if (menuFocusIndex === -1) menuFocusIndex = 0;
					else menuFocusIndex = (menuFocusIndex + 1) % mainMenuItems.length;
					applyMenuFocus();
					autoScanLastTime = now;
				}
				// Pause
				else if (gameState === 'paused' && !setupIsOpen() && (!settingsDiv || settingsDiv.style.display !== 'flex') && !pauseScanHeld) {
					if (pauseFocusIndex === -1) pauseFocusIndex = 0;
					else pauseFocusIndex = (pauseFocusIndex + 1) % pauseMenuItems.length;
					applyPauseFocus();
					autoScanLastTime = now;
				}
			}
		}

		// Setup screen backward scan every 2s after a 3s hold
		if (setupIsOpen() && setupScanHeld) {
			var heldSetup = Math.max(0.0, now - setupHoldStart);
			if (heldSetup >= 3.0) {
				if (!setupBackScanAnnounced) {
					setupBackScanAnnounced = true;
					if (window.NarbeVoiceManager) window.NarbeVoiceManager.speak('Backwards scanning');
				}
				if ((now - setupLastBackStep) >= 2.0) {
					setupLastBackStep = now;
					setupFocusIndex = (setupFocusIndex - 1 + setupItems.length) % setupItems.length;
					applySetupFocus();
				}
			}
		}

		// Main menu backward scan every 2s after 3s hold
		if (gameState === 'menu' && !setupIsOpen() && (!settingsDiv || settingsDiv.style.display !== 'flex') && menuScanHeld) {
			var held = Math.max(0.0, now - menuHoldStart);
			if (held >= 3.0) {
				if (!menuBackScanAnnounced) {
					menuBackScanAnnounced = true;
					if (window.NarbeVoiceManager) window.NarbeVoiceManager.speak('Backwards scanning');
				}
				var stepInterval = (typeof NarbeScanManager !== 'undefined') ? (NarbeScanManager.getScanInterval() / 1000.0) : 2.0;
				if ((now - menuLastBackStep) >= stepInterval) {
					menuFocusIndex = (menuFocusIndex - 1 + mainMenuItems.length) % mainMenuItems.length;
					menuLastBackStep = now;
					applyMenuFocus();
				}
			}
		}
		// Pause menu backward scan
		if (gameState === 'paused' && (!settingsDiv || settingsDiv.style.display !== 'flex') && pauseScanHeld) {
			var heldP = Math.max(0.0, now - pauseHoldStart);
			if (heldP >= 3.0) {
				if (!pauseBackScanAnnounced) {
					pauseBackScanAnnounced = true;
					if (window.NarbeVoiceManager) window.NarbeVoiceManager.speak('Backwards scanning');
				}
				var stepIntervalP = (typeof NarbeScanManager !== 'undefined') ? (NarbeScanManager.getScanInterval() / 1000.0) : 2.0;
				if ((now - pauseLastBackStep) >= stepIntervalP) {
					pauseFocusIndex = (pauseFocusIndex - 1 + pauseMenuItems.length) % pauseMenuItems.length;
					pauseLastBackStep = now;
					applyPauseFocus();
				}
			}
		}
		// Settings backward scan (shared for menu or paused)
		if (settingsDiv && settingsDiv.style.display === 'flex' && settingsScanHeld) {
			var heldS = Math.max(0.0, now - settingsHoldStart);
			if (heldS >= 3.0) {
				if (!settingsBackScanAnnounced) {
					settingsBackScanAnnounced = true;
					if (window.NarbeVoiceManager) window.NarbeVoiceManager.speak('Backwards scanning');
				}
				var stepIntervalS = (typeof NarbeScanManager !== 'undefined') ? (NarbeScanManager.getScanInterval() / 1000.0) : 2.0;
				if ((now - settingsLastBackStep) >= stepIntervalS) {
					settingsFocusIndex = (settingsFocusIndex - 1 + settingsItems.length) % settingsItems.length;
					settingsLastBackStep = now;
					applySettingsFocus();
				}
			}
		}
		// Skip gameplay updates while in menu
		return;
	}

	var localPlayer = getLocalPlayer();
	if (localPlayer && !localPlayer.physics.simulationActive
			&& !pickingBall && !positioningBall && !rollingBall) {
		var sm = (typeof NarbeScanManager !== 'undefined') ? NarbeScanManager : null;
		var t = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		// Use slower oscillation for auto-scan to make timing easier
		var isAuto = (sm && sm.getSettings().autoScan);
		
		var T = isAuto ? 10.0 : 20.00; // Auto: Faster/Normal speed? User said "oscillate on its own". Manual uses hold. 
        // Wait, T=20 is slower. T=10 is faster.
        // Original code had T=20.00 "Doubled from 10.00".
        // Let's stick to T=20.00 for accessibility unless requested otherwise. 

		var omega = 2.0 * Math.PI / T;
		
		// Position oscillation
		// Manual: spaceHeld. Auto: always oscillates if not yet aiming.
		if (!aimingMode && (spaceHeld || isAuto)) {
			// For auto, we treat start time as 0 unless we want to sync phase. 
			// Simpler to just use t.
			var Apos = BALL_POSITION_MAX;
			var effectiveStart = spaceHeld ? spaceStartTime : 0.0;
			var effectivePhase = spaceHeld ? spacePhase : 0.0;
			
			var tauPos = Math.max(0.0, t - effectiveStart);
			var x = Apos * Math.sin(omega * tauPos + effectivePhase);
			localPlayer.physics.positionBall(x, false);
		}
		
		// Aim oscillation
		// Manual: aimHeld. Auto: oscillates if aimingMode is active and not yet charging to throw.
		if (aimingMode) {
			if (aimHeld || (isAuto && !charging)) {
				var Aaim = BALL_ANGLE_MAX;
				var effectiveStartA = aimHeld ? aimStartTime : 0.0;
				var effectivePhaseA = aimHeld ? aimPhase : 0.0;
				
				var tauAim = Math.max(0.0, t - effectiveStartA);
				currentAimAngle = Aaim * Math.sin(omega * tauAim + effectivePhaseA);
			}
			updateAimHelper(localPlayer);
		}

		// Aiming tone. It runs while the player is actively lining the shot up
		// -- sweeping the ball across the approach, or in aiming mode -- and
		// hands over to the charge ladder once they start winding up.
		updateAimCue(localPlayer);

		// Update charge bar while charging
		if (aimingMode && charging) {
			var now = t;
			var held = Math.max(0.0, now - chargeStartTime);
			var k = Math.min(1.0, held / CHARGE_TIME_MAX);
			var kVis = Math.pow(k, CHARGE_POWER_CURVE);
			if (chargeBar && chargeFill) {
				chargeBar.style.display = "block";
				chargeFill.style.width = Math.round(kVis * 100) + "%";
				positionChargeBarUnderScore();
			}
			// Same number the bar shows, so the ear and the eye agree.
			if (typeof BowlCues !== 'undefined') BowlCues.updateCharge(kVis);
		} else {
			if (chargeBar) chargeBar.style.display = "none";
		}
	}

	// Enter hold to open pause menu. While charging, holding Enter already
	// means "wind up the shot", so it must never also mean "pause".
	if (gameState === 'playing' && enterHeld && !charging) {
		var now2 = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		if ((now2 - enterHoldStart) >= PAUSE_HOLD_TIME) {
			enterHeld = false;
			openPauseMenu();
		}
	}

	// Animate ambient effects per theme. Only the mural and the lamps move --
	// the alley itself is fixed geometry that has to stay put under the physics.
	if (themeEnv && themeEnv.key) {
		var t = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		var k = themeEnv.key;
		var backMap = themeEnv.backdropMaterial && themeEnv.backdropMaterial.map;
		if (k === 'Ocean') {
			if (backMap) { backMap.offset.x = (t*0.01)%1; backMap.needsUpdate = true; }
			if (ambientLight) ambientLight.intensity = 0.5 + 0.05*Math.sin(t*0.6);
		}
		else if (k === 'Neon Night' || k === 'Cyber Grid' || k === 'Retro 80s') {
			if (ambientLight) ambientLight.intensity = ((k==='Retro 80s')?0.3:0.25) + 0.05*Math.sin(t*1.2);
			if (deckLight) deckLight.intensity = 1.15 + 0.12*Math.sin(t*1.6);
		}
		else if (k === 'Aurora') {
			if (backMap) { backMap.offset.x = (t*0.005)%1; backMap.needsUpdate = true; }
			if (dirLight) {
				var hue = (0.5 + 0.1*Math.sin(t*0.3)); // 0..1-ish
				var col = new THREE.Color().setHSL(hue, 0.6, 0.6);
				dirLight.color.copy(col);
			}
		}
		else if (k === 'Lava Lanes') {
			// Flicker the deck lamp like firelight.
			if (deckLight) deckLight.intensity = 0.85 + 0.2*Math.sin(t*5.0) + 0.06*Math.sin(t*13.0);
		}
		else if (k === 'Snow Day') {
			if (backMap) { backMap.offset.y = (t*-0.02)%1; backMap.needsUpdate = true; }
			if (ambientLight) ambientLight.intensity = 0.6 + 0.03*Math.sin(t*0.8);
		}
		else if (k === 'Cosmic Bowl') {
			if (backMap) { backMap.offset.x = (t*0.01)%1; backMap.needsUpdate = true; }
		}
	}

	if (players) {
		for (var i = 0; i < players.length; i++) {
			updateGame(players[i], dt);
		}
	}
}

function resizeViewport() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	// Rescale the scoreboard and reflow the hints for the new viewport.
	layoutUI();
}

function syncMeshToBody(mesh, body) {
	var transform = body.getCenterOfMassTransform();
	var p = transform.getOrigin();
	var q = transform.getRotation();
	mesh.position.set(p.x(), p.y(), p.z());
	mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
}

function syncView(player) {
	if (player.local) {
		player.ballMesh.visible = true;
		syncMeshToBody(player.ballMesh, player.physics.ballBody);
	} else {
		player.ballMesh.visible = false;
	}
	syncSheen(player.ballSheen, player.ballMesh,
			player.ballMesh.visible && overLane(player.ballMesh.position, BALL_RADIUS),
			BALL_RADIUS);

	for (var i = 0; i < player.physics.pinBodies.length; i++) {
		var pinBody = player.physics.pinBodies[i];
		var pinMesh = player.pinMeshes[i];
		// Every player keeps their own rack on the same lane, so only the one
		// taking their turn may be drawn or the racks would overlap.
		if (pinBody && player.local) {
			pinMesh.visible = true;
			syncMeshToBody(pinMesh, pinBody);
		} else {
			pinMesh.visible = false;
		}
		if (player.pinSheens) {
			syncSheen(player.pinSheens[i], pinMesh,
					pinMesh.visible && overLane(pinMesh.position, PIN_RADIUS_MAX),
					0.0);
		}
	}

	// Show/hide aim helper as needed
	if (player.local) {
		if (aimingMode && !player.physics.simulationActive) {
			ensureAimHelper(player);
			setAimHelperVisible(player, true);
		} else {
			setAimHelperVisible(player, false);
		}
	}
}

function render() {
	var dt = clock.getDelta();

	updateScene(dt);

	renderer.render(scene, camera);
}

function animate() {
	requestAnimationFrame(animate);

	render();
}

function updateTouchRay(clientX, clientY) {
	var rect = renderer.domElement.getBoundingClientRect();

	touchPoint.x = ((clientX - rect.left) / rect.width) * 2.0 - 1.0;
	touchPoint.y = -((clientY - rect.top) / rect.height) * 2.0 + 1.0;

	raycaster.setFromCamera(touchPoint, camera);
}

function intersectTouchPlane(ray) {
	if (Math.abs(ray.direction.y) > 1e-5) { // ray direction must not be parallel to base plane
		var t = (BASE_HEIGHT - ray.origin.y) / ray.direction.y;
		if (t >= 0.0) {
			dragPoint.copy(ray.direction).multiplyScalar(t).add(ray.origin);
			return true;
		}
	}
	return false;
}

// Helper for Unified Input (Keyboard Enter, Mouse Click, Touch Tap)
function handleGameInputDown() {
	var localPlayer = getLocalPlayer();
	if (!localPlayer) return;
	if (localPlayer.physics.simulationActive) return;
	if (pickingBall || positioningBall || rollingBall) return;

	var sm = (typeof NarbeScanManager !== 'undefined') ? NarbeScanManager : null;
	var isAuto = (sm && sm.getSettings().autoScan);

	// AUTO SCAN: Input confirms position -> go to Aim
	if (isAuto && !aimingMode && !charging) {
		aimingMode = true;
		playSfx('sound/select.wav', 0.6);
		// Reset aim angle to center
		currentAimAngle = 0.0;
		ensureAimHelper(localPlayer);
		updateAimHelper(localPlayer);
		return;
	}

	// AIMING: Input starts charging (if not already)
	if (aimingMode && !charging) {
		charging = true;
		chargeStartTime = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		if (typeof BowlCues !== 'undefined') { BowlCues.stopAim(); BowlCues.startCharge(); }
		if (chargeBar) {
			chargeBar.style.display = "block";
			chargeFill.style.width = "0%";
		}
	}
}

// Abandon a charge in progress without bowling. Used when the tremor filter
// rejects the press that started it, and whenever gameplay is interrupted.
function cancelCharge() {
	charging = false;
	if (typeof BowlCues !== 'undefined') BowlCues.stopCharge();
	if (chargeBar) chargeBar.style.display = "none";
}

function handleGameInputUp() {
	var localPlayer = getLocalPlayer();
	if (!localPlayer) return;
	if (localPlayer.physics.simulationActive) return;

	var sm = (typeof NarbeScanManager !== 'undefined') ? NarbeScanManager : null;
	var isAuto = (sm && sm.getSettings().autoScan);

	// MANUAL: Input release confirms position -> go to Aim
	if (!isAuto && !aimingMode && !charging) {
		aimingMode = true;
		currentAimAngle = 0.0;
		ensureAimHelper(localPlayer);
		updateAimHelper(localPlayer);
		return;
	}

	// SHARED: Release shot if charging
	if (aimingMode && charging) {
		var now = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		// Recalculate aim if manual hold was active
		if (aimHeld) {
			var targetT = (sm ? (sm.getScanInterval() / 200.0) : 20.0);
			var omega = 2.0 * Math.PI / targetT; 
			var tauAim = Math.max(0.0, now - aimStartTime);
			currentAimAngle = BALL_ANGLE_MAX * Math.sin(omega * tauAim + aimPhase);
		}

		var held = Math.max(0.0, now - chargeStartTime);
		var k = Math.min(1.0, held / CHARGE_TIME_MAX);
		var kPow = Math.pow(k, CHARGE_POWER_CURVE);
		var velocity = BALL_VELOCITY_MIN + (BALL_VELOCITY_MAX - BALL_VELOCITY_MIN) * kPow;
		
		localPlayer.physics.releaseBall(velocity, currentAimAngle);
		if (typeof BowlCues !== 'undefined') BowlCues.stopAll();
		playSfx('sound/rolling-ball.wav', ROLL_VOLUME);
		startRollingLoop();
		
		charging = false;
		aimingMode = false;
		aimHeld = false;
		setAimHelperVisible(localPlayer, false);
		if (chargeBar) chargeBar.style.display = "none";
	}
}

function onActionDown(clientX, clientY, time) {
	// If Auto Scan is ON, act as Enter input
	var sm = (typeof NarbeScanManager !== 'undefined') ? NarbeScanManager : null;
	if (sm && sm.getSettings().autoScan) {
		handleGameInputDown();
		return; // Skip drag logic
	}

	var localPlayer = getLocalPlayer();
	if (!localPlayer) {
		return;
	}

	if (localPlayer.physics.simulationActive) {
		return;
	}

	updateTouchRay(clientX, clientY);

	pickingBall = false;
	positioningBall = false;
	rollingBall = false;

	if (!intersectTouchPlane(raycaster.ray)) {
		return;
	}

	pickSphere.center.set(localPlayer.physics.releasePosition, BALL_HEIGHT, BALL_LINE);
	if (raycaster.ray.intersectsSphere(pickSphere)) {
		pickOffset = dragPoint.x - localPlayer.physics.releasePosition;
		pickPoint.copy(dragPoint);
		pickingBall = true;
		pickX = clientX;
		pickY = clientY;
		pickTime = time;
	}
}

function onActionMove(clientX, clientY, time) {
	var localPlayer = getLocalPlayer();
	if (!localPlayer) {
		return;
	}

	if (localPlayer.physics.simulationActive) {
		return;
	}

	updateTouchRay(clientX, clientY);

	if (!intersectTouchPlane(raycaster.ray)) {
		return;
	}

	if (pickingBall) {
		var distX = clientX - pickX;
		var distY = clientY - pickY;
		var grabDistanceSquared = distX * distX + distY * distY;
		if (grabDistanceSquared > ppi * ppi * GRAB_BALL_THRESHOLD_INCH_SQUARED) {
			if ((pickPoint.z - dragPoint.z) * GRAB_BALL_ROLL_POS_RATIO
					> Math.abs(pickPoint.x - dragPoint.x)) {
				rollingBall = true;
			} else {
				positioningBall = true;
			}
			pickingBall = false;
		}
	}

	if (positioningBall) {
		var position = dragPoint.x - pickOffset;
		localPlayer.physics.positionBall(position);
	}
}

function onActionUp(clientX, clientY, time) {
	// If Auto Scan is ON, act as Enter input
	var sm = (typeof NarbeScanManager !== 'undefined') ? NarbeScanManager : null;
	if (sm && sm.getSettings().autoScan) {
		handleGameInputUp();
		pickingBall = false; // Ensure no lingering drag state
		return;
	}

	var localPlayer = getLocalPlayer();
	if (!localPlayer) {
		return;
	}

	if (localPlayer.physics.simulationActive) {
		return;
	}

	if (rollingBall) {
		releaseVector.copy(dragPoint).sub(pickPoint);
		var velocity = (time > pickTime)
				? releaseVector.length() / (1e-3 * (time - pickTime))
				: BALL_VELOCITY_MAX;
		var angle = Math.atan2(-releaseVector.x, -releaseVector.z);
		localPlayer.physics.releaseBall(velocity, angle);
		// SFX: ball rolling
		playSfx('sound/rolling-ball.wav', ROLL_VOLUME);
		startRollingLoop();
	}

	pickingBall = false;
	positioningBall = false;
	rollingBall = false;
}

function onDocumentMouseDown(event) {
	event.preventDefault();

	onActionDown(event.clientX, event.clientY, event.timeStamp);
}

function onDocumentMouseMove(event) {
	event.preventDefault();

	onActionMove(event.clientX, event.clientY, event.timeStamp);
}

function onDocumentMouseUp(event) {
	event.preventDefault();

	onActionUp(event.clientX, event.clientY, event.timeStamp);
}

function onDocumentTouchStart(event) {
	var timeStamp = event.timeStamp;
	event.preventDefault();
	event = event.changedTouches[0];

	onActionDown(event.clientX, event.clientY, timeStamp);
}

function onDocumentTouchMove(event) {
	var timeStamp = event.timeStamp;
	event.preventDefault();
	event = event.changedTouches[0];

	onActionMove(event.clientX, event.clientY, timeStamp);
}

function onDocumentTouchEnd(event) {
	var timeStamp = event.timeStamp;
	event.preventDefault();
	event = event.changedTouches[0];

	onActionUp(event.clientX, event.clientY, timeStamp);
}

function onDocumentKeyDown(event) {
	// Menu/paused keyboard controls override gameplay
	if (gameState === 'menu' || gameState === 'paused') {
		if (setupIsOpen()) {
			if (event.code === 'Space') {
				event.preventDefault();
				if (!setupScanHeld) {
					setupScanHeld = true;
					setupHoldStart = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
					setupLastBackStep = setupHoldStart;
				}
			}
			return;
		}
		if (settingsDiv && settingsDiv.style.display === 'flex') {
			// Settings menu
			if (event.code === 'Space') {
				event.preventDefault();
				if (!settingsScanHeld) {
					settingsScanHeld = true;
					settingsHoldStart = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
					settingsLastBackStep = settingsHoldStart;
				}
				return;
			}
			// Remove Enter handling from keydown for settings
			return; // ignore other keys in settings
		} else {
			// Primary menu for this state (main or pause)
			if (event.code === 'Space') {
				event.preventDefault();
				if (gameState === 'menu') {
					if (!menuScanHeld) {
						menuScanHeld = true;
						menuHoldStart = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
						menuLastBackStep = menuHoldStart;
					}
				} else {
					if (!pauseScanHeld) {
						pauseScanHeld = true;
						pauseHoldStart = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
						pauseLastBackStep = pauseHoldStart;
					}
				}
				return;
			}
			// Remove Enter handling from keydown for menus
			return;
		}
	}
	if (event.code === "Space") {
		// Prevent page scroll on space
		event.preventDefault();

		var localPlayer = getLocalPlayer();
		if (!localPlayer) return;
		if (localPlayer.physics.simulationActive) return;
		if (pickingBall || positioningBall || rollingBall) return;
		if (event.repeat) return;

		if (aimingMode) {
			if (aimHeld) return;
			// Start aiming oscillation
			aimHoldDir = aimNextDir;
			aimNextDir = -aimNextDir;
			aimHeld = true;
			aimStartTime = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
			// Phase from current aim angle
			var Aaim = BALL_ANGLE_MAX;
			var rAim = Math.max(-1.0, Math.min(1.0, (Aaim !== 0.0) ? (currentAimAngle / Aaim) : 0.0));
			var basePhiAim = Math.asin(rAim);
			aimPhase = (aimHoldDir > 0) ? basePhiAim : (Math.PI - basePhiAim);
		} else {
			if (spaceHeld) return;
			// Start position oscillation
			spaceHoldDir = spaceNextDir;
			spaceNextDir = -spaceNextDir;
			spaceHeld = true;
			spaceStartTime = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
			// Phase from current position
			var p0 = localPlayer.physics.releasePosition;
			var A = BALL_POSITION_MAX;
			var r = Math.max(-1.0, Math.min(1.0, (A !== 0.0) ? (p0 / A) : 0.0));
			var basePhi = Math.asin(r);
			spacePhase = (spaceHoldDir > 0) ? basePhi : (Math.PI - basePhi);
		}
		return;
	}

	if (event.code === "Enter") {
		event.preventDefault();
		// Track Enter hold for pause when playing
		if (!event.repeat) {
			enterHeld = true;
			enterHoldStart = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		}
		var localPlayer = getLocalPlayer();
		if (!localPlayer) return;
		if (localPlayer.physics.simulationActive) return;
		if (pickingBall || positioningBall || rollingBall) return;

		// Use unified input handler
		handleGameInputDown();
		return;
	}
}

function onDocumentKeyUp(event) {
	if (gameState === 'menu' || gameState === 'paused') {
		if (setupIsOpen()) {
			if (event.code === 'Space') {
				event.preventDefault();
				var tS = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
				if (Math.max(0.0, tS - setupHoldStart) < 3.0) {
					setupFocusIndex = (setupFocusIndex + 1) % setupItems.length;
					applySetupFocus();
				}
				setupScanHeld = false;
				setupBackScanAnnounced = false;
				return;
			}
			if (event.code === 'Enter') {
				event.preventDefault();
				if (event.repeat) return;
				handleSetupEnter();
				return;
			}
			return;
		}
		if (settingsDiv && settingsDiv.style.display === 'flex') {
			if (event.code === 'Space') {
				event.preventDefault();
				// If released before 3s, move forward one selection; else stop scanning
				var t = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
				var held = Math.max(0.0, t - settingsHoldStart);
				if (held < 3.0) {
					settingsFocusIndex = (settingsFocusIndex + 1) % settingsItems.length;
					applySettingsFocus();
				}
				settingsScanHeld = false;
				settingsBackScanAnnounced = false;
				return;
			}
			if (event.code === 'Enter') {
				event.preventDefault();
				handleSettingsEnter();
				return;
			}
			return;
		} else {
			if (event.code === 'Space') {
				event.preventDefault();
				var t2 = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
				if (gameState === 'menu') {
					var held2 = Math.max(0.0, t2 - menuHoldStart);
					if (held2 < 3.0) {
						menuFocusIndex = (menuFocusIndex + 1) % mainMenuItems.length;
						applyMenuFocus();
					}
					menuScanHeld = false;
					menuBackScanAnnounced = false;
				} else {
					var heldP = Math.max(0.0, t2 - pauseHoldStart);
					if (heldP < 3.0) {
						pauseFocusIndex = (pauseFocusIndex + 1) % pauseMenuItems.length;
						applyPauseFocus();
					}
					pauseScanHeld = false;
					pauseBackScanAnnounced = false;
				}
				return;
			}
			if (event.code === 'Enter') {
				event.preventDefault();
				// Prevent key-repeat from immediately activating default choice when a menu just opened
				if (event.repeat) return;
				if (gameState === 'menu') handleMainMenuEnter(); else handlePauseMenuEnter();
				return;
			}
			return;
		}
	}
	if (event.code === "Space") {
		event.preventDefault();
		if (aimingMode) {
			if (!aimHeld) return;
			aimHeld = false;
		} else {
			if (!spaceHeld) return;
			spaceHeld = false;
		}
		return;
	}

	if (event.code === "Enter") {
		event.preventDefault();
		// Stop tracking enter hold
		enterHeld = false;
		var localPlayer = getLocalPlayer();
		if (!localPlayer) return;
		if (localPlayer.physics.simulationActive) return;

		// First Enter release: enter aiming mode
		if (!aimingMode && !charging) {
			aimingMode = true;
			currentAimAngle = 0.0; // start centered
			ensureAimHelper(localPlayer);
			updateAimHelper(localPlayer);
			return;
		}

		// If charging, release the shot
		if (aimingMode && charging) {
			var now = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
			// Ensure aim angle is current at release moment
			if (aimHeld) {
				var targetT = (typeof NarbeScanManager !== 'undefined') ? (NarbeScanManager.getScanInterval() / 200.0) : 20.0;
				var T = targetT; 
				var omega = 2.0 * Math.PI / T; var tauAim = Math.max(0.0, now - aimStartTime);
				currentAimAngle = BALL_ANGLE_MAX * Math.sin(omega * tauAim + aimPhase);
			}
			var held = Math.max(0.0, now - chargeStartTime);
			var k = Math.min(1.0, held / CHARGE_TIME_MAX);
			var kPow = Math.pow(k, CHARGE_POWER_CURVE); // non-linear power mapping
			var velocity = BALL_VELOCITY_MIN + (BALL_VELOCITY_MAX - BALL_VELOCITY_MIN) * kPow;

			// Fire!
			localPlayer.physics.releaseBall(velocity, currentAimAngle);
			if (typeof BowlCues !== 'undefined') BowlCues.stopAll();
			// SFX: ball rolling
			playSfx('sound/rolling-ball.wav', ROLL_VOLUME);
			startRollingLoop();

			// Cleanup aiming state
			charging = false;
			aimingMode = false;
			aimHeld = false;
			setAimHelperVisible(localPlayer, false);
			if (chargeBar) chargeBar.style.display = "none";
			return;
		}
	}
}

function handleMainMenuEnter() {
	if (menuFocusIndex < 0) return; // No selection yet
	var idx = menuFocusIndex % mainMenuItems.length;
	if (idx === 0) { // Play Game -> choose players, balls and theme first
		showSetup();
	} else if (idx === 1) { // Settings
		showSettings();
		applySettingsFocus();
	} else if (idx === 2) { // Exit Game
		exitGame();
	}
}

function handlePauseMenuEnter() {
	if (pauseFocusIndex < 0) return; // No selection yet
	var idx = pauseFocusIndex % pauseMenuItems.length;
	if (idx === 0) { // Continue Game
		resumeGame();
	} else if (idx === 1) { // Settings
		showSettings();
		// Reset settings scan for consistent top-to-bottom order
		settingsFocusIndex = 0; settingsScanHeld = false; applySettingsFocus();
	} else if (idx === 2) { // Main Menu
		hidePauseMenu();
		returnToMenu();
	} else if (idx === 3) { // Help
		speakText('I need help');
	}
}

function handleSettingsEnter() {
	var item = settingsItems[settingsFocusIndex % settingsItems.length];
	if (!item) return;
	if (typeof item.action === 'function') item.action();
}

// ---------- Menu and Settings UI ----------
function loadSettings() {
	try {
		var raw = localStorage.getItem('benny_settings');
		if (raw) {
			var obj = JSON.parse(raw);
			settings.tts = !!obj.tts;
			settings.music = !!obj.music;
			settings.sfx = !!obj.sfx;
			settings.voiceIndex = obj.voiceIndex | 0;
			if (typeof obj.themeIndex === 'number') {
				settings.themeIndex = obj.themeIndex | 0;
			}
			if (typeof obj.playerCount === 'number') {
				settings.playerCount = Math.max(1, Math.min(MAX_PLAYERS, obj.playerCount | 0));
			}
			if (Array.isArray(obj.ballStyles)) {
				for (var bi = 0; bi < MAX_PLAYERS; bi++) {
					if (typeof obj.ballStyles[bi] === 'number') {
						settings.ballStyles[bi] = obj.ballStyles[bi] | 0;
					}
				}
			} else if (typeof obj.ballStyleIndex === 'number') {
				// Carried over from when there was a single shared ball style.
				settings.ballStyles[0] = obj.ballStyleIndex | 0;
			}
			// Load aimer color if present (independent of themeIndex)
			if (typeof obj.aimerColorIndex === 'number') {
				settings.aimerColorIndex = obj.aimerColorIndex | 0;
			}
			if (typeof obj.chargeCues === 'boolean') {
				settings.chargeCues = obj.chargeCues;
			}
			if (typeof obj.aimCues === 'boolean') {
				settings.aimCues = obj.aimCues;
			}
		}
	} catch (e) {}
	
	// Sync with NarbeVoiceManager if available - ALWAYS use voice manager as source of truth
	try {
		if (window.NarbeVoiceManager) {
			// Wait a bit for voice manager to fully initialize
			setTimeout(function() {
				try {
					var vmSettings = window.NarbeVoiceManager.getSettings();
					// Always use voice manager's TTS setting as source of truth
					settings.tts = vmSettings.ttsEnabled;
					// Sync voice index if available
					if (typeof vmSettings.voiceIndex === 'number') {
						settings.voiceIndex = vmSettings.voiceIndex;
					}
					console.log('Bowling: Synced with voice manager - TTS:', settings.tts, 'Voice:', settings.voiceIndex);
					
					// Update localStorage to match voice manager
					try {
						localStorage.setItem('benny_settings', JSON.stringify(settings));
					} catch(e) {}
				} catch(e) {
					console.error('Bowling: Failed to sync with voice manager:', e);
				}
			}, 100);
		} else {
			console.warn('Bowling: Voice manager not available');
		}
	} catch(e) {
		console.error('Bowling: Error accessing voice manager:', e);
	}
}

function saveSettings() {
	try {
		localStorage.setItem('benny_settings', JSON.stringify(settings));
		
		// Sync TTS setting to voice manager without overriding its current voice
		if (window.NarbeVoiceManager) {
			try {
				// Pull current voice index from the manager to keep local settings in sync
				if (typeof window.NarbeVoiceManager.getSettings === 'function') {
					var vmSettings = window.NarbeVoiceManager.getSettings();
					if (vmSettings && typeof vmSettings.voiceIndex === 'number') {
						settings.voiceIndex = vmSettings.voiceIndex;
						try { localStorage.setItem('benny_settings', JSON.stringify(settings)); } catch(_){}
					}
				}
				// Only update TTS enabled flag; do not pass voiceIndex here to avoid unintended resets
				window.NarbeVoiceManager.updateSettings({ 
					ttsEnabled: settings.tts
				});
				console.log('Bowling: Updated voice manager - TTS:', settings.tts);
			} catch(e) {
				console.error('Bowling: Failed to update voice manager:', e);
			}
		}
	} catch (e) {}
}

function buildMenus() {
	loadSettings();
	buildThemes();
	buildBallSkins();

	// Main Menu
	mainMenuDiv = document.createElement('div');
	mainMenuDiv.style = "position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background: radial-gradient(ellipse at center, rgba(6,8,14,0.42) 0%, rgba(4,5,10,0.62) 60%, rgba(0,0,0,0.82) 100%); z-index:2000;";
	var box = document.createElement('div');
	box.style = "width:min(420px, 92vw); box-sizing:border-box; max-height:90vh; overflow:auto; padding:24px 28px; border:3px solid #00ff99; border-radius:12px; background:rgba(2,10,8,0.82); box-shadow:0 0 24px #00ff99; text-align:center;";
	var title = document.createElement('div');
	title.textContent = "Benny's Bowling";
	title.style = "font-family: 'Courier New', monospace; font-size: 34px; color:#00ffcc; letter-spacing:2px; text-shadow:0 0 8px #00ff99, 0 0 16px #00ffaa; margin-bottom:18px;";
	// Base button: black background with green text
	var btnStyle = "display:block; width:100%; padding:10px 14px; margin:10px 0; color:#00ff99; background:#000000; border:2px solid #00ff99; border-radius:8px; font-weight:800; letter-spacing:1px; cursor:pointer; box-shadow:0 0 10px #00ff99;";
	var playBtn = document.createElement('button');
	playBtn.textContent = 'PLAY GAME';
	playBtn.style = btnStyle;
	// Mouse and touch go through the same setup screen as the keyboard path
	// in handleMainMenuEnter -- they must not diverge.
	playBtn.onclick = () => showSetup();
	var settingsBtn = document.createElement('button');
	settingsBtn.textContent = 'SETTINGS';
	settingsBtn.style = btnStyle;
	settingsBtn.onclick = () => showSettings();
	var exitBtn = document.createElement('button');
	exitBtn.textContent = 'EXIT GAME';
	exitBtn.style = btnStyle;
	exitBtn.onclick = () => exitGame();
	box.appendChild(title);
	box.appendChild(playBtn);
	box.appendChild(settingsBtn);
	box.appendChild(exitBtn);
	mainMenuDiv.appendChild(box);
	document.body.appendChild(mainMenuDiv);

	// Settings Panel
	settingsDiv = document.createElement('div');
	settingsDiv.style = "position:fixed; inset:0; display:none; align-items:center; justify-content:center; background: radial-gradient(ellipse at center, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.78) 100%); z-index:2100;";
	var sbox = document.createElement('div');
	sbox.style = "width:min(480px, 94vw); box-sizing:border-box; max-height:88vh; overflow:auto; padding:20px 24px; border:3px solid #00ff99; border-radius:12px; background:rgba(2,10,8,0.88); color:#eaffff; font-family: 'Courier New', monospace; box-shadow:0 0 24px #00ff99;";
	sbox.innerHTML = "<div style='font-weight:800; font-size:22px; margin-bottom:8px; color:#00ffcc; text-shadow:0 0 8px #00ff99;'>Settings</div>";

	// `swatchUpdater` paints the little preview disc. It has to be supplied by
	// the caller because only the caller knows which player's ball the row is
	// showing.
	function makeRow(getLabel, getValue, onEnter, withSwatch, swatchUpdater, container) {
		var row = document.createElement('div');
		row.style = "display:flex; align-items:center; justify-content:space-between; margin:10px 0; padding:8px 10px; border:2px solid #00ff99; border-radius:8px; background: rgba(0, 20, 14, 0.35); box-shadow: 0 0 8px #00ff99 inset;";
		var left = document.createElement('div'); left.textContent = getLabel(); left.style = 'color:#00ffcc; font-weight:800; letter-spacing:1px;';
		var rightWrap = document.createElement('div'); rightWrap.style = 'display:flex; align-items:center; gap:10px;';
		var val = document.createElement('div'); val.textContent = getValue(); val.style = 'font-weight:700; color:#cffff6;';
		rightWrap.appendChild(val);
		var swatch = null;
		if (withSwatch) {
			swatch = document.createElement('div');
			swatch.style = 'width:26px; height:26px; border-radius:50%; border:2px solid #00ffcc; box-shadow:0 0 10px #00ffcc; background:#111111;';
			rightWrap.appendChild(swatch);
		}
		row.appendChild(left); row.appendChild(rightWrap);
		row._update = () => {
			val.textContent = getValue();
			if (swatch && swatchUpdater) swatchUpdater(swatch);
		};
		row.onclick = onEnter;
		(container || sbox).appendChild(row);
		// Paint it once now: without this the disc keeps its placeholder colour
		// until the row is first activated, so a red ball showed up green.
		row._update();
		return row;
	}

	function getEnglishVoices() {
		if (!('speechSynthesis' in window)) return [];
		var voices = window.speechSynthesis.getVoices() || [];
		var english = voices.filter(function(v){ return v && v.lang && v.lang.toLowerCase().startsWith('en'); });
		english.sort(function(a,b){
			if (a.default && !b.default) return -1;
			if (!a.default && b.default) return 1;
			var la = (a.lang||''); var lb = (b.lang||'');
			if (la < lb) return -1; if (la > lb) return 1;
			var na = (a.name||''); var nb = (b.name||'');
			if (na < nb) return -1; if (na > nb) return 1;
			return 0;
		});
		var limited = [];
		var seen = new Set();
		for (var i=0; i<english.length && limited.length<8; i++) {
			var nm = english[i].name || ('Voice '+i);
			if (!seen.has(nm)) { limited.push(english[i]); seen.add(nm); }
		}
		return limited;
	}

	function getVoiceName() {
		// Use unified voice manager for current voice and a short display name
		if (window.NarbeVoiceManager) {
			const current = window.NarbeVoiceManager.getCurrentVoice();
			return window.NarbeVoiceManager.getVoiceDisplayName(current);
		}
		return 'Default';
	}

	function cycleVoice() {
		if (!window.NarbeVoiceManager) return;
		window.NarbeVoiceManager.cycleVoice();
		var newVoice = window.NarbeVoiceManager.getCurrentVoice();
		var displayName = window.NarbeVoiceManager.getVoiceDisplayName(newVoice);
		// Persist the selected voice index so later saves do not revert it
		try {
			var vmSettings = window.NarbeVoiceManager.getSettings && window.NarbeVoiceManager.getSettings();
			if (vmSettings && typeof vmSettings.voiceIndex === 'number') {
				settings.voiceIndex = vmSettings.voiceIndex;
				try { localStorage.setItem('benny_settings', JSON.stringify(settings)); } catch(_){}
			}
		} catch(_){}
		speakText('Voice changed to ' + displayName);
	}

	function skinName(idx) {
		var skin = BALL_SKINS[Math.abs(idx) % BALL_SKINS.length];
		return (skin && skin.name) ? skin.name : '';
	}

	function updateBallSwatchFor(el, playerIndex) {
		var skin = BALL_SKINS[Math.abs(ballStyleFor(playerIndex)) % BALL_SKINS.length];
		if (skin && skin.preview) {
			el.style.background = `url(${skin.preview}) center/cover no-repeat, #003322`;
		}
	}

	function cycleBallStyleFor(playerIndex) {
		settings.ballStyles[playerIndex] = (ballStyleFor(playerIndex) + 1) % BALL_SKINS.length;
		saveSettings();
		applyBallStylesToPlayers();
		try { speakText(playerLabel(playerIndex) + ' ball ' + skinName(ballStyleFor(playerIndex))); } catch(e) {}
	}

	function cyclePlayerCount() {
		settings.playerCount = playerCount() % MAX_PLAYERS + 1;
		saveSettings();
		refreshPlayerRows();
		rebuildSetupItems();
		applySetupFocus();
		try {
			speakText(playerCount() === 1 ? 'One player' : playerCount() + ' players');
		} catch(e) {}
	}

	var ttsRow = makeRow(()=>'TTS', ()=> window.NarbeVoiceManager ? (window.NarbeVoiceManager.getSettings().ttsEnabled ? 'ON':'OFF') : 'OFF', ()=>{ 
		if (window.NarbeVoiceManager) {
			window.NarbeVoiceManager.toggleTTS(); 
			var newState = window.NarbeVoiceManager.getSettings().ttsEnabled;
			speakText(newState ? 'TTS enabled' : 'TTS disabled');
		}
		ttsRow._update(); 
	}, false);
	var musicRow = makeRow(()=>'Music', ()=> settings.music? 'ON':'OFF', ()=>{ settings.music=!settings.music; saveSettings(); applySettings(); musicRow._update(); }, false);
	var sfxRow = makeRow(()=>'Sound Effects', ()=> settings.sfx? 'ON':'OFF', ()=>{ settings.sfx=!settings.sfx; saveSettings(); SFX_ENABLED = !!settings.sfx; sfxRow._update(); }, false);
	var chargeCueRow = makeRow(()=>'Charge Sound', ()=> settings.chargeCues? 'ON':'OFF', ()=>{
		settings.chargeCues = !settings.chargeCues;
		saveSettings(); applySettings(); chargeCueRow._update();
		try { speakText('Charge sound ' + (settings.chargeCues ? 'on' : 'off')); } catch(e){}
	}, false);
	var aimCueRow = makeRow(()=>'Aim Sound', ()=> settings.aimCues? 'ON':'OFF', ()=>{
		settings.aimCues = !settings.aimCues;
		saveSettings(); applySettings(); aimCueRow._update();
		try { speakText('Aim sound ' + (settings.aimCues ? 'on' : 'off')); } catch(e){}
	}, false);
	var voiceRow = makeRow(()=>'Voice', ()=> getVoiceName(), ()=>{ cycleVoice(); voiceRow._update(); }, false);
	var autoScanRow = makeRow(()=>'Auto Scan', ()=> (window.NarbeScanManager && window.NarbeScanManager.getSettings().autoScan) ? 'ON' : 'OFF', ()=>{
		if (window.NarbeScanManager) {
			window.NarbeScanManager.toggleAutoScan();
			var newState = window.NarbeScanManager.getSettings().autoScan;
			speakText(newState ? 'Auto scan on' : 'Auto scan off');
			autoScanRow._update();
			scanSpeedRow._update();
		}
	}, false);
	var scanSpeedRow = makeRow(()=>'Scan Speed', ()=> (window.NarbeScanManager ? (window.NarbeScanManager.getScanInterval()/1000).toFixed(1)+'s' : '2.0s'), ()=>{
		if (window.NarbeScanManager) {
			window.NarbeScanManager.cycleScanSpeed();
			var newSpeed = (window.NarbeScanManager.getScanInterval()/1000).toFixed(1)+'s';
			speakText('Scan speed ' + newSpeed);
			scanSpeedRow._update();
		}
	}, false);
	// ---- Game setup screen -------------------------------------------
	// These are per-match choices, so they live here rather than in Settings:
	// it keeps the settings scan list short, and the theme can be seen changing
	// on the alley behind this panel.
	setupDiv = document.createElement('div');
	setupDiv.style = "position:fixed; inset:0; display:none; align-items:center; justify-content:center; background: radial-gradient(ellipse at center, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.52) 65%, rgba(0,0,0,0.76) 100%); z-index:2100;";
	var gbox = document.createElement('div');
	gbox.style = "width:min(460px, 94vw); box-sizing:border-box; max-height:88vh; overflow:auto; padding:20px 24px; border:3px solid #00ff99; border-radius:12px; background:rgba(2,10,8,0.88); color:#eaffff; font-family: 'Courier New', monospace; box-shadow:0 0 24px #00ff99;";
	gbox.innerHTML = "<div style='font-weight:800; font-size:22px; margin-bottom:8px; color:#00ffcc; text-shadow:0 0 8px #00ff99;'>New Game</div>";

	var playersRow = makeRow(()=>'Players', ()=> String(playerCount()), ()=>{
		cyclePlayerCount(); playersRow._update();
	}, false, null, gbox);

	// One ball row per player. Rows above the current player count are hidden
	// rather than rebuilt, so the scan order stays stable.
	var ballRows = [];
	for (var pi = 0; pi < MAX_PLAYERS; pi++) {
		(function(idx){
			var row = makeRow(
				()=> (playerCount() > 1 ? playerLabel(idx) + ' Ball' : 'Ball Color'),
				()=> skinName(ballStyleFor(idx)),
				()=>{ cycleBallStyleFor(idx); ballRows[idx]._update(); },
				true,
				function (el) { updateBallSwatchFor(el, idx); },
				gbox);
			row._playerIndex = idx;
			// Tint the label with the player's colour so the pairing is obvious.
			if (row.firstChild && row.firstChild.style) {
				row.firstChild.style.color = playerColor(idx).css;
			}
			ballRows.push(row);
		})(pi);
	}

	function getThemeName(){ return THEMES.length ? THEMES[Math.abs(settings.themeIndex)%THEMES.length].name : 'Default'; }
	function cycleTheme(){
		settings.themeIndex = (settings.themeIndex + 1) % THEMES.length;
		saveSettings();
		applyTheme(settings.themeIndex);
		try { var t = THEMES[Math.abs(settings.themeIndex)%THEMES.length]; if (t && t.name) speakText('Theme ' + t.name); } catch(e) {}
	}
	var themeRow = makeRow(()=>'Alley Theme', ()=> getThemeName(), ()=>{ cycleTheme(); themeRow._update(); }, false, null, gbox);

	var startBtn = document.createElement('button');
	startBtn.textContent = 'START GAME';
	startBtn.style = 'display:block; width:100%; margin:14px 0 6px 0; padding:12px 14px; color:#00ff99; background:#000000; border:2px solid #00ff99; border-radius:8px; font-weight:800; letter-spacing:1px; cursor:pointer; box-shadow:0 0 10px #00ff99;';
	startBtn.onclick = function(){ hideSetup(); startGame(); };
	gbox.appendChild(startBtn);

	var setupBackBtn = document.createElement('button');
	setupBackBtn.textContent = 'Back';
	setupBackBtn.style = 'display:block; width:100%; padding:10px 14px; color:#00ff99; background:#000000; border:2px solid #00ff99; border-radius:8px; font-weight:800; letter-spacing:1px; cursor:pointer; box-shadow:0 0 10px #00ff99;';
	setupBackBtn.onclick = function(){ hideSetup(); showMainMenu(); applyMenuFocus(); };
	gbox.appendChild(setupBackBtn);

	setupDiv.appendChild(gbox);
	document.body.appendChild(setupDiv);

	function refreshPlayerRows() {
		for (var i = 0; i < ballRows.length; i++) {
			var visible = (i < playerCount());
			ballRows[i].style.display = visible ? 'flex' : 'none';
			if (visible) {
				ballRows[i].firstChild.textContent = (playerCount() > 1)
						? playerLabel(i) + ' Ball' : 'Ball Color';
				ballRows[i]._update();
			}
		}
	}
	refreshPlayerRows();

	rebuildSetupItems = function () {
		var rows = [playersRow];
		for (var i = 0; i < playerCount(); i++) { rows.push(ballRows[i]); }
		rows.push(themeRow, startBtn, setupBackBtn);
		setupItems = rows.map(function (el) {
			return { el: el, action: function () { el.onclick(); } };
		});
		if (setupFocusIndex >= setupItems.length) setupFocusIndex = 0;
	};
	rebuildSetupItems();

	// Aimer Color row
	function getAimerColorName(){ var c=AIM_COLORS[Math.abs(settings.aimerColorIndex)%AIM_COLORS.length]; return c?c.name:'Green'; }
	function cycleAimerColor(){ settings.aimerColorIndex=(settings.aimerColorIndex+1)%AIM_COLORS.length; saveSettings(); applyAimerStyleToLocal(); try{ speakText && speakText('Aimer color ' + getAimerColorName()); }catch(e){} }
	var aimerRow = makeRow(()=>'Aimer Color', ()=> getAimerColorName(), ()=>{ cycleAimerColor(); aimerRow._update(); }, false);
	var closeRow = document.createElement('div');
	closeRow.style = 'display:flex; justify-content:flex-end; margin-top:12px;';
	var closeBtn = document.createElement('button'); closeBtn.textContent = 'Close'; closeBtn.style = 'padding:10px 14px; color:#00ff99; background:#000000; border:2px solid #00ff99; border-radius:8px; font-weight:800; letter-spacing:1px; cursor:pointer; box-shadow:0 0 10px #00ff99;';
	closeBtn.onclick = () => hideSettings();
	closeRow.appendChild(closeBtn);
	sbox.appendChild(closeRow);
	settingsDiv.appendChild(sbox);
	document.body.appendChild(settingsDiv);

	// Pause Menu
	pauseMenuDiv = document.createElement('div');
	pauseMenuDiv.style = "position:fixed; inset:0; display:none; align-items:center; justify-content:center; background: radial-gradient(ellipse at center, rgba(10,10,20,0.9) 0%, rgba(5,5,10,0.95) 60%, rgba(0,0,0,1) 100%); z-index:2050;";
	var pbox = document.createElement('div');
	pbox.style = "width:min(420px, 92vw); box-sizing:border-box; max-height:90vh; overflow:auto; padding:24px 28px; border:3px solid #00ff99; border-radius:12px; background:rgba(0,0,0,0.4); box-shadow:0 0 24px #00ff99; text-align:center;";
	var ptitle = document.createElement('div');
	ptitle.textContent = "Paused";
	ptitle.style = "font-family: 'Courier New', monospace; font-size: 30px; color:#00ffcc; letter-spacing:2px; text-shadow:0 0 8px #00ff99, 0 0 16px #00ffaa; margin-bottom:18px;";
	var pbtnStyle = "display:block; width:100%; padding:10px 14px; margin:10px 0; color:#00ff99; background:#000000; border:2px solid #00ff99; border-radius:8px; font-weight:800; letter-spacing:1px; cursor:pointer; box-shadow:0 0 10px #00ff99;";
	var continueBtn = document.createElement('button'); continueBtn.textContent = 'CONTINUE GAME'; continueBtn.style = pbtnStyle; continueBtn.onclick = ()=> resumeGame();
	var psettingsBtn = document.createElement('button'); psettingsBtn.textContent = 'SETTINGS'; psettingsBtn.style = pbtnStyle; psettingsBtn.onclick = ()=> { showSettings(); };
	var pmenuBtn = document.createElement('button'); pmenuBtn.textContent = 'MAIN MENU'; pmenuBtn.style = pbtnStyle; pmenuBtn.onclick = ()=> { hidePauseMenu(); returnToMenu(); };
	var phelpBtn = document.createElement('button'); phelpBtn.textContent = 'HELP'; phelpBtn.style = pbtnStyle; phelpBtn.onclick = ()=> { speakText('I need help'); };
	pbox.appendChild(ptitle); pbox.appendChild(continueBtn); pbox.appendChild(psettingsBtn); pbox.appendChild(pmenuBtn); pbox.appendChild(phelpBtn);
	pauseMenuDiv.appendChild(pbox);
	document.body.appendChild(pauseMenuDiv);

	// Game Over Screen
	gameOverDiv = document.createElement('div');
	gameOverDiv.style = "position:fixed; inset:0; display:none; align-items:center; justify-content:center; background: radial-gradient(ellipse at center, rgba(10,10,20,0.9) 0%, rgba(5,5,10,0.95) 60%, rgba(0,0,0,1) 100%); z-index:2100;";
	var gobox = document.createElement('div');
	gobox.style = "width:min(420px, 92vw); box-sizing:border-box; max-height:90vh; overflow:auto; padding:24px 28px; border:3px solid #00ff99; border-radius:12px; background:rgba(0,0,0,0.55); box-shadow:0 0 24px #00ff99; text-align:center;";
	var gotitle = document.createElement('div');
	gotitle.textContent = "Game Over";
	gotitle.style = "font-family: 'Courier New', monospace; font-size: 32px; color:#00ffcc; letter-spacing:2px; text-shadow:0 0 8px #00ff99, 0 0 16px #00ffaa; margin-bottom:12px;";
	var goscore = document.createElement('div');
	goscore.id = 'bb_game_over_score';
	goscore.style = "font-family: 'Courier New', monospace; font-size: 26px; color:#eaffff; margin-top:6px;";
	gobox.appendChild(gotitle); gobox.appendChild(goscore);
	gameOverDiv.appendChild(gobox);
	document.body.appendChild(gameOverDiv);

	if ('speechSynthesis' in window) {
		window.speechSynthesis.onvoiceschanged = ()=>{ if (voiceRow && typeof voiceRow._update === 'function') voiceRow._update(); };
	}

	applySettings();
	// Apply initial theme
	applyTheme(settings.themeIndex|0);

	// Collect items for keyboard scanning (same order as rendered)
	mainMenuItems = [playBtn, settingsBtn, exitBtn];
	menuFocusIndex = -1;
	// Don't apply focus initially - user must press spacebar first

	pauseMenuItems = [continueBtn, psettingsBtn, pmenuBtn, phelpBtn];
	pauseFocusIndex = -1;
	// Don't apply focus initially - user must press spacebar first

	// Built through a function because the per-player ball rows come and go
	// with the player count, and switch scanning must never land on a hidden row.
	rebuildSettingsItems = function () {
		var rows = [
			ttsRow, musicRow, sfxRow, chargeCueRow, aimCueRow, voiceRow,
			autoScanRow, scanSpeedRow, aimerRow, closeBtn
		];
		settingsItems = rows.map(function (el) {
			return { el: el, action: function () { el.onclick(); } };
		});
		if (settingsFocusIndex >= settingsItems.length) settingsFocusIndex = 0;
	};
	rebuildSettingsItems();
	settingsFocusIndex = 0;
}

function applyMenuFocus() {
	mainMenuItems.forEach((el, idx) => {
		var focused = (idx === menuFocusIndex && menuFocusIndex >= 0);
		el.style.outline = focused ? '3px solid #00ff99' : 'none';
		el.style.boxShadow = focused ? '0 0 16px #00ff99' : '0 0 10px #00ff99';
		el.style.background = focused ? '#00ff99' : '#000000';
		el.style.color = focused ? '#000000' : '#00ff99';
	});
	// TTS announce focused item only if something is selected
	if (menuFocusIndex >= 0) {
		try {
			var label = mainMenuItems[menuFocusIndex] && mainMenuItems[menuFocusIndex].textContent;
			if (label) speakText(label);
		} catch(e) {}
	}
}

function applyPauseFocus() {
	pauseMenuItems.forEach((el, idx) => {
		var focused = (idx === pauseFocusIndex && pauseFocusIndex >= 0);
		el.style.outline = focused ? '3px solid #00ff99' : 'none';
		el.style.boxShadow = focused ? '0 0 16px #00ff99' : '0 0 10px #00ff99';
		el.style.background = focused ? '#00ff99' : '#000000';
		el.style.color = focused ? '#000000' : '#00ff99';
	});
	// TTS announce focused item only if something is selected
	if (pauseFocusIndex >= 0) {
		try {
			var label = pauseMenuItems[pauseFocusIndex] && pauseMenuItems[pauseFocusIndex].textContent;
			if (label) speakText(label);
		} catch(e) {}
	}
}

function applySettingsFocus() {
	settingsItems.forEach((item, idx) => {
		var el = item.el;
		var focused = (idx === settingsFocusIndex);
		el.style.outline = focused ? '3px solid #00ff99' : 'none';
		el.style.boxShadow = focused ? '0 0 14px #00ff99' : 'none';
		el.style.background = focused ? '#00ff99' : 'rgba(0, 20, 14, 0.35)';
		// Tweak child text colors for contrast
		var left = el.firstChild; var right = el.lastChild; // as constructed
		if (left && left.style) left.style.color = focused ? '#000000' : '#00ffcc';
		if (right && right.firstChild && right.firstChild.style) right.firstChild.style.color = focused ? '#000000' : '#cffff6';
	});
	// TTS announce focused setting label
	try {
		var el = settingsItems[settingsFocusIndex] && settingsItems[settingsFocusIndex].el;
		var label = el && el.firstChild && el.firstChild.textContent;
		if (label) speakText(label);
	} catch(e) {}
}

function exitGame() {
	try {
        // Updated Exit Logic:
		// Try to message parent window to focus the back button
		if (window.parent && window.parent !== window) {
			window.parent.postMessage({ action: 'focusBackButton' }, '*');
		} else {
            // Navigate to Hub root if not in iframe
            location.href = '../../../index.html';
        }
	} catch(err) {
		// Fallback
		try {
			window.location.replace('../../../index.html');
		} catch(_) {
			// Last resort
			window.location.href = '../../..';
		}
	}
}

function showMainMenu() {
	hideSetup();
	if (mainMenuDiv) mainMenuDiv.style.display = 'flex';
	gameState = 'menu';
}
function hideMainMenu() { if (mainMenuDiv) mainMenuDiv.style.display = 'none'; }
function showSetup() {
	if (!setupDiv) return;
	setupDiv.style.display = 'flex';
	hideMainMenu();
	gameState = 'menu';
	setupFocusIndex = 0;
	setupScanHeld = false;
	setupBackScanAnnounced = false;
	setupHoldStart = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
	autoScanLastTime = setupHoldStart;
	rebuildSetupItems();
	applySetupFocus();
}

function hideSetup() { if (setupDiv) setupDiv.style.display = 'none'; }

function setupIsOpen() { return !!(setupDiv && setupDiv.style.display === 'flex'); }

function applySetupFocus() {
	setupItems.forEach(function (item, idx) {
		var el = item.el;
		var focused = (idx === setupFocusIndex);
		el.style.outline = focused ? '3px solid #00ff99' : 'none';
		el.style.boxShadow = focused ? '0 0 14px #00ff99' : 'none';
		var isButton = (el.tagName === 'BUTTON');
		el.style.background = focused ? '#00ff99' : (isButton ? '#000000' : 'rgba(0, 20, 14, 0.35)');
		if (isButton) {
			el.style.color = focused ? '#000000' : '#00ff99';
		} else {
			var left = el.firstChild, right = el.lastChild;
			if (left && left.style) {
				left.style.color = focused ? '#000000'
						: (typeof el._playerIndex === 'number' ? playerColor(el._playerIndex).css : '#00ffcc');
			}
			if (right && right.firstChild && right.firstChild.style) {
				right.firstChild.style.color = focused ? '#000000' : '#cffff6';
			}
		}
	});
	// Speak the focused row so the screen is usable without sight.
	try {
		var cur = setupItems[setupFocusIndex] && setupItems[setupFocusIndex].el;
		if (cur) {
			var label = (cur.tagName === 'BUTTON')
					? cur.textContent
					: ((cur.firstChild ? cur.firstChild.textContent : '') + ' ' +
					   (cur.lastChild && cur.lastChild.firstChild ? cur.lastChild.firstChild.textContent : ''));
			speakText(label);
		}
	} catch (e) {}
}

function handleSetupEnter() {
	var item = setupItems[setupFocusIndex % setupItems.length];
	if (!item) return;
	if (typeof item.action === 'function') item.action();
}

// Remembers which screen to restore when Settings closes.
var settingsReturnTo = null;

function showSettings() {
	if (settingsDiv) {
		if (mainMenuDiv && mainMenuDiv.style.display === 'flex') {
			settingsReturnTo = 'menu';
			mainMenuDiv.style.display = 'none';
		} else if (pauseMenuDiv && pauseMenuDiv.style.display === 'flex') {
			settingsReturnTo = 'pause';
			pauseMenuDiv.style.display = 'none';
		} else {
			settingsReturnTo = null;
		}
		settingsDiv.style.display = 'flex';
		// Ensure scanning starts at the top and proceeds one-by-one
		settingsFocusIndex = 0;
		settingsScanHeld = false;
		settingsHoldStart = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
		applySettingsFocus();
	}
}
function hideSettings() {
	if (settingsDiv) settingsDiv.style.display = 'none';
	// Put back whichever menu we covered up.
	if (settingsReturnTo === 'menu' && mainMenuDiv) {
		mainMenuDiv.style.display = 'flex';
		applyMenuFocus();
	} else if (settingsReturnTo === 'pause' && pauseMenuDiv) {
		pauseMenuDiv.style.display = 'flex';
		applyPauseFocus();
	}
	settingsReturnTo = null;
}
function showPauseMenu() { if (pauseMenuDiv) pauseMenuDiv.style.display = 'flex'; }
function hidePauseMenu() { if (pauseMenuDiv) pauseMenuDiv.style.display = 'none'; }

function openPauseMenu() {
	stopRollingLoop();
	// Cancel aim/charge UI if any
	var p = getLocalPlayer();
	if (p) {
		aimingMode = false; aimHeld = false; charging = false; setAimHelperVisible(p, false);
	}
	if (typeof BowlCues !== 'undefined') BowlCues.stopAll();
	if (chargeBar) chargeBar.style.display = 'none';
	gameState = 'paused';
	showPauseMenu();
	// reset scanning timers for pause menu
	pauseScanHeld = false; pauseFocusIndex = -1;
	// Reset auto scan timer to prevent immediate selection
	autoScanLastTime = (typeof clock.getElapsedTime === 'function') ? clock.getElapsedTime() : 0.0;
	updatePauseUIButtonVisibility();
	updateHelpTipsVisibility();
}

function resumeGame() {
	hideSettings();
	hidePauseMenu();
	gameState = 'playing';
	// reset scanning states
	pauseScanHeld = false; menuScanHeld = false; settingsScanHeld = false;
	updatePauseUIButtonVisibility();
	updateHelpTipsVisibility();
}

function applySettings() {
	// Music disabled for now (can be re-enabled with SafeAudio later)
	
	// Reflect SFX toggle for helper
	SFX_ENABLED = !!settings.sfx;
	if (window.SafeAudio) {
		window.SafeAudio.setEnabled(SFX_ENABLED);
	}
	if (!SFX_ENABLED) stopRollingLoop();
	// The cues are sound effects too, so the master SFX switch gates them.
	if (typeof BowlCues !== 'undefined') {
		BowlCues.setChargeEnabled(SFX_ENABLED && settings.chargeCues !== false);
		BowlCues.setAimEnabled(SFX_ENABLED && settings.aimCues !== false);
	}
}

function updatePauseUIButtonVisibility() {
	try {
		if (!pauseUIButton) return;
		pauseUIButton.style.display = (gameState === 'playing') ? 'block' : 'none';
	} catch(e){}
}

// Toggle help tips visibility based on current game state
function updateHelpTipsVisibility() {
	try {
		if (!helpTipsDiv) return;
		helpTipsDiv.style.display = (gameState === 'playing') ? 'block' : 'none';
		if (gameState === 'playing') layoutHelpTips();
	} catch(e){}
}

function startGame() {
	// Mark that user has interacted (required for audio autoplay)
	userHasInteracted = true;
	
	hideMainMenu(); hideSettings(); hideSetup();
	// Clean previous players
	if (players && players.length) {
		for (var i = players.length - 1; i >= 0; i--) {
			removePlayer(players[i].id);
		}
	}
	// Every player bowls the centre lane in turn, so they all share slot 0.
	// Only the player at the wheel is drawn (see syncView).
	var count = playerCount();
	for (var pi = 0; pi < count; pi++) {
		var p = addPlayer(pi, pi === 0, 0);
		p.index = pi;
		p.color = playerColor(pi);
		p.label = playerLabel(pi);
	}
	activePlayerIndex = 0;
	syncActivePlayerFlags();
	applyBallStylesToPlayers();
	// Reset UI elements
	aimingMode = false; aimHeld = false; charging = false;
	if (chargeBar) chargeBar.style.display = 'none';
	renderScoreboard();
	gameState = 'playing';
	if (count > 1) {
		try { speakText(playerLabel(0) + ', frame 1'); } catch(e) {}
	}
	// Start ambient bowling background (only if user has interacted)
	if (userHasInteracted) {
		ensureAmbient();
		if (ambientEl) { 
			ambientEl.play().catch(function(err){
				console.log('Ambient audio blocked:', err);
			}); 
		}
	}
	// Reset menu scanning states
	menuScanHeld = false; settingsScanHeld = false;
	menuFocusIndex = -1; settingsFocusIndex = 0;
	updatePauseUIButtonVisibility();
	updateHelpTipsVisibility();
	layoutUI();
}

function returnToMenu() {
	if (typeof BowlCues !== 'undefined') BowlCues.stopAll();
	stopRollingLoop();
	// Remove all players from scene
	if (players && players.length) {
		for (var i = players.length - 1; i >= 0; i--) {
			removePlayer(players[i].id);
		}
	}
	// Hide game over overlay if visible
	if (gameOverDiv) gameOverDiv.style.display = 'none';
	showMainMenu();
	updatePauseUIButtonVisibility();
	updateHelpTipsVisibility();
	// Stop ambient loop
	stopAmbient();
}

function showGameOver() {
	try {
		if (!gameOverDiv) returnToMenu();
		resetShotState();

		var list = (players || []).slice();
		var best = -1;
		for (var i = 0; i < list.length; i++) {
			var sc = list[i].scores.totalScore || 0;
			if (sc > best) best = sc;
		}
		var winners = list.filter(function (pl) { return (pl.scores.totalScore || 0) === best; });

		var label = document.getElementById('bb_game_over_score');
		if (label) {
			if (list.length <= 1) {
				label.textContent = 'Final Score: ' + best;
			} else {
				var rows = list.map(function (pl) {
					var sc = pl.scores.totalScore || 0;
					var win = (sc === best);
					return '<div style="display:flex; justify-content:space-between; gap:16px; align-items:center;'
						+ ' padding:3px 0; color:' + pl.color.css + '; font-weight:' + (win ? '900' : '700') + ';">'
						+ '<span>' + pl.label + (win ? ' ★' : '') + '</span><span>' + sc + '</span></div>';
				}).join('');
				label.innerHTML = rows;
			}
		}

		// Speak the result before the overlay times out.
		if (list.length <= 1) {
			speakText('Game over. Final score: ' + best);
		} else if (winners.length === 1) {
			speakText('Game over. ' + winners[0].label + ' wins with ' + best + '.');
		} else {
			speakText('Game over. It is a tie at ' + best + '.');
		}

		// End gameplay state
		gameState = 'menu';
		if (pauseUIButton) pauseUIButton.style.display = 'none';
		if (gameOverDiv) gameOverDiv.style.display = 'flex';
		updateHelpTipsVisibility();
		// Return to main menu after a short delay
		setTimeout(function(){ returnToMenu(); }, 7500);
	} catch(e) { returnToMenu(); }
}

// ------- Strike celebration overlay -------
function showStrikeCelebration() {
	try {
		if (!celebrationDiv) return;
		// Set message and reset styles for pop-in
		celebrationDiv.textContent = 'STRIKE!';
		celebrationDiv.style.opacity = '0';
		celebrationDiv.style.transform = 'translate(-50%, -50%) scale(0.8)';

		// Kick in on next frame for transition
		requestAnimationFrame(function(){
			celebrationDiv.style.opacity = '1';
			celebrationDiv.style.transform = 'translate(-50%, -50%) scale(1)';
		});

		// Clear previous timers
		if (celebrationHideTimer) { try { clearTimeout(celebrationHideTimer); } catch(e){} }
		// Hide after a short moment with a slight lift
		celebrationHideTimer = setTimeout(function(){
			celebrationDiv.style.opacity = '0';
			celebrationDiv.style.transform = 'translate(-50%, -58%) scale(1.08)';
		}, 1200);
	} catch(e) {}
}

function applyBallStyleToLocal() {
	var p = getLocalPlayer(); if (!p) return;
	applyBallStyle(p.ballMesh, ballStyleFor(p.index));
	// Refresh aimer style as well
	applyAimerStyleToLocal();
}

function applyBallStyle(ballMesh, styleIdx) {
	if (!BALL_SKINS || !BALL_SKINS.length) return;
	var skin = BALL_SKINS[Math.abs(styleIdx|0) % BALL_SKINS.length];
	if (skin && typeof skin.apply === 'function') {
		try { skin.apply(ballMesh); } catch(e) {}
	}
	// A bowling ball is polished, whatever it's painted with.
	ballMesh.traverse(function(obj){
		if (!obj.isMesh || !obj.material) return;
		var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
		mats.forEach(function(m){
			if (!m) return;
			if ('roughness' in m) m.roughness = Math.min(m.roughness, 0.18);
			if ('envMapIntensity' in m) m.envMapIntensity = 0.8;
			m.needsUpdate = true;
		});
	});
	applyEnvMapToActors();
	// Tint the lane sheen with whatever ball the player picked.
	if (players) {
		players.forEach(function(p){ if (p.ballMesh === ballMesh) refreshBallSheen(p); });
	}
}

// The sheen is built before a skin is chosen, so re-tint it on every change.
// A dark ball throws a dark streak; a white one throws a bright streak.
function refreshBallSheen(player) {
	if (!player || !player.ballSheen) return;
	var src = null;
	player.ballMesh.traverse(function(o){
		if (!src && o.isMesh && o.material) {
			src = Array.isArray(o.material) ? o.material[0] : o.material;
		}
	});
	if (!src || !src.color) return;
	// Lift the tint towards white so even a black ball leaves a visible sheen.
	player.ballSheen.material.color.copy(src.color).lerp(new THREE.Color(0xffffff), 0.55);
	player.ballSheen.material.needsUpdate = true;
}

function ensureAimHelper(player) {
	if (player.aimHelper) { return; }
	var group = new THREE.Group();
	// Shorter length so it doesn’t reach pins
	var totalLen = Math.max(3.0, LANE_LENGTH * 0.7);
	var colHex = (AIM_COLORS[Math.abs(settings.aimerColorIndex)%AIM_COLORS.length]||AIM_COLORS[2]).hex;
	var dashSize = 0.35, gapSize = 0.22, lineRadius = 0.045;
	var segCount = Math.max(1, Math.floor(totalLen / (dashSize + gapSize)));
	var segments = [];
	for (var i = 0; i < segCount; i++) {
		var cylGeo = new THREE.CylinderGeometry(lineRadius, lineRadius, dashSize, 14, 1, true);
		var cylMat = new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: 0.7, depthTest: true });
		var seg = new THREE.Mesh(cylGeo, cylMat);
		seg.rotation.x = Math.PI / 2; // align along Z
		var z0 = - (i * (dashSize + gapSize) + dashSize * 0.5);
		seg.position.set(0, 0, z0);
		segments.push(seg);
		group.add(seg);
	}
	// Place below the ball so it renders under it
	var yOffset = -Math.max(0.0, (typeof BALL_RADIUS === 'number' ? BALL_RADIUS : 0.12) * 0.9);
	group.userData = { segments: segments, totalLen: totalLen, dashSize: dashSize, gapSize: gapSize, lineRadius: lineRadius, yOffset: yOffset };
	player.ballMesh.parent.add(group);
	player.aimHelper = group;
	setAimHelperVisible(player, false);
}

// Where the ball would be by the time it reaches a given point down the lane,
// assuming a straight roll. Deliberately unclamped: a line that runs off the
// side of the lane needs to report a big number so the cue can say "gutter"
// rather than quietly pretending the ball came back.
function predictedBallX(player, z) {
	var angle = aimingMode ? currentAimAngle : 0.0;
	return player.physics.releasePosition - (BALL_LINE - z) * Math.tan(angle);
}

// What the aiming cue should report: how far the current line is from actually
// striking a pin, and whether it strikes one at all.
//
// This has to follow the pins that are still standing rather than a fixed
// point. On a spare with one pin out on the right, aiming down the middle is a
// miss and aiming right is the shot, so a cue anchored to the head pin's spot
// would say exactly the wrong thing.
function aimCueTarget(player) {
	var hitRadius = BALL_RADIUS + PIN_RADIUS_MAX;
	var nearestMiss = null;   // signed distance to the closest standing pin
	var firstHit = null;      // signed distance at the first pin actually struck
	var firstHitZ = -Infinity;
	for (var i = 0; i < PIN_COUNT; i++) {
		if (!player.physics.pinBodies[i]) continue;   // already knocked down
		var pin = player.pinMeshes[i].position;
		var x = predictedBallX(player, pin.z);
		var miss = x - pin.x;
		if (nearestMiss === null || Math.abs(miss) < Math.abs(nearestMiss)) {
			nearestMiss = miss;
		}
		// Once the ball's centre passes the edge of the lane bed it has
		// dropped into the gutter and cannot reach anything.
		var onLane = Math.abs(x) <= LANE_HALF_WIDTH;
		// The ball reaches the nearest pin first, so among the pins it would
		// touch, the one with the largest z is the one actually struck.
		if (onLane && Math.abs(miss) <= hitRadius && pin.z > firstHitZ) {
			firstHitZ = pin.z;
			firstHit = miss;
		}
	}
	if (nearestMiss === null) { return { error: 0, onTarget: false }; }
	return {
		error: (firstHit !== null) ? firstHit : nearestMiss,
		onTarget: (firstHit !== null)
	};
}

function updateAimCue(player) {
	if (typeof BowlCues === 'undefined') return;
	var active = player && !player.physics.simulationActive && !charging
			&& (aimingMode || spaceHeld);
	if (!active) { BowlCues.stopAim(); return; }
	var target = aimCueTarget(player);
	BowlCues.updateAim(target.error, AIM_CUE_RANGE, target.onTarget);
}

function setAimHelperVisible(player, visible) {
	if (player && player.aimHelper) {
		player.aimHelper.visible = !!visible;
	}
}

function updateAimHelper(player) {
	if (!player || !player.aimHelper) return;
	var ballPos = player.ballMesh.position;
	var yOff = (player.aimHelper.userData && typeof player.aimHelper.userData.yOffset === 'number') ? player.aimHelper.userData.yOffset : -0.1;
	player.aimHelper.position.set(ballPos.x, ballPos.y + yOff, ballPos.z);
	player.aimHelper.rotation.set(0, currentAimAngle, 0);
}

function applyAimerStyleToLocal() {
	var p = getLocalPlayer(); 
	if (!p || !p.aimHelper) return;
	
	// Get the new color from settings
	var colHex = (AIM_COLORS[Math.abs(settings.aimerColorIndex)%AIM_COLORS.length]||AIM_COLORS[2]).hex;
	
	// Update all the aim helper segments with the new color
	if (p.aimHelper.userData && p.aimHelper.userData.segments) {
		p.aimHelper.userData.segments.forEach(function(seg) {
			if (seg && seg.material) {
				seg.material.color.setHex(colHex);
				seg.material.needsUpdate = true;
			}
		});
	}
}

function renderScoreboard() {
	var active = getLocalPlayer();
	if (!active) { return; }
	var scores = active.scores;
	// Inline styles for a compact bowling scoreboard
	var sbStyle = "display:flex; gap:6px; align-items:flex-start; background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:10px; backdrop-filter: blur(2px); color:#fff; font-family: system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,sans-serif;";
	var frameStyle = "display:flex; flex-direction:column; border:2px solid rgba(255,255,255,0.6); border-radius:6px; overflow:hidden; background:rgba(0,0,0,0.25);";
	var shotsStyle = "display:flex; gap:2px; padding:2px; justify-content:center; align-items:center; background:rgba(255,255,255,0.08);";
	var boxStyle = "min-width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-weight:600;";
	var totalStyle = "padding:2px 4px; text-align:center; min-height:18px; font-size:12px;";

	function box(content) {
		var txt = (content && content !== " ") ? content : "&nbsp;";
		return '<div style="' + boxStyle + '">' + txt + '</div>';
	}

	function total(val) {
		var txt = (val && val > 0) ? val : "&nbsp;";
		return '<div style="' + totalStyle + '">' + txt + '</div>';
	}

	// With more than one player the sheet on screen belongs to whoever is up,
	// so it has to say so -- and the others still need their running totals
	// visible or nobody can tell who is winning.
	var header = '';
	if (players && players.length > 1) {
		var chips = '';
		for (var pn = 0; pn < players.length; pn++) {
			var pl = players[pn];
			var isActive = (pn === activePlayerIndex);
			chips += '<div style="display:flex; align-items:center; gap:5px; padding:2px 8px; border-radius:999px;'
				+ ' border:2px solid ' + (isActive ? pl.color.css : 'rgba(255,255,255,0.25)') + ';'
				+ ' background:' + (isActive ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.3)') + ';'
				+ ' opacity:' + (isActive ? '1' : '0.65') + ';">'
				+ '<span style="width:10px; height:10px; border-radius:50%; background:' + pl.color.css + '; display:inline-block;"></span>'
				+ '<span style="font-weight:800; font-size:11px;">P' + (pn + 1) + '</span>'
				+ '<span style="font-weight:700; font-size:12px;">' + (pl.scores.totalScore || 0) + '</span>'
				+ (pl.scores.gameOver ? '<span style="font-size:10px; opacity:0.7;">done</span>' : '')
				+ '</div>';
		}
		header = '<div style="display:flex; gap:6px; justify-content:center; align-items:center; margin-bottom:5px;'
			+ ' font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#fff;">'
			+ '<span style="font-weight:800; font-size:11px; letter-spacing:1px; color:' + active.color.css + ';">'
			+ active.label.toUpperCase() + '’S TURN</span>'
			+ chips + '</div>';
	}

	var html = '<div style="display:flex; flex-direction:column; align-items:center;">' + header
			+ '<div style="' + sbStyle + '">';

	// Frames 1..9 (index 0..8)
	for (var i = 0; i < FRAME_COUNT - 1; i++) {
		var c1 = scores.throwResultChars[i][0];
		var c2 = scores.throwResultChars[i][1];
		var t = scores.frameResults[i];
		html += '<div style="' + frameStyle + '">';
		html += '<div style="' + shotsStyle + '">';
		html += box(c1) + box(c2);
		html += '</div>';
		html += total(t);
		html += '</div>';
	}

	// Frame 10 (index 9) has three boxes
	var i10 = FRAME_COUNT - 1;
	var c10a = scores.throwResultChars[i10][0];
	var c10b = scores.throwResultChars[i10][1];
	var c10c = scores.throwResultChars[i10][2];
	var t10 = scores.frameResults[i10];
	html += '<div style="' + frameStyle + '">';
	html += '<div style="' + shotsStyle + '">';
	html += box(c10a) + box(c10b) + box(c10c);
	html += '</div>';
	html += total(t10);
	html += '</div>';

	// Overall total at the end
	var totalPanel = '<div style="margin-left:8px; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:4px 8px; border:2px solid rgba(255,255,255,0.6); border-radius:6px; background:rgba(0,0,0,0.25);">'
		+ '<div style="font-size:11px; opacity:0.85;">TOTAL</div>'
		+ '<div style="font-weight:700; font-size:18px; line-height:20px;">' + (scores.totalScore || 0) + '</div>'
		+ '</div>';
	html += totalPanel;

	html += '</div></div>';

	scoresDiv.innerHTML = html;
	// Content width changes as frames fill in, so rescale before repositioning.
	layoutScoreboard();
	positionChargeBarUnderScore();
}

// Helper: position charge bar right under the scoreboard at the top
// The scoreboard is a fixed ten-frame grid roughly 660px wide. Rather than
// reflow it -- a bowling scoresheet only reads correctly as one row -- measure
// it and scale it down to whatever the viewport can spare. On a phone in
// portrait that lands around 0.55, which keeps every frame on screen and
// legible; on a desktop the scale stays at 1 and nothing changes.
const SCORE_MIN_SCALE = 0.42;
const SCORE_SIDE_MARGIN = 8;

function layoutScoreboard() {
	try {
		if (!scoresDiv || !scoresDiv.firstChild) return;
		var inner = scoresDiv.firstChild;
		// offsetWidth is the unscaled layout width, so measuring it is safe even
		// though we are about to scale the element it lives in.
		var natural = inner.offsetWidth;
		if (!natural) return;
		var available = Math.max(80, window.innerWidth - 2 * SCORE_SIDE_MARGIN);
		var scale = Math.min(1, available / natural);
		if (scale < SCORE_MIN_SCALE) scale = SCORE_MIN_SCALE;
		scoresDiv.style.transform = 'translateX(-50%) scale(' + scale.toFixed(4) + ')';
		scoresDiv._scale = scale;
	} catch (e) {}
}

// Narrow screens can't fit the two-line keyboard hint beside the Pause button,
// so drop to a single short line and lift it above the button.
function layoutHelpTips() {
	try {
		if (!helpTipsDiv) return;
		// Short landscape phones need the compact hint just as much as narrow
		// portrait ones -- there the hint is stealing vertical space, not width.
		var narrow = (window.innerWidth < 700 || window.innerHeight < 500);
		// The ball sits low and centred, so a centred hint box lands right on
		// top of it once the viewport is short. Dock the compact hint into the
		// bottom-right corner instead -- clear of the ball and of the Pause
		// button in the opposite corner.
		if (narrow) {
			helpTipsDiv.style.left = 'auto';
			helpTipsDiv.style.right = 'calc(8px + env(safe-area-inset-right, 0px))';
			helpTipsDiv.style.transform = 'none';
			helpTipsDiv.style.bottom = 'calc(8px + env(safe-area-inset-bottom, 0px))';
			helpTipsDiv.style.maxWidth = 'min(58vw, 320px)';
			helpTipsDiv.style.fontSize = '10px';
			helpTipsDiv.style.textAlign = 'right';
		} else {
			helpTipsDiv.style.left = '50%';
			helpTipsDiv.style.right = '';
			helpTipsDiv.style.transform = 'translateX(-50%)';
			helpTipsDiv.style.bottom = '12px';
			helpTipsDiv.style.maxWidth = '';
			helpTipsDiv.style.fontSize = '';
			helpTipsDiv.style.textAlign = 'center';
		}
		var full = helpTipsDiv.querySelectorAll('[data-tips="full"]');
		for (var i = 0; i < full.length; i++) {
			full[i].style.display = narrow ? 'none' : '';
		}
		var brief = helpTipsDiv.querySelectorAll('[data-tips="brief"]');
		for (var j = 0; j < brief.length; j++) {
			brief[j].style.display = narrow ? '' : 'none';
		}
	} catch (e) {}
}

function layoutUI() {
	layoutScoreboard();
	layoutHelpTips();
	positionChargeBarUnderScore();
}

function positionChargeBarUnderScore() {
	try {
		if (!chargeBar || !scoresDiv) return;
		// getBoundingClientRect already accounts for the scale we applied, so
		// the bar tracks the scoreboard at any size.
		var rect = scoresDiv.getBoundingClientRect();
		var y = Math.max(0, Math.round(rect.bottom + 8));
		chargeBar.style.top = y + 'px';
		chargeBar.style.left = '50%';
		chargeBar.style.transform = 'translateX(-50%)';
		// Ensure bottom is not set anymore
		chargeBar.style.bottom = '';
	} catch(e) {}
}

// ---------- Text-to-Speech (TTS) helpers ----------
function speakText(text) {
	if (!window.NarbeVoiceManager) return;
	if (!window.NarbeVoiceManager.getSettings().ttsEnabled) return;
	window.NarbeVoiceManager.speak(text);
}

function getLatestThrowInfo(scores) {
	for (var i = FRAME_COUNT - 1; i >= 0; i--) {
		var maxJ = (i === FRAME_COUNT - 1) ? 2 : 1;
		for (var j = maxJ; j >= 0; j--) {
			var c = scores.throwResultChars[i][j];
			if (c && c !== ' ') {
				return { frame: i, shot: j, ch: c };
			}
		}
	}
	return null;
}

function describeThrowChar(ch) {
	if (ch === 'X') return 'strike';
	if (ch === '/') return 'spare';
	if (ch === '-') return 'gutter';
	var n = parseInt(ch, 10);
	if (!isNaN(n)) return n + (n === 1 ? ' pin' : ' pins');
	return 'roll';
}

function speakLatestRollOutcome(scores) {
	var info = getLatestThrowInfo(scores);
	if (!info) return;
	var frameNum = info.frame + 1;
	var desc = describeThrowChar(info.ch);
	// For frame 10, include shot number verbally when useful
	if (info.frame === FRAME_COUNT - 1) {
		speakText('Frame ' + frameNum + ', ' + (info.shot + 1) + ' ' + (info.shot === 0 ? 'ball' : 'ball') + ': ' + desc);
	} else {
		speakText('Frame ' + frameNum + ': ' + desc);
	}
}

init();
