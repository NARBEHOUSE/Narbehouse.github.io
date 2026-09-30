/* Run with node_modules/electron/dist/electron.exe. Always uses a hidden window
 * and an isolated profile; it never changes the player's settings or saves. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const handoffOnly = process.argv.includes('--handoff-only');
const out = path.join(__dirname, 'test-output', 'robots');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.resolve(__dirname, '../../../../../tmp/bennys3dfootball-robot-qa-profile'));
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const results = [], errors = [], screenshots = [], metrics = {};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = () => fs.writeFileSync(path.join(out, handoffOnly ? 'handoff-results.json' : 'results.json'), JSON.stringify({ results, errors, metrics, screenshots }, null, 2));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: {
    offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false
  } });
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  win.webContents.on('render-process-gone', (_event, details) => { errors.push(details); report(); app.exit(1); });
  const js = (fn, value) => win.webContents.executeJavaScript('(' + fn.toString() + ')(' + JSON.stringify(value) + ')', true);
  const check = (name, condition) => { assert.ok(condition, name); results.push(name); report(); };
  const capture = async name => {
    await wait(55);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, name + '.png'), image.toPNG());
    screenshots.push(name + '.png'); report();
  };
  const key = async code => {
    await js(code => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : 'Enter', bubbles: true })), code); await wait(45);
    await js(code => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code === 'Space' ? ' ' : 'Enter', bubbles: true })), code); await wait(100);
  };
  try {
    await win.webContents.session.clearStorageData();
    await win.loadFile(path.join(__dirname, '..', 'index.html')); await wait(1500);
    check('The game starts with its WebGL renderer', await js(() => !!window.BennyFootball?.renderer?.renderer));
    await capture('01-robot-menu');
    await js(() => {
      window.__robotSpeech = [];
      NarbeVoiceManager.speak = text => window.__robotSpeech.push(text);
      // These pose checks start from the playbook, so the kickoff and coin toss stay off.
      BennyFootball.prefs.kickoffs = false;
      BennyFootball.startGame(true);
      BennyFootball.sim.callPlay('slants');
      for (let i = 0; i < 35 && BennyFootball.sim.s.phase === 'presnap'; i++) BennyFootball.sim.step(.1, 0);
    });
    await wait(200);
    check('Practice reaches receiver selection', await js(() => BennyFootball.sim.s.phase === 'aim'));
    metrics.receiverName = await js(() => BennyFootball.sim.s.players.find(player => player.id === BennyFootball.sim.s.targets[1]).name);
    await js(() => { window.__robotSpeech.length = 0; });
    for (let i = 0; i < 5; i++) await key('Space');
    metrics.receiverSpeech = await js(() => window.__robotSpeech);
    check('Receiver scanning speaks the number and how open he is', metrics.receiverSpeech.some(text => new RegExp('^Number ' + metrics.receiverName.split('#')[1] + ', (open|covered|tight coverage)\\. ').test(text)));
    await capture('02-robot-quarterback-gameplay');
    // Stop the game's next animation callback, then drive the same renderer and
    // simulation manually for reproducible closeups and frame-by-frame checks.
    await js(() => { window.requestAnimationFrame = () => 0; }); await wait(120);
    await js(() => {
      const r = BennyFootball.renderer, sim = BennyFootball.sim, T = THREE;
      sim.options.pace = 1; sim.random = () => .05;
      const style = document.createElement('style'); style.textContent = '#app > :not(#stadium){visibility:hidden!important}'; document.head.appendChild(style);
      window.__robotQA = {
        r, sim, T, style,
        options: { reducedMotion: false, menu: false, homeTeam: r.homeTeam, awayTeam: r.awayTeam },
        render(menu = false, dt = 1 / 60) { r.render(this.sim.s, dt, { ...this.options, menu }); r.scene.updateMatrixWorld(true); },
        view(model, side) {
          // Isolate the posed subject for closeups so a nearby defender cannot
          // obscure its grip. The normal gameplay capture retains every player.
          for (const other of [...r.playerModels.values(), ...r.heroModels]) if (other !== model) other.group.visible = false;
          const views = { front: [2.6, 1.9, 4.7], back: [-2.8, 2, -4.9], side: [4.7, 1.75, .6] };
          const offset = new T.Vector3(...views[side]); model.group.localToWorld(offset);
          const look = model.group.localToWorld(new T.Vector3(0, 1.1, 0));
          r.camera.position.copy(offset); r.camera.fov = 34; r.camera.updateProjectionMatrix(); r.camera.lookAt(look); r.renderer.render(r.scene, r.camera);
        },
        sample() {
          r.scene.updateMatrixWorld(true);
          const d = r.ballPresentation || {};
          const id = d.carrierId || this.sim.s.carrierId, model = r.playerModels.get(id);
          const renderedBall = d.mode === 'held' && model?.gripBall ? model.gripBall : r.ball;
          const ball = renderedBall.getWorldPosition(new T.Vector3());
          const axis = new T.Vector3(0, 0, 1).applyQuaternion(renderedBall.getWorldQuaternion(new T.Quaternion())).normalize();
          const hands = model ? model.arms.map(arm => arm.userData.hand).filter(Boolean).map(hand => ({
            distance: hand.getWorldPosition(new T.Vector3()).distanceTo(ball),
            localBall: hand.worldToLocal(ball.clone()).toArray()
          })) : [];
          const vector = value => value ? (Array.isArray(value) ? value : [value.x, value.y, value.z]) : null;
          let finite = true, visibleBalls = 0;
          const shellGeometry = r.ball.children.find(child => child.geometry)?.geometry;
          r.scene.traverse(object => {
            if (!object.matrixWorld.elements.every(Number.isFinite)) finite = false;
            if (shellGeometry && object.geometry === shellGeometry) {
              let visible = true; for (let parent = object; parent; parent = parent.parent) visible &&= parent.visible;
              if (visible) visibleBalls++;
            }
          });
          return { phase: this.sim.s.phase, mode: d.mode, carrierId: id, ball: ball.toArray(), axis: axis.toArray(), forward: vector(d.forward), spinAngle: d.spinAngle, gripError: d.gripError, hands, finite, visibleBalls };
        }
      };
    });
    if (handoffOnly) {
      await js(() => {
        const q = __robotQA;
        q.sim.reset({ practice: true, pace: 1 }); q.sim.callPlay('inside');
        q.r.render(q.sim.s, 1 / 60, { ...q.options, reducedMotion: true });
      });
      await capture('08-formation-overhead');
      await js(() => {
        const q = __robotQA;
        for (let i = 0; i < 40 && q.sim.s.phase === 'presnap'; i++) q.sim.step(.1, 0);
        q.render(); window.__handoffElapsed = 0;
      });
      metrics.handoff = [];
      for (const [elapsed, name] of [[.45, 'approach'], [.95, 'transfer'], [1.6, 'secure']]) {
        metrics.handoff.push(await js(elapsed => {
          const q = __robotQA;
          while (window.__handoffElapsed < elapsed) { q.sim.step(1 / 60, 0); q.render(false, 1 / 60); window.__handoffElapsed += 1 / 60; }
          const qb = q.r.playerModels.get('home-QB'), rb = q.r.playerModels.get('home-RB');
          q.view(qb, 'front'); rb.group.visible = true; q.r.renderer.render(q.r.scene, q.r.camera);
          return q.sample();
        }, elapsed));
        await capture('08-handoff-' + name);
      }
      check('The handoff transfers a single attached ball from quarterback to running back', metrics.handoff[0].carrierId === 'home-QB' && metrics.handoff.at(-1).carrierId === 'home-RB' && metrics.handoff.every(frame => frame.visibleBalls === 1 && frame.finite && frame.hands.some(hand => hand.distance < .4)));
      report(); app.exit(0); return;
    }
    for (const side of ['front', 'side', 'back']) {
      await js(side => { const q = __robotQA; q.render(true); q.view(q.r.heroModels[0], side); }, side);
      await capture('03-hero-' + side);
    }
    metrics.qb = await js(() => { const q = __robotQA; q.render(); q.view(q.r.playerModels.get(q.sim.s.carrierId), 'front'); return q.sample(); });
    check('The quarterback holds one football in the articulated hands', metrics.qb.mode === 'held' && metrics.qb.visibleBalls === 1 && metrics.qb.hands.length === 2 && metrics.qb.hands.every(hand => hand.distance < .42));
    await capture('04-quarterback-grip');
    await js(() => { const q = __robotQA; q.sim.selectTarget(1); q.sim.throwPass(); q.render(); window.__robotFlight = []; });
    for (const [fraction, name] of [[.18, 'release'], [.5, 'apex'], [.83, 'descent'], [1, 'catch']]) {
      await js(fraction => {
        const q = __robotQA, f = q.sim._flight;
        if (!f) return;
        const target = f.duration * fraction;
        while (q.sim._flight && q.sim._flight.elapsed < target) { q.sim.step(1 / 120, 0); q.render(false, 1 / 120); window.__robotFlight.push(q.sample()); }
        if (fraction < 1) {
          const b = q.r.ball.getWorldPosition(new q.T.Vector3());
          q.r.camera.position.copy(b).add(new q.T.Vector3(2, 1.15, -3)); q.r.camera.fov = 27; q.r.camera.updateProjectionMatrix(); q.r.camera.lookAt(b); q.r.renderer.render(q.r.scene, q.r.camera);
        } else q.view(q.r.playerModels.get(q.sim.s.carrierId), 'front');
      }, fraction);
      await capture('05-pass-' + name);
    }
    const flight = await js(() => __robotFlight);
    const dot = (a, b) => a.reduce((n, value, i) => n + value * b[i], 0);
    const normal = value => { const length = Math.hypot(...value); return value.map(n => n / length); };
    const live = flight.filter(frame => frame.mode === 'flight');
    metrics.flightFrames = live.length;
    metrics.minimumAxialAlignment = Math.min(...live.filter(frame => frame.forward).map(frame => dot(frame.axis, normal(frame.forward))));
    metrics.spiralTurns = live.length ? (live.at(-1).spinAngle - live[0].spinAngle) / (Math.PI * 2) : 0;
    const tangentDots = [];
    for (let i = 2; i < live.length - 2; i++) {
      const before = live[i - 1].ball, after = live[i + 1].ball;
      if (Math.hypot(...after.map((value, index) => value - before[index])) > .002) tangentDots.push(dot(live[i].axis, normal(after.map((value, index) => value - before[index]))));
    }
    metrics.minimumPathAlignment = Math.min(...tangentDots);
    check('The thrown football keeps its long axis aligned with its flight direction', live.length > 20 && Number.isFinite(metrics.minimumAxialAlignment) && metrics.minimumAxialAlignment > .999);
    check('The football follows its actual travel tangent rather than tumbling', tangentDots.length > 20 && metrics.minimumPathAlignment > .995);
    check('A pass visibly spins around its longitudinal axis', metrics.spiralTurns > 1);
    check('Only one football exists throughout the throw and catch', flight.every(frame => frame.visibleBalls === 1));
    metrics.catch = flight.at(-1);
    check('The receiver securely catches the ball into a hand attachment', metrics.catch.phase === 'run' && metrics.catch.mode === 'held' && metrics.catch.hands.some(hand => hand.distance < .35));
    await js(() => { const q = __robotQA; for (let i = 0; i < 100; i++) q.render(false, 1 / 60); q.view(q.r.playerModels.get(q.sim.s.carrierId), 'side'); });
    await capture('06-runner-tuck');
    metrics.turns = await js(() => {
      const q = __robotQA, snapshots = [];
      q.sim.s.controlGrace = 0;
      for (let i = 0; i < 90 && q.sim.s.phase === 'run'; i++) {
        q.sim.step(1 / 60, i < 45 ? -1 : 1); q.render(false, 1 / 60);
        if (i % 5 === 0) snapshots.push(q.sample());
      }
      q.view(q.r.playerModels.get(q.sim.s.carrierId), 'back'); return snapshots;
    });
    await capture('07-running-turn');
    check('The ball stays close to the carrying hand while steering and running', metrics.turns.length > 8 && metrics.turns.every(frame => frame.mode === 'held' && frame.hands.some(hand => hand.distance < .35)));
    metrics.opponentPass = await js(() => {
      const q = __robotQA;
      q.sim = new FootballSim({ practice: true, pace: 1, random: () => .05 });
      q.sim.s.possession = 'away'; q.sim.s.fieldPosition = 75; q.sim._formation(); q.sim.callPlay('zone');
      for (let i = 0; i < 500 && !q.sim._flight; i++) { q.sim.step(1 / 60, 0); q.render(false, 1 / 60); }
      const snapshots = [];
      for (let i = 0; i < 300 && q.sim._flight; i++) { q.sim.step(1 / 120, 0); q.render(false, 1 / 120); snapshots.push(q.sample()); }
      return snapshots;
    });
    const awayFlight = metrics.opponentPass.filter(frame => frame.mode === 'flight');
    check('Opponent passes spiral correctly toward the opposite end zone', awayFlight.length > 20 && awayFlight.every(frame => frame.forward && frame.forward[2] < 0 && dot(frame.axis, normal(frame.forward)) > .999));
    metrics.maximumGripError = Math.max(...[metrics.qb, ...flight, ...metrics.turns].map(frame => Number(frame.gripError) || 0));
    check('All gameplay world transforms remain finite', [metrics.qb, ...flight, ...metrics.turns, ...metrics.opponentPass].every(frame => frame.finite));
    check('There are no browser errors', errors.length === 0);
    report(); app.exit(0);
  } catch (error) {
    errors.push(error.stack || String(error));
    try { await capture('failure'); } catch (_) {}
    report(); app.exit(1);
  }
});
