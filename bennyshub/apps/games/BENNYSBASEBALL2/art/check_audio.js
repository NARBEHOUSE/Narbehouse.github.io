const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let next=0,utterance,enabled=true;const timers=new Map();
const synthesis={speak:u=>{utterance=u;},cancel:()=>{if(utterance)utterance.onerror();}};
const context={console,window:{speechSynthesis:synthesis,NarbeVoiceManager:{getSettings:()=>({ttsEnabled:enabled,rate:.7})}},
    speechSynthesis:synthesis,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
    setTimeout:f=>{timers.set(++next,f);return next;},clearTimeout:id=>timers.delete(id)};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/audio.js'),'utf8'),context);
const audio=vm.runInContext('Object.create(AudioSystem.prototype)',context);
let completed=0;audio.speak('Curveball, outside.',true,()=>completed++);
assert.equal(completed,0);const start=timers.get(audio._speakTimer);start();
assert.equal(utterance.text,'Curveball, outside.');assert.equal(completed,0);
utterance.onend();utterance.onerror();assert.equal(completed,1,'Completion fires only once');
audio._sayNow('Cancelled call',()=>completed++);audio.speak('New line',true);
assert.equal(completed,1,'Cancelling an old call must not launch its delivery');
enabled=false;audio._sayNow('Muted call',()=>completed++);assert.equal(completed,2);
enabled=true;audio._sayNow('Engine error',()=>completed++);utterance.onerror();assert.equal(completed,3);
audio._sayNow('Missing completion event',()=>completed++);timers.get(audio._speakSafetyTimer)();assert.equal(completed,4);
delete context.window.speechSynthesis;audio.speak('No engine',true,()=>completed++);assert.equal(completed,5);
console.log('Speech: ordered completion, cancellation, TTS-off, engine error and missing-engine fallback passed.');

// The real recording suppresses subsequent synthetic cheers until it ends.
audio.settings={soundEnabled:true};let plays=0,synth=0;
audio.samples={homer:{currentTime:0,play(){plays++;return Promise.resolve();}}};
audio.ensureCtx=()=>{synth++;return null;};
audio.play('homer');audio.play('crowd');audio.play('crowd_big');audio.play('homer');
assert.equal(plays,1);assert.equal(synth,0);
audio.samples.homer.onended();audio.play('crowd');assert.equal(synth,1);
audio.play('homer');assert.equal(plays,2);audio.samples.homer.onerror();
assert(!audio._homerActive,'Failed recording must release celebration ownership');
console.log('Recorded home-run celebration plays once and excludes generated cheers.');
