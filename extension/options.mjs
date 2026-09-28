import {updatePlayerScripts as updateScripts} from './player-registration.mjs';
import {SERVICES,NEWS_ORIGINS,calendarURL} from './policy.mjs';
const $=id=>document.getElementById(id),status=(text,error=false)=>{ $('status').textContent=text;$('status').dataset.error=String(error); };
const originsFor=s=>s.hosts.map(h=>'https://'+h+'/*');
const allOrigins=[...Object.values(SERVICES).flatMap(originsFor),...NEWS_ORIGINS];
const icons={youtube:['▶','#ffb9bd','#482630'],netflix:['N','#ffafb8','#492631'],disney:['D+','#b9ccff','#26385b'],hulu:['h','#9cecc4','#234636'],prime:['P','#9adeff','#213f54'],max:['M','#cec0ff','#362c56'],paramount:['P+','#acd0ff','#263e5d'],plex:['P','#f5d287','#4c3d24'],pluto:['TV','#e8e59b','#414026'],tubi:['T','#ffeb82','#453f23']};
let ready=false,busy=false,revision=0;
const serviceButtons=new Map();
function setToggle(button,on){button.setAttribute('aria-checked',String(on));button.querySelector('.toggle-state').textContent=on?'On':'Off';button.closest('.source-card').dataset.enabled=String(on);}
function controlsDisabled(disabled){for(const button of document.querySelectorAll('button'))button.disabled=disabled;}
async function refresh(){
  const current=++revision;
  const [states,newsAccess,calendarAccess,data]=await Promise.all([
    Promise.all(Object.values(SERVICES).map(s=>chrome.permissions.contains({origins:originsFor(s)}))),
    chrome.permissions.contains({origins:NEWS_ORIGINS}),chrome.permissions.contains({origins:['https://calendar.google.com/*']}),chrome.storage.local.get(['newsEnabled','calendarUrl'])
  ]);
  if(current!==revision)return;
  let count=0;Object.keys(SERVICES).forEach((id,i)=>{setToggle(serviceButtons.get(id),states[i]);if(states[i])count++;});
  setToggle($('news'),!!data.newsEnabled&&newsAccess);
  $('source-count').textContent=`${count} of ${states.length} on`;
  $('calendar-status').textContent=data.calendarUrl?(calendarAccess?'Connected':'Access needed'):'Not connected';
  const allOn=count===states.length&&newsAccess&&!!data.newsEnabled;
  $('enable-all').textContent=allOn?'All sources enabled':'Enable all sources';
  controlsDisabled(busy||!ready);$('enable-all').disabled=busy||!ready||allOn;$('clear-calendar').disabled=busy||!ready||!data.calendarUrl;
}
async function change(button,operation){
  if(busy||!ready)return;busy=true;controlsDisabled(true);status('Updating access…');
  try{status(await operation());}catch(e){status(e.message||'Could not change access. Try again.',true);}
  finally{busy=false;try{await refresh();}catch{status('Could not check access. Reopen Companion settings.',true);controlsDisabled(false);}if(!button.disabled)button.focus({preventScroll:true});}
}
for(const [id,service] of Object.entries(SERVICES)){
  const card=document.createElement('div');card.className='source-card';
  const icon=document.createElement('span');icon.className='source-icon';icon.setAttribute('aria-hidden','true');const [initial,color,bg]=icons[id];icon.textContent=initial;icon.style.setProperty('--icon',color);icon.style.setProperty('--icon-bg',bg);
  const copy=document.createElement('div');copy.className='source-copy';const name=document.createElement('h3');name.id='label-'+id;name.textContent=service.label;copy.append(name);
  const button=document.createElement('button');button.type='button';button.className='toggle';button.dataset.service=id;button.setAttribute('role','switch');button.setAttribute('aria-labelledby',name.id);button.setAttribute('aria-checked','false');button.disabled=true;
  const state=document.createElement('span');state.className='toggle-state';state.textContent='Off';const track=document.createElement('span');track.className='toggle-track';track.setAttribute('aria-hidden','true');button.append(state,track);
  button.onclick=()=>change(button,async()=>{
    const enabled=button.getAttribute('aria-checked')==='true';
    // Keep the browser permission request in the original click's user gesture.
    const ok=await chrome.permissions[enabled?'remove':'request']({origins:originsFor(service)});
    if(!ok)throw Error(enabled?'Access could not be removed.':'Permission was not granted. '+service.label+' is still off.');
    await updateScripts();return service.label+(enabled?' turned off.':' is on. Launch a new stream from the Hub.');
  });
  serviceButtons.set(id,button);card.append(icon,copy,button);$('services').append(card);
}
$('enable-all').onclick=()=>change($('enable-all'),async()=>{
  if(!await chrome.permissions.request({origins:allOrigins}))throw Error('Permission was not granted. Your current sources have not changed.');
  await chrome.storage.local.set({newsEnabled:true});await updateScripts();return 'All streaming services and news are on. You can turn off individual sources below.';
});
$('news').onclick=()=>change($('news'),async()=>{
  const enabled=$('news').getAttribute('aria-checked')==='true';
  if(enabled){if(!await chrome.permissions.remove({origins:NEWS_ORIGINS}))throw Error('News access could not be removed.');await chrome.storage.local.set({newsEnabled:false});}
  else{if(!await chrome.permissions.request({origins:NEWS_ORIGINS}))throw Error('News access was not granted.');await chrome.storage.local.set({newsEnabled:true});}
  return enabled?'News turned off.':'News is on.';
});
$('calendar-form').onsubmit=e=>{e.preventDefault();change(e.submitter||$('calendar-form').querySelector('button'),async()=>{
  const url=calendarURL($('calendar').value.trim());
  if(!await chrome.permissions.request({origins:['https://calendar.google.com/*']}))throw Error('Calendar access was not granted.');
  await chrome.storage.local.set({calendarUrl:url});$('calendar').value='';return 'Calendar connected. Open Day Hub to see your schedule.';
});};
$('clear-calendar').onclick=()=>change($('clear-calendar'),async()=>{await chrome.storage.local.remove('calendarUrl');await chrome.permissions.remove({origins:['https://calendar.google.com/*']});$('calendar').value='';return 'Calendar removed.';});
if($('fixture'))$('fixture').onclick=()=>change($('fixture'),async()=>{if(!await chrome.permissions.request({origins:['http://localhost/*','http://127.0.0.1/*']}))throw Error('Local access was not granted.');await updateScripts();return 'Local video test enabled.';});
$('version').textContent='v'+chrome.runtime.getManifest().version;
try{
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await updateScripts();ready=true;await refresh();
}catch{status('Could not load settings. Reload this extension and reopen settings.',true);}
const externalRefresh=()=>refresh().catch(()=>status('Could not check source access. Reopen settings.',true));
chrome.permissions.onAdded.addListener(externalRefresh);chrome.permissions.onRemoved.addListener(externalRefresh);chrome.storage.onChanged.addListener(externalRefresh);
addEventListener('focus',externalRefresh);
let down=0;document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.target.matches('input,textarea,select'))return;e.preventDefault();if(!e.repeat)down=Date.now();});document.addEventListener('keyup',e=>{if(e.code!=='Space'||!down)return;e.preventDefault();const items=[...document.querySelectorAll('button,input,select,summary')].filter(x=>!x.disabled&&x.getClientRects().length);const i=items.indexOf(document.activeElement),delta=Date.now()-down>=3000?-1:1;down=0;items[(i+delta+items.length)%items.length]?.focus();});addEventListener('blur',()=>{down=0;});

let returningToHub=false;
$('return-hub').onclick=async()=>{
  if(returningToHub)return;returningToHub=true;
  try{
    const tab=await chrome.tabs.getCurrent();
    const reply=await chrome.runtime.sendMessage({protocol:1,action:'SETTINGS_RETURN',payload:{tabId:tab?.id}});
    if(!reply?.ok)throw Error(reply?.error||'Could not return to the Hub. Try again.');
  }catch(error){status(error.message,true);returningToHub=false;}
};
