/* Battleboats presentation: decorative SVG ships and bounded, cancellable effects.
   Hidden enemy ships never enter the presentation layer until sunk or game over. */
window.BattlePresentation = (() => {
    const timers = new Set();
    const boards = new Map();
    const soundNames = ['launch', 'hit', 'miss', 'sunk', 'sonar'];
    let volume = .55;
    let reduced = false;
    let svgSerial = 0;

    function later(callback, delay) {
        const id = setTimeout(() => { timers.delete(id); callback(); }, delay);
        timers.add(id);
        return id;
    }
    function clearEffects() {
        timers.forEach(clearTimeout);
        timers.clear();
        document.querySelectorAll('.ship-reveal').forEach(el=>el.classList.remove('ship-reveal'));
        document.querySelectorAll('.shot-effect, .shot-tracer').forEach(el => el.remove());
        window.SafeAudio?.stopAll();
    }
    function configure(settings) {
        reduced = settings.motion === 'reduced' ||
            (settings.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.body.classList.toggle('reduced-motion', reduced);
        document.body.classList.toggle('motion-full', settings.motion === 'full');
        volume = [0.25, 0.55, 0.85][settings.volumeIndex] ?? .55;
        window.SafeAudio?.setEnabled(settings.sound);
        if (reduced) document.querySelectorAll('.shot-effect, .shot-tracer').forEach(el => el.remove());
    }
    function sound(type) {
        if (!window.SafeAudio) return;
        const name = ({scan:'hover', place:'score', error:'bust'})[type] || type;
        SafeAudio.play(soundNames.includes(name) ? 'boats-' + name : name,
            volume * (type === 'scan' ? .22 : .8));
    }
    function shipSVG(ship, vertical = false) {
        const w = ship.length * 100;
        const id='vessel-'+(++svgSerial);
        const gradients='<defs><linearGradient id="'+id+'-hull" x2="0" y2="1"><stop stop-color="#527b88"/><stop offset=".48" stop-color="#22444f"/><stop offset="1" stop-color="#102d3b"/></linearGradient><linearGradient id="'+id+'-deck" x2="0" y2="1"><stop stop-color="#a9c6cb"/><stop offset=".18" stop-color="#7b9da6"/><stop offset=".8" stop-color="#527783"/><stop offset="1" stop-color="#355c6b"/></linearGradient></defs>';
        const rail='<path d="M51 44 L77 30 H'+(w-38)+' M51 56 L77 70 H'+(w-38)+'" fill="none" stroke="#d9f1ed" stroke-width="1.4" opacity=".45"/>' + Array.from({length:ship.length*3},(_,i)=>'<circle cx="'+(76+i*23)+'" cy="'+(i%2?76:24)+'" r="1.5" fill="#e5f7f0" opacity=".6"/>').join('');
        const carrier = ship.id === 'carrier';
        const sub = ship.id === 'submarine';
        const hull = sub
            ? '<path d="M20 50 Q25 15 70 18 H' + (w-65) + ' Q' + (w+4) + ' 50 ' + (w-65) + ' 82 H70 Q25 85 20 50Z" fill="#243f50" stroke="#aac8cd" stroke-width="3"/>'
            : '<path d="M12 50 L65 13 L' + (w-34) + ' 18 L' + (w-12) + ' 31 V69 L' + (w-34) + ' 82 L65 87Z" fill="#284959" stroke="#bdd9df" stroke-width="3"/><path d="M28 50 L71 25 L' + (w-30) + ' 28 V72 L71 75Z" fill="#668994"/>';
        const deck = carrier
            ? '<path d="M57 31 H' + (w-40) + ' V68 H57Z" fill="#294753"/><path d="M67 51 H' + (w-48) + '" stroke="#f9dea1" stroke-width="2" stroke-dasharray="15 10"/><path d="M100 32 V68 M120 32 V68" stroke="#f0f2e0" stroke-width="2"/><rect x="' + (w*.58) + '" y="19" width="70" height="17" rx="4" fill="#a4b9b9"/><path d="M260 60 l10 -14 10 14 -10 -4Z M330 60 l10 -14 10 14 -10 -4Z" fill="#b5ced0"/>'
            : sub
                ? '<rect x="' + (w*.43) + '" y="32" width="64" height="36" rx="16" fill="#7298a3"/><path d="M' + (w*.53) + ' 48 v-23 h18" fill="none" stroke="#d6e8e8" stroke-width="5"/><path d="M70 34 v32 M' + (w-55) + ' 30 v40" stroke="#557887" stroke-width="4"/>'
                : '<rect x="' + (w*.38) + '" y="31" width="' + (w*.28) + '" height="38" rx="6" fill="#a6bdc2" stroke="#395766" stroke-width="3"/><rect x="' + (w*.46) + '" y="36" width="28" height="28" rx="4" fill="#355664"/><path d="M' + (w*.52) + ' 50 v-25" stroke="#e2eeed" stroke-width="3"/>' +
                    [0.24, 0.78].map(p => '<circle cx="' + (w*p) + '" cy="50" r="13" fill="#9fb4b8" stroke="#284656" stroke-width="3"/><path d="M' + (w*p) + ' 46 h-24 M' + (w*p) + ' 54 h-24" stroke="#d8e5e4" stroke-width="4"/>').join('');
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (vertical ? '100 '+w : w+' 100') + '" preserveAspectRatio="none" aria-hidden="true"><g' + (vertical ? ' transform="translate(100 0) rotate(90)"' : '') + '>' +
            '<path d="M0 50 Q10 0 90 4 H' + (w-25) + ' Q' + (w+32) + ' 50 ' + (w-25) + ' 96 H90 Q10 100 0 50" fill="#8ce7e5" opacity=".08"/>' + gradients + hull.replaceAll('#284959','url(#'+id+'-hull)').replaceAll('#668994','url(#'+id+'-deck)') + rail + deck + '</g></svg>';
    }
    function paintShips(grid, fleet) {
        if (!grid) return;
        let layer = grid.querySelector('.fleet-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'fleet-layer';
            layer.setAttribute('aria-hidden','true');
            grid.append(layer);
        }
        for (const hull of Array.from(layer.children)) {
            if (!fleet.some(ship=>ship.id===hull.dataset.ship)) hull.remove();
        }
        for (const ship of fleet) {
            if (!ship.coords?.length) continue;
            const first = ship.coords[0], last = ship.coords[ship.coords.length - 1];
            const a = grid.querySelector('.grid-cell[data-row="'+first.row+'"][data-col="'+first.col+'"]');
            const b = grid.querySelector('.grid-cell[data-row="'+last.row+'"][data-col="'+last.col+'"]');
            if (!a || !b) continue;
            let hull=layer.querySelector('[data-ship="'+ship.id+'"]');
            if (!hull) {
                hull=document.createElement('div');
                hull.className='fleet-vessel';
                hull.dataset.ship=ship.id;
                layer.append(hull);
            }
            if (ship.sunk && !hull.classList.contains('wreck')) {
                hull.classList.add('ship-reveal');
                later(()=>hull.classList.remove('ship-reveal'),1300);
            }
            hull.classList.toggle('wreck',!!ship.sunk);
            hull.style.cssText = 'left:'+a.offsetLeft+'px;top:'+a.offsetTop+'px;width:'+(b.offsetLeft+b.offsetWidth-a.offsetLeft)+'px;height:'+(b.offsetTop+b.offsetHeight-a.offsetTop)+'px';
            const vertical=first.col===last.col;
            if(hull.dataset.direction!==String(vertical)) {
                hull.innerHTML=shipSVG(ship,vertical);
                hull.dataset.direction=String(vertical);
            }
        }
    }
    const resize = new ResizeObserver(entries => {
        for (const {target} of entries) paintShips(target, boards.get(target) || []);
    });
    function renderFleet(grid, fleet) {
        if (!grid) return;
        if (!boards.has(grid)) resize.observe(grid);
        boards.set(grid, fleet);
        paintShips(grid, fleet);
    }
    function markLast(grid,row,col) {
        grid.querySelectorAll('.last-shot').forEach(el=>el.classList.remove('last-shot'));
        const tile = grid.querySelector('.grid-cell[data-row="'+row+'"][data-col="'+col+'"]');
        tile?.classList.add('last-shot');
        return tile;
    }
    function launch(grid,row,col) {
        const tile = markLast(grid,row,col);
        if (!tile) return;
        sound('launch');
        if (reduced) return;
        const tracer = document.createElement('div');
        tracer.className = 'shot-tracer';
        tracer.setAttribute('aria-hidden','true');
        tracer.style.left = (tile.offsetLeft+tile.offsetWidth/2)+'px';
        tracer.style.top = (tile.offsetTop+tile.offsetHeight/2)+'px';
        grid.append(tracer);
        later(()=>tracer.remove(),420);
    }
    function impact(grid,row,col,type) {
        const tile = markLast(grid,row,col);
        sound(type);
        if (!tile || reduced) return;
        const effect = document.createElement('div');
        effect.className = 'shot-effect ' + type;
        effect.setAttribute('aria-hidden','true');
        effect.style.cssText = 'left:'+(tile.offsetLeft+tile.offsetWidth/2)+'px;top:'+(tile.offsetTop+tile.offsetHeight/2)+'px';
        effect.innerHTML = '<i class="impact-core"></i><i class="impact-ring"></i>' +
            Array.from({length:type==='sunk'?16:10},(_,i)=>'<i class="impact-particle" style="--angle:'+(i*137.5)+'deg;--distance:'+(28+i%5*13)+'px;--delay:'+(i%3*35)+'ms"></i>').join('');
        grid.append(effect);
        later(()=>effect.remove(),1700);
    }
    function report(side, row, col, type, shipLabel) {
        const host = document.getElementById(side+'Report');
        if (!host) return;
        host.dataset.result = type;
        host.querySelector('.report-title').textContent = {hit:'DIRECT HIT',miss:'OPEN WATER',sunk:'SHIP SUNK'}[type];
        host.querySelector('.report-detail').textContent = String.fromCharCode(65+row)+(col+1)+' / '+(type==='sunk'?shipLabel+' revealed':type==='hit'?'Damage confirmed':'Splash. Keep searching.');
    }
    function stats(host, attacks, fleet) {
        const list = attacks.flat();
        const shots = list.filter(c=>c.fired || c.hit || c.miss).length;
        const hits = list.filter(c=>c.hit).length;
        const sunk = fleet.filter(s=>s.sunk).length;
        host.innerHTML = '<div><strong>'+shots+'</strong><span>SHOTS</span></div><div><strong>'+(shots?Math.round(hits/shots*100):0)+'%</strong><span>ACCURACY</span></div><div><strong>'+sunk+' / 5</strong><span>SUNK</span></div>';
    }
    function fleetStatus(host,fleet,prefix) {
        if (!host) return;
        host.replaceChildren();
        for (const ship of fleet) {
            const icon = document.createElement('div');
            icon.id = prefix+'-ship-'+ship.id;
            icon.className = 'ship-icon'+(ship.sunk?' sunk':'');
            icon.setAttribute('aria-label',ship.label+', '+ship.length+' squares, '+(ship.sunk?'sunk':'afloat'));
            icon.innerHTML = '<span class="status-silhouette">'+shipSVG(ship)+'</span><span class="ship-icon-name">'+ship.label+'</span><span class="ship-pips">'+
                Array.from({length:ship.length},()=>'<i></i>').join('')+'</span><span class="fleet-condition">'+(ship.sunk?'SUNK':'AFLOAT')+'</span>';
            host.append(icon);
        }
    }
    function reset() {
        clearEffects();
        document.querySelectorAll('.shot-report').forEach(host=>{
            host.dataset.result='ready';
            host.querySelector('.report-title').textContent='Awaiting orders';
            host.querySelector('.report-detail').textContent='The ocean is quiet.';
        });
        boards.clear();
        resize.disconnect();
    }
    document.addEventListener('DOMContentLoaded',()=>{
        soundNames.forEach(name=>window.SafeAudio?.preload('boats-'+name,'audio/'+name+'.wav'));
        ['hover','select','score','bust','win','lose'].forEach(name=>window.SafeAudio?.preload(name));
        document.getElementById('heroShip').innerHTML=shipSVG({id:'battleship',length:4});
    });
    return {configure,sound,shipSVG,renderFleet,launch,impact,report,stats,fleetStatus,reset,clearEffects,
        get reduced(){return reduced;}};
})();
