/**
 * Benny's P3GL — Cozy backdrops: Lantern Garden, Moonlit Lake, Snowglobe Hollow.
 *
 * Slow, warm, painterly 2.5D dioramas. Every world is built procedurally:
 * layered silhouettes (one merged mesh per depth band, drawn back to front)
 * shaded with a soft "pseudo-sphere" light model, rim light, atmospheric fog
 * and ground mist; GPU-animated particles (fireflies, petals, snow, bokeh)
 * that cost nothing on the CPU; instanced paper lanterns / string lights
 * drawn in the fragment shader; shader sky, water, mist, moon and aurora.
 *
 * Composition: everything knows where the board sits (uBoard, in NDC) and
 * calms down behind it. Props that must frame the board (lantern strings,
 * frame trees, the moon) are anchored to the screen in resize(), so wide
 * 16:9 puts the spectacle at the sides and tall phones put it above and
 * below the board.
 *
 * Draw order is pure painter's algorithm (renderOrder; depth test off), so
 * flat layers never z-fight on 16-bit depth buffers.
 *
 * Motion: nothing flashes. Time runs at 6% in reducedMotion (near-still),
 * the camera drift and pulse reactions switch off.
 *
 * Registers 'lantern-garden', 'moonlit-lake', 'snowglobe-hollow'.
 */
(function (root) {
  'use strict';

  const P3 = root.P3;
  if (!P3 || !P3.backdrops || typeof P3.backdrops.register !== 'function') return;

  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hashf = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /* ════════════════════════════════════════════════════════════════════════
   * Shared GLSL
   * ════════════════════════════════════════════════════════════════════════ */

  // Board rect in NDC (x0, y0, x1, y1); uCalm = how much to quieten behind it.
  const G_BOARD = `
    uniform vec4 uBoard; uniform float uCalm; uniform vec2 uRes;
    float boardMask(vec2 ndc) {
      vec2 lo = smoothstep(uBoard.xy - 0.05, uBoard.xy + 0.16, ndc);
      vec2 hi = 1.0 - smoothstep(uBoard.zw - 0.16, uBoard.zw + 0.05, ndc);
      return lo.x * lo.y * hi.x * hi.y;
    }`;

  // Sky gradient used by the dome and by water reflections.
  const G_SKY = `
    uniform vec3 uTop, uMid, uHor, uSunDir, uGlowCol;
    uniform float uMidH, uGlow;
    vec3 skyGrad(vec3 d) {
      float h = max(d.y, 0.0);
      vec3 c = mix(uHor, uMid, smoothstep(0.0, uMidH, h));
      c = mix(c, uTop, smoothstep(uMidH * 0.8, uMidH + 0.5, h));
      float sd = max(dot(d, uSunDir), 0.0);
      vec2 a2 = normalize(d.xz + vec2(1e-4)); vec2 s2 = normalize(uSunDir.xz + vec2(1e-4));
      float az = max(dot(a2, s2), 0.0);
      float hz = exp(-h * 9.0);
      c += uGlowCol * uGlow * (pow(sd, 6.0) * 0.5 + pow(sd, 60.0) * 0.55 + hz * az * az * az * 0.4);
      return c;
    }`;

  /* ── Lit silhouettes ──────────────────────────────────────────────────── */

  const SIL_VS = `
    attribute vec3 aCol; attribute vec2 aN; attribute vec4 aM;
    uniform float uTime, uSway;
  #ifdef MIRROR
    uniform float uWobble;
  #endif
    varying vec3 vCol; varying vec2 vN; varying vec4 vM; varying vec3 vW; varying float vD;
    void main() {
      vec3 p = position;
      float w = aM.x * uSway;
      p.x += w * (sin(uTime * 0.55 + p.x * 0.11 + p.z * 0.05 + aM.w * 6.283) * 0.7 + sin(uTime * 0.93 + p.y * 0.3) * 0.3);
      p.y += w * 0.25 * sin(uTime * 0.7 + p.x * 0.2 + aM.w * 3.0);
      vec4 wp = modelMatrix * vec4(p, 1.0);
  #ifdef MIRROR
      wp.x += sin(wp.y * 0.8 + uTime * 0.9 + wp.z * 0.03) * uWobble * min(1.0, -wp.y * 0.12);
  #endif
      vec4 mv = viewMatrix * wp;
      vW = wp.xyz; vD = -mv.z; vCol = aCol; vN = aN; vM = aM;
      gl_Position = projectionMatrix * mv;
    }`;

  const SIL_FS = `
    uniform vec3 uLightDir, uLightCol, uAmbTop, uAmbBot, uRimCol, uFogCol, uFogTop, uMistCol;
    uniform float uRim, uFogDen, uFogStart, uMistTop, uMistAmt, uEmis;
  #ifdef MIRROR
    uniform float uMirrorK;
  #endif
  #ifdef NLIGHTS
    uniform vec4 uPL[NLIGHTS]; uniform vec3 uPLC; uniform float uPLK;
  #endif
    varying vec3 vCol; varying vec2 vN; varying vec4 vM; varying vec3 vW; varying float vD;
    void main() {
      float r2 = min(dot(vN, vN), 1.0);
      vec3 n = vec3(vN, sqrt(1.0 - r2));
      float ndl = dot(n, uLightDir);
      vec3 amb = mix(uAmbBot, uAmbTop, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
      vec3 col = vCol * (amb + uLightCol * smoothstep(-0.35, 1.0, ndl));
      float edge = 1.0 - n.z; edge *= edge;
      float l2 = length(uLightDir.xy);
      float side = clamp(dot(normalize(vN + vec2(1e-5)), uLightDir.xy / max(l2, 1e-4)) * 0.75 + 0.25, 0.0, 1.0);
      col += uRimCol * edge * side * side * uRim * vM.z;
  #ifdef NLIGHTS
      vec3 pl = vec3(0.0);
      for (int i = 0; i < NLIGHTS; i++) {
        vec3 dl = uPL[i].xyz - vW;
        float d2 = dot(dl, dl) / (uPL[i].w * uPL[i].w);
        float att = max(0.0, 1.0 - d2) / (1.0 + d2 * 8.0);
        pl += vec3(att * clamp(dot(n, normalize(dl)) * 0.6 + 0.5, 0.0, 1.0));
      }
      col += (vCol + 0.04) * uPLC * pl * uPLK;
  #endif
      col = mix(col, vCol * uEmis, vM.y);
      float f = 1.0 - exp(-max(vD - uFogStart, 0.0) * uFogDen);
      float elev = (vW.y - cameraPosition.y) / max(vD, 1.0);
      vec3 fogc = mix(uFogCol, uFogTop, smoothstep(0.02, 0.3, elev));
      float keep = 1.0 - vM.y * 0.6;
      col = mix(col, fogc, f * keep);
      float mist = (1.0 - smoothstep(0.0, uMistTop, abs(vW.y))) * uMistAmt * smoothstep(12.0, 90.0, vD);
      col = mix(col, uMistCol, clamp(mist, 0.0, 1.0) * keep);
  #ifdef MIRROR
      col *= uMirrorK;
  #endif
      gl_FragColor = vec4(col, 1.0);
    }`;

  /* ── Sky dome ─────────────────────────────────────────────────────────── */

  const SKY_VS = `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const SKY_FS = `
    uniform vec3 uLow, uSunCol, uCloudLit, uCloudDark, uMoonDir, uMoonCut, uMoonCol;
    uniform float uSunDisc, uSunSize, uCloud, uCloudOff, uReflK, uMoonAmt, uMoonSize, uTime, uBand;
    uniform sampler2D uNoise;
    ${G_BOARD}
    ${G_SKY}
    varying vec3 vP;
    void main() {
      vec3 d = normalize(vP);
      float below = step(d.y, 0.0);
      vec3 dd = vec3(d.x, abs(d.y), d.z);
      vec3 c = skyGrad(dd);
      float m = boardMask(gl_FragCoord.xy / uRes * 2.0 - 1.0) * uCalm;
      c += uSunCol * uSunDisc * smoothstep(cos(uSunSize * 1.25), cos(uSunSize), dot(dd, uSunDir));
  #ifdef BAND
      // a faint milky band across the sky
      vec2 bp = vec2(atan(dd.x, -dd.z) * 0.9, dd.y);
      float bandY = 0.42 + 0.22 * bp.x;
      float bd = exp(-pow((dd.y - bandY) * 4.5, 2.0));
      float bn = texture2D(uNoise, bp * vec2(0.5, 1.6) + 0.2).r * 0.6 + texture2D(uNoise, bp * vec2(1.3, 3.1) + 0.7).b * 0.4;
      c += uMid * bd * smoothstep(0.35, 0.8, bn) * uBand * (1.0 - 0.5 * m);
  #endif
  #ifdef CLOUDS
      if (uCloud > 0.001) {
        float hh = dd.y;
        vec2 uv = vec2(dd.x, dd.z) / (hh + 0.1);
        uv = vec2(uv.x * 0.045, uv.y * 0.11) + vec2(uCloudOff + uTime * 0.0012, uCloudOff * 0.37);
        float n = texture2D(uNoise, uv).r * 0.5 + texture2D(uNoise, uv * 2.1 + vec2(0.37, 0.11)).g * 0.32 + texture2D(uNoise, uv * 4.3 + vec2(0.71, 0.53)).b * 0.18;
        float band = smoothstep(0.02, 0.09, hh) * (1.0 - smoothstep(0.22, 0.55, hh));
        float cov = smoothstep(0.5, 0.66, n) * band;
        float sd = max(dot(dd, uSunDir), 0.0);
        float lit = clamp(0.2 + pow(sd, 3.0) * 0.9 + (0.6 - n) * 1.6, 0.0, 1.0);
        vec3 cc = mix(uCloudDark, uCloudLit, lit);
        c = mix(c, cc, cov * uCloud * (1.0 - 0.4 * m));
      }
  #endif
  #ifdef MOON2D
      float md = dot(dd, uMoonDir);
      float disc = smoothstep(cos(uMoonSize * 1.1), cos(uMoonSize), md);
      float cut = smoothstep(cos(uMoonSize * 1.1), cos(uMoonSize), dot(dd, uMoonCut));
      c += uMoonCol * uMoonAmt * (disc * (1.0 - cut) * 1.6 + pow(max(md, 0.0), 2500.0) * 0.25 + pow(max(md, 0.0), 160.0) * 0.06);
  #endif
  #ifdef REFLECT
      c = mix(c, c * uReflK, below);
  #else
      c = mix(c, uLow, below * smoothstep(0.0, 0.05, abs(d.y)));
  #endif
      gl_FragColor = vec4(c, 1.0);
    }`;

  /* ── GPU particles ────────────────────────────────────────────────────── */

  const PART_VS = `
    attribute vec4 aR;
    uniform float uTime, uScale, uSize, uSizeVar, uDensity, uOpacity, uBoost, uPR, uCalmK, uSway, uSwirl, uLife;
    uniform vec3 uCenter, uBox, uVel, uColA, uColB;
  #ifdef M_SMOKE
    uniform vec4 uEmit[4];
  #endif
    ${G_BOARD}
    varying vec3 vC; varying float vA; varying float vRot; varying float vPx;
    void main() {
      vec3 p = position;
      float t = uTime;
      float a = 1.0;
      float sz = uSize * mix(1.0 - uSizeVar, 1.0, aR.y);
      vC = mix(uColA, uColB, aR.z);
      vRot = 0.0;
  #if defined(M_FIREFLY)
      p *= uBox;
      p += vec3(sin(t * (0.11 + aR.x * 0.14) + aR.y * 6.283) * 2.6, sin(t * (0.09 + aR.y * 0.12) + aR.z * 6.283) * 1.1, cos(t * (0.07 + aR.z * 0.1) + aR.x * 6.283) * 2.6);
      float bl = 0.5 + 0.5 * sin(t * (0.32 + aR.x * 0.45) + aR.w * 37.0);
      a = (0.1 + 0.9 * bl * bl * bl) * (1.0 + uBoost);
  #elif defined(M_FALL)
      vec3 q = p + uVel * t * (0.65 + 0.7 * aR.x) / uBox;
      q = fract(q + 0.5) - 0.5;
      a = smoothstep(0.5, 0.4, abs(q.y)) * smoothstep(0.5, 0.44, abs(q.x)) * smoothstep(0.5, 0.44, abs(q.z));
      p = q * uBox;
      p.x += sin(t * (0.3 + aR.y * 0.35) + aR.z * 6.283) * uSway;
      p.z += cos(t * (0.27 + aR.x * 0.3) + aR.y * 6.283) * uSway * 0.6;
      if (uSwirl > 0.001) {
        float ang = uSwirl * (1.6 + aR.x * 1.4);
        float cs = cos(ang), sn = sin(ang);
        p.xy = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y * 0.6);
        p.y += uSwirl * (2.0 + aR.y * 4.0);
        a *= 1.0 + uSwirl * 0.6;
      }
      vRot = t * (aR.w - 0.5) * 1.4 + aR.x * 6.283;
  #elif defined(M_FLOAT)
      p *= uBox;
      p += vec3(sin(t * (0.05 + aR.x * 0.05) + aR.y * 6.283) * 2.0, sin(t * (0.04 + aR.y * 0.05) + aR.z * 6.283) * 1.4, 0.0);
      a = 0.6 + 0.4 * sin(t * (0.1 + aR.x * 0.16) + aR.w * 20.0);
  #elif defined(M_STAR)
      a = 0.72 + 0.28 * sin(t * (0.5 + aR.x * 1.2) + aR.w * 50.0);
      a *= smoothstep(0.02, 0.16, normalize(p).y);
  #elif defined(M_SMOKE)
      int ei = int(floor(aR.x * 3.999));
      vec4 E = uEmit[0];
      if (ei == 1) E = uEmit[1]; else if (ei == 2) E = uEmit[2]; else if (ei == 3) E = uEmit[3];
      float life = fract(t * uLife * (0.8 + aR.y * 0.4) + aR.z);
      p = E.xyz + vec3(uVel.x * life * life * 3.0 + sin(life * 5.0 + aR.w * 6.283) * 0.25 * life, life * uBox.y, uVel.z * life);
      sz *= 0.35 + life * 1.6;
      a = smoothstep(0.0, 0.12, life) * pow(1.0 - life, 1.6) * E.w;
  #endif
      float vis = step(aR.w, uDensity);
      vec4 mv = modelViewMatrix * vec4(p + uCenter, 1.0);
      gl_Position = projectionMatrix * mv;
  #ifdef M_STAR
      float px = sz * uPR;
  #else
      float px = sz * uScale / max(0.5, -mv.z);
  #endif
      a *= 1.0 - uCalm * uCalmK * boardMask(gl_Position.xy / gl_Position.w);
      a *= uOpacity * vis * clamp(px / 1.6, 0.0, 1.0);
      px = max(px, 1.6);
      gl_PointSize = px * vis;
      vA = a; vPx = px;
    }`;

  const PART_FS = `
    varying vec3 vC; varying float vA; varying float vRot; varying float vPx;
    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      float a;
      vec3 col = vC;
  #if defined(S_PETAL)
      float cs = cos(vRot), sn = sin(vRot);
      c = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
      vec2 e = vec2(c.x * 1.7, c.y + 0.25 * c.x * c.x * 1.7);
      float d = length(e);
      a = 1.0 - smoothstep(0.62, 0.62 + 3.0 / vPx, d);
      col *= 0.7 + 0.3 * (0.5 - 0.5 * c.y);
  #elif defined(S_BOKEH)
      float r = length(c);
      a = (1.0 - smoothstep(0.8, 1.0, r)) * (0.55 + 0.45 * smoothstep(0.3, 0.95, r));
  #elif defined(S_GLOW)
      float r = dot(c, c);
      a = (exp(-r * 14.0) * 1.4 + exp(-r * 3.5) * 0.22) * (1.0 - r);
  #else
      float r = dot(c, c);
      a = (1.0 - r) * (1.0 - r) * step(r, 1.0);
  #endif
      a *= vA;
      if (a < 0.003) discard;
  #ifdef ADD
      gl_FragColor = vec4(col * a, 0.0);
  #else
      gl_FragColor = vec4(col * a, a);
  #endif
    }`;

  /* ── Lanterns, string lights and soft halos (instanced, drawn in the shader) ── */
  // Style: 0 round paper lantern, 1 tall lantern, 2 bulb, 3 halo only, 4 sky lantern.

  const LANT_VS = `
    attribute vec4 iA; attribute vec4 iB; attribute vec3 iC; attribute vec2 iE;
    uniform float uTime, uSwing, uSway, uScale, uRise;
    ${G_BOARD}
    varying vec2 vP; varying vec3 vC; varying float vStyle; varying float vAA; varying float vFl; varying float vDrop; varying float vMask; varying float vFade;
    void main() {
      float s = iA.w, drop = iB.x, ph = iB.y, st = iB.z;
      float H = st > 2.5 ? 3.2 : st > 1.5 ? 3.4 : 2.6;
      vec2 lo = vec2(-H, -drop - H), hi = vec2(H, max(0.3, H - drop));
      vec2 lp = mix(lo, hi, position.xy * 0.5 + 0.5);
      float ang = (sin(uTime * (0.42 + fract(ph * 7.31) * 0.22) + ph * 6.283) * 0.8 + sin(uTime * 0.19 + ph * 3.1) * 0.2) * uSwing * iB.w;
      float cs = cos(ang), sn = sin(ang);
      vec2 rp = vec2(cs * lp.x - sn * lp.y, sn * lp.x + cs * lp.y);
      vec3 piv = iA.xyz;
      float w = iE.x * uSway;
      piv.x += w * (sin(uTime * 0.55 + piv.x * 0.11 + piv.z * 0.05 + iE.y * 6.283) * 0.7 + sin(uTime * 0.93 + piv.y * 0.3) * 0.3);
      piv.y += w * 0.25 * sin(uTime * 0.7 + piv.x * 0.2 + iE.y * 3.0);
      vFade = 1.0;
  #ifdef RISE
      float tt = uRise - fract(ph * 3.17) * 5.0;
      vFade = smoothstep(0.0, 1.5, tt) * (1.0 - smoothstep(13.0, 18.0, tt)) * step(0.0, uRise);
      tt = max(tt, 0.0);
      piv.y += tt * (1.1 + fract(ph * 5.3) * 0.9) + tt * tt * 0.015;
      piv.x += sin(tt * 0.35 + ph * 6.283) * 1.4;
  #endif
      vec4 mv = modelViewMatrix * vec4(piv, 1.0);
      mv.xy += rp * s * step(0.001, vFade);
      gl_Position = projectionMatrix * mv;
      vP = lp; vC = iC; vStyle = st; vDrop = drop;
      float ppu = s * uScale / max(0.5, -mv.z);
      vAA = 1.2 / max(ppu, 1.0);
      vFl = 1.0 + 0.045 * sin(uTime * 2.1 + ph * 17.0) + 0.03 * sin(uTime * 4.7 + ph * 29.0);
      vMask = boardMask(gl_Position.xy / gl_Position.w) * uCalm;
    }`;

  const LANT_FS = `
    uniform float uInt, uHalo; uniform vec3 uCapCol;
    varying vec2 vP; varying vec3 vC; varying float vStyle; varying float vAA; varying float vFl; varying float vDrop; varying float vMask; varying float vFade;
    void main() {
      vec2 q = vP - vec2(0.0, -vDrop);
      vec2 R = vStyle < 0.5 ? vec2(1.0, 0.84) : vStyle < 1.5 ? vec2(0.7, 1.12) : vStyle < 2.5 ? vec2(0.55, 0.7) : vec2(0.8, 1.0);
      vec2 e = q / R;
      float r = length(e);
      float aa = vAA * 1.4;
      float body;
      vec3 col;
      float inten = uInt * vFl * (1.0 - 0.45 * vMask);
      if (vStyle > 3.5) {
        // sky lantern: a trapezoid, wider at the top, glowing at the base
        float wdt = 0.55 + 0.22 * e.y;
        body = (1.0 - smoothstep(wdt - aa, wdt + aa, abs(e.x))) * (1.0 - smoothstep(1.0 - aa, 1.0 + aa, abs(e.y)));
        col = vC * inten * (0.7 + 1.2 * smoothstep(0.6, -1.0, e.y)) * (0.85 + 0.15 * cos(e.x * 9.0));
      } else if (vStyle > 2.5) {
        body = 0.0; col = vec3(0.0);
      } else {
        body = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
        float core = clamp(1.0 - r * r, 0.0, 1.0);
        float ribs = vStyle < 1.5 ? 0.5 + 0.5 * cos(e.y * 3.14159 * 7.0) : 1.0;
        col = vC * inten * (0.32 + 1.3 * core) * (0.84 + 0.16 * ribs);
        if (vStyle < 1.5) {
          float capW = vStyle < 0.5 ? 0.45 : 0.4;
          float capT = (1.0 - smoothstep(capW, capW + aa, abs(q.x))) * (1.0 - smoothstep(0.1, 0.1 + aa, abs(q.y - R.y * 0.95)));
          float capB = (1.0 - smoothstep(capW * 0.8, capW * 0.8 + aa, abs(q.x))) * (1.0 - smoothstep(0.09, 0.09 + aa, abs(q.y + R.y * 0.95)));
          float cap = max(capT, capB);
          col = mix(col, uCapCol, cap);
          body = max(body, cap);
          float tas = (1.0 - smoothstep(0.035, 0.035 + aa, abs(q.x))) * step(-R.y - 0.55, q.y) * step(q.y, -R.y);
          col = mix(col, uCapCol, tas * (1.0 - body));
          body = max(body, tas);
        } else {
          float sock = (1.0 - smoothstep(0.22, 0.22 + aa, abs(q.x))) * (1.0 - smoothstep(0.12, 0.12 + aa, abs(q.y - R.y * 0.92)));
          col = mix(col, uCapCol, sock);
          body = max(body, sock);
        }
      }
      // the cord from the pivot to the top of the body
      float cord = (1.0 - smoothstep(0.03, 0.03 + aa, abs(vP.x))) * step(R.y * 0.9, q.y) * step(vP.y, 0.0) * step(vStyle, 2.5);
      col = mix(col, uCapCol, cord * (1.0 - body));
      body = max(body, cord);
      float hr = length(q / max(R, vec2(0.5)));
      float H = vStyle > 2.5 ? 3.2 : vStyle > 1.5 ? 3.4 : 2.6;
      float halo = (exp(-hr * hr * 0.6) * 0.24 + exp(-hr * 1.2) * 0.14) * (1.0 - smoothstep(H * 0.55, H * 0.98, hr));
      vec3 hc = vC * inten * halo * uHalo;
      body *= vFade; hc *= vFade;
      gl_FragColor = vec4(col * body + hc * (1.0 - body), body);
    }`;

  /* ── Water ────────────────────────────────────────────────────────────── */

  const WATER_VS = `varying vec3 vW; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const WATER_FS = `
    uniform vec3 uDeep, uGlintCol, uGlintDir;
    uniform float uGlint, uRipple, uTime, uFresK, uGlintW;
    uniform sampler2D uNoise;
    ${G_BOARD}
  #ifdef POND
    uniform vec4 uPond;
    ${G_SKY}
  #endif
    varying vec3 vW;
    void main() {
      vec3 V = vW - cameraPosition; float dist = length(V); V /= dist;
      vec2 uv = vW.xz;
      float t = uTime;
      vec2 n1 = texture2D(uNoise, uv * vec2(0.018, 0.045) + vec2(t * 0.0035, t * 0.008)).rg - 0.5;
      vec2 n2 = texture2D(uNoise, uv * vec2(0.05, 0.11) + vec2(-t * 0.005, t * 0.012)).gb - 0.5;
      vec2 n3 = texture2D(uNoise, uv * vec2(0.14, 0.3) + vec2(t * 0.009, -t * 0.017)).ba - 0.5;
      float fade = 1.0 / (1.0 + dist * 0.01);
      vec2 sl = (n1 * 0.9 + n2 * 0.6 + n3 * 0.4) * uRipple * (0.3 + 0.7 * fade);
      vec3 N = normalize(vec3(sl.x, 1.0, sl.y));
      vec3 R = reflect(V, N);
      float cosv = max(dot(-V, N), 0.0);
      float F = clamp((0.03 + 0.97 * pow(1.0 - cosv, 5.0)) * uFresK, 0.0, 1.0);
      float g = max(dot(R, uGlintDir), 0.0);
      float spec = pow(g, 1600.0 * uGlintW) * 5.0 + pow(g, 260.0 * uGlintW) * 0.9 + pow(g, 34.0 * uGlintW) * 0.1;
      float m = boardMask(gl_FragCoord.xy / uRes * 2.0 - 1.0) * uCalm;
      vec3 gl = uGlintCol * spec * uGlint * (1.0 - 0.6 * m);
  #ifdef POND
      vec2 pe = (vW.xz - uPond.xy) / uPond.zw;
      float ang = atan(pe.y, pe.x);
      float edge = 1.0 + 0.07 * sin(ang * 3.0 + 1.3) + 0.04 * sin(ang * 7.0 + 0.4);
      float pr = length(pe);
      float a = 1.0 - smoothstep(edge - 0.03, edge, pr);
      vec3 refl = skyGrad(vec3(R.x, abs(R.y), R.z));
      vec3 col = mix(uDeep, refl, F) + gl;
      col *= mix(0.5, 1.0, smoothstep(edge, edge - 0.3, pr));
      gl_FragColor = vec4(col * a, a);
  #else
      float a = 1.0 - F;
      gl_FragColor = vec4(uDeep * a + gl, a);
  #endif
    }`;

  /* ── Mist ─────────────────────────────────────────────────────────────── */

  const MIST_VS = `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const MIST_FS = `
    uniform vec3 uMistC; uniform float uAmt, uTime, uSpeed, uSeed;
    uniform sampler2D uNoise;
    ${G_BOARD}
    varying vec2 vUv; varying vec3 vW;
    void main() {
      vec2 p = vec2(vW.x * 0.005 + uTime * uSpeed + uSeed, vUv.y * 0.3 + uSeed * 0.7);
      float n = texture2D(uNoise, p).r * 0.55 + texture2D(uNoise, p * vec2(2.7, 2.2) + vec2(uTime * uSpeed * 0.6, 0.31)).g * 0.3
              + texture2D(uNoise, p * vec2(6.1, 4.0) - vec2(uTime * uSpeed * 0.4, 0.0)).b * 0.15;
      float v = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
      float h = smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
      float a = smoothstep(0.3, 0.78, n) * v * h * uAmt;
      gl_FragColor = vec4(uMistC * a, a);
    }`;

  /* ── Moon ─────────────────────────────────────────────────────────────── */

  const MOON_VS = `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const MOON_FS = `
    uniform vec3 uCol, uL, uDark; uniform float uBright, uHalo, uQ;
    uniform sampler2D uNoise;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * uQ;
      float r = length(p);
      float disc = 1.0 - smoothstep(0.985, 1.015, r);
      vec3 n = vec3(p, sqrt(max(0.0, 1.0 - r * r)));
      float lit = smoothstep(-0.06, 0.1, dot(n, uL));
      float mar = texture2D(uNoise, p * 0.2 + vec2(0.31, 0.17)).a * 0.6 + texture2D(uNoise, p * 0.45 + vec2(0.7, 0.2)).b * 0.4;
      float tex = 0.78 + 0.22 * smoothstep(0.62, 0.38, mar);
      vec3 c = uCol * uBright * tex * (0.72 + 0.28 * n.z);
      c = mix(uDark, c, lit);
      float o = max(r - 1.0, 0.0);
      float halo = (exp(-o * 3.0) * 0.22 + exp(-o * 0.9) * 0.07) * (1.0 - smoothstep(uQ * 0.6, uQ, r));
      vec3 h = uCol * halo * uHalo;
      gl_FragColor = vec4(c * disc + h * (1.0 - disc), disc);
    }`;

  /* ── Shooting stars ───────────────────────────────────────────────────── */

  const STREAK_VS = `
    attribute vec3 aS;
    uniform vec4 uSA[4]; uniform vec4 uSB[4];
    varying float vAl; varying float vAc; varying float vFade;
    void main() {
      int i = int(aS.x + 0.5);
      vec4 A = uSA[0]; vec4 B = uSB[0];
      if (i == 1) { A = uSA[1]; B = uSB[1]; } else if (i == 2) { A = uSA[2]; B = uSB[2]; } else if (i == 3) { A = uSA[3]; B = uSB[3]; }
      float prog = A.w;
      float on = step(0.0, prog) * step(prog, 1.0);
      float pr = clamp(prog, 0.0, 1.0);
      vec3 head = A.xyz + B.xyz * pr * 220.0;
      float len = B.w * smoothstep(0.0, 0.25, pr);
      vec3 p = head - B.xyz * len * aS.y;
      vec2 perp = normalize(vec2(-B.y, B.x));
      p.xy += perp * aS.z * (0.5 + 0.9 * (1.0 - aS.y)) * on;
      vAl = aS.y; vAc = aS.z; vFade = sin(pr * 3.14159) * on;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const STREAK_FS = `
    uniform vec3 uCol;
    varying float vAl; varying float vAc; varying float vFade;
    void main() {
      float a = pow(1.0 - vAl, 2.2) * (1.0 - vAc * vAc) * vFade;
      gl_FragColor = vec4(uCol * a, 0.0);
    }`;

  /* ── Aurora ───────────────────────────────────────────────────────────── */

  const AURORA_VS = `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec3 p = position;
      p.x += sin(uv.x * 14.0 + uTime * 0.05) * 7.0 * uv.y;
      p.y += sin(uv.x * 9.0 - uTime * 0.04) * 6.0;
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const AURORA_FS = `
    uniform vec3 uColA, uColB; uniform float uStr, uTime, uSeed;
    uniform sampler2D uNoise;
    ${G_BOARD}
    varying vec2 vUv;
    void main() {
      float u = vUv.x, v = vUv.y;
      float rays = texture2D(uNoise, vec2(u * 2.6 + uTime * 0.0035 + uSeed, 0.13)).b * 0.55 + texture2D(uNoise, vec2(u * 6.5 - uTime * 0.005, 0.61 + uSeed)).b * 0.45;
      float body = texture2D(uNoise, vec2(u * 1.1 + uTime * 0.0018 + uSeed, 0.37)).r;
      float base = smoothstep(0.0, 0.08, v) * exp(-v * 2.4);
      float a = base * (0.3 + 1.1 * smoothstep(0.38, 0.78, rays)) * smoothstep(0.32, 0.68, body + 0.12);
      a *= smoothstep(0.0, 0.14, u) * (1.0 - smoothstep(0.86, 1.0, u));
      float m = boardMask(gl_FragCoord.xy / uRes * 2.0 - 1.0) * uCalm;
      vec3 col = mix(uColA, uColB, smoothstep(0.06, 0.7, v)) * a * uStr * (1.0 - 0.6 * m);
      gl_FragColor = vec4(col, 0.0);
    }`;

  /* ════════════════════════════════════════════════════════════════════════
   * Noise texture (tileable value noise, 4 independent channels/octaves)
   * ════════════════════════════════════════════════════════════════════════ */

  const NOISE_CACHE = {};
  function noiseData(N) {
    if (NOISE_CACHE[N]) return NOISE_CACHE[N];
    const data = new Uint8Array(N * N * 4);
    const freqs = [8, 16, 32, 8];
    for (let ch = 0; ch < 4; ch++) {
      const f = freqs[ch], rnd = P3.util.mulberry32(9127 + ch * 7919);
      const lat = new Float32Array(f * f);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      const cell = N / f;
      for (let y = 0; y < N; y++) {
        const gy = y / cell, iy = Math.floor(gy), fy = gy - iy, sy = fy * fy * (3 - 2 * fy);
        const r0 = (iy % f) * f, r1 = ((iy + 1) % f) * f;
        for (let x = 0; x < N; x++) {
          const gx = x / cell, ix = Math.floor(gx), fx = gx - ix, sx = fx * fx * (3 - 2 * fx);
          const c0 = ix % f, c1 = (ix + 1) % f;
          const a = lat[r0 + c0], b = lat[r0 + c1], c = lat[r1 + c0], d = lat[r1 + c1];
          data[(y * N + x) * 4 + ch] = (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 255;
        }
      }
    }
    return (NOISE_CACHE[N] = data);
  }

  /* ════════════════════════════════════════════════════════════════════════
   * Silhouette builder: blobs, ridges, polygons, ribbons → one geometry
   * ════════════════════════════════════════════════════════════════════════ */

  function Sil(THREE, camZ, q) {
    this.T = THREE; this.camZ = camZ; this.q = q || 1;
    this.p = []; this.c = []; this.n = []; this.m = []; this.i = [];
    this.sw = 0; this.em = 0; this.rm = 1; this.rn = 0;
  }
  Sil.prototype = {
    st(sw, em, rm) { this.sw = sw || 0; this.em = em || 0; this.rm = rm === undefined ? 1 : rm; return this; },
    v(x, y, z, c, nx, ny, sw) {
      this.p.push(x, y, z); this.c.push(c.r, c.g, c.b); this.n.push(nx, ny);
      this.m.push(sw === undefined ? this.sw : sw, this.em, this.rm, this.rn);
      return this.p.length / 3 - 1;
    },
    seg(r, z) { const d = Math.max(6, this.camZ - z); return clamp(Math.round((7 + (r / d) * 420) * this.q), 7, 30); },
    blob(x, y, z, rx, ry, c, sw) {
      const s = this.seg(Math.max(rx, ry), z);
      const ctr = this.v(x, y, z, c, 0, 0, sw);
      for (let k = 0; k < s; k++) { const a = (k / s) * TAU, ca = Math.cos(a), sa = Math.sin(a); this.v(x + ca * rx, y + sa * ry, z, c, ca, sa, sw); }
      for (let k = 0; k < s; k++) this.i.push(ctr, ctr + 1 + k, ctr + 1 + ((k + 1) % s));
    },
    /** A horizontal disc (lily pads, stepping stones). */
    disc(x, y, z, rx, rz, c, notch) {
      const s = this.seg(Math.max(rx, rz) * 0.6, z);
      const ctr = this.v(x, y, z, c, 0, 0.3);
      const n0 = notch === undefined ? -1 : notch;
      let cnt = 0;
      for (let k = 0; k <= s; k++) {
        const a = (k / s) * TAU;
        if (n0 >= 0) { let da = Math.abs(((a - n0 + Math.PI * 3) % TAU) - Math.PI); if (da < 0.22) continue; }
        const ca = Math.cos(a), sa = Math.sin(a);
        this.v(x + ca * rx, y, z + sa * rz, c, ca * 0.55, 0.3 - sa * 0.5); cnt++;
      }
      for (let k = 0; k < cnt - 1; k++) this.i.push(ctr, ctr + 1 + k, ctr + 2 + k);
      if (n0 < 0) this.i.push(ctr, ctr + cnt, ctr + 1);
    },
    /** A ridge line [x0,y0,x1,y1,...] filled down to yBot, with a thin rim band. */
    ridge(pts, z, yBot, c, band, cBot) {
      const n = pts.length / 2, base = this.p.length / 3;
      for (let k = 0; k < n; k++) {
        const x = pts[2 * k], y = pts[2 * k + 1];
        const kp = Math.max(0, k - 1), kn = Math.min(n - 1, k + 1);
        let tx = pts[2 * kn] - pts[2 * kp], ty = pts[2 * kn + 1] - pts[2 * kp + 1];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        this.v(x, y, z, c, -ty * 0.97, tx * 0.97);
        this.v(x, y - band, z, c, -ty * 0.5, tx * 0.5);
        this.v(x, yBot, z, cBot || c, 0, -0.2);
      }
      for (let k = 0; k < n - 1; k++) {
        const a = base + k * 3, b = a + 3;
        this.i.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
      }
    },
    /** Any simple polygon [x0,y0,...]; nf(x,y) → [nx,ny] or constant. */
    poly(pts, z, c, nf) {
      const T = this.T, v2 = [], n = pts.length / 2;
      for (let k = 0; k < n; k++) v2.push(new T.Vector2(pts[2 * k], pts[2 * k + 1]));
      const tris = T.ShapeUtils.triangulateShape(v2, []);
      const base = this.p.length / 3;
      for (let k = 0; k < n; k++) {
        const N = typeof nf === 'function' ? nf(pts[2 * k], pts[2 * k + 1]) : (nf || [0, 0]);
        this.v(pts[2 * k], pts[2 * k + 1], z, c, N[0], N[1]);
      }
      for (const t of tris) this.i.push(base + t[0], base + t[1], base + t[2]);
    },
    quad(x0, y0, x1, y1, z, c, nb, nt) {
      nb = nb || [0, -0.2]; nt = nt || [0, 0.2];
      const a = this.v(x0, y0, z, c, nb[0] - 0.3, nb[1]), b = this.v(x1, y0, z, c, nb[0] + 0.3, nb[1]);
      const d = this.v(x1, y1, z, c, nt[0] + 0.3, nt[1]), e = this.v(x0, y1, z, c, nt[0] - 0.3, nt[1]);
      this.i.push(a, b, d, a, d, e);
    },
    tri(ax, ay, bx, by, cx, cy, z, c, na, nb, nc) {
      const a = this.v(ax, ay, z, c, na[0], na[1]), b = this.v(bx, by, z, c, nb[0], nb[1]), d = this.v(cx, cy, z, c, nc[0], nc[1]);
      this.i.push(a, b, d);
    },
    /** A tapered limb (trunk, branch) from (x0,y0) to (x1,y1) with cylinder shading. */
    limb(x0, y0, x1, y1, z, w0, w1, c, sw0, sw1) {
      let dx = x1 - x0, dy = y1 - y0; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const px = -dy, py = dx;
      const s0 = sw0 || 0, s1 = sw1 === undefined ? s0 : sw1;
      const a = this.v(x0 - px * w0, y0 - py * w0, z, c, -px * 0.8, -py * 0.8, s0), b = this.v(x0, y0, z, c, 0, 0, s0), d = this.v(x0 + px * w0, y0 + py * w0, z, c, px * 0.8, py * 0.8, s0);
      const e = this.v(x1 - px * w1, y1 - py * w1, z, c, -px * 0.8, -py * 0.8, s1), f = this.v(x1, y1, z, c, 0, 0, s1), g = this.v(x1 + px * w1, y1 + py * w1, z, c, px * 0.8, py * 0.8, s1);
      this.i.push(a, b, e, b, f, e, b, d, f, d, g, f);
    },
    /** A cluster of foliage blobs (sorted low → high so upper clumps overlap). */
    canopy(cx, cy, z, rx, ry, n, cD, cL, rnd, sway, opts) {
      opts = opts || {};
      const items = [];
      const minR = Math.min(rx, ry);
      for (let k = 0; k < n; k++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd());
        const x = cx + Math.cos(a) * r * rx * 0.82, y = cy + Math.sin(a) * r * ry * 0.78;
        const s = (opts.big || 0.42) * minR * (0.55 + 0.5 * (1 - r) + rnd() * 0.3);
        items.push(x, y, s, rnd());
      }
      const order = [];
      for (let k = 0; k < n; k++) order.push(k);
      order.sort((A, B) => items[A * 4 + 1] - items[B * 4 + 1]);
      const T = this.T, col = new T.Color();
      for (const k of order) {
        const x = items[k * 4], y = items[k * 4 + 1], s = items[k * 4 + 2], j = items[k * 4 + 3];
        const hf = clamp((y - (cy - ry)) / (2 * ry), 0, 1);
        col.copy(cD).lerp(cL, clamp(hf * 0.8 + j * 0.35 - 0.1, 0, 1));
        this.blob(x, y, z, s * (opts.sx || 1.08), s, col, sway * (0.4 + 0.6 * hf));
      }
    },
    build() {
      const T = this.T, g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
      g.setAttribute('aCol', new T.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aN', new T.Float32BufferAttribute(this.n, 2));
      g.setAttribute('aM', new T.Float32BufferAttribute(this.m, 4));
      g.setIndex(this.i);
      g.computeBoundingSphere();
      return g;
    }
  };

  /* ── Reusable silhouette props ────────────────────────────────────────── */

  function roundTree(b, x, y, z, h, cTrunk, cD, cL, rnd, sway, n) {
    const lean = (rnd() - 0.5) * h * 0.12;
    b.limb(x, y - 0.5, x + lean, y + h * 0.62, z, h * 0.045, h * 0.03, cTrunk, 0, sway * 0.2);
    b.canopy(x + lean, y + h * 0.66, z, h * 0.36, h * 0.3, n || 12, cD, cL, rnd, sway);
  }
  function cypress(b, x, y, z, h, w, cD, cL, rnd, sway) {
    const T = b.T, col = new T.Color();
    const k = 5;
    for (let i = 0; i < k; i++) {
      const f = i / (k - 1);
      col.copy(cD).lerp(cL, f * 0.6 + rnd() * 0.15);
      b.blob(x + (rnd() - 0.5) * w * 0.15, y + h * (0.22 + f * 0.6), z, w * (1 - f * 0.55) * 0.5, h * 0.24, col, sway * f);
    }
  }
  function pine(b, x, y, z, h, w, cD, cL, rnd, snow, sway) {
    const T = b.T, col = new T.Color(), sc = new T.Color();
    b.limb(x, y - 0.3, x, y + h * 0.2, z, w * 0.06, w * 0.05, cD, 0, 0);
    const tiers = h > 6 ? 5 : 4;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const ty = y + h * (0.12 + f * 0.7), th = h * (0.36 - f * 0.12), tw = w * 0.5 * (1 - f * 0.62);
      col.copy(cD).lerp(cL, f * 0.5 + rnd() * 0.12);
      const s = sway * (0.3 + f * 0.7);
      const ax = x, ay = ty + th;
      const pts = [x - tw, ty + th * 0.06, x - tw * 0.5, ty - th * 0.06, x, ty + th * 0.02, x + tw * 0.5, ty - th * 0.06, x + tw, ty + th * 0.06];
      const nrm = [[-0.85, -0.05], [-0.4, -0.45], [0, -0.55], [0.4, -0.45], [0.85, -0.05]];
      const apex = b.v(ax, ay, z, col, 0, 0.75, s);
      const first = b.p.length / 3;
      for (let k = 0; k < 5; k++) b.v(pts[2 * k], pts[2 * k + 1], z, col, nrm[k][0], nrm[k][1], s);
      for (let k = 0; k < 4; k++) b.i.push(apex, first + k, first + k + 1);
      if (snow) {
        sc.copy(snow).multiplyScalar(0.9 + rnd() * 0.15);
        const sy = ty + th * 0.42, sw2 = tw * 0.62;
        const sp = b.v(ax, ay + th * 0.02, z, sc, 0, 0.8, s);
        const s0 = b.p.length / 3;
        const wav = [[-1, 0.08], [-0.6, -0.12], [-0.25, 0.04], [0.15, -0.14], [0.55, 0.02], [1, -0.06]];
        for (let k = 0; k < wav.length; k++) b.v(x + wav[k][0] * sw2, sy + wav[k][1] * th, z, sc, wav[k][0] * 0.7, 0.35, s);
        for (let k = 0; k < wav.length - 1; k++) b.i.push(sp, s0 + k, s0 + k + 1);
      }
    }
  }
  function bush(b, x, y, z, w, h, n, cD, cL, rnd, sway) {
    b.canopy(x, y + h * 0.45, z, w * 0.5, h * 0.55, n, cD, cL, rnd, sway, { big: 0.55 });
  }
  function grass(b, x, y, z, h, n, c, rnd, sway, spread) {
    for (let k = 0; k < n; k++) {
      const bx = x + (rnd() - 0.5) * (spread || h * 0.8), hh = h * (0.55 + rnd() * 0.5), lean = (rnd() - 0.5) * hh * 0.5;
      const w = hh * 0.05;
      const a = b.v(bx - w, y, z, c, -0.6, -0.3, 0), bb = b.v(bx + w, y, z, c, 0.6, -0.3, 0), t = b.v(bx + lean, y + hh, z, c, 0, 0.7, sway);
      b.i.push(a, bb, t);
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
   * Kit: shared uniforms, camera rig, material factories, variant timelines
   * ════════════════════════════════════════════════════════════════════════ */

  function makeKit(ctx, o) {
    const THREE = ctx.THREE, H = ctx.helpers, cam = ctx.camera;
    const low = ctx.quality === 'low';
    const PREMUL = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
    const base = { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide };

    const NS = low ? 128 : 256;
    const noise = new THREE.DataTexture(noiseData(NS), NS, NS, THREE.RGBAFormat);
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    noise.magFilter = THREE.LinearFilter; noise.minFilter = THREE.LinearMipmapLinearFilter; noise.generateMipmaps = true;
    noise.needsUpdate = true;

    const U = {
      uTime: { value: 0 }, uBoard: { value: new THREE.Vector4(-0.5, -0.96, 0.5, 0.96) }, uCalm: { value: 1 },
      uRes: { value: new THREE.Vector2(1600, 900) }, uNoise: { value: noise }
    };
    const c3 = (hex) => new THREE.Color(hex || '#000000');
    const NL = 6;
    const L = {
      uLightDir: { value: new THREE.Vector3(0.5, 0.3, -0.6).normalize() }, uLightCol: { value: c3() }, uAmbTop: { value: c3() }, uAmbBot: { value: c3() },
      uRimCol: { value: c3() }, uRim: { value: 1 }, uFogCol: { value: c3() }, uFogTop: { value: c3() }, uFogDen: { value: 0.004 }, uFogStart: { value: 20 },
      uMistCol: { value: c3() }, uMistTop: { value: 4 }, uMistAmt: { value: 0 }, uEmis: { value: 2 }, uSway: { value: 0.1 },
      uPL: { value: Array.from({ length: NL }, () => new THREE.Vector4(0, -999, 0, 1)) }, uPLC: { value: c3('#ffb070') }, uPLK: { value: 0 },
      uMirrorK: { value: 0.6 }, uWobble: { value: 0.3 }
    };
    const S = {
      uTop: { value: c3() }, uMid: { value: c3() }, uHor: { value: c3() }, uLow: { value: c3() }, uMidH: { value: 0.3 },
      uSunDir: { value: new THREE.Vector3(0.3, 0.05, -1).normalize() }, uGlowCol: { value: c3() }, uGlow: { value: 1 },
      uSunCol: { value: c3() }, uSunDisc: { value: 0 }, uSunSize: { value: 0.035 }, uCloud: { value: 0 }, uCloudOff: { value: 0 },
      uCloudLit: { value: c3() }, uCloudDark: { value: c3() }, uReflK: { value: 0.7 }, uBand: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() }, uMoonCut: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
      uMoonCol: { value: c3() }, uMoonAmt: { value: 0 }, uMoonSize: { value: 0.02 }
    };

    cam.near = 1; cam.far = 2600;
    const camBase = new THREE.Vector3(0, o.camH, o.camZ);
    const look = new THREE.Vector3();
    const st = { w: 1600, h: 900, aspect: 16 / 9, tall: false, tanH: 0.364, hf: o.hWide, bx: 0.5, pr: 1 };

    const rig = {
      st,
      resize(w, h) {
        w = Math.max(1, w); h = Math.max(1, h);
        st.w = w; st.h = h; st.aspect = w / h; st.tall = st.aspect <= 1.18;
        H.fitCamera(cam, w, h, o.fov);
        st.hf = st.tall ? o.hTall : o.hWide;
        cam.setViewOffset(w, h, 0, h * (0.5 - st.hf), w, h);
        st.tanH = Math.tan((cam.fov * Math.PI) / 360);
        st.pr = (ctx.renderer && ctx.renderer.getPixelRatio && ctx.renderer.getPixelRatio()) || 1;
        U.uRes.value.set(w * st.pr, h * st.pr);
        let Lo = null;
        try { Lo = P3.layout && P3.layout.compute(w, h); } catch (e) { Lo = null; }
        const B = U.uBoard.value;
        if (Lo && Lo.board) {
          const b = Lo.board;
          B.set((b.x / w) * 2 - 1, 1 - ((b.y + b.h) / h) * 2, ((b.x + b.w) / w) * 2 - 1, 1 - (b.y / h) * 2);
        } else if (st.tall) B.set(-0.97, -0.37, 0.97, 0.6);
        else B.set(-0.5, -0.96, 0.5, 0.96);
        st.bx = Math.min(0.9, Math.max(Math.abs(B.x), Math.abs(B.z)));
        st.bTop = B.w; st.bBot = B.y;
        // pixels per world unit at depth 1 (for world-sized points / lanterns)
        partScale.value = (h * st.pr) / (2 * st.tanH);
        prU.value = st.pr;
      },
      halfW(d) { return st.tanH * st.aspect * d; },
      y(ndcY, d) { return o.camH + (ndcY - (1 - 2 * st.hf)) * st.tanH * d; },
      /** World point at NDC (x, y) and view depth d. */
      at(nx, ny, d, out) { return out.set(nx * st.tanH * st.aspect * d, o.camH + (ny - (1 - 2 * st.hf)) * st.tanH * d, o.camZ - d); },
      dir(nx, ny, out) { return out.set(nx * st.tanH * st.aspect, (ny - (1 - 2 * st.hf)) * st.tanH, -1).normalize(); },
      update(t, reduced) {
        let dx = 0, dy = 0, dz = 0;
        if (!reduced) {
          dx = Math.sin((t * TAU) / 47) * o.drift[0] + Math.sin((t * TAU) / 113 + 2.1) * o.drift[0] * 0.35;
          dy = Math.sin((t * TAU) / 59 + 1.3) * o.drift[1];
          dz = Math.sin((t * TAU) / 71 + 0.4) * o.drift[2];
        }
        cam.position.set(camBase.x + dx, camBase.y + dy, camBase.z + dz);
        look.set(camBase.x + dx * 0.4, camBase.y + dy * 0.4, camBase.z - 300);
        cam.lookAt(look);
      }
    };
    const partScale = { value: 1000 }, prU = { value: 1 };

    function mat(vs, fs, uniforms, extra) {
      return new THREE.ShaderMaterial(Object.assign({ vertexShader: vs, fragmentShader: fs, uniforms }, base, PREMUL, extra || {}));
    }

    const kit = {
      THREE, U, L, S, rig, low, PREMUL, partScale, camH: o.camH, camZ: o.camZ,
      sil(defines) {
        return new THREE.ShaderMaterial(Object.assign({ vertexShader: SIL_VS, fragmentShader: SIL_FS, uniforms: Object.assign({}, U, L), defines: defines || {} }, base));
      },
      builder(q) { return new Sil(THREE, o.camZ, (q || 1) * (low ? 0.6 : 1)); },
      mesh(geo, material, order, parent) {
        const m = new THREE.Mesh(geo, material); m.renderOrder = order; m.frustumCulled = false;
        (parent || ctx.scene).add(m); return m;
      },
      sky(defines) {
        const geo = new THREE.SphereGeometry(1200, low ? 32 : 48, low ? 16 : 32);
        const m = new THREE.Mesh(geo, mat(SKY_VS, SKY_FS, Object.assign({}, U, S), { side: THREE.BackSide, defines: defines || {}, blending: THREE.NoBlending }));
        m.renderOrder = 0; m.frustumCulled = false; ctx.scene.add(m);
        return m;
      },
      /** GPU particles. o: { count, mode: 'FIREFLY'|'FALL'|'FLOAT'|'STAR'|'SMOKE', shape: 'PETAL'|'BOKEH'|'GLOW'|null, add, box, center, ... } */
      particles(po) {
        const n = Math.max(1, Math.round(po.count * (low ? (po.lowK || 0.5) : 1)));
        const rnd = H.rng(po.seed || 7);
        const pos = new Float32Array(n * 3), r4 = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          if (po.mode === 'STAR') {
            const u = rnd(), y = 0.02 + Math.pow(u, 0.8) * 0.98, a = rnd() * TAU, rr = Math.sqrt(1 - y * y);
            pos[i * 3] = Math.cos(a) * rr * 1100; pos[i * 3 + 1] = y * 1100; pos[i * 3 + 2] = Math.sin(a) * rr * 1100;
          } else { pos[i * 3] = rnd() - 0.5; pos[i * 3 + 1] = rnd() - 0.5; pos[i * 3 + 2] = rnd() - 0.5; }
          r4[i * 4] = rnd(); r4[i * 4 + 1] = rnd(); r4[i * 4 + 2] = rnd(); r4[i * 4 + 3] = (i + rnd()) / n;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aR', new THREE.BufferAttribute(r4, 4));
        const defines = {}; defines['M_' + po.mode] = 1; if (po.shape) defines['S_' + po.shape] = 1; if (po.add) defines.ADD = 1;
        const uni = Object.assign({}, U, {
          uScale: partScale, uPR: prU,
          uSize: { value: po.size || 0.2 }, uSizeVar: { value: po.sizeVar === undefined ? 0.5 : po.sizeVar },
          uDensity: { value: po.density === undefined ? 1 : po.density }, uOpacity: { value: po.opacity === undefined ? 1 : po.opacity },
          uBoost: { value: 0 }, uCalmK: { value: po.calm === undefined ? 0.6 : po.calm }, uSway: { value: po.sway || 0 }, uSwirl: { value: 0 }, uLife: { value: po.life || 0.1 },
          uCenter: { value: new THREE.Vector3().fromArray(po.center || [0, 0, 0]) }, uBox: { value: new THREE.Vector3().fromArray(po.box || [10, 10, 10]) },
          uVel: { value: new THREE.Vector3().fromArray(po.vel || [0, 0, 0]) },
          uColA: { value: new THREE.Color(po.colA || '#ffffff').multiplyScalar(po.k || 1) }, uColB: { value: new THREE.Color(po.colB || po.colA || '#ffffff').multiplyScalar(po.k || 1) },
          uEmit: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }
        });
        const m = new THREE.Points(geo, mat(PART_VS, PART_FS, uni, { defines }));
        m.renderOrder = po.order || 50; m.frustumCulled = false;
        (po.parent || ctx.scene).add(m);
        return m;
      },
      /** Instanced lanterns / bulbs / halos. list: [{x,y,z,s,drop,ph,style,swing,col,ww,wr}] */
      lanterns(list, lo) {
        lo = lo || {};
        const n = Math.max(1, list.length);
        const geo = new THREE.InstancedBufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        const A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 3), E = new Float32Array(n * 2);
        const attrs = {
          iA: new THREE.InstancedBufferAttribute(A, 4), iB: new THREE.InstancedBufferAttribute(B, 4),
          iC: new THREE.InstancedBufferAttribute(C, 3), iE: new THREE.InstancedBufferAttribute(E, 2)
        };
        Object.keys(attrs).forEach(k => { attrs[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, attrs[k]); });
        geo.instanceCount = list.length;
        const uni = Object.assign({}, U, {
          uScale: partScale, uSwing: { value: lo.swing === undefined ? 0.06 : lo.swing }, uSway: lo.sway || L.uSway, uRise: { value: -1 },
          uInt: { value: lo.int || 2 }, uHalo: { value: lo.halo === undefined ? 1 : lo.halo }, uCapCol: { value: new THREE.Color(lo.cap || '#1a1014') }
        });
        const defines = lo.rise ? { RISE: 1 } : {};
        const m = new THREE.Mesh(geo, mat(LANT_VS, LANT_FS, uni, { defines }));
        m.renderOrder = lo.order || 60; m.frustumCulled = false;
        (lo.parent || ctx.scene).add(m);
        const api = {
          mesh: m, uniforms: uni, list,
          write() {
            for (let i = 0; i < list.length; i++) {
              const l = list[i];
              A[i * 4] = l.x; A[i * 4 + 1] = l.y; A[i * 4 + 2] = l.z; A[i * 4 + 3] = l.s;
              B[i * 4] = l.drop || 0; B[i * 4 + 1] = l.ph || 0; B[i * 4 + 2] = l.style || 0; B[i * 4 + 3] = l.swing === undefined ? 1 : l.swing;
              C[i * 3] = l.col.r; C[i * 3 + 1] = l.col.g; C[i * 3 + 2] = l.col.b;
              E[i * 2] = l.ww || 0; E[i * 2 + 1] = l.wr || 0;
            }
            Object.keys(attrs).forEach(k => { attrs[k].needsUpdate = true; });
          }
        };
        api.write();
        return api;
      },
      water(defines, extra) {
        const uni = Object.assign({}, U, S, {
          uDeep: { value: c3() }, uGlintCol: { value: c3() }, uGlintDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() },
          uGlint: { value: 1 }, uRipple: { value: 0.3 }, uFresK: { value: 1 }, uGlintW: { value: 1 }, uPond: { value: new THREE.Vector4(0, -60, 50, 30) }
        }, extra || {});
        return mat(WATER_VS, WATER_FS, uni, { defines: defines || {} });
      },
      mist(x0, x1, y0, y1, z, order, mo) {
        mo = mo || {};
        const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, 1, 1);
        geo.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
        const uni = Object.assign({}, U, { uMistC: mo.col || { value: c3('#888888') }, uAmt: mo.amt || { value: 0.5 }, uSpeed: { value: mo.speed || 0.004 }, uSeed: { value: mo.seed || 0 } });
        const m = new THREE.Mesh(geo, mat(MIST_VS, MIST_FS, uni));
        m.renderOrder = order; m.frustumCulled = false; (mo.parent || ctx.scene).add(m);
        return m;
      },
      moon(order) {
        const Q = 4.2;
        const geo = new THREE.PlaneGeometry(2, 2);
        const uni = Object.assign({}, U, { uCol: { value: c3('#dfe8ff') }, uL: { value: new THREE.Vector3(0, 0, 1) }, uDark: { value: c3('#0b1430') }, uBright: { value: 2 }, uHalo: { value: 1 }, uQ: { value: Q } });
        const m = new THREE.Mesh(geo, mat(MOON_VS, MOON_FS, uni));
        m.renderOrder = order; m.frustumCulled = false; ctx.scene.add(m);
        m.userData.Q = Q;
        return m;
      },
      streaks(order) {
        const pos = [], aS = [], idx = [];
        for (let s = 0; s < 4; s++) {
          const b0 = s * 4;
          [[0, -1], [0, 1], [1, -1], [1, 1]].forEach(([al, ac]) => { pos.push(0, 0, 0); aS.push(s, al, ac); });
          idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 3));
        geo.setIndex(idx);
        const uni = { uSA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, -1)) }, uSB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(1, 0, 0, 40)) }, uCol: { value: c3('#e8f0ff').multiplyScalar(2.2) } };
        const m = new THREE.Mesh(geo, mat(STREAK_VS, STREAK_FS, uni));
        m.renderOrder = order; m.frustumCulled = false; ctx.scene.add(m);
        const slots = [0, 1, 2, 3].map(() => ({ t: -1, dur: 2 }));
        return {
          mesh: m, uniforms: uni,
          fire(x, y, z, dx, dy, len, dur) {
            let k = slots.findIndex(s => s.t < 0);
            if (k < 0) return;
            slots[k].t = 0; slots[k].dur = dur || 2.4;
            const l = Math.hypot(dx, dy) || 1;
            uni.uSA.value[k].set(x, y, z, 0); uni.uSB.value[k].set(dx / l, dy / l, 0, len || 40);
          },
          update(dt) {
            let any = false;
            for (let k = 0; k < 4; k++) {
              const s = slots[k];
              if (s.t < 0) continue;
              s.t += dt / s.dur; any = true;
              if (s.t > 1) { s.t = -1; uni.uSA.value[k].w = -1; } else uni.uSA.value[k].w = s.t;
            }
            m.visible = any;
          }
        };
      },
      aurora(order, ao) {
        const segU = low ? 60 : 120, segV = 6;
        const pos = [], uv = [], idx = [];
        for (let i = 0; i <= segU; i++) {
          const u = i / segU;
          const x = (u - 0.5) * ao.width;
          const z = ao.z + Math.sin(u * 5.0 + ao.phase) * ao.bend;
          const y0 = ao.y + Math.sin(u * 3.3 + ao.phase * 2) * ao.wave;
          for (let j = 0; j <= segV; j++) { const v = j / segV; pos.push(x, y0 + v * ao.height, z - v * ao.height * 0.25); uv.push(u, v); }
        }
        for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
          const a = i * (segV + 1) + j, b = a + segV + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        const uni = Object.assign({}, U, { uColA: ao.colA, uColB: ao.colB, uStr: ao.str, uSeed: { value: ao.seed || 0 } });
        const m = new THREE.Mesh(geo, mat(AURORA_VS, AURORA_FS, uni));
        m.renderOrder = order; m.frustumCulled = false; ctx.scene.add(m);
        return m;
      },
      /**
       * Variant timeline. stops: positions 0..1; spec: { name: [value per stop] }
       * values are numbers, '#rrggbb' or '#rrggbb@k' (linear colour scaled by k), or arrays.
       */
      timeline(stops, spec) {
        const names = Object.keys(spec), idx = {}, conv = [];
        let size = 0;
        names.forEach(k => {
          const arr = spec[k];
          const vals = arr.map(v => {
            if (typeof v === 'string') { const parts = v.split('@'); const c = new THREE.Color(parts[0]); const s = parts[1] ? +parts[1] : 1; return [c.r * s, c.g * s, c.b * s]; }
            return Array.isArray(v) ? v : [v];
          });
          idx[k] = size; conv.push(vals); size += vals[0].length;
        });
        const cur = new Float32Array(size), tgt = new Float32Array(size);
        let first = true;
        const tl = {
          idx, cur, tgt,
          set(n) {
            const u = clamp(n, 0, 19) / 19;
            let i = 0; while (i < stops.length - 2 && u > stops[i + 1]) i++;
            const f = sstep(stops[i], stops[i + 1], u);
            names.forEach((k, j) => { const a = conv[j][i], b = conv[j][i + 1], o0 = idx[k]; for (let c = 0; c < a.length; c++) tgt[o0 + c] = a[c] + (b[c] - a[c]) * f; });
            if (first) { cur.set(tgt); first = false; }
          },
          step(dt) { const k = 1 - Math.exp(-dt / 1.1); for (let i = 0; i < size; i++) cur[i] += (tgt[i] - cur[i]) * k; },
          num(k) { return cur[idx[k]]; },
          col(k, out) { const o0 = idx[k]; return out.setRGB(cur[o0], cur[o0 + 1], cur[o0 + 2]); }
        };
        return tl;
      },
      /** Common per-frame clock: time slows to near-still in reducedMotion. */
      clock: { t: 0, real: 0 },
      tick(dt) {
        dt = clamp(dt || 0, 0, 0.1);
        kit.clock.real += dt;
        kit.clock.t += dt * (ctx.reducedMotion ? 0.06 : 1);
        U.uTime.value = kit.clock.t % 3600;
        rig.update(kit.clock.real, ctx.reducedMotion);
        return dt;
      }
    };
    return kit;
  }

  /** A smoothed scalar envelope: kick it, it eases back to zero. */
  function Env(tau) { this.v = 0; this.tau = tau; }
  Env.prototype.kick = function (a, max) { this.v = Math.min(max || 1, this.v + a); };
  Env.prototype.step = function (dt) { this.v *= Math.exp(-dt / this.tau); if (this.v < 1e-4) this.v = 0; return this.v; };

  /** Lantern rigs anchored to the screen: strings of lanterns (and bulbs) between two anchors. */
  function stringRig(kit, defs, ro) {
    const THREE = kit.THREE;
    const SEG = 22;
    // Wire geometry: SEG+1 points × 2 verts per string, rewritten on layout.
    const b = kit.builder();
    const wireCol = new THREE.Color(ro.wire || '#120c10');
    defs.forEach((d, si) => {
      b.rn = (si * 0.618) % 1;
      const base = b.p.length / 3;
      for (let k = 0; k <= SEG; k++) { const w = Math.sin((k / SEG) * Math.PI); b.v(0, 0, 0, wireCol, 0, 0.5, w); b.v(0, 0, 0, wireCol, 0, -0.5, w); }
      for (let k = 0; k < SEG; k++) { const a = base + k * 2; b.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    b.rn = 0;
    const geo = b.build();
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const wires = kit.mesh(geo, ro.material, ro.order, ro.parent);
    // Lantern list, generated once; positions rewritten on layout.
    const list = [];
    const rnd = P3.util.mulberry32(ro.seed || 1);
    defs.forEach((d, si) => {
      const n = d.n || 0;
      for (let k = 0; k < n; k++) {
        const t = clamp((k + 0.5) / n + (rnd() - 0.5) * 0.12 / n, 0.04, 0.96);
        const big = d.size || [0.5, 0.7];
        list.push({ si, t, x: 0, y: 0, z: 0, s: lerp(big[0], big[1], rnd()), drop: lerp(0.9, 1.9, rnd()), ph: rnd(), style: d.style !== undefined ? d.style : (rnd() < (d.tall || 0.25) ? 1 : 0), col: ro.pick(rnd, d), ww: 0, wr: (si * 0.618) % 1, swing: 1 });
        if (d.bulbs) {
          for (let j = 1; j <= d.bulbs; j++) {
            const tb = t + (j / (d.bulbs + 1)) / n;
            if (tb > 0.98) break;
            list.push({ si, t: tb, x: 0, y: 0, z: 0, s: d.bulbSize || 0.09, drop: 0.4, ph: rnd(), style: 2, col: ro.bulb(rnd), ww: 0, wr: (si * 0.618) % 1, swing: 0.3 });
          }
        }
      }
    });
    const lan = kit.lanterns(list, { order: ro.order + 1, parent: ro.parent, int: ro.int, cap: ro.cap, swing: ro.swing });
    const A = new THREE.Vector3(), Bv = new THREE.Vector3(), P = new THREE.Vector3();
    function point(d, t, out) {
      out.lerpVectors(A, Bv, t); out.y -= d.sag * 4 * t * (1 - t); return out;
    }
    return {
      wires, lan, list, defs,
      /** anchor(def, which, out): fills out with the world anchor. */
      layout(anchor) {
        const pos = geo.attributes.position.array;
        let vi = 0;
        defs.forEach((d, si) => {
          anchor(d, 0, A); anchor(d, 1, Bv);
          const wdt = d.wire || 0.035;
          for (let k = 0; k <= SEG; k++) {
            point(d, k / SEG, P);
            pos[vi++] = P.x; pos[vi++] = P.y + wdt; pos[vi++] = P.z;
            pos[vi++] = P.x; pos[vi++] = P.y - wdt; pos[vi++] = P.z;
          }
          for (const l of list) if (l.si === si) { point(d, l.t, P); l.x = P.x; l.y = P.y; l.z = P.z; l.ww = Math.sin(l.t * Math.PI); }
        });
        geo.attributes.position.needsUpdate = true;
        lan.write();
      },
      setVisible(v) { wires.visible = v; lan.mesh.visible = v; }
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 1. LANTERN GARDEN — golden hour → twilight → starry night
   * ════════════════════════════════════════════════════════════════════════ */

  P3.backdrops.register('lantern-garden', function (ctx) {
    const THREE = ctx.THREE, scene = ctx.scene, H = ctx.helpers, theme = ctx.theme;
    const RM = ctx.reducedMotion;
    const kit = makeKit(ctx, { camH: 5, camZ: 30, fov: 40, hWide: 0.6, hTall: 0.72, drift: [1.3, 0.45, 1.2] });
    const { U, L, S, rig, low } = kit;
    const rnd = H.rng(ctx.seed || 11);
    const C = (h, k) => H.color(THREE, h, k);
    const accent = C(theme.accent), accent2 = C(theme.accent2);

    // Sky
    kit.sky({ CLOUDS: low ? undefined : 1, MOON2D: 1 });
    const stars = kit.particles({ count: 420, mode: 'STAR', size: 2.2, sizeVar: 0.6, colA: '#fff4e0', colB: '#cfdcff', add: true, order: 1, calm: 0.7, seed: 3 });

    const silMat = kit.sil();
    const silLit = kit.sil({ NLIGHTS: 6 });

    /* Far band: two hazy ridges, a distant pagoda, treelines */
    const far = kit.builder(0.8);
    {
      const pts = [];
      for (let x = -950; x <= 950; x += 14) pts.push(x, 10 + 26 * Math.pow(Math.abs(Math.sin(x * 0.0042 + 1.1)), 1.5) + 9 * Math.sin(x * 0.013 + 0.4) + 4 * Math.sin(x * 0.037));
      far.ridge(pts, -560, -60, C('#6d4a6a'), 2.2);
      // pagoda on the left hill
      const px = -335, py = 30;
      const pc = C('#4a3350');
      for (let k = 0; k < 4; k++) {
        const y0 = py + k * 10, w = 13 - k * 2.4;
        far.quad(px - w * 0.55, y0, px + w * 0.55, y0 + 7, -559, pc);
        far.poly([px - w * 1.15, y0 + 7.8, px - w * 0.7, y0 + 6.4, px + w * 0.7, y0 + 6.4, px + w * 1.15, y0 + 7.8, px + w * 0.5, y0 + 10, px - w * 0.5, y0 + 10], -558.5, pc, [0, 0.5]);
      }
      far.limb(px, py + 40, px, py + 52, -558, 0.8, 0.2, pc);
      const pts2 = [];
      for (let x = -800; x <= 800; x += 10) pts2.push(x, 3 + 9 * Math.sin(x * 0.009 + 2.0) + 5 * Math.sin(x * 0.023 + 0.7));
      far.ridge(pts2, -400, -60, C('#4e3656'), 1.6);
      const tc = C('#3e2c4c'), tl = C('#5a3e62');
      for (let x = -780; x <= 780; x += 7 + rnd() * 9) {
        const hw = 0.647 * 430;
        if (Math.abs(x) < hw * 0.3 && rnd() < 0.7) continue;
        const gy = 3 + 9 * Math.sin(x * 0.009 + 2.0) + 5 * Math.sin(x * 0.023 + 0.7);
        const s = 5 + rnd() * 8;
        if (rnd() < 0.3) cypress(far, x, gy - 1, -399, s * 2.4, s * 0.9, tc, tl, rnd, 0);
        else far.canopy(x, gy + s * 0.5, -399, s, s * 0.8, 4, tc, tl, rnd, 0);
      }
    }
    kit.mesh(far.build(), silMat, 2);

    // A far mist band between the ridges and the garden
    const mistCol = { value: C('#a07080') }, mistAmt = { value: 0.5 };
    kit.mist(-700, 700, -10, 34, -300, 3, { col: mistCol, amt: mistAmt, speed: 0.0025, seed: 0.3 });

    /* Mid band: ground, a low hill with trees, hedges, the pavilion */
    const mid = kit.builder();
    {
      // ground plane (fog gives it a natural gradient)
      const gc = C('#2c2a36');
      const a = mid.v(-900, 0, -260, gc, 0, 0.35), b2 = mid.v(900, 0, -260, gc, 0, 0.35), c2 = mid.v(900, 0, 40, gc, 0, 0.35), d2 = mid.v(-900, 0, 40, gc, 0, 0.35);
      mid.i.push(a, b2, c2, a, c2, d2);
      const pts = [];
      for (let x = -520; x <= 520; x += 8) pts.push(x, Math.max(0, 4 + 6 * Math.sin(x * 0.012 + 0.3) + 3 * Math.sin(x * 0.031)));
      mid.ridge(pts, -235, 0, C('#33283f'), 1.0);
      const tD = C('#2a2238'), tL = C('#4c3a52'), trunkC = C('#24181e');
      const items = [];
      for (let k = 0; k < 70; k++) {
        const z = -225 + rnd() * 90, d = 30 - z, hw = 0.647 * d;
        let x = (rnd() - 0.5) * 2 * hw * 1.6;
        if (Math.abs(x) < hw * 0.42) x = Math.sign(x || 1) * (hw * 0.42 + rnd() * hw * 0.5);
        items.push({ z, x, kind: rnd() < 0.35 ? 'c' : 't', s: 6 + rnd() * 9 });
      }
      // hedges behind the board centre: low, calm
      for (let x = -160; x <= 160; x += 7 + rnd() * 5) items.push({ z: -150 - rnd() * 20, x, kind: 'h', s: 3 + rnd() * 2 });
      items.sort((p, q) => p.z - q.z);
      for (const it of items) {
        if (it.kind === 't') roundTree(mid, it.x, 0, it.z, it.s * 1.6, trunkC, tD, tL, rnd, 0.05, 10);
        else if (it.kind === 'c') cypress(mid, it.x, 0, it.z, it.s * 2.2, it.s * 0.7, tD, tL, rnd, 0.03);
        else bush(mid, it.x, 0, it.z, it.s * 2.4, it.s, 5, C('#2a2a3a'), C('#3e3a4a'), rnd, 0.02);
      }
      // pavilion on the right
      const pc = C('#2a1c22'), roofC = C('#3a2630');
      const px = 82, pz = -130;
      mid.quad(px - 9, 0, px + 9, 1.2, pz, pc);
      for (const ox of [-7.5, -2.5, 2.5, 7.5]) mid.limb(px + ox, 1.2, px + ox, 9, pz, 0.35, 0.3, pc);
      mid.quad(px - 8, 3.4, px + 8, 3.8, pz, pc);
      mid.poly([px - 13, 9.4, px - 10, 8.6, px + 10, 8.6, px + 13, 9.4, px + 7, 13.5, px + 1.2, 16.5, px - 1.2, 16.5, px - 7, 13.5], pz + 0.1, roofC, (x, y) => [(x - px) * 0.05, 0.3 + (y - 12) * 0.05]);
      mid.limb(px, 16.5, px, 18.5, pz, 0.25, 0.1, pc);
    }
    kit.mesh(mid.build(), silLit, 4);

    // Sky lanterns that rise on a win (behind the garden, in front of the far hills)
    const skyList = [];
    for (let k = 0; k < 26; k++) {
      const z = -60 - rnd() * 200, d = 30 - z, hw = 0.647 * d;
      skyList.push({ x: (rnd() - 0.5) * hw * 2.2, y: 2 + rnd() * 6, z, s: 0.9 + rnd() * 0.8, drop: 0, ph: rnd(), style: 4, col: rnd() < 0.8 ? C('#ffb060') : C('#ff8f6a'), swing: 0.4 });
    }
    const skyLan = kit.lanterns(skyList, { order: 5, rise: true, int: 1.9, swing: 0.05 });
    skyLan.mesh.visible = false;
    let riseT = -1;

    /* Pond */
    const pondMat = kit.water({ POND: 1 });
    pondMat.uniforms.uPond.value.set(0, -66, 60, 34);
    pondMat.uniforms.uRipple.value = 0.18;
    const pondGeo = new THREE.PlaneGeometry(150, 90, 1, 1); pondGeo.rotateX(-Math.PI / 2); pondGeo.translate(0, 0.02, -66);
    kit.mesh(pondGeo, pondMat, 6);

    /* Near band: pond bank, stone lantern, flower beds, stepping stones */
    const near = kit.builder();
    const toroGlow = [];
    {
      const stone = C('#3a3440'), stoneL = C('#4c4652');
      // bank stones along the front of the pond
      for (let a = 0.15; a < Math.PI - 0.15; a += 0.12 + rnd() * 0.1) {
        const ex = Math.cos(a) * 60 * 1.02, ez = -66 + Math.sin(a) * 34 * 1.02;
        near.blob(ex, 0.3, ez, 1.6 + rnd() * 1.6, 0.8 + rnd() * 0.6, rnd() < 0.5 ? stone : stoneL, 0);
      }
      const items = [];
      // flower bushes and grasses at the sides, low beds across the front
      for (let k = 0; k < 46; k++) {
        const z = -100 + rnd() * 112, d = 30 - z, hw = 0.647 * d;
        let x = (rnd() - 0.5) * 2 * hw * 1.4;
        const inPond = ((x / 64) ** 2 + ((z + 66) / 38) ** 2) < 1;
        if (inPond) continue;
        items.push({ z, x, kind: rnd() < 0.55 ? 'f' : 'g', s: 1.4 + rnd() * 2.2 });
      }
      items.push({ z: -46, x: -40, kind: 'toro', s: 1 });
      items.push({ z: -38, x: 44, kind: 'toro', s: 0.9 });
      for (let k = 0; k < 7; k++) items.push({ z: 14 - k * 6.2, x: Math.sin(k * 0.9) * 2.4, kind: 's', s: 1.3 - k * 0.06 });
      items.sort((p, q) => p.z - q.z);
      const fl = [C('#f2a0c0'), C('#c9a0f0'), C('#ffd0a0'), C('#9fd8e8'), C('#ffb0a0')];
      const leafD = C('#1f2a2c'), leafL = C('#35463e');
      for (const it of items) {
        if (it.kind === 'f') {
          bush(near, it.x, 0, it.z, it.s * 2.2, it.s * 1.3, 6, leafD, leafL, rnd, 0.06);
          const fc = fl[Math.floor(rnd() * fl.length)];
          for (let j = 0; j < 7; j++) near.blob(it.x + (rnd() - 0.5) * it.s * 1.8, it.s * (0.7 + rnd() * 0.6), it.z + 0.01, it.s * 0.2, it.s * 0.17, fc, 0.08);
        } else if (it.kind === 'g') {
          grass(near, it.x, 0, it.z, it.s * 1.5, 7, C('#2a3430'), rnd, 0.25);
        } else if (it.kind === 's') {
          near.disc(it.x, 0.03, it.z, it.s * 1.3, it.s * 0.8, stoneL);
        } else if (it.kind === 'toro') {
          const x = it.x, z = it.z, s = it.s * 1.1;
          near.quad(x - 1.3 * s, 0, x + 1.3 * s, 0.6 * s, z, stone);
          near.limb(x, 0.6 * s, x, 2.6 * s, z, 0.4 * s, 0.35 * s, stone);
          near.quad(x - 1.1 * s, 2.6 * s, x + 1.1 * s, 3.0 * s, z, stoneL);
          near.quad(x - 0.8 * s, 3.0 * s, x + 0.8 * s, 4.3 * s, z, stone);
          near.st(0, 1, 0); near.quad(x - 0.45 * s, 3.2 * s, x + 0.45 * s, 4.05 * s, z, C('#ffb46a')); near.st(0, 0, 1);
          near.poly([x - 2.0 * s, 4.4 * s, x - 1.2 * s, 4.2 * s, x + 1.2 * s, 4.2 * s, x + 2.0 * s, 4.4 * s, x + 0.5 * s, 5.4 * s, x - 0.5 * s, 5.4 * s], z, stoneL, [0, 0.6]);
          near.blob(x, 5.6 * s, z, 0.3 * s, 0.35 * s, stone, 0);
          toroGlow.push({ x, y: 3.6 * s, z: z + 0.1, s: 0.9 * s, drop: 0, ph: rnd(), style: 3, col: C('#ffb060'), swing: 0 });
        }
      }
    }
    kit.mesh(near.build(), silLit, 7);
    const toroLan = kit.lanterns(toroGlow, { order: 8, int: 1.2, swing: 0 });

    /* Fireflies */
    const fireflies = kit.particles({ count: 90, mode: 'FIREFLY', shape: 'GLOW', add: true, size: 0.32, sizeVar: 0.4, box: [140, 9, 120], center: [0, 4.5, -45], colA: '#fff0a0', colB: '#d8ff9a', k: 2.6, order: 9, calm: 0.75, seed: 21 });

    /* Lantern strings: two side rigs (wide) and one rig across the top (tall) */
    const lanternCols = [C('#ffb86b'), C('#ff9a5c'), C('#ffcf7a'), C('#ff8f8f'), C('#ffb0c8')];
    const pick = (r, d) => (r() < 0.12 ? accent2.clone().multiplyScalar(0.9) : lanternCols[Math.floor(r() * lanternCols.length)].clone());
    const bulb = () => C('#ffe2b0');
    const wireMat = kit.sil();
    const sideDefs = [
      { a: [0.02, 0.66, 30], b: [0.88, 0.5, 33], sag: 1.5, n: 4, size: [0.62, 0.78], bulbs: 3 },
      { a: [0.0, 0.3, 40], b: [0.8, 0.12, 47], sag: 1.4, n: 4, size: [0.55, 0.68], bulbs: 3 },
      { a: [0.12, 0.92, 52], b: [0.95, 0.86, 60], sag: 2.2, n: 5, size: [0.6, 0.75], bulbs: 2 },
      { a: [0.1, -0.08, 62], b: [0.72, -0.12, 72], sag: 1.2, n: 4, size: [0.55, 0.65], bulbs: 2 }
    ];
    const rigL = stringRig(kit, sideDefs, { material: wireMat, order: 10, seed: 101, pick, bulb, int: 2.0 });
    const rigR = stringRig(kit, sideDefs, { material: wireMat, order: 10, seed: 202, pick, bulb, int: 2.0 });
    const topDefs = [
      { a: [-1.08, 0.97, 30], b: [1.08, 0.95, 30], sag: 2.2, n: 6, size: [0.6, 0.75], bulbs: 2 },
      { a: [-1.08, 0.83, 42], b: [1.08, 0.86, 42], sag: 2.0, n: 7, size: [0.55, 0.66], bulbs: 2 }
    ];
    const rigT = stringRig(kit, topDefs, { material: wireMat, order: 10, seed: 303, pick, bulb, int: 2.0 });
    const allLan = [rigL.lan, rigR.lan, rigT.lan];

    /* Frame trees: a cherry on the left, a maple on the right */
    function frameTree(kind, seed) {
      const r = H.rng(seed);
      const b = kit.builder();
      const bark = C('#22161a');
      const D = kind === 'cherry' ? C('#8a3c5c') : C('#4a1828');
      const Lc = kind === 'cherry' ? C('#ffc0d4') : C('#c4583e');
      // ground mound and grasses
      b.blob(2, -3.6, -0.5, 9, 4.2, C('#1a1a22'), 0);
      b.limb(0, -2, 0.9, 5, 0, 1.1, 0.85, bark);
      b.limb(0.9, 5, 2.4, 10, 0, 0.85, 0.62, bark, 0, 0.02);
      b.limb(2.4, 10, 4.4, 14, 0, 0.62, 0.42, bark, 0.02, 0.05);
      b.limb(2.4, 10, 9.5, 14.8, 0, 0.36, 0.13, bark, 0.02, 0.1);
      b.limb(1.1, 7, -2.6, 11.5, 0, 0.3, 0.1, bark, 0.01, 0.08);
      b.limb(4.4, 14, 12.5, 18.4, 0, 0.32, 0.08, bark, 0.05, 0.14);
      b.limb(4.4, 14, 3.4, 21.5, 0, 0.3, 0.1, bark, 0.05, 0.12);
      b.limb(9.5, 14.8, 15, 14.0, 0, 0.12, 0.05, bark, 0.1, 0.16);
      const n = kind === 'cherry' ? 1 : 0.8;
      b.canopy(-2.5, 14.5, 0.05, 5.5, 3.6, Math.round(22 * n), D, Lc, r, 0.12);
      b.canopy(10.5, 16.6, 0.05, 6.5, 3.4, Math.round(26 * n), D, Lc, r, 0.14);
      b.canopy(15.5, 15.2, 0.06, 4.0, 2.4, Math.round(14 * n), D, Lc, r, 0.16);
      b.canopy(4.5, 19.5, 0.07, 9.5, 5.2, Math.round(46 * n), D, Lc, r, 0.12);
      b.canopy(1, 25.5, 0.08, 11, 5, Math.round(40 * n), D, Lc, r, 0.1);
      // flowers & grass at the foot
      const fc = kind === 'cherry' ? C('#e9a0c0') : C('#ffb878');
      for (let k = 0; k < 8; k++) grass(b, -2 + k * 1.6 + r(), -0.6, 0.1, 2.2 + r() * 1.5, 5, C('#202a26'), r, 0.3);
      for (let k = 0; k < 10; k++) b.blob(-1 + r() * 10, 0.6 + r() * 1.4, 0.12, 0.28, 0.24, fc, 0.2);
      return b.build();
    }
    const frameL = new THREE.Group(), frameR = new THREE.Group();
    scene.add(frameL); scene.add(frameR);
    kit.mesh(frameTree('cherry', 501), silLit, 12, frameL);
    kit.mesh(frameTree('maple', 602), silLit, 12, frameR);

    /* Petals and bokeh in front */
    const petals = kit.particles({ count: 70, mode: 'FALL', shape: 'PETAL', size: 0.2, sizeVar: 0.4, box: [46, 30, 26], center: [0, 11, 2], vel: [1.1, -1.0, 0], sway: 1.2, colA: '#f6b2c8', colB: '#ffd6e2', k: 0.75, order: 13, calm: 0.6, seed: 31 });
    const bokeh = kit.particles({ count: 26, mode: 'FLOAT', shape: 'BOKEH', add: true, size: 0.9, sizeVar: 0.6, box: [44, 22, 8], center: [0, 7, 12], colA: '#ffb070', colB: '#ff8fa8', k: 0.22, order: 14, calm: 0.9, seed: 41 });

    /* ── Variants: golden hour (1) → sunset → twilight → night → starry night (20) ── */
    const tl = kit.timeline([0, 0.25, 0.5, 0.75, 1], {
      top: ['#3a2a52', '#2b1d3f', '#1e1838', '#101128', '#080a1e'],
      mid: ['#b0687a', '#7a4a6b', '#4a3460', '#202248', '#141a3a'],
      hor: ['#ffbe70', '#f2a65a', '#c8707a', '#4a3c6c', '#2a2c58'],
      glowC: ['#ffb070', '#ff9058', '#d8687a', '#5a3a66', '#382c58'],
      glow: [1.15, 1.0, 0.6, 0.22, 0.12],
      midH: [0.32, 0.3, 0.28, 0.3, 0.32],
      sunEl: [0.07, 0.035, -0.02, -0.08, -0.12],
      sunDisc: [2.4, 2.0, 0, 0, 0],
      cloud: [0.75, 0.85, 0.65, 0.4, 0.3],
      cLit: ['#ffc890', '#ffa070', '#c87a90', '#4a4070', '#2c2c50'],
      cDark: ['#90587a', '#64385c', '#3a2a52', '#1c1c3a', '#12142c'],
      stars: [0, 0.0, 0.35, 0.85, 1],
      moon: [0, 0, 0.35, 0.85, 1],
      lightC: ['#ffb070@0.9', '#ff8a54@0.7', '#b06a88@0.28', '#5a6aa8@0.14', '#4a5aa0@0.1'],
      ambT: ['#7a5a8a@0.6', '#6a4a7a@0.55', '#4a3e6e@0.5', '#2c3058@0.5', '#20264a@0.48'],
      ambB: ['#4a3040@0.5', '#3e2838@0.45', '#2a2238@0.4', '#181a30@0.4', '#121428@0.4'],
      rimC: ['#ffb070', '#ff8c5a', '#d07080', '#7088c8', '#6a80c0'],
      rim: [1.4, 1.2, 0.7, 0.45, 0.4],
      lx: [0.75, 0.75, 0.5, 0.2, 0.15], ly: [0.25, 0.2, 0.3, 0.5, 0.55], lz: [-0.6, -0.6, -0.4, 0.2, 0.25],
      fogC: ['#dc9878', '#c27870', '#7e5878', '#33335e', '#22264c'],
      fogT: ['#b0687a', '#7a4a6b', '#4a3460', '#202248', '#141a3a'],
      fogD: [0.0042, 0.0045, 0.0048, 0.005, 0.005],
      mistC: ['#c08080@0.8', '#a06878@0.7', '#6a5078@0.6', '#2e3460@0.6', '#222a52@0.6'],
      mistA: [0.35, 0.4, 0.5, 0.55, 0.5],
      lan: [1.1, 1.4, 1.9, 2.3, 2.45],
      plk: [0.15, 0.35, 0.7, 1.0, 1.1],
      fly: [0.25, 0.4, 0.7, 0.92, 1.0],
      petal: [0.9, 0.8, 0.55, 0.4, 0.35],
      bokeh: [0.6, 0.7, 0.85, 1.0, 1.0],
      deep: ['#3a2a3a', '#2e2030', '#221a30', '#121428', '#0c0e22']
    });

    const tmpC = new THREE.Color(), V = new THREE.Vector3(), V2 = new THREE.Vector3();
    let sunAz = 0.4, moonAz = -0.5, moonEl = 0.5, variantHash = 0;
    const energyS = { v: 0 };
    const glowEnv = new Env(1.6), goalEnv = new Env(3.0), flyEnv = new Env(2.5);

    function apply() {
      tl.col('top', S.uTop.value); tl.col('mid', S.uMid.value); tl.col('hor', S.uHor.value);
      tl.col('glowC', S.uGlowCol.value); S.uGlow.value = tl.num('glow'); S.uMidH.value = tl.num('midH');
      const el = tl.num('sunEl');
      S.uSunDir.value.set(Math.sin(sunAz) * Math.cos(el), Math.sin(el), -Math.cos(sunAz) * Math.cos(el));
      S.uSunCol.value.setRGB(1.0, 0.72, 0.42); S.uSunDisc.value = tl.num('sunDisc');
      S.uCloud.value = tl.num('cloud'); tl.col('cLit', S.uCloudLit.value); tl.col('cDark', S.uCloudDark.value);
      S.uLow.value.copy(L.uFogCol.value);
      S.uMoonAmt.value = tl.num('moon');
      L.uLightDir.value.set(tl.num('lx'), tl.num('ly'), tl.num('lz')).normalize();
      tl.col('lightC', L.uLightCol.value); tl.col('ambT', L.uAmbTop.value); tl.col('ambB', L.uAmbBot.value);
      tl.col('rimC', L.uRimCol.value); L.uRim.value = tl.num('rim');
      tl.col('fogC', L.uFogCol.value); tl.col('fogT', L.uFogTop.value); L.uFogDen.value = tl.num('fogD');
      tl.col('mistC', L.uMistCol.value); L.uMistAmt.value = tl.num('mistA') * 0.6; L.uMistTop.value = 3.5;
      mistCol.value.copy(L.uMistCol.value); mistAmt.value = tl.num('mistA');
      stars.material.uniforms.uOpacity.value = tl.num('stars');
      tl.col('deep', pondMat.uniforms.uDeep.value);
      pondMat.uniforms.uGlintDir.value.copy(S.uSunDir.value);
      tmpC.copy(S.uGlowCol.value).multiplyScalar(0.6 + S.uSunDisc.value * 0.4);
      pondMat.uniforms.uGlintCol.value.copy(tmpC);
    }

    function placeFrames() {
      const st = rig.st, d = 26;
      const hw = rig.halfW(d);
      const sc = st.tall ? 0.72 : 1;
      const yOff = st.tall ? rig.y(-1, d) + 2.5 : 0;
      frameL.position.set(-hw + (st.tall ? -1.6 : 1.2), st.tall ? Math.max(yOff, -6) : 0, 30 - d);
      frameR.position.set(hw - (st.tall ? -1.6 : 1.2), st.tall ? Math.max(yOff, -6) : 0, 30 - d);
      frameL.scale.set(sc, sc, 1); frameR.scale.set(-sc, sc, 1);
    }

    function layout() {
      const st = rig.st;
      placeFrames();
      const bx = st.bx;
      const sideAnchor = (side) => (d, which, out) => {
        const a = which ? d.b : d.a;
        const nx = side * (1 - a[0] * (1 - bx) * 0.98);
        return rig.at(nx, a[1], a[2], out);
      };
      rigL.layout(sideAnchor(-1)); rigR.layout(sideAnchor(1));
      rigT.layout((d, which, out) => {
        const a = which ? d.b : d.a;
        const band = Math.max(0.05, 1 - st.bTop);
        const ny = st.bTop + band * (0.15 + 0.85 * ((a[1] - 0.6) / 0.4));
        return rig.at(a[0], ny, a[2], out);
      });
      rigL.setVisible(!st.tall); rigR.setVisible(!st.tall); rigT.setVisible(st.tall);
      // sun & moon in the side strip (wide) or the bands (tall)
      sunAz = Math.atan((st.tall ? 0.55 : 0.74) * st.tanH * st.aspect);
      rig.dir(st.tall ? -0.5 : -0.76, st.tall ? 0.86 : 0.72, V);
      S.uMoonDir.value.copy(V);
      V2.set(0.32, 0.18, 0).multiplyScalar(0.022).add(V).normalize();
      S.uMoonCut.value.copy(V2);
      S.uMoonSize.value = 0.022;
      S.uMoonCol.value.set(1.0, 0.95, 0.85);
      // lanterns light the foliage near them
      const srcs = [];
      const rigs = st.tall ? [rigT] : [rigL, rigR];
      rigs.forEach(r => r.list.forEach(l => { if (l.style < 2) srcs.push(l); }));
      srcs.sort((a, b) => b.z - a.z);
      for (let i = 0; i < 6; i++) {
        const l = srcs[Math.floor((i / 6) * srcs.length)];
        if (l) L.uPL.value[i].set(l.x, l.y - l.s * l.drop, l.z, 7); else L.uPL.value[i].set(0, -999, 0, 1);
      }
      if (toroGlow.length) { L.uPL.value[5].set(toroGlow[0].x, toroGlow[0].y, toroGlow[0].z, 9); }
      L.uPLC.value.set(1.0, 0.62, 0.32);
      apply();
    }

    tl.set(0); apply();

    return {
      update(dt, t, beat, energy) {
        dt = kit.tick(dt);
        tl.step(dt); apply();
        energyS.v += ((energy || 0) - energyS.v) * (1 - Math.exp(-dt / 1.5));
        const e = energyS.v;
        const ge = glowEnv.step(dt), go = goalEnv.step(dt), fe = flyEnv.step(dt);
        let breathe = 0;
        if (beat && beat.playing && !RM) { const bp = ((beat.beat || 0) % 4) / 4; breathe = 0.035 * Math.sin(bp * TAU); }
        const li = tl.num('lan') * (1 + e * 0.18 + ge * 0.08 + go * 0.25 + breathe);
        allLan.forEach(l => { l.uniforms.uInt.value = li; });
        toroLan.uniforms.uInt.value = li * 0.7;
        L.uPLK.value = tl.num('plk') * (1 + e * 0.2 + go * 0.3);
        L.uEmis.value = 1.6 + tl.num('lan') * 0.4;
        L.uSway.value = RM ? 0.02 : 0.12;
        const fu = fireflies.material.uniforms;
        fu.uDensity.value = clamp(tl.num('fly') + e * 0.25 + fe * 0.3, 0, 1);
        fu.uBoost.value = e * 0.25 + fe * 0.5;
        petals.material.uniforms.uDensity.value = tl.num('petal');
        bokeh.material.uniforms.uOpacity.value = tl.num('bokeh') * (1 + e * 0.3);
        if (riseT >= 0) { riseT += dt; skyLan.uniforms.uRise.value = riseT; if (riseT > 24) { riseT = -1; skyLan.mesh.visible = false; } }
      },
      setVariant(n) {
        n = clamp(Math.round(n || 0), 0, 19);
        variantHash = hashf(n + 1);
        S.uCloudOff.value = variantHash * 13.7;
        tl.set(n);
      },
      resize(w, h) { rig.resize(w, h); layout(); },
      pulse(kind, strength) {
        if (RM) return;
        const s = strength === undefined ? 1 : clamp(strength, 0, 1);
        if (kind === 'hit') { glowEnv.kick(0.15 * s, 0.6); flyEnv.kick(0.05 * s, 0.4); }
        else if (kind === 'fever') { glowEnv.kick(0.5 * s, 1); flyEnv.kick(0.5 * s, 1); }
        else if (kind === 'goal') { goalEnv.kick(0.8 * s, 1); flyEnv.kick(0.8, 1); }
        else if (kind === 'win') { goalEnv.kick(1, 1.2); flyEnv.kick(1, 1); if (riseT < 0) { riseT = 0; skyLan.mesh.visible = true; } }
        else if (kind === 'beat') { glowEnv.kick(0.05 * s, 0.3); }
      },
      dispose() { H.disposeTree(scene); }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
