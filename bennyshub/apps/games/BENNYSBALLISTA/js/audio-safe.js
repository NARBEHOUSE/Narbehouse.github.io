/** File-backed siege Foley through SafeAudio; no runtime AudioContext. */
RT.audio=(function(){
'use strict';const U=RT.util,S=window.SafeAudio;let enabled=U.load('sound',true),musicEnabled=U.load('music',true),music=null,volume=0,clock=0,windowStart=0,voices=0,breaks=0,breakAge=0,aimUntil=0;const times=new Map(),variants=new Map(),names=[];
function preload(name,url){names.push(name);S?.preload(name,url);}
for(const family of ['wood','stone','glass','metal'])for(let i=0;i<3;i++)for(const side of ['','-left','-right'])preload('siege-'+family+'-'+i+side,'audio/generated/siege/'+family+'-'+i+side+'.wav');
for(const name of ['boulder-land','crumble','creak','explosion','fire','split','ignite','guard-0','guard-1','guard-2','cascade',...['stone','boulder','fire','splitter','bomb'].map(id=>'launch-'+id)])preload('siege-'+name,'audio/generated/siege/'+name+'.wav');
for(const name of ['hover','select','score','win','lose','bust'])S?.preload(name);
for(const name of ['near','hit','danger'])preload('ballista-aim-'+name,'audio/generated/aim-'+name+'.wav');
preload('ballista-pickup','audio/generated/pickup.wav');S?.setEnabled(enabled);
function play(name,v=.5,priority=false){if(!enabled)return;const duck=window.speechSynthesis?.speaking? .23:clock<aimUntil?.22:1;const gentle=RT.effects?.getIntensity()==='full'?1:.7;S?.play(name,U.clamp(v*(priority?1:duck*gentle),0,1));}
function ready(key,seconds){if(clock-(times.get(key)??-Infinity)<seconds)return false;times.set(key,clock);return true;}
function budget(){if(clock-windowStart>.25){windowStart=clock;voices=0;}return voices++<6;}
function familyOf(m){return m?.crown?'crown':m?.guard?'guard':m?.explodes?'barrel':m?.glass?'glass':['steel','metal'].includes(m?.family)||m?.id==='X'?'metal':m?.family||'stone';}
function variant(f){const i=((variants.get(f)??-1)+1)%3;variants.set(f,i);return i;}
function impact(m,energy=20,pan=0){const f=familyOf(m);if(f==='guard'||f==='crown')return;if(!ready('hit-'+f,.065)||!budget())return;const type=['wood','glass','metal'].includes(f)?f:f==='barrel'?'wood':'stone';play('siege-'+type+'-'+variant(type)+(pan<-.25?'-left':pan>.25?'-right':''),U.clamp(energy/65,.16,.58));}
function destroy(m,e=24,p=0){const f=familyOf(m);if(f==='guard'||f==='crown'){if(ready('guard',.12))play('siege-guard-'+variant('guard'),.48);return;}if(f==='barrel'){explosion();return;}impact(m,e*1.25,p);breaks++;breakAge=clock;if(ready('crumble',.65)&&!m?.small)play('siege-crumble',.25);}
function explosion(){if(ready('explosion',.18))play('siege-explosion',.6);}
function collapse(m){if(ready('creak',.8))play('siege-'+(m?.family==='wood'?'creak':'crumble'),.25);}
function musicResume(){if(!musicEnabled)return;if(!music){music=new Audio('audio/generated/mischief-minuet.wav');music.loop=true;music.volume=0;}if(music.paused)music.play().catch(()=>{});}
function tick(dt,phase){clock+=dt;if(phase==='MENU'||phase==='RESCUE_FAILED'){for(const name of ['fire','creak','crumble'])S?.stop('siege-'+name);breaks=0;}else{if(clock-breakAge>1.25)breaks=0;if(breaks>=5&&ready('cascade',2.5)){play('siege-cascade',.32);breaks=0;}}if(music){const target=musicEnabled?(window.speechSynthesis?.speaking||clock<aimUntil?.025:phase==='MENU'?.055:.10):0;volume+=U.clamp(target-volume,-dt*.4,dt*.2);music.volume=U.clamp(volume,0,1);}}
function setEnabled(on){enabled=!!on;U.save('sound',enabled);S?.setEnabled(enabled);}
function setMusicEnabled(on){musicEnabled=!!on;U.save('music',musicEnabled);if(on)musicResume();else if(music){music.pause();volume=0;music.volume=0;}}
return{pickup:()=>play('ballista-pickup',.7),aimGuide:kind=>{aimUntil=clock+.6;play('ballista-aim-'+kind,.5,true);},resume(){},tick,setEnabled,isEnabled:()=>enabled,musicResume,setMusicEnabled,isMusicEnabled:()=>musicEnabled,impact,destroy,familyOf,collapse,explosion,
fireShot:ammo=>{breaks=0;play('siege-launch-'+(ammo?.id||'stone'),.58);},split:()=>play('siege-split',.48),ignite:()=>{if(ready('ignite',.2))play('siege-ignite',.4);},fireBed:()=>{if(ready('fire',1.1))play('siege-fire',.26);},boulderLand:()=>play('siege-boulder-land',.6),
startFlight(){},updateFlight(){},stopFlight(){},aimTick:()=>play('hover',.3,true),chargeStep:()=>play('hover',.3,true),guardDown:()=>play('siege-guard-0',.5),crownTopple:()=>play('siege-guard-2',.5),win:()=>play('win'),outOfBolts:()=>play('lose'),menuMove:()=>play('hover',.3,true),menuSelect:()=>play('select',.4,true),menuBlocked:()=>play('bust'),noise:()=>impact(null,16),tone:()=>play('hover',.3,true),__test:{state:()=>({clock,voices,breaks,variants:Object.fromEntries(variants)}),assets:()=>names.slice()}};
})();
