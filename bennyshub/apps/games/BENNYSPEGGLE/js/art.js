/**
 * Benny's P3GL — art: geometry, materials, the symbol atlas, reflections.
 *
 * Everything is procedural. Pegs are glossy lathed "buttons" lit by real
 * lights plus a soft environment map built from the current world's sky, so
 * they pick up that world's colours. Lit pegs glow through a per-instance
 * attribute (aGlow) patched into the standard material, which the bloom pass
 * turns into light. Symbols come from one canvas atlas drawn by js/icons.js.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const C = P3.catalog;

  let THREE = null;
  const geoCache = {};
  let atlas = null;

  /* ── Geometry ─────────────────────────────────────────────────────────── */

  /** A peg: a domed button of radius 1, top facing +z. */
  function pegGeometry() {
    if (geoCache.peg) return geoCache.peg;
    const pts = [];
    const H = 0.62;
    pts.push(new THREE.Vector2(0.0001, H));
    for (let i = 1; i <= 10; i++) { const a = i / 10 * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * 0.74, H - (1 - Math.cos(a)) * 0.2)); }
    for (let i = 1; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(0.74 + Math.sin(a) * 0.26, (H - 0.2) - (1 - Math.cos(a)) * 0.24)); }
    pts.push(new THREE.Vector2(1.0, 0.06));
    pts.push(new THREE.Vector2(0.9, 0.0));
    const g = new THREE.LatheGeometry(pts.reverse(), 40);   // lathe profiles run bottom → top
    g.rotateX(Math.PI / 2);
    geoCache.peg = g;
    return g;
  }

  /** A faceted gem (radius 1). */
  function gemGeometry() {
    if (geoCache.gem) return geoCache.gem;
    const pts = [new THREE.Vector2(0.0001, 0.85), new THREE.Vector2(0.55, 0.7), new THREE.Vector2(1.0, 0.35), new THREE.Vector2(0.75, 0.0)];
    const g = new THREE.LatheGeometry(pts.reverse(), 8);
    g.rotateX(Math.PI / 2);
    g.rotateZ(Math.PI / 8);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    geoCache.gem = ng;
    return ng;
  }

  /** A paper lantern (radius 1): ribbed body with caps. */
  function lanternGeometry() {
    if (geoCache.lantern) return geoCache.lantern;
    const pts = [];
    pts.push(new THREE.Vector2(0.0001, 0.9));
    pts.push(new THREE.Vector2(0.38, 0.9));
    for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; pts.push(new THREE.Vector2(0.4 + Math.sin(a) * 0.58, 0.82 - i / 12 * 0.72)); }
    pts.push(new THREE.Vector2(0.38, 0.06)); pts.push(new THREE.Vector2(0.0001, 0.04));
    const g = new THREE.LatheGeometry(pts.reverse(), 24);
    g.rotateX(Math.PI / 2);
    geoCache.lantern = g;
    return g;
  }

  /** A spiked star prism (radius 1). */
  function spikeGeometry() {
    if (geoCache.spike) return geoCache.spike;
    const s = new THREE.Shape();
    const n = 9;
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? 0.58 : 1.0, a = -Math.PI / 2 + i * Math.PI / n;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.06, bevelSegments: 2 });
    geoCache.spike = g;
    return g;
  }

  /** A bumper: a fat ring around a dome (radius 1). */
  function bumperGeometry() {
    if (geoCache.bumper) return geoCache.bumper;
    const pts = [new THREE.Vector2(0.0001, 0.75), new THREE.Vector2(0.4, 0.72), new THREE.Vector2(0.5, 0.6), new THREE.Vector2(0.55, 0.45),
      new THREE.Vector2(0.72, 0.5), new THREE.Vector2(0.92, 0.42), new THREE.Vector2(1.0, 0.25), new THREE.Vector2(0.95, 0.06), new THREE.Vector2(0.85, 0)];
    const g = new THREE.LatheGeometry(pts.reverse(), 36);
    g.rotateX(Math.PI / 2);
    geoCache.bumper = g;
    return g;
  }

  /** A torus ring for portals (radius 1). */
  function ringGeometry() {
    if (geoCache.ring) return geoCache.ring;
    geoCache.ring = new THREE.TorusGeometry(0.86, 0.16, 12, 40);
    return geoCache.ring;
  }

  /** A rounded brick w × h (cached per size). */
  function brickGeometry(w, h) {
    const key = 'brick:' + Math.round(w) + 'x' + Math.round(h);
    if (geoCache[key]) return geoCache[key];
    const r = Math.min(7, h * 0.32, w * 0.32);
    const bw = w - 3, bh = h - 3;
    const s = new THREE.Shape();
    const x0 = -bw / 2 + r, y0 = -bh / 2 + r, x1 = bw / 2 - r, y1 = bh / 2 - r;
    s.moveTo(x0, -bh / 2); s.lineTo(x1, -bh / 2); s.absarc(x1, y0, r, -Math.PI / 2, 0, false);
    s.lineTo(bw / 2, y1); s.absarc(x1, y1, r, 0, Math.PI / 2, false);
    s.lineTo(x0, bh / 2); s.absarc(x0, y1, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-bw / 2, y0); s.absarc(x0, y0, r, Math.PI, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: 6, bevelEnabled: true, bevelThickness: 3.2, bevelSize: 1.6, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, 0);
    geoCache[key] = g;
    return g;
  }

  /** A unit quad (for symbols, halos, shadows), facing +z. */
  function quadGeometry() {
    if (geoCache.quad) return geoCache.quad;
    geoCache.quad = new THREE.PlaneGeometry(1, 1);
    return geoCache.quad;
  }

  /* ── Materials ────────────────────────────────────────────────────────── */

  /**
   * Standard material that glows per instance: aGlow (0..n) adds the
   * instance colour as emission. Bloom turns it into light.
   */
  function glowStandard(opts) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.28, metalness: 0.05 }, opts));
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.6 + vec3(vGlow * 0.18);');
    };
    m.customProgramCacheKey = () => 'p3glow';
    return m;
  }

  /* ── The symbol atlas ─────────────────────────────────────────────────── */
  // 8 × 8 tiles of 128 px. Tile ids by name.

  const TILE = 128, COLS = 8;
  const TILES = {};

  function buildAtlas() {
    if (atlas) return atlas;
    const c = document.createElement('canvas');
    c.width = c.height = TILE * COLS;
    const g = c.getContext('2d');
    let n = 0;
    const put = (name, draw) => {
      const x = (n % COLS) * TILE, y = Math.floor(n / COLS) * TILE;
      g.save(); g.translate(x, y); draw(g); g.restore();
      TILES[name] = n++;
    };
    const glyphs = ['target', 'lantern', 'key', 'bumper', 'steel', 'portal', 'multiball', 'extra', 'multiplier', 'zap', 'spray', 'net', 'blast', 'fire', 'guide',
      'thief', 'shrink', 'sludge', 'armor', 'glass', 'wall', 'gate', 'hole'];
    glyphs.forEach(name => put(name, (gg) => P3.icons.glyph(gg, name, TILE / 2, TILE / 2, TILE * 0.8)));
    // Barrier brick hit dots: 1–4.
    for (let hp = 1; hp <= 4; hp++) {
      put('hp' + hp, (gg) => {
        const d = 13;
        for (let i = 0; i < hp; i++) {
          gg.beginPath(); gg.arc(TILE / 2 + (i - (hp - 1) / 2) * d * 2.5, TILE / 2, d, 0, Math.PI * 2);
          gg.fillStyle = '#fff'; gg.fill(); gg.lineWidth = 5; gg.strokeStyle = 'rgba(10,10,25,0.85)'; gg.stroke();
        }
      });
    }
    // Cracks for damaged bricks.
    put('crack', (gg) => {
      gg.strokeStyle = 'rgba(20,10,10,0.75)'; gg.lineWidth = 5; gg.lineCap = 'round';
      gg.beginPath(); gg.moveTo(20, 30); gg.lineTo(48, 62); gg.lineTo(40, 88); gg.moveTo(48, 62); gg.lineTo(80, 58); gg.lineTo(104, 92); gg.moveTo(80, 58); gg.lineTo(98, 30); gg.stroke();
    });
    // Soft halo and soft shadow.
    put('halo', (gg) => {
      const grd = gg.createRadialGradient(TILE / 2, TILE / 2, 0, TILE / 2, TILE / 2, TILE / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = grd; gg.fillRect(0, 0, TILE, TILE);
    });
    put('shadow', (gg) => {
      const grd = gg.createRadialGradient(TILE / 2, TILE / 2, 0, TILE / 2, TILE / 2, TILE / 2);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = grd; gg.fillRect(0, 0, TILE, TILE);
    });
    put('ringTile', (gg) => {
      gg.beginPath(); gg.arc(TILE / 2, TILE / 2, TILE * 0.42, 0, Math.PI * 2);
      gg.lineWidth = 9; gg.strokeStyle = '#fff'; gg.stroke();
    });
    put('dot', (gg) => {
      const grd = gg.createRadialGradient(TILE / 2, TILE / 2, 0, TILE / 2, TILE / 2, TILE / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.62, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = grd; gg.fillRect(0, 0, TILE, TILE);
    });
    put('spark', (gg) => {
      const grd = gg.createRadialGradient(TILE / 2, TILE / 2, 0, TILE / 2, TILE / 2, TILE / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = grd; gg.fillRect(0, 0, TILE, TILE);
      gg.fillStyle = 'rgba(255,255,255,0.9)';
      gg.fillRect(TILE / 2 - 2, 8, 4, TILE - 16); gg.fillRect(8, TILE / 2 - 2, TILE - 16, 4);
    });
    put('shard', (gg) => {
      gg.beginPath(); gg.moveTo(64, 14); gg.lineTo(108, 78); gg.lineTo(70, 114); gg.lineTo(22, 70); gg.closePath();
      gg.fillStyle = '#fff'; gg.fill();
    });
    put('confetti', (gg) => { gg.fillStyle = '#fff'; gg.fillRect(34, 50, 60, 28); });
    put('star', (gg) => {
      gg.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 54, a = -Math.PI / 2 + i * Math.PI / 5; gg.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      gg.closePath(); gg.fillStyle = '#fff'; gg.fill();
    });
    put('flame', (gg) => {
      const grd = gg.createRadialGradient(64, 76, 4, 64, 70, 56);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = grd;
      gg.beginPath(); gg.moveTo(64, 8); gg.bezierCurveTo(100, 50, 112, 90, 64, 120); gg.bezierCurveTo(16, 90, 28, 50, 64, 8); gg.fill();
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    atlas = { texture: tex, tiles: TILES, cols: COLS, canvas: c };
    return atlas;
  }

  function tileUV(name) {
    const i = TILES[name];
    if (i === undefined) return [0, 0];
    return [(i % COLS) / COLS, 1 - (Math.floor(i / COLS) + 1) / COLS];
  }

  /**
   * Instanced-quad material reading the atlas. Per instance:
   *   aTile (vec2 uv offset), aTint (vec3 colour × brightness), aAlpha.
   * blend: 'normal' | 'add' | 'multiply'
   */
  function atlasMaterial(blend, opts) {
    opts = opts || {};
    const A = buildAtlas();
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: opts.depthTest !== false,
      blending: blend === 'add' ? THREE.AdditiveBlending : blend === 'multiply' ? THREE.MultiplyBlending : THREE.NormalBlending,
      premultipliedAlpha: blend === 'multiply',
      uniforms: { map: { value: A.texture }, tileSize: { value: 1 / A.cols } },
      vertexShader: `
        attribute vec2 aTile; attribute vec3 aTint; attribute float aAlpha;
        varying vec2 vUv; varying vec3 vTint; varying float vAlpha;
        uniform float tileSize;
        void main() {
          vUv = aTile + uv * tileSize; vTint = aTint; vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec2 vUv; varying vec3 vTint; varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, vUv);
          float a = t.a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(t.rgb * vTint, a);
        }`
    });
    return m;
  }

  /* ── Reflections ──────────────────────────────────────────────────────── */

  const envCache = {};
  /** A soft studio-ish environment tinted by the world's sky, for glossy pegs and balls. */
  function environment(renderer, theme) {
    if (envCache[theme.id]) return envCache[theme.id];
    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(theme.sky[2]).lerp(new THREE.Color('#ffffff'), 0.55) },
        mid: { value: new THREE.Color(theme.sky[1]) },
        bot: { value: new THREE.Color(theme.sky[0]).multiplyScalar(0.5) },
        accent: { value: new THREE.Color(theme.accent) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 accent; varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.7)) : mix(mid, bot, pow(-h, 0.6));
          // A big soft key panel up-left-front and a coloured rim light.
          float key = smoothstep(0.75, 0.98, dot(vP, normalize(vec3(-0.5, 0.65, 0.6))));
          float rim = smoothstep(0.8, 0.99, dot(vP, normalize(vec3(0.7, -0.2, 0.5))));
          c += vec3(key) * 3.0 + accent * rim * 1.4;
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    scene.add(new THREE.Mesh(geo, mat));
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(scene, 0.035);
    pm.dispose(); geo.dispose(); mat.dispose();
    envCache[theme.id] = rt.texture;
    return rt.texture;
  }

  /** Canvas text texture (for bonus slots and labels on the board). */
  function textTexture(text, opts) {
    opts = opts || {};
    const w = opts.w || 256, h = opts.h || 96;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.font = (opts.weight || '800') + ' ' + (opts.size || 44) + 'px ' + (opts.font || '"Trebuchet MS", "Segoe UI", sans-serif');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = opts.stroke || 8; g.strokeStyle = opts.strokeColor || 'rgba(10,8,30,0.9)';
    g.strokeText(text, w / 2, h / 2 + 2);
    g.fillStyle = opts.color || '#ffffff';
    g.fillText(text, w / 2, h / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Linear colour from hex, optionally scaled (values above 1 bloom). */
  function col(hex, k) { return new THREE.Color(hex).multiplyScalar(k === undefined ? 1 : k); }

  P3.art = {
    init(three) { THREE = three; buildAtlas(); },
    pegGeometry, gemGeometry, lanternGeometry, spikeGeometry, bumperGeometry, ringGeometry, brickGeometry, quadGeometry,
    glowStandard, atlasMaterial, buildAtlas, tileUV, environment, textTexture, col,
    get tiles() { return TILES; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
