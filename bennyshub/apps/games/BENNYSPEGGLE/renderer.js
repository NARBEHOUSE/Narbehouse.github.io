/* Bright arcade presentation. Physics and saved game state remain in PeggleKit. */
(function () {
  'use strict';
  const K = window.PeggleKit;
  const caches = new WeakMap();
  const palettes = {
    NORMAL: { light:'#a0faff', middle:'#1bb9ff', dark:'#0872d7', edge:'#043570', glow:'#27cfff' },
    TARGET: { light:'#fff8b9', middle:'#ffc640', dark:'#fa8616', edge:'#67370b', glow:'#ffc53c' },
    GEM: { light:'#fbd7ff', middle:'#c57aff', dark:'#8230eb', edge:'#36146c', glow:'#c28cff' },
    EXTRA: { light:'#f0ffc0', middle:'#abf337', dark:'#54c914', edge:'#265713', glow:'#a9ff48' },
    EXPLODE: { light:'#ffd2e9', middle:'#ff69b3', dark:'#e52a85', edge:'#731444', glow:'#ff68b6' },
    MULTIBALL: { light:'#ffffff', middle:'#e4f7ff', dark:'#66bbff', edge:'#154685', glow:'#afdfff' },
    POWER: { light:'#eeffff', middle:'#60e8e6', dark:'#189eab', edge:'#073d53', glow:'#65fff4' },
    BLOCK: { light:'#ccdcec', middle:'#829bb5', dark:'#425b78', edge:'#192d47', glow:'#7cacc8' }
  };
  const powerPalettes = {
    ghost:{light:'#f4fcff',middle:'#bee5f6',dark:'#7da6d6',edge:'#163658',glow:'#c0edff'},
    blast:{light:'#ffe5f0',middle:'#ff78ba',dark:'#dc358c',edge:'#67143f',glow:'#ff8cc6'},
    multiball:{light:'#ffffff',middle:'#a8ecff',dark:'#42aee8',edge:'#0c4164',glow:'#a7edff'},
    fireball:{light:'#fff7bd',middle:'#ffb34b',dark:'#ed6121',edge:'#6b290b',glow:'#ffbd66'},
    echo:{light:'#f4e6ff',middle:'#bbaaef',dark:'#7957d2',edge:'#3b1d6a',glow:'#c6b6ff'},
    magnet:{light:'#d5fff0',middle:'#5ae1a6',dark:'#14a88c',edge:'#064839',glow:'#82ffc3'},
    guide:{light:'#fffacc',middle:'#ffe65c',dark:'#caa223',edge:'#59480b',glow:'#fff397'}
  };
  const paletteFor = (type,power) => type==='POWER' ? powerPalettes[power]||palettes.POWER : palettes[type]||palettes.NORMAL;
  function powerSymbol(ctx,id,r) {
    ctx.lineWidth=Math.max(1.8,r*.13);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    if(id==='ghost') {
      ctx.moveTo(-r*.5,r*.52);ctx.lineTo(-r*.5,-r*.05);ctx.arc(0,-r*.05,r*.5,Math.PI,0);ctx.lineTo(r*.5,r*.52);
      ctx.lineTo(r*.25,r*.35);ctx.lineTo(0,r*.52);ctx.lineTo(-r*.25,r*.35);ctx.closePath();ctx.stroke();
      [-r*.18,r*.18].forEach(x=>{ctx.beginPath();ctx.arc(x,-r*.03,r*.065,0,Math.PI*2);ctx.fill();});
    } else if(id==='blast') {star(ctx,r*.55,4);ctx.stroke();}
    else if(id==='multiball') {[[0,-r*.27],[-r*.31,r*.27],[r*.31,r*.27]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,r*.23,0,Math.PI*2);ctx.stroke();});}
    else if(id==='fireball') {
      ctx.moveTo(0,-r*.64);ctx.quadraticCurveTo(r*.13,-r*.17,r*.34,-r*.29);ctx.quadraticCurveTo(r*.77,r*.37,r*.16,r*.55);ctx.quadraticCurveTo(-r*.72,r*.67,-r*.43,-r*.13);ctx.quadraticCurveTo(-r*.15,r*.1,0,-r*.64);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-r*.04);ctx.quadraticCurveTo(r*.35,r*.4,0,r*.43);ctx.quadraticCurveTo(-r*.3,r*.32,0,-r*.04);ctx.fill();
    } else if(id==='echo') {
      ctx.arc(0,0,r*.48,-Math.PI*.6,Math.PI*.95);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.67,-r*.05);ctx.lineTo(-r*.46,r*.13);ctx.lineTo(-r*.25,-r*.1);ctx.stroke();
      ctx.beginPath();ctx.moveTo(r*.11,-r*.38);ctx.lineTo(-r*.13,-r*.49);ctx.lineTo(-r*.08,-r*.23);ctx.stroke();
    } else if(id==='magnet') {
      ctx.moveTo(-r*.46,-r*.48);ctx.lineTo(-r*.46,r*.04);ctx.arc(0,r*.04,r*.46,Math.PI,0,true);ctx.lineTo(r*.46,-r*.48);ctx.lineTo(r*.16,-r*.48);ctx.lineTo(r*.16,r*.04);ctx.arc(0,r*.04,r*.16,0,Math.PI);ctx.lineTo(-r*.16,-r*.48);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-r*.46,-r*.25);ctx.lineTo(-r*.16,-r*.25);ctx.moveTo(r*.16,-r*.25);ctx.lineTo(r*.46,-r*.25);ctx.stroke();
    } else {
      ctx.moveTo(-r*.5,r*.38);ctx.lineTo(-r*.1,-r*.12);ctx.lineTo(r*.39,r*.23);ctx.lineTo(r*.47,-r*.49);ctx.moveTo(r*.12,-r*.3);ctx.lineTo(r*.47,-r*.49);ctx.lineTo(r*.65,-r*.16);ctx.stroke();
    }
  }
  function polygon(ctx, count, radius, rotation) {
    for (let i = 0; i < count; i++) {
      const angle = (rotation || 0) + i * Math.PI * 2 / count;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y);
    }
    ctx.closePath();
  }
  function star(ctx, radius, spikes) {
    for (let i = 0; i < spikes * 2; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / spikes, r = i % 2 ? radius * .55 : radius;
      if (i) ctx.lineTo(Math.cos(angle)*r,Math.sin(angle)*r); else ctx.moveTo(Math.cos(angle)*r,Math.sin(angle)*r);
    }
    ctx.closePath();
  }
  function shape(ctx, peg) {
    const r = peg.radius;
    ctx.beginPath();
    if (peg.type === 'TARGET' || peg.type === 'BLOCK') ctx.roundRect(-r,-r,r*2,r*2,peg.type === 'BLOCK' ? 3 : Math.min(5,r*.3));
    else if (peg.type === 'POWER') polygon(ctx,6,r+1,-Math.PI/2);
    else if (peg.type === 'GEM') polygon(ctx,4,r+2,-Math.PI/2);
    else if (peg.type === 'EXPLODE') star(ctx,r+1,8);
    else if (peg.type === 'NORMAL' && peg.shape === 'SQUARE') ctx.roundRect(-r,-r,r*2,r*2,3);
    else if (peg.type === 'NORMAL' && peg.shape === 'TRI') polygon(ctx,3,r+1,-Math.PI/2);
    else if (peg.type === 'NORMAL' && peg.shape === 'HEX') polygon(ctx,6,r,0);
    else if (peg.type === 'NORMAL' && peg.shape === 'STAR') star(ctx,r,5);
    else if (peg.type === 'NORMAL' && peg.shape === 'PLUS') {
      const s=r*.4;
      ctx.moveTo(-s,-r);ctx.lineTo(s,-r);ctx.lineTo(s,-s);ctx.lineTo(r,-s);ctx.lineTo(r,s);ctx.lineTo(s,s);ctx.lineTo(s,r);ctx.lineTo(-s,r);ctx.lineTo(-s,s);ctx.lineTo(-r,s);ctx.lineTo(-r,-s);ctx.lineTo(-s,-s);ctx.closePath();
    } else ctx.arc(0,0,r,0,Math.PI*2);
  }
  function pegSymbol(ctx, peg) {
    const r = peg.radius;
    ctx.strokeStyle=peg.type==='MULTIBALL'?'#145dc4':paletteFor(peg.type,peg.power).edge;
    ctx.fillStyle=ctx.strokeStyle; ctx.lineWidth=Math.max(1.8,r*.13);ctx.lineCap='round';ctx.lineJoin='round';
    if(peg.type==='POWER') { powerSymbol(ctx,peg.power,r); } else if(peg.type==='TARGET') {
      ctx.beginPath();ctx.arc(0,0,r*.27,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<8;i++) {const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.48,Math.sin(a)*r*.48);ctx.lineTo(Math.cos(a)*r*.69,Math.sin(a)*r*.69);ctx.stroke();}
    } else if(peg.type==='GEM') {
      ctx.beginPath();ctx.moveTo(0,-r*.6);ctx.lineTo(r*.48,0);ctx.lineTo(0,r*.6);ctx.lineTo(-r*.48,0);ctx.closePath();ctx.moveTo(-r*.48,0);ctx.lineTo(r*.48,0);ctx.moveTo(0,-r*.6);ctx.lineTo(0,r*.6);ctx.stroke();
    } else if(peg.type==='EXTRA') {
      ctx.lineWidth=Math.max(3,r*.23);ctx.beginPath();ctx.moveTo(-r*.48,0);ctx.lineTo(r*.48,0);ctx.moveTo(0,-r*.48);ctx.lineTo(0,r*.48);ctx.stroke();
    } else if(peg.type==='EXPLODE') {
      ctx.beginPath();star(ctx,r*.44,4);ctx.fill();
    } else if(peg.type==='MULTIBALL') {
      [-r*.34,r*.34].forEach(x=>{ctx.beginPath();ctx.arc(x,0,r*.27,0,Math.PI*2);ctx.stroke();});
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(0,0,r*.82,-Math.PI*.88,-Math.PI*.15);ctx.stroke();
    } else if(peg.type==='BLOCK') {
      ctx.beginPath();ctx.rect(-r*.53,-r*.5,r*1.06,r);ctx.moveTo(-r*.53,0);ctx.lineTo(r*.53,0);ctx.moveTo(0,-r*.5);ctx.lineTo(0,0);ctx.moveTo(-r*.25,0);ctx.lineTo(-r*.25,r*.5);ctx.moveTo(r*.32,0);ctx.lineTo(r*.32,r*.5);ctx.stroke();
    }
  }
  function drawPeg(ctx, peg, quiet) {
    const r=peg.radius, p=paletteFor(peg.type,peg.power);
    ctx.save();ctx.translate(peg.x,peg.y);
    ctx.shadowColor=p.glow;ctx.shadowBlur=quiet?3:9;
    const gradient=ctx.createRadialGradient(-r*.36,-r*.45,1,0,r*.22,r*1.3);
    gradient.addColorStop(0,p.light);
    gradient.addColorStop(.5,p.middle);
    gradient.addColorStop(1,p.dark);
    shape(ctx,peg);ctx.fillStyle=gradient;ctx.fill();ctx.shadowBlur=0;
    ctx.lineWidth=5;ctx.strokeStyle='#061a32';ctx.stroke();
    ctx.lineWidth=2;ctx.strokeStyle=p.light;ctx.stroke();
    pegSymbol(ctx,peg);
    if(peg.type==='NORMAL') {
      ctx.fillStyle='#ffffffa0';ctx.beginPath();ctx.ellipse(-r*.28,-r*.36,r*.23,r*.15,-.45,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawBreakingPeg(ctx,peg,board,options) {
    const progress=K.pegBreakProgress(board.level,peg,board.status==='won'?options.decayAfterWin:0);
    if(progress>=1)return;
    const radius=peg.radius*(1-progress),palette=paletteFor(peg.type,peg.power);
    // The surviving core uses exactly the radius still used by collisions.
    // Cracks and detached chips are decoration, never invisible solid shells.
    ctx.save();ctx.translate(peg.x,peg.y);
    ctx.save();ctx.scale(1-progress,1-progress);
    shape(ctx,peg);ctx.fillStyle=palette.middle;ctx.fill();
    ctx.lineWidth=2;ctx.strokeStyle=palette.light;ctx.stroke();ctx.restore();
    ctx.lineWidth=Math.min(1.7,radius*.18);ctx.strokeStyle=palette.edge;
    for(let i=0;i<3;i++) {
      const angle=i*Math.PI*2/3+(peg.id||0)*.71;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(angle+.2)*radius*.44,Math.sin(angle+.2)*radius*.44);ctx.lineTo(Math.cos(angle)*radius,Math.sin(angle)*radius);ctx.stroke();
    }
    if(!options.reducedMotion)for(let i=0;i<6;i++) {
      const angle=i*Math.PI/3+(peg.id||0)*.71,size=peg.radius*.2*(1-progress),travel=peg.radius*(.75+progress*1.4);
      ctx.save();ctx.translate(Math.cos(angle)*travel,Math.sin(angle)*travel+progress*progress*peg.radius*1.5);ctx.rotate(angle+progress*(i%2?1:-1));
      ctx.globalAlpha=1-progress;ctx.fillStyle=i%2?palette.middle:palette.light;
      ctx.beginPath();ctx.moveTo(-size,-size*.6);ctx.lineTo(size*.8,-size*.3);ctx.lineTo(size*.2,size);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.restore();
  }
  function drawImpacts(ctx, options) {
    if(!options.reducedMotion)for(const particle of options.particles||[]) {
      const strength=Math.max(0,particle.life/particle.maxLife),size=particle.size*(.45+strength*.55);
      ctx.save();ctx.translate(particle.x,particle.y);ctx.rotate(particle.rotation);
      ctx.globalAlpha=Math.min(1,strength*1.6);ctx.fillStyle=particle.color;
      ctx.strokeStyle='#08213e';ctx.lineWidth=.9;ctx.beginPath();
      ctx.moveTo(-size,-size*.7);ctx.lineTo(size*.8,-size*.4);ctx.lineTo(size*.35,size);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
    const impacts=options.impacts||[],scoreStamps=impacts.slice(-3);
    for(const impact of impacts) {
      const quiet=options.reducedMotion||impact.quiet,progress=1-impact.life/impact.maxLife;
      ctx.save();ctx.translate(impact.x,impact.y);ctx.strokeStyle=impact.color;
      ctx.globalAlpha=quiet ? .85 : (1-progress)*.8;ctx.lineWidth=quiet?2:2.5-progress;
      ctx.beginPath();ctx.arc(0,0,impact.radius+5+(quiet?0:progress*28),0,Math.PI*2);ctx.stroke();
      if(!scoreStamps.includes(impact)){ctx.restore();continue;}
      // Reduced motion keeps a brief, static score stamp, with no burst or pulse.
      ctx.globalAlpha=quiet?1:Math.min(1,impact.life/.22);
      ctx.font='800 16px Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='#04152e';ctx.fillStyle=impact.color;
      const label='+'+impact.points,y=-impact.radius-16-(quiet?0:progress*19);
      ctx.strokeText(label,0,y);ctx.fillText(label,0,y);ctx.restore();
    }
  }
  function drawPegDepartures(ctx, options) {
    for(const departure of (options.pegDepartures||[]).slice(-48)) {
      if(!departure.peg||departure.life<=0)continue;
      const quiet=options.reducedMotion||departure.quiet,peg=departure.peg,palette=paletteFor(peg.type,peg.power);
      ctx.save();
      ctx.translate(quiet?departure.originX:departure.x,quiet?departure.originY:departure.y);
      if(!quiet)ctx.rotate(departure.rotation);
      ctx.globalAlpha=quiet?Math.max(0,departure.life/departure.maxLife):Math.min(1,departure.life/.2);
      // Keep the recognizable shape and color visible as the cracked shell
      // hops away. This is visual debris, never a live collision or power.
      drawPeg(ctx,{...peg,x:0,y:0,hit:false},true);
      shape(ctx,peg);ctx.lineWidth=2;ctx.strokeStyle=palette.light;ctx.stroke();
      const r=peg.radius;
      ctx.strokeStyle='#09213b';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(-r*.55,-r*.55);ctx.lineTo(-r*.1,-r*.15);ctx.lineTo(-r*.3,r*.24);ctx.lineTo(r*.55,r*.6);
      ctx.moveTo(-r*.1,-r*.15);ctx.lineTo(r*.35,-r*.55);ctx.stroke();
      ctx.restore();
    }
  }
  function prediction(board, cache) {
    const pegKey=board.pegs.map(p=>p.id+':'+(p.hit?Math.round(K.pegBreakProgress(board.level,p)*20)+1:0)).join(',');
    const extended=(board.pendingPowers||[]).includes('guide');
    const movingPlateRelevant=extended||(board.pendingPowers||[]).includes('magnet')||board.options.magnet;
    const optionKey=JSON.stringify([board.options,board.pendingPowers||[],board.activePowers||[],movingPlateRelevant?board.catcher.mode:null,movingPlateRelevant?Math.floor((board.elapsed||0)*5):null]);
    if(cache.prediction&&Math.abs(cache.angle-board.angle)<.01&&cache.pegKey===pegKey&&cache.optionKey===optionKey)return cache.prediction;
    const result={before:[{x:410,y:52}],after:[],impact:null};
    try {
      const sim=K.createBoard(board.level,board.options);sim.restore(board.serialize());sim.fire(board.angle);
      const id=sim.balls[0]?.id;
      let sinceImpact=0;
      for(let i=0;i<(extended?360:240);i++) {
        const previous=sim.balls.find(ball=>ball.id===id);
        if(!previous)break;
        const old={x:previous.x,y:previous.y,vx:previous.vx,vy:previous.vy};
        sim.update(1/120);
        const ball=sim.balls.find(b=>b.id===id);
        if(!ball)break;
        const hit=sim.events.find(e=>e.type==='hit');
        const reflected=Math.abs(ball.vx-old.vx)>35||Math.abs(ball.vy-old.vy-475/120)>35;
        if(!result.impact&&(hit||reflected)) {
          result.impact={x:ball.x,y:ball.y,pegX:hit?.x,pegY:hit?.y};
          result.before.push({x:ball.x,y:ball.y});result.after.push({x:ball.x,y:ball.y});
        } else (result.impact?result.after:result.before).push({x:ball.x,y:ball.y,gap:Math.hypot(ball.x-old.x,ball.y-old.y)>160});
        sim.events.length=0;
        if(sim.status==='won')break;
        if(result.impact&&++sinceImpact>=(extended?300:40))break;
        if(ball.y>K.H+20)break;
      }
    } catch (_) {
      // Keep a useful aiming guide if an old saved board cannot be simulated.
      let x=410,y=52,vx=Math.sin(board.angle)*650,vy=Math.cos(board.angle)*650;
      for(let i=0;i<150;i++) {vy+=475/120;x+=vx/120;y+=vy/120;if(x<8||x>812||y>515)break;result.before.push({x,y});}
    }
    cache.angle=board.angle;cache.pegKey=pegKey;cache.optionKey=optionKey;cache.prediction=result;
    return result;
  }
  function path(ctx, points) {
    ctx.beginPath();points.forEach((p,i)=>i&&!p.gap?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  }
  function arrow(ctx, first, next, color, size) {
    if(!first||!next)return;
    const angle=Math.atan2(next.y-first.y,next.x-first.x);
    ctx.save();ctx.translate(next.x,next.y);ctx.rotate(angle);ctx.fillStyle=color;ctx.strokeStyle='#09233f';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.6,-size*.7);ctx.lineTo(-size*.25,0);ctx.lineTo(-size*.6,size*.7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  function drawPrediction(ctx, board, cache, options) {
    const predicted=prediction(board,cache), points=predicted.before;
    const extended=(board.pendingPowers||[]).includes('guide');
    if(points.length<2)return;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    path(ctx,points);ctx.strokeStyle='#051d39';ctx.lineWidth=7;ctx.stroke();
    ctx.shadowColor='#fff6bd';ctx.shadowBlur=6;ctx.strokeStyle='#ffffff';ctx.lineWidth=3.5;ctx.stroke();ctx.shadowBlur=0;
    ctx.setLineDash([8,11]);ctx.lineDashOffset=options.reducedMotion?0:-(options.phaseTime||0)*20;
    ctx.strokeStyle='#ffd455';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
    const arrowIndex=Math.min(points.length-1,Math.max(1,Math.floor(points.length*.65)));
    arrow(ctx,points[arrowIndex-1],points[arrowIndex],'#fff2a0',6);
    if(predicted.after.length>1) {
      ctx.globalAlpha=extended ? .82 : .52;ctx.setLineDash([5,8]);path(ctx,predicted.after);ctx.strokeStyle='#071b32';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=extended?'#fff09d':'#e4f7ff';ctx.lineWidth=2.5;ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      const last=predicted.after.length-1;arrow(ctx,predicted.after[Math.max(0,last-3)],predicted.after[last],'#b8e4ff',4.5);
    }
    const end=predicted.impact||points[points.length-1];
    ctx.translate(end.x,end.y);ctx.shadowColor='#fff4bb';ctx.shadowBlur=8;
    ctx.strokeStyle='#071b32';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#fff8d6';ctx.lineWidth=2.8;ctx.stroke();ctx.shadowBlur=0;
    ctx.strokeStyle='#ffd447';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(0,0,21,-.4,1.1);ctx.arc(0,0,21,Math.PI-.4,Math.PI+1.1);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-25,0);ctx.lineTo(-17,0);ctx.moveTo(17,0);ctx.lineTo(25,0);ctx.moveTo(0,-25);ctx.lineTo(0,-17);ctx.moveTo(0,17);ctx.lineTo(0,25);ctx.stroke();
    ctx.restore();
  }
  function drawCatcher(ctx, catcher, quiet) {
    const x=catcher.x,y=catcher.y||506,w=catcher.w,bounce=catcher.mode==='bounce';
    const color=bounce?{light:'#ffe0a3',top:'#ffc35d',middle:'#e97c25',bottom:'#954325'}:{light:'#b9f6ff',top:'#52dcff',middle:'#158ed9',bottom:'#174684'};
    ctx.save();
    const body=ctx.createLinearGradient(x,y,x,y+30);body.addColorStop(0,color.top);body.addColorStop(.45,color.middle);body.addColorStop(1,color.bottom);
    ctx.beginPath();ctx.moveTo(x+2,y);ctx.lineTo(x+w-2,y);ctx.lineTo(x+w-12,y+27);ctx.quadraticCurveTo(x+w/2,y+36,x+12,y+27);ctx.closePath();ctx.fillStyle=body;ctx.fill();ctx.strokeStyle='#061b35';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle=color.light;ctx.lineWidth=2.5;ctx.stroke();
    ctx.strokeStyle=color.top;ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y+1);ctx.lineTo(x+w,y+1);ctx.stroke();ctx.strokeStyle=color.light;ctx.lineWidth=2;ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.beginPath();
    if(bounce) {
      [13,24].forEach(offset=>{ctx.moveTo(x+w/2-9,y+offset);ctx.lineTo(x+w/2,y+offset-7);ctx.lineTo(x+w/2+9,y+offset);});
    } else {
      ctx.moveTo(x+w/2-10,y+12);ctx.lineTo(x+w/2,y+20);ctx.lineTo(x+w/2+10,y+12);
      ctx.moveTo(x+w/2-16,y+16);ctx.lineTo(x+w/2-16,y+25);ctx.lineTo(x+w/2+16,y+25);ctx.lineTo(x+w/2+16,y+16);
    }
    ctx.stroke();
    const countdown=catcher.behavior==='alternate'?' · '+Math.max(0,Math.ceil(Number(catcher.switchIn)||0))+'s':'';
    const label=(bounce?'BOUNCE':'CATCH')+countdown;
    ctx.font='800 11px Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const labelWidth=ctx.measureText(label).width+16,center=Math.max(labelWidth/2+5,Math.min(K.W-labelWidth/2-5,x+w/2));
    ctx.strokeStyle='#041426';ctx.lineWidth=4;ctx.lineJoin='round';ctx.strokeText(label,center,y-15);
    ctx.fillStyle=color.light;ctx.fillText(label,center,y-15);ctx.restore();
  }
  function drawLauncher(ctx, angle, powers) {
    ctx.save();ctx.translate(410,52);ctx.rotate(-angle);
    const barrel=ctx.createLinearGradient(-15,0,15,0);barrel.addColorStop(0,'#3178bc');barrel.addColorStop(.35,'#dbf9ff');barrel.addColorStop(.65,'#8adeff');barrel.addColorStop(1,'#2360aa');
    ctx.fillStyle=barrel;ctx.strokeStyle='#071b35';ctx.lineWidth=6;ctx.beginPath();ctx.roundRect(-13,2,26,45,7);ctx.fill();ctx.stroke();ctx.strokeStyle='#eaffff';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#f4bc4b';ctx.beginPath();ctx.roundRect(-15,34,30,9,3);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(410,52);
    const base=ctx.createRadialGradient(-8,-10,2,0,0,29);base.addColorStop(0,'#fff5bc');base.addColorStop(.55,'#ffcb51');base.addColorStop(1,'#e27e16');
    ctx.fillStyle=base;ctx.strokeStyle='#082140';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff3b3';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=powers?.length?paletteFor('POWER',powers[0]).middle:'#178ae0';ctx.strokeStyle='#174377';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#c9fbff';ctx.beginPath();ctx.arc(-3,-4,4,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function drawBalls(ctx, board, cache, quiet) {
    const live=new Set(),powers=[...new Set(board.activePowers||[])];
    const primary=['ghost','fireball','blast','magnet','echo','multiball','guide'].find(id=>powers.includes(id));
    const palette=primary?paletteFor('POWER',primary):{light:'#ffffff',middle:'#fffdea',dark:'#a0e9ff',glow:'#fff0a9'};
    board.balls.forEach((ball,index)=>{
      const id=ball.id??index;live.add(id);
      let trail=cache.trails.get(id)||[];
      const last=trail[trail.length-1];
      if(last&&Math.hypot(last.x-ball.x,last.y-ball.y)>160)trail=[];
      if(!last||Math.hypot(last.x-ball.x,last.y-ball.y)>1)trail.push({x:ball.x,y:ball.y});
      trail=trail.slice(-17);cache.trails.set(id,trail);
      if(!quiet&&trail.length>1) {
        ctx.save();ctx.lineCap='round';
        for(let i=1;i<trail.length;i++) {
          const strength=i/trail.length;ctx.globalAlpha=strength*(primary==='ghost' ? .34 : .62);ctx.strokeStyle=powers.length?paletteFor('POWER',powers[(i+index)%powers.length]).middle:'#90dcff';ctx.lineWidth=1+strength*6;ctx.beginPath();ctx.moveTo(trail[i-1].x,trail[i-1].y);ctx.lineTo(trail[i].x,trail[i].y);ctx.stroke();
          ctx.strokeStyle='#ffffff';ctx.lineWidth=strength*2.5;ctx.stroke();
        }
        ctx.restore();
      }
      const r=ball.radius||7;ctx.save();ctx.translate(ball.x,ball.y);ctx.globalAlpha=primary==='ghost' ? .66 : 1;ctx.shadowColor=palette.glow;ctx.shadowBlur=quiet?0:17;
      const fill=ctx.createRadialGradient(-r*.3,-r*.4,0,0,0,r+1);fill.addColorStop(0,palette.light);fill.addColorStop(.65,palette.middle);fill.addColorStop(1,palette.dark);
      ctx.fillStyle=fill;ctx.strokeStyle='#082241';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r+1,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();
      if(powers.length) {
        ctx.globalAlpha=.9;ctx.lineWidth=1.6;ctx.setLineDash(primary==='ghost'?[3,3]:[]);
        powers.forEach((power,i)=>{ctx.strokeStyle=paletteFor('POWER',power).light;ctx.beginPath();const start=i*Math.PI*2/powers.length;ctx.arc(0,0,r+4,start,start+Math.PI*2/powers.length-.12);ctx.stroke();});ctx.setLineDash([]);
      }
      ctx.restore();
    });
    for(const id of cache.trails.keys())if(!live.has(id))cache.trails.delete(id);
  }
  function drawObjectivePegHighlight(ctx,peg,objective,options) {
    if(!ctx||!peg||!K.isObjectivePeg({objective},peg))return;
    options=options||{};
    const specific=objective==='targets'||objective==='gems',score=objective==='score';
    const color=objective==='targets'?'#ffe65e':objective==='gems'?'#e6adff':'#a3f4ff';
    const bright=objective==='targets'?'#fff8c8':objective==='gems'?'#f8e9ff':'#e6fdff';
    const strength=options.reducedMotion?1:.92+Math.sin((options.phaseTime||0)*1.8)*.08;
    const outlined={...peg,radius:peg.radius+(specific?5:4)};
    ctx.save();ctx.translate(peg.x,peg.y);ctx.lineCap='round';ctx.lineJoin='round';
    // The ring sits outside the peg, keeping its shape and symbol readable.
    if(!score) {
      ctx.globalAlpha=(specific ? .23 : .13)*strength;ctx.strokeStyle=color;ctx.lineWidth=specific?9:6;
      ctx.shadowColor=color;ctx.shadowBlur=options.reducedMotion?0:specific?9:4;
      shape(ctx,outlined);ctx.stroke();ctx.shadowBlur=0;
    }
    ctx.globalAlpha=(score ? .72 : 1)*strength;shape(ctx,outlined);
    ctx.strokeStyle='#061329';ctx.lineWidth=specific?6:4;ctx.stroke();
    ctx.strokeStyle=color;ctx.lineWidth=specific?3.4:score?1.7:2.4;ctx.stroke();
    if(specific){ctx.strokeStyle=bright;ctx.lineWidth=1;ctx.stroke();}
    ctx.restore();
  }
  function drawObjectiveHighlights(canvas,board,options) {
    if(!canvas||!board)return;
    options=options||{};const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    if(options.clear!==false)ctx.clearRect(0,0,canvas.width,canvas.height);
    const scale=Math.min(canvas.width/K.W,canvas.height/K.H);
    ctx.setTransform(scale,0,0,scale,(canvas.width-K.W*scale)/2,(canvas.height-K.H*scale)/2);
    for(const peg of board.pegs||[])drawObjectivePegHighlight(ctx,peg,board.level?.objective||board.objective,options);
    ctx.restore();
  }
  function draw(canvas, board, options) {
    if(!canvas||!board)return;
    options=options||{};
    let cache=caches.get(board);if(!cache){cache={trails:new Map()};caches.set(board,cache);}
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    const scale=Math.min(canvas.width/K.W,canvas.height/K.H);
    ctx.setTransform(scale,0,0,scale,(canvas.width-K.W*scale)/2,(canvas.height-K.H*scale)/2);
    ctx.strokeStyle='#9bd9ff66';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(3,80);ctx.lineTo(3,K.H-2);ctx.lineTo(K.W-3,K.H-2);ctx.lineTo(K.W-3,80);ctx.stroke();
    drawCatcher(ctx,board.catcher,options.reducedMotion);
    board.pegs.forEach(peg=>peg.hit&&peg.type!=='BLOCK'?drawBreakingPeg(ctx,peg,board,options):drawPeg(ctx,peg,board.pegs.length>90));
    drawPegDepartures(ctx,options);
    if(board.status==='aim'&&options.showPrediction!==false)drawPrediction(ctx,board,cache,options);
    drawLauncher(ctx,board.angle,board.status==='aim'?board.pendingPowers:board.activePowers);
    drawBalls(ctx,board,cache,options.reducedMotion);
    drawImpacts(ctx,options);
    ctx.globalAlpha=1;ctx.restore();
  }
  function drawPegIcon(canvas,type,power) {
    if(!canvas)return;
    canvas.width=140;canvas.height=140;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.save();ctx.clearRect(0,0,140,140);ctx.scale(2,2);
    drawPeg(ctx,{x:35,y:35,radius:22,type:palettes[type]?type:'NORMAL',power,shape:'CIRCLE',hit:false},true);
    ctx.restore();
  }
  window.PeggleRenderer={draw,drawPeg,drawPegIcon,drawObjectivePegHighlight,drawObjectiveHighlights,pegPalette:paletteFor};
})();
