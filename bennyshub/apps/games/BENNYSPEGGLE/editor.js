/* Campaign Workshop: an offline creator/caregiver tool with keyboard alternatives. */
(() => {
  'use strict';
  const kit = window.PeggleKit;
  const $ = id => document.getElementById(id);
  if (!kit) { $('status').textContent = 'Workshop content could not load. Reopen this page to try again.'; return; }
  const W = 820, H = 540, DRAFT_KEY = 'bennys-peggle-editor-draft-v2';
  const CUSTOM_KEY = 'bennys-peggle-custom-v2', TEST_KEY = 'bennys-peggle-playtest-v2', LIBRARY_KEY = 'bennys-peggle-library-v2';
  const POWER_NAMES = kit.POWER_NAMES || {EXTRA:'Extra shot',EXPLODE:'Burst',MULTIBALL:'Multiball',wideCatch:'Wider base plate',magnet:'Magnet',blast:'First-hit burst',bonusShots:'Three extra shots'};
  const BALL_POWERS = kit.BALL_POWERS || {};
  const BALL_POWER_COLORS = {ghost:'#d9c8ff',blast:'#ff8bbc',multiball:'#76eaff',fireball:'#ffb15c',echo:'#d8ee7e',magnet:'#97e6d4',guide:'#ffe980'};
  const POWER_DETAILS = {
    EXTRA:['peg','Adds one shot when hit.'], EXPLODE:['peg','Clears nearby pegs when hit.'], MULTIBALL:['peg','Adds extra balls to the current shot.'],
    POWER:['peg','Banks its chosen power for the next shot. Powers collected together combine on that shot.'],
    ...Object.fromEntries(Object.entries(BALL_POWERS).map(([id,power]) => ['power_'+id,['next-shot power',power.description]])),
    wideCatch:['starting power','Makes the base plate 80 pixels wider, up to its maximum width.'], magnet:['starting power','Guides falling balls toward the base plate.'],
    blast:['starting power','Bursts nearby pegs on each shot’s first hit.'], bonusShots:['starting power','Adds three starting shots in limited-shot campaigns.']
  };
  const TYPES = [
    ['TARGET', 'Sun target', '#ff8a20', '☀'], ['NORMAL', 'Blue bounce', '#19a6ff', '·'],
    ['GEM', 'Gem', '#bb59ff', '◆'], ['EXTRA', POWER_NAMES.EXTRA, '#75ed35', '+'],
    ['EXPLODE', POWER_NAMES.EXPLODE, '#ff4ea9', '✿'], ['MULTIBALL', POWER_NAMES.MULTIBALL, '#3fe9ff', '••'],
    ['POWER', POWER_NAMES.POWER || 'Power ball', '#d9c8ff', '✦'],
    ['BLOCK', 'Stone bumper', '#73859f', '■']
  ];
  const BACKGROUNDS = kit.BACKGROUNDS || [{id:'garden',name:'The secret garden',theme:'garden',src:'assets/scene-garden.png'},{id:'coast',name:'The friendly coast',theme:'coast',src:'assets/scene-coast.png'},{id:'night',name:'A sky full of stars',theme:'night',src:'assets/scene-night.png'}];
  const SCENES = BACKGROUNDS.map(background => [background.id, background.name]);
  const backgroundImages = new Map();
  const powerNameEdits = new Map();
  const STORY_TEMPLATES = [
    {value:'story-lantern-run',name:'The Lantern Run'},
    {value:'story-tide-post',name:'The Tide Post'},
    {value:'story-star-workshop',name:'The Star Workshop'},
    {value:'story-power-playground',name:'The Power Playground',description:'12 stages introducing seven next-shot powers and ways to combine them.'}
  ];
  const OBJECTIVE_NAMES = { targets: 'sun targets', gems: 'gem collection', score: 'score goals', clear: 'clear the board' };
  const STARTING_POWERS = ['wideCatch', 'magnet', 'blast', 'bonusShots'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const typeInfo = type => { const info=TYPES.find(t => t[0] === type) || TYPES[1]; return POWER_NAMES[info[0]] ? [info[0], powerName(info[0]), ...info.slice(2)] : info; };
  const canvas = $('board'), ctx = canvas.getContext('2d');
  let pack, levelIndex = 0, chapterIndex = 0, paletteType = 'TARGET', palettePower = 'ghost';
  let selection = new Set(), catcherSelected = false, clipboard = [], contextPoint = null;
  let wheelHistory = null;
  let drag = null, imageTarget = 'pack', imageRequest = 0;
  const undoStack = [], redoStack = [];
  function powerName(key) { return kit.powerName ? kit.powerName(pack?.meta || {}, key) : pack?.meta?.powerNames?.[key]?.trim().slice(0,48) || POWER_NAMES[key]; }
  function powerLabel(key) { const name=powerName(key); return name===POWER_NAMES[key] ? name : `${name} · ${POWER_NAMES[key]} ${POWER_DETAILS[key][0]}`; }
  function ballPowerId(id) { return Object.hasOwn(BALL_POWERS,id) ? id : 'ghost'; }
  function ballPowerName(id) { id=ballPowerId(id); return kit.ballPowerName ? kit.ballPowerName(pack?.meta || {},id) : powerName('power_'+id) || BALL_POWERS[id]?.name || 'Power ball'; }
  function pegLabel(type, power) { return type === 'POWER' && power ? `${ballPowerName(power)} · next shot` : POWER_NAMES[type] ? powerLabel(type) : typeInfo(type)[1]; }
  function pegInfo(peg) { const id=ballPowerId(peg.power); return peg.type === 'POWER' ? ['POWER',ballPowerName(id),BALL_POWER_COLORS[id],BALL_POWERS[id]?.symbol || '✦'] : typeInfo(peg.type); }
  function paletteButtons() { return [...$('palette').children,...$('powerBallPalette').children]; }
  function selectPalette(type, power = 'ghost') {
    paletteType=type;palettePower=ballPowerId(power);
    if(type==='POWER')$('powerPaletteSettings').open=true;
    for(const button of paletteButtons())button.setAttribute('aria-pressed',String(button.dataset.type===type && (type!=='POWER' || button.dataset.power===palettePower)));
    document.querySelector('input[name=boardTool][value=add]').checked=true;setSelection([]);renderPegs();draw();
    status(`${type==='POWER' ? ballPowerName(palettePower)+' power peg' : typeInfo(type)[1]} selected. Click the board or use Add at board center.`);
  }

  function status(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
  }
  function ensureStories(value) {
    value.meta = value.meta || {};
    value.meta.chapters = Array.isArray(value.meta.chapters) && value.meta.chapters.length ? value.meta.chapters : [{ title: 'Our first discovery', story: '', scene: value.meta.scene || 'garden' }];
    value.meta.finale = value.meta.finale || { title: 'A wonderful discovery', story: 'Every little discovery made this picture possible.', scene: value.meta.scene || 'garden' };
    value.levels.forEach(l => { l.chapter = Math.max(0, Math.min(value.meta.chapters.length - 1, Number.isInteger(l.chapter) ? l.chapter : 0)); });
    return value;
  }
  function recoverDraft(candidate) {
    if (!candidate?.meta || !Array.isArray(candidate.levels) || !candidate.levels.length || candidate.levels.length > 30) throw new Error('A draft needs 1–30 stages.');
    const source = ensureStories(clone(candidate));
    const placeholder = { x: 410, y: 280, radius: 15, type: 'TARGET' };
    // Normalize all images and story metadata without requiring unfinished chapters to have stages yet.
    const meta = kit.validatePack({ meta: source.meta, levels: source.meta.chapters.map((c, i) => ({ chapter: i, objective: 'clear', pegs: [placeholder] })) }).meta;
    const levels = source.levels.map((level, i) => {
      if (!Array.isArray(level.pegs) || level.pegs.length > 200) throw new Error(`Stage ${i + 1} needs a peg list with at most 200 pegs.`);
      const pegs = clone(level.pegs), allStone = pegs.length && pegs.every(p => p?.type === 'BLOCK' || p?.block);
      if (allStone) { pegs[0].type = 'NORMAL'; delete pegs[0].block; }
      const normalized = kit.validatePack({ meta: { ...meta, chapters: [meta.chapters[level.chapter || 0]] }, levels: [{ ...level, chapter: 0, objective: 'clear', pegs: pegs.length ? pegs : [placeholder] }] }).levels[0];
      if (allStone) { normalized.pegs[0].type = 'BLOCK'; normalized.pegs[0].shape = 'SQUARE'; }
      normalized.id = i + 1; normalized.chapter = level.chapter || 0;
      normalized.pegs = level.pegs.length ? normalized.pegs : [];
      normalized.objective = ['targets', 'clear', 'gems', 'score'].includes(level.objective) ? level.objective : 'targets';
      const rawGoal = Number(level.goal ?? 1);
      if (!Number.isFinite(rawGoal)) throw new Error(`Stage ${i + 1} needs a numeric goal.`);
      normalized.goal = Math.max(1, Math.min(normalized.objective === 'score' ? 20000 : 200, Math.round(rawGoal)));
      return normalized;
    });
    return { meta, levels };
  }
  function loadInitial() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (draft) {
        const candidate = draft.pack || draft;
        // Drafts can include unfinished stages; final validation happens before publication.
        if (candidate.meta && Array.isArray(candidate.levels) && candidate.levels.length && candidate.levels.length <= 30 && candidate.levels.every(l => Array.isArray(l.pegs))) {
          pack = recoverDraft(candidate);
          levelIndex = Math.max(0, Math.min(pack.levels.length - 1, Number.isInteger(draft.levelIndex) ? draft.levelIndex : 0));
          status('Your autosaved draft is open.');
          return;
        }
      }
    } catch (_) { /* A damaged local draft does not prevent opening the editor. */ }
    pack = ensureStories(clone(kit.builtInPack));
    status('The Lantern Trail campaign is ready to edit. Draft changes save in this browser.');
  }
  function snapshot() { return JSON.stringify({ pack, levelIndex, chapterIndex, selection: [...selection], catcherSelected }); }
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ pack, levelIndex })); return true; }
    catch (_) { status('Browser storage is full. Your changes are still here; export a JSON file to keep them.', true); return false; }
  }
  function pushUndo(before) {
    undoStack.push(before);
    if (undoStack.length > 80) undoStack.shift();
    // Picture-heavy campaigns still keep useful history without retaining hundreds of MB.
    let bytes = undoStack.reduce((sum, entry) => sum + entry.length * 2, 0);
    while (undoStack.length > 1 && bytes > 24 * 1024 * 1024) bytes -= undoStack.shift().length * 2;
    redoStack.length = 0;
  }
  function commit(change, message, historyGroup = '') {
    const before = snapshot();
    change();
    pack.levels.forEach(level => { if (level.objective === 'targets' || level.objective === 'clear') level.goal = Math.max(1, goalCount(level)); });
    const after = snapshot(), now = performance.now();
    if (after !== before) {
      const merge = historyGroup && wheelHistory?.key === historyGroup && wheelHistory.after === before && now - wheelHistory.time < 220 && !redoStack.length;
      if (!merge) pushUndo(before);
      wheelHistory = historyGroup ? {key:historyGroup,after,time:now} : null;
    }
    const saved = saveDraft();
    render();
    if (saved && message) status(message + ' Draft saved.');
  }
  function restore(serialized) {
    wheelHistory = null;
    const s = JSON.parse(serialized);
    pack = ensureStories(s.pack);
    levelIndex = Math.min(s.levelIndex, pack.levels.length - 1);
    chapterIndex = Math.min(s.chapterIndex || 0, pack.meta.chapters.length - 1);
    drag = null; closeContext(false); setSelection(s.selection || []); catcherSelected = Boolean(s.catcherSelected); saveDraft(); render();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); status('Last edit undone. Draft saved.'); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); status('Edit restored. Draft saved.'); }
  const current = () => pack.levels[levelIndex];
  const currentChapter = () => pack.meta.chapters[chapterIndex];
  const selectedIndices = () => [...selection].filter(i => Number.isInteger(i) && i >= 0 && i < current().pegs.length).sort((a,b) => a-b);
  const selectedPegs = () => selectedIndices().map(i => current().pegs[i]);
  const currentPeg = () => current().pegs[selectedIndices()[0]];
  function setSelection(indices) { catcherSelected = false; selection = new Set(indices.filter(i => Number.isInteger(i) && i >= 0 && i < current().pegs.length)); }
  function selectionChanged() {
    renderPegs(); draw();
    status(catcherSelected ? 'Base plate selected. Drag to move, drag an end to resize, or scroll to change width. Arrow keys move; + and - resize.' : `${selection.size} peg${selection.size === 1 ? '' : 's'} selected.`);
  }
  function selectCatcher(focus = false) {
    selection.clear(); catcherSelected = true; $('basePlateSettings').open = true;
    selectionChanged(); if (focus) canvas.focus({preventScroll:true});
  }
  function catcherGeometry() {
    const config = kit.catcherConfig(current(), {wideCatch:pack.meta.startItem === 'wideCatch'});
    return {...config, startX:Number.isFinite(config.startX) ? config.startX : (W-config.width)/2};
  }
  function pegBreakConfig(peg) { return kit.pegBreakConfig ? kit.pegBreakConfig(current(),peg) : {mode:peg?.breakMode || current().pegBreak?.mode || 'crumble',duration:current().pegBreak?.duration || .8}; }
  function renderPegBreaking() {
    const config=pegBreakConfig();
    setValue('pegBreakMode',config.mode);setValue('pegBreakDuration',config.duration);
    const hasCrumbleOverride=current().pegs.some(peg=>peg.type!=='BLOCK'&&peg.breakMode==='crumble');
    $('pegBreakDuration').disabled=config.mode==='instant'&&!hasCrumbleOverride;
    $('resetPegBreakBtn').disabled=!current().pegBreak;
    $('pegBreakSummary').textContent=config.mode==='instant'?'Hit pegs disappear immediately and stop blocking the ball. Pegs with a Crumble override still use the saved crumble time.':`Hit pegs shrink over ${config.duration} seconds, making room for the ball as they crumble, then disappear. Each peg scores and activates its power only once.`;
  }
  function renderCatcher() {
    const catcher = kit.catcherConfig(current()), effective = catcherGeometry();
    setValue('catcherWidth', catcher.width); setValue('catcherBehavior', catcher.behavior); setValue('catcherInterval', catcher.interval);
    setValue('catcherStartX', effective.startX); $('catcherStartX').max = W-effective.width;
    $('catcherInterval').disabled = catcher.behavior !== 'alternate';
    $('resetCatcherBtn').disabled = !current().catcher;
    $('selectCatcherBtn').setAttribute('aria-pressed', String(catcherSelected));
    $('selectionActionsBtn').setAttribute('aria-controls', catcherSelected ? 'plateContextMenu' : 'pegContextMenu');
    $('catcherSummary').textContent = `Board width: ${effective.width} px${pack.meta.startItem === 'wideCatch' ? ` with the ${powerName('wideCatch')} power` : ''}. Starts at X ${effective.startX}. ${catcher.behavior === 'alternate' ? `Alternates every ${catcher.interval} seconds.` : catcher.behavior === 'bounce' ? 'Bounces balls back into play.' : 'Catches balls for another shot.'}`;
  }
  function optionSelect(id, items, value) {
    $(id).replaceChildren(...items.map(([key, label]) => new Option(label, String(key))));
    $(id).value = String(value);
  }
  function setValue(id, value) { $(id).value = value ?? ''; }
  function renderOverview() {
    $('campaignOverviewTitle').textContent = pack.meta.title?.trim() || 'Campaign overview';
    $('overviewMission').textContent = pack.meta.story?.trim() || 'Add a campaign mission to tell players what they are working toward.';
    const objectiveCounts = Object.keys(OBJECTIVE_NAMES).map(key => {
      const count = pack.levels.filter(level => (level.objective || 'targets') === key).length;
      return count ? `${OBJECTIVE_NAMES[key]} (${count} stage${count === 1 ? '' : 's'})` : null;
    }).filter(Boolean);
    $('overviewObjectives').textContent = `${pack.levels.length} stage${pack.levels.length === 1 ? '' : 's'}: ${objectiveCounts.join(' · ')}.`;
    const shotCounts = pack.levels.map(level => Number(level.shots) || 10);
    const minShots = Math.min(...shotCounts), maxShots = Math.max(...shotCounts);
    const shotRange = minShots === maxShots ? String(minShots) : `${minShots}–${maxShots}`;
    $('overviewShotRule').textContent = pack.meta.mode === 'free' ? 'Unlimited shots in every stage.' : `Limited shots: ${shotRange} per stage${pack.meta.startItem === 'bonusShots' ? ', plus 3 from the starting power' : ''}. Catches and extra-shot pegs earn more.`;
    const powerStages = pack.levels.filter(level => level.pegs.some(peg => ['EXTRA', 'EXPLODE', 'MULTIBALL', 'POWER'].includes(peg.type))).length;
    const powerTypes = [
      ...TYPES.filter(([type]) => ['EXTRA','EXPLODE','MULTIBALL'].includes(type) && pack.levels.some(level => level.pegs.some(peg => peg.type===type))).map(([type]) => powerName(type)),
      ...Object.keys(BALL_POWERS).filter(id => pack.levels.some(level => level.pegs.some(peg => peg.type==='POWER' && ballPowerId(peg.power)===id))).map(ballPowerName)
    ];
    const startingPower = STARTING_POWERS.includes(pack.meta.startItem) ? powerName(pack.meta.startItem) : '';
    const powerSummary = startingPower ? (pack.meta.mode === 'free' && pack.meta.startItem === 'bonusShots' ? `${startingPower} selected; extra shots have no effect with unlimited shots.` : `${startingPower} starts every stage.`) : 'No starting power.';
    $('overviewPowers').textContent = `${powerSummary} ${powerStages ? `${powerTypes.join(', ')} pegs in ${powerStages} stage${powerStages === 1 ? '' : 's'}.` : 'Add power pegs from the palette for bonuses and next-shot powers.'}`;
    const reveals = pack.meta.chapters.map((chapter, index) => {
      const count = pack.levels.filter(level => (level.chapter || 0) === index).length;
      const item = document.createElement('li');
      item.textContent = `${chapter.title?.trim() || `Chapter ${index + 1}`} · ${count} picture tile${count === 1 ? '' : 's'}${count ? '' : ' — assign a stage'}`;
      return item;
    });
    const finale = document.createElement('li');
    finale.textContent = `${pack.meta.finale.title?.trim() || 'Final reveal'} · after all ${pack.levels.length} stages`;
    finale.className = 'overview-finale';
    $('overviewReveals').replaceChildren(...reveals, finale);
  }
  function render() {
    const level = current();
    chapterIndex = Math.min(chapterIndex, pack.meta.chapters.length - 1);
    selection = new Set(selectedIndices());
    closeContext(false);
    renderPowerNames();
    // Legacy arcade campaigns share the authored limited-shot rule.
    setValue('packTitle', pack.meta.title); setValue('packMode', pack.meta.mode === 'free' ? 'free' : 'adventure');
    setValue('packStartItem', pack.meta.startItem || '');
    setValue('packStory', pack.meta.story); setValue('packScene', pack.meta.scene || 'garden'); setValue('packImageAlt', pack.meta.imageAlt);
    const chapters = pack.meta.chapters.map((c, i) => [i, `${i + 1}. ${c.title || 'Untitled chapter'}`]);
    optionSelect('chapterSelect', chapters, chapterIndex); optionSelect('levelChapter', chapters, level.chapter || 0);
    const chapter = currentChapter();
    setValue('chapterTitle', chapter.title); setValue('chapterStory', chapter.story); setValue('chapterScene', chapter.scene || 'garden'); setValue('chapterImageAlt', chapter.imageAlt);
    const assigned = pack.levels.map((l, i) => l.chapter === chapterIndex ? i + 1 : null).filter(Boolean);
    $('chapterSummary').textContent = assigned.length ? `${assigned.length} picture tile${assigned.length === 1 ? '' : 's'} from stage${assigned.length === 1 ? '' : 's'} ${assigned.join(', ')}.` : 'No stages assigned yet. Choose this chapter in a stage’s settings.';
    const finale = pack.meta.finale;
    setValue('finaleTitle', finale.title); setValue('finaleStory', finale.story); setValue('finaleScene', finale.scene || 'garden'); setValue('finaleImageAlt', finale.imageAlt);
    optionSelect('levelSelect', pack.levels.map((l, i) => [i, `${i + 1}. ${l.title || 'Untitled stage'}`]), levelIndex);
    setValue('levelTitle', level.title); setValue('levelStory', level.story); setValue('objective', level.objective || 'targets');
    setValue('goal', ['targets', 'clear'].includes(level.objective) ? goalCount(level) : (level.goal || 1)); setValue('shots', level.shots || 10);
    renderCatcher();renderPegBreaking();
    $('shots').disabled = pack.meta.mode === 'free';
    $('stageShotsHelp').textContent = pack.meta.mode === 'free' ? 'This campaign gives unlimited shots. Stage shot limits are saved for use if you change to limited shots.' : 'Shots available at the start of this stage. Catching a ball or hitting an extra-shot peg earns more.';
    $('goal').max = level.objective === 'score' ? '20000' : '200';
    $('goal').step = level.objective === 'score' ? '100' : '1';
    $('goal').min = level.objective === 'score' ? '100' : '1';
    $('goal').disabled = ['targets', 'clear'].includes(level.objective);
    const breakables = level.pegs.filter(p => p.type !== 'BLOCK').length;
    const count = level.pegs.filter(p => p.type === (level.objective === 'gems' ? 'GEM' : 'TARGET')).length;
    $('objectiveHint').textContent = level.objective === 'clear' ? `Clear all ${breakables} breakable pegs. Stones can remain.` : level.objective === 'score' ? (pack.meta.mode === 'free' ? 'Each bounce earns points. Playtest to check that this board can reach the goal.' : 'Each bounce earns points. Keep the goal reachable within the shot limit.') : level.objective === 'targets' ? `Light all ${count} sun targets. The goal updates when you add or remove suns.` : `${count} gems on this board. Choose a goal no higher than this count.`;
    $('objectiveHint').textContent += ' Outlined pegs count toward this stage’s goal.';
    $('stageEyebrow').textContent = `STAGE ${levelIndex + 1} / ${pack.levels.length} · ${pack.meta.chapters[level.chapter || 0]?.title || 'CHAPTER'}`;
    $('boardTitle').textContent = level.title || 'Build your next stage';
    $('boardCount').textContent = `${level.pegs.length} / 200 pegs`;
    $('earlierBtn').disabled = levelIndex === 0; $('laterBtn').disabled = levelIndex === pack.levels.length - 1;
    $('addLevelBtn').disabled = pack.levels.length >= 30; $('duplicateLevelBtn').disabled = pack.levels.length >= 30;
    $('deleteLevelBtn').disabled = pack.levels.length <= 1; $('deleteChapterBtn').disabled = pack.meta.chapters.length <= 1;
    $('addChapterBtn').disabled = pack.meta.chapters.length >= 12;
    $('undoBtn').disabled = !undoStack.length; $('redoBtn').disabled = !redoStack.length;
    for (const prefix of ['pack', 'chapter', 'finale']) $(prefix + 'ImageRemove').disabled = !imageObject(prefix).image;
    renderPegs(); draw(); picturePreview(); renderBackground(); renderOverview();
    refreshLibrary();
    $('reviewSummary').textContent = 'Check your goals and chapter order before saving or playtesting.';
    $('issues').replaceChildren();
  }
  function renderPegs(rebuildList = true) {
    const pegs = current().pegs;
    if (rebuildList) $('pegList').replaceChildren(...pegs.map((p,i) => new Option(`${i + 1}. ${pegLabel(p.type,p.power || (p.type==='POWER' ? 'ghost' : ''))} · ${Math.round(p.x)}, ${Math.round(p.y)}`, String(i))));
    for (const option of $('pegList').options) option.selected = selection.has(Number(option.value));
    const indices = selectedIndices(), chosen = selectedPegs(), peg = currentPeg();
    const common = (list, key, fallback = '') => list.length && list.every(p => (p[key] || fallback) === (list[0][key] || fallback)) ? (list[0][key] || fallback) : '';
    $('selectedCount').textContent = catcherSelected ? 'Base plate selected' : `${indices.length} selected`;
    $('clearSelectionBtn').disabled = !indices.length && !catcherSelected;
    $('selectAllBtn').disabled = !pegs.length;
    $('selectionHint').hidden = Boolean(peg);
    for (const el of $('pegInspector').querySelectorAll('input,select,button')) el.disabled = !peg;
    setValue('pegType', common(chosen, 'type')); setValue('pegX', peg ? Math.round(peg.x) : '');
    setValue('pegY', peg ? Math.round(peg.y) : ''); setValue('pegRadius', common(chosen, 'radius'));
    const powers=chosen.filter(p=>p.type==='POWER'), power=common(powers,'power','ghost');
    $('pegPowerField').hidden=!powers.length; $('pegPower').disabled=!powers.length;setValue('pegPower',power);
    $('pegPowerHelp').textContent=powers.length ? `${power ? BALL_POWERS[ballPowerId(power)].description : 'These pegs have different next-shot powers.'} Changes ${powers.length} selected power peg${powers.length===1?'':'s'}. Collecting powers banks them for the next launch.` : 'Select a power peg to choose the next shot’s ability.';
    const blue = chosen.filter(p => p.type === 'NORMAL');
    setValue('pegShape', common(blue, 'shape', 'CIRCLE')); $('pegShape').disabled = !blue.length;
    const breakable=chosen.filter(p=>p.type!=='BLOCK'), firstBreak=breakable[0]?.breakMode || '';
    setValue('pegBreakOverride',breakable.every(p=>(p.breakMode || '')===firstBreak)?firstBreak:'mixed');
    $('pegBreakOverride').disabled=!breakable.length;
    const breakConfig=pegBreakConfig();
    $('pegBreakOverrideHelp').textContent=breakable.length?`Changes ${breakable.length} selected breakable peg${breakable.length===1?'':'s'}. Stage setting: ${breakConfig.mode==='instant'?'break immediately':`crumble over ${breakConfig.duration} seconds`}. Crumble overrides use the stage’s saved time. Stone blocks stay solid.`:'Select breakable pegs to change what happens after a hit. Stone blocks always stay solid.';
    $('shapeHelp').textContent = blue.length ? `Shape changes ${blue.length} selected blue bounce peg${blue.length === 1 ? '' : 's'}. Other types retain their symbols.` : 'Select blue bounce pegs to change their shapes. Other types retain their symbols.';
    $('selectCatcherBtn').setAttribute('aria-pressed', String(catcherSelected));
    if (catcherSelected) {
      $('selectionActionsBtn').setAttribute('aria-controls', 'plateContextMenu');
      $('basePlateSettings').open = true;
      const catcher = catcherGeometry();
      canvas.setAttribute('aria-label', `Stage layout editor. Base plate selected. Width ${catcher.width}, X ${catcher.startX}. Left and right arrows move it. Plus and minus resize. Shift F10 opens base plate actions.`);
    } else if (peg) {
      $('selectionActionsBtn').setAttribute('aria-controls', 'pegContextMenu');
      $('pegSettings').open = true;
      canvas.setAttribute('aria-label', `Stage layout editor. ${indices.length} pegs selected. First peg ${indices[0] + 1}, X ${Math.round(peg.x)}, Y ${Math.round(peg.y)}. Arrow keys move the selection. Delete removes it. Shift F10 opens selection actions.`);
    }
    else { $('selectionActionsBtn').setAttribute('aria-controls', 'pegContextMenu'); canvas.setAttribute('aria-label', `Stage layout editor. ${pegs.length} pegs. Use the peg list for keyboard selection.`); }
    $('duplicatePegBtn').disabled = !peg || pegs.length + indices.length > 200;
  }
  function pegPath(p, radius) {
    ctx.beginPath();
    const shape = p.type === 'BLOCK' || p.type === 'TARGET' ? 'SQUARE' : p.type === 'GEM' ? 'DIAMOND' : p.type === 'POWER' ? 'HEX' : p.type === 'NORMAL' ? (p.shape || 'CIRCLE') : 'CIRCLE';
    if (shape === 'SQUARE') ctx.rect(-radius, -radius, radius*2, radius*2);
    else if (shape === 'PLUS') {
      const s = radius*.4;
      [[-s,-radius],[s,-radius],[s,-s],[radius,-s],[radius,s],[s,s],[s,radius],[-s,radius],[-s,s],[-radius,s],[-radius,-s],[-s,-s]].forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath();
    } else if (['TRI','STAR','HEX','DIAMOND'].includes(shape)) {
      const n = {TRI:3,STAR:10,HEX:6,DIAMOND:4}[shape];
      for(let i=0;i<n;i++){const a=-Math.PI/2+i*Math.PI*2/n,r=shape==='STAR'&&i%2?radius*.5:radius;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);} ctx.closePath();
    } else ctx.arc(0,0,radius,0,Math.PI*2);
  }
  function draw() {
    const background = stageBackground(), scene = background.theme;
    const colors = scene === 'night' ? ['#273e59', '#425a71', '#203d44'] : scene === 'coast' ? ['#dcf3f6', '#abe1dd', '#8acac6'] : ['#eaf5d6', '#cce9c9', '#91c7aa'];
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, colors[0]); bg.addColorStop(1, colors[1]);
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const illustration = backgroundImage(background.src);
    if (illustration?.complete && illustration.naturalWidth) {
      const scale = Math.max(W / illustration.naturalWidth, H / illustration.naturalHeight), width = illustration.naturalWidth * scale, height = illustration.naturalHeight * scale;
      ctx.save(); ctx.globalAlpha = .36; ctx.drawImage(illustration, (W - width) / 2, (H - height) / 2, width, height); ctx.restore();
    }
    ctx.fillStyle = colors[2]; ctx.beginPath(); ctx.moveTo(0, 480); ctx.bezierCurveTo(200, 440, 450, 545, 820, 470); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.strokeStyle = scene === 'night' ? '#bcd6df40' : '#447e6030'; ctx.lineWidth = 1;
    if ($('showGrid').checked) {
      for (let x = 20; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 110); ctx.lineTo(x, 500); ctx.stroke(); }
      for (let y = 120; y <= 500; y += 20) { ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(812, y); ctx.stroke(); }
      ctx.setLineDash([6, 6]); ctx.strokeRect(8, 110, 804, 390); ctx.setLineDash([]);
    }
    ctx.fillStyle = scene === 'night' ? '#e5efe8' : '#456b56'; ctx.font = '16px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Launch lane · keep this space open', W / 2, 42);
    ctx.fillStyle = '#fffdf1'; ctx.strokeStyle = '#607c67'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, 79, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    current().pegs.forEach((p, i) => {
      const [, , color, symbol] = pegInfo(p), r = p.radius || 15;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = '#20473625'; ctx.beginPath(); ctx.ellipse(2, r + 2, r * .92, 4, 0, 0, Math.PI * 2); ctx.fill();
      if(p.type==='POWER' && window.PeggleRenderer?.drawPeg) {
        window.PeggleRenderer.drawPeg(ctx,{...p,x:0,y:0},true);
      } else {
        ctx.fillStyle = color; ctx.strokeStyle = '#29433e'; ctx.lineWidth = 2;
        pegPath(p,r); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff6'; ctx.beginPath(); ctx.ellipse(-r * .25, -r * .34, r * .48, r * .20, -.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#263b35'; ctx.font = `bold ${Math.max(12, r * .95)}px Segoe UI, sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText(symbol, 0, 1);
      }
      window.PeggleRenderer?.drawObjectivePegHighlight?.(ctx,{...p,x:0,y:0},current().objective || 'targets',{reducedMotion:true});
      if (selection.has(i)) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; pegPath(p,r+7); ctx.stroke(); ctx.strokeStyle = '#174fa0'; ctx.lineWidth = 3; ctx.setLineDash([5, 3]); ctx.stroke(); }
      ctx.restore();
    });
    const catcher = catcherGeometry(), plateX = catcher.startX;
    ctx.save(); ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.lineWidth = 2;
    ctx.fillStyle = catcher.behavior === 'bounce' ? '#ffad4d' : '#55ddff'; ctx.strokeStyle = '#183b48';
    ctx.beginPath(); ctx.roundRect(plateX, 506, catcher.width, 8, 3); ctx.fill(); ctx.stroke();
    if (catcher.behavior === 'alternate') { ctx.fillStyle = '#ffad4d'; ctx.fillRect(plateX + catcher.width / 2, 508, catcher.width / 2 - 3, 4); }
    if (catcherSelected) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.strokeRect(plateX, 502, catcher.width, 16);
      ctx.strokeStyle = '#174fa0'; ctx.lineWidth = 2; ctx.strokeRect(plateX, 502, catcher.width, 16);
      for (const x of [plateX, plateX + catcher.width]) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x-7,500,14,20); ctx.strokeRect(x-7,500,14,20);
        ctx.beginPath(); ctx.moveTo(x,504); ctx.lineTo(x,516); ctx.stroke();
      }
    }
    ctx.fillStyle = scene === 'night' ? '#f4faff' : '#143d43'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 12px Segoe UI, sans-serif';
    ctx.fillText(catcher.behavior === 'alternate' ? `Alternates ${catcher.interval}s` : catcher.behavior === 'bounce' ? 'Bounce' : 'Catch', plateX + catcher.width / 2, 528); ctx.restore();
    if (drag?.kind === 'box') {
      ctx.save(); ctx.fillStyle='#1772dc22'; ctx.strokeStyle='#1853a1'; ctx.lineWidth=2; ctx.setLineDash([7,4]);
      const x=Math.min(drag.startX,drag.endX),y=Math.min(drag.startY,drag.endY),w=Math.abs(drag.endX-drag.startX),h=Math.abs(drag.endY-drag.startY);
      ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.restore();
    }
  }
  function picturePreview() {
    const c = currentChapter(), scene = c.scene || 'garden';
    const box = $('picturePreview'); box.replaceChildren(); box.setAttribute('aria-label', c.imageAlt || c.title || 'Chapter puzzle picture');
    if (c.image) { const img = document.createElement('img'); img.src = c.image; img.alt = c.imageAlt || c.title || 'Chapter picture'; box.append(img); }
    else {
      const img = document.createElement('img'); img.src = backgroundTemplate(scene).src; img.alt = c.imageAlt || c.title || 'Illustrated chapter picture'; box.append(img);
      const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); art.classList.add('scene-art'); art.setAttribute('viewBox', '0 0 400 300'); art.setAttribute('aria-hidden', 'true');
      art.setAttribute('hidden', ''); img.onerror = () => { img.remove(); art.removeAttribute('hidden'); };
      const illustrations = {
        garden: '<rect width="400" height="300" fill="#d4efdd"/><circle cx="322" cy="56" r="34" fill="#f8d882"/><path d="M0 212Q90 110 220 207T400 192V300H0" fill="#90c69b"/><path d="M0 253Q190 166 400 252V300H0" fill="#64a684"/><path d="M190 300Q250 200 163 152" fill="none" stroke="#ffebae" stroke-width="33"/><g fill="#fff8da"><circle cx="83" cy="187" r="13"/><circle cx="315" cy="230" r="14"/><circle cx="50" cy="246" r="11"/></g><g fill="#f396a6"><circle cx="105" cy="227" r="13"/><circle cx="333" cy="179" r="11"/></g>',
        coast: '<rect width="400" height="300" fill="#cbeef0"/><circle cx="324" cy="61" r="35" fill="#ffe3a3"/><path d="M0 150Q200 105 400 159V300H0" fill="#60bcc5"/><path d="M0 187Q140 222 280 190T400 209V300H0" fill="#258f9c"/><path d="M0 265Q175 190 400 281V300H0" fill="#f4dea2"/><path d="M160 70V192H241Z" fill="#fffbea"/><path d="M152 204H260L238 226H174Z" fill="#b26e60"/><path d="M45 74q12-15 24 0q12-15 24 0" fill="none" stroke="#58888d" stroke-width="3"/>',
        night: '<rect width="400" height="300" fill="#263e59"/><circle cx="292" cy="74" r="34" fill="#ffecac"/><circle cx="306" cy="60" r="31" fill="#263e59"/><g fill="#fff3c3"><circle cx="66" cy="44" r="3"/><circle cx="172" cy="90" r="4"/><circle cx="340" cy="157" r="3"/><circle cx="96" cy="149" r="3"/><circle cx="219" cy="32" r="3"/><circle cx="350" cy="34" r="3"/></g><path d="M0 245L96 137L190 232L257 159L400 245V300H0" fill="#587088"/><path d="M0 260Q185 199 400 268V300H0" fill="#254a50"/><path d="M157 300Q200 234 274 236" fill="none" stroke="#9fc2b5" stroke-width="23"/>'
      };
      art.innerHTML = illustrations[scene] || illustrations.garden; box.append(art);
    }
    $('pictureCaption').textContent = `${c.title || 'Chapter picture'} · one tile per completed stage.`;
  }
  function sceneOptions() { for (const select of document.querySelectorAll('.scene-select')) select.replaceChildren(...SCENES.map(([id, name]) => new Option(name, id))); }
  function backgroundTemplate(id) { return kit.backgroundInfo?.(id) || BACKGROUNDS.find(background => background.id === id) || BACKGROUNDS[0]; }
  function stageBackground() {
    const level = current(), chapter = pack.meta.chapters[level.chapter || 0] || pack.meta;
    const template = backgroundTemplate(level.scene || chapter.scene || pack.meta.scene || 'garden');
    const image = level.image || (!level.scene && chapter.image);
    return {...template, src:image || template.src, uploaded:Boolean(image), inherited:!level.scene && !level.image, description:level.imageAlt || (!level.scene && !level.image ? chapter.imageAlt : '') || template.name};
  }
  function backgroundImage(src) {
    if (!src) return null;
    if (!backgroundImages.has(src)) {
      const image = new Image(); backgroundImages.set(src, image);
      image.onload = () => { if (pack && canvas.isConnected) draw(); };
      image.src = src;
      if (backgroundImages.size > 32) backgroundImages.delete(backgroundImages.keys().next().value);
    }
    return backgroundImages.get(src);
  }
  function renderBackground() {
    const level = current(), background = stageBackground(), preview = $('backgroundPreview');
    $('backgroundStageName').textContent = `Stage ${levelIndex + 1}: ${level.title || 'Untitled stage'}`;
    preview.setAttribute('aria-label', background.description);
    const image = document.createElement('img'); image.src = background.src; image.alt = background.description; preview.replaceChildren(image);
    $('backgroundName').textContent = `${background.inherited ? 'Campaign background · ' : ''}${background.uploaded ? 'Uploaded image' : background.name}`;
    $('backgroundTemplateBtn').textContent = `Choose a template (${BACKGROUNDS.length})`;
    $('backgroundUseTemplateBtn').disabled = !level.image;
    $('backgroundInheritBtn').disabled = !Object.hasOwn(level, 'scene') && !Object.hasOwn(level, 'image') && !Object.hasOwn(level, 'imageAlt');
    setValue('backgroundDescription', level.imageAlt || '');
  }
  $('backgroundTemplateBtn').onclick = () => {
    const dialog = $('backgroundDialog');
    if (dialog.open) return;
    finishDrag(); closeContext(false);
    $('backgroundDialogHint').textContent = `Choose a background for stage ${levelIndex + 1}, “${current().title || 'Untitled stage'}”. Other stages keep their backgrounds.`;
    $('backgroundGallery').replaceChildren(...BACKGROUNDS.map(background => {
      const button = document.createElement('button'); button.className = 'background-choice'; button.dataset.backgroundId = background.id;
      button.setAttribute('aria-pressed', String(!current().image && stageBackground().id === background.id));
      const image = document.createElement('img'); image.loading = 'lazy'; image.src = background.src; image.alt = '';
      const name = document.createElement('span'); name.textContent = background.name; button.append(image, name);
      button.onclick = () => { commit(() => { current().scene = background.id; delete current().image; delete current().imageAlt; imageRequest++; }, 'Stage background updated.'); dialog.close(); };
      return button;
    }));
    dialog.showModal(); $('backgroundDialogClose').focus();
  };
  $('backgroundDialogClose').onclick = () => $('backgroundDialog').close();
  $('backgroundUploadBtn').onclick = () => { imageTarget = 'level'; $('imageFile').click(); };
  $('backgroundUseTemplateBtn').onclick = () => commit(() => { current().scene ||= stageBackground().id; delete current().image; delete current().imageAlt; imageRequest++; }, 'Stage template restored.');
  $('backgroundInheritBtn').onclick = () => commit(() => { delete current().scene; delete current().image; delete current().imageAlt; imageRequest++; }, 'Campaign background restored for this stage.');
  $('backgroundDescription').onchange = () => commit(() => { const description = $('backgroundDescription').value.trim(); if (description) current().imageAlt = description; else delete current().imageAlt; }, 'Stage background description updated.');
  function setupPalette() {
    optionSelect('pegType', [['', 'Mixed types'], ...TYPES.map(t => [t[0], t[1]])], 'TARGET');
    TYPES.filter(([type])=>type!=='POWER').forEach(([type, name, color, symbol]) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.type = type;
      button.setAttribute('aria-pressed', String(type === paletteType));
      const swatch = document.createElement('span'); swatch.className = 'peg-dot'; swatch.dataset.type = type; swatch.style.background = color; swatch.textContent = symbol; swatch.setAttribute('aria-hidden', 'true');
      const label=document.createElement('span');label.className='palette-name';label.textContent=name;
      button.append(swatch, label);
      button.onclick = () => selectPalette(type);
      $('palette').append(button);
    });
    for(const [id,power] of Object.entries(BALL_POWERS)) {
      const button=document.createElement('button');button.type='button';button.dataset.type='POWER';button.dataset.power=id;button.setAttribute('aria-pressed','false');
      const swatch=document.createElement('span');swatch.className='peg-dot';swatch.dataset.type='POWER';swatch.style.background=BALL_POWER_COLORS[id];swatch.textContent=power.symbol;swatch.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='palette-name';label.textContent=power.name;button.append(swatch,label);
      button.onclick=()=>selectPalette('POWER',id);$('powerBallPalette').append(button);
    }
    optionSelect('pegPower',[['','Mixed powers'],...Object.entries(BALL_POWERS).map(([id,power])=>[id,power.name])],'ghost');
    $('pegPower').options[0].disabled=true;
  }
  function writePowerName(key, value) {
    const name=value.replace(/\s+/g,' ').trim().slice(0,48), names={...pack.meta.powerNames};
    if(name && name!==POWER_NAMES[key])names[key]=name;else delete names[key];
    if(Object.keys(names).length)pack.meta.powerNames=names;else delete pack.meta.powerNames;
  }
  function renderPowerNames(fillFields=true) {
    for(const key of Object.keys(POWER_DETAILS))if(fillFields) {
      const editing=powerNameEdits.get(key);if(editing){clearTimeout(editing.timer);editing.typing=false;}
      setValue('powerName'+key,pack.meta.powerNames?.[key] || '');
    }
    $('resetPowerNamesBtn').disabled=!Object.keys(pack.meta.powerNames || {}).length;
    optionSelect('packStartItem',[['','None'],...STARTING_POWERS.map(key=>[key,powerLabel(key)])],pack.meta.startItem || '');
    optionSelect('pegType',[['','Mixed types'],...TYPES.map(([type])=>[type,pegLabel(type)])],$('pegType').value);
    optionSelect('pegPower',[['','Mixed powers'],...Object.keys(BALL_POWERS).map(id=>[id,ballPowerName(id)])],$('pegPower').value);
    $('pegPower').options[0].disabled=true;
    for(const button of paletteButtons()) {
      const type=button.dataset.type,label=button.querySelector('.palette-name'),name=typeInfo(type)[1];
      if(type==='POWER') {
        const id=button.dataset.power,power=BALL_POWERS[id],labelText=ballPowerName(id);label.replaceChildren(document.createTextNode(labelText));
        const role=document.createElement('small');role.textContent='Charges the next shot';label.append(role);
        button.setAttribute('aria-label',`${labelText}. Charges the next shot. ${power.description}`);button.title=power.description;continue;
      }
      label.replaceChildren(document.createTextNode(name));
      if(POWER_NAMES[type]) {
        const role=document.createElement('small');role.textContent=name===POWER_NAMES[type]?'Power peg':`${POWER_NAMES[type]} peg`;label.append(role);
        button.setAttribute('aria-label',`${powerLabel(type)}. ${POWER_DETAILS[type][1]}`);button.title=POWER_DETAILS[type][1];
      }
    }
  }
  function setupPowerNames() {
    for(const [key,[role,description]] of Object.entries(POWER_DETAILS)) {
      const field=document.createElement('div');field.className='power-name-field';
      const label=document.createElement('label');label.htmlFor='powerName'+key;label.textContent=`${POWER_NAMES[key]} (${role})`;
      const input=document.createElement('input');input.id=label.htmlFor;input.maxLength=48;input.placeholder=POWER_NAMES[key];
      const help=document.createElement('p');help.className='hint';help.id=input.id+'Help';help.textContent=description;
      input.setAttribute('aria-describedby',`powerNamesHelp ${help.id}`);field.append(label,input,help);$('powerNamesFields').append(field);
      const editing={typing:false,timer:null};powerNameEdits.set(key,editing);
      input.oninput=()=>{
        if(!editing.typing){pushUndo(snapshot());editing.typing=true;}
        writePowerName(key,input.value);renderPowerNames(false);renderPegs();renderOverview();renderCatcher();
        $('undoBtn').disabled=!undoStack.length;$('redoBtn').disabled=true;
        clearTimeout(editing.timer);editing.timer=setTimeout(()=>{if(saveDraft())status('Campaign power-up names updated. Draft saved.');},250);
      };
      input.onchange=()=>{
        clearTimeout(editing.timer);
        if(editing.typing){editing.typing=false;writePowerName(key,input.value);const saved=saveDraft();render();if(saved)status('Campaign power-up names updated. Draft saved.');}
        else commit(()=>writePowerName(key,input.value),'Campaign power-up name updated.');
      };
    }
    $('resetPowerNamesBtn').onclick=()=>commit(()=>{delete pack.meta.powerNames;},'Default power-up names restored for this campaign.');
  }
  function safePeg(p) {
    p.radius = Math.round(Math.max(8, Math.min(32, Number(p.radius) || 15)));
    p.x = Math.round(Math.max(p.radius, Math.min(W - p.radius, Number.isFinite(Number(p.x)) ? Number(p.x) : W / 2)));
    p.y = Math.round(Math.max(110, Math.min(500 - p.radius, Number.isFinite(Number(p.y)) ? Number(p.y) : 280)));
    return p;
  }
  function freshPeg(x, y) {
    if ($('snapGrid').checked) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
    return safePeg({ x, y, radius: Number($('newRadius').value) || 15, type: paletteType, ...(paletteType==='POWER' ? {power:palettePower} : {}), shape: paletteType === 'NORMAL' ? $('newShape').value : 'CIRCLE' });
  }
  function addPeg(x, y) {
    if (current().pegs.length >= 200) return status('This stage has 200 pegs. Remove a peg before adding another.', true);
    commit(() => { current().pegs.push(freshPeg(x, y)); setSelection([current().pegs.length - 1]); }, `${paletteType==='POWER' ? ballPowerName(palettePower)+' power peg' : typeInfo(paletteType)[1]} added.`);
  }
  function removePeg() {
    const indices = selectedIndices(); if (!indices.length) return;
    commit(() => { current().pegs = current().pegs.filter((p,i) => !selection.has(i)); setSelection([]); }, `${indices.length} peg${indices.length === 1 ? '' : 's'} deleted.`);
  }
  function translatePegs(pegs, dx, dy) {
    if (!pegs.length) return;
    dx = Math.max(...pegs.map(p => p.radius-p.x), Math.min(dx, ...pegs.map(p => W-p.radius-p.x)));
    dy = Math.max(...pegs.map(p => 110-p.y), Math.min(dy, ...pegs.map(p => 500-p.radius-p.y)));
    pegs.forEach(p => { p.x += dx; p.y += dy; });
  }
  function moveSelection(dx,dy) { if (selection.size) commit(() => translatePegs(selectedPegs(),dx,dy), 'Selection moved.'); }
  function resizeSelection(value, relative=false, historyGroup='') {
    if (!selection.size || !Number.isFinite(value)) return;
    commit(() => selectedPegs().forEach(p => { p.radius = relative ? p.radius+value : value; safePeg(p); }), 'Selected pegs resized.', historyGroup);
  }
  function copySelection() {
    if (!selection.size) return;
    clipboard = clone(selectedPegs()); status(`${clipboard.length} pegs copied. Paste them on this stage or another stage.`);
  }
  function insertPegs(source, point, message) {
    if (!source.length) return;
    if (current().pegs.length+source.length>200) return status('That group would exceed 200 pegs. Remove some pegs first.',true);
    commit(() => {
      const copies=clone(source), cx=copies.reduce((n,p)=>n+p.x,0)/copies.length,cy=copies.reduce((n,p)=>n+p.y,0)/copies.length;
      translatePegs(copies,point?Math.round(point.x-cx):20,point?Math.round(point.y-cy):20);
      const first=current().pegs.length; current().pegs.push(...copies); setSelection(copies.map((p,i)=>first+i));
    },message);
  }
  function duplicateSelection() { insertPegs(selectedPegs(),null,'Selection duplicated.'); }
  function pasteSelection(point=null) { insertPegs(clipboard,point,'Copied pegs pasted.'); }
  function pointerPosition(event) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * W / r.width, y: (event.clientY - r.top) * H / r.height }; }
  function hit(p) { for (let i = current().pegs.length - 1; i >= 0; i--) { const peg = current().pegs[i]; if (Math.hypot(p.x - peg.x, p.y - peg.y) <= peg.radius + 5) return i; } return -1; }
  function hitCatcher(p) {
    const plate = catcherGeometry();
    if (p.y < 498 || p.y > 524 || p.x < plate.startX-12 || p.x > plate.startX+plate.width+12) return null;
    if (Math.abs(p.x-plate.startX) <= 12) return 'plate-left';
    if (Math.abs(p.x-plate.startX-plate.width) <= 12) return 'plate-right';
    return 'plate-move';
  }
  function tool() { return document.querySelector('input[name=boardTool]:checked').value; }
  canvas.addEventListener('wheel', e => {
    if(e.ctrlKey || e.metaKey || e.deltaY === 0 || drag)return;
    const point=pointerPosition(e), found=hit(point),step=e.deltaY<0?2:-2;
    if (hitCatcher(point) || (catcherSelected && found < 0)) {
      e.preventDefault(); closeContext(false); if (!catcherSelected) selectCatcher();
      resizeCatcher(e.deltaY<0 ? 10 : -10, `plate-wheel:${levelIndex}`); return;
    }
    if(found>=0 && !selection.has(found))setSelection([found]);
    if(selection.size) {
      e.preventDefault();closeContext(false);
      resizeSelection(step,true,`wheel:${levelIndex}:${selectedIndices().join(',')}`);
    } else if(tool()==='add') {
      e.preventDefault();$('newRadius').value=Math.max(8,Math.min(32,(Number($('newRadius').value)||15)+step));
      status(`New peg radius: ${$('newRadius').value}. Scroll over an existing peg or block to resize it.`);
    }
  }, {passive:false});
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    closeContext(false);
    canvas.focus({ preventScroll: true });
    const p = pointerPosition(e), found = hit(p), plateHit = hitCatcher(p);
    if (plateHit) {
      selectCatcher();
      drag = {kind:plateHit,before:snapshot(),pointerId:e.pointerId,startX:p.x,startY:p.y,geometry:catcherGeometry(),original:current().catcher ? clone(current().catcher) : null,moved:false};
      canvas.setPointerCapture(e.pointerId); return;
    }
    if (tool() === 'add') { addPeg(p.x, p.y); return; }
    if (tool() === 'erase') { if(found>=0){setSelection([found]);removePeg();} return; }
    if (e.shiftKey && found>=0) {
      catcherSelected = false;
      selection.has(found)?selection.delete(found):selection.add(found); selectionChanged(); return;
    }
    if (found >= 0) {
      if(!selection.has(found))setSelection([found]);
      drag = { kind:'move', before:snapshot(), pointerId:e.pointerId, startX:p.x, startY:p.y, originals: selectedIndices().map(i=>({i,x:current().pegs[i].x,y:current().pegs[i].y})), moved:false };
    } else {
      const base=e.shiftKey?[...selection]:[]; if(!e.shiftKey)setSelection([]);
      drag={kind:'box',pointerId:e.pointerId,startX:p.x,startY:p.y,endX:p.x,endY:p.y,base,moved:false};
    }
    canvas.setPointerCapture(e.pointerId); selectionChanged();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) { const plateHit=hitCatcher(pointerPosition(e)); canvas.style.cursor=plateHit ? (plateHit==='plate-move'?'ew-resize':'col-resize') : tool()==='add'?'crosshair':'default'; return; }
    if (e.pointerId !== drag.pointerId) return;
    const p = pointerPosition(e), dx = p.x - drag.startX, dy = p.y - drag.startY;
    if (!drag.moved && (drag.kind.startsWith('plate-') ? Math.abs(dx) : Math.hypot(dx, dy)) < 3) return;
    drag.moved = true;
    if(drag.kind.startsWith('plate-')) {
      const offset=$('snapGrid').checked?Math.round(dx/10)*10:Math.round(dx), plate=drag.geometry;
      if(drag.kind==='plate-move') writeCatcher({startX:plate.startX+offset});
      else {
        const bonus=pack.meta.startItem==='wideCatch'?80:0,minWidth=100+bonus;
        const left=drag.kind==='plate-left'?Math.max(0,Math.min(plate.startX+plate.width-minWidth,plate.startX+offset)):plate.startX;
        const right=drag.kind==='plate-right'?Math.max(left+minWidth,Math.min(W,plate.startX+plate.width+offset)):plate.startX+plate.width;
        const effective=Math.min(780,right-left), anchoredLeft=drag.kind==='plate-left'?right-effective:left;
        writeCatcher({width:effective-bonus,startX:anchoredLeft});
      }
      renderCatcher(); renderPegs(false);
    } else if(drag.kind==='box') {
      drag.endX=p.x;drag.endY=p.y;
      const minX=Math.min(p.x,drag.startX),maxX=Math.max(p.x,drag.startX),minY=Math.min(p.y,drag.startY),maxY=Math.max(p.y,drag.startY);
      setSelection([...drag.base,...current().pegs.flatMap((peg,i)=>peg.x>=minX&&peg.x<=maxX&&peg.y>=minY&&peg.y<=maxY?[i]:[])]);
      renderPegs();
    } else {
      drag.originals.forEach(o=>Object.assign(current().pegs[o.i],{x:o.x,y:o.y}));
      translatePegs(selectedPegs(),$('snapGrid').checked?Math.round(dx/10)*10:Math.round(dx),$('snapGrid').checked?Math.round(dy/10)*10:Math.round(dy));
    }
    draw();
  });
  function finishDrag(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if(canvas.hasPointerCapture(d.pointerId))canvas.releasePointerCapture(d.pointerId);
    if(e?.type==='pointercancel') {
      if(d.kind.startsWith('plate-')) { if(d.original)current().catcher=d.original;else delete current().catcher;renderCatcher(); }
      else if(d.kind==='move') d.originals.forEach(o=>Object.assign(current().pegs[o.i],{x:o.x,y:o.y}));
      else setSelection(d.base);
      selectionChanged();return;
    }
    if((d.kind==='move'||d.kind.startsWith('plate-')) && d.moved && snapshot() !== d.before) { pushUndo(d.before); wheelHistory=null; const saved=saveDraft();render();if(saved)status(`${d.kind.startsWith('plate-')?'Base plate updated':'Selection moved'}. Draft saved.`); }
    else selectionChanged();
  }
  canvas.addEventListener('pointerup', finishDrag); canvas.addEventListener('pointercancel', finishDrag); canvas.addEventListener('lostpointercapture', finishDrag);
  canvas.addEventListener('keydown', e => {
    if (catcherSelected && ['ArrowLeft','ArrowRight','+','=','-','_'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      if (e.key.startsWith('Arrow')) changeCatcher('startX',catcherGeometry().startX+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1));
      else resizeCatcher((e.key==='+'||e.key==='='?1:-1)*(e.shiftKey?50:10));
      return;
    }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[e.key] && currentPeg()) {
      e.preventDefault(); const [dx, dy] = directions[e.key], n = e.shiftKey ? 10 : 1;
      moveSelection(dx*n,dy*n);
    }
  });
  window.addEventListener('blur', () => {finishDrag();closeContext(false);});
  window.addEventListener('beforeunload', () => { if (pack) saveDraft(); });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select,[contenteditable=true]') || $('confirmDialog').open || $('campaignChooser').open || $('backgroundDialog').open || !$('pegContextMenu').hidden || !$('plateContextMenu').hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    if ((e.ctrlKey||e.metaKey)&&['a','c','v','d'].includes(e.key.toLowerCase())) {
      e.preventDefault(); const key=e.key.toLowerCase();
      if(key==='a'){setSelection(current().pegs.map((p,i)=>i));selectionChanged();}
      if(key==='c')copySelection();if(key==='v')pasteSelection();if(key==='d')duplicateSelection();
    }
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removePeg();}
    if(e.key==='Escape'){if(drag)finishDrag({type:'pointercancel'});else {setSelection([]);selectionChanged();}}
    if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();openContext();}
  });
  $('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
  $('pegList').onchange = () => {setSelection([...$('pegList').selectedOptions].map(o=>Number(o.value)));renderPegs(false);draw();status(`${selection.size} pegs selected.`);};
  $('selectCatcherBtn').onclick = () => { finishDrag(); closeContext(false); selectCatcher(true); };
  $('addCenterBtn').onclick = () => addPeg(W / 2, 280);
  $('deletePegBtn').onclick = removePeg;
  $('duplicatePegBtn').onclick = duplicateSelection;
  $('sizeDownBtn').onclick = () => resizeSelection(-2,true);$('sizeUpBtn').onclick = () => resizeSelection(2,true);
  $('selectAllBtn').onclick=()=>{setSelection(current().pegs.map((p,i)=>i));selectionChanged();};
  $('clearSelectionBtn').onclick=()=>{setSelection([]);selectionChanged();};
  $('pegPower').onchange=()=>{const value=$('pegPower').value;if(!Object.hasOwn(BALL_POWERS,value))return;commit(()=>selectedPegs().filter(p=>p.type==='POWER').forEach(p=>p.power=value),'Selected next-shot powers updated.');};
  $('pegShape').onchange=()=>{const value=$('pegShape').value;if(value)commit(()=>selectedPegs().filter(p=>p.type==='NORMAL').forEach(p=>p.shape=value),'Blue peg shapes updated.');};
  $('pegBreakOverride').onchange=()=>{
    const value=$('pegBreakOverride').value;if(!['','crumble','instant'].includes(value)||!selectedPegs().some(p=>p.type!=='BLOCK'))return;
    commit(()=>selectedPegs().filter(p=>p.type!=='BLOCK').forEach(p=>{if(value)p.breakMode=value;else delete p.breakMode;}),value?'Selected peg breaking updated.':'Selected pegs now use the stage breaking setting.');
  };
  for (const [id, key] of [['pegX', 'x'], ['pegY', 'y'], ['pegRadius', 'radius'], ['pegType', 'type']]) $(id).onchange = () => {
    if (!currentPeg() || $(id).value==='') return;
    const value = key === 'type' ? $(id).value : Number($(id).value);
    if (key !== 'type' && !Number.isFinite(value)) { renderPegs(); return; }
    if(key==='radius')resizeSelection(value);
    else if(key==='x'||key==='y')moveSelection(key==='x'?value-currentPeg().x:0,key==='y'?value-currentPeg().y:0);
    else commit(()=>selectedPegs().forEach(p=>{p.type=value;if(value==='BLOCK')p.shape='SQUARE';if(value==='POWER')p.power=ballPowerId(p.power);else delete p.power;}),'Selected peg types updated.');
  };
  function closeContext(restoreFocus=true) {
    const menus=[$('pegContextMenu'),$('plateContextMenu')];if(menus.every(menu=>menu.hidden))return;
    menus.forEach(menu=>menu.hidden=true);$('selectionActionsBtn').setAttribute('aria-expanded','false');
    if(restoreFocus)canvas.focus({preventScroll:true});
  }
  function openContext(event) {
    finishDrag();
    if ((event && hitCatcher(pointerPosition(event))) || (!event && catcherSelected)) { openPlateContext(event); return; }
    closeContext(false);
    if(event){event.preventDefault();contextPoint=pointerPosition(event);const found=hit(contextPoint);if(found>=0&&!selection.has(found))setSelection([found]);else if(catcherSelected)setSelection([]);selectionChanged();}
    else contextPoint=null;
    const menu=$('pegContextMenu'),count=selection.size;
    $('contextSelectionLabel').textContent=`${count} peg${count===1?'':'s'} selected`;
    for(const item of menu.querySelectorAll('[data-action]')){
      const action=item.dataset.action;
      item.disabled=action==='paste'?!clipboard.length||current().pegs.length+clipboard.length>200:action==='select-all'?!current().pegs.length:action==='close'?false:!count;
      if(action==='duplicate')item.disabled=!count||current().pegs.length+count>200;
      if(action==='shape')item.disabled=!selectedPegs().some(p=>p.type==='NORMAL');
      if(action==='power')item.disabled=!selectedPegs().some(p=>p.type==='POWER');
      if(action==='break-mode')item.disabled=!selectedPegs().some(p=>p.type!=='BLOCK');
    }
    menu.hidden=false;$('selectionActionsBtn').setAttribute('aria-expanded','true');
    const rect=canvas.getBoundingClientRect(),x=event?.clientX??rect.left+Math.min(rect.width/2,150),y=event?.clientY??Math.max(12,rect.top+30);
    menu.style.left=Math.max(12,Math.min(x,innerWidth-menu.offsetWidth-12))+'px';
    menu.style.top=Math.max(12,Math.min(y,innerHeight-menu.offsetHeight-12))+'px';
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  canvas.addEventListener('contextmenu',openContext);
  $('selectionActionsBtn').onclick=()=>openContext();
  $('pegContextMenu').addEventListener('click',e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    const point=contextPoint;closeContext();
    if(action==='delete')removePeg();if(action==='duplicate')duplicateSelection();if(action==='copy')copySelection();if(action==='paste')pasteSelection(point);
    if(action==='smaller')resizeSelection(-2,true);if(action==='larger')resizeSelection(2,true);
    if(action==='select-all'){setSelection(current().pegs.map((p,i)=>i));selectionChanged();}
    if(action==='clear'){setSelection([]);selectionChanged();}
    const field={type:'pegType',power:'pegPower',shape:'pegShape',size:'pegRadius','break-mode':'pegBreakOverride'}[action];if(field){$('pegSettings').open=true;$(field).scrollIntoView({block:'center'});$(field).focus();if(field==='pegRadius')$(field).select();}
  });
  $('pegContextMenu').addEventListener('keydown',e=>{
    const items=[...$('pegContextMenu').querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();closeContext();}
  });
  function openPlateContext(event) {
    event?.preventDefault(); finishDrag(); closeContext(false); selectCatcher();
    const menu=$('plateContextMenu'),plate=catcherGeometry();
    $('plateContextLabel').textContent=`Base plate · ${plate.width}px · ${plate.behavior==='alternate'?`switches every ${plate.interval}s`:plate.behavior}`;
    for (const item of menu.querySelectorAll('[data-plate-action]')) {
      const action=item.dataset.plateAction;
      item.disabled=action==='reset'?!current().catcher:action==='interval'?plate.behavior!=='alternate':false;
      if(['catch','bounce','alternate'].includes(action)) item.setAttribute('aria-checked',String(action===plate.behavior));
    }
    menu.hidden=false;$('selectionActionsBtn').setAttribute('aria-expanded','true');
    const rect=canvas.getBoundingClientRect(),x=event?.clientX??rect.left+(plate.startX+plate.width/2)*rect.width/W,y=event?.clientY??rect.top+510*rect.height/H;
    menu.style.left=Math.max(12,Math.min(x,innerWidth-menu.offsetWidth-12))+'px';
    menu.style.top=Math.max(12,Math.min(y,innerHeight-menu.offsetHeight-12))+'px';
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  $('plateContextMenu').addEventListener('click',e=>{
    const button=e.target.closest('[data-plate-action]');if(!button||button.disabled)return;
    const action=button.dataset.plateAction;closeContext();
    if(['catch','bounce','alternate'].includes(action))changeCatcher('behavior',action);
    if(action==='smaller')resizeCatcher(-10);if(action==='larger')resizeCatcher(10);
    if(action==='reset')$('resetCatcherBtn').click();
    const field={width:'catcherWidth',position:'catcherStartX',interval:'catcherInterval'}[action];
    if(field){$('basePlateSettings').open=true;$(field).scrollIntoView({block:'center'});$(field).focus();$(field).select();}
  });
  $('plateContextMenu').addEventListener('keydown',e=>{
    const items=[...$('plateContextMenu').querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();closeContext();}
  });
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#pegContextMenu,#plateContextMenu,#selectionActionsBtn'))closeContext(false);});
  window.addEventListener('resize',()=>closeContext(false));
  document.addEventListener('scroll',e=>{if(!$('pegContextMenu').contains(e.target)&&!$('plateContextMenu').contains(e.target))closeContext(false);},true);
  $('showGrid').onchange = draw;
  $('newRadius').onchange = () => { $('newRadius').value = Math.max(8, Math.min(32, Math.round(Number($('newRadius').value) || 15))); };
  $('addPatternBtn').onclick = () => {
    const count = Math.max(3, Math.min(30, Math.round(Number($('patternCount').value) || 12)));
    if (current().pegs.length + count > 200) return status('This pattern would exceed 200 pegs. Choose fewer pegs or remove some first.', true);
    const pattern = $('patternType').value;
    commit(() => {
      const first=current().pegs.length;
      for (let i = 0; i < count; i++) {
        let x, y;
        if (pattern === 'rows') { const cols = Math.min(7, Math.ceil(Math.sqrt(count * 1.4))), rows = Math.ceil(count / cols), row = Math.floor(i / cols), col = i % cols; x = W / 2 + (col - (cols - 1) / 2) * 66 + (row % 2 ? 15 : -15); y = 280 + (row - (rows - 1) / 2) * 60; }
        else { const a = pattern === 'arc' ? Math.PI + i / (count - 1) * Math.PI : i / count * Math.PI * 2; const spread = Math.max(125, Math.min(225, (Number($('newRadius').value) * 2 + 8) * count / (Math.PI * 2))); x = W / 2 + Math.cos(a) * spread; y = (pattern === 'arc' ? 355 : 300) + Math.sin(a) * (pattern === 'arc' ? 160 : Math.min(155, spread)); }
        current().pegs.push(freshPeg(x, y));
      }
      setSelection(Array.from({length:count},(_,i)=>first+i));
    }, `${count} pegs added in a ${pattern === 'rows' ? 'row' : pattern} pattern.`);
  };
  function bindText(id, getter, key, name) {
    const input = $(id);
    let typing = false, timer;
    if (input.matches('input,textarea')) {
      input.oninput = () => {
        if (!typing) { pushUndo(snapshot()); typing = true; }
        getter()[key] = input.value;
        renderOverview();
        $('undoBtn').disabled = !undoStack.length; $('redoBtn').disabled = true;
        clearTimeout(timer);
        timer = setTimeout(() => { if (saveDraft()) status(`${name} updated. Draft saved.`); }, 250);
      };
    }
    input.onchange = () => {
      clearTimeout(timer);
      if (typing) {
        typing = false; getter()[key] = input.value.trim(); const saved = saveDraft(); render();
        if (saved) status(`${name} updated. Draft saved.`);
      } else commit(() => { getter()[key] = input.value.trim(); }, `${name} updated.`);
    };
  }
  bindText('packTitle', () => pack.meta, 'title', 'Campaign title'); bindText('packStory', () => pack.meta, 'story', 'Campaign mission');
  bindText('packMode', () => pack.meta, 'mode', 'Shot rule'); bindText('packScene', () => pack.meta, 'scene', 'Default picture'); bindText('packImageAlt', () => pack.meta, 'imageAlt', 'Picture description');
  $('packStartItem').onchange = () => commit(() => {
    const item = $('packStartItem').value;
    if (item) pack.meta.startItem = item;
    else delete pack.meta.startItem;
  }, 'Campaign starting power updated.');
  for (const [prefix, getter] of [['chapter', currentChapter], ['finale', () => pack.meta.finale]]) {
    for (const [suffix, key] of [['Title', 'title'], ['Story', 'story'], ['Scene', 'scene'], ['ImageAlt', 'imageAlt']]) bindText(prefix + suffix, getter, key, prefix === 'chapter' ? 'Chapter' : 'Final reveal');
  }
  bindText('levelTitle', current, 'title', 'Stage title'); bindText('levelStory', current, 'story', 'Stage story');
  $('levelSelect').onchange = () => { finishDrag(); levelIndex = Number($('levelSelect').value); setSelection([]); saveDraft(); render(); };
  $('chapterSelect').onchange = () => { chapterIndex = Number($('chapterSelect').value); render(); };
  $('levelChapter').onchange = () => commit(() => { current().chapter = Number($('levelChapter').value); chapterIndex = current().chapter; }, 'Stage assigned to chapter puzzle.');
  $('objective').onchange = () => commit(() => { current().objective = $('objective').value; current().goal = current().objective === 'score' ? 1500 : Math.max(1, goalCount(current())); }, 'Objective updated.');
  $('goal').onchange = () => commit(() => { current().goal = Math.max(1, Math.min(current().objective === 'score' ? 20000 : 200, Math.round(Number($('goal').value) || 1))); }, 'Goal updated.');
  $('shots').onchange = () => commit(() => { current().shots = Math.max(1, Math.min(30, Math.round(Number($('shots').value) || 10))); }, 'Shot limit updated.');
  function changePegBreaking(changes) {
    commit(()=>{
      const config={...pegBreakConfig(),...changes};
      if(config.mode==='crumble'&&config.duration===.8)delete current().pegBreak;
      else current().pegBreak=config;
    },'Stage peg breaking updated.');
  }
  $('pegBreakMode').onchange=()=>{const mode=$('pegBreakMode').value;if(['crumble','instant'].includes(mode))changePegBreaking({mode});};
  $('pegBreakDuration').onchange=()=>{
    const input=$('pegBreakDuration'),value=Number(input.value);
    const duration=input.value!==''&&Number.isFinite(value)?Math.max(.2,Math.min(3,Math.round(value*10)/10)):.8;
    changePegBreaking({duration});
  };
  $('resetPegBreakBtn').onclick=()=>commit(()=>{delete current().pegBreak;},'Default stage peg breaking restored. Individual peg overrides are kept.');
  function writeCatcher(changes) {
    const config=kit.catcherConfig(current()), next={width:config.width,behavior:config.behavior,interval:config.interval,...current().catcher,...changes};
    next.width=Math.max(100,Math.min(780,Math.round(next.width)));
    if(Object.hasOwn(next,'startX'))next.startX=Math.max(0,Math.min(W-Math.min(780,next.width+(pack.meta.startItem==='wideCatch'?80:0)),Math.round(next.startX)));
    current().catcher=next;
  }
  function changeCatcher(key, value) {
    commit(() => writeCatcher({[key]:value}), 'Base plate updated.');
  }
  function resizeCatcher(delta, historyGroup='') {
    const bonus=pack.meta.startItem==='wideCatch'?80:0,currentWidth=catcherGeometry().width,nextWidth=Math.max(100+bonus,Math.min(780,currentWidth+delta));
    if(nextWidth===currentWidth)return;
    commit(() => writeCatcher({width:nextWidth-bonus}), 'Base plate resized.',historyGroup);
  }
  $('catcherWidth').onchange = () => {
    const value = Number($('catcherWidth').value), width = Number.isFinite(value) && $('catcherWidth').value !== '' ? value : kit.catcherConfig({}).width;
    changeCatcher('width', Math.max(100, Math.min(780, Math.round(width))));
  };
  $('catcherStartX').onchange = () => {
    const value=Number($('catcherStartX').value);if(!Number.isFinite(value)||$('catcherStartX').value===''){renderCatcher();return;}
    changeCatcher('startX',value);
  };
  $('catcherBehavior').onchange = () => changeCatcher('behavior', ['catch','bounce','alternate'].includes($('catcherBehavior').value) ? $('catcherBehavior').value : 'catch');
  $('catcherInterval').onchange = () => {
    const value = Number($('catcherInterval').value), interval = Number.isFinite(value) && $('catcherInterval').value !== '' ? value : 3;
    changeCatcher('interval', Math.max(.5, Math.min(30, Math.round(interval * 2) / 2)));
  };
  $('resetCatcherBtn').onclick = () => commit(() => { delete current().catcher; }, 'Default base plate restored.');
  function goalCount(level) { return level.pegs.filter(p => level.objective === 'clear' ? p.type !== 'BLOCK' : p.type === (level.objective === 'gems' ? 'GEM' : 'TARGET')).length; }
  $('matchGoalBtn').onclick = () => { if (current().objective === 'score') return status('Score goals use points. Choose a goal, then playtest to check the challenge.'); commit(() => { current().goal = Math.max(1, goalCount(current())); }, 'Goal matched to this board.'); };
  function emptyLevel() { return { id: pack.levels.length + 1, title: 'A new stage', chapter: chapterIndex, objective: 'targets', goal: 1, shots: 10, story: '', pegs: [] }; }
  function renumber() { pack.levels.forEach((level, i) => { level.id = i + 1; }); }
  $('addLevelBtn').onclick = () => { if (pack.levels.length >= 30) return; commit(() => { pack.levels.push(emptyLevel()); levelIndex = pack.levels.length - 1; setSelection([]); }, 'New stage added. Choose sun targets and add a pattern to begin.'); };
  $('duplicateLevelBtn').onclick = () => { if (pack.levels.length >= 30) return; commit(() => { const copy = clone(current()); copy.title = `${copy.title || 'Stage'} (copy)`; pack.levels.splice(levelIndex + 1, 0, copy); levelIndex++; setSelection([]); renumber(); }, 'Stage duplicated.'); };
  $('deleteLevelBtn').onclick = async () => { if (pack.levels.length <= 1 || !await confirmAction(`Remove stage ${levelIndex + 1}, “${current().title}”, from this draft? You can undo this edit.`)) return; commit(() => { pack.levels.splice(levelIndex, 1); levelIndex = Math.min(levelIndex, pack.levels.length - 1); setSelection([]); renumber(); }, 'Stage removed.'); };
  function moveStage(delta) { const next = levelIndex + delta; if (next < 0 || next >= pack.levels.length) return; commit(() => { [pack.levels[levelIndex], pack.levels[next]] = [pack.levels[next], pack.levels[levelIndex]]; levelIndex = next; setSelection([]); renumber(); }, 'Stage order updated.'); }
  $('earlierBtn').onclick = () => moveStage(-1); $('laterBtn').onclick = () => moveStage(1);
  $('clearLevelBtn').onclick = async () => { if (!current().pegs.length || !await confirmAction('Clear all pegs from this stage? Its story and objective will stay. You can undo this edit.')) return; commit(() => { current().pegs = []; setSelection([]); }, 'Stage pegs cleared.'); };
  $('addChapterBtn').onclick = () => { if (pack.meta.chapters.length >= 12) return; commit(() => { pack.meta.chapters.push({ title: `Chapter ${pack.meta.chapters.length + 1}`, story: '', scene: pack.meta.scene || 'garden' }); chapterIndex = pack.meta.chapters.length - 1; }, 'Chapter added. Assign stages to use its background.'); };
  $('deleteChapterBtn').onclick = async () => { if (pack.meta.chapters.length <= 1 || !await confirmAction(`Remove “${currentChapter().title}”? Its stages will use the neighboring chapter background. You can undo this edit.`)) return; commit(() => { const deleted = chapterIndex; pack.meta.chapters.splice(deleted, 1); chapterIndex = Math.min(deleted, pack.meta.chapters.length - 1); pack.levels.forEach(l => { if (l.chapter === deleted) l.chapter = chapterIndex; else if (l.chapter > deleted) l.chapter--; }); }, 'Chapter removed and stages reassigned.'); };
  function confirmAction(message) {
    const dialog = $('confirmDialog');
    if (dialog.open) return Promise.resolve(false);
    $('confirmMessage').textContent = message;
    return new Promise(resolve => {
      let result = false;
      $('confirmOk').onclick = () => { result = true; dialog.close(); };
      $('confirmCancel').onclick = () => dialog.close();
      dialog.addEventListener('close', () => resolve(result), { once: true });
      dialog.showModal(); $('confirmCancel').focus();
    });
  }
  function imageObject(target) { return target === 'level' ? current() : target === 'chapter' ? currentChapter() : target === 'finale' ? pack.meta.finale : pack.meta; }
  for (const prefix of ['pack', 'chapter', 'finale']) {
    $(prefix + 'ImageBtn').onclick = () => { imageTarget = prefix; $('imageFile').click(); };
    $(prefix + 'ImageRemove').onclick = () => commit(() => { delete imageObject(prefix).image; }, 'Illustrated scene selected.');
  }
  $('imageFile').onchange = async () => {
    const file = $('imageFile').files[0], targetObject = imageObject(imageTarget), request = ++imageRequest;
    $('imageFile').value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return status('Choose a PNG, JPEG, or WebP picture.', true);
    if (file.size > 1024 * 1024) return status('Choose a picture smaller than 1 MB so the campaign can save locally.', true);
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The picture could not be read.')); reader.readAsDataURL(file); });
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error('This file is not a readable picture.')); img.src = data; });
      if (request !== imageRequest || ![pack.meta, pack.meta.finale, ...pack.meta.chapters, ...pack.levels].includes(targetObject)) return;
      commit(() => { targetObject.image = data; }, imageTarget === 'level' ? 'Stage background uploaded.' : 'Picture added. Add a description for spoken narration.');
    } catch (error) { status(error.message, true); }
  };
  function diagnostics() {
    const issues = [], chapterOrder = pack.levels.map(l => l.chapter || 0);
    pack.levels.forEach((level, i) => {
      const prefix = `Stage ${i + 1}, “${level.title || 'Untitled stage'}”: `;
      if (!level.pegs.length) issues.push(prefix + 'choose a breakable peg in the palette, then use “Add at board center” or “Add pattern”.');
      else if (!level.pegs.some(p => p.type !== 'BLOCK')) issues.push(prefix + 'stone bumpers cannot complete a stage. Choose a breakable peg in the palette and add it to this board.');
      if (['targets', 'gems'].includes(level.objective)) {
        const n = goalCount(level);
        if (!n) issues.push(prefix + `choose ${level.objective === 'gems' ? 'Gem' : 'Sun target'} in the palette and add pegs for this objective, or change the Objective.`);
        else if (level.goal > n) issues.push(prefix + `the goal is ${level.goal}, but the board has only ${n}. Use “Match goal to board”.`);
      }
    });
    pack.meta.chapters.forEach((c, i) => { if (!chapterOrder.includes(i)) issues.push(`Chapter ${i + 1}, “${c.title || 'Untitled chapter'}”: choose this chapter in a stage's “Reveal tiles for” field, or remove the empty chapter.`); });
    const outOfOrder = chapterOrder.findIndex((n, i) => i && n < chapterOrder[i - 1]);
    if (outOfOrder >= 0) issues.push(`Stage ${outOfOrder + 1} reveals chapter ${chapterOrder[outOfOrder] + 1} after chapter ${chapterOrder[outOfOrder - 1] + 1}. Use “Move earlier” or change “Reveal tiles for” so chapters run in order.`);
    return issues;
  }
  function spacingWarnings() {
    return pack.levels.flatMap((level, i) => {
      let overlaps = 0;
      for (let a = 0; a < level.pegs.length; a++) for (let b = a + 1; b < level.pegs.length; b++) { const p = level.pegs[a], q = level.pegs[b]; if (Math.hypot(p.x - q.x, p.y - q.y) < p.radius + q.radius + 2) overlaps++; }
      return overlaps ? [`Stage ${i + 1}: ${overlaps} overlapping peg pair${overlaps === 1 ? '' : 's'}. Select a peg and adjust its X/Y position to leave a clear ball path, then playtest.`] : [];
    });
  }
  function checkedPack(show = true) {
    const issues = diagnostics();
    const warnings = spacingWarnings();
    let normalized;
    try { normalized = kit.validatePack(clone(pack)); } catch (error) { issues.push(error.message); }
    if (show) {
      $('issues').replaceChildren(...[...issues, ...warnings].map(message => { const li = document.createElement('li'); li.textContent = message; return li; }));
      $('reviewSummary').textContent = issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'} to fix before saving or playing.` : `Ready to discover: ${pack.levels.length} stages, ${pack.meta.chapters.length} chapter puzzles, and a final reveal.${warnings.length ? ' Spacing notes are listed below.' : ''}`;
      status(issues.length ? 'Review the listed goals, spacing, and chapter assignments.' : 'All stages are ready to play.', Boolean(issues.length));
    }
    if (issues.length) return null;
    return normalized;
  }
  $('validateBtn').onclick = () => checkedPack();
  function localLibrary() {
    let library;
    try { library = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); } catch (_) { library = []; }
    if (!Array.isArray(library)) library = [];
    library = library.filter(p => p && p.meta && Array.isArray(p.levels));
    try { const latest = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null'); if (latest?.meta && !library.some(p => p.meta.title === latest.meta.title)) library.push(latest); } catch (_) {}
    return library;
  }
  function refreshLibrary() {
    const index = $('savedSelect').value || '0', library = localLibrary();
    optionSelect('savedSelect', library.length ? library.map((p, i) => [i, p.meta.title || 'Untitled campaign']) : [['', 'No campaigns saved yet']], index);
    if (library.length && $('savedSelect').selectedIndex < 0) $('savedSelect').selectedIndex = 0;
    $('loadSavedBtn').disabled = !library.length; $('deleteSavedBtn').disabled = !library.length;
  }
  $('saveGameBtn').onclick = () => {
    const normalized = checkedPack(); if (!normalized) return;
    try {
      const library = localLibrary();
      const index = library.findIndex(p => p?.meta?.title === normalized.meta.title);
      if (index >= 0) library[index] = normalized;
      else if (library.length < 12) library.push(normalized);
      else return status('The game library holds 12 campaigns. Reuse a saved campaign title to update it, or export this one as JSON.', true);
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(normalized)); } catch (_) { /* The full library is already saved and available to the game. */ }
      refreshLibrary();
      status('Campaign saved to the game library. Save with the same title to update it; use a new title to keep another campaign.');
    }
    catch (_) { status('The campaign could not save: browser storage is full. Export a JSON backup or use smaller pictures.', true); }
  };
  $('playtestBtn').onclick = () => {
    const normalized = checkedPack(); if (!normalized) return;
    try { localStorage.setItem(TEST_KEY, JSON.stringify(normalized)); location.href = 'index.html?playtest=1'; }
    catch (_) { status('Playtest could not start because browser storage is full. Use smaller pictures or export a backup.', true); }
  };
  $('exportBtn').onclick = () => {
    const normalized = checkedPack(); if (!normalized) return;
    downloadJSON(normalized, normalized.meta.title);
    status('Campaign JSON exported with stories, objectives, and puzzle pictures.');
  };
  function downloadJSON(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = (name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'p3gl-campaign') + '.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('exportDraftBtn').onclick = () => { downloadJSON({ editorDraft: true, version: 2, pack: clone(pack), levelIndex }, (pack.meta.title || 'p3gl') + '-draft'); status('Draft backup exported. Reopen this file in the Workshop to continue unfinished stages.'); };
  function replacePack(raw, message) { const next = ensureStories(kit.validatePack(raw)); commit(() => { pack = clone(next); levelIndex = 0; chapterIndex = 0; setSelection([]); imageRequest++; }, message || 'Campaign opened.'); }
  async function offerImport(raw) {
    if (raw?.editorDraft === true) {
      const candidate = raw.pack;
      if (!candidate?.meta || !Array.isArray(candidate.levels) || !candidate.levels.length || candidate.levels.length > 30 || !candidate.levels.every(l => Array.isArray(l?.pegs))) return status('Import failed: this draft has no usable stages.', true);
      let draft;
      try { draft = recoverDraft(candidate); } catch (error) { return status('Import failed: ' + error.message, true); }
      if (!await confirmAction(`Reopen unfinished draft “${draft.meta.title}”? You can undo this import.`)) return;
      commit(() => { pack = draft; levelIndex = Math.max(0, Math.min(pack.levels.length - 1, Number.isInteger(raw.levelIndex) ? raw.levelIndex : 0)); chapterIndex = current().chapter || 0; setSelection([]); imageRequest++; }, 'Unfinished draft imported.');
      return;
    }
    let normalized;
    try { normalized = kit.validatePack(raw); }
    catch (error) { status('Import failed: ' + error.message, true); return; }
    if (!await confirmAction(`Open “${normalized.meta.title}” with ${normalized.levels.length} stages? It will replace this draft. You can undo the import.`)) return;
    replacePack(normalized, 'Campaign imported.');
  }
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async () => {
    const file = $('importFile').files[0]; $('importFile').value = ''; if (!file) return;
    if (file.size > 24 * 1024 * 1024) return status('Choose a campaign JSON file smaller than 24 MB.', true);
    try { await offerImport(JSON.parse(await file.text())); } catch (error) { status('Import failed: ' + error.message, true); }
  };
  $('importTextBtn').onclick = async () => { try { await offerImport(JSON.parse($('jsonInput').value)); } catch (error) { status('Import failed: enter valid JSON. ' + error.message, true); } };
  $('loadSavedBtn').onclick = async () => { const data = localLibrary()[Number($('savedSelect').value)]; if (!data) return status('No custom campaign is saved yet. Save this draft to the game first.'); await offerImport(data); };
  $('deleteSavedBtn').onclick = async () => {
    const library = localLibrary(), index = Number($('savedSelect').value), adventure = library[index];
    if (!adventure || !await confirmAction(`Remove the saved copy of “${adventure.meta.title}” from this browser’s game library? Your open draft stays here. Export JSON first if you want a portable copy.`)) return;
    try {
      library.splice(index, 1); localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
      const latest = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null'); if (latest?.meta?.title === adventure.meta.title) localStorage.removeItem(CUSTOM_KEY);
      refreshLibrary(); status('Saved campaign removed from the game library. Your draft is still open.');
    } catch (_) { status('The saved copy could not be removed. Browser storage is unavailable.', true); }
  };
  function chooseCampaign(title, hint, entries) {
    const dialog = $('campaignChooser');
    if (dialog.open) return Promise.resolve(null);
    finishDrag(); closeContext(false);
    $('campaignChooserTitle').textContent = title; $('campaignChooserHint').textContent = hint;
    return new Promise(resolve => {
      let choice = null;
      $('campaignChooserOptions').replaceChildren(...entries.map(entry => {
        const button = document.createElement('button'); button.className = 'campaign-choice'; button.dataset.campaignChoice = entry.value;
        const label = document.createElement('span'); label.textContent = entry.label; button.append(label);
        if (entry.description) { const detail = document.createElement('small'); detail.textContent = entry.description; button.append(detail); }
        button.onclick = () => { choice = entry.value; dialog.close(); };
        return button;
      }));
      $('campaignChooserCancel').onclick = () => dialog.close();
      dialog.addEventListener('close', () => resolve(choice), {once:true});
      dialog.showModal(); $('campaignChooserCancel').focus();
    });
  }
  function createTemplateCopy(raw) {
    const template = kit.validatePack(raw), base = template.meta.title;
    const titles = new Set(localLibrary().map(entry => entry.meta.title));
    let copyTitle = `${base} (copy)`, number = 2;
    while (titles.has(copyTitle)) copyTitle = `${base} (copy ${number++})`;
    template.meta.title = copyTitle;
    replacePack(template, 'Editable template copy created.');
  }
  $('newPackBtn').onclick = async () => {
    const choice = await chooseCampaign('New campaign', 'Choose a starting point to replace the open draft. Undo restores your previous draft. Your saved campaigns stay in the library.', [
      {value:'blank', label:'Blank campaign', description:'One empty stage, ready for your pegs and base plate.'},
      ...STORY_TEMPLATES.map(template => ({value:template.value,label:template.name+' template',description:template.description || '20 stages with a complete story, changing backgrounds, and varied base plates.'})),
      {value:'lantern', label:'Lantern Trail template', description:'Six stages with targets, gems, and score goals.'},
      {value:'original', label:'Original Benny’s P3GL template', description:'The original campaign layouts with bouncing base plates.'}
    ]);
    if (!choice) return;
    if (choice === 'blank') {
      commit(() => {
        pack = {meta:{format:'bennys-peggle-levels-v2',title:'My arcade campaign',mode:'adventure',scene:'garden',story:'Hit every sun target, catch the ball, and build your best bounce chain.',chapters:[{title:'Chapter 1',story:'',scene:'garden'}],finale:{title:'Campaign complete',story:'',scene:'night'}},levels:[{id:1,title:'Stage 1',chapter:0,objective:'targets',goal:1,shots:10,story:'',pegs:[]}]};
        chapterIndex = 0; levelIndex = 0; setSelection([]); imageRequest++;
      }, 'Blank campaign created. Add pegs to begin.');
      return;
    }
    try {
      if (choice === 'lantern') createTemplateCopy(kit.builtInPack);
      if (choice === 'original') {
        const response = await fetch('levels/Bennys_Campaign.json');
        if (!response.ok) throw new Error('The original campaign file could not be loaded.');
        createTemplateCopy(await response.json());
      }
      const storyTemplate = STORY_TEMPLATES.find(template => template.value === choice);
      if (storyTemplate) {
        const response = await fetch(`levels/${storyTemplate.value}.json`);
        if (!response.ok) throw new Error('The story campaign file could not be loaded.');
        createTemplateCopy(await response.json());
      }
    } catch (error) { status('Template could not open: ' + error.message, true); }
  };
  $('openPackBtn').onclick = async () => {
    const library = localLibrary();
    const choice = await chooseCampaign('Open campaign', 'Open a saved campaign or choose a JSON file. The current draft stays open until you confirm its replacement.', [
      ...library.map((entry, index) => ({value:'saved-'+index,label:entry.meta.title || 'Untitled campaign',description:`Saved campaign · ${entry.levels.length} stage${entry.levels.length === 1 ? '' : 's'}`})),
      {value:'file',label:'Open JSON file',description:'Import a campaign or continue an unfinished draft.'}
    ]);
    if (choice === 'file') $('importFile').click();
    else if (choice?.startsWith('saved-')) await offerImport(library[Number(choice.slice(6))]);
  };
  sceneOptions(); setupPalette(); setupPowerNames(); loadInitial(); render();
  // Read-only draft access plus public editor actions for integration checks.
  window.PeggleEditor = { getDraft: () => clone(pack), getLevelIndex: () => levelIndex, getSelection: () => selectedIndices(), diagnostics, validate: () => checkedPack(false), importPack: raw => replacePack(raw), undo, redo };
})();
