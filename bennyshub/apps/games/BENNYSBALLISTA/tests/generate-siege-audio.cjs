// Original, deterministic, layered Foley and fantasy cues. Offline generation only.
// No runtime AudioContext, model, remote service or third-party samples.
const fs=require('fs'),path=require('path'),rate=22050,tau=Math.PI*2;
const dir=path.join(__dirname,'../audio/generated/siege');fs.mkdirSync(dir,{recursive:true});
let seed=31415;function noise(){seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;}
function tone(t,f,d=.3){return t<0?0:Math.sin(tau*f*t)*Math.exp(-t/d)*Math.min(1,t/.004);}
function wav(name,duration,fn,pan=0){seed=31415+name.length*421;let lo=0,prev=0;const n=Math.ceil(duration*rate),b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){const t=i/rate,w=noise();lo=lo*.94+w*.06;const hi=w-prev;prev=w;const v=fn(t,w,lo,hi)*Math.min(1,t/.003)*Math.min(1,(duration-t)/.035);for(let ch=0;ch<2;ch++){const s=Math.tanh(v*1.2)*.78*(pan===0?1:(ch===0?pan<0:pan>0)?1:.4);b.writeInt16LE(Math.round(s*32767),44+i*4+ch*2);}}fs.writeFileSync(path.join(dir,name+'.wav'),b);}
for(const family of ['wood','stone','glass','metal'])for(let variant=0;variant<3;variant++)for(const pan of [-1,0,1]){
 const pitch=1+(variant-1)*.12;
 wav(family+'-'+variant+(pan<0?'-left':pan>0?'-right':''),1.1,(t,w,l,h)=>{
  const snap=Math.exp(-t*70),body=Math.exp(-t*9);
  let s=family==='wood'?w*snap*.7+tone(t,175*pitch,.09)*.65+tone(t,320*pitch,.055)*.25+l*body*1.2:
   family==='stone'?l*Math.exp(-t*5)*2.4+tone(t,64*pitch,.15)*.7+w*snap*.25:
   family==='glass'?(tone(t,1297*pitch,.15)+tone(t,2131*pitch,.19)+tone(t,3179*pitch,.10))*.2+h*snap*.12:
   (tone(t,241*pitch,.20)+tone(t,643*pitch,.18)*.6+tone(t,1187*pitch,.14)*.3)*.4+w*snap*.25;
  // Irregular settling taps after the initial strike, rather than one flat thud.
  for(let j=0;j<5;j++){const x=t-(.085+j*j*.027+variant*.009);if(x>=0&&x<.09)s+=(family==='glass'?tone(x,(1600+j*313)*pitch,.025)*.16:family==='wood'?tone(x,(210+j*33)*pitch,.022)*.18:l*Math.exp(-x*34)*1.8)*(1-j*.13);}
  return s;
 },pan);
}
wav('crumble',1.8,(t,w,l)=>l*Math.exp(-t*1.9)*1.8+w*Math.pow(Math.max(0,Math.sin(t*49)*Math.sin(t*17)),8)*Math.exp(-t*2)*.35);
wav('creak',.85,(t,w,l)=>Math.sin(tau*(115*t-35*t*t)+Math.sin(t*67)*.9)*Math.sin(Math.PI*t/.85)*.18+l*.2);
wav('explosion',1.9,(t,w,l)=>tone(t,47,.32)*.95+l*Math.exp(-t*2.6)*3.4+w*Math.exp(-t*40)*.5);
wav('fire',1.4,(t,w,l,h)=>l*.55*Math.sin(Math.PI*t/1.4)+h*Math.pow(Math.max(0,Math.sin(t*93)*Math.sin(t*37)),16)*.12);
// One contact cue: quick thud followed by a low, steadily fading rubble tail.
wav('boulder-land',2.4,(t,w,l)=>l*Math.exp(-t*1.85)*3.1+w*Math.exp(-t*65)*.22);
for(const [id,pitch]of Object.entries({stone:240,boulder:95,fire:360,splitter:520,bomb:150}))wav('launch-'+id,.85,(t,w,l)=>(id==='boulder'?0:tone(t,pitch*(1-t*.3),.12)*.28)+l*Math.exp(-t*5)*1.4+w*Math.exp(-Math.pow((t-.14)/.11,2))*.15);
wav('split',.9,t=>[0,.065,.13].reduce((s,at,i)=>s+tone(t-at,660*Math.pow(1.25,i)*(1+.15*Math.max(0,t-at)),.13)*.22,0));
wav('ignite',.9,(t,w,l)=>l*Math.exp(-t*4)*1.3+tone(t,310-100*t,.1)*.16+w*Math.exp(-Math.pow((t-.13)/.1,2))*.15);
for(let i=0;i<3;i++)wav('guard-'+i,.7,t=>tone(t,280+i*45,.08)*.28+tone(t-.075,560+i*90,.12)*.22+tone(t-.15,840+i*135,.09)*.12);
wav('cascade',1.3,t=>[293.66,369.99,440,587.33].reduce((s,f,i)=>s+(tone(t-i*.085,f,.23)+tone(t-i*.085,f*2,.1)*.25)*.17,0));
console.log('Generated '+fs.readdirSync(dir).length+' siege sound files.');
