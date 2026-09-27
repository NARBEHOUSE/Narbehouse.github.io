export const PROTOCOL = 1;
export const DEVELOPMENT = true;
export const HUB_ORIGINS = ['http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:3000', 'http://127.0.0.1:3000', 'https://narbehouse.github.io', 'https://bennyshub.com', 'https://www.bennyshub.com', 'https://narbehouse.com', 'https://www.narbehouse.com'];
export function isHub(url) {
  try { const u = new URL(url); return HUB_ORIGINS.includes(u.origin) && u.pathname.startsWith('/bennyshub/'); } catch { return false; }
}
export const SERVICES = {
  youtube: {label:'YouTube', hosts:['www.youtube.com','youtube.com','m.youtube.com']},
  netflix: {label:'Netflix', hosts:['www.netflix.com','netflix.com']},
  disney: {label:'Disney+', hosts:['www.disneyplus.com','disneyplus.com']},
  hulu: {label:'Hulu', hosts:['www.hulu.com','hulu.com']},
  prime: {label:'Prime Video', hosts:['www.primevideo.com','primevideo.com','www.amazon.com']},
  max: {label:'HBO Max', hosts:['play.hbomax.com','www.hbomax.com','play.max.com','www.max.com']},
  paramount: {label:'Paramount+', hosts:['www.paramountplus.com']},
  plex: {label:'Plex', hosts:['app.plex.tv','watch.plex.tv']},
  pluto: {label:'Pluto TV', hosts:['pluto.tv','www.pluto.tv']},
  tubi: {label:'Tubi (preview)', hosts:['tubitv.com','www.tubitv.com']}
};
export const NEWS_ORIGINS = ['https://feeds.npr.org/*','https://feeds.bbci.co.uk/*','https://news.google.com/*'];
export function streamURL(value) {
  if(typeof value !== 'string' || value.length > 4096) throw Error('Enter a supported streaming link.');
  let u; try { u=new URL(value); } catch { throw Error('Enter a complete streaming URL.'); }
  if (u.username || u.password || u.port) throw Error('This streaming URL is not allowed.');
  if(u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)) {
    // Only the development fixture, never arbitrary local network services.
    throw Error('Local streaming links require the test fixture URL.');
  }
  if(u.protocol!=='https:' || !Object.values(SERVICES).some(s=>s.hosts.includes(u.hostname))) throw Error('This service is not supported yet. Use a supported provider HTTPS link.');
  return u;
}
export function playerURL(value) {
  try {const u=new URL(value);if(DEVELOPMENT&&['http://localhost:4173','http://127.0.0.1:4173'].includes(u.origin)&&u.pathname==='/bennyshub/test-player.html'&&!u.search&&!u.hash)return u;}catch{}
  return streamURL(value);
}
export function calendarURL(value) {
  let u;try{u=new URL(value);}catch{throw Error('Enter a Google Calendar iCal URL.');}
  if(u.origin!=='https://calendar.google.com'||u.username||u.password||!u.pathname.startsWith('/calendar/ical/')||!u.pathname.endsWith('.ics')) throw Error('Use the Google Calendar iCal (.ics) address.');
  return u.href;
}
export function scanPrefs(p={}) {
  return {autoScan:p.autoScan===true,scanInterval:Math.max(1000,Math.min(10000,Number(p.scanInterval)||2000)),inputSensitivity:Math.max(0,Math.min(500,Number(p.inputSensitivity)||50)),voice:typeof p.voice==='string'?p.voice.slice(0,200):'',rate:Math.max(.5,Math.min(2,Number(p.rate)||1)),tts:p.tts!==false};
}
