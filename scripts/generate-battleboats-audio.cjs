'use strict';
// Original procedural PCM effects. No external assets or AudioContext required.
// Regenerate with: node tools/generate-battleboats-audio.cjs
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../bennyshub/apps/games/BENNYSBATTLEBOATS/audio');
fs.mkdirSync(output,{recursive:true});
const rate=22050;
let seed=97213;
const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
function wav(name,duration,voice){
    const count=Math.floor(rate*duration),data=Buffer.alloc(44+count*2);
    data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
    data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
    data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
    data.write('data',36);data.writeUInt32LE(count*2,40);
    let low=0;
    for(let i=0;i<count;i++){
        const t=i/rate,n=noise();low=low*.87+n*.13;
        const envelope=Math.min(1,t/.008)*Math.min(1,(duration-t)/.04);
        const sample=Math.tanh(voice(t,n,low)*1.35)*.72*envelope;
        data.writeInt16LE(Math.round(sample*32767),44+i*2);
    }
    fs.writeFileSync(path.join(output,name+'.wav'),data);
}
wav('launch',.38,(t,n,l)=>Math.sin(2*Math.PI*(190*t-170*t*t))*.4*Math.exp(-t*13)+l*(.2+t*2.3)*Math.sin(Math.PI*t/.38));
wav('hit',.95,(t,n,l)=>Math.sin(2*Math.PI*(80*t-25*t*t))*.52*Math.exp(-t*6)+l*2*Math.exp(-t*4)+n*.2*Math.exp(-t*30));
wav('miss',.85,(t,n,l)=>(n-l)*.22*Math.exp(-t*4)+l*.9*Math.exp(-t*2.8)+Math.sin(2*Math.PI*(540*t-170*t*t))*.09*Math.exp(-t*8));
wav('sunk',1.65,(t,n,l)=>{
    let s=0;
    for(const delay of [0,.19,.42]){
        const u=t-delay;
        if(u>=0)s+=(l*1.2+Math.sin(2*Math.PI*(65*u-9*u*u))*.34)*Math.exp(-u*4.5);
    }
    return s+Math.sin(2*Math.PI*130.81*t)*.13*Math.exp(-t*1.8);
});
wav('sonar',.7,t=>Math.sin(2*Math.PI*740*t)*.23*Math.exp(-t*6)+Math.sin(2*Math.PI*1480*t)*.035*Math.exp(-t*9));
console.log('Generated five Battleboats WAV effects.');
