// Shared by manual edits, JSON imports and curated Quick add collections.
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StreamingLibraryMerge=api;})(globalThis,()=>{
  const playback=typeof module==='object'&&module.exports?require('./playback-links.js'):globalThis.StreamingPlaybackLinks;
  function urlKey(value){
    value=playback.resolve(value);
    const text=String(value||'').trim();let u;try{u=new URL(text);}catch{return text;}
    const host=u.hostname.toLowerCase().replace(/^www\./,'');let match;
    if(['youtube.com','m.youtube.com','youtu.be'].includes(host)){
      const id=host==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
      if(id)return 'youtube:video:'+id;
      if(u.pathname==='/playlist'&&u.searchParams.get('list'))return 'youtube:playlist:'+u.searchParams.get('list');
    }
    if(host==='netflix.com'&&(match=u.pathname.match(/\/(?:title|watch)\/(\d+)/i)))return 'netflix:'+match[1];
    if(host==='disneyplus.com'&&(match=u.pathname.match(/(?:entity-|\/(?:video|play)\/)([a-f0-9-]{36})(?:\/|$)/i)))return 'disney:'+match[1].toLowerCase();
    if(host==='hulu.com'){
      const episode=u.searchParams.get('entity_id');if(episode)return 'hulu:watch:'+episode.toLowerCase();
      if((match=u.pathname.match(/\/(series|movie|watch)\/.*?([a-f0-9-]{36})(?:\/|$)/i)))return 'hulu:'+match[1].toLowerCase()+':'+match[2].toLowerCase();
    }
    if(host==='tubitv.com'&&(match=u.pathname.match(/\/(movies|series|tv-shows)\/(\d+)/i)))return 'tubi:'+match[1].toLowerCase()+':'+match[2];
    if(host==='primevideo.com'&&(match=u.pathname.match(/\/detail\/(?:[^/]+\/)?([A-Z0-9]{10,30})(?:\/|$)/i)))return 'prime:'+match[1].toUpperCase();
    if(host==='amazon.com'&&(match=u.pathname.match(/\/(?:dp|gp\/video\/detail)\/([A-Z0-9]{10})(?:\/|$)/i)))return 'amazon:'+match[1].toUpperCase();
    // Keep meaningful query parameters and fragments (Plex uses hash routing).
    u.hostname=host;u.pathname=u.pathname.replace(/\/+$/,'')||'/';
    for(const name of [...u.searchParams.keys()])if(/^utm_/i.test(name)||['fbclid','gclid','msclkid','ref_','tag'].includes(name.toLowerCase()))u.searchParams.delete(name);
    u.searchParams.sort();return u.href;
  }
  function duplicate(items,url,exceptId){const key=urlKey(url);return key?items.find(item=>(exceptId===undefined||item.id!==exceptId)&&urlKey(item.url)===key):undefined;}
  function mergeLibrary(existing,incoming){
    const items=existing.map(item=>({...item})),seen=new Set(items.map(item=>urlKey(item.url)).filter(Boolean));
    let added=0,skipped=0;
    for(const item of incoming){const key=urlKey(item.url);if(key&&seen.has(key)){skipped++;continue;}items.push({...item});if(key)seen.add(key);added++;}
    if(items.length>5000)throw Error('This would exceed the 5,000-title library limit. No titles were added.');
    return {items,added,skipped};
  }
  function mergeEpisodes(existing,incoming){
    const result=Object.create(null);let added=0,skipped=0;
    for(const [show,seasons]of Object.entries(existing)){result[show]=Object.create(null);for(const [season,items]of Object.entries(seasons))result[show][season]=items.map(item=>({...item}));}
    const seen=new Set(Object.values(existing).flatMap(seasons=>Object.values(seasons).flat()).map(item=>urlKey(item.url)).filter(Boolean));
    for(const [show,seasons]of Object.entries(incoming)){
      const target=result[show]||(result[show]=Object.create(null));
      for(const [season,items]of Object.entries(seasons))for(const item of items){
        const list=target[season]||(target[season]=[]),key=urlKey(item.url);
        // Existing episode numbers win too; never replace a user's custom link.
        if((key&&seen.has(key))||list.some(old=>Number(old.episode)===Number(item.episode))){skipped++;continue;}
        list.push({...item});if(key)seen.add(key);added++;
      }
    }
    return {items:result,added,skipped};
  }
  return {urlKey,duplicate,mergeLibrary,mergeEpisodes};
});
