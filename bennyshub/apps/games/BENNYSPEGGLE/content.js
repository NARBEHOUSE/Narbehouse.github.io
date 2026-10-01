/* Shared adventure content and deterministic, browser-independent game model. */
(function (root, factory) {
  'use strict';
  const kit = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = kit;
  if (root) root.PeggleKit = kit;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const W = 820, H = 540;
  const CATCHER_WIDTH = 240, WIDE_CATCHER_WIDTH = 320;
  const TYPES = ['NORMAL', 'TARGET', 'GEM', 'EXTRA', 'EXPLODE', 'MULTIBALL', 'POWER', 'BLOCK'];
  const SHAPES = ['CIRCLE', 'SQUARE', 'TRI', 'STAR', 'HEX', 'PLUS'];
  const BACKGROUNDS = [
    {id:'garden',name:'Hidden Garden',theme:'garden',src:'assets/scene-garden.png'},
    {id:'coast',name:'Lantern Coast',theme:'coast',src:'assets/scene-coast.png'},
    {id:'night',name:'Starry Night',theme:'night',src:'assets/scene-night.png'},
    {id:'forest',name:'Enchanted Forest',theme:'garden',src:'assets/backgrounds/forest.png'},
    {id:'waterfall',name:'Hidden Waterfall',theme:'coast',src:'assets/backgrounds/waterfall.png'},
    {id:'autumn',name:'Autumn Woods',theme:'garden',src:'assets/backgrounds/autumn.png'},
    {id:'meadow',name:'Wildflower Meadow',theme:'garden',src:'assets/backgrounds/meadow.png'},
    {id:'cherry-blossom',name:'Cherry Blossom Garden',theme:'garden',src:'assets/backgrounds/cherry-blossom.png'},
    {id:'bamboo',name:'Bamboo Grove',theme:'garden',src:'assets/backgrounds/bamboo.png'},
    {id:'alpine',name:'Alpine Valley',theme:'garden',src:'assets/backgrounds/alpine.png'},
    {id:'snowy-mountains',name:'Snowy Mountains',theme:'night',src:'assets/backgrounds/snowy-mountains.png'},
    {id:'desert',name:'Golden Desert',theme:'garden',src:'assets/backgrounds/desert.png'},
    {id:'canyon',name:'Red Rock Canyon',theme:'garden',src:'assets/backgrounds/canyon.png'},
    {id:'volcano',name:'Volcanic Island',theme:'night',src:'assets/backgrounds/volcano.png'},
    {id:'lagoon',name:'Turquoise Lagoon',theme:'coast',src:'assets/backgrounds/lagoon.png'},
    {id:'tropical-beach',name:'Tropical Beach',theme:'coast',src:'assets/backgrounds/tropical-beach.png'},
    {id:'coral-reef',name:'Coral Reef',theme:'coast',src:'assets/backgrounds/coral-reef.png'},
    {id:'harbor',name:'Quiet Harbor',theme:'coast',src:'assets/backgrounds/harbor.png'},
    {id:'lighthouse',name:'Lighthouse Point',theme:'coast',src:'assets/backgrounds/lighthouse.png'},
    {id:'river',name:'Winding River',theme:'coast',src:'assets/backgrounds/river.png'},
    {id:'lake',name:'Mirror Lake',theme:'coast',src:'assets/backgrounds/lake.png'},
    {id:'aurora',name:'Northern Lights',theme:'night',src:'assets/backgrounds/aurora.png'},
    {id:'moon',name:'Moonlit Peaks',theme:'night',src:'assets/backgrounds/moon.png'},
    {id:'galaxy',name:'Cosmic Nebula',theme:'night',src:'assets/backgrounds/galaxy.png'}
  ];
  const SCENES = BACKGROUNDS.map(background=>background.id);
  function backgroundInfo(id) { return BACKGROUNDS.find(background=>background.id===id)||BACKGROUNDS[0]; }
  const MODES = ['adventure', 'arcade', 'free'];
  const OBJECTIVES = ['targets', 'score', 'clear', 'gems'];
  const VALUES = { NORMAL: 100, TARGET: 150, GEM: 200, EXTRA: 100, EXPLODE: 150, MULTIBALL: 150, POWER: 150, BLOCK: 0 };
  // A charge peg banks one power for a later shot. Distinct powers fire together;
  // spare charges of the same power stay banked for future turns.
  const BALL_POWERS = Object.freeze({
    ghost: {name:'Ghost ball',symbol:'◌',color:'#bee5f6',description:'A translucent ball passes through and collects breakable pegs. Stone blocks still bounce it.'},
    blast: {name:'Blast ball',symbol:'✦',color:'#ff78ba',description:'The first peg hit releases a large burst that collects nearby breakable pegs.'},
    multiball: {name:'Multiball',symbol:'●●',color:'#a8ecff',description:'Launch three balls in a spreading fan for the cost of one shot.'},
    fireball: {name:'Fireball',symbol:'♨',color:'#ffb34b',description:'Burn through breakable pegs and collect a small circle of neighbors with every direct hit. Stone blocks stay solid.'},
    echo: {name:'Echo ball',symbol:'↻',color:'#bbaaef',description:'Each ball returns to the top once when it falls past the base plate, giving your shot another pass.'},
    magnet: {name:'Magnet ball',symbol:'∩',color:'#5ae1a6',description:'Pull falling balls toward the moving base plate for this shot.'},
    guide: {name:'Super guide',symbol:'↗',color:'#ffe65c',description:'Preview a longer path and several bounces before firing your charged shot.'}
  });
  const SCORE_SHOTS = [2500,6000,10000];
  const POWER_NAMES = Object.freeze({POWER:'Power ball',...Object.fromEntries(Object.entries(BALL_POWERS).map(([id,power])=>['power_'+id,power.name])), EXTRA:'Extra shot', EXPLODE:'Burst', MULTIBALL:'Multiball', wideCatch:'Wider base plate', magnet:'Magnet', blast:'First-hit burst', bonusShots:'Three extra shots' });
  function powerName(meta, key) { return meta?.powerNames?.[key] || POWER_NAMES[key] || 'Power-up'; }
  function ballPowerName(meta,id) { return powerName(meta,'power_'+id); }
  function normalizePowerNames(value) {
    if(value===undefined||value===null)return null;
    if(typeof value!=='object'||Array.isArray(value))throw new Error('Power-up names must be an object.');
    const names={};
    for(const key of Object.keys(value)) {
      if(!Object.hasOwn(POWER_NAMES,key))throw new Error('Unknown power-up name: '+key+'.');
      if(value[key]===null||value[key]===undefined)continue;
      if(typeof value[key]!=='string')throw new Error(POWER_NAMES[key]+' name must be text.');
      const name=value[key].replace(/\s+/g,' ').trim().slice(0,48);
      if(name&&name!==POWER_NAMES[key])names[key]=name;
    }
    return Object.keys(names).length?names:null;
  }
  const ALIASES = { MULTI: 'MULTIBALL', SPRAY: 'MULTIBALL', INVINCIBLE: 'EXTRA', HAZARD: 'BLOCK' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  function text(value, fallback, max) {
    return typeof value === 'string' ? value.trim().slice(0, max || 1200) : fallback;
  }
  function number(value, fallback, label) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(label + ' must be a number.');
    return parsed;
  }
  function imageFields(value, label) {
    const fields = {};
    if (value && value.image) {
      const payload = typeof value.image === 'string' ? value.image.slice(value.image.indexOf(',') + 1) : '';
      const imageBytes = payload.length * .75 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
      if (typeof value.image !== 'string' || imageBytes > 1048576 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.image)) {
        throw new Error(label + ' image must be a PNG, JPEG, or WebP data image smaller than 1 MB.');
      }
      fields.image = value.image;
    }
    if (value && value.imageAlt) fields.imageAlt = text(value.imageAlt, '', 240);
    return fields;
  }
  function scene(value, fallback) { return SCENES.includes(value) ? value : fallback; }
  function normalizeChapter(value, fallback, index) {
    const explicit = !!value && typeof value === 'object';
    value = explicit ? value : {};
    return Object.assign({
      title: text(value.title, fallback.title || 'Chapter ' + (index + 1), 90),
      story: text(value.story, fallback.story || '', 1200),
      scene: scene(value.scene, fallback.scene || 'garden')
    }, imageFields(explicit ? value : fallback, 'Chapter ' + (index + 1)));
  }
  function catcherConfig(level, options) {
    const authored=level.catcher||{};
    const width=clamp((authored.width||CATCHER_WIDTH)+(options?.wideCatch?WIDE_CATCHER_WIDTH-CATCHER_WIDTH:0),100,W-40);
    return {width,behavior:authored.behavior||'catch',interval:authored.interval||3,startX:clamp(authored.startX??(W-width)/2,0,W-width)};
  }
  function catcherPhase(x,width,elapsed=0,direction=1) {
    const angle=Math.asin(clamp(2*x/(W-width)-1,-1,1));
    return (direction<0?Math.PI-angle:angle)-elapsed*.65;
  }
  function isObjectivePeg(level,peg) {
    if(!peg||peg.hit||peg.type==='BLOCK')return false;
    if(level.objective==='targets')return peg.type==='TARGET';
    if(level.objective==='gems')return peg.type==='GEM';
    return VALUES[peg.type]>0;
  }
  function pegBreakConfig(level,peg) {
    return {mode:peg?.breakMode||level.pegBreak?.mode||'crumble',duration:level.pegBreak?.duration??.8};
  }
  function pegBreakProgress(level,peg,extraAge=0) {
    if(!peg.hit||peg.type==='BLOCK')return 0;
    const config=pegBreakConfig(level,peg);
    return config.mode==='instant'?1:clamp(((peg.breakAge||0)+Math.max(0,Number(extraAge)||0))/config.duration,0,1);
  }
  function validatePack(raw) {
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { throw new Error('This file is not valid JSON.'); }
    }
    if (!raw || typeof raw !== 'object') throw new Error('Choose a level pack containing a levels array.');
    let input = Array.isArray(raw) ? raw : raw.levels;
    // Older editor exports can be a numbered map of peg arrays.
    if (!Array.isArray(input) && input && typeof input === 'object') {
      input = Object.keys(input).sort((a, b) => Number(a) - Number(b)).map(key => ({ id: Number(key), pegs: input[key] }));
    }
    if (!Array.isArray(input) && !raw.meta) {
      const keys = Object.keys(raw).filter(key => /^\d+$/.test(key));
      if (keys.length) input = keys.sort((a, b) => Number(a) - Number(b)).map(key => ({ id: Number(key), pegs: raw[key] }));
    }
    if (!Array.isArray(input) || !input.length) throw new Error('The pack needs at least one stage.');
    if (input.length > 30) throw new Error('A pack can contain up to 30 stages.');
    const oldMeta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
    const meta = Object.assign({
      format: 'bennys-peggle-levels-v2',
      title: text(oldMeta.title, 'My P3GL Adventure', 90),
      scene: scene(oldMeta.scene, 'garden'),
      mode: MODES.includes(oldMeta.mode) ? oldMeta.mode : 'adventure',
      story: text(oldMeta.story, 'A new adventure is waiting.', 1200)
    }, imageFields(oldMeta, 'Pack'));
    if (oldMeta.startItem !== undefined && oldMeta.startItem !== null && oldMeta.startItem !== '') {
      if (!['wideCatch', 'magnet', 'blast', 'bonusShots'].includes(oldMeta.startItem)) throw new Error('Campaign starting item must be Wider base plate, Magnet, First-hit burst, or Three extra shots.');
      meta.startItem = oldMeta.startItem;
    }
    const powerNames=normalizePowerNames(oldMeta.powerNames);
    if(powerNames)meta.powerNames=powerNames;
    const chapterInput = Array.isArray(oldMeta.chapters) && oldMeta.chapters.length ? oldMeta.chapters : [meta];
    if (chapterInput.length > 12 || chapterInput.length > input.length) throw new Error('Each chapter needs a stage; a pack can have up to 12 chapters.');
    meta.chapters = chapterInput.map((chapter, index) => normalizeChapter(chapter, meta, index));
    meta.finale = normalizeChapter(oldMeta.finale, { title: 'The picture is complete', story: 'Every little discovery brought this whole picture to life.', scene: 'night' }, 0);
    const levels = input.map((original, index) => {
      const level = Array.isArray(original) ? { pegs: original } : original;
      const label = 'Stage ' + (index + 1);
      if (!level || !Array.isArray(level.pegs) || !level.pegs.length) throw new Error(label + ' needs at least one peg.');
      if (level.pegs.length > 200) throw new Error(label + ' can contain up to 200 pegs.');
      const pegs = level.pegs.map((source, pegIndex) => {
        if (!source || typeof source !== 'object') throw new Error(label + ', peg ' + (pegIndex + 1) + ' is invalid.');
        const pegLabel = label + ', peg ' + (pegIndex + 1);
        const radius = clamp(number(source.radius, 13, pegLabel + ' radius'), 8, 32);
        const typeInput = source.block ? 'BLOCK' : String(source.type || 'NORMAL').toUpperCase();
        const type = ALIASES[typeInput] || typeInput;
        if (!TYPES.includes(type)) throw new Error(pegLabel + ' has an unknown peg type: ' + typeInput + '.');
        const peg = {
          id: pegIndex,
          x: clamp(number(source.x, NaN, pegLabel + ' x position'), radius, W - radius),
          y: clamp(number(source.y, NaN, pegLabel + ' y position'), Math.max(110, radius), 500 - radius),
          radius, type,
          shape: type === 'BLOCK' ? 'SQUARE' : (SHAPES.includes(source.shape) ? source.shape : 'CIRCLE')
        };
        if(type==='POWER') {
          const power=source.power??'ghost';
          if(!Object.hasOwn(BALL_POWERS,power))throw new Error(pegLabel+' has an unknown ball power: '+power+'.');
          peg.power=power;
        }
        if (!Number.isFinite(peg.x) || !Number.isFinite(peg.y)) throw new Error(pegLabel + ' needs an x and y position.');
        if (typeof source.color === 'string' && source.color.length <= 50) peg.color = source.color;
        if(source.breakMode!==undefined) {
          if(!['crumble','instant'].includes(source.breakMode))throw new Error(pegLabel+' break mode must be crumble or instant.');
          peg.breakMode=source.breakMode;
        }
        return peg;
      });
      const playable = pegs.filter(peg => peg.type !== 'BLOCK');
      if (!playable.length) throw new Error(label + ' needs a peg that can be collected.');
      const objective = OBJECTIVES.includes(level.objective) ? level.objective : (oldMeta.format === 'bennys-peggle-levels-v2' ? 'targets' : 'clear');
      const requestedGoal = Math.round(number(level.goal, objective === 'score' ? Math.min(2000, playable.reduce((sum, peg) => sum + VALUES[peg.type], 0)) : 6, label + ' goal'));
      if (objective === 'targets' && !playable.some(peg => peg.type === 'TARGET')) {
        playable.filter(peg => peg.type === 'NORMAL').slice(0, clamp(requestedGoal, 1, playable.length)).forEach(peg => { peg.type = 'TARGET'; });
        if (!playable.some(peg => peg.type === 'TARGET')) playable[0].type = 'TARGET';
      }
      if (objective === 'gems' && !playable.some(peg => peg.type === 'GEM')) {
        playable.filter(peg => peg.type === 'NORMAL').slice(0, clamp(requestedGoal, 1, playable.length)).forEach(peg => { peg.type = 'GEM'; });
        if (!playable.some(peg => peg.type === 'GEM')) playable[0].type = 'GEM';
      }
      let goal;
      if (objective === 'clear') goal = playable.length;
      else if (objective === 'targets') goal = pegs.filter(peg => peg.type === 'TARGET').length;
      else if (objective === 'gems') goal = clamp(requestedGoal, 1, pegs.filter(peg => peg.type === 'GEM').length);
      else {
        const maxScore = playable.reduce((sum, peg) => sum + VALUES[peg.type], 0);
        if (requestedGoal < 100 || requestedGoal > Math.min(20000, maxScore)) throw new Error(label + ' score goal must be between 100 and ' + Math.min(20000, maxScore) + ' for these pegs.');
        goal = requestedGoal;
      }
      const chapter = Math.round(number(level.chapter, 0, label + ' chapter'));
      if (chapter < 0 || chapter >= meta.chapters.length) throw new Error(label + ' needs an existing chapter.');
      const result = {
        id: index + 1,
        title: text(level.title, label, 90), chapter, objective, goal,
        shots: clamp(Math.round(number(level.shots === undefined ? level.balls : level.shots, 10, label + ' shots')), 1, 30),
        story: text(level.story, '', 800), pegs
      };
      if(level.scene!==undefined) {
        if(!SCENES.includes(level.scene))throw new Error(label+' background must be an available template.');
        result.scene=level.scene;
      }
      Object.assign(result,imageFields(level,label+' background'));
      if(level.catcher!==undefined) {
        if(!level.catcher||typeof level.catcher!=='object'||Array.isArray(level.catcher))throw new Error(label+' base plate settings must be an object.');
        const width=number(level.catcher.width,CATCHER_WIDTH,label+' base plate width');
        const behavior=level.catcher.behavior||'catch';
        const interval=number(level.catcher.interval,3,label+' base plate switching interval');
        if(width<100||width>W-40)throw new Error(label+' base plate width must be between 100 and '+(W-40)+'.');
        if(!['catch','bounce','alternate'].includes(behavior))throw new Error(label+' base plate behavior must be catch, bounce, or alternate.');
        if(interval<.5||interval>30)throw new Error(label+' base plate switching interval must be between 0.5 and 30 seconds.');
        result.catcher={width:Math.round(width),behavior,interval:Math.round(interval*10)/10};
        if(level.catcher.startX!==undefined)result.catcher.startX=clamp(number(level.catcher.startX,(W-result.catcher.width)/2,label+' base plate starting position'),0,W-result.catcher.width);
      }
      if(level.pegBreak!==undefined) {
        if(!level.pegBreak||typeof level.pegBreak!=='object'||Array.isArray(level.pegBreak))throw new Error(label+' peg breaking settings must be an object.');
        const mode=level.pegBreak.mode??'crumble',duration=number(level.pegBreak.duration,.8,label+' peg crumble duration');
        if(!['crumble','instant'].includes(mode))throw new Error(label+' peg break mode must be crumble or instant.');
        if(duration<.2||duration>3)throw new Error(label+' peg crumble duration must be between 0.2 and 3 seconds.');
        if(mode!=='crumble'||duration!==.8)result.pegBreak={mode,duration};
      }
      return result;
    });
    let lastChapter = 0;
    levels.forEach((level, index) => {
      if (level.chapter < lastChapter || level.chapter > lastChapter + (index ? 1 : 0)) throw new Error('Keep stages in chapter order, starting with the first chapter.');
      lastChapter = level.chapter;
    });
    meta.chapters.forEach((chapter, chapterIndex) => {
      const assigned = levels.map((level, index) => level.chapter === chapterIndex ? index : -1).filter(index => index >= 0);
      if (!assigned.length) throw new Error('Chapter ' + (chapterIndex + 1) + ' needs at least one stage.');
      chapter.start = assigned[0]; chapter.end = assigned[assigned.length - 1];
    });
    return { meta, levels };
  }

  function stagePegs(pattern, chapter) {
    const pegs = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 5; col++) {
        let x = 150 + col * 130, y = 140 + row * 54;
        if (pattern === 1) x += Math.sin(row * 1.25) * 36;
        if (pattern === 2) y += Math.sin(col * 1.6 + row * .5) * 17;
        if (pattern === 3) x += row % 2 ? 30 : -30;
        if (pattern === 4) { x += Math.sin(row + col) * 25; y += col % 2 ? 13 : 0; }
        if (pattern === 5) { x += (row - 2.5) * (col - 2) * 6; y += Math.cos(col * 1.7) * 13; }
        const i = row * 5 + col;
        let type = 'NORMAL';
        if ([2, 6, 13, 17, 20, 28].includes(i)) type = 'TARGET';
        if ([4, 11, 18, 25].includes(i)) type = 'GEM';
        if (i === 8) type = 'MULTIBALL';
        if (i === 22) type = 'EXPLODE';
        if (i === 15) type = 'EXTRA';
        // A few friendly obstacles change routes without crowded peg clusters.
        if (chapter && [10, 19].includes(i)) type = 'BLOCK';
        pegs.push({ x, y, radius: type === 'BLOCK' ? 17 : 13, type, shape: type === 'BLOCK' ? 'SQUARE' : 'CIRCLE' });
      }
    }
    return pegs;
  }
  const builtInPack = validatePack({
    meta: {
      format: 'bennys-peggle-levels-v2', title: 'The Lantern Trail', scene: 'garden', mode: 'adventure',
      story: 'The old observatory has gone dark. Follow a trail of scattered lantern light through the garden and along the sea. Piece together each scene to discover what is waiting above the clouds.',
      chapters: [
        { title: 'The Hidden Garden', scene: 'garden', story: 'A gate opens into a garden that everyone thought had been forgotten. Three fragments will reveal where the lantern trail begins.' },
        { title: 'The Moonlit Coast', scene: 'coast', story: 'Beyond the garden, the tide has carried lantern light to a quiet cove. Find three more fragments and the path to the observatory will appear.' }
      ],
      finale: { title: 'A Sky Full of Lanterns', scene: 'night', story: 'The observatory opens. Its light was never lost: it was waiting for someone to gather the scattered pieces. Lanterns rise from the garden and the sea, until the whole sky shines with every discovery you made.' }
    },
    levels: [
      { title: 'Wake the lanterns', chapter: 0, objective: 'targets', shots: 10, story: 'The first lanterns blink awake. Between the leaves, the outline of a hidden gate appears.', pegs: stagePegs(0, 0) },
      { title: 'Dewdrop treasures', chapter: 0, objective: 'gems', goal: 4, shots: 11, story: 'Dewdrops gather into a shining trail. A little bridge waits beyond the gate.', pegs: stagePegs(1, 0) },
      { title: 'Light the bridge', chapter: 0, objective: 'score', goal: 2000, shots: 10, story: 'The garden picture is complete. Its lanterns point across the bridge toward the sea.', pegs: stagePegs(2, 0) },
      { title: 'Harbor lights', chapter: 1, objective: 'targets', shots: 11, story: 'Lantern reflections drift across the cove. The distant lighthouse begins to glow.', pegs: stagePegs(3, 1) },
      { title: 'The tide leaves a trail', chapter: 1, objective: 'clear', shots: 15, story: 'As the tide retreats, a winding stairway is revealed on the cliffs.', pegs: stagePegs(4, 1) },
      { title: 'Starlight in the shallows', chapter: 1, objective: 'gems', goal: 4, shots: 12, story: 'The coast picture is complete. The final fragments show the observatory door, ready to open.', pegs: stagePegs(5, 1) }
    ]
  });

  const legacyTrailPack=clone(builtInPack);
  const trailPowers=[['ghost','multiball'],['blast','echo'],['guide','fireball'],['multiball','magnet'],['fireball','blast','echo'],['magnet','ghost','guide']];
  builtInPack.levels.forEach((level,index)=>{
    const entrances=level.pegs.filter(peg=>peg.type==='NORMAL').sort((a,b)=>a.y-b.y||Math.abs(a.x-W/2)-Math.abs(b.x-W/2));
    trailPowers[index].forEach((power,i)=>{const peg=entrances[i===0?0:i===1?2:5];peg.type='POWER';peg.power=power;});
    level.story+=' Collect '+trailPowers[index].map(id=>BALL_POWERS[id].name).join(' and ')+' charges, then aim their combined powers on your next shot.';
  });

  class Board {
    constructor(level, options) {
      this.level = clone(level);
      this.options = Object.assign({ unlimited: false, bonusShots: 0, wideCatch: false, blast: false, magnet: false }, options || {});
      this.pegs = level.pegs.map((peg, index) => Object.assign({}, peg, { id: index, hit: false }));
      this.balls = []; this.events = [];
      this.score = 0; this.hits = 0; this.gems = 0;
      this.shots = level.shots + clamp(Math.round(Number(this.options.bonusShots) || 0), 0, 30);
      this.targetTotal = this.pegs.filter(peg => peg.type === 'TARGET').length;
      this.targets = this.targetTotal;
      const catcher = catcherConfig(this.level,this.options);
      this.catcher = { x: catcher.startX, y: 506, w: catcher.width, phase:catcherPhase(catcher.startX,catcher.width) };
      this.status = 'aim'; this.angle = 0; this.elapsed = 0;
      this.configureCatcher();
      this.shotTime = 0; this.shotCombo = 0; this.shotHits = 0;
      this.blastUsed = false; this.nextBallId = 1;
      this.pendingPowers=[];this.activePowers=[];this.ballBlastUsed=false;
      this.shotPowerHits=0;this.shotScore=0;this.scoreShots=0;this.styleAwards=[];this.lastDirectHit=null;this.wallBounces=0;
    }
    configureCatcher() {
      const config=catcherConfig(this.level,this.options);
      if(this.catcher.w!==config.width) {
        const direction=Math.cos(this.elapsed*.65+this.catcher.phase);
        this.catcher.phase=catcherPhase(clamp(this.catcher.x,0,W-config.width),config.width,this.elapsed,direction);
      }
      this.catcher.w=config.width;this.catcher.x=clamp(this.catcher.x,0,W-config.width);
      this.catcher.behavior=config.behavior;
      this.catcher.mode=config.behavior==='alternate'?(Math.floor(this.elapsed/config.interval)%2?'bounce':'catch'):config.behavior;
      this.catcher.switchIn=config.behavior==='alternate'?config.interval-(this.elapsed%config.interval):0;
      return this.catcher;
    }
    fire(angle) {
      if (this.status !== 'aim' || (!this.options.unlimited && this.shots <= 0)) return false;
      this.angle = clamp(Number.isFinite(angle) ? angle : this.angle, -1.4, 1.4);
      if (!this.options.unlimited) this.shots--;
      this.shotTime = 0; this.shotCombo = 0; this.shotHits = 0; this.blastUsed = false;
      this.shotPowerHits=0;this.shotScore=0;this.scoreShots=0;this.styleAwards=[];this.lastDirectHit=null;this.wallBounces=0;this.ballBlastUsed=false;
      this.activePowers=[...new Set(this.pendingPowers)];
      for(const power of this.activePowers)this.pendingPowers.splice(this.pendingPowers.indexOf(power),1);
      this.status = 'flight';
      this._spawn(410, 52, Math.sin(this.angle) * 650, Math.cos(this.angle) * 650);
      if(this.activePowers.includes('multiball'))for(const spread of [-.22,.22]) {
        const direction=clamp(this.angle+spread,-1.4,1.4);
        this._spawn(410,52,Math.sin(direction)*650,Math.cos(direction)*650);
      }
      for(const power of this.activePowers)this.events.push({type:'power',ballPower:power,activated:true,text:BALL_POWERS[power].name+' active.'});
      return true;
    }
    _spawn(x, y, vx, vy) {
      if (this.balls.length >= 12) return;
      this.balls.push({ id: this.nextBallId++, x, y, vx, vy, radius: 7, alive: true, echoLeft:this.activePowers.includes('echo')?1:0 });
    }
    objectiveProgress() {
      const objective = this.level.objective;
      if (objective === 'score') return { current: this.score, total: this.level.goal, label: 'Score' };
      if (objective === 'gems') return { current: this.gems, total: this.level.goal, label: 'Gems' };
      if (objective === 'clear') return { current: this.hits, total: this.level.goal, label: 'Pegs' };
      return { current: this.targetTotal - this.targets, total: this.targetTotal, label: 'Targets' };
    }
    _collect(peg, ball, allowPower) {
      if (this.status === 'won' || peg.hit || peg.type === 'BLOCK') return;
      peg.hit = true;peg.breakAge=0; this.hits++; this.shotHits++; this.shotCombo++;
      const points = Math.round(VALUES[peg.type] * (1 + Math.min(2, (this.shotCombo - 1) * .08)));
      this._awardPoints(points);
      if (peg.type === 'GEM') this.gems++;
      if (peg.type === 'TARGET') this.targets--;
      this.events.push({ type: 'hit', x: peg.x, y: peg.y, radius:peg.radius,shape:peg.shape,points,pegType:peg.type });
      if(peg.type==='POWER') {
        this.pendingPowers.push(peg.power);
        this.events.push({type:'power',powerId:'POWER',ballPower:peg.power,charged:true,x:peg.x,y:peg.y,text:BALL_POWERS[peg.power].name+' charged for the next shot.'});
        if(++this.shotPowerHits>=2)this._style('doublePower','Power combo',200);
      }
      if (peg.type === 'EXTRA') {
        this.shots++;
        this.events.push({ type: 'power', powerId: 'EXTRA', x: peg.x, y: peg.y, text: POWER_NAMES.EXTRA });
      }
      if (peg.type === 'MULTIBALL') {
        const speed = Math.max(330, Math.hypot(ball.vx, ball.vy));
        const direction = Math.atan2(ball.vx, Math.max(140, Math.abs(ball.vy)));
        this._spawn(ball.x, ball.y, Math.sin(direction - .42) * speed, Math.cos(direction - .42) * speed);
        this._spawn(ball.x, ball.y, Math.sin(direction + .42) * speed, Math.cos(direction + .42) * speed);
        this.events.push({ type: 'power', powerId: 'MULTIBALL', x: peg.x, y: peg.y, text: POWER_NAMES.MULTIBALL });
      }
      const ballBlast=allowPower&&this.activePowers.includes('blast')&&!this.ballBlastUsed;
      if(ballBlast)this.ballBlastUsed=true;
      if (allowPower && (peg.type === 'EXPLODE' || ballBlast || (this.options.blast && !this.blastUsed))) {
        this.blastUsed = true;
        const powerId=peg.type==='EXPLODE'?'EXPLODE':'blast',radius=ballBlast?110:94;
        this.events.push({ type: 'power', powerId, ...(ballBlast?{ballPower:'blast'}:{}), x: peg.x, y: peg.y, text: ballBlast?BALL_POWERS.blast.name:POWER_NAMES[powerId], radius });
        this.pegs.forEach(other => {
          if (!other.hit && other.type !== 'BLOCK' && Math.hypot(other.x - peg.x, other.y - peg.y) <= radius) this._collect(other, ball, false);
        });
      }
      if(allowPower&&this.activePowers.includes('fireball')) {
        for(const other of this.pegs)if(!other.hit&&other.type!=='BLOCK'&&Math.hypot(other.x-peg.x,other.y-peg.y)<=44)this._collect(other,ball,false);
      }
      if(allowPower) {
        if(this.lastDirectHit&&Math.hypot(peg.x-this.lastDirectHit.x,peg.y-this.lastDirectHit.y)>=270)this._style('longShot','Long shot',350);
        this.lastDirectHit={x:peg.x,y:peg.y};
        if(this.wallBounces&&this.shotHits>=3)this._style('bankShot','Bank shot',250);
      }
      if(this.shotHits>=10)this._style('pegStreak','Peg streak',300);
      // Finish on the winning hit, including a gem, score, or burst collection.
      // Live balls remain frozen for presentation; no settlement is required.
      this._checkWin();
    }
    _awardPoints(points) {
      this.score+=points;this.shotScore+=points;
      while(this.scoreShots<SCORE_SHOTS.length&&this.shotScore>=SCORE_SHOTS[this.scoreShots]) {
        this.scoreShots++;
        if(!this.options.unlimited)this.shots++;
        this.events.push({type:'power',scoreReturn:true,text:'Score bonus. Extra shot!',points:this.shotScore});
      }
    }
    _style(id,text,points) {
      if(this.status==='won'||this.styleAwards.includes(id))return;
      this.styleAwards.push(id);this._awardPoints(points);
      this.events.push({type:'style',styleId:id,text,points});
    }
    _checkWin() {
      if(this.status==='won'||this.status==='lost')return this.status==='won';
      const progress=this.objectiveProgress();
      if(progress.current<progress.total)return false;
      this.status='won';
      this.events.push({type:'win',text:'Stage complete.'});
      return true;
    }
    _collision(ball, peg) {
      const radius=peg.radius*(1-pegBreakProgress(this.level,peg));
      if(radius<=0)return;
      let nx, ny, penetration;
      if (peg.type === 'BLOCK' || peg.type === 'TARGET' || peg.shape === 'SQUARE') {
        const nearX = clamp(ball.x, peg.x - radius, peg.x + radius);
        const nearY = clamp(ball.y, peg.y - radius, peg.y + radius);
        const dx = ball.x - nearX, dy = ball.y - nearY, distance = Math.hypot(dx, dy);
        if (distance >= ball.radius) return;
        if (distance > .0001) { nx = dx / distance; ny = dy / distance; penetration = ball.radius - distance; }
        else {
          const edges = [
            { distance: ball.x - (peg.x - radius), nx: -1, ny: 0 },
            { distance: peg.x + radius - ball.x, nx: 1, ny: 0 },
            { distance: ball.y - (peg.y - radius), nx: 0, ny: -1 },
            { distance: peg.y + radius - ball.y, nx: 0, ny: 1 }
          ].sort((a, b) => a.distance - b.distance);
          nx = edges[0].nx; ny = edges[0].ny; penetration = edges[0].distance + ball.radius;
        }
      } else {
        const dx = ball.x - peg.x, dy = ball.y - peg.y, distance = Math.hypot(dx, dy);
        if (distance >= radius + ball.radius) return;
        if (distance > .0001) { nx = dx / distance; ny = dy / distance; }
        else { nx = 0; ny = -1; }
        penetration = radius + ball.radius - distance;
      }
      if(peg.type!=='BLOCK'&&(this.activePowers.includes('ghost')||this.activePowers.includes('fireball'))) {
        this._collect(peg,ball,true);return;
      }
      this._notePegContact(ball,peg);
      ball.x += nx * (penetration + .15); ball.y += ny * (penetration + .15);
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx -= 1.89 * dot * nx; ball.vy -= 1.89 * dot * ny;
        // A perfectly centered shot must slide off a peg rather than pogo forever.
        if (Math.abs(nx) < .06 && peg.shape !== 'SQUARE') ball.vx += (peg.id % 2 ? 1 : -1) * 30;
        if (Math.hypot(ball.vx, ball.vy) < 150) { ball.vx += nx * 70; ball.vy += ny * 70; }
      }
      this._collect(peg, ball, true);
    }
    _notePegContact(ball,peg) {
      const stall=ball.stall||= {x:ball.x,y:ball.y,time:0,quiet:0,contacts:0,pegIds:[]};
      stall.quiet=0;stall.contacts=Math.min(1024,stall.contacts+1);
      if(!stall.pegIds.includes(peg.id)&&stall.pegIds.length<12)stall.pegIds.push(peg.id);
    }
    _trackStall(ball,step) {
      const stall=ball.stall;if(!stall)return;
      // A recovery needs sustained confinement AND repeated recent peg contact.
      // Free flight, an apex, and bounces that travel across the board reset it.
      if(Math.hypot(ball.x-stall.x,ball.y-stall.y)>32){delete ball.stall;return;}
      stall.time=Math.min(1.75,stall.time+step);stall.quiet+=step;
      if(stall.quiet>.45){delete ball.stall;return;}
      if(stall.time>=1.75&&stall.contacts>=8&&stall.quiet<.12)this._freeStuckBall(ball);
    }
    _freeStuckBall(ball) {
      const contacts=new Set(ball.stall.pegIds),direction=ball.id%2?1:-1;
      const eject=this.pegs.filter(peg=>peg.hit&&peg.type!=='BLOCK'&&contacts.has(peg.id)&&Math.hypot(peg.x-ball.x,peg.y-ball.y)<=peg.radius+ball.radius+40);
      if(eject.length) {
        const ids=new Set(eject.map(peg=>peg.id));
        this.pegs=this.pegs.filter(peg=>!ids.has(peg.id));
        for(const peg of eject)this.events.push({type:'pegEject',peg:{id:peg.id,x:peg.x,y:peg.y,radius:peg.radius*(1-pegBreakProgress(this.level,peg)),type:peg.type,shape:peg.shape,hit:true},x:peg.x,y:peg.y,direction:(peg.id+ball.id)%2?1:-1});
      }
      // Keep stone geometry intact. A nudge can release a resting ball; a fully
      // enclosed stone cage still uses the existing sixteen-second safe return.
      ball.vx=direction*150;ball.vy=-260;
      delete ball.stall;
      this.events.push({type:'recovery',x:ball.x,y:ball.y,text:eject.length?'Ball freed.':'Ball nudged.'});
    }
    update(dt) {
      if (this.status === 'won' || this.status === 'lost') return;
      dt = clamp(Number(dt) || 0, 0, .1);
      this.elapsed += dt;
      // Aging happens outside collision iteration. Instant pegs become inert on
      // their hit; this pass removes spent pegs without skipping adjacent hits.
      for(const peg of this.pegs)if(peg.hit&&peg.type!=='BLOCK')peg.breakAge=Math.min(pegBreakConfig(this.level,peg).duration,(peg.breakAge||0)+dt);
      this.pegs=this.pegs.filter(peg=>pegBreakProgress(this.level,peg)<1);
      const previousMode=this.catcher.mode;this.configureCatcher();
      if(this.catcher.mode!==previousMode)this.events.push({type:'plateMode',mode:this.catcher.mode,text:this.catcher.mode==='bounce'?'Base plate: bounce.':'Base plate: catch.'});
      const travel = (W - this.catcher.w) / 2;
      this.catcher.x = clamp(travel + Math.sin(this.elapsed * .65 + this.catcher.phase) * travel,0,W-this.catcher.w);
      if (this.status !== 'flight' || dt <= 0) return;
      this.shotTime += dt;
      const substeps = Math.max(1, Math.ceil(dt / (1 / 240))), step = dt / substeps;
      for (let substep = 0; substep < substeps; substep++) {
        // Newly spawned multiballs begin moving next substep, never recursively.
        const count = this.balls.length;
        for (let index = 0; index < count; index++) {
          const ball = this.balls[index];
          if (!ball.alive) continue;
          const oldY = ball.y;
          if ((this.options.magnet || this.activePowers.includes('magnet')) && ball.y > 370 && ball.vy > 0) {
            ball.vx += clamp((this.catcher.x + this.catcher.w / 2 - ball.x) * 2.3, -450, 450) * step;
          }
          ball.vy += 475 * step;
          ball.x += ball.vx * step; ball.y += ball.vy * step;
          if (ball.x < ball.radius) { this.wallBounces++; ball.x = ball.radius; ball.vx = Math.abs(ball.vx) * .92; }
          if (ball.x > W - ball.radius) { this.wallBounces++; ball.x = W - ball.radius; ball.vx = -Math.abs(ball.vx) * .92; }
          if (ball.y < 25 + ball.radius) { ball.y = 25 + ball.radius; ball.vy = Math.abs(ball.vy) * .9; }
          for (const peg of this.pegs) {
            this._collision(ball, peg);
            if(this.status==='won')return;
          }
          if (ball.vy > 0 && oldY + ball.radius < this.catcher.y && ball.y + ball.radius >= this.catcher.y && ball.x >= this.catcher.x - ball.radius && ball.x <= this.catcher.x + this.catcher.w + ball.radius) {
            if(this.catcher.mode==='bounce') {
              ball.y=this.catcher.y-ball.radius-.2;
              ball.vy=-Math.max(430,Math.abs(ball.vy)*.9);
              ball.vx=clamp(ball.vx+(ball.x-(this.catcher.x+this.catcher.w/2))/(this.catcher.w/2)*130,-1200,1200);
              this.events.push({type:'bounce',x:ball.x,y:this.catcher.y,text:'Bounce! Ball back in play.'});
            } else {
              ball.alive = false; this.shots++; if(this.shotHits>0)this._awardPoints(150);
              if(this.shotHits===1)this._style('skillCatch','Perfect catch',300);
              this.events.push({ type: 'catch', x: ball.x, y: this.catcher.y, text: 'Great catch. Ball returned.' });
              if(this._checkWin()){this.balls=this.balls.filter(active=>active.alive);return;}
            }
          } else if (ball.y > H + ball.radius) {
            if(ball.echoLeft>0) {
              ball.echoLeft--;ball.y=40;ball.x=clamp(ball.x,ball.radius,W-ball.radius);
              ball.vy=Math.max(430,Math.abs(ball.vy)*.8);delete ball.stall;
              this.events.push({type:'power',ballPower:'echo',x:ball.x,y:ball.y,text:'Echo ball. One more pass!'});
            } else ball.alive=false;
          }
          if(ball.alive)this._trackStall(ball,step);
        }
      }
      this.balls = this.balls.filter(ball => ball.alive);
      if (this.shotTime >= 16 && this.balls.length) {
        this.balls = []; this.shots++;
        this.events.push({ type: 'power', text: 'Ball returned. Try another angle.' });
      }
      if (!this.balls.length) this._finishShot();
    }
    _finishShot() {
      if(this.status==='won')return;
      const progress = this.objectiveProgress();
      this.events.push({ type: 'shotEnd', text: this.shotHits ? this.shotHits + ' pegs collected.' : 'Try another angle.', hits: this.shotHits, points:this.shotScore });
      this.activePowers=[];
      // A charge earned on the last ball must still get its promised next shot.
      if(!this.options.unlimited&&this.shots<=0&&this.pendingPowers.length) {
        this.shots=1;this.events.push({type:'power',rescue:true,text:'Power rescue. One charged shot returned!'});
      }
      if (progress.current >= progress.total) {
        this.status = 'won'; this.events.push({ type: 'win', text: 'Stage complete.' });
      } else if (!this.options.unlimited && this.shots <= 0) {
        this.pegs=this.pegs.filter(peg=>!peg.hit||peg.type==='BLOCK');
        this.status = 'lost'; this.events.push({ type: 'lose', text: 'Out of balls. You can try again.' });
      } else this.status = 'aim';
    }
    serialize() {
      return clone({ version: 1, level: this.level, options: this.options, pegs: this.pegs, balls: this.balls, score: this.score, shots: this.shots, hits: this.hits, gems: this.gems, targets: this.targets, targetTotal: this.targetTotal, catcher: this.catcher, status: this.status, angle: this.angle, elapsed: this.elapsed, shotTime: this.shotTime, shotCombo: this.shotCombo, shotHits: this.shotHits, blastUsed: this.blastUsed, nextBallId: this.nextBallId, shotPowerHits:this.shotPowerHits, pendingPowers:this.pendingPowers, activePowers:this.activePowers, ballBlastUsed:this.ballBlastUsed, shotScore:this.shotScore, scoreShots:this.scoreShots, styleAwards:this.styleAwards, lastDirectHit:this.lastDirectHit, wallBounces:this.wallBounces });
    }
    restore(saved) {
      if (!saved || saved.version !== 1 || !Array.isArray(saved.pegs) || !Array.isArray(saved.balls) || saved.balls.length > 12 || !['aim', 'flight', 'won', 'lost'].includes(saved.status)) throw new Error('This saved board is invalid.');
      const baseLevel = validatePack({ meta: { format: 'bennys-peggle-levels-v2' }, levels: [Object.assign({}, saved.level, { chapter: 0 })] }).levels[0];
      const validIds = new Map(baseLevel.pegs.map(peg => [peg.id, peg]));
      const restoredPegs = saved.pegs.map(peg => {
        if (!peg || !validIds.has(peg.id)) throw new Error('This saved board contains an invalid peg.');
        const restored=Object.assign({},validIds.get(peg.id),{hit:!!peg.hit});
        if(restored.hit&&restored.type!=='BLOCK') {
          if(peg.breakAge!==undefined&&(!Number.isFinite(peg.breakAge)||peg.breakAge<0||peg.breakAge>3))throw new Error('This saved board has invalid peg crumble age.');
          restored.breakAge=peg.breakAge??0;
        }
        return restored;
      });
      if (new Set(restoredPegs.map(peg => peg.id)).size !== restoredPegs.length) throw new Error('This saved board contains repeated pegs.');
      const restoredBalls = saved.balls.map(ball => {
        if (!ball || !['x', 'y', 'vx', 'vy', 'radius'].every(key => Number.isFinite(ball[key])) || ball.radius !== 7 || Math.abs(ball.vx) > 5000 || Math.abs(ball.vy) > 5000 || ball.x < -100 || ball.x > W + 100 || ball.y < -100 || ball.y > H + 100) throw new Error('This saved board contains an invalid ball.');
        if(ball.echoLeft!==undefined&&(!Number.isInteger(ball.echoLeft)||ball.echoLeft<0||ball.echoLeft>1))throw new Error('This saved board has invalid echo charges.');
        const restored=Object.assign({},ball,{alive:true});
        if(ball.stall!==undefined) {
          const stall=ball.stall;
          if(!stall||typeof stall!=='object'||Array.isArray(stall)||!['x','y','time','quiet','contacts'].every(key=>Number.isFinite(stall[key]))||stall.x< -100||stall.x>W+100||stall.y< -100||stall.y>H+100||stall.time<0||stall.time>1.75||stall.quiet<0||stall.quiet>.45||!Number.isInteger(stall.contacts)||stall.contacts<0||stall.contacts>1024||!Array.isArray(stall.pegIds)||stall.pegIds.length>12||new Set(stall.pegIds).size!==stall.pegIds.length||!stall.pegIds.every(id=>Number.isInteger(id)&&validIds.has(id)))throw new Error('This saved board has invalid stuck-ball recovery data.');
          restored.stall={x:stall.x,y:stall.y,time:stall.time,quiet:stall.quiet,contacts:stall.contacts,pegIds:[...stall.pegIds]};
        }
        return restored;
      });
      const fields = ['score', 'shots', 'hits', 'gems', 'targets', 'targetTotal', 'angle', 'elapsed', 'shotTime', 'shotCombo', 'shotHits', 'nextBallId'];
      fields.forEach(key => { if (!Number.isFinite(saved[key]) || (key !== 'angle' && saved[key] < 0)) throw new Error('This saved board has an invalid ' + key + '.'); });
      const pendingPowers=saved.pendingPowers??[],activePowers=saved.activePowers??[];
      for(const powers of [pendingPowers,activePowers])if(!Array.isArray(powers)||powers.length>200||!powers.every(id=>Object.hasOwn(BALL_POWERS,id)))throw new Error('This saved board has invalid ball powers.');
      if(new Set(activePowers).size!==activePowers.length)throw new Error('This saved board has repeated active powers.');
      const shotScore=saved.shotScore??0,scoreShots=saved.scoreShots??0,wallBounces=saved.wallBounces??0,styleAwards=saved.styleAwards??[],lastDirectHit=saved.lastDirectHit??null;
      if(!Number.isFinite(shotScore)||shotScore<0||shotScore>saved.score||!Number.isInteger(scoreShots)||scoreShots<0||scoreShots>3||!Number.isInteger(wallBounces)||wallBounces<0||!Array.isArray(styleAwards)||styleAwards.length>5||new Set(styleAwards).size!==styleAwards.length||!styleAwards.every(id=>['doublePower','longShot','bankShot','pegStreak','skillCatch'].includes(id)))throw new Error('This saved board has invalid shot scoring data.');
      if(lastDirectHit&&(!Number.isFinite(lastDirectHit.x)||!Number.isFinite(lastDirectHit.y)||lastDirectHit.x<0||lastDirectHit.x>W||lastDirectHit.y<0||lastDirectHit.y>H))throw new Error('This saved board has invalid last-hit data.');
      if(saved.shotPowerHits!==undefined&&(!Number.isInteger(saved.shotPowerHits)||saved.shotPowerHits<0||saved.shotPowerHits>200))throw new Error('This saved board has invalid collected-power data.');
      this.shotPowerHits=saved.shotPowerHits??0;this.pendingPowers=[...pendingPowers];this.activePowers=[...activePowers];this.ballBlastUsed=!!saved.ballBlastUsed;
      this.shotScore=shotScore;this.scoreShots=scoreShots;this.styleAwards=[...styleAwards];this.wallBounces=wallBounces;this.lastDirectHit=lastDirectHit?{x:lastDirectHit.x,y:lastDirectHit.y}:null;
      this.level = Object.assign({}, baseLevel, { id: saved.level.id, chapter: saved.level.chapter || 0 });
      this.options = Object.assign({ unlimited: false, bonusShots: 0, wideCatch: false, blast: false, magnet: false }, saved.options || {});
      this.pegs = restoredPegs; this.balls = restoredBalls; this.events = [];
      fields.forEach(key => { this[key] = saved[key]; });
      this.status = saved.status; this.blastUsed = !!saved.blastUsed;
      const config = catcherConfig(this.level,this.options),catcherWidth=config.width;
      const savedCatcherX = saved.catcher && Number(saved.catcher.x);
      let phase=catcherPhase(config.startX,catcherWidth);
      const hasSavedX=Number.isFinite(savedCatcherX);
      const x=hasSavedX?clamp(savedCatcherX,0,W-catcherWidth):(W-catcherWidth)/2*(1+Math.sin(this.elapsed*.65+phase));
      if(hasSavedX) {
        const savedPhase=Number.isFinite(saved.catcher.phase)?saved.catcher.phase:0;
        phase=saved.catcher.w===catcherWidth&&Number.isFinite(saved.catcher.phase)?savedPhase:catcherPhase(x,catcherWidth,this.elapsed,Math.cos(this.elapsed*.65+savedPhase));
      }
      this.catcher = { x, y: 506, w: catcherWidth, phase };
      this.configureCatcher();
      if (this.status === 'flight' && !this.balls.length) this._finishShot();
      return this;
    }
  }
  return { W, H, CATCHER_WIDTH, WIDE_CATCHER_WIDTH, TYPES, VALUES, POWER_NAMES, BALL_POWERS, SCORE_SHOTS, powerName, ballPowerName, BACKGROUNDS, backgroundInfo, catcherConfig, isObjectivePeg, pegBreakConfig, pegBreakProgress, validatePack, builtInPack, legacyTrailPack, Board, createBoard: (level, options) => new Board(level, options) };
});
