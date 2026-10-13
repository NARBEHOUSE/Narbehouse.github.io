'use strict';
/* ================= Background music =================
   Cheerful, cozy music made right here, like the sound effects: five bright songs for home that play
   one after another in a loop, a bouncy one for a dog's walk and a tiptoe one for a cat exploring.
   - Songs are built a little at a time while the game is idle, then played as ordinary audio
     (HTML5 audio only, like the rest of the hub).
   - It is quiet on purpose, and quieter still while text to speech is reading, so every word is clear.
     The quietness is built into the recording too, because phones and tablets ignore volume settings.
   - Settings: Music Off / Soft / Medium. Recordings dropped into sounds/ replace the made-up songs
     (see sounds/SOUNDS.md). */
const midiF=m=>440*Math.pow(2,(m-69)/12);
function seeded(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
/* Loudness is set by the average, not the loudest moment, and kept even through each song.
   MUSIC_RMS is the steady level baked into every song, MUSIC_CEIL the most any moment may reach.
   Off / Soft / Medium. Both lowered after testing on a Surface tablet, where Soft covered the speech. */
const MUSIC_RMS=.045, MUSIC_CEIL=.26, MUSIC_VOL=[0,.225,.55], MUSIC_DUCK=.35;
/* Even loudness: measure every half second, smooth the differences over a few seconds (so it never
   pumps), and bring each part to the same level, so no section of a song is louder than the rest. */
function levelOut(d,target){ const blk=Math.round(.5*MSR), nb=Math.ceil(d.length/blk), g=new Float32Array(nb);
  for(let b=0;b<nb;b++){ let s=0, c=0; for(let i=b*blk;i<Math.min(d.length,(b+1)*blk);i++){ s+=d[i]*d[i]; c++; } g[b]=Math.sqrt(s/Math.max(1,c)); }
  const sm=new Float32Array(nb); for(let b=0;b<nb;b++){ let s=0, c=0; for(let k=-3;k<=3;k++){ const j=b+k; if(j>=0&&j<nb&&g[j]>1e-4){ s+=g[j]; c++; } } sm[b]=c?s/c:0; }
  for(let b=0;b<nb;b++) g[b]=sm[b]>1e-4?clamp(target/sm[b],.35,3):1;
  for(let i=0;i<d.length;i++){ const x=i/blk-.5, b0=clamp(Math.floor(x),0,nb-1), b1=Math.min(nb-1,b0+1), f=clamp(x-b0,0,1); d[i]*=g[b0]*(1-f)+g[b1]*f; } }
const CHORD={maj7:[0,4,7,11],m7:[0,3,7,10],six:[0,4,7,9],m6:[0,3,7,9],sus:[0,5,7,10],dom7:[0,4,7,10],add9:[0,4,7,14],maj:[0,4,7,12],min:[0,3,7,12],lyd:[0,2,6,9]};

/* ---- Instruments: each adds one note into a buffer ----
   Music is made at 16,000 samples a second. Each note is a few sine partials made by rotation (no
   Math.sin per sample), each with its own fade, under an attack, a decay and a release. */
const MSR=16000;
function voiceNote(out,t,f,len,v,o){ const n0=Math.max(0,Math.round(t*MSR)), att=Math.max(1,Math.round((o.att||.005)*MSR)), relN=Math.max(1,Math.round((o.rel||.3)*MSR)), lenN=Math.round(len*MSR);
  const N=Math.min(out.length-n0,lenN+relN); if(N<=0) return;
  const P=o.parts.map(([mul,amp,dk,ph])=>{ const w=TAU*f*mul/MSR; return {cs:Math.cos(w),sn:Math.sin(w),s:Math.sin(ph||0),c:Math.cos(ph||0),a:amp,k:Math.exp(-(dk||0)/MSR),e:1}; });
  const kd=Math.exp(-(o.dk||0)/MSR), np=P.length; let env=1;
  for(let i=0;i<N;i++){ let x=0; for(let j=0;j<np;j++){ const p=P[j], ns=p.s*p.cs+p.c*p.sn; p.c=p.c*p.cs-p.s*p.sn; p.s=ns; x+=ns*p.a*p.e; p.e*=p.k; }
    env*=kd; const a=i<att?i/att:1, r=i>lenN?1-(i-lenN)/relN:1; out[n0+i]+=v*a*env*r*x; } }
function mixInto(out,t,dur,fn){ const n0=Math.max(0,Math.round(t*MSR)), n=Math.min(out.length-n0,Math.ceil(dur*MSR)); for(let i=0;i<n;i++) out[n0+i]+=fn(i/MSR); }
/* Soft electric piano: a round tone with a little bell on the attack. */
function ePiano(out,t,m,len,v){ const f=midiF(m); voiceNote(out,t,f,len,v,{att:.007,dk:1.4+f/900,rel:.45,parts:[[1,1],[2,.3,9],[4,.14,12]]}); }
/* Warm pad: two slightly detuned voices per note that swell in and fade out. */
function padChord(out,t,notes,len,v){ notes.forEach((m,k)=>{ const f=midiF(m); voiceNote(out,t,f,len,v,{att:.8,rel:1.3,parts:[[.9975,1,0,k*1.7],[1.0025,1,0,k*1.7+2],[2.9925,.1],[3.0075,.1]]}); }); }
function bassNote(out,t,m,len,v){ voiceNote(out,t,midiF(m),len,v,{att:.014,dk:1.1,rel:.3,parts:[[1,1],[2,.3,5]]}); }
/* Marimba-like pluck, for the walk and the explore songs. */
function pluck(out,t,m,v,dk){ voiceNote(out,t,midiF(m),.9,v,{att:.0025,rel:.15,parts:[[1,1,dk||5],[3.98,.3,24]]}); }
function bell(out,t,m,v){ voiceNote(out,t,midiF(m),1.4,v,{att:.002,dk:3.2,rel:.15,parts:[[1,1],[2.76,.35,6]]}); }
function shaker(out,t,v,rnd){ let p=0; mixInto(out,t,.08,tt=>{ const n=rnd()*2-1, x=n-p; p=n; return v*Math.min(1,tt*500)*Math.exp(-tt*60)*x; }); }
function thump(out,t,v){ mixInto(out,t,.22,tt=>v*Math.sin(TAU*(52*tt+1.4*(1-Math.exp(-tt*28))))*Math.exp(-tt*16)); }
function lowPassM(d,fc){ const a=Math.exp(-TAU*fc/MSR); let y=0; for(let i=0;i<d.length;i++){ y=(1-a)*d[i]+a*y; d[i]=y; } return d; }
/* A soft finger snap for the back beat. */
function fingerSnap(out,t,v,rnd){ let p=0,q=0; mixInto(out,t,.06,tt=>{ const n=rnd()*2-1, x=n-p; p=n; q=q*.5+x*.5; return v*Math.min(1,tt*900)*Math.exp(-tt*70)*(x+q); }); }
/* ---- Songs ----
   chords: [semitones up from the key, chord shape]. form: the order of 4-bar sections.
   The mood is cheerful and cozy: a skipping tempo, a bouncy bass, light off-beat chords, soft
   percussion kept in the background, and a tune with a little glockenspiel sparkle on top. */
const SONGS={
  home1:{title:'Sunny Morning',key:60,bpm:100,beats:4,seed:11,form:['A','A2','B','A2','B2','A2'],
    A:[[0,'maj'],[9,'m7'],[5,'maj7'],[7,'maj']], B:[[5,'maj7'],[7,'six'],[4,'m7'],[7,'dom7']]},
  home2:{title:'Tail Wags',key:65,bpm:108,beats:4,seed:23,form:['A','A2','B','A2','B2','A2'],
    A:[[0,'maj'],[9,'m7'],[5,'maj'],[7,'dom7']], B:[[2,'m7'],[7,'maj'],[4,'m7'],[7,'sus']]},
  /* Two more for home, in the same easygoing mood: a relaxed, skipping tempo (102 and 104), never rushed
     and never sleepy, with warm chords and a gentle tune. */
  home4:{title:'Cozy Corner',key:62,bpm:102,beats:4,seed:53,form:['A','A2','B','A2','B2','A2'],
    A:[[0,'maj'],[4,'m7'],[5,'maj'],[7,'dom7']], B:[[9,'m7'],[5,'maj7'],[2,'m7'],[7,'sus']]},
  home5:{title:'Garden Breeze',key:58,bpm:104,beats:4,seed:61,lead:'bell',form:['A','A2','B','A2','B2','A2'],
    A:[[0,'maj7'],[2,'m7'],[5,'maj'],[7,'six']], B:[[5,'maj7'],[4,'m7'],[9,'m7'],[7,'dom7']]},
  home3:{title:'Happy Paws',key:55,bpm:138,beats:3,seed:37,form:['A','A2','B','A2','A','A2','B2','A2'],
    A:[[0,'maj'],[5,'maj'],[7,'dom7'],[0,'maj']], B:[[9,'m7'],[2,'m7'],[5,'maj'],[7,'dom7']]},
  walk:{title:'Walkies',key:55,bpm:112,beats:4,seed:5,loop:true,style:'walk',form:['A','A2','B','A2'],
    A:[[0,'maj'],[5,'maj'],[7,'maj'],[0,'maj']], B:[[9,'min'],[5,'maj'],[2,'min'],[7,'dom7']]},
  explore:{title:'Tiptoe',key:53,bpm:100,beats:4,seed:19,loop:true,style:'explore',form:['A','A2','B','A2'],
    A:[[0,'maj7'],[2,'lyd'],[4,'m7'],[9,'m7']], B:[[2,'m7'],[7,'six'],[0,'maj7'],[7,'sus']]},
  /* A song for each place (they loop while the pet is there). groove: the rhythm; lead: the tune's sound. */
  car:{title:'Road Trip',key:57,bpm:116,beats:4,seed:41,loop:true,groove:'drive',lead:'pluck',form:['A','A2','B','A2'],
    A:[[0,'maj'],[7,'maj'],[9,'min'],[5,'maj']], B:[[5,'maj'],[7,'maj'],[4,'min'],[9,'min']]},
  store:{title:'Shop Hop',key:62,bpm:112,beats:4,seed:43,loop:true,groove:'home',lead:'ep',form:['A','A2','B','A2'],
    A:[[0,'maj'],[5,'maj'],[9,'m7'],[7,'maj']], B:[[5,'maj7'],[4,'m7'],[2,'m7'],[7,'dom7']]},
  groomer:{title:'Bubble Bath',key:64,bpm:104,beats:4,seed:47,loop:true,groove:'home',lead:'bell',form:['A','A2','B','A2'],
    A:[[0,'maj7'],[5,'maj7'],[0,'maj7'],[7,'six']], B:[[9,'m7'],[5,'maj7'],[2,'m7'],[7,'sus']]},
  vet:{title:'Gentle Checkup',key:60,bpm:88,beats:4,seed:53,loop:true,groove:'calm',lead:'ep',form:['A','A2','B','A2'],
    A:[[0,'maj7'],[9,'m7'],[5,'maj7'],[7,'six']], B:[[5,'maj7'],[4,'m7'],[2,'m7'],[7,'sus']]},
  yard:{title:'Sunny Yard',key:67,bpm:100,beats:4,seed:59,loop:true,groove:'explore',lead:'pluck',form:['A','A2','B','A2'],
    A:[[0,'maj'],[5,'maj'],[0,'maj'],[7,'maj']], B:[[9,'min'],[5,'maj'],[2,'min'],[7,'dom7']]},
  friend:{title:'Playdate',key:65,bpm:120,beats:4,seed:61,loop:true,groove:'walk',lead:'ep',form:['A','A2','B','A2'],
    A:[[0,'maj'],[9,'min'],[5,'maj'],[7,'maj']], B:[[2,'min'],[7,'maj'],[0,'maj'],[7,'dom7']]},
  bank:{title:'Counter Swing',key:58,bpm:96,beats:4,seed:67,loop:true,groove:'calm',lead:'bell',form:['A','A2','B','A2'],
    A:[[2,'m7'],[7,'dom7'],[0,'maj7'],[9,'m7']], B:[[5,'maj7'],[4,'m7'],[2,'m7'],[7,'dom7']]},
  /* Seasonal and holiday songs. */
  holiday:{title:'Twinkle Lights',key:62,bpm:120,beats:3,seed:73,loop:true,groove:'waltz',lead:'bell',form:['A','A2','B','A2'],
    A:[[0,'maj'],[5,'maj'],[7,'dom7'],[0,'maj']], B:[[9,'min'],[5,'maj'],[7,'dom7'],[0,'maj']]},
  spooky:{title:'Pumpkin Parade',key:57,bpm:108,beats:4,seed:79,loop:true,groove:'explore',lead:'pluck',scale:[0,3,5,7,10],form:['A','A2','B','A2'],
    A:[[0,'min'],[5,'min'],[7,'dom7'],[0,'min']], B:[[8,'maj'],[3,'maj'],[7,'dom7'],[0,'min']]},
  snow:{title:'Snowflakes',key:64,bpm:92,beats:4,seed:83,loop:true,groove:'calm',lead:'bell',form:['A','A2','B','A2'],
    A:[[0,'maj7'],[9,'m7'],[5,'maj7'],[7,'sus']], B:[[5,'maj7'],[4,'m7'],[2,'m7'],[7,'six']]},
  fest:{title:'Blossom Day',key:67,bpm:112,beats:4,seed:89,loop:true,groove:'home',lead:'ep',form:['A','A2','B','A2'],
    A:[[0,'maj'],[5,'maj'],[9,'m7'],[7,'maj']], B:[[5,'maj7'],[7,'six'],[4,'m7'],[7,'dom7']]},
  school:{title:'Class Is In',key:65,bpm:108,beats:4,seed:97,loop:true,groove:'walk',lead:'bell',form:['A','A2','B','A2'],
    A:[[0,'maj'],[7,'maj'],[9,'min'],[5,'maj']], B:[[2,'m7'],[7,'dom7'],[0,'maj7'],[7,'sus']]},
  camp:{title:'Campfire Waltz',key:60,bpm:104,beats:3,seed:101,loop:true,groove:'waltz',lead:'pluck',form:['A','A2','B','A2'],
    A:[[0,'maj'],[5,'maj'],[0,'maj'],[7,'dom7']], B:[[9,'min'],[5,'maj'],[2,'m7'],[7,'dom7']]},
  rain:{title:'Raindrops',key:57,bpm:84,beats:4,seed:71,loop:true,groove:'calm',lead:'pluck',form:['A','A2','B','A2'],
    A:[[9,'m7'],[5,'maj7'],[0,'maj7'],[7,'six']], B:[[5,'maj7'],[7,'six'],[4,'m7'],[9,'m7']]}
};
const voicing=(key,[deg,q])=>{ let r=key+deg; while(r>57) r-=12; while(r<48) r+=12; return {root:r,notes:CHORD[q].map(i=>r+i)}; };
const PENTA=[0,2,4,7,9];
/* A melody that moves mostly by step and lands on chord notes on the strong beats. */
function melodyBars(song,chords,rnd,lift,cadence){
  const scale=[]; for(let o=-1;o<3;o++) (song.scale||PENTA).forEach(p=>{ const m=song.key+12+o*12+p; if(m>=song.key+5&&m<=song.key+31) scale.push(m); });
  const pats=song.beats===3?[[2,1,1,2],[1,1,2,2],[3,1,2],[2,2,2],[-1,1,2,2]]
    :song.style?[[1,1,2,-2,2],[2,-1,1,2,2],[1,1,1,1,-2,2],[2,2,-2,2],[-1,1,2,1,1,2]]
    :[[1,1,2,1,1,2],[2,1,1,2,2],[1,1,1,1,2,2],[3,1,2,2],[2,2,1,1,2],[-1,1,2,2,2],[2,1,1,4]];
  let idx=Math.floor(scale.length/2)+lift; const bars=[];
  chords.forEach((c,b)=>{ const pcs=voicing(song.key,c).notes.map(n=>n%12), notes=[], last=b===chords.length-1;
    const pat=last&&cadence?(song.beats===3?[2,4]:[2,2,4]):pats[Math.floor(rnd()*pats.length)];
    let pos=0; pat.forEach((d,k)=>{ if(d<0){ pos-=d; return; }
      idx+=[-2,-1,-1,0,1,1,2][Math.floor(rnd()*7)]; const mid=Math.floor(scale.length/2)+lift; if(idx>mid+4) idx-=2; if(idx<mid-4) idx+=2; idx=clamp(idx,0,scale.length-1);
      if(pos%4===0){ let best=idx, bd=99; scale.forEach((m,i)=>{ if(pcs.includes(m%12)&&Math.abs(i-idx)<bd){ bd=Math.abs(i-idx); best=i; } }); idx=best; }
      if(last&&cadence&&k===pat.length-1){ idx=scale.reduce((a,m,i)=>(m%12===song.key%12&&Math.abs(i-idx)<Math.abs(a-idx))?i:a,idx); }
      notes.push({pos,d,m:scale[idx],v:(pos%2?.19:.23)+rnd()*.04}); pos+=d; });
    bars.push(notes); });
  return bars; }
/* Builds a song a few notes at a time (a generator), so the game never stutters while it works. */
function* buildSong(song){
  const beat=60/song.bpm, bar=beat*song.beats, e8=beat/2, perc=seeded(song.seed+99), home=!song.style, three=song.beats===3;
  const intro=song.loop?0:1, nBars=intro+song.form.length*4, body=nBars*bar, tail=song.loop?0:3;
  const L=Math.ceil((body+tail+2)*MSR), mel=new Float32Array(L), pad=new Float32Array(L), low=new Float32Array(L), hit=new Float32Array(L);
  const A=melodyBars(song,song.A,seeded(song.seed*7),0,false), A2=A.slice(0,3).concat(melodyBars(song,song.A,seeded(song.seed*7),0,true).slice(3));
  const MEL={A,A2,B:melodyBars(song,song.B,seeded(song.seed*13),2,true),B2:melodyBars(song,song.B,seeded(song.seed*17),3,true)};
  /* The groove under a bar: bass, off-beat chords, soft percussion. */
  const gv=song.groove||(home?(three?'waltz':'home'):song.style), lead=song.lead||(home?'ep':song.style==='walk'?'pluck':'soft');
  const groove=(t0,c,lift)=>{
    if(gv==='home'){ padChord(pad,t0,c.notes,bar,.026);
      [[0,0,1.3],[3,0,.7],[4,7,1.3],[6,12,.7]].forEach(([p,iv,ln])=>bassNote(low,t0+p*e8,c.root-12+iv,beat*ln*.5,.3));
      [1,3,5,7].forEach(p=>c.notes.slice(1).forEach(n=>ePiano(hit,t0+p*e8,n+12,e8*.4,.02)));
      for(let k=0;k<8;k++){ shaker(hit,t0+k*e8,k%2?.032:.018,perc); if(k===0||k===4) thump(hit,t0+k*e8,.15); if(k===2||k===6) fingerSnap(hit,t0+k*e8,.055,perc); }
      if(lift) for(let k=0;k<8;k++) pluck(mel,t0+k*e8,c.notes[[0,1,2,3,2,1,2,3][k]]+24,.045,7); }
    else if(gv==='waltz'){ padChord(pad,t0,c.notes,bar,.024);
      bassNote(low,t0,c.root-12,beat*.9,.32); bassNote(low,t0+2*beat,c.root-12+7,beat*.4,.16);
      [1,2].forEach(k=>c.notes.slice(1).forEach(n=>ePiano(hit,t0+k*beat,n+12,beat*.35,.026)));
      for(let k=0;k<6;k++){ shaker(hit,t0+k*e8,k%2?.03:.016,perc); } thump(hit,t0,.14); fingerSnap(hit,t0+2*beat,.04,perc);
      if(lift) for(let k=0;k<6;k++) pluck(mel,t0+k*e8,c.notes[[0,1,2,3,2,1][k]]+24,.045,7); }
    else if(gv==='walk'){ padChord(pad,t0,c.notes,bar,.022);
      [0,7,12,7].forEach((iv,k)=>bassNote(low,t0+k*beat,c.root-12+iv,beat*.55,.3));
      for(let k=0;k<8;k++){ if(k%2) shaker(hit,t0+k*e8,.05,perc); if(k===0||k===4) thump(hit,t0+k*e8,.22); if(k===2||k===6) fingerSnap(hit,t0+k*e8,.05,perc); } }
    /* drive: a steady eighth-note bass for the car. calm: a soft rocking arpeggio, hardly any drums. */
    else if(gv==='drive'){ padChord(pad,t0,c.notes,bar,.02);
      [0,12,0,12,7,12,0,12].forEach((iv,k)=>bassNote(low,t0+k*e8,c.root-12+iv,e8*.7,.24));
      for(let k=0;k<8;k++){ if(k%2) shaker(hit,t0+k*e8,.04,perc); if(k===0||k===4) thump(hit,t0+k*e8,.18); if(k===2||k===6) fingerSnap(hit,t0+k*e8,.045,perc); } }
    else if(gv==='calm'){ padChord(pad,t0,c.notes,bar,.032); bassNote(low,t0,c.root-12,bar*.8,.28);
      for(let k=0;k<8;k++) ePiano(hit,t0+k*e8,c.notes[[0,1,2,3,2,1,2,1][k]]+12,e8*.9,.018);
      shaker(hit,t0+2*beat,.018,perc); shaker(hit,t0+6*e8,.018,perc); }
    else { padChord(pad,t0,c.notes,bar,.03);
      [0,2].forEach(k=>bassNote(low,t0+k*beat,c.root-12+(k?7:0),beat*.35,.28));
      for(let k=0;k<8;k++) if(k===2||k===6) shaker(hit,t0+k*e8,.04,perc);
      bell(hit,t0+3.5*beat,c.notes[3]+24,.045); } };
  if(intro){ groove(0,voicing(song.key,song.A[0]),false); yield; }
  for(let si=0;si<song.form.length;si++){ const sec=song.form[si], chords=song[sec[0]], mb=MEL[sec], lift=sec[0]==='B';
    for(let b=0;b<4;b++){ const t0=(intro+si*4+b)*bar, c=voicing(song.key,chords[b]);
      groove(t0,c,lift); yield;
      mb[b].forEach(n=>{ const t=t0+n.pos*e8;
        if(lead==='ep'){ ePiano(mel,t,n.m,n.d*e8*.8,n.v); pluck(mel,t,n.m+12,n.v*.28,6); }
        else if(lead==='bell'){ bell(mel,t,n.m+12,n.v*.42); pluck(mel,t,n.m,n.v*.55,6); }
        else if(lead==='pluck') pluck(mel,t,n.m,n.v*1.15,6);
        else pluck(mel,t,n.m,n.v*.95,4.2); });
      yield; } }
  /* Mix: soften the pad and bass, give the tune a light echo, keep it all low and smooth. */
  lowPassM(pad,1400); lowPassM(low,1000); yield;
  const d=Math.round(beat*.75*MSR); for(let i=d;i<L;i++) mel[i]+=mel[i-d]*.2; yield;
  const out=new Float32Array(L); for(let i=0;i<L;i++) out[i]=mel[i]+pad[i]+low[i]*.9+hit[i]*.75;
  normalize(out,.5);
  const n=song.loop?Math.round(body*MSR):L;
  if(song.loop){ for(let i=n;i<L;i++) out[i-n]+=out[i]; } /* wrap the tail round so the loop is seamless */
  const res=out.subarray(0,n), bodyN=Math.min(n,Math.round(body*MSR));
  levelOut(res.subarray(0,bodyN),MUSIC_RMS); yield;
  /* The last notes ring out at the level the song ended on. */
  if(bodyN<n){ let s=0; const k=Math.round(.5*MSR); for(let i=bodyN-k;i<bodyN;i++) s+=res[i]*res[i]; const endR=Math.sqrt(s/k);
    let t=0; for(let i=bodyN;i<Math.min(n,bodyN+k);i++) t+=res[i]*res[i]; const tailR=Math.sqrt(t/k)||1; const gT=clamp(endR/tailR,.2,3); for(let i=bodyN;i<n;i++) res[i]*=gT; }
  for(let i=0;i<res.length;i++){ const x=res[i]; res[i]=MUSIC_CEIL*Math.tanh(x/MUSIC_CEIL); } /* round off any peak gently */
  if(!song.loop){ const f=Math.round(1.5*MSR); for(let i=0;i<f;i++) res[res.length-1-i]*=i/f; }
  yield;
  return wavBlobURL(res); }
function wavBlobURL(d){ const len=d.length, buf=new ArrayBuffer(44+len*2), v=new DataView(buf), w=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  w(0,'RIFF'); v.setUint32(4,36+len*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,MSR,true); v.setUint32(28,MSR*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,len*2,true);
  for(let i=0;i<len;i++) v.setInt16(44+i*2,clamp(d[i],-1,1)*32767,true);
  return URL.createObjectURL(new Blob([buf],{type:'audio/wav'})); }

/* ---- Building the songs in the background ---- */
const MUSIC_URL={}, MUSIC_FILE={};
(function probeMusicFiles(){ ['home1','home2','home3','home4','home5','walk','explore'].forEach(id=>{ const url='sounds/music-'+id+'.mp3';
  try{ const a=new Audio(); a.preload='metadata'; a.addEventListener('canplaythrough',()=>{ MUSIC_FILE[id]=url; },{once:true}); a.addEventListener('error',()=>{},{once:true}); a.src=url; }catch(e){} }); })();
const musicJobs=[]; let musicBusy=false;
function queueMusic(ids){ ids.forEach(id=>{ if(!MUSIC_URL[id]&&!musicJobs.some(j=>j.id===id)) musicJobs.push({id,gen:buildSong(SONGS[id])}); }); if(!musicBusy) musicStep(); }
function musicStep(){ musicBusy=true; const idle=window.requestIdleCallback?cb=>requestIdleCallback(cb,{timeout:400}):cb=>setTimeout(cb,20);
  const t0=performance.now();
  while(musicJobs.length&&performance.now()-t0<10){ const j=musicJobs[0]; let r; try{ r=j.gen.next(); }catch(e){ console.warn('[PetPals] music failed',j.id,e); musicJobs.shift(); continue; }
    if(r.done){ MUSIC_URL[j.id]=r.value; musicJobs.shift(); musicTick(); } }
  if(musicJobs.length) idle(musicStep); else musicBusy=false; }
const trackURL=id=>MUSIC_FILE[id]||MUSIC_URL[id]||null;

/* ---- Playing: home songs in turn; the walk or explore song while that scene plays ---- */
const HOME_SONGS=['home1','home2','home3','home4','home5'];
/* At home, a holiday song joins the five during the December holidays and Halloween. */
function homeSongs(){ const h=typeof calHoliday==='function'?calHoliday():null; return h==='christmas'?['holiday'].concat(HOME_SONGS):h==='halloween'?['spooky'].concat(HOME_SONGS):HOME_SONGS; }
const mus={home:null,scene:null,homeIdx:0,homeGain:0,sceneGain:0,sceneId:null,blocked:false,duck:1};
function musicEl(loop){ const a=new Audio(); a.loop=!!loop; a.preload='auto'; return a; }
function tryPlay(a){ if(!a||!a.src||!a.paused) return; const p=a.play(); if(p&&p.catch) p.catch(()=>{ mus.blocked=true; }); }
function musicTick(){
  const level=MUSIC_VOL[gs.music|0]||0;
  if(!level||document.hidden){ [mus.home,mus.scene].forEach(a=>{ if(a&&!a.paused) a.pause(); }); return; }
  if(!mus.home){ mus.home=musicEl(false); mus.home.addEventListener('ended',()=>{ mus.homeIdx=(mus.homeIdx+1)%homeSongs().length; mus.home.removeAttribute('src'); musicTick(); }); }
  if(!mus.scene) mus.scene=musicEl(true);
  const tripId=typeof tripSong==='function'?tripSong():null;
  const sceneId=tripId&&SONGS[tripId]?tripId:(typeof anim!=='undefined'&&anim&&state&&(anim.type==='walk'||anim.type==='explore'))?anim.type:null, sceneReady=sceneId&&trackURL(sceneId);
  if(sceneId&&!trackURL(sceneId)) queueMusic([sceneId]);
  const wantDuck=(typeof narrating==='function'&&narrating())?MUSIC_DUCK:1; mus.duck+=wantDuck<mus.duck?Math.max(wantDuck-mus.duck,-.2):Math.min(wantDuck-mus.duck,.035);
  const duck=mus.duck, pausedDim=(typeof layer!=='undefined'&&layer!=='game')?.8:1, step=.07;
  /* Home song: pick up the next one that's ready. */
  if(!mus.home.getAttribute('src')){ const HS=homeSongs(); mus.homeIdx%=HS.length; HS.forEach(id=>{ if(!trackURL(id)&&SONGS[id]) queueMusic([id]); }); let tries=0; while(tries<HS.length&&!trackURL(HS[mus.homeIdx])){ mus.homeIdx=(mus.homeIdx+1)%HS.length; tries++; } const u=trackURL(HS[mus.homeIdx]); if(u) mus.home.src=u; }
  if(sceneReady&&mus.sceneId!==sceneId){ mus.scene.src=trackURL(sceneId); mus.sceneId=sceneId; mus.sceneGain=0; }
  const wantHome=sceneReady?0:1, wantScene=sceneReady?1:0;
  mus.homeGain+=clamp(wantHome-mus.homeGain,-step,step); mus.sceneGain+=clamp(wantScene-mus.sceneGain,-step*1.4,step*1.4);
  const setV=(a,g)=>{ try{ a.volume=clamp(g*level*duck*pausedDim,0,1); }catch(e){} };
  if(mus.homeGain>.001){ setV(mus.home,mus.homeGain); tryPlay(mus.home); } else if(!mus.home.paused) mus.home.pause();
  if(mus.sceneGain>.001&&mus.scene.src){ setV(mus.scene,mus.sceneGain); tryPlay(mus.scene); } else if(!mus.scene.paused){ mus.scene.pause(); if(!sceneId){ mus.scene.currentTime=0; mus.sceneId=null; } } }
setInterval(musicTick,120);
/* Browsers only let audio start after the player presses something. */
['keydown','pointerdown'].forEach(ev=>document.addEventListener(ev,()=>{ if(mus.blocked){ mus.blocked=false; [mus.home,mus.scene].forEach(a=>{ if(a&&a.src&&a.paused&&a.volume>0) tryPlay(a); }); } musicTick(); },true));
document.addEventListener('visibilitychange',musicTick);
/* The first home song is made first, then the pet's walk or explore song, then the others. */
function warmMusic(kd){ queueMusic(['home1',kd==='cat'?'explore':'walk','home2','home3','home4','home5',kd==='cat'?'walk':'explore']); }
