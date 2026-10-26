/** Visual loop builder. Every surface uses the hub's shared choice scan. */
window.NL = window.NL || {};
NL.UI = (function () {
    'use strict';
    const SCREENS = ['menu', 'beat', 'row', 'sounds', 'add', 'loops', 'pause', 'settings', 'help'];
    let screen = 'menu', settingsFrom = 'menu', helpFrom = 'menu', pauseFrom = 'beat';
    let currentLayer = null, editingLayer = null, clearArmed = false, removeArmed = false, col = -1;
    let pickerItems = [], loopItems = [], loopsFrom = 'menu';
    let rowReturnStarted = null, rowReturnDuration = 0;
    const el = { rows: {} };
    function S() { return NL.Settings; }
    function M() { return NL.Music; }
    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }

    function button(cls, parent, label) {
        const b = node('button', 'nl-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }

    /** A button with a label and a smaller value line under it. */
    function valueButton(cls, parent, label, tone) {
        const b = button(cls, parent);
        if (tone) b.style.setProperty('--tone', tone);
        node('span', 'nl-btn-label', b, label);
        node('span', 'nl-btn-value', b, '');
        return b;
    }
    function setValue(b, label, value) {
        b.querySelector('.nl-btn-label').textContent = label;
        const v = b.querySelector('.nl-btn-value');
        v.textContent = value || '';
        v.hidden = !value;
    }

    function onOff(v) { return v ? 'On' : 'Off'; }


    function bar(parent, title) {
        const h = node('header', 'nl-bar', parent);
        const t = node('h1', 'nl-bar-title', h, title);
        node('div', 'nl-status-slot', h);
        return t;
    }

    function card(parent, title) {
        const c = node('div', 'nl-card', parent);
        const top = node('div', 'nl-card-top', c);
        const t = node('h2', 'nl-title', top, title || '');
        node('div', 'nl-status-slot', top);
        c._title = t;
        return c;
    }


    // Small, local vector pictures: no external images or missing assets.
    const drawings = {
        kick: '<circle cx="48" cy="48" r="31"/><circle cx="48" cy="48" r="21"/><path d="M23 75l-7 12m57-12 7 12M48 58v24m-8 0h16"/>',
        snare: '<ellipse cx="48" cy="34" rx="34" ry="13"/><path d="M14 34v30c0 18 68 18 68 0V34M19 49l12 22 17-22 17 22 12-22M17 10l50 18M79 10 29 28"/>',
        hat: '<path d="M48 9v76M38 85h20M10 34q38-32 76 0-38 14-76 0zM10 48q38 14 76 0"/>',
        clap: '<path d="m16 64 17-26q5-7 10-2l-7 16 17-28q5-6 10-1L48 53l16-23q5-5 9 0L58 60l12-13q6-4 10 1L60 79q-15 14-31 0zM16 20l9 8M39 5l1 13M77 8l-8 10"/>',
        shaker: '<path d="m25 15 49 16-18 55L7 70zM23 26l46 15M12 59l47 15M80 17l7-6M84 50h8M72 79l7 7"/><circle cx="37" cy="46" r="2"/><circle cx="47" cy="57" r="2"/><circle cx="28" cy="58" r="2"/>',
        bell: '<path d="M19 68h58L67 51V35a19 19 0 0 0-38 0v16zM39 77q9 15 18 0M44 13V7h8v6"/>',
        pluck: '<path d="M48 11v74M17 48h62M25 25l46 46M25 71l46-46"/><circle cx="48" cy="48" r="12"/>',
        bass: '<path d="M9 58q10-61 20 0t20 0 20 0 18 0M9 82h78"/>',
        melody: '<path d="M35 68V23l42-10v45M35 34l42-10"/><ellipse cx="24" cy="71" rx="11" ry="8"/><ellipse cx="66" cy="61" rx="11" ry="8"/>'
    };
    function picture(parent, kind, variant) {
        const art = node('span', 'nl-picture', parent);
        art.setAttribute('aria-hidden', 'true');
        art.dataset.variant = variant || 0;
        art.innerHTML = '<svg viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' + (drawings[kind] || drawings.melody) + '</svg>';
        return art;
    }
    function modal(name, title) {
        el[name] = node('section', 'nl-screen nl-center nl-modal', el.root);
        el[name].setAttribute('role', 'dialog'); el[name].setAttribute('aria-modal', 'true');
        const c = card(el[name], title); c._title.id = 'nl-' + name + '-title';
        el[name].setAttribute('aria-labelledby', c._title.id);
        return c;
    }
    function build() {
        el.root = document.getElementById('nl'); applyLook();
        el.menu = node('section', 'nl-screen nl-center', el.root);
        const mc = card(el.menu, 'NARBE Loops'); mc.classList.add('nl-card-menu');
        node('p', 'nl-sub', mc, 'Light up a beat. Make it yours.');
        el.tileBeat = button('nl-tile', mc);
        const art = node('span', 'nl-art-grid', el.tileBeat);
        const lit = ['1000100010001000', '0000100000001000', '1010101010101010', '1001001010010010'];
        M().LAYERS.slice(0, 4).forEach((L, r) => {
            for (let i = 0; i < 16; i++) node('i', lit[r][i] === '1' ? 'on' : '', art).style.setProperty('--c', L.color);
        });
        node('span', 'nl-tile-label', el.tileBeat, 'Make a Loop');
        el.menuLoops = button('nl-item', mc, 'Saved Loops');
        const util = node('div', 'nl-util', mc);
        el.menuHelp = button('nl-item', util, 'How to Play');
        el.menuSettings = button('nl-item', util, 'Settings');
        el.menuExit = button('nl-item', util, 'Exit Game');

        el.beat = node('section', 'nl-screen nl-beat', el.root);
        el.beat.setAttribute('aria-label', 'Make a Loop');
        el.grid = node('div', 'nl-grid', el.beat);
        el.addBtn = button('nl-add-line', el.beat, '+ Add a Line');
        el.transport = node('div', 'nl-transport', el.beat);
        node('div', 'nl-status-slot', el.transport);
        el.rowReturn = node('div', 'nl-row-return', el.transport); el.rowReturn.hidden = true;
        node('span', 'nl-row-return-label', el.rowReturn, 'Returning to rows');
        el.rowReturnProgress = node('progress', 'nl-row-return-progress', el.rowReturn);
        el.rowReturnProgress.setAttribute('aria-label', 'Hold Enter to return to row mode');
        el.rowReturnSeconds = node('span', 'nl-row-return-seconds', el.rowReturn);
        el.rowReturnSeconds.setAttribute('aria-hidden', 'true');
        const controls = node('div', 'nl-transport-controls', el.transport);
        el.playBtn = valueButton('nl-ctrl', controls, 'Stop');
        el.speedBtn = valueButton('nl-ctrl', controls, 'Speed');
        el.beatOptions = valueButton('nl-ctrl', controls, 'Options');
        buildRows();

        const rc = modal('row', 'Line'); rc.classList.add('nl-card-narrow'); el.rowTitle = rc._title;
        el.rowPicture = node('div', 'nl-row-picture', rc);
        const actions = node('div', 'nl-list', rc);
        el.muteBtn = button('nl-item', actions, 'Mute');
        el.soundBtn = valueButton('nl-item', actions, 'Change Sound');
        el.nextBtn = button('nl-item', actions, 'Next Pattern');
        el.removeBtn = valueButton('nl-item', actions, 'Remove Line', '#ff817a');
        el.rowBack = button('nl-item nl-item-nav', actions, 'Back');
        const sc = modal('sounds', 'Change Sound'); el.soundTitle = sc._title;
        el.soundGrid = node('div', 'nl-picker-grid', sc);
        el.soundBack = button('nl-item nl-item-nav', sc, 'Back');
        const ac = modal('add', 'Add a Line');
        el.addGrid = node('div', 'nl-picker-grid', ac);
        el.addBack = button('nl-item nl-item-nav', ac, 'Back');

        el.loops = node('section', 'nl-screen nl-center', el.root);
        const lc = card(el.loops, 'Saved Loops');
        el.loopsNote = node('p', 'nl-sub', lc);
        el.loopsGrid = node('div', 'nl-template-grid', lc);
        el.loopsBack = button('nl-item nl-item-nav', lc, 'Back');

        el.pause = node('section', 'nl-screen nl-center', el.root);
        const pc = card(el.pause, 'Paused'); pc.classList.add('nl-card-narrow'); el.pauseList = node('div', 'nl-list', pc);
        el.pauseNote = node('p', 'nl-sub', pc); el.pauseNote.hidden = true;
        el.settings = node('section', 'nl-screen nl-center', el.root);
        const stc = card(el.settings, 'Settings'); stc.classList.add('nl-card-wide'); el.settingsList = node('div', 'nl-settings-list', stc);
        el.help = node('section', 'nl-screen nl-center', el.root);
        const hc = card(el.help, ''); hc.classList.add('nl-card-narrow');
        el.helpTitle = button('nl-help-title', hc, 'How to Play');
        el.helpBody = node('div', 'nl-help-body', hc);
        el.helpBack = button('nl-item nl-item-nav', hc, 'Back');
        try { window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues); window.NarbeScanManager.subscribe(refreshSettingsValues); } catch (e) { /* managers unavailable */ }
        requestAnimationFrame(frame);
    }
    function buildRows() {
        el.grid.replaceChildren(); el.rows = {}; col = -1;
        NL.Beat.lines().forEach(function (L) {
            const row = node('div', 'nl-row', el.grid); row.dataset.line = L.id; row.style.setProperty('--c', L.color);
            row.setAttribute('role', 'group'); row.setAttribute('aria-label', L.name);
            const b = button('nl-layer-btn', row); b.dataset.lineName = L.id;
            picture(b, L.icon);
            node('span', 'nl-layer-name', b, L.name);
            const status = node('span', 'nl-layer-status', b);
            const cells = node('div', 'nl-cells', row), list = [];
            b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openRowMenu(L); });
            for (let i = 0; i < 16; i++) {
                const cell = node('button', 'nl-cell' + (i % 4 === 0 ? ' q' : ''), cells);
                cell.type = 'button'; cell.dataset.step = i;
                node('span', 'nl-cell-number', cell, String(i + 1));
                node('span', 'nl-pip', cell);
                cell.addEventListener('click', function (e) {
                    e.preventDefault(); e.stopPropagation();
                    if (!editingLayer || editingLayer.id !== L.id) openLine(L);
                    NL.Input.focusInGroup('pattern:step:' + i); togglePatternStep(L, i);
                });
                list.push(cell);
            }
            el.rows[L.id] = { row, btn: b, status, cells: list };
        });
    }
    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings(); NL.Input.refresh(false);
    }
    function applyLook() { document.documentElement.dataset.look = S().get('look'); }
    function current() { return screen; }
    function isLoopSurface(name) { return ['beat', 'row', 'sounds', 'add'].includes(name); }
    function show(name, returning) {
        const wasLoop = isLoopSurface(screen), overlay = ['row', 'sounds', 'add'].includes(name);
        screen = name; editingLayer = null; removeArmed = false;
        SCREENS.forEach(k => el[k].classList.toggle('show', k === name || (k === 'beat' && overlay)));
        el.beat.inert = overlay;
        el.beat.setAttribute('aria-hidden', String(overlay));
        el.root.dataset.screen = name; el.root.dataset.editing = '';
        if (name !== 'settings') clearArmed = false;
        if (isLoopSurface(name)) {
            if (Object.keys(el.rows).join('|') !== NL.Beat.lines().map(L => L.id).join('|')) buildRows();
            if (!wasLoop) NL.Beat.enter();
            refreshBeat();
        } else NL.Sound.stop();
        if (name === 'row') renderRowMenu();
        if (name === 'sounds' || name === 'add') renderPicker(name);
        if (name === 'pause') renderPause();
        if (name === 'loops') renderLoops();
        if (name === 'settings') renderSettings();
        if (name === 'help') renderHelp();
        NL.Input.refresh(true);
        if (!returning) el[name].scrollTop = 0;
        const arrival = {menu: 'NARBE Loops. Make a loop.', beat: 'Make a loop.', row: currentLayer && currentLayer.name + '. Line options.',
            sounds: currentLayer && currentLayer.name + '. Choose a sound for the whole line.', add: 'Add a line. Choose an instrument.',
            loops: 'Saved loops. Choose a picture to open a loop.', pause: 'Paused.', settings: 'Settings.', help: 'How to play. Choose the title to hear the directions.'}[name];
        if (!returning && arrival) NL.Input.announce(arrival);
    }
    function onScan(state, context) {
        if (screen === 'settings' && state.id !== 'set:clear' && clearArmed) {
            clearArmed = false;
            const value = el.settingsList.querySelector('[data-setting="clear"] .nl-set-value');
            if (value) value.textContent = 'Choose twice';
        }
        if (screen === 'row' && state.id !== 'row:remove' && removeArmed) { removeArmed = false; renderRowMenu(); }
        if (screen === 'beat') {
            const key = context && context.key || '';
            editingLayer = key.startsWith('beat:line:') ? NL.Beat.line(key.slice(10)) : null;
            el.root.dataset.editing = editingLayer ? editingLayer.id : '';
            Object.values(el.rows).forEach(r => r.row.classList.toggle('editing', !!editingLayer && r.row.dataset.line === editingLayer.id));
        }
    }
    function menuScannables() {
        return [
            { id: 'menu:beat', el: el.tileBeat, speak: 'Make a Loop', action: () => NL.Game.openBeat() },
            { id: 'menu:loops', el: el.menuLoops, speak: 'Saved Loops', action: () => { loopsFrom = 'menu'; show('loops'); } },
            { id: 'menu:help', el: el.menuHelp, speak: 'How to Play', action: () => { helpFrom = 'menu'; show('help'); } },
            { id: 'menu:settings', el: el.menuSettings, speak: 'Settings', action: () => { settingsFrom = 'menu'; show('settings'); } },
            { id: 'menu:exit', el: el.menuExit, speak: 'Exit Game', action: () => NL.Game.exit() }
        ];
    }
    function refreshBeat() {
        NL.Beat.lines().forEach(function (L) {
            const r = el.rows[L.id], p = NL.Beat.displayPattern(L);
            r.status.textContent = NL.Beat.isMuted(L) ? 'Muted' : NL.Beat.layerSoundName(L);
            r.btn.setAttribute('aria-label', L.name + ', line options');
            r.row.classList.toggle('muted', NL.Beat.isMuted(L));
            r.cells.forEach(function (c, i) {
                const on = p[i] >= 0; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on));
                c.setAttribute('aria-label', L.name + ', Spot ' + (i + 1) + ', ' + onOff(on));
            });
        });
        el.addBtn.disabled = NL.Beat.lines().length >= NL.Beat.MAX_LINES;
        el.addBtn.textContent = el.addBtn.disabled ? '8 lines · Remove one to add another' : '+ Add a Line';
        setValue(el.playBtn, NL.Beat.isPlaying() ? '■ Stop' : '▶ Play', '');
        setValue(el.speedBtn, 'Speed', NL.Beat.speedName());
    }
    function beatScannables() {
        const list = NL.Beat.lines().map(L => ({ id: 'beat:' + L.id, el: el.rows[L.id].row,
            speak: () => L.name + ', ' + NL.Beat.status(L), action: () => openLine(L) }));
        if (!el.addBtn.disabled) list.push({ id: 'beat:add', el: el.addBtn, speak: 'Add a Line', action: () => show('add') });
        return list.concat([
            { id: 'beat:play', el: el.playBtn, speak: () => NL.Beat.isPlaying() ? 'Stop' : 'Play', action: () => {
                const on = NL.Beat.togglePlay(); refreshBeat(); NL.Input.announce(on ? 'Playing.' : 'Stopped.'); } },
            { id: 'beat:speed', el: el.speedBtn, speak: () => 'Speed, ' + NL.Beat.speedName(), action: () => {
                NL.Beat.cycleSpeed(); refreshBeat(); NL.Input.announce('Speed, ' + NL.Beat.speedName()); } },
            { id: 'beat:options', el: el.beatOptions, speak: 'Options', action: () => NL.Game.pause() }
        ]);
    }
    function openLine(L) {
        NL.Input.leaveGroups(); NL.Input.align('beat:' + L.id);
        NL.Input.enterGroup('beat:line:' + L.id, [
            { id: 'line:name', el: el.rows[L.id].btn, speak: L.name + ', line options', action: () => openRowMenu(L) },
            ...el.rows[L.id].cells.map((cell, i) => ({ id: 'pattern:step:' + i, el: cell, quiet: true,
                speak: () => 'Spot ' + (i + 1) + ', ' + onOff(NL.Beat.displayPattern(L)[i] >= 0), action: () => togglePatternStep(L, i) }))
        ]);
    }
    function togglePatternStep(L, i) { const on = NL.Beat.toggleStep(L, i); refreshBeat(); NL.Input.announce('Spot ' + (i + 1) + ', ' + onOff(on)); }
    function openRowMenu(L) { currentLayer = L; show('row'); }
    function returnToLine() { const L = NL.Beat.line(currentLayer.id); show('beat', true); if (L) openLine(L); }
    function renderRowMenu() {
        const L = currentLayer; refreshBeat(); el.rowTitle.textContent = L.name;
        el.rowPicture.replaceChildren(); el.rowPicture.style.setProperty('--c', L.color); picture(el.rowPicture, L.icon);
        el.muteBtn.textContent = NL.Beat.isMuted(L) ? 'Unmute' : 'Mute';
        setValue(el.soundBtn, 'Change Sound', NL.Beat.layerSoundName(L));
        setValue(el.removeBtn, 'Remove Line', removeArmed ? 'Choose again to remove' : 'Choose twice');
    }
    function rowScannables() {
        const L = currentLayer;
        return [
            { id: 'row:mute', el: el.muteBtn, speak: () => NL.Beat.isMuted(L) ? 'Unmute' : 'Mute', action: () => {
                NL.Beat.toggleMute(L); renderRowMenu(); NL.Input.announce(L.name + (NL.Beat.isMuted(L) ? ', muted.' : ', on.')); } },
            { id: 'row:sound', el: el.soundBtn, speak: () => 'Change Sound, ' + NL.Beat.layerSoundName(L), action: () => show('sounds') },
            { id: 'row:next', el: el.nextBtn, speak: 'Next Pattern', action: () => {
                NL.Beat.nextPattern(L); renderRowMenu(); NL.Input.announce(L.name + ', ' + NL.Beat.status(L)); } },
            { id: 'row:remove', el: el.removeBtn, speak: () => removeArmed ? 'Choose again to remove ' + L.name : 'Remove Line', action: () => {
                if (!removeArmed) { removeArmed = true; renderRowMenu(); NL.Input.announce('Remove ' + L.name + '? Choose again to remove this line.'); return; }
                NL.Beat.removeLine(L); show('beat'); NL.Input.announce(L.name + ' removed.');
            } },
            { id: 'row:back', el: el.rowBack, speak: 'Back', action: returnToLine }
        ];
    }
    function preview(L, sound) { NL.Sound.shot(L, L.type === 'drum' ? 0 : L.contour[0], sound); }
    function renderPicker(name) {
        const adding = name === 'add', grid = adding ? el.addGrid : el.soundGrid;
        grid.replaceChildren();
        const choices = adding ? M().ADD_OPTIONS.map(option => ({
            id: option.id, label: option.name, L: M().line(option.id, option.id), sound: option.sound
        })) : M().sounds(currentLayer).map((label, sound) => ({ id: String(sound), label, L: currentLayer, sound }));
        if (!adding) el.soundTitle.textContent = currentLayer.name + ' · Change Sound';
        pickerItems = choices.map(choice => {
            const b = button('nl-picture-choice', grid); b.style.setProperty('--c', choice.L.color); b.dataset.choice = choice.id;
            let icon = choice.L.icon;
            if (!adding) icon = {snare: ['snare', 'clap', 'snare', 'shaker'], hat: ['hat', 'hat', 'shaker', 'hat'], melody: ['melody', 'bell', 'pluck', 'melody']}[choice.L.instrument]?.[choice.sound] || icon;
            picture(b, icon, choice.sound); node('span', 'nl-choice-label', b, choice.label);
            if (!adding) {
                b.setAttribute('aria-pressed', String(choice.sound === NL.Beat.soundIndex(currentLayer)));
                node('span', 'nl-choice-selected', b, choice.sound === NL.Beat.soundIndex(currentLayer) ? '✓ In use' : '');
            }
            return { id: name + ':' + choice.id, el: b, quiet: true, speak: choice.label,
                onFocus: () => preview(choice.L, choice.sound), action: () => {
                    if (adding) {
                        const added = NL.Beat.addLine(choice.id); show('beat');
                        NL.Input.announce(added ? added.name + ' added. Choose its spots to make a beat.' : 'Eight lines. Remove a line to add another.');
                    } else {
                        NL.Beat.setSound(currentLayer, choice.sound);
                        refreshBeat();
                        // Apply in place so choices can be compared against the playing beat.
                        Array.from(grid.children).forEach((tile, i) => {
                            tile.setAttribute('aria-pressed', String(i === choice.sound));
                            tile.querySelector('.nl-choice-selected').textContent = i === choice.sound ? '✓ In use' : '';
                        });
                        NL.Input.announce(choice.label + '. Applied to the whole line.');
                    }
                } };
        });
        pickerItems.push({ id: name + ':back', el: adding ? el.addBack : el.soundBack, speak: 'Back', action: () => {
            if (adding) { show('beat', true); NL.Input.align('beat:add'); } else show('row');
        } });
    }
    function moveCol(step) {
        for (const r of Object.values(el.rows)) { if (col >= 0) r.cells[col].classList.remove('now'); if (step >= 0) r.cells[step].classList.add('now'); }
        col = step;
    }
    function beginRowReturn(duration) {
        rowReturnStarted = performance.now(); rowReturnDuration = duration;
        el.rowReturnProgress.max = duration; el.rowReturnProgress.value = 0;
        el.rowReturnSeconds.textContent = Math.ceil(duration / 1000) + 's';
        el.rowReturn.hidden = false; el.transport.classList.add('returning');
    }
    function endRowReturn() {
        rowReturnStarted = null;
        if (el.rowReturn) { el.rowReturn.hidden = true; el.transport.classList.remove('returning'); }
    }
    function frame() {
        requestAnimationFrame(frame);
        if (rowReturnStarted !== null) {
            const elapsed = Math.min(rowReturnDuration, performance.now() - rowReturnStarted);
            el.rowReturnProgress.value = elapsed;
            el.rowReturnSeconds.textContent = Math.ceil((rowReturnDuration - elapsed) / 1000) + 's';
        }
        const step = isLoopSurface(screen) && NL.Beat.isPlaying() ? NL.Beat.currentStep() : -1;
        if (step !== col) moveCol(step);
    }
    // --- pause ------------------------------------------------------------------------

    let pauseItems = [];

    function renderPause() {
        pauseFrom = NL.Game.pausedFrom();
        el.pauseNote.hidden = true;
        const list = [{ id: 'continue', label: 'Continue', action: function () { NL.Game.resume(); } }];
        list.push(
            { id: 'save', label: 'Save Loop', action: saveLoop },
            { id: 'loops', label: 'Saved Loops', action: () => { loopsFrom = 'pause'; show('loops'); } },
            {
                id: 'need-help', label: 'I Need Help', cls: 'nl-need-help', quiet: true,
                speak: 'I need help. Choose this to call a helper.',
                action: function () {
                    const message = 'I need help, please! I need help, please!';
                    const fallback = function () { return NL.Voice.speak(message, { force: true }); };
                    if (window.NarbeCommunicationSpeech) window.NarbeCommunicationSpeech.help(fallback, message);
                    else fallback();
                }
            },
            { id: 'settings', label: 'Settings', action: function () { settingsFrom = 'pause'; show('settings'); } },
            { id: 'help', label: 'How to Play', action: function () { helpFrom = 'pause'; show('help'); } }
        );
        list.push(
            { id: 'menu', label: 'Main Menu', action: function () { show('menu'); } },
            { id: 'exit', label: 'Exit Game', action: function () { NL.Game.exit(); } }
        );
        el.pauseList.innerHTML = '';
        pauseItems = list.map(function (it) {
            const b = button('nl-item ' + (it.cls || ''), el.pauseList, it.label);
            return { id: 'pause:' + it.id, el: b, speak: it.speak || it.label, quiet: it.quiet, action: it.action };
        });
    }


    function saveLoop() {
        let message;
        try { const saved = NL.Loops.save(); message = 'Loop ' + saved.number + ' saved.'; }
        catch (e) { message = 'Could not save this loop. Check that storage is available.'; }
        el.pauseNote.textContent = message; el.pauseNote.hidden = false;
        NL.Input.announce(message);
    }
    function renderLoops() {
        el.loopsGrid.replaceChildren(); loopItems = [];
        let templates;
        try { templates = NL.Loops.list(); }
        catch (e) { el.loopsNote.textContent = 'Saved loops could not be read.'; templates = null; }
        if (templates) {
            el.loopsNote.textContent = templates.length ? 'Choose a picture to open a loop.' : 'No saved loops yet. Choose Options, then Save Loop, while making a loop.';
            templates.forEach(template => {
                const b = button('nl-template', el.loopsGrid), title = 'Loop ' + template.number;
                b.dataset.template = template.id;
                const art = node('span', 'nl-template-art', b); art.setAttribute('aria-hidden', 'true');
                template.beat.order.forEach(id => {
                    const row = template.beat.layers[id], L = M().line(row.kind, id, row.name), p = row.sel === 'mine' ? row.mine : L.presets[row.sel];
                    const line = node('span', 'nl-template-line' + (row.muted ? ' muted' : ''), art); line.style.setProperty('--c', L.color);
                    p.forEach(value => node('i', value >= 0 ? 'on' : '', line));
                });
                if (!template.beat.order.length) node('span', 'nl-sub', art, 'Empty loop');
                node('span', 'nl-choice-label', b, title);
                node('span', 'nl-btn-value', b, template.beat.order.length + ' lines · ' + M().SPEEDS[template.beat.speedIndex].name);
                loopItems.push({ id: 'loops:' + template.id, el: b, speak: title + ', open loop', action: () => {
                    try { NL.Loops.open(template.id); show('beat'); NL.Input.announce(title + ' opened.'); }
                    catch (e) { el.loopsNote.textContent = 'This loop could not be opened. Your current loop is unchanged.'; NL.Input.announce(el.loopsNote.textContent); }
                } });
            });
        }
        loopItems.push({ id: 'loops:back', el: el.loopsBack, speak: 'Back', action: () => show(loopsFrom) });
    }
    function helpLines() {
        let auto = false;
        try { auto = !!window.NarbeScanManager.getSettings().autoScan; } catch (e) { /* no manager */ }
        return [
            '*Make a Loop*: light up spots to make a beat. Colored lines play together and repeat.',
            'Choose a line. Scan its *name*, then spots *1 to 16*. Choose a spot to turn it on or off. The highlight stays there. Click or tap spots to change them too.',
            'After spot 16, a dashed outline marks *Back*. Choose Back, or hold *Enter for five seconds*, to return to the same line in row mode. A progress bar and countdown show when the return will happen. The moving play light never changes the spot you edit.',
            'Choose or tap a line’s *name* for its options in front of the loop. *Change Sound* changes the whole line while the beat keeps playing. Choose pictures to hear and compare sounds. Back leaves the sound picker, and the row menu’s Back returns to the name tile.',
            '*Add a Line* adds an empty instrument line. You can have up to eight. *Remove Line* needs two selections; moving away cancels the first one.',
            'Your loop saves automatically, including sounds and added lines. *Clear My Loop* in Settings returns to the starting loop after two selections.',
            '*Save Loop* in Options keeps a numbered template. *Saved Loops* on the main menu or in Options shows pictures of your templates. Choose one to reopen it. Editing your loop keeps saved templates unchanged.',
            '*Play or Stop*, *Speed* and *Options* are in the transport bar. Options opens Pause, with Settings and a way back to the main menu.',
            'In Pause, choose *I Need Help* to call a helper out loud. The game stays paused.',
            auto ? 'The highlight moves by itself. *Enter* chooses on release.' : '*Tap Space* to move on release. *Hold Space* to scan backward. *Enter* chooses on release.',
            'Pips wrap when needed to stay easy to touch. There is no score, timer or way to lose.'
        ];
    }
    function renderHelp() {
        el.helpBody.innerHTML = helpLines().map(function (line) {
            return '<p>' + line.replace(/\*([^*]+)\*/g, '<b>$1</b>') + '</p>';
        }).join('');
    }

    /** Read the directions, holding the scanner still; any press stops it. */
    function readAloud() {
        const text = helpLines().map(function (l) { return l.replace(/\*/g, ''); }).join(' ');
        const ticket = NL.Voice.speak(text);
        if (!ticket) return;
        let released = false, timer = null;
        const release = function () {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            NL.Input.setEnabled(true);
        };
        const onPress = function () { NL.Voice.cancel(); release(); };
        NL.Input.setEnabled(false);
        timer = setTimeout(release, Math.ceil(text.length / 13 * 1000) + 800);
        Promise.resolve(ticket.finished).then(function (r) { if (r && r.reason !== 'timeout') release(); });
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }

    function helpScannables() {
        return [
            { id: 'help:read', el: el.helpTitle, speak: 'How to Play', action: readAloud },
            { id: 'help:back', el: el.helpBack, speak: 'Back', action: function () { NL.Voice.cancel(); show(helpFrom); } }
        ];
    }

    // --- settings ---------------------------------------------------------------------

    function vm() { return window.NarbeVoiceManager; }
    function sm() { return window.NarbeScanManager; }
    function ttsOn() { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    function voiceName() { try { return vm().getVoiceDisplayName(vm().getCurrentVoice()); } catch (e) { return 'Default'; } }
    function autoOn() { try { return !!sm().getSettings().autoScan; } catch (e) { return false; } }
    function speedLabel() { try { return (sm().getScanInterval() / 1000) + ' s'; } catch (e) { return '2 s'; } }

    let settingsCache = [];

    /**
     * Hub canonical order: Text to Speech, Voice, the game's own options,
     * Auto Scan, Scan Speed, Sound Effects, Reset (two steps), Back.
     * `after` is said once an option is chosen.
     */
    function settingsItems() {
        const s = S();
        return [
            {
                id: 'tts', label: 'Speaking', value: function () { return onOff(ttsOn()); },
                action: function () { try { vm().toggleTTS(); } catch (e) { /* none */ } },
                after: function () { return ttsOn() ? 'Speaking on. Everything is read aloud.' : ''; }
            },
            {
                id: 'voice', label: 'Voice', value: voiceName,
                action: function () { try { vm().cycleVoice(); } catch (e) { /* none */ } },
                after: function () { return 'Voice, ' + voiceName() + '. This is the voice you will hear.'; }
            },
            {
                id: 'look', label: 'Look', value: function () { return s.get('look') === 'contrast' ? 'Simple High Contrast' : 'Studio'; },
                action: function () { s.set('look', s.get('look') === 'studio' ? 'contrast' : 'studio'); applyLook(); },
                after: function () { return 'Look, ' + (s.get('look') === 'contrast' ? 'Simple High Contrast' : 'Studio') + '.'; }
            },
            {
                id: 'hlstyle', label: 'Highlight Style', value: function () { return s.get('highlightStyle') === 'full' ? 'Block' : 'Bold Band'; },
                action: function () { s.set('highlightStyle', s.get('highlightStyle') === 'full' ? 'outline' : 'full'); },
                after: function () {
                    return s.get('highlightStyle') === 'full' ? 'Highlight style, block. The whole button fills with colour.'
                        : 'Highlight style, bold band. A thick band goes around the button.';
                }
            },
            {
                id: 'hlcolor', label: 'Highlight Color', value: function () { return s.highlightColorName(); },
                action: function () { s.cycle('highlightColorIndex', s.HIGHLIGHT_COLORS.length); },
                after: function () { return 'Highlight color, ' + s.highlightColorName() + '.'; }
            },
            {
                id: 'auto', label: 'Auto Scan', value: function () { return autoOn() ? 'One Switch' : 'Two Switches'; },
                action: function () { try { sm().toggleAutoScan(); } catch (e) { /* none */ } },
                after: function () {
                    return autoOn() ? 'Auto scan on. One switch. The highlight moves by itself and Enter chooses.'
                        : 'Auto scan off. Two switches. Space moves the highlight and Enter chooses.';
                }
            },
            {
                id: 'speed', label: 'Scan Speed', value: speedLabel,
                action: function () { try { sm().cycleScanSpeed(); } catch (e) { /* none */ } },
                after: function () { return 'Scan speed, ' + speedLabel() + '.'; }
            },
            {
                id: 'sound', label: 'Sound', value: function () { return onOff(s.get('sound')); },
                action: function () { s.toggle('sound'); NL.Sound.applyVolume(); NL.Sound.bell(67); },
                after: function () { return s.get('sound') ? 'Sound on.' : 'Sound off.'; }
            },
            {
                id: 'volume', label: 'Volume', value: function () { return s.volumeName(); },
                action: function () { s.cycle('volumeIndex', s.VOLUMES.length); NL.Sound.applyVolume(); NL.Sound.bell(67); },
                after: function () { return 'Volume, ' + s.volumeName() + '.'; }
            },
            {
                id: 'clear', label: 'Clear My Loop', value: function () { return clearArmed ? 'Choose again to clear' : 'Choose twice'; },
                action: function () {
                    if (!clearArmed) { clearArmed = true; return; }
                    clearArmed = false;
                    NL.Beat.clearAll();
                    clearDone = true;
                },
                after: function () {
                    if (clearDone) { clearDone = false; return 'Loop cleared. Back to the starting loop.'; }
                    return clearArmed ? 'Clear my loop? Choose it again to clear every layer.' : '';
                }
            },
            { id: 'back', label: 'Back', value: function () { return ''; }, nav: true, action: function () { show(settingsFrom); } }
        ];
    }
    let clearDone = false;

    function renderSettings() {
        settingsCache = settingsItems();
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            const b = button('nl-set' + (item.nav ? ' nl-item-nav' : ''), el.settingsList);
            b.dataset.setting = item.id;
            node('span', 'nl-set-label', b, item.label);
            node('span', 'nl-set-value', b, item.value());
        });
    }

    function settingsScannables() {
        return settingsCache.map(function (item) {
            return {
                id: 'set:' + item.id,
                el: el.settingsList.querySelector('[data-setting="' + item.id + '"]'),
                speak: function () { const v = item.value(); return v ? item.label + ', ' + v : item.label; },
                // Moving off Clear My Loop disarms it, so one stray select later never wipes the beat.
                onFocus: function () {
                    if (item.id === 'clear' || !clearArmed) return;
                    clearArmed = false;
                    const v = el.settingsList.querySelector('[data-setting="clear"] .nl-set-value');
                    if (v) v.textContent = 'Choose twice';
                },
                action: function () {
                    item.action();
                    if (item.nav || screen !== 'settings') return;
                    renderSettings();
                    NL.Input.refresh(false);
                    const line = item.after && item.after();
                    if (line) NL.Input.announce(line);
                }
            };
        });
    }


    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'beat': return beatScannables();
            case 'row': return rowScannables();
            case 'sounds': case 'add': return pickerItems;
            case 'pause': return pauseItems;
            case 'loops': return loopItems;
            case 'settings': return settingsScannables();
            case 'help': return helpScannables();
            default: return [];
        }
    }
    let scanHost = null;
    /** Where the shared "Parked" badge and the Ready light live, outside the choices. */
    function scanContext() {
        if (!scanHost) {
            scanHost = node('div', 'nl-scan-status');
            const ready = node('span', 'nl-ready', scanHost);
            node('i', '', ready);
            node('span', '', ready, 'Ready');
        }
        const slot = el[screen] && el[screen].querySelector('.nl-status-slot');
        if (slot && scanHost.parentElement !== slot) slot.appendChild(scanHost);
        return { key: screen, host: scanHost };
    }


    return { build, show, current, scannables, scanContext, onScan, refreshBeat, beginRowReturn, endRowReturn, editPattern: openLine,
        backModal: function () { if (screen === 'row') returnToLine(); else if (screen === 'sounds') show('row'); else if (screen === 'add') { show('beat', true); NL.Input.align('beat:add'); } }
    };
})();
