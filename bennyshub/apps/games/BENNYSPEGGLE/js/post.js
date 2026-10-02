/**
 * Benny's P3GL — the picture pipeline.
 *
 * Scenes render in linear HDR into a half-float target (MSAA where the GPU
 * allows), then a bloom chain picks out everything brighter than white —
 * lit pegs, lanterns, neon, sparks — and a final pass adds the glow, the
 * mode's grade (vignette, a whisper of chromatic fringe in Hyper), ACES tone
 * mapping, sRGB encoding and dither. One full-screen triangle per pass.
 *
 * Quality 'high' | 'low' | 'off'. 'off' renders straight to the screen with
 * the renderer's own ACES (for very weak GPUs); the scenes look the same,
 * minus the glow.
 *
 *   P3.post.create(renderer) → post
 *   post.setSize(w, h, pixelRatio)
 *   post.setQuality(q)
 *   post.setGrade({ bloom, threshold, vignette, fringe, exposure, warmth, flash })
 *   post.render([{ scene, camera, clearColor? }, ...])     layers in order, depth cleared between
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};

  const VERT = `
    varying vec2 vUv;
    void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  // Soft-knee bright pass at half resolution.
  const BRIGHT = `
    uniform sampler2D tSrc; uniform float threshold; uniform float knee; uniform vec2 texel;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tSrc, vUv + texel * vec2(-0.5, -0.5)).rgb
             + texture2D(tSrc, vUv + texel * vec2( 0.5, -0.5)).rgb
             + texture2D(tSrc, vUv + texel * vec2(-0.5,  0.5)).rgb
             + texture2D(tSrc, vUv + texel * vec2( 0.5,  0.5)).rgb;
      c *= 0.25;
      float br = max(c.r, max(c.g, c.b));
      float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
      soft = soft * soft / (4.0 * knee + 1e-5);
      float contrib = max(soft, br - threshold) / max(br, 1e-5);
      gl_FragColor = vec4(min(c * contrib, vec3(24.0)), 1.0);
    }`;

  // 13-tap downsample (keeps fireflies from flickering).
  const DOWN = `
    uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
    void main() {
      vec2 t = texel;
      vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
      vec3 b = texture2D(tSrc, vUv + t * vec2( 0.0, -2.0)).rgb;
      vec3 c = texture2D(tSrc, vUv + t * vec2( 2.0, -2.0)).rgb;
      vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0,  0.0)).rgb;
      vec3 e = texture2D(tSrc, vUv).rgb;
      vec3 f = texture2D(tSrc, vUv + t * vec2( 2.0,  0.0)).rgb;
      vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0,  2.0)).rgb;
      vec3 h = texture2D(tSrc, vUv + t * vec2( 0.0,  2.0)).rgb;
      vec3 i = texture2D(tSrc, vUv + t * vec2( 2.0,  2.0)).rgb;
      vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
      vec3 k = texture2D(tSrc, vUv + t * vec2( 1.0, -1.0)).rgb;
      vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0,  1.0)).rgb;
      vec3 m = texture2D(tSrc, vUv + t * vec2( 1.0,  1.0)).rgb;
      vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
      gl_FragColor = vec4(o, 1.0);
    }`;

  // 9-tap tent upsample, added onto the next level up.
  const UP = `
    uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 texel; uniform float radius; varying vec2 vUv;
    void main() {
      vec2 t = texel * radius;
      vec3 s = texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb
             + texture2D(tSrc, vUv + vec2( 0.0, -t.y)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2( t.x, -t.y)).rgb
             + texture2D(tSrc, vUv + vec2(-t.x,  0.0)).rgb * 2.0
             + texture2D(tSrc, vUv).rgb * 4.0
             + texture2D(tSrc, vUv + vec2( t.x,  0.0)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2(-t.x,  t.y)).rgb
             + texture2D(tSrc, vUv + vec2( 0.0,  t.y)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2( t.x,  t.y)).rgb;
      gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s / 16.0, 1.0);
    }`;

  const COMPOSITE = `
    uniform sampler2D tScene; uniform sampler2D tBloom;
    uniform float bloom; uniform float exposure; uniform float vignette; uniform float fringe;
    uniform float warmth; uniform float flash; uniform vec3 flashColor; uniform float time; uniform vec2 res;
    varying vec2 vUv;
    vec3 aces(vec3 x) {
      // Stephen Hill's fit of the ACES RRT+ODT (the same curve three.js uses).
      const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      vec3 v = m1 * x;
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return clamp(m2 * (a / b), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      vec3 col;
      if (fringe > 0.0) {
        vec2 off = cc * fringe * 0.012;
        col = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);
      } else {
        col = texture2D(tScene, uv).rgb;
      }
      col += texture2D(tBloom, uv).rgb * bloom;
      col += flashColor * flash;
      col *= exposure;
      col *= vec3(1.0 + warmth * 0.06, 1.0, 1.0 - warmth * 0.06);
      col = aces(col);
      float v = smoothstep(0.85, 0.2, length(cc * vec2(res.x / res.y, 1.0)) * 0.9);
      col *= mix(1.0, v, vignette);
      col = toSRGB(col);
      col += (hash(uv * res) - 0.5) / 255.0;      // dither away banding in soft gradients
      gl_FragColor = vec4(col, 1.0);
    }`;

  function create(renderer) {
    const THREE = root.THREE;
    const isGL2 = renderer.capabilities.isWebGL2;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadScene = new THREE.Scene();
    const quad = new THREE.Mesh(tri, null);
    quad.frustumCulled = false;
    quadScene.add(quad);

    const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const mBright = mat(BRIGHT, { tSrc: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.5 }, texel: { value: new THREE.Vector2() } });
    const mDown = mat(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    const mUp = mat(UP, { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    const mComp = mat(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null },
      bloom: { value: 0.9 }, exposure: { value: 1.0 }, vignette: { value: 0.35 }, fringe: { value: 0 },
      warmth: { value: 0 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 1, 1) },
      time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }
    });

    const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    let sceneRT = null, levels = [], ups = [];
    let quality = 'high', W = 1, H = 1, PR = 1;
    const grade = { bloom: 0.9, threshold: 1.0, vignette: 0.35, fringe: 0, exposure: 1, warmth: 0, flash: 0 };

    function free() {
      if (sceneRT) sceneRT.dispose();
      levels.forEach(r => r.dispose()); ups.forEach(r => r.dispose());
      sceneRT = null; levels = []; ups = [];
    }

    function build() {
      free();
      if (quality === 'off') return;
      const w = Math.max(2, Math.floor(W * PR)), h = Math.max(2, Math.floor(H * PR));
      sceneRT = new THREE.WebGLRenderTarget(w, h, Object.assign({}, rtOpts, { depthBuffer: true, samples: (isGL2 && quality === 'high') ? 4 : 0 }));
      const n = quality === 'high' ? 5 : 3;
      let lw = Math.max(2, w >> 1), lh = Math.max(2, h >> 1);
      if (quality === 'low') { lw = Math.max(2, w >> 2); lh = Math.max(2, h >> 2); }
      for (let i = 0; i < n; i++) {
        levels.push(new THREE.WebGLRenderTarget(lw, lh, rtOpts));
        if (i > 0) ups.push(new THREE.WebGLRenderTarget(levels[i - 1].width, levels[i - 1].height, rtOpts));
        lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
      }
      mComp.uniforms.res.value.set(w, h);
    }

    function pass(material, target) {
      quad.material = material;
      renderer.setRenderTarget(target);
      renderer.render(quadScene, quadCam);
    }

    function renderLayers(layers, target) {
      renderer.setRenderTarget(target);
      renderer.autoClear = false;
      const first = layers[0];
      renderer.setClearColor(first && first.clearColor !== undefined ? first.clearColor : 0x000000, 1);
      renderer.clear(true, true, true);
      for (let i = 0; i < layers.length; i++) {
        if (i > 0) renderer.clearDepth();
        const L = layers[i];
        if (L.viewport) renderer.setViewport(L.viewport.x, L.viewport.y, L.viewport.w, L.viewport.h);
        renderer.render(L.scene, L.camera);
        if (L.viewport) renderer.setViewport(0, 0, W, H);
      }
    }

    const post = {
      setSize(w, h, pr) {
        W = w; H = h; PR = pr || renderer.getPixelRatio();
        build();
      },
      setQuality(q) {
        if (q === quality) return;
        quality = q;
        renderer.toneMapping = q === 'off' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        build();
      },
      get quality() { return quality; },
      setGrade(g) { Object.assign(grade, g); },
      get grade() { return grade; },
      render(layers, time) {
        if (quality === 'off' || !sceneRT) {
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderLayers(layers, null);
          return;
        }
        renderer.toneMapping = THREE.NoToneMapping;
        renderLayers(layers, sceneRT);
        // Bright pass into the first level.
        mBright.uniforms.tSrc.value = sceneRT.texture;
        mBright.uniforms.threshold.value = grade.threshold;
        mBright.uniforms.knee.value = Math.max(0.05, grade.threshold * 0.5);
        mBright.uniforms.texel.value.set(1 / sceneRT.width, 1 / sceneRT.height);
        pass(mBright, levels[0]);
        // Down the chain.
        for (let i = 1; i < levels.length; i++) {
          mDown.uniforms.tSrc.value = levels[i - 1].texture;
          mDown.uniforms.texel.value.set(1 / levels[i - 1].width, 1 / levels[i - 1].height);
          pass(mDown, levels[i]);
        }
        // Back up, adding each level onto the one above.
        let src = levels[levels.length - 1];
        for (let i = levels.length - 2; i >= 0; i--) {
          const dst = ups[i];
          mUp.uniforms.tSrc.value = src.texture;
          mUp.uniforms.tBase.value = levels[i].texture;
          mUp.uniforms.texel.value.set(1 / src.width, 1 / src.height);
          mUp.uniforms.radius.value = 1.0;
          pass(mUp, dst);
          src = dst;
        }
        const u = mComp.uniforms;
        u.tScene.value = sceneRT.texture;
        u.tBloom.value = src.texture;
        u.bloom.value = grade.bloom / levels.length * 1.6;
        u.exposure.value = grade.exposure;
        u.vignette.value = grade.vignette;
        u.fringe.value = grade.fringe;
        u.warmth.value = grade.warmth;
        u.flash.value = grade.flash;
        u.time.value = (time || 0) % 100;
        pass(mComp, null);
      },
      dispose() { free(); }
    };
    renderer.toneMapping = THREE.NoToneMapping;
    return post;
  }

  P3.post = { create };
})(typeof window !== 'undefined' ? window : globalThis);
