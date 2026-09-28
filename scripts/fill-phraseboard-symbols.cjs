// Fetch public OpenSymbols matches without guessing asset filenames or replacing custom images.
const fs=require('node:fs/promises'),path=require('node:path');
const PB=require('../bennyshub/apps/tools/phraseboard/board-core.js');
const folder=path.resolve(__dirname,'../bennyshub/apps/tools/phraseboard/boards');
const file=path.join(folder,'NARBE_Words.csv'),cacheFile=path.join(folder,'opensymbols-attribution.json');
const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fields=['category','categoryOrder','display','speak','image','categoryColor','tileColor','tileOrder','categoryImage','boardName','boardColor','boardImage'];
const quote=v=>/[",\r\n]/.test(String(v??''))?'"'+String(v).replace(/"/g,'""')+'"':String(v??'');
(async()=>{
  const rows=PB.parse(await fs.readFile(file,'utf8'));
  let cache={source:'https://www.opensymbols.org/',symbols:{}};
  try{cache=JSON.parse(await fs.readFile(cacheFile,'utf8'));}catch{}
  const targets=[...new Set([...rows.filter(r=>!r.image).map(r=>r.speak||r.display),...rows.filter(r=>!r.categoryImage).map(r=>r.category)])];
  // Keep reviewed misses cached too; explicitly retry when the catalogue changes.
  const retryUnresolved=process.argv.includes('--retry-unresolved');
  const pending=targets.filter(text=>!cache.symbols[key(text)]&&(retryUnresolved||!cache.unresolved?.[key(text)]));let cursor=0,complete=0,writeQueue=Promise.resolve();
  async function lookup(text){
    const query=text==='icecream'?'ice cream':text==='inpain'?'in pain':text;
    for(let attempt=0;attempt<4;attempt++){
      const url=new URL('https://www.opensymbols.org/api/v1/symbols/search');url.searchParams.set('q',query);url.searchParams.set('format','json');url.searchParams.set('safe','1');
      let response;try{response=await fetch(url,{signal:AbortSignal.timeout(15000)});}catch(error){if(attempt===3)throw error;await sleep(1500*(attempt+1));continue;}
      if(response.status===429||response.status>=500){await sleep(Math.min(30000,Number(response.headers.get('retry-after')||2)*1000)*(attempt+1));continue;}
      if(!response.ok)throw Error('OpenSymbols returned '+response.status);
      const results=await response.json();if(!Array.isArray(results))throw Error('Unexpected OpenSymbols response');
      const wanted=key(query),matches=results.filter(s=>!s.unsafe_result&&/^https:\/\//.test(s.image_url||''));
      const score=s=>{
        const name=key(s.name),base=name.replace(/^to /,'').replace(/ (?:\d+|v|verb|noun)$/,'');
        return (name===wanted?100:base===wanted?90:name===wanted+'s'?70:0)+(s.repo_key==='arasaac'?8:s.repo_key==='mulberry'?6:0);
      };
      matches.sort((a,b)=>score(b)-score(a)||(b.relevance||0)-(a.relevance||0));
      const match=matches.find(s=>score(s)>=70);if(!match){cache.unresolved ||= {};cache.unresolved[key(text)]={query:text,candidates:matches.slice(0,5).map(s=>({id:s.id,name:s.name,image_url:s.image_url,repo_key:s.repo_key,author:s.author,author_url:s.author_url,license:s.license,license_url:s.license_url,source_url:s.source_url,details_url:s.details_url?'https://www.opensymbols.org'+s.details_url:null}))};return null;}
      return {query:text,id:match.id,name:match.name,image_url:match.image_url,repo_key:match.repo_key,author:match.author,author_url:match.author_url,license:match.license,license_url:match.license_url,source_url:match.source_url,details_url:match.details_url?'https://www.opensymbols.org'+match.details_url:null};
    }
    throw Error('OpenSymbols remained busy; retry later.');
  }
  console.log('Looking up '+pending.length+' missing words/category images; preserving all existing images.');
  async function worker(){while(cursor<pending.length){const text=pending[cursor++];try{const symbol=await lookup(text);if(symbol)cache.symbols[key(text)]=symbol;}catch(error){console.log('Lookup paused: '+error.message);throw error;}complete++;if(complete%20===0||complete===pending.length){writeQueue=writeQueue.then(()=>fs.writeFile(cacheFile,JSON.stringify(cache,null,2)+'\n'));await writeQueue;console.log(complete+'/'+pending.length+' checked; '+Object.keys(cache.symbols).length+' verified matches cached.');}await sleep(650);}}
  await Promise.all(Array.from({length:4},()=>worker()));await writeQueue;await fs.writeFile(cacheFile,JSON.stringify(cache,null,2)+'\n');
  // Reread to retain edits made while the network requests were running.
  const current=PB.parse(await fs.readFile(file,'utf8'));let added=0;
  for(const r of current){if(!r.image&&cache.symbols[key(r.speak||r.display)]){r.image=cache.symbols[key(r.speak||r.display)].image_url;added++;}if(!r.categoryImage&&cache.symbols[key(r.category)])r.categoryImage=cache.symbols[key(r.category)].image_url;}
  await fs.writeFile(file,fields.map(f=>f[0].toUpperCase()+f.slice(1)).join(',')+'\n'+current.map(r=>fields.map(f=>quote(r[f])).join(',')).join('\n')+'\n');
  console.log(JSON.stringify({added,total:current.length,withImages:current.filter(r=>r.image).length,needsReview:current.filter(r=>!r.image).map(r=>r.display)}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
