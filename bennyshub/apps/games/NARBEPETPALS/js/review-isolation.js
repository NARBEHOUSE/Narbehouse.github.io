'use strict';
// Must precede shared managers and game storage. No effect in ordinary play.
// A file:// preview needs same-origin script loading in Chromium, so the review
// also supplies a private in-memory Storage object instead of relying on sandboxing alone.
(() => {
  if(parent===window||new URLSearchParams(location.search).get('review')!=='1')return;
  const memory=()=>{const data=new Map();return {
    get length(){return data.size;},key:i=>[...data.keys()][i]??null,
    getItem:key=>data.get(String(key))??null,setItem:(key,value)=>data.set(String(key),String(value)),
    removeItem:key=>data.delete(String(key)),clear:()=>data.clear()
  };};
  Object.defineProperty(window,'localStorage',{value:memory(),configurable:false});
  Object.defineProperty(window,'sessionStorage',{value:memory(),configurable:false});
  // The shared bridge sees an existing empty API, and cannot forward native
  // settings writes to the Hub, even if the reviewer is opened inside Electron.
  Object.defineProperty(window,'electronAPI',{value:Object.freeze({}),configurable:false});
  window.localStorage.setItem('narbe-voice-settings',JSON.stringify({ttsEnabled:false}));
  window.localStorage.setItem('narbepetpals:settings:v1',JSON.stringify({sound:false,music:0}));
  Object.defineProperty(window,'petPalsReviewIsolated',{value:true});
})();
