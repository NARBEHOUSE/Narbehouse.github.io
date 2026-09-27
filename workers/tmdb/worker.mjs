const SEARCH=/^\/3\/search\/(multi|movie)$/;
const DETAILS=/^\/3\/(movie|tv)\/[1-9]\d{0,9}$/;
function reply(body,status,origin,extra={}){
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),...extra}});
}
export function metadataURL(input){
  const incoming=new URL(input),search=SEARCH.test(incoming.pathname);
  if(!search&&!DETAILS.test(incoming.pathname))throw Error('Unsupported metadata endpoint.');
  const allowed=new Set(search?['query','page','language','include_adult']:['append_to_response','language']);
  for(const key of incoming.searchParams.keys())if(!allowed.has(key)||incoming.searchParams.getAll(key).length!==1)throw Error('Unsupported parameter.');
  const url=new URL(incoming.pathname,'https://api.themoviedb.org');
  const language=incoming.searchParams.get('language')||'en-US';
  if(!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language))throw Error('Invalid language.');
  url.searchParams.set('language',language);
  if(search){
    const query=(incoming.searchParams.get('query')||'').trim();
    if(!query||query.length>200||/[\x00-\x1f]/.test(query))throw Error('Enter a title up to 200 characters.');
    const page=incoming.searchParams.get('page')||'1';if(!/^(?:[1-9]|10)$/.test(page))throw Error('Invalid page.');
    url.searchParams.set('query',query);url.searchParams.set('page',page);url.searchParams.set('include_adult','false');
  }else{
    const append=incoming.searchParams.get('append_to_response');
    if(append){const values=[...new Set(append.split(','))].sort();if(values.some(x=>!['credits','videos'].includes(x)))throw Error('Unsupported details.');url.searchParams.set('append_to_response',values.join(','));}
  }
  return url;
}
export default {
  async fetch(request,env,ctx){
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!origin||!allowed.includes(origin))return reply({error:'Origin is not allowed.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Max-Age':'600','Vary':'Origin'}});
    if(request.method!=='GET')return reply({error:'Use GET.'},405,origin,{'Allow':'GET, OPTIONS'});
    let upstream;
    try{upstream=metadataURL(request.url);}catch(e){return reply({error:e.message},400,origin);}
    if(!(env.TMDB_READ_TOKEN||env.TMDB_API_KEY)||!env.CLIENT_LIMIT||!env.UPSTREAM_LIMIT)return reply({error:'Metadata service is not configured.'},503,origin);
    let stage='client_limit';
    try{
      // Anonymous public lookup has no signed-in user ID. Shared-IP limits are
      // deliberately generous; these counters are per Cloudflare location.
      const ip=request.headers.get('CF-Connecting-IP')||'unknown';
      if(!(await env.CLIENT_LIMIT.limit({key:ip})).success)return reply({error:'Too many requests. Try again in a minute.'},429,origin,{'Retry-After':'60'});
      stage='cache_read';
      const cache=globalThis.caches?.default;
      const cacheKey=new Request(new URL('/tmdb-cache'+upstream.pathname+upstream.search,new URL(request.url).origin));
      const cached=await cache?.match(cacheKey);
      if(cached)return reply(await cached.json(),200,origin);
      stage='upstream_limit';
      if(!(await env.UPSTREAM_LIMIT.limit({key:'tmdb'})).success)return reply({error:'Metadata service is busy. Try again in a minute.'},429,origin,{'Retry-After':'60'});
      const headers={Accept:'application/json'};
      const credential=String(env.TMDB_READ_TOKEN||env.TMDB_API_KEY).trim();
      if(!/^[A-Za-z0-9._~+\/=\-]+$/.test(credential))return reply({error:'The TMDB credential needs to be entered again in Cloudflare.',code:'credential_format'},503,origin);
      // TMDB also provides a 32-character v3 API key. Accept that format even
      // when it was pasted into the read-token secret; it stays server-side.
      const apiKey=!env.TMDB_READ_TOKEN||/^[a-f0-9]{32}$/i.test(credential);
      if(apiKey)upstream.searchParams.set('api_key',credential);
      else headers.Authorization='Bearer '+credential;
      stage='tmdb_request';
      // Never follow redirects with the TMDB credential. Manual mode lets us
      // reject redirect responses through the same sanitized status handling.
      const response=await fetch(upstream,{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return reply({error:response.status===404?'Title not found.':response.status===401?'TMDB rejected the configured credential.':'TMDB lookup is temporarily unavailable.',code:'tmdb_http_'+response.status},response.status===404?404:502,origin);
      stage='tmdb_response';
      const text=await response.text();if(text.length>2_000_000)throw Error('Response too large');
      const data=JSON.parse(text);if(!data||typeof data!=='object')throw Error('Invalid response');
      stage='cache_write';
      if(cache){const ttl=SEARCH.test(upstream.pathname)?300:86400;ctx.waitUntil(cache.put(cacheKey,new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age='+ttl}})).catch(()=>{}));}
      return reply(data,200,origin);
    // Only fixed stage names are public. Never return/log exception messages,
    // request headers, private credentials, or upstream response bodies.
    }catch(e){
      const kind=['TypeError','ReferenceError','TimeoutError','AbortError'].includes(e?.name)?e.name:'Error';
      return reply({error:'Metadata lookup failed. Please try again.',code:stage+'_'+kind},502,origin);
    }
  }
};
