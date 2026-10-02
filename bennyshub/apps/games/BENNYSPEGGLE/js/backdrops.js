/**
 * Benny's P3GL — backdrop registry and shared scene helpers.
 *
 * Each world (js/themes.js) has an animated 3D backdrop that renders behind
 * the board in its own scene with its own perspective camera. The world
 * files (js/backdrops-cozy.js, -vivid.js, -hyper.js) register factories:
 *
 *   P3.backdrops.register(id, (ctx) => instance)
 *
 *   ctx = { THREE, renderer, scene, camera, theme, quality: 'high'|'low',
 *           reducedMotion, helpers, seed }
 *   instance = {
 *     update(dt, t, beat, energy),   beat: P3.audio.beat() or null; energy 0..1 (fever, big moments)
 *     setVariant(n),                 0..19, one per level: shift the light/colour a little
 *     resize(w, h),                  viewport in CSS px (portrait phones included)
 *     pulse(kind, strength),         'hit' | 'fever' | 'goal' | 'win' | 'beat'
 *     dispose()
 *   }
 *
 * Rendering is linear HDR with bloom (js/post.js): anything brighter than
 * about 1.0 glows. Keep the area behind the board calm — the board sits on a
 * tinted glass panel in the middle of the screen (most of the height in
 * landscape, most of the width in portrait) — and put the spectacle around
 * it.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const factories = {};

  function register(id, factory) { factories[id] = factory; }
  function has(id) { return !!factories[id]; }

  /* ── Helpers shared by every world ────────────────────────────────────── */

  const helpers = {
    /** A huge inverted sphere with a three-stop vertical gradient (linear-space colours). */
    skyDome(THREE, colors, opts) {
      opts = opts || {};
      const geo = new THREE.SphereGeometry(opts.radius || 900, 48, 24);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          c0: { value: new THREE.Color(colors[0]) }, c1: { value: new THREE.Color(colors[1]) }, c2: { value: new THREE.Color(colors[2]) },
          mid: { value: opts.mid !== undefined ? opts.mid : 0.45 }, gain: { value: opts.gain || 1 }
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform float mid; uniform float gain; varying vec3 vP;
          void main(){ float h = vP.y * 0.5 + 0.5; vec3 c = h > mid ? mix(c1, c0, smoothstep(mid, 1.0, h)) : mix(c2, c1, smoothstep(0.0, mid, h)); gl_FragColor = vec4(c * gain, 1.0); }`
      });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = -10;
      return m;
    },

    /** A soft round sprite texture (white, alpha falls off), for bokeh, fireflies, snow, stars. */
    softTexture(THREE, size, hardness) {
      size = size || 64; hardness = hardness === undefined ? 0.35 : hardness;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(hardness, 'rgba(255,255,255,0.75)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    },

    /**
     * A field of point sprites with per-point colour and size, drawn with one
     * draw call. Returns { points, positions, colors, sizes, count } so the
     * caller can animate the arrays (set .needsUpdate on the attribute).
     */
    pointField(THREE, count, opts) {
      opts = opts || {};
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { map: { value: opts.map || helpers.softTexture(THREE) }, scale: { value: opts.scale || 300 }, opacity: { value: opts.opacity === undefined ? 1 : opts.opacity } },
        vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;
          void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D map; uniform float opacity; varying vec3 vC;
          void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * opacity); if (gl_FragColor.a < 0.01) discard; }`
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      return { points, positions: pos, colors: col, sizes: size, count, geometry: geo, material: mat };
    },

    /** Unlit material whose colour is boosted past 1.0 so it blooms. */
    glow(THREE, color, intensity, opts) {
      const c = new THREE.Color(color).multiplyScalar(intensity || 2);
      return new THREE.MeshBasicMaterial(Object.assign({ color: c, toneMapped: false, fog: false }, opts || {}));
    },

    /** Linear-space THREE.Color from a hex string, scaled. */
    color(THREE, hex, k) { return new THREE.Color(hex).multiplyScalar(k === undefined ? 1 : k); },

    rng(seed) { return P3.util.mulberry32(seed || 1); },

    /**
     * Fit the camera to the viewport: keeps the horizontal field of view
     * sensible on portrait phones (where a fixed vertical fov looks squashed).
     */
    fitCamera(camera, w, h, baseFov) {
      camera.aspect = w / Math.max(1, h);
      const fov = baseFov || 50;
      camera.fov = camera.aspect < 1 ? Math.min(85, fov / Math.pow(camera.aspect, 0.55)) : fov;
      camera.updateProjectionMatrix();
    },

    /** Dispose everything under an object. */
    disposeTree(obj) {
      obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => { Object.keys(m).forEach(k => { if (m[k] && m[k].isTexture) m[k].dispose(); }); if (m.uniforms) Object.values(m.uniforms).forEach(u => { if (u && u.value && u.value.isTexture) u.value.dispose(); }); m.dispose(); });
        }
      });
    }
  };

  /** Plain gradient + drifting motes, used when a world has no backdrop yet. */
  function fallback(ctx) {
    const { THREE, scene, camera, theme } = ctx;
    const sky = helpers.skyDome(THREE, theme.sky);
    scene.add(sky);
    const f = helpers.pointField(THREE, 120, { scale: 260 });
    const rnd = helpers.rng(7);
    for (let i = 0; i < f.count; i++) {
      f.positions[i * 3] = (rnd() - 0.5) * 400; f.positions[i * 3 + 1] = (rnd() - 0.5) * 260; f.positions[i * 3 + 2] = -100 - rnd() * 200;
      const c = new THREE.Color(theme.glow); f.colors[i * 3] = c.r; f.colors[i * 3 + 1] = c.g; f.colors[i * 3 + 2] = c.b;
      f.sizes[i] = 2 + rnd() * 5;
    }
    scene.add(f.points);
    camera.position.set(0, 0, 60);
    return {
      update(dt, t) { f.points.rotation.z = Math.sin(t * 0.05) * 0.05; },
      setVariant() {}, resize(w, h) { helpers.fitCamera(camera, w, h, 50); }, pulse() {},
      dispose() { helpers.disposeTree(scene); }
    };
  }

  /**
   * Build a backdrop. Returns { scene, camera, instance, id }.
   */
  function create(id, opts) {
    const THREE = root.THREE;
    const theme = P3.themes.theme(id);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000);
    const ctx = {
      THREE, renderer: opts.renderer, scene, camera, theme,
      quality: opts.quality || 'high', reducedMotion: !!opts.reducedMotion, helpers, seed: P3.util.hash(id)
    };
    let instance;
    try { instance = (factories[id] || fallback)(ctx); }
    catch (e) { console.error('P3GL backdrop ' + id + ' failed', e); helpers.disposeTree(scene); return create.fallback(id, opts); }
    return { id, scene, camera, instance };
  }
  create.fallback = function (id, opts) {
    const THREE = root.THREE;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000);
    const instance = fallback({ THREE, renderer: opts.renderer, scene, camera, theme: P3.themes.theme(id), helpers });
    return { id, scene, camera, instance };
  };

  P3.backdrops = { register, has, create, helpers, ids: () => Object.keys(factories) };
})(typeof window !== 'undefined' ? window : globalThis);
