import {updatePlayerScripts as updateScripts} from './player-registration.mjs';
import {SERVICES,NEWS_ORIGINS,calendarURL} from './policy.mjs';
const $=id=>document.getElementById(id),status=(text,error=false)=>{ $('status').textContent=text;$('status').dataset.error=String(error); };
const originsFor=s=>s.hosts.map(h=>'https://'+h+'/*');
const allOrigins=[...Object.values(SERVICES).flatMap(originsFor),...NEWS_ORIGINS];
let ready=false,busy=false,revision=0,accessEnabled=false;
function controlsDisabled(disabled){for(const button of document.querySelectorAll('button'))button.disabled=disabled;}
async function refresh(){
  const current=++revision;
  const [access,granted,calendarAccess,data]=await Promise.all([
    chrome.permissions.contains({origins:allOrigins}),chrome.permissions.getAll(),
    chrome.permissions.contains({origins:['https://calendar.google.com/*']}),chrome.storage.local.get(['newsEnabled','calendarUrl'])
  ]);
  if(current!==revision)return;
  const allEnabled=access&&!!data.newsEnabled;
  accessEnabled=access||(granted.origins||[]).some(origin=>allOrigins.includes(origin));
  const partial=accessEnabled&&!allEnabled;
  const button=$('companion-access');
  button.setAttribute('aria-checked',String(accessEnabled));
  button.querySelector('.toggle-state').textContent=allEnabled?'On':partial?'Incomplete':'Off';
  button.closest('.quick-start').dataset.enabled=String(allEnabled);
  $('access-state').textContent=allEnabled?'All streaming services and news are on.':partial?'Only some streaming and news access is enabled. Turn off, then on, to enable all services.':'Streaming and news access is off.';
  $('calendar-status').textContent=data.calendarUrl?(calendarAccess?'Connected':'Access needed'):'Not connected';
  controlsDisabled(busy||!ready);$('clear-calendar').disabled=busy||!ready||!data.calendarUrl;

}
async function change(button,operation){
  if(busy||!ready)return;busy=true;controlsDisabled(true);status('Updating access…');
  try{status(await operation());}catch(e){status(e.message||'Could not change access. Try again.',true);}
  finally{busy=false;try{await refresh();}catch{status('Could not check access. Reopen Companion settings.',true);controlsDisabled(false);}if(!button.disabled)button.focus({preventScroll:true});}
}
for(const service of Object.values(SERVICES)){
  const item=document.createElement('li');item.textContent=service.label;$('services').append(item);
}
$('companion-access').onclick=()=>change($('companion-access'),async()=>{
  const enabled=accessEnabled;
  // Request all streaming/news hosts in the original click's user gesture.
  const ok=await chrome.permissions[enabled?'remove':'request']({origins:allOrigins});
  if(!ok)throw Error(enabled?'Access could not be turned off. Try again.':'Permission was not granted. Streaming and news access has not changed.');
  await chrome.storage.local.set({newsEnabled:!enabled});
  await updateScripts();
  if(!enabled&&!await chrome.permissions.contains({origins:allOrigins}))throw Error('Some access is still missing. Check the Streaming and news switch to try again.');
  if(enabled&&(await chrome.permissions.getAll()).origins?.some(origin=>allOrigins.includes(origin)))throw Error('Some streaming or news access could not be turned off. Reopen Companion settings to check access.');
  // The live access summary is authoritative, including later browser changes.
  return '';
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
