/* Shared browser client for Benny's Hub BYOK. Stores only revocable app tokens, never provider keys. */
(function(){
'use strict';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
window.NarbeByok={create({endpoint,app}){
 const base=new URL(endpoint).origin,storageKey='benny-byok-v1:'+base+':'+app;
 let opening=false;
 function connection(){try{const c=JSON.parse(localStorage.getItem(storageKey));return c&&/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(c.token)&&c.expiresAt>Date.now()?c:null;}catch{return null;}}
 function clear(){localStorage.removeItem(storageKey);window.dispatchEvent(new Event('byok-change'));}
 async function request(path,body,signal,method){
  const c=connection();const response=await fetch(base+'/api/byok/v1'+path,{method:method||(body?'POST':'GET'),mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{...(body?{'Content-Type':'application/json'}:{}),...(c?{Authorization:'Bearer '+c.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});
  const data=await response.json();if(!response.ok){if(response.status===401)clear();throw Error(data.error||'The key service could not complete the request.');}return data;
 }
 async function connect(){
  if(opening)throw Error('Key setup is already open.');
  const popup=window.open('about:blank','benny-byok-setup','popup,width=760,height=900');
  if(!popup)throw Error('Allow the key setup window, then choose Connect again.');
  opening=true;const verifier=random(),state=random();
  try{
   const challenge=await hash(verifier);
   return await new Promise((resolve,reject)=>{
    let receiving=false,finished=false;
    const done=(error,data)=>{if(finished)return;finished=true;clearInterval(poll);clearTimeout(timer);window.removeEventListener('message',message);error?reject(error):resolve(data);};
    const message=async event=>{
     if(event.origin!==base||event.source!==popup||event.data?.type!=='benny-byok-code'||event.data.state!==state||receiving)return;
     receiving=true;clearTimeout(timer);
     try{
      const data=await request('/exchange',{code:event.data.code,verifier},AbortSignal.timeout(15000));
      if(!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(data.token)||!['openai','anthropic','google'].includes(data.provider)||typeof data.model!=='string'||data.expiresAt<=Date.now())throw Error('Invalid connection response.');
      try{localStorage.setItem(storageKey,JSON.stringify(data));}catch{await fetch(base+'/api/byok/v1/connection',{method:'DELETE',mode:'cors',credentials:'omit',headers:{Authorization:'Bearer '+data.token},signal:AbortSignal.timeout(10000)}).catch(()=>{});throw Error('This browser cannot save the connection. Enable site storage and reconnect.');}
      window.dispatchEvent(new Event('byok-change'));done(null,data);
     }catch(e){done(e);}
    };
    window.addEventListener('message',message);
    const poll=setInterval(()=>{if(popup.closed&&!receiving)done(Error('Key setup closed without connecting.'));},500);
    const timer=setTimeout(()=>done(Error('Key setup timed out. Open Connect again.')),300000);
    popup.location.href=base+'/connect?'+new URLSearchParams({app,origin:location.origin,challenge,state});
   });
  }finally{opening=false;}
 }
 return {connection,connect,endpoint:base,
  async disconnect(){if(connection())await request('/connection',null,AbortSignal.timeout(10000),'DELETE');clear();},
  async status(){if(!connection())return null;return request('/connection',null,AbortSignal.timeout(10000));},
  generate(data,signal){if(!connection())return Promise.reject(Error('Connect your AI in Settings. Saved phrases still work.'));
   const segment=s=>({speaker:s.speaker,source:String(s.source||'speech').slice(0,30),text:String(s.text||'').slice(0,600)});
   const snap=data.snapshot||{},profile=data.profile||{},small=(v,max)=>v&&typeof v==='object'&&JSON.stringify(v).length<=max?v:{};
   return request('/apps/'+app+'/generate',{...data,id:crypto.randomUUID(),snapshot:{summary:String(snap.summary||'').slice(0,800),recent:(snap.recent||[]).slice(-40).map(segment),justSaid:(snap.justSaid||[]).slice(-40).map(segment),unsummarized:(snap.unsummarized||[]).slice(-40).map(segment)},profile:{bio:String(profile.bio||'').slice(0,1500),personality:small(profile.personality,500),interests:small(profile.interests,400),profanity:!!profile.profanity},avoid:(data.avoid||[]).slice(-80)},signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000));
  }
 };
}};
})();
