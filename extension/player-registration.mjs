import {SERVICES} from './policy.mjs';
export async function updatePlayerScripts(){
  const granted=await chrome.permissions.getAll();
  const hosts=Object.values(SERVICES).flatMap(s=>s.hosts.map(h=>'https://'+h+'/*'));
  const matches=(granted.origins||[]).filter(x=>hosts.includes(x)||x==='http://localhost/*'||x==='http://127.0.0.1/*');
  await chrome.scripting.unregisterContentScripts({ids:['benny-player']}).catch(()=>{});
  if(matches.length)await chrome.scripting.registerContentScripts([{id:'benny-player',matches,js:['player-platform.js','shared/voice-manager.js','shared/scan-status-badge.js','shared/scan-status-badge-style.js','shared/choice-scan.js','player-view.js','player-adapters.js','player-content.js'],runAt:'document_start',allFrames:false,persistAcrossSessions:true}]);
}
