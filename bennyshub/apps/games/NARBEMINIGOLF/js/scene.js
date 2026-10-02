/**
 * NARBE Mini Golf — the 3D world.
 *
 * buildHole() turns a compiled hole (course.js) into geometry. The game and
 * the Course Creator's 3D preview both use it, so a hole looks the same in
 * both. The environment (sky, lights, reflections) is persistent and only
 * re-tinted when the theme changes.
 *
 * Course px → world: X = x·S, Z = y·S, Y = height·S, with S = 0.05.
 *
 * The carpet is one terrain-following grid with a painted canvas texture.
 * Ponds and the cup are holes cut in that texture (alpha test), with real
 * banks and a cup liner beneath, so the ball visibly drops *into* things.
 */
(function () {
  'use strict';

  const U = MG.util, C = MG.course, A = MG.art;
  const S = C.S;

  const RAIL_W = 16;          // px
  const RAIL_H = 0.95;        // world units above the carpet
  const GROUND_Y = -1.8;      // the course stands on a stone plinth above the lawn
  const WALL_H = 1.25;        // world units above the turf
  const WATER_DROP = 0.6;     // water surface below the carpet
  const CUP_DEPTH = 1.6;

  /* ── Environment ──────────────────────────────────────────────────────── */

  const env = {
    renderer: null, scene: null,
    hemi: null, sun: null, sky: null, stars: null, clouds: null,
    ground: null, themeName: null, envTex: null, pmrem: null
  };

  const SKY_VS = `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const SKY_FS = `
    uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom;
    uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize;
    varying vec3 vDir;
    void main() {
      float h = vDir.y;
      vec3 c = h > 0.0
        ? mix(mix(horizon, mid, smoothstep(0.0, 0.22, h)), top, smoothstep(0.22, 0.85, h))
        : mix(horizon, bottom, smoothstep(0.0, -0.25, h));
      float s = max(dot(vDir, normalize(sunDir)), 0.0);
      c += sunColor * (pow(s, 900.0 / sunSize) * 1.6 + pow(s, 12.0) * 0.22);
      gl_FragColor = vec4(c, 1.0);
    }`;

  function initEnvironment(renderer, scene) {
    env.renderer = renderer;
    env.scene = scene;
    env.pmrem = new THREE.PMREMGenerator(renderer);

    env.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    scene.add(env.hemi);

    env.sun = new THREE.DirectionalLight('#ffffff', 3);
    env.sun.castShadow = true;
    env.sun.shadow.mapSize.set(1024, 1024);
    env.sun.shadow.bias = -0.0004;
    env.sun.shadow.normalBias = 0.03;
    scene.add(env.sun);
    scene.add(env.sun.target);

    env.sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          top: { value: new THREE.Color() }, mid: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
          sunSize: { value: 1 }
        }
      })
    );
    env.sky.renderOrder = -10;
    scene.add(env.sky);

    const groundMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    env.ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48), groundMat);
    env.ground.rotation.x = -Math.PI / 2;
    env.ground.position.y = GROUND_Y;
    env.ground.receiveShadow = true;
    scene.add(env.ground);

    scene.fog = new THREE.Fog('#ffffff', 100, 300);
  }

  function setTheme(name) {
    const th = A.theme(name);
    if (env.themeName === name) return th;
    env.themeName = name;
    const u = env.sky.material.uniforms;
    u.top.value.set(th.skyTop); u.mid.value.set(th.skyMid);
    u.horizon.value.set(th.skyHorizon); u.bottom.value.set(th.skyGround);
    u.sunDir.value.set(th.sunDir[0], th.sunDir[1], th.sunDir[2]).normalize();
    u.sunColor.value.set(th.glow ? '#8090ff' : th.sunColor);
    u.sunSize.value = th.glow ? 2.5 : 1;

    env.hemi.color.set(th.hemiSky);
    env.hemi.groundColor.set(th.hemiGround);
    env.hemi.intensity = th.hemiIntensity;
    env.sun.color.set(th.sunColor);
    env.sun.intensity = th.sunIntensity;

    env.scene.fog.color.set(th.fog);
    env.scene.fog.near = th.fogNear;
    env.scene.fog.far = th.fogFar;
    env.renderer.toneMappingExposure = th.exposure;

    const gt = A.grassTexture(th);
    env.ground.material.map = gt;
    gt.repeat.set(70, 70);
    env.ground.material.color.set('#ffffff');
    env.ground.material.needsUpdate = true;

    // Stars.
    if (env.stars) { env.scene.remove(env.stars); env.stars.geometry.dispose(); env.stars = null; }
    if (th.stars) {
      const n = 900, pos = new Float32Array(n * 3), rnd = U.mulberry32(7);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, e = Math.asin(0.08 + rnd() * 0.92);
        pos[i * 3] = Math.cos(a) * Math.cos(e) * 380;
        pos[i * 3 + 1] = Math.sin(e) * 380;
        pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 380;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      env.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
      env.scene.add(env.stars);
    }

    // Clouds.
    if (env.clouds) { env.scene.remove(env.clouds); env.clouds = null; }
    if (th.clouds) {
      env.clouds = new THREE.Group();
      const rnd = U.mulberry32(3);
      const mat = new THREE.SpriteMaterial({ map: A.cloudTexture(), transparent: true, opacity: 0.85, fog: false, depthWrite: false, color: th.label === 'Sunset Lagoon' ? '#ffd6c0' : '#ffffff' });
      for (let i = 0; i < 18; i++) {
        const s = new THREE.Sprite(mat);
        const a = rnd() * Math.PI * 2, d = 180 + rnd() * 160;
        s.position.set(Math.cos(a) * d, 55 + rnd() * 60, Math.sin(a) * d);
        s.scale.set(70 + rnd() * 60, 30 + rnd() * 20, 1);
        s.userData.speed = 0.6 + rnd() * 0.8;
        env.clouds.add(s);
      }
      env.scene.add(env.clouds);
    }

    // Reflections from the sky, so the ball, water, ice and putter catch light.
    const envScene = new THREE.Scene();
    envScene.add(env.sky.clone());
    if (env.envTex) env.envTex.dispose();
    env.envTex = env.pmrem.fromScene(envScene, 0.02, 0.1, 1000).texture;   // far must reach the 420-unit sky
    // Only shiny things get the sky (reflect() below). As a scene-wide
    // environment it lit every surface and washed the colours out.
    return th;
  }

  /** Give a shiny material the sky reflection for the current theme. */
  function reflect(root, intensity) {
    const apply = (m) => { if (m && 'envMap' in m) { m.envMap = env.envTex; m.envMapIntensity = intensity || 1; m.needsUpdate = true; } };
    if (root && root.isMaterial) apply(root);
    else if (root) root.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(apply); });
  }

  function updateEnvironment(dt) {
    if (env.clouds) for (const s of env.clouds.children) {
      s.position.x += s.userData.speed * dt;
      if (s.position.x > 340) s.position.x = -340;
    }
  }

  /** Point the sun's shadow camera at a region (world units). */
  function fitShadows(cx, cz, radius, th) {
    const d = new THREE.Vector3(th.sunDir[0], th.sunDir[1], th.sunDir[2]).normalize();
    env.sun.position.set(cx + d.x * 120, d.y * 120, cz + d.z * 120);
    env.sun.target.position.set(cx, 0, cz);
    const cam = env.sun.shadow.camera;
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.near = 1; cam.far = 260;
    cam.updateProjectionMatrix();
    env.sky.position.set(cx, 0, cz);
    env.ground.position.x = cx; env.ground.position.z = cz;
    if (env.stars) env.stars.position.set(cx, 0, cz);
  }

  /* ── Carpet painting ──────────────────────────────────────────────────── */

  function tracePoly(g, pts, map) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = map(pts[i].x, pts[i].y);
      if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    g.closePath();
  }

  function paintCarpet(ch, th, frame) {
    const { x0, y0, k, cw, chh } = frame;
    const map = (x, y) => [(x - x0) * k, (y - y0) * k];
    const c = A.canvas(cw, chh), g = c.getContext('2d');
    const rough = A.canvas(Math.ceil(cw / 2), Math.ceil(chh / 2)), rg = rough.getContext('2d');
    rg.scale(0.5, 0.5);
    rg.fillStyle = '#ffffff'; rg.fillRect(0, 0, cw, chh);
    const rnd = U.mulberry32(U.hash(JSON.stringify(ch.start) + ch.par));

    // Base carpet, clipped to the fairway.
    g.save();
    tracePoly(g, ch.fairway.poly, map);
    g.fillStyle = th.carpet; g.fill();
    g.clip();

    // Broad stripes along the line of play read as "manicured" from above.
    const ang = teeDirection(ch);
    g.save();
    g.translate(cw / 2, chh / 2);
    g.rotate(ang + Math.PI / 2);
    g.fillStyle = th.carpetStripe;
    const band = 70 * k, span = Math.hypot(cw, chh);
    for (let i = -Math.ceil(span / band); i < span / band; i += 2) g.fillRect(i * band, -span, band, span * 2);
    g.restore();

    // Fibre speckle.
    for (let i = 0; i < cw * chh / 90; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      g.fillRect(rnd() * cw, rnd() * chh, 1.5, 1.5);
    }

    // Tee mat.
    {
      const p = map(ch.start.x, ch.start.y);
      g.save();
      g.translate(p[0], p[1]);
      g.rotate(ang);
      const mw = (ch.ballR * 7) * k, mh = (ch.ballR * 6) * k;
      g.fillStyle = th.glow ? '#0b1a55' : A.shade(th.carpet, -0.12);
      g.beginPath();
      g.roundRect ? g.roundRect(-mw / 2, -mh / 2, mw, mh, 10 * k) : g.rect(-mw / 2, -mh / 2, mw, mh);
      g.fill();
      g.lineWidth = 3 * k;
      g.strokeStyle = th.glow ? '#3df5ff' : 'rgba(255,255,255,0.75)';
      g.stroke();
      g.fillStyle = th.glow ? '#fff23d' : '#ffffff';
      g.beginPath(); g.arc(0, 0, 3.5 * k, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // Sand.
    for (const reg of ch.sands) {
      g.save();
      tracePoly(g, reg.poly, map);
      g.fillStyle = th.sand; g.fill();
      g.clip();
      for (let i = 0; i < 1200; i++) {
        const x = reg.bbox.x0 + rnd() * (reg.bbox.x1 - reg.bbox.x0), y = reg.bbox.y0 + rnd() * (reg.bbox.y1 - reg.bbox.y0);
        const p = map(x, y);
        g.fillStyle = rnd() < 0.5 ? 'rgba(120,90,40,0.18)' : 'rgba(255,255,255,0.25)';
        g.fillRect(p[0], p[1], 1.6, 1.6);
      }
      // Raked ripples.
      g.strokeStyle = 'rgba(150,115,60,0.18)'; g.lineWidth = 2 * k;
      for (let yy = reg.bbox.y0; yy < reg.bbox.y1; yy += 14) {
        g.beginPath();
        for (let xx = reg.bbox.x0; xx <= reg.bbox.x1; xx += 10) {
          const p = map(xx, yy + Math.sin(xx * 0.05) * 4);
          if (xx === reg.bbox.x0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
        }
        g.stroke();
      }
      g.restore();
      // Shaded lip.
      tracePoly(g, reg.poly, map);
      g.lineWidth = 6 * k; g.strokeStyle = 'rgba(120,85,30,0.35)'; g.stroke();
      tracePoly(rg, reg.poly, (x, y) => map(x, y));
      rg.fillStyle = '#ffffff'; rg.fill();
    }

    // Ice: pale, streaked, and glossy (low roughness).
    for (const reg of ch.ice) {
      g.save();
      tracePoly(g, reg.poly, map);
      g.fillStyle = th.ice; g.fill();
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2.5 * k;
      for (let i = 0; i < 26; i++) {
        const x = reg.bbox.x0 + rnd() * (reg.bbox.x1 - reg.bbox.x0), y = reg.bbox.y0 + rnd() * (reg.bbox.y1 - reg.bbox.y0);
        const p = map(x, y), l = (20 + rnd() * 60) * k, a = -0.6 + rnd() * 0.3;
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l); g.stroke();
      }
      g.restore();
      tracePoly(g, reg.poly, map);
      g.lineWidth = 4 * k; g.strokeStyle = th.glow ? '#3df5ff' : 'rgba(150,210,240,0.9)'; g.stroke();
      tracePoly(rg, reg.poly, map);
      rg.fillStyle = '#1a1a1a'; rg.fill();
    }

    // Boost pad bases (the animated arrows are an overlay mesh).
    for (const reg of ch.boosts) {
      tracePoly(g, reg.poly, map);
      g.fillStyle = th.glow ? '#3a1050' : '#e8742a'; g.fill();
      g.lineWidth = 4 * k; g.strokeStyle = th.glow ? '#ff3df0' : '#b84e14'; g.stroke();
      tracePoly(rg, reg.poly, map);
      rg.fillStyle = '#707070'; rg.fill();
    }

    // Baked slope shading, so mounds and bowls read clearly even from straight
    // above (low vision): sun-facing slopes lighter, the far side darker,
    // and higher ground a touch paler than low ground.
    if (ch.hills.length) {
      const q = 4;
      const sw = Math.ceil(cw / q), sh = Math.ceil(chh / q);
      const sc = A.canvas(sw, sh), sg = sc.getContext('2d');
      const img = sg.createImageData(sw, sh);
      const L = new THREE.Vector3(th.sunDir[0], th.sunDir[1], th.sunDir[2]).normalize();
      const grad = { x: 0, y: 0 };
      for (let py = 0; py < sh; py++) for (let px = 0; px < sw; px++) {
        const x = x0 + (px + 0.5) * q / k, y = y0 + (py + 0.5) * q / k;
        C.hillGradient(ch.hills, x, y, grad);
        const nx = -grad.x, ny = 1, nz = -grad.y, nl = Math.hypot(nx, ny, nz);
        const lit = (nx * L.x + ny * L.y + nz * L.z) / nl - L.y;
        const hh = C.hillHeight(ch.hills, x, y);
        let v = lit * 2.2 + hh / 260;
        v = U.clamp(v, -0.45, 0.4);
        const i = (py * sw + px) * 4;
        const c = v > 0 ? 255 : 0;
        img.data[i] = c; img.data[i + 1] = c; img.data[i + 2] = v > 0 ? 235 : 20;
        img.data[i + 3] = Math.abs(v) * 255;
      }
      sg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(sc, 0, 0, cw, chh);
    }

    // Soft shadow where the carpet meets the rail.
    tracePoly(g, ch.fairway.poly, map);
    g.lineWidth = 16 * k; g.strokeStyle = 'rgba(0,0,0,0.16)'; g.stroke();
    g.restore();

    // Wet edges around ponds, then cut the ponds out.
    for (const reg of ch.waters) {
      tracePoly(g, reg.poly, map);
      g.lineWidth = 12 * k; g.strokeStyle = 'rgba(10,40,20,0.35)'; g.stroke();
    }
    // destination-out removes as much alpha as the brush has, so the brush
    // must be fully opaque or the "hole" is only a faint tint.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000000';
    for (const reg of ch.waters) { tracePoly(g, reg.poly, map); g.fill(); }
    g.globalCompositeOperation = 'source-over';

    // The cup: a darker ring of worn carpet, then the hole itself.
    {
      const p = map(ch.cup.x, ch.cup.y);
      g.beginPath(); g.arc(p[0], p[1], (ch.cup.r + 7) * k, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000000';   // opaque brush: a real hole, not an 18% tint
      g.beginPath(); g.arc(p[0], p[1], ch.cup.r * k, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    }

    return { color: c, rough };
  }

  /** Boost pads' arrow directions, encoded per pixel for the overlay shader. */
  function paintBoostMask(ch, frame) {
    if (!ch.boosts.length) return null;
    const { x0, y0 } = frame;
    const k = frame.k * 0.5;
    const c = A.canvas(Math.ceil(frame.cw / 2), Math.ceil(frame.chh / 2)), g = c.getContext('2d');
    const map = (x, y) => [(x - x0) * k, (y - y0) * k];
    for (const reg of ch.boosts) {
      const r = reg.directional ? Math.round((reg.dirX * 0.5 + 0.5) * 255) : 128;
      const gg = reg.directional ? Math.round((reg.dirY * 0.5 + 0.5) * 255) : 128;
      tracePoly(g, reg.poly, map);
      g.fillStyle = `rgb(${r},${gg},255)`;
      g.fill();
    }
    const t = A.tex(c, { srgb: false });
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  const BOOST_VS = `
    varying vec2 vUv; varying vec2 vXZ;
    void main() {
      vUv = uv;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vXZ = w.xz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const BOOST_FS = `
    uniform sampler2D mask; uniform float time; uniform vec3 base; uniform vec3 hot;
    varying vec2 vUv; varying vec2 vXZ;
    void main() {
      vec4 m = texture2D(mask, vUv);
      if (m.b < 0.5) discard;
      vec2 d = m.rg * 2.0 - 1.0;
      float pat;
      if (length(d) < 0.3) {
        vec2 q = fract(vXZ * 0.9) - 0.5;
        pat = smoothstep(0.32, 0.2, length(q)) * (0.6 + 0.4 * sin(time * 6.0));
      } else {
        d = normalize(d);
        vec2 n = vec2(-d.y, d.x);
        float along = dot(vXZ, d);
        float zig = abs(mod(dot(vXZ, n), 2.4) - 1.2);
        float s = fract((along - zig * 0.6) * 0.55 - time * 1.6);
        pat = smoothstep(0.0, 0.06, s) * smoothstep(0.45, 0.38, s);
      }
      gl_FragColor = vec4(mix(base, hot, pat), 0.55 + pat * 0.45);
    }`;

  /* ── Geometry builders ────────────────────────────────────────────────── */

  /** Carpet frame: the canvas/UV mapping shared by every carpet layer. */
  function carpetFrame(ch) {
    const m = RAIL_W + 24;
    const bb = ch.fairway.bbox;
    const x0 = bb.x0 - m, y0 = bb.y0 - m, x1 = bb.x1 + m, y1 = bb.y1 + m;
    const w = x1 - x0, h = y1 - y0;
    const k = Math.min(1.6, 2048 / w, 2048 / h);
    return { x0, y0, x1, y1, w, h, k, cw: Math.ceil(w * k), chh: Math.ceil(h * k) };
  }

  function buildCarpetGeometry(ch, frame) {
    const spacing = ch.hills.length ? 10 : 48;
    const nx = Math.max(2, Math.ceil(frame.w / spacing)), ny = Math.max(2, Math.ceil(frame.h / spacing));
    const verts = (nx + 1) * (ny + 1);
    const pos = new Float32Array(verts * 3), uv = new Float32Array(verts * 2);
    let i = 0;
    for (let j = 0; j <= ny; j++) for (let ix = 0; ix <= nx; ix++) {
      const x = frame.x0 + frame.w * ix / nx, y = frame.y0 + frame.h * j / ny;
      pos[i * 3] = x * S; pos[i * 3 + 1] = C.terrainHeight(ch, x, y) * S; pos[i * 3 + 2] = y * S;
      uv[i * 2] = ((x - frame.x0) * frame.k) / frame.cw;
      uv[i * 2 + 1] = 1 - ((y - frame.y0) * frame.k) / frame.chh;
      i++;
    }
    const idx = new Uint32Array(nx * ny * 6);
    let o = 0;
    for (let j = 0; j < ny; j++) for (let ix = 0; ix < nx; ix++) {
      const a = j * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b;
      idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }

  function carpetMaterial(colorTex, roughTex) {
    const mat = new THREE.MeshStandardMaterial({
      map: colorTex, roughnessMap: roughTex, roughness: 0.92, metalness: 0,
      alphaTest: 0.5
    });
    const detail = A.carpetDetail();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.detailMap = { value: detail };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vDetailXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDetailXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec2 vDetailXZ;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n{ float dt = texture2D(detailMap, vDetailXZ * 0.35).r; diffuseColor.rgb *= mix(1.0, dt * 2.0, 0.28); }');
    };
    return mat;
  }

  /** Inward-facing per-vertex offset directions for a closed polygon. */
  function vertexNormals(poly, edges) {
    const n = poly.length, out = [];
    for (let i = 0; i < n; i++) {
      const e0 = edges[(i - 1 + n) % n], e1 = edges[i];
      let nx = e0.nx + e1.nx, ny = e0.ny + e1.ny;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      // Miter length, capped so sharp corners don't spike.
      const cos = nx * e1.nx + ny * e1.ny;
      out.push({ x: nx, y: ny, miter: Math.min(2.2, 1 / Math.max(0.3, cos)) });
    }
    return out;
  }

  /** The border rail running all the way round the carpet. */
  function buildRails(ch, th) {
    const poly = ch.fairway.poly, edges = ch.fairway.edges;
    const vn = vertexNormals(poly, edges);
    const n = poly.length;
    // Cross-section from inside to outside: carpet edge → bevelled top → ground.
    const pos = [], nor = [], uv = [], idx = [];
    let dist = 0;
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const p = poly[i % n], v = vn[i % n];
      if (i > 0) { const q = poly[i - 1]; dist += Math.hypot(p.x - q.x, p.y - q.y); }
      const h = C.terrainHeight(ch, p.x, p.y) * S;
      const out = (d) => ({ x: (p.x - v.x * d * v.miter) * S, z: (p.y - v.y * d * v.miter) * S });
      const a = out(0), b = out(3), c = out(RAIL_W - 3), d = out(RAIL_W);
      const top = h + RAIL_H;
      // Profile points (x,y,z), with an outward-ish normal for each.
      const prof = [
        [a.x, h - 0.12, a.z], [a.x, top - 0.12, a.z], [b.x, top, b.z],
        [c.x, top, c.z], [d.x, top - 0.12, d.z], [d.x, GROUND_Y - 0.05, d.z]
      ];
      rings.push({ prof, u: dist * S * 0.5, nx: v.x, nz: v.y });
    }
    const P = 6;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const ins = [r.nx, 0, r.nz], up = [0, 1, 0], outn = [-r.nx, 0, -r.nz];
      const ns = [ins, ins, up, up, outn, outn];
      const vs = [0, 0.3, 0.42, 0.58, 0.7, 1];
      for (let k = 0; k < P; k++) {
        pos.push(r.prof[k][0], r.prof[k][1], r.prof[k][2]);
        // Blend the bevel normals so the top edge catches light.
        const nn = k === 1 ? [ins[0] * 0.6, 0.8, ins[2] * 0.6] : k === 4 ? [outn[0] * 0.6, 0.8, outn[2] * 0.6] : ns[k];
        nor.push(nn[0], nn[1], nn[2]);
        uv.push(r.u, vs[k]);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < P - 1; k++) {
      const a = i * P + k, b = a + 1, c = (i + 1) * P + k, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);

    let mat;
    if (th.railStyle === 'neon') {
      mat = new THREE.MeshStandardMaterial({ color: th.rail, roughness: 0.6 });
    } else if (th.railStyle === 'wood') {
      const t = A.woodTexture(th.rail).clone(); t.needsUpdate = true; t.repeat.set(1, 1);
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
    } else {
      const t = A.stoneTexture(th.rail);
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);

    // Glow golf: a neon strip along the inner top edge of the rail.
    if (th.railStyle === 'neon') {
      const sp = [], si = [];
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        const a = r.prof[1], b = r.prof[2];
        sp.push(a[0], a[1] + 0.02, a[2], b[0], b[1] + 0.02, b[2]);
      }
      for (let i = 0; i < rings.length - 1; i++) {
        const a = i * 2;
        si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      sg.setIndex(si);
      const strip = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: th.neon[0], side: THREE.DoubleSide, toneMapped: false }));
      group.add(strip);
    }
    return group;
  }

  /** World-space UVs so shared tiling textures keep their scale on any size box. */
  function worldUV(geo, tile) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
      else if (nx > nz) uv.setXY(i, z / tile, y / tile);
      else uv.setXY(i, x / tile, y / tile);
    }
    uv.needsUpdate = true;
    return geo;
  }

  function boxRange(ch, box) {
    let lo = Infinity, hi = -Infinity;
    for (const p of C.boxCorners(box).concat([{ x: box.cx, y: box.cy }])) {
      const h = C.terrainHeight(ch, p.x, p.y) * S;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return { lo, hi };
  }

  function buildWalls(ch, th) {
    if (!ch.walls.length) return null;
    const bodies = [], caps = [];
    for (const w of ch.walls) {
      const { lo, hi } = boxRange(ch, w);
      const base = Math.min(lo, 0) - 0.2, top = hi + WALL_H;
      const g = new THREE.BoxGeometry(w.hw * 2 * S, top - base, w.hh * 2 * S);
      g.rotateY(-w.angle * Math.PI / 180);
      g.translate(w.cx * S, (top + base) / 2, w.cy * S);
      bodies.push(worldUV(g, 1.6));
      const cap = new THREE.BoxGeometry(w.hw * 2 * S + 0.16, 0.14, w.hh * 2 * S + 0.16);
      cap.rotateY(-w.angle * Math.PI / 180);
      cap.translate(w.cx * S, top + 0.07, w.cy * S);
      caps.push(cap);
    }
    const group = new THREE.Group();
    let bodyMat;
    if (th.wall === 'neon') bodyMat = new THREE.MeshStandardMaterial({ color: '#22265a', roughness: 0.5 });
    else if (th.wall === 'stone') bodyMat = new THREE.MeshStandardMaterial({ map: A.stoneTexture(th.rail), roughness: 0.9 });
    else bodyMat = new THREE.MeshStandardMaterial({ map: A.brickTexture(), roughness: 0.85 });
    const body = new THREE.Mesh(A.merge(bodies), bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    const capMat = th.wall === 'neon'
      ? new THREE.MeshBasicMaterial({ color: th.neon[1], toneMapped: false })
      : new THREE.MeshStandardMaterial({ color: th.railTop, roughness: 0.6 });
    const capM = new THREE.Mesh(A.merge(caps), capMat);
    capM.castShadow = true;
    group.add(body, capM);
    return group;
  }

  function buildWater(ch, th, frame) {
    if (!ch.waters.length) return null;
    const group = new THREE.Group();
    const nTex = A.waterNormal();
    const waterMat = new THREE.MeshStandardMaterial({
      color: th.water, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.86,
      normalMap: nTex, normalScale: new THREE.Vector2(0.35, 0.35),
      emissive: th.glow ? th.water : '#000000', emissiveIntensity: th.glow ? 0.35 : 0
    });
    const bedMat = new THREE.MeshStandardMaterial({ color: th.waterDeep, roughness: 1 });
    const bankMat = new THREE.MeshStandardMaterial({ color: th.glow ? '#1a1d3a' : A.shade(th.soil, -0.05), roughness: 1, side: THREE.DoubleSide });
    const levels = [];
    for (const reg of ch.waters) {
      let lo = 0;
      for (const p of reg.poly) lo = Math.min(lo, C.terrainHeight(ch, p.x, p.y) * S);
      const level = lo - WATER_DROP;
      levels.push(level);
      const shape = new THREE.Shape(reg.poly.map(p => new THREE.Vector2(p.x * S, -p.y * S)));
      const sg = new THREE.ShapeGeometry(shape);
      sg.rotateX(-Math.PI / 2);
      // UVs in world units so the ripple scale is the same on every pond.
      const p = sg.attributes.position, uv = sg.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 6, p.getZ(i) / 6);
      const surf = new THREE.Mesh(sg, waterMat);
      surf.position.y = level;
      surf.receiveShadow = true;
      group.add(surf);
      const bed = new THREE.Mesh(sg.clone(), bedMat);
      bed.position.y = level - 0.9;
      group.add(bed);
      // Banks: a skirt from the carpet edge down past the water line.
      const bp = [], bi = [];
      const n = reg.poly.length;
      for (let i = 0; i <= n; i++) {
        const q = reg.poly[i % n];
        const h = C.terrainHeight(ch, q.x, q.y) * S;
        bp.push(q.x * S, h + 0.01, q.y * S, q.x * S, level - 0.95, q.y * S);
      }
      for (let i = 0; i < n; i++) { const a = i * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      bg.setIndex(bi);
      bg.computeVertexNormals();
      group.add(new THREE.Mesh(bg, bankMat));
    }
    reflect(waterMat, 1.2);
    group.userData.normalMap = nTex;
    group.userData.levels = levels;
    return group;
  }

  function buildCup(ch, th) {
    const g = new THREE.Group();
    const r = ch.cup.r * S;
    const h = C.terrainHeight(ch, ch.cup.x, ch.cup.y) * S;
    const liner = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, CUP_DEPTH, 40, 1, true),
      new THREE.MeshStandardMaterial({ color: '#d8d8d4', roughness: 0.5, side: THREE.BackSide })
    );
    liner.position.y = -CUP_DEPTH / 2;
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.995, r * 0.995, CUP_DEPTH * 0.82, 40, 1, true),
      new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.9, side: THREE.BackSide })
    );
    inner.position.y = -CUP_DEPTH * 0.59;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ color: '#111111', roughness: 1 }));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -CUP_DEPTH + 0.01;
    g.add(liner, inner, bottom);
    if (th.glow) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.02, r * 1.22, 48), new THREE.MeshBasicMaterial({ color: th.neon[2], toneMapped: false, transparent: true, opacity: 0.95 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
    }
    g.position.set(ch.cup.x * S, h, ch.cup.y * S);
    return g;
  }

  function buildBridges(ch, th) {
    if (!ch.bridges.length) return null;
    const deckParts = [], railParts = [];
    const n = 24;
    for (const b of ch.bridges) {
      const base = C.terrainHeight(ch, b.cx, b.cy) * S;
      const pos = [], idx = [], uv = [];
      for (let i = 0; i <= n; i++) {
        const lx = -b.hw + (2 * b.hw) * i / n;
        const fromEnd = b.hw - Math.abs(lx);
        const y = base + C.BRIDGE_RISE * Math.min(1, fromEnd / C.BRIDGE_RAMP) * S + 0.02;
        for (const ly of [-b.hh, b.hh]) {
          const x = b.cx + lx * b.cos - ly * b.sin, z = b.cy + lx * b.sin + ly * b.cos;
          pos.push(x * S, y, z * S);
          uv.push(lx * S / 1.6, ly * S / 1.6);
        }
      }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      // Faces must point up; flip if the winding came out downward.
      if (g.attributes.normal.getY(0) < 0) {
        const ix = g.index.array;
        for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
        g.computeVertexNormals();
      }
      deckParts.push(g);
      // Beams under the deck so it reads as a structure, not a sticker.
      for (const ly of [-b.hh * 0.6, b.hh * 0.6]) {
        const beam = new THREE.BoxGeometry(b.hw * 2 * S * 0.9, 0.35, 0.3);
        beam.rotateY(-b.angle * Math.PI / 180);
        beam.translate((b.cx - ly * b.sin) * S, base + C.BRIDGE_RISE * S - 0.2, (b.cy + ly * b.cos) * S);
        railParts.push(worldUV(beam, 1.6));
      }
      // Posts and handrails along both long sides.
      const posts = Math.max(2, Math.round(b.hw * 2 * S / 1.6));
      for (const side of [-1, 1]) {
        const ly = side * (b.hh - 2.5);
        for (let i = 0; i <= posts; i++) {
          const lx = -b.hw + 6 + (2 * b.hw - 12) * i / posts;
          const fromEnd = b.hw - Math.abs(lx);
          const y = base + C.BRIDGE_RISE * Math.min(1, fromEnd / C.BRIDGE_RAMP) * S;
          const post = new THREE.BoxGeometry(0.2, 1.1, 0.2);
          post.translate((b.cx + lx * b.cos - ly * b.sin) * S, y + 0.55, (b.cy + lx * b.sin + ly * b.cos) * S);
          railParts.push(worldUV(post, 1.6));
        }
        const rail = new THREE.BoxGeometry(b.hw * 2 * S - 0.4, 0.16, 0.16);
        rail.rotateY(-b.angle * Math.PI / 180);
        rail.translate((b.cx - ly * b.sin) * S, base + C.BRIDGE_RISE * S + 1.05, (b.cy + ly * b.cos) * S);
        railParts.push(worldUV(rail, 1.6));
        const curb = new THREE.BoxGeometry(b.hw * 2 * S, 0.22, 0.25);
        curb.rotateY(-b.angle * Math.PI / 180);
        curb.translate((b.cx - ly * b.sin) * S, base + C.BRIDGE_RISE * S + 0.12, (b.cy + ly * b.cos) * S);
        railParts.push(worldUV(curb, 1.6));
      }
    }
    const group = new THREE.Group();
    const wood = A.woodTexture(th.glow ? '#5a4a8a' : '#c08a52');
    const deck = new THREE.Mesh(A.merge(deckParts), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8, side: THREE.DoubleSide }));
    deck.receiveShadow = true; deck.castShadow = true;
    const rails = new THREE.Mesh(A.merge(railParts), new THREE.MeshStandardMaterial({ map: A.woodTexture(th.glow ? '#3df5ff' : '#8a5a34'), roughness: 0.8 }));
    rails.castShadow = true; rails.receiveShadow = true;
    group.add(deck, rails);
    return group;
  }

  function buildBushes(ch, th) {
    const list = [];
    for (let i = 0; i < ch.bushes.length; i++) {
      const b = ch.bushes[i];
      const rnd = U.mulberry32(U.hash('bush' + i + b.x + b.y));
      const m = new THREE.Mesh(A.bushGeometry(th, rnd, b.radius * S * 1.05), A.vcMaterial({ roughness: 0.9 }));
      m.position.set(b.x * S, C.terrainHeight(ch, b.x, b.y) * S, b.y * S);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.shake = 0;
      list.push(m);
    }
    return list;
  }

  /* ── Surroundings ─────────────────────────────────────────────────────── */

  function insideAny(ch, x, y, pad) {
    const fw = ch.fairway;
    if (C.pointInPolygon(x, y, fw.poly)) return true;
    const c = C.closestOnPolygon(x, y, fw.poly);
    return c.d < pad;
  }

  /** Trees, flowers, rocks and lamps around the hole — seeded, so a hole always looks the same. */
  function buildSurroundings(ch, th, signSpot) {
    const rnd = U.mulberry32(U.hash('scenery' + ch.start.x + ch.start.y + ch.cup.x));
    const bb = ch.fairway.bbox;
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const rx = (bb.x1 - bb.x0) / 2, ry = (bb.y1 - bb.y0) / 2;
    const parts = [], glowSpots = [];
    const taken = [];
    const free = (x, y, r) => {
      if (signSpot && Math.hypot(x - signSpot.x, y - signSpot.y) < r + 60) return false;
      for (const t of taken) if (Math.hypot(x - t.x, y - t.y) < r + t.r) return false;
      return true;
    };
    const tree = th.trees === 'palm' ? A.treePalm : A.treeRound;

    // Trees in a loose ring around the hole.
    let tries = 0, trees = 0;
    const want = Math.round(26 + (rx + ry) / 60);
    while (trees < want && tries++ < want * 30) {
      const a = rnd() * Math.PI * 2;
      const d = 1.0 + rnd() * 0.9;
      const x = cx + Math.cos(a) * (rx + 160) * d, y = cy + Math.sin(a) * (ry + 160) * d;
      if (insideAny(ch, x, y, 120) || !free(x, y, 70)) continue;
      const s = 0.9 + rnd() * 0.7;
      const geo = (th.trees !== 'palm' && rnd() < 0.3) ? A.treePine(th, rnd, s) : tree(th, rnd, s);
      parts.push(A.place(geo, x * S, GROUND_Y, y * S, rnd() * 6.28));
      taken.push({ x, y, r: 60 * s });
      trees++;
    }
    // Flower beds hugging the outside of the rail.
    const fw = ch.fairway;
    const step = Math.max(1, Math.floor(fw.poly.length / 22));
    for (let i = 0; i < fw.poly.length; i += step) {
      const e = fw.edges[i];
      const off = RAIL_W + 34 + rnd() * 40;
      const x = fw.poly[i].x - e.nx * off, y = fw.poly[i].y - e.ny * off;
      if (insideAny(ch, x, y, RAIL_W + 20) || !free(x, y, 30) || rnd() < 0.35) continue;
      parts.push(A.place(A.flowerPatch(th, rnd, 0.9 + rnd() * 0.6), x * S, GROUND_Y, y * S));
      taken.push({ x, y, r: 30 });
    }
    // Rocks.
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const x = cx + Math.cos(a) * (rx + 90 + rnd() * 260), y = cy + Math.sin(a) * (ry + 90 + rnd() * 260);
      if (insideAny(ch, x, y, RAIL_W + 30) || !free(x, y, 25)) continue;
      parts.push(A.place(A.rock(th, rnd, 0.5 + rnd() * 1.1), x * S, GROUND_Y, y * S, rnd() * 6));
      taken.push({ x, y, r: 25 });
    }
    // Lamp posts at night, and in the evening.
    if (th.glow || th.props === 'beach') {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const k = Math.floor(i * fw.poly.length / n);
        const e = fw.edges[k];
        const x = fw.poly[k].x - e.nx * (RAIL_W + 46), y = fw.poly[k].y - e.ny * (RAIL_W + 46);
        if (insideAny(ch, x, y, RAIL_W + 30) || !free(x, y, 20)) continue;
        parts.push(A.place(A.lampPost(th, rnd), x * S, GROUND_Y, y * S));
        glowSpots.push(new THREE.Vector3(x * S, GROUND_Y + 3.6, y * S));
        taken.push({ x, y, r: 20 });
      }
    }
    // A picket fence around the whole plot.
    if (!th.glow && th.props !== 'beach') {
      const fx = rx + 420, fy = ry + 420;
      const per = 2 * Math.PI * Math.sqrt((fx * fx + fy * fy) / 2);
      const panels = Math.round(per * S / 3);
      for (let i = 0; i < panels; i++) {
        const a0 = (i / panels) * Math.PI * 2, a1 = ((i + 1) / panels) * Math.PI * 2;
        const x0 = cx + Math.cos(a0) * fx, y0 = cy + Math.sin(a0) * fy;
        const x1 = cx + Math.cos(a1) * fx, y1 = cy + Math.sin(a1) * fy;
        const len = Math.hypot(x1 - x0, y1 - y0) * S;
        const ang = Math.atan2(y1 - y0, x1 - x0);
        parts.push(A.place(A.fencePanel(th, rnd, len), (x0 + x1) / 2 * S, GROUND_Y, (y0 + y1) / 2 * S, -ang));
      }
    }

    const group = new THREE.Group();
    if (parts.length) {
      const mesh = new THREE.Mesh(A.merge(parts), A.vcMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (glowSpots.length) {
      const mat = new THREE.SpriteMaterial({ map: A.glowSprite(), color: th.glow ? '#ffe9a8' : '#ffd08a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      for (const p of glowSpots) {
        const s = new THREE.Sprite(mat);
        s.position.copy(p);
        s.scale.set(3.2, 3.2, 1);
        group.add(s);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6d0', toneMapped: false }));
        bulb.position.copy(p).y -= 0.1;
        group.add(bulb);
      }
    }
    return group;
  }

  /** Somewhere beside the tee, off the carpet, for the hole sign. */
  /**
   * Which way the hole sets off from the tee: the same route-following
   * direction the opening aim uses, so the tee mat and the sign line up with
   * the lane on a dogleg instead of pointing at a cup behind a wall.
   */
  function teeDirection(ch) {
    const P = MG.physics;
    if (P && P.smartAim) {
      try { return P.smartAim(ch, { x: ch.start.x, y: ch.start.y }); } catch (e) { /* fall through */ }
    }
    return Math.atan2(ch.cup.y - ch.start.y, ch.cup.x - ch.start.x);
  }

  function signSpot(ch) {
    const ang = teeDirection(ch);
    for (const side of [1, -1]) {
      const px = -Math.sin(ang) * side, py = Math.cos(ang) * side;
      for (let d = 40; d < 600; d += 15) {
        const x = ch.start.x + px * d - Math.cos(ang) * 30, y = ch.start.y + py * d - Math.sin(ang) * 30;
        if (!insideAny(ch, x, y, RAIL_W + 26)) return { x, y, face: Math.atan2(ch.start.y - y, ch.start.x - x) };
      }
    }
    // Fall back to behind the tee.
    for (let d = 40; d < 800; d += 15) {
      const x = ch.start.x - Math.cos(ang) * d, y = ch.start.y - Math.sin(ang) * d;
      if (!insideAny(ch, x, y, RAIL_W + 26)) return { x, y, face: ang };
    }
    return { x: ch.start.x, y: ch.start.y - 200, face: 0 };
  }

  /* ── The hole ─────────────────────────────────────────────────────────── */

  /**
   * Build everything for one hole. Returns a HoleView:
   *   group, ch, th, surfaceY(x,y), toWorld(x,y,lift), update(dt, worldT),
   *   pulseBumper(i), shakeBush(i), setFlagLift(0..1), dispose()
   */
  function buildHole(ch, holeNumber, themeName, opts) {
    opts = opts || {};
    const th = A.theme(themeName);
    const group = new THREE.Group();
    group.name = 'hole';

    const frame = carpetFrame(ch);
    const paint = paintCarpet(ch, th, frame);
    const colorTex = A.tex(paint.color, { anisotropy: 8 });
    const roughTex = A.tex(paint.rough, { srgb: false });
    const carpetGeo = buildCarpetGeometry(ch, frame);
    const carpet = new THREE.Mesh(carpetGeo, carpetMaterial(colorTex, roughTex));
    carpet.receiveShadow = true;
    carpet.castShadow = ch.hills.length > 0;
    carpet.name = 'carpet';
    // Ice is the glossy part of the carpet (low roughness), so it needs the sky.
    if (ch.ice.length) reflect(carpet.material, 0.45);
    group.add(carpet);

    // Animated boost arrows.
    let boostMat = null;
    const mask = paintBoostMask(ch, frame);
    if (mask) {
      boostMat = new THREE.ShaderMaterial({
        vertexShader: BOOST_VS, fragmentShader: BOOST_FS, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        uniforms: {
          mask: { value: mask }, time: { value: 0 },
          base: { value: new THREE.Color(th.glow ? '#3a1050' : '#e8742a') },
          hot: { value: new THREE.Color(th.glow ? '#ff3df0' : '#ffe14a') }
        }
      });
      const ov = new THREE.Mesh(carpetGeo, boostMat);
      ov.position.y = 0.012;
      ov.renderOrder = 2;
      group.add(ov);
    }

    group.add(buildRails(ch, th));
    const walls = buildWalls(ch, th); if (walls) group.add(walls);
    const water = buildWater(ch, th, frame); if (water) group.add(water);
    const cup = buildCup(ch, th); group.add(cup);
    const bridges = buildBridges(ch, th); if (bridges) group.add(bridges);
    const bushes = buildBushes(ch, th); bushes.forEach(b => group.add(b));

    const bumpers = ch.bumpers.map((b) => {
      const m = A.makeBumper(b.radius * S, th);
      m.position.set(b.x * S, C.terrainHeight(ch, b.x, b.y) * S, b.y * S);
      m.userData.pulse = 0;
      group.add(m);
      return m;
    });

    const windmills = ch.windmills.map((wm) => {
      const m = A.makeWindmill(wm.box.hw * 2 * S, wm.box.hh * 2 * S, wm.gap * S, th);
      m.position.set(wm.box.cx * S, C.terrainHeight(ch, wm.box.cx, wm.box.cy) * S, wm.box.cy * S);
      m.rotation.y = -wm.box.angle * Math.PI / 180;
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(m);
      return { mesh: m, wm };
    });

    const tunnels = ch.tunnels.map((t) => {
      const a = A.makeTunnelMouth(t.radius * S, th, false);
      a.position.set(t.x1 * S, C.terrainHeight(ch, t.x1, t.y1) * S, t.y1 * S);
      // The arch faces the tee so it frames the hole from the usual approach.
      a.rotation.y = -Math.atan2(t.y1 - ch.start.y, t.x1 - ch.start.x) + Math.PI / 2;
      const b = A.makeTunnelMouth(t.radius * S, th, true);
      b.position.set(t.x2 * S, C.terrainHeight(ch, t.x2, t.y2) * S, t.y2 * S);
      b.rotation.y = -t.exitAngle * Math.PI / 180;   // spout points the way the ball comes out
      group.add(a, b);
      return { a, b };
    });

    // Flag, sign and the scenery around it all.
    const flag = A.makeFlag(holeNumber, th);
    flag.position.copy(cup.position);
    group.add(flag);

    const ss = signSpot(ch);
    const sign = A.makeSign(holeNumber, ch.par, ch.name, th);
    sign.position.set(ss.x * S, GROUND_Y, ss.y * S);
    sign.rotation.y = -ss.face + Math.PI / 2;
    group.add(sign);

    if (!opts.noScenery) group.add(buildSurroundings(ch, th, ss));

    // Cup glow at night so the target is never lost in the dark.
    if (th.glow) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowSprite(), color: th.neon[2], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
      s.position.copy(cup.position).y += 0.4;
      s.scale.set(ch.cup.r * S * 6, ch.cup.r * S * 6, 1);
      group.add(s);
    }

    const bb = ch.fairway.bbox;
    const centre = { x: (bb.x0 + bb.x1) / 2 * S, z: (bb.y0 + bb.y1) / 2 * S };
    const radius = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * S * 0.62 + 12;

    let flagLift = 0, flagLiftTarget = 0;

    const view = {
      group, ch, th, holeNumber,
      cupWorld: cup.position.clone(),
      flag, sign, signSpot: ss,
      centre, radius,
      bushes, bumpers, windmills, tunnels,
      surfaceY(x, y) { return C.surfaceHeight(ch, x, y) * S; },
      toWorld(x, y, lift, out) {
        out = out || new THREE.Vector3();
        return out.set(x * S, C.surfaceHeight(ch, x, y) * S + (lift || 0), y * S);
      },
      setFlagLift(v) { flagLiftTarget = v; },
      pulseBumper(i) { if (bumpers[i]) bumpers[i].userData.pulse = 1; },
      shakeBush(i) { if (bushes[i]) bushes[i].userData.shake = 1; },
      update(dt, t) {
        if (water) {
          water.userData.normalMap.offset.set(t * 0.018, t * 0.011);
        }
        if (boostMat) boostMat.uniforms.time.value = t;
        flag.userData.wave(t, 1);
        flagLift = U.damp(flagLift, flagLiftTarget, 5, dt);
        flag.position.y = cup.position.y + flagLift * 2.6;
        flag.rotation.z = flagLift * 0.5;
        flag.visible = flagLift < 0.98;
        for (const w of windmills) w.mesh.userData.sails.rotation.x = C.windmillSailAngle(w.wm, t);
        for (const b of bumpers) {
          if (b.userData.pulse > 0) {
            b.userData.pulse = Math.max(0, b.userData.pulse - dt * 3);
            const p = b.userData.pulse;
            b.scale.set(1 + p * 0.25, 1 - p * 0.15, 1 + p * 0.25);
            b.userData.cap.emissiveIntensity = 0.25 + p * 2.5;
          }
        }
        for (const b of bushes) {
          if (b.userData.shake > 0) {
            b.userData.shake = Math.max(0, b.userData.shake - dt * 1.6);
            const s = b.userData.shake;
            b.rotation.z = Math.sin(t * 38) * 0.08 * s;
            b.rotation.x = Math.cos(t * 31) * 0.06 * s;
            b.scale.setScalar(1 + s * 0.06);
          }
        }
      },
      dispose() {
        // Cached textures (art.js once()) are shared between holes; only the
        // per-hole canvases are released here.
        group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
        colorTex.dispose(); roughTex.dispose(); if (mask) mask.dispose();
      }
    };
    return view;
  }

  MG.scene = {
    RAIL_W, RAIL_H, GROUND_Y, CUP_DEPTH, WALL_H,
    initEnvironment, setTheme, updateEnvironment, fitShadows, buildHole, reflect,
    env
  };
})();
