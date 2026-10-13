'use strict';
/* ================= Sound: HTML5 audio only, no AudioContext =================
   Sounds are synthesized into WAV data URIs the first time they are needed.
   Pet voices (barks, whines, meows, purrs) are shaped per pet kind and per life stage, and
   any recording dropped into sounds/ (see sounds/SOUNDS.md) replaces the synthesized voice, for one
   life stage (dog-bark-baby.wav) or for all of them (dog-bark.wav). */
const SR=22050, TAU=Math.PI*2;

function toWavURI(d){
  const len=d.length, buf=new ArrayBuffer(44+len*2), v=new DataView(buf), w=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  w(0,'RIFF'); v.setUint32(4,36+len*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,SR,true); v.setUint32(28,SR*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,len*2,true);
  for(let i=0;i<len;i++) v.setInt16(44+i*2,clamp(d[i],-1,1)*32767,true);
  const bytes=new Uint8Array(buf); let bin=''; for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return 'data:audio/wav;base64,'+btoa(bin);
}
function normalize(d,peak){ let m=0; for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>m) m=a; } if(m>0){ const k=peak/m; for(let i=0;i<d.length;i++) d[i]*=k; } return d; }
function rms(d){ let s=0; for(let i=0;i<d.length;i++) s+=d[i]*d[i]; return Math.sqrt(s/Math.max(1,d.length))||1; }
function concatAt(list,total){ /* list: [[buffer, startSeconds, gain]] */
  const len=Math.ceil((total||Math.max(...list.map(([b,t])=>t+b.length/SR)))*SR)+8, out=new Float32Array(len);
  list.forEach(([b,t,g])=>{ const o=Math.floor(t*SR); for(let i=0;i<b.length&&o+i<len;i++) out[o+i]+=b[i]*(g==null?1:g); });
  return out;
}
/* Two-pole resonator, used to push noise through the mouth's formants. */
function reso(){ return {c:0,r2:0,g:0,y1:0,y2:0}; }
function setReso(z,F,B){ const r=Math.exp(-Math.PI*B/SR); z.c=2*r*Math.cos(TAU*F/SR); z.r2=r*r; z.g=1-r; }
function stepReso(z,x){ const y=z.g*x+z.c*z.y1-z.r2*z.y2; z.y2=z.y1; z.y1=y; return y; }
function onePoleLP(d,fc){ const a=Math.exp(-TAU*fc/SR); let y=0; for(let i=0;i<d.length;i++){ y=(1-a)*d[i]+a*y; d[i]=y; } return d; }

/* Voiced sound: harmonics of a moving pitch, each weighted by how close it sits to a formant.
   f0(t), form(t) and amp(t) take t from 0 to 1 across the sound. */
function voiced(o){
  const n=Math.max(8,Math.floor(o.dur*SR)), H=o.nh||32, V=new Float32Array(n), N=new Float32Array(n), amps=new Float32Array(H+1);
  const res=[reso(),reso(),reso(),reso()]; let f0=100, ph=0, phS=0, jit=0, shim=1, forms=[[500,100,1]];
  for(let i=0;i<n;i++){
    const t=i/n;
    if((i&31)===0){
      jit=jit*.6+(Math.random()*2-1)*(o.jitter||0);
      shim=1+(Math.random()*2-1)*(o.rasp||0)*.4;
      const vib=o.vib?1+Math.sin(TAU*o.vib[0]*i/SR)*o.vib[1]:1;
      f0=Math.max(30,o.f0(t)*(1+jit)*vib); forms=o.form(t);
      const tilt=o.tilt==null?.6:o.tilt;
      for(let k=1;k<=H;k++){ const f=k*f0; if(f>SR*.45){ amps[k]=0; continue; } let a=0; for(const q of forms){ const x=(f-q[0])/q[1]; a+=q[2]/(1+x*x); } amps[k]=a*Math.pow(k,-tilt); }
      for(let j=0;j<res.length;j++){ if(forms[j]) setReso(res[j],forms[j][0],forms[j][1]*1.3); }
    }
    ph+=f0/SR; ph-=Math.floor(ph); phS+=f0/(2*SR); phS-=Math.floor(phS);
    let s=0; for(let k=1;k<=H;k++){ const a=amps[k]; if(a) s+=a*Math.sin(TAU*k*ph); }
    if(o.rasp) s+=o.rasp*.35*amps[1]*Math.sin(TAU*phS);
    V[i]=s*shim;
    if(o.breath){ const x=Math.random()*2-1; let ns=0; for(let j=0;j<forms.length&&j<res.length;j++) ns+=stepReso(res[j],x)*forms[j][2]; N[i]=ns; }
  }
  const b=o.breath||0, kv=(1-b)/rms(V), kn=b?b/rms(N):0, d=new Float32Array(n);
  for(let i=0;i<n;i++){ const t=i/n; d[i]=(V[i]*kv+N[i]*kn)*o.amp(t)*(o.am?o.am(t,i/SR):1); }
  if(o.onset){ const m=Math.floor(o.onset*SR); let lp=0; for(let i=0;i<m&&i<n;i++){ const x=Math.random()*2-1; lp=.6*lp+.4*x; d[i]+=(x-lp)*1.4*(1-i/m); } }
  normalize(d,.9);
  if(o.sat){ const k=Math.tanh(o.sat); for(let i=0;i<n;i++) d[i]=Math.tanh(d[i]*o.sat)/k; }
  if(o.lp) onePoleLP(d,o.lp);
  return normalize(d,.9);
}
/* Band of noise with an envelope, for breaths, pants and sighs. F may move over time. */
function breathNoise(dur,F,B,amp){
  const n=Math.floor(dur*SR), d=new Float32Array(n), z=reso(), z2=reso();
  for(let i=0;i<n;i++){ const t=i/n; if((i&31)===0){ const f=typeof F==='function'?F(t):F; setReso(z,f,B); setReso(z2,f*1.9,B*1.4); } const x=Math.random()*2-1; d[i]=(stepReso(z,x)+.5*stepReso(z2,x))*amp(t); }
  return normalize(d,.9);
}
/* A real purr is a train of short bursts, about 25 a second, that swells on each breath out
   and softens on each breath in. */
function purrSynth(dur,rate,fs,rasp){
  const n=Math.floor(dur*SR), d=new Float32Array(n), EX=1.15, IN=.85, cyc=EX+IN, plen=Math.floor(.034*SR);
  for(let tp=.02;tp<dur-.04;){
    const pos=tp%cyc, ex=pos<EX, env=ex?Math.pow(Math.sin(Math.PI*pos/EX),.55):.5*Math.pow(Math.sin(Math.PI*(pos-EX)/IN),.55);
    const fade=Math.min(1,tp/.25,(dur-tp)/.3), A=env*fade*(.8+Math.random()*.4), i0=Math.floor(tp*SR), f1=(ex?100:112)*fs*(1+(Math.random()-.5)*.08);
    for(let j=0;j<plen&&i0+j<n;j++){ const tt=j/SR;
      d[i0+j]+=A*(Math.exp(-tt/.005)*(Math.random()*2-1)*(.55+rasp*.5)+Math.exp(-tt/.011)*Math.sin(TAU*f1*tt)+.35*Math.exp(-tt/.007)*Math.sin(TAU*f1*2.1*tt)); }
    tp+=1/(rate*(ex?1:1.09)*(1+(Math.random()-.5)*.07));
  }
  onePoleLP(d,1300); onePoleLP(d,1800);
  return normalize(d,.9);
}

/* Per-stage voice settings. f0 is the speaking pitch, fs scales the formants (smaller mouth, higher),
   len stretches timing, rasp adds the soft hoarseness of an older voice. */
const VOICE_P={
  dog:{baby:{f0:900,fs:1.38,len:.85,rasp:0,whine:1000,growl:230,baby:1},teen:{f0:600,fs:1.16,len:.95,rasp:.03,whine:880,growl:160},adult:{f0:410,fs:1,len:1.05,rasp:.08,whine:760,growl:115},senior:{f0:335,fs:.93,len:1.18,rasp:.28,whine:680,growl:100}},
  cat:{baby:{f0:900,fs:1.3,len:.72,rasp:0,purr:27},teen:{f0:720,fs:1.14,len:.88,rasp:.02,purr:26},adult:{f0:560,fs:1,len:1,rasp:.06,purr:25},senior:{f0:470,fs:.94,len:1.14,rasp:.26,purr:23}}
};
const jig=a=>1+(Math.random()-.5)*a;
function barkOne(P,pm,lenMul,muffle){
  const f0=P.f0*pm*jig(.08), fs=P.fs*(muffle?.62:1), dur=(P.baby?.088:.15)*P.len*(lenMul||1)*jig(.12), peak=P.baby?.28:.22;
  return voiced({dur,f0:t=>f0*(t<peak?lerp(.78,P.baby?1.25:1.15,t/peak):lerp(P.baby?1.25:1.15,.7,(t-peak)/(1-peak))),
    form:t=>{ const op=Math.min(1,t/.18), cl=t>.18?lerp(1,.78,(t-.18)/.82):1; return [[lerp(420,880,op)*cl*fs,150*fs,1],[lerp(1100,1550,op)*fs,220*fs,.6],[2700*fs,320*fs,.28],[3600*fs,420*fs,.12]]; },
    amp:t=>Math.min(1,t/.05)*Math.pow(1-t,1.3),tilt:muffle?1.1:.55,breath:.28+P.rasp*.3,jitter:.015,rasp:.12+P.rasp,sat:muffle?1:2.2,onset:muffle?0:.012,lp:muffle?900:0});
}
function whineOne(P,pm,dur,shape){
  const f0=P.whine*pm*jig(.05), fs=P.fs;
  return voiced({dur,nh:8,vib:[4.5,.007],f0:shape?t=>f0*shape(t):t=>f0*(t<.4?lerp(.9,1.07,t/.4):t<.52?lerp(1.07,.96,(t-.4)/.12):t<.85?lerp(.96,1.12,(t-.52)/.33):lerp(1.12,.86,(t-.85)/.15)),
    form:()=>[[800*fs,500,1],[1800*fs,700,.2]],amp:t=>Math.pow(Math.sin(Math.PI*Math.min(1,t)),1.4)*.9,tilt:2.6,breath:.2+P.rasp*.2,jitter:.003,rasp:P.rasp*.4,lp:1600});
}
function meowOne(P,dur,slow,pm){
  const f0=P.f0*(pm||1)*jig(.06), fs=P.fs;
  const fc=slow?(t=>f0*(t<.2?lerp(.86,1.04,t/.2):lerp(1.04,.68,(t-.2)/.8))):(t=>f0*(t<.3?lerp(.86,1.12,t/.3):t<.7?lerp(1.12,1,(t-.3)/.4):lerp(1,.76,(t-.7)/.3)));
  return voiced({dur,f0:fc,vib:slow?[4.5,.016]:[5,.008],
    form:t=>{ let F1,F2,G1; if(t<.1){ F1=350; F2=1300; G1=.45; } else if(t<.35){ const k=(t-.1)/.25; F1=lerp(350,1000,k); F2=lerp(1300,2100,k); G1=lerp(.45,1,k); }
      else if(t<.7){ const k=(t-.35)/.35; F1=lerp(1000,900,k); F2=lerp(2100,1600,k); G1=1; } else { const k=(t-.7)/.3; F1=lerp(900,560,k); F2=lerp(1600,950,k); G1=lerp(1,.7,k); }
      return [[F1*fs,170*fs,G1],[F2*fs,240*fs,.6],[3300*fs,380*fs,.22]]; },
    amp:t=>Math.min(1,t/.06)*(t<.1?.55:t<.2?lerp(.55,1,(t-.1)/.1):1)*Math.min(1,(1-t)/(slow?.4:.28)),tilt:.75,breath:.1+P.rasp*.35+(slow?.05:0),jitter:.008,rasp:P.rasp});
}
function sneezeSynth(P){
  const ah=voiced({dur:.2,f0:t=>P.f0*lerp(.9,1.25,t),form:()=>[[900*P.fs,250,1],[1700*P.fs,300,.4]],amp:t=>Math.min(1,t/.3)*Math.min(1,(1-t)/.2)*.6,tilt:.9,breath:.5});
  const choo=breathNoise(.13,3200*P.fs,1600,t=>Math.min(1,t/.04)*Math.pow(1-t,1.5));
  const tail=voiced({dur:.09,f0:()=>P.f0*1.3,form:()=>[[2400*P.fs,400,1]],amp:t=>Math.pow(1-t,2),tilt:.5,breath:.6});
  return concatAt([[ah,0,.55],[choo,.26,1],[tail,.28,.5]]);
}
function snoreSynth(P,cat){
  const f=cat?70:60, inh=voiced({dur:.8,f0:()=>f*jig(.05),am:(t,s)=>.35+.65*Math.abs(Math.sin(Math.PI*30*s)),form:()=>[[300,180,1],[800,300,.4]],amp:t=>Math.sin(Math.PI*t),tilt:.4,breath:.55,rasp:.4,lp:900});
  const ex=breathNoise(.55,500,500,t=>Math.sin(Math.PI*t)*.8);
  return concatAt([[inh,0,.9],[ex,.85,.35]]);
}
const VOICES={
  dog:{
    bark:{n:3,make:P=>barkOne(P,1)},
    barkHappy:{n:2,make:P=>concatAt([[barkOne(P,1,.82),0],[barkOne(P,1.07,.74),P.baby?.13:.18],[barkOne(P,1.14,.7),P.baby?.26:.35]])},
    /* A warm hello: greeting you, friends and visitors. Built like the happy barks, a little softer. */
    barkFriendly:{n:2,make:P=>concatAt([[barkOne(P,1,.82),0,.85],[barkOne(P,1.04,.76),P.baby?.15:.2,.75]])},
    whine:{n:2,make:P=>whineOne(P,1,.55*P.len*jig(.1),t=>t<.5?lerp(.96,1.04,t/.5):lerp(1.04,.9,(t-.5)/.5))},
    whimper:{n:1,make:P=>concatAt([[whineOne(P,1,.22,t=>lerp(1.02,.94,t)),0],[whineOne(P,.92,.26,t=>lerp(1.02,.9,t)),.34]])},
    pant:{n:1,make:P=>{ const list=[]; for(let k=0;k<6;k++){ list.push([breathNoise(.1,1300*P.fs,900,t=>Math.sin(Math.PI*t)),k*.21,1]); list.push([breathNoise(.07,1800*P.fs,1000,t=>Math.sin(Math.PI*t)),k*.21+.11,.45]); } return concatAt(list); }},
    growl:{n:1,make:P=>voiced({dur:.95*P.len,f0:t=>P.growl*(1+.06*Math.sin(TAU*t*3)),am:(t,s)=>.45+.55*Math.pow(Math.abs(Math.sin(Math.PI*27*s)),.6),
      form:()=>[[450*P.fs,180,1],[1100*P.fs,300,.45],[2400*P.fs,500,.15]],amp:t=>Math.min(1,t/.1,(1-t)/.2)*(t<.5?1:.85),tilt:.5,breath:.4,jitter:.03,rasp:.5,sat:1.8})},
    yawn:{n:1,make:P=>{ const sq=voiced({dur:.08,nh:4,f0:t=>1700*P.fs*lerp(1,1.15,t),form:()=>[[1800*P.fs,600,1]],amp:t=>Math.sin(Math.PI*t),tilt:2});
      const body=voiced({dur:.85*P.len,f0:t=>P.f0*.95*(t<.15?lerp(1.5,1.7,t/.15):lerp(1.7,.8,(t-.15)/.85)),form:t=>[[lerp(700,900,Math.min(1,t*4))*(t>.6?lerp(1,.6,(t-.6)/.4):1)*P.fs,200,1],[lerp(1300,1100,t)*P.fs,300,.5]],
        amp:t=>Math.min(1,t/.1)*Math.pow(1-t,.8),tilt:.9,breath:.45,jitter:.01,rasp:P.rasp});
      return concatAt([[sq,0,.55],[body,.05,1]]); }},
    sigh:{n:1,make:P=>{ const air=breathNoise(.9,t=>lerp(900,450,t)*P.fs,600,t=>Math.min(1,t/.08)*Math.pow(1-t,1.2)); const hum=voiced({dur:.5,f0:()=>P.f0*.5,form:()=>[[400*P.fs,200,1]],amp:t=>Math.sin(Math.PI*t),tilt:1.2,lp:700}); return concatAt([[air,0,1],[hum,.05,.25]]); }},
    sneeze:{n:1,make:P=>sneezeSynth(P)},
    snore:{n:1,make:P=>snoreSynth(P,false)}
  },
  cat:{
    meow:{n:3,make:P=>meowOne(P,.62*P.len*jig(.1))},
    meowSad:{n:1,make:P=>meowOne(P,1.05*P.len,true)},
    trill:{n:2,make:P=>voiced({dur:.34*P.len*jig(.1),f0:t=>P.f0*.85*lerp(.9,1.3,t),am:(t,s)=>.45+.55*Math.abs(Math.sin(Math.PI*28*s)),form:t=>[[lerp(520,800,Math.max(0,t-.6)/.4)*P.fs,200,1],[1500*P.fs,300,.45],[3000*P.fs,400,.15]],amp:t=>Math.min(1,t/.08,(1-t)/.2),tilt:.8,breath:.12,jitter:.01})},
    purr:{n:1,make:P=>purrSynth(2.9,P.purr,P.fs,P.rasp)},
    purrShort:{n:1,make:P=>purrSynth(1.35,P.purr,P.fs,P.rasp)},
    chatter:{n:1,make:P=>{ const list=[]; for(let k=0;k<7;k++) list.push([voiced({dur:.045,f0:()=>P.f0*2.1*jig(.05),form:()=>[[1900*P.fs,450,1],[3200*P.fs,600,.4]],amp:t=>Math.min(1,t/.1)*Math.pow(1-t,2),tilt:.4,breath:.3}),k*.075,1]); return concatAt(list); }},
    yawn:{n:1,make:P=>{ const body=voiced({dur:.85*P.len,f0:t=>P.f0*lerp(1.05,.55,t),form:t=>[[lerp(800,1000,Math.min(1,t*3))*(t>.6?lerp(1,.65,(t-.6)/.4):1)*P.fs,220,1],[lerp(1800,1300,t)*P.fs,300,.5]],amp:t=>Math.min(1,t/.12)*Math.pow(1-t,.9),tilt:.9,breath:.5,rasp:P.rasp});
      const sq=voiced({dur:.06,nh:4,f0:()=>P.f0*2.4,form:()=>[[P.f0*2.4,500,1]],amp:t=>Math.sin(Math.PI*t),tilt:2}); return concatAt([[body,0,1],[sq,.8*P.len,.5]]); }},
    sneeze:{n:1,make:P=>sneezeSynth(P)},
    snore:{n:1,make:P=>snoreSynth(P,true)}
  }
};

/* Everything else: short effects built from simple parts, as in the original game. */
function synthParts(parts){
  const total=Math.max(...parts.map(p=>(p.when||0)+p.dur))+.02, len=Math.ceil(SR*total), d=new Float32Array(len);
  parts.forEach(p=>{
    const start=Math.floor((p.when||0)*SR), n=Math.floor(p.dur*SR); let ph=0;
    for(let i=0;i<n&&start+i<len;i++){
      const t=i/n, f=p.f2?p.f*Math.pow(p.f2/p.f,t):p.f; ph+=f/SR;
      let s;
      if(p.type==='noise') s=Math.random()*2-1;
      else if(p.type==='square') s=(ph%1)<.5?1:-1;
      else if(p.type==='triangle') s=1-4*Math.abs((ph%1)-.5);
      else s=Math.sin(2*Math.PI*ph);
      const env=p.flat?Math.min(1,i/(SR*.06))*Math.min(1,(n-i)/(SR*.25)):Math.min(1,i/(SR*.008))*Math.pow(1-t,1.6);
      d[start+i]+=s*env*(p.gain||.3);
    }
  });
  return d;
}
const SOUND_DEFS={
  blip:[{f:620,dur:.07,type:'triangle',gain:.25}],
  choose:[{f:660,dur:.09,type:'triangle',gain:.3},{f:990,dur:.14,type:'triangle',gain:.3,when:.07}],
  nope:[{f:240,f2:190,dur:.12,type:'triangle',gain:.25}],
  place:[{f:500,f2:900,dur:.08,gain:.3},{f:1320,dur:.18,gain:.16,when:.07},{f:1760,dur:.2,gain:.12,when:.13}],
  crunch:[{f:1,dur:.05,type:'noise',gain:.3},{f:1,dur:.04,type:'noise',gain:.2,when:.07}],
  rustle:[{f:1,dur:.28,type:'noise',gain:.14,flat:true}],
  buzz:[{f:200,f2:236,dur:.7,type:'square',gain:.035,flat:true}],
  thunder:[{f:60,f2:38,dur:1.3,type:'square',gain:.07,flat:true},{f:1,dur:1.1,type:'noise',gain:.14,flat:true}],
  knock:[{f:170,dur:.07,type:'triangle',gain:.5},{f:160,dur:.07,type:'triangle',gain:.5,when:.16}],
  beat:[{f:80,dur:.09,gain:.6},{f:70,dur:.09,gain:.5,when:.15}],
  ding:[{f:1320,dur:.3,gain:.22},{f:1760,dur:.35,gain:.2,when:.12}],
  splat:[{f:1,dur:.12,type:'noise',gain:.3},{f:180,f2:90,dur:.12,type:'triangle',gain:.3}],
  pour:[{f:1,dur:1.1,type:'noise',gain:.1,flat:true}],
  shutter:[{f:1,dur:.05,type:'noise',gain:.35},{f:1,dur:.06,type:'noise',gain:.25,when:.09}],
  hic:[{f:900,f2:1400,dur:.06,type:'triangle',gain:.3}],
  sniff:[{f:1,dur:.05,type:'noise',gain:.18},{f:1,dur:.05,type:'noise',gain:.14,when:.09}],
  rumble:[{f:70,f2:50,dur:.6,type:'square',gain:.06,flat:true},{f:90,f2:60,dur:.4,type:'triangle',gain:.14,when:.2}],
  crickets:[0,.12,.24,.8,.92,1.04].map(w=>({f:4200,dur:.05,gain:.06,when:w})),
  birdsong:[{f:2400,f2:3200,dur:.1,gain:.13},{f:3000,f2:2600,dur:.1,gain:.13,when:.14},{f:2800,f2:3600,dur:.12,gain:.13,when:.5},{f:3400,f2:3000,dur:.08,gain:.11,when:.66}],
  step:[{f:1,dur:.03,type:'noise',gain:.08}],
  whoosh:[{f:1,dur:.28,type:'noise',gain:.12,flat:true}],
  thump:[{f:110,f2:70,dur:.09,type:'triangle',gain:.5},{f:100,f2:65,dur:.09,type:'triangle',gain:.45,when:.22},{f:105,f2:68,dur:.09,type:'triangle',gain:.4,when:.44}],
  dingdong:[{f:784,dur:.5,gain:.26},{f:622,dur:.7,gain:.26,when:.35}],
  cheer:[{f:1,dur:1.2,type:'noise',gain:.15,flat:true},{f:523,dur:.2,type:'triangle',gain:.1,when:.1},{f:659,dur:.2,type:'triangle',gain:.1,when:.3},{f:784,dur:.3,type:'triangle',gain:.1,when:.5}],
  lap:[{f:600,f2:900,dur:.05,gain:.15}],
  stinky:[{f:520,f2:240,dur:.45,type:'triangle',gain:.14}],
  twinkle:[2093,2637,3136].map((f,i)=>({f,dur:.1,gain:.08,when:i*.07})),
  squeak:[{f:1300,f2:1900,dur:.09,gain:.26},{f:1500,f2:2150,dur:.1,gain:.26,when:.1}],
  pop:[{f:800,f2:1500,dur:.07,gain:.22}],
  bounce:[{f:260,f2:480,dur:.09,type:'triangle',gain:.32}],
  chirp:[{f:2600,f2:3400,dur:.08,gain:.18},{f:2700,f2:3500,dur:.08,gain:.18,when:.13}],
  happy:[523,659,784,1047].map((f,i)=>({f,dur:.16,type:'triangle',gain:.24,when:i*.08})),
  fanfare:[523,659,784,1047,784,1047].map((f,i)=>({f,dur:i===5?.5:.16,type:'triangle',gain:.26,when:i*.12})),
  sparkle:[1319,1568,2093].map((f,i)=>({f,dur:.12,gain:.16,when:i*.06})),
  lullaby:[523,392,440,392,330].map((f,i)=>({f,dur:.5,gain:.22,when:i*.5})),
  tick:[{f:2000,dur:.02,gain:.12}],
  beep1:[{f:440,dur:.12,gain:.28}], beep2:[{f:554,dur:.12,gain:.28}], beep3:[{f:659,dur:.12,gain:.28}], beep4:[{f:880,dur:.12,gain:.28}],
  /* Outings: a friendly car horn, scissors, the dryer, the register at the pet store. */
  honk:[{f:440,dur:.13,type:'square',gain:.07},{f:554,dur:.13,type:'square',gain:.06},{f:440,dur:.16,type:'square',gain:.07,when:.2},{f:554,dur:.16,type:'square',gain:.06,when:.2}],
  snip:[{f:1,dur:.025,type:'noise',gain:.2},{f:3400,f2:2600,dur:.03,gain:.08}],
  dryer:[{f:1,dur:1.4,type:'noise',gain:.06,flat:true},{f:190,f2:205,dur:1.4,type:'triangle',gain:.035,flat:true}],
  register:[{f:1568,dur:.1,gain:.16},{f:2093,dur:.32,gain:.16,when:.09},{f:1,dur:.05,type:'noise',gain:.12,when:.02}]
};

/* ---- Recordings: drop dog-bark-baby.wav, dog-bark.wav, cat-purr.wav and so on into sounds/ ----
   A file named for a life stage (baby, teen, adult, senior) is used at that stage; a file without one is
   used at every stage that has no file of its own. */
const RECORDED={};
/* The recordings that are in sounds/ now. They are used from the very first sound, without waiting for the
   browser to find them (it can be slow, or never report back, in some setups). Any other file dropped into
   sounds/ is still found by the check below. */
const RECORDINGS=['dog.bark.baby','dog.bark.teen','dog.bark.adult','dog.bark.senior','dog.barkHappy.baby','dog.barkHappy.teen','dog.barkHappy.adult','dog.barkHappy.senior',
  'dog.barkFriendly.baby','dog.barkFriendly.teen','dog.barkFriendly.adult','dog.barkFriendly.senior','dog.pant','dog.yawn','cat.meow','cat.meowSad','cat.purr','cat.purrShort','cat.yawn'];
RECORDINGS.forEach(id=>{ const [k,v,sg]=id.split('.'); RECORDED[id]='sounds/'+k+'-'+v.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+(sg?'-'+sg:'')+'.wav'; });
(function probeRecordings(){
  Object.keys(VOICES).forEach(k=>Object.keys(VOICES[k]).forEach(v=>[null,'baby','teen','adult','senior'].forEach(sg=>{
    const url='sounds/'+k+'-'+v.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+(sg?'-'+sg:'')+'.wav', id=k+'.'+v+(sg?'.'+sg:'');
    try{ const a=new Audio(); a.preload='auto'; a.addEventListener('canplaythrough',()=>{ RECORDED[id]=url; },{once:true}); a.addEventListener('error',()=>{},{once:true}); a.src=url; }catch(e){}
  })));
})();
/* With no friendly-bark recording for a stage, the happy-bark recording stands in (a puppy has no
   friendly recording, so it greets with its excited yips). */
const REC_FALLBACK={barkFriendly:'barkHappy'};
function recordingFor(kd,v,sg){ for(const x of [v,REC_FALLBACK[v]]){ if(!x) continue; if(RECORDED[kd+'.'+x+'.'+sg]) return kd+'.'+x+'.'+sg; if(RECORDED[kd+'.'+x]) return kd+'.'+x; } return null; }

/* ---- Playback ---- */
const SOUND_URL={}, SA=()=>(window.SafeAudio&&window.SafeAudio.preload&&window.SafeAudio.play)?window.SafeAudio:null, saLoaded={};
const STAGE_NAMES=['baby','teen','adult','senior'];
function voiceKey(kd,v,sg){ const def=VOICES[kd]&&VOICES[kd][v]; if(!def) return null; const rec=recordingFor(kd,v,sg); if(rec) return 'rec:'+rec; return kd+'.'+v+'.'+sg+'.'+Math.floor(Math.random()*def.n); }
function urlFor(key){
  if(SOUND_URL[key]) return SOUND_URL[key];
  try{
    if(key.startsWith('rec:')) return SOUND_URL[key]=RECORDED[key.slice(4)];
    const bits=key.split('.');
    if(bits.length===4){ const def=VOICES[bits[0]][bits[1]], P=VOICE_P[bits[0]][bits[2]]; return SOUND_URL[key]=toWavURI(def.make(P)); }
    if(SOUND_DEFS[key]) return SOUND_URL[key]=toWavURI(synthParts(SOUND_DEFS[key]));
  }catch(e){ console.warn('[PetPals] sound failed',key,e); }
  return null;
}
/* Names: 'blip' (an effect), 'pet:bark' (the player's pet at its stage), 'dog:bark:baby' (anyone else). */
function resolveSound(name){
  if(name.startsWith('pet:')){ if(typeof state==='undefined'||!state) return null; return voiceKey(kind(),name.slice(4),stageName()); }
  const m=name.split(':'); if(m.length===3) return voiceKey(m[0],m[1],m[2]);
  return SOUND_DEFS[name]?name:null;
}
function play(name,vol){
  if(!gs.sound) return; const key=resolveSound(name); if(!key) return; const url=urlFor(key); if(!url) return; vol=vol==null?.7:vol;
  const sa=SA(); if(sa){ try{ const id='petpals-'+key; if(!saLoaded[id]){ sa.preload(id,url); saLoaded[id]=1; } sa.play(id,vol); }catch(e){} return; }
  try{ const a=new Audio(url); a.volume=clamp(vol,0,1); const p=a.play(); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
}
/* Build a pet's voices ahead of time, a few at a time, so the first bark has no delay. */
function warmVoices(kd,sg){
  const jobs=[]; Object.keys(VOICES[kd]).forEach(v=>{ if(recordingFor(kd,v,sg)) return; for(let i=0;i<VOICES[kd][v].n;i++) jobs.push(kd+'.'+v+'.'+sg+'.'+i); });
  Object.keys(SOUND_DEFS).forEach(k=>jobs.push(k));
  const idle=window.requestIdleCallback?cb=>requestIdleCallback(cb,{timeout:600}):cb=>setTimeout(cb,30);
  const step=()=>{ const t0=performance.now(); while(jobs.length&&performance.now()-t0<12) urlFor(jobs.shift()); if(jobs.length) idle(step); };
  step();
}
