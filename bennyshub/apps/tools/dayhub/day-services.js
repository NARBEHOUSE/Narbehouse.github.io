window.BennyDay={
  calendar:{async fetchWeek(){try{return await BennyExtension.request('CALENDAR_WEEK');}catch(e){return {ok:false,error:e.message};}}},
  news:{async fetchHighlights({localLabel}){
    try{const feeds=await BennyExtension.request('NEWS',{localLabel});const result={ok:true,localLabel};for(const [key,xml]of Object.entries(feeds)){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('A news feed could not be read.');result[key]=[...doc.querySelectorAll('item > title')].slice(0,5).map(el=>(el.textContent||'').slice(0,400));}return result;}catch(e){return {ok:false,error:e.message};}
  }}
};
