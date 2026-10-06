// Visual effects: ball trail, "on fire" flames, rim sparks, confetti and camera shake.
(function () {
    function spriteTexture(inner, outer) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, inner); g.addColorStop(0.4, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    }

    function build(scene) {
        const softTex = spriteTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');
        const fireTex = spriteTexture('rgba(255,250,200,1)', 'rgba(255,120,20,0.6)');
        const particles = [];   // {sprite, vel, life, max, grow}
        const pool = [];

        function spawn(tex, pos, vel, life, size, color, additive = true) {
            let s = pool.pop();
            if (!s) {
                s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
                scene.add(s);
            }
            s.material.map = tex;
            s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
            s.material.color.set(color);
            s.material.opacity = 1;
            s.position.copy(pos);
            s.scale.setScalar(size);
            s.visible = true;
            particles.push({ s, vel, life, max: life, size });
        }

        // Confetti uses small planes so it tumbles
        const confetti = [];
        const confettiGeo = new THREE.PlaneGeometry(0.35, 0.22);
        function burstConfetti(count = 160) {
            for (let i = 0; i < count; i++) {
                const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.9, 0.55), side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4, emissive: 0x111111 });
                const m = new THREE.Mesh(confettiGeo, mat);
                m.position.set((Math.random() - 0.5) * 70, 40 + Math.random() * 18, -30 + (Math.random() - 0.5) * 40);
                m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
                scene.add(m);
                confetti.push({ m, vel: new THREE.Vector3((Math.random() - 0.5) * 4, -2 - Math.random() * 3, (Math.random() - 0.5) * 4), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), t: Math.random() * 10 });
            }
        }

        let shake = 0;
        const shakeOffset = new THREE.Vector3();

        return {
            trail(pos, onFire) {
                if (onFire) {
                    for (let i = 0; i < 3; i++) {
                        spawn(fireTex, pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)),
                            new THREE.Vector3((Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5), 0.45, 1.6 + Math.random(), i ? 0xff7a1a : 0xffd27a);
                    }
                } else {
                    spawn(softTex, pos, new THREE.Vector3(0, 0, 0), 0.35, 1.1, 0x9ec9ff);
                }
            },
            sparks(pos, color = 0xffd27a, count = 26) {
                for (let i = 0; i < count; i++) {
                    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 8);
                    spawn(softTex, pos.clone(), v, 0.5 + Math.random() * 0.3, 0.35, color);
                }
            },
            confetti: burstConfetti,
            shake(amount) { shake = Math.max(shake, amount); },
            update(dt, camera) {
                for (let i = particles.length - 1; i >= 0; i--) {
                    const p = particles[i];
                    p.life -= dt;
                    if (p.life <= 0) { p.s.visible = false; pool.push(p.s); particles.splice(i, 1); continue; }
                    p.s.position.addScaledVector(p.vel, dt);
                    p.vel.y -= 4 * dt;
                    const k = p.life / p.max;
                    p.s.material.opacity = k;
                    p.s.scale.setScalar(p.size * (0.4 + 0.6 * k));
                }
                for (let i = confetti.length - 1; i >= 0; i--) {
                    const c = confetti[i];
                    c.t += dt;
                    c.vel.y = Math.max(c.vel.y - 3 * dt, -5);
                    c.m.position.addScaledVector(c.vel, dt);
                    c.m.position.x += Math.sin(c.t * 3) * 0.03;
                    c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt;
                    if (c.m.position.y < 0.1) { scene.remove(c.m); c.m.material.dispose(); confetti.splice(i, 1); }
                }
                // camera shake is applied as an offset the caller adds and later removes
                camera.position.sub(shakeOffset);
                if (shake > 0.001) {
                    shakeOffset.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
                    shake *= Math.pow(0.02, dt);
                } else shakeOffset.set(0, 0, 0);
                camera.position.add(shakeOffset);
            }
        };
    }

    window.BB = window.BB || {};
    window.BB.FX = { build };
})();
