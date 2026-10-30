'use strict';
/* ================= Helpers ================= */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const reduceMotion=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const later=(fn,ms)=>setTimeout(fn,ms);
const weightedPick=list=>{ const tot=list.reduce((s,[,w])=>s+w,0); let r=Math.random()*tot; for(const [id,w] of list){ r-=w; if(r<=0) return id; } return list[list.length-1][0]; };

/* ================= Storage ================= */
// Match the release query on game scripts/styles in index.html when publishing an update.
const GAME_BUILD='2026.10.30.1';
/* Pocket Pets saves (pocketpup:*) are read once and carried over, so nobody loses their pet. */
const SAVE_KEY='narbepetpals:v2', OLD_SAVE_KEY='pocketpup:v1', GAME_SET_KEY='narbepetpals:settings:v1', OLD_SET_KEY='pocketpup:settings:v2',
  SCAN_FALLBACK_KEY='narbepetpals:scan-fallback', TTS_FALLBACK_KEY='narbepetpals:tts-fallback';
function readJSON(k){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(e){ return null; } }
function writeJSON(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
function removeKey(k){ try{ localStorage.removeItem(k); }catch(e){} }

/* Growth always follows the normal path (30 / 70 / 130 paw prints) and needs change at one gentle pace.
   hlStyle and hlColor set how the highlight looks, for players who need it bolder or in another color.
   waitRead: automatic scanning and selections wait for narration; manual scanning stays available.
   music: background music level, 0 off, 1 soft, 2 medium.
   events: how often surprises, chores and idle moments happen, 'medium' or 'slow'. */
const gs={sound:true,music:1,events:'medium',pace:'normal',grow:'medium',hlStyle:'glow',hlColor:0,waitRead:true};
(function(){ const s=readJSON(GAME_SET_KEY)||readJSON(OLD_SET_KEY)||{};
  if(typeof s.sound==='boolean') gs.sound=s.sound;
  if(s.hlStyle==='glow'||s.hlStyle==='outline') gs.hlStyle=s.hlStyle; if(Number.isInteger(s.hlColor)&&s.hlColor>=0&&s.hlColor<9) gs.hlColor=s.hlColor; if(typeof s.waitRead==='boolean') gs.waitRead=s.waitRead; if(s.music===0||s.music===1||s.music===2) gs.music=s.music; if(s.events==='slow'||s.events==='medium') gs.events=s.events; if(s.grow==='slow'||s.grow==='medium'||s.grow==='quick') gs.grow=s.grow; })();
const saveGS=()=>writeJSON(GAME_SET_KEY,{sound:gs.sound,music:gs.music,events:gs.events,grow:gs.grow,hlStyle:gs.hlStyle,hlColor:gs.hlColor,waitRead:gs.waitRead});

/* ================= Shared-module adapters ================= */
const SPEEDS=[1000,2000,3000,4000,5000];
const scanLocal=Object.assign({autoScan:false,speedIndex:1},readJSON(SCAN_FALLBACK_KEY)||{});
const SM=()=>window.NarbeScanManager||null;
const scan={
  settings(){ const m=SM(); if(m){ try{ const s=m.getSettings()||{}; const iv=m.getScanInterval?m.getScanInterval():(s.scanInterval||2000); return {autoScan:!!s.autoScan,interval:iv}; }catch(e){} }
    return {autoScan:!!scanLocal.autoScan,interval:SPEEDS[clamp(scanLocal.speedIndex|0,0,SPEEDS.length-1)]}; },
  toggleAuto(){ const m=SM(); if(m){ try{ m.toggleAutoScan(); return; }catch(e){} } scanLocal.autoScan=!scanLocal.autoScan; writeJSON(SCAN_FALLBACK_KEY,scanLocal); },
  cycleSpeed(){ const m=SM(); if(m){ try{ m.cycleScanSpeed(); return; }catch(e){} } scanLocal.speedIndex=(clamp(scanLocal.speedIndex|0,0,SPEEDS.length-1)+1)%SPEEDS.length; writeJSON(SCAN_FALLBACK_KEY,scanLocal); }
};
const ttsLocal=Object.assign({enabled:true,voiceName:''},readJSON(TTS_FALLBACK_KEY)||{});
const VM=()=>window.NarbeVoiceManager||null;
function voiceList(){ try{ const vs=speechSynthesis.getVoices()||[]; const en=vs.filter(v=>/^en/i.test(v.lang)); return en.length?en:vs; }catch(e){ return []; } }
function localVoice(){ const vs=voiceList(); return vs.find(v=>v.name===ttsLocal.voiceName)||vs.find(v=>v.default)||vs[0]||null; }
/* Narration is anything read aloud except the name of the highlighted choice. While it plays,
   automatic scanning waits so the player hears all of it. The browser has no reliable "finished" event across
   the hub's voice manager, so this watches speechSynthesis.speaking, with a time cap in case speech
   never starts or never reports that it ended. */
const narr={on:false,t0:0,seen:false,max:0};
/* Auto Scan and selections wait for narration. A deliberate manual scan can interrupt it,
   including a speech engine that remains stuck in its speaking/pending state. */
const readingHold=()=>gs.waitRead&&narrating();
function interruptReading(){
  narr.on=false;
  try{ const m=VM(); if(m&&m.cancel) m.cancel(); else speechSynthesis.cancel(); }catch(e){}
  window.petChoice?.updateClock();
}
function markNarr(text){ if(!voice.enabled()){ narr.on=false; return; }
  const t0=performance.now(); Object.assign(narr,{on:true,t0,seen:false,max:t0+Math.min(30000,1500+String(text).length*95)}); }
function narrating(){ if(!narr.on) return false;
  const now=performance.now(); let sp=false; try{ sp=speechSynthesis.speaking||speechSynthesis.pending; }catch(e){}
  if(sp) narr.seen=true;
  if(!voice.enabled()||now>narr.max||(!sp&&(narr.seen||now-narr.t0>1200))) narr.on=false;
  return narr.on; }
const voice={
  enabled(){ const m=VM(); if(m){ try{ return !!m.getSettings().ttsEnabled; }catch(e){} } return !!ttsLocal.enabled; },
  speak(text,opt){ if(!text) return;
    if(opt&&opt.label) narr.on=false;
    else markNarr(text);
    window.petChoice?.updateClock();
    const m=VM(); if(m){ try{ m.speak(text); }catch(e){} return; }
    if(!ttsLocal.enabled||!('speechSynthesis' in window)) return;
    try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); const v=localVoice(); if(v) u.voice=v; u.rate=.95; speechSynthesis.speak(u); }catch(e){} },
  toggle(){ const m=VM(); if(m){ try{ m.toggleTTS(); return; }catch(e){} } ttsLocal.enabled=!ttsLocal.enabled; if(!ttsLocal.enabled){ try{ speechSynthesis.cancel(); }catch(e){} } writeJSON(TTS_FALLBACK_KEY,ttsLocal); },
  cycle(){ const m=VM(); if(m){ try{ m.cycleVoice(); return; }catch(e){} } const vs=voiceList(); if(!vs.length) return; const i=vs.indexOf(localVoice()); ttsLocal.voiceName=vs[(i+1)%vs.length].name; writeJSON(TTS_FALLBACK_KEY,ttsLocal); },
  name(){ const m=VM(); if(m){ try{ return m.getVoiceDisplayName(m.getCurrentVoice())||'Default'; }catch(e){} }
    const v=localVoice(); return v?v.name.replace(/^(Microsoft|Google)\s+/,'').split(/\s[-(]/)[0].trim():'Default'; }
};
