(() => {
  const base = new URL('.', document.currentScript.src);
  const key = title => String(title).toLowerCase().trim();
  const plain = v => v && typeof v === 'object' && !Array.isArray(v);
  function library(value) {
    if (!Array.isArray(value) || value.length > 5000) throw Error('Choose a streaming library array with at most 5,000 titles.');
    const ids = new Set();
    return value.map(item => {
      if (!plain(item) || typeof item.title !== 'string' || !item.title.trim() || typeof item.url !== 'string') throw Error('Each title needs a title and URL field.');
      const result = {...item};
      // Retain catalog values, including unfinished links, for correction in the editor.
      // Playback is independently restricted by the extension's provider policy.
      if (typeof result.id !== 'string' || !/^[\w-]{1,100}$/.test(result.id) || ids.has(result.id)) result.id = crypto.randomUUID();
      ids.add(result.id);
      if (result.episode_key != null && (typeof result.episode_key !== 'string' || !result.episode_key.trim() || result.episode_key.length > 100000)) throw Error('Invalid episode association.');
      for (const field of ['title','url','type','genre','director','actors','year','image','description','service','service_icon','trailer']) {
        result[field] = String(result[field] ?? '');
        if (result[field].length > 100000) throw Error('Catalog field is too large.');
      }
      // Repair existing movie imports too, while keeping notes, IDs and series links.
      result.url=starterPlaybackURL(result.url);
      if(result.type==='movies')result.url=moviePlaybackURL(result.url);
      return result;
    });
  }
  function episodes(value) {
    if (!plain(value) || Object.keys(value).length > 5000) throw Error('Choose an episodes.json object grouped by show and season.');
    const result = Object.create(null);let count = 0;
    for (const [show,seasons] of Object.entries(value)) {
      if (!plain(seasons)) throw Error('Episodes must be grouped by season.');
      const clean = Object.create(null);
      for (const [season,items] of Object.entries(seasons)) {
        if (!/^\d{1,4}$/.test(season) || !Array.isArray(items)) throw Error('Invalid season.');
        clean[season] = items.map(ep => {
          if (++count > 50000 || !plain(ep) || !Number.isInteger(Number(ep.episode)) || typeof ep.title !== 'string' || typeof ep.url !== 'string') throw Error('Invalid episode.');
          return {...ep,episode:Number(ep.episode)};
        });
      }
      result[key(show)] = clean;
    }
    return result;
  }
  let seedPromise;
  const seeds = () => seedPromise ||= Promise.all(['data.json','episodes.json'].map(async file => {
    const response = await fetch(new URL(file,base));
    if (!response.ok) throw Error('Could not load the original streaming catalog. Reload while connected.');
    return response.json();
  })).then(([data,eps])=>({data:library(data),episodes:episodes(eps)})).catch(e=>{seedPromise=null;throw e;});
  const get = (name,fallback) => BennyData.get('streaming.'+name,fallback);
  const set = (name,value) => window.BennyAppStorage ? BennyAppStorage.setItem('streaming','benny-web:v1:streaming.'+name,JSON.stringify(value)) : BennyData.set('streaming.'+name,value);
  const remove = name => window.BennyAppStorage ? BennyAppStorage.removeItem('streaming','benny-web:v1:streaming.'+name) : BennyData.remove('streaming.'+name);
  let catalogBaseline;
  const catalogSignature = value => JSON.stringify(value, (_name, item) => plain(item)
    ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
  function status(message) { const el=document.getElementById('streaming-status');if(el){el.textContent=message;el.hidden=!message;} }
  function imageURL(value) { try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''; } catch {return '';} }
  const starterPlaybackURL=value=>StreamingPlaybackLinks.resolve(value);
  function moviePlaybackURL(value) {
    try {
      const u=new URL(value),match=u.pathname.match(/^\/(?:[a-z]{2}-[a-z]{2}\/)?browse\/entity-([a-f0-9-]{36})\/?$/i);
      if(u.protocol==='https:'&&['netflix.com','www.netflix.com'].includes(u.hostname)&&!u.username&&!u.password&&/^\/title\/\d+\/?$/.test(u.pathname)){u.pathname=u.pathname.replace('/title/','/watch/');return u.href;}
      if(u.protocol==='https:'&&['disneyplus.com','www.disneyplus.com'].includes(u.hostname)&&!u.username&&!u.password&&match){u.pathname='/play/'+match[1];return u.href;}
    } catch {}
    return value;
  }
  function playbackURL(value) {
    let u;try{u=new URL(starterPlaybackURL(value));}catch{throw Error('This title needs a complete video URL in the editor.');}
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password) throw Error('Use a complete http/https playback URL without embedded credentials.');
    if (u.protocol==='https:' && u.hostname==='youtu.be') {
      const video=u.pathname.slice(1);if(!/^[\w-]+$/.test(video))throw Error('Invalid YouTube link.');
      const params=u.searchParams;
      u=new URL('https://www.youtube.com/watch?v='+encodeURIComponent(video));
      for(const name of ['list','index','t'])if(params.has(name))u.searchParams.set(name,params.get(name));
    }
    return u.href;
  }
  window.WebStreaming = {
    library,episodes,status,imageURL,playbackURL,
    escapeHTML: value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    async getData() {
      if(window.BennyAppStorage)await BennyAppStorage.ready('streaming');
      const saved=get('catalog',null);catalogBaseline=catalogSignature(saved);
      return library(saved ?? (await seeds()).data);
    },
    saveData(value) {
      const current=catalogSignature(get('catalog',null));
      if(catalogBaseline!==undefined&&current!==catalogBaseline)throw Error('Library changed in another window. Reopen the editor before saving.');
      const data=library(value);set('catalog',data);catalogBaseline=catalogSignature(data);return data;
    },
    async addData(value) {
      const incoming=library(value),fallback=await this.getData();
      // Read again immediately before the synchronous write, including other-tab changes.
      const latest=get('catalog',null);catalogBaseline=catalogSignature(latest);
      const result=StreamingLibraryMerge.mergeLibrary(library(latest ?? fallback),incoming);
      if(result.added)result.items=this.saveData(result.items);
      return result;
    },
    async addEpisodes(value) {
      const incoming=episodes(value),fallback=await this.allEpisodes();
      const result=StreamingLibraryMerge.mergeEpisodes(episodes(get('episodes',fallback)),incoming);
      if(result.added)this.saveEpisodes(result.items);
      return result;
    },
    getGenres:()=>get('genres',{}),
    saveGenres(value) { const clean=Object.create(null);for(const [name,url]of Object.entries(value))clean[name]=imageURL(url);set('genres',clean); },
    async getEpisodes(title) {const data=get('episodes',null) ?? (await seeds()).episodes;return episodes(data)[key(title)] || {};},
    async allEpisodes() {return episodes(get('episodes',null) ?? (await seeds()).episodes);},
    saveEpisodes(value) {const clean=episodes(value);set('episodes',clean);return clean;},
    async saveShowEpisodes(show, seasons) {
      if (typeof show !== 'string' || !show.trim() || !plain(seasons)) throw Error('Choose a show and seasons.');
      const clean = Object.create(null);
      for (const [season, items] of Object.entries(seasons)) {
        if (!/^(0|[1-9]\d{0,3})$/.test(season) || !Array.isArray(items)) throw Error('Use whole season numbers from 0 to 9999.');
        const seen = new Set();
        const rows = items.map(ep => {
          if (!plain(ep) || !Number.isSafeInteger(ep.episode) || ep.episode < 0 || seen.has(ep.episode) || typeof ep.title !== 'string' || !ep.title.trim() || typeof ep.url !== 'string') throw Error('Each episode needs a unique whole number, title, and playback URL.');
          playbackURL(ep.url);
          seen.add(ep.episode);
          return {...ep, season: Number(season), title: ep.title.trim(), url: ep.url.trim()};
        }).sort((a,b) => a.episode - b.episode);
        if (rows.length) clean[season] = rows;
      }
      const fallback = await this.allEpisodes();
      // Re-read after loading, so saving this show retains changes to other shows.
      const catalog = episodes(get('episodes', fallback));
      catalog[key(show)] = clean;
      this.saveEpisodes(catalog); // One atomic localStorage write; failed saves leave data intact.
      return clean;
    },
    getLastWatched(title) {const data=get('lastWatched',{});return title ? data[key(title)] || null : data;},
    saveProgress({show,url,season,episode}) {const data=get('lastWatched',{});Object.defineProperty(data,key(show),{value:{url,season:season??-1,episode:episode??-1,timestamp:Date.now()},enumerable:true,writable:true,configurable:true});set('lastWatched',data);},
    resetProgress(title) {const data=get('lastWatched',{}),entry=data[key(title)];if(entry){delete entry.url;entry.season=-1;entry.episode=-1;set('lastWatched',data);}if(key(get('activePlayback',{}).show)===key(title))remove('activePlayback');},
    clearAllProgress() {const data=get('lastWatched',{});for(const entry of Object.values(data)){delete entry.url;entry.season=-1;entry.episode=-1;}set('lastWatched',data);remove('activePlayback');return Object.keys(data).length;},
    getSearchHistory:()=>get('searchHistory',[]),
    saveSearch(term) {set('searchHistory',[term,...get('searchHistory',[]).filter(x=>x!==term)].slice(0,100));},
    clearSearchHistory:()=>set('searchHistory',[]),
    async launch({url,show,season,episode,saveUrl,type}) {
      status('');
      if(type==='movies')url=moviePlaybackURL(url);
      const prefs=window.NarbeScanManager?.getSettings()||{};
      const voice=window.NarbeVoiceManager?.getSettings()||{};
      Object.assign(prefs,{voice:voice.voiceName||'',rate:voice.rate||1,tts:voice.ttsEnabled!==false});
      const target=new URL(playbackURL(url));
      const playlist=['www.youtube.com','youtube.com','m.youtube.com'].includes(target.hostname)&&target.searchParams.has('list');
      const playbackId=crypto.randomUUID(),trackProgress=type!=='trailer'&&(type==='shows'||playlist)&&!/(^|\.)plex\.tv$/.test(target.hostname);
      await BennyExtension.request('OPEN_STREAM',{url:playbackURL(url),settings:prefs,playbackId,trackProgress});
      if(trackProgress)set('activePlayback',{playbackId,show,season,episode});
      if(type!=='trailer') this.saveProgress({show,url:saveUrl||url,season,episode});
      // Playback has already opened. Finish persistence without misreporting a
      // later storage interruption as a failed player launch.
      if(window.BennyAppStorage){
        try{const saved=await BennyAppStorage.flush('streaming');if(saved?.error)status(saved.error);}
        catch(error){status('Playback opened, but progress is waiting to save. '+error.message);}
      }
    },
    async syncProgress() {
      if(!BennyExtension.supports('streaming'))return;
      try {
        const active=get('activePlayback',null);if(!active)return;
        const progress=await BennyExtension.request('STREAM_PROGRESS',{},2000);
        if(progress?.playbackId===active.playbackId&&get('activePlayback',null)?.playbackId===active.playbackId){
          const previous=this.getLastWatched(active.show);
          if(previous?.url!==progress.url)this.saveProgress({...active,url:progress.url});
        }
      }catch(error){status(error.message);}
    }
  };
})();
