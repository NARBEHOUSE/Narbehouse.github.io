// Refresh public starter metadata through the same configured Worker as Auto-Fill.
// Does not read or write anyone's browser library, credentials, or provider links.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../bennyshub/apps/tools/streaming'),folder=path.join(root,'collections');
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const config=await fs.readFile(path.join(root,'metadata-config.js'),'utf8');
  const worker=config.match(/workerURL:\s*'([^']+)'/)?.[1];if(!worker)throw Error('Configure the TMDB Worker first.');
  const index=JSON.parse(await fs.readFile(path.join(folder,'index.json'),'utf8')),report=[];
  async function api(endpoint){
    for(let attempt=0;attempt<4;attempt++){
      const response=await fetch(new URL('3/'+endpoint,worker),{headers:{Origin:'https://narbehouse.github.io'},signal:AbortSignal.timeout(20000)});
      if(response.status===429){console.log('Worker rate limit: waiting before retry.');await wait(60000);continue;}
      if(!response.ok)throw Error('Metadata service HTTP '+response.status);await wait(250);return response.json();
    }throw Error('Metadata service is busy; rerun later.');
  }
  for(const pack of index.collections){
    const file=path.join(folder,pack.file),data=JSON.parse(await fs.readFile(file,'utf8'));
    for(const item of data.library){
      if(item.metadataSource==='TMDB'&&!process.argv.includes('--refresh'))continue;
      const type=item.type==='shows'?'tv':'movie',query=item.title.replace(/\s*\(\d{4}\)\s*$/,'');
      const year=item.year||item.title.match(/\((\d{4})\)/)?.[1];
      const result=item.tmdb_id?{results:[{id:item.tmdb_id,media_type:type}]}:await api('search/multi?include_adult=false&query='+encodeURIComponent(query));
      const candidates=(result.results||[]).filter(x=>x.media_type===type&&!x.adult);
      const exact=candidates.filter(x=>[x.title,x.name,x.original_title,x.original_name].some(t=>normalize(t)===normalize(query))&&(!year||(x.release_date||x.first_air_date||'').startsWith(year)));
      const match=item.tmdb_id?candidates.find(x=>x.id===item.tmdb_id):exact.length===1?exact[0]:null;
      if(!match){report.push({service:pack.service,title:item.title,year,candidates:candidates.slice(0,5).map(x=>({id:x.id,title:x.title||x.name,year:(x.release_date||x.first_air_date||'').slice(0,4)}))});continue;}
      const details=await api(type+'/'+match.id+'?append_to_response=credits,videos');
      const trailers=(details.videos?.results||[]).filter(x=>x.site==='YouTube'&&x.type==='Trailer'&&/^[\w-]{11}$/.test(x.key));
      const trailer=trailers.find(x=>x.official)||trailers[0];
      Object.assign(item,{year:(details.release_date||details.first_air_date||'').slice(0,4),description:details.overview||'',image:details.poster_path?'https://image.tmdb.org/t/p/w780'+details.poster_path:'',genre:(details.genres||[]).map(x=>x.name).join(', '),director:((details.credits?.crew||[]).filter(x=>x.job==='Director').map(x=>x.name).join(', ')||(details.created_by||[]).map(x=>x.name).join(', ')),actors:(details.credits?.cast||[]).slice(0,5).map(x=>x.name).join(', '),trailer:trailer?'https://www.youtube.com/watch?v='+trailer.key:'',tmdb_id:details.id,tmdb_type:type,metadataSource:'TMDB',metadataChecked:new Date().toISOString().slice(0,10)});
      await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
      console.log(pack.service+': '+item.title+' ('+item.year+')');
    }
  }
  const reportFile=path.resolve(__dirname,'../artifacts/starter-metadata-review.json');await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log('Needs title-match review: '+report.length);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
