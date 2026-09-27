/* All scoring happens in this worker. Only fixed, same-origin model files are fetched. */
let engine, index, common;
const validWord = word => typeof word === 'string' && /^[A-Z]+(?:'[A-Z]+)*$/.test(word) && word.length <= 60;
async function decompress(name) {
  const response = await fetch(new URL('kenlm/' + name, self.location.href), {credentials:'omit'});
  if (!response.ok) throw Error('Model unavailable');
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
}
function lowerBound(prefix) {
  let low=0, high=index.vocabulary.length;
  while(low<high){const mid=(low+high)>>>1;if(index.vocabulary[mid][0]<prefix)low=mid+1;else high=mid;}
  return low;
}
function predict({context, prefix, local}) {
  const words=context.slice(-2), candidates=new Set();
  const add=word=>{if(validWord(word)&&word.startsWith(prefix))candidates.add(word);};
  for(const word of local.slice(0,20))add(word);
  for(const key of [words.join(' '), words.at(-1)]){
    for(const id of index.following[key]||[])add(index.vocabulary[id][0]);
  }
  if(prefix){
    const matches=[];
    for(let i=lowerBound(prefix);i<index.vocabulary.length&&index.vocabulary[i][0].startsWith(prefix);i++)matches.push(index.vocabulary[i]);
    matches.sort((a,b)=>b[1]-a[1]);for(const [word] of matches.slice(0,120))add(word);
  }else for(const [word] of common)add(word);
  const scored=[...candidates].map(word=>[word,engine.ccall('score_word','number',['string','string','number'],[words.join(' '),word,context.length<2?1:0])]);
  return scored.filter(([,score])=>Number.isFinite(score)&&score>-99).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12).map(([word])=>word);
}
self.onmessage=({data})=>{
  if(!engine||!index||!Number.isInteger(data?.id))return;
  if(!Array.isArray(data.context)||data.context.length>2||!data.context.every(validWord)||typeof data.prefix!=='string'||data.prefix.length>60||!Array.isArray(data.local))return;
  try{self.postMessage({id:data.id,words:predict(data)});}catch{self.postMessage({id:data.id,words:[]});}
};
(async()=>{
  try{
    importScripts('kenlm/kenlm.js');
    engine=await createKenLM({locateFile:name=>new URL('kenlm/'+name,self.location.href).href,print:()=>{},printErr:()=>{}});
    const [modelResponse,indexResponse]=await Promise.all([decompress('english.arpa.gz'),decompress('candidates.json.gz')]);
    const model=new Uint8Array(await modelResponse.arrayBuffer());
    engine.FS.writeFile('/english.arpa',model);
    const order=engine.ccall('load_model','number',['string'],['/english.arpa']);
    engine.FS.unlink('/english.arpa');
    if(order!==3)throw Error('Model could not load');
    index=await indexResponse.json();
    if(index.version!==1||!Array.isArray(index.vocabulary)||!index.following)throw Error('Invalid index');
    common=[...index.vocabulary].sort((a,b)=>b[1]-a[1]).slice(0,256);
    self.postMessage({ready:true});
  }catch{self.postMessage({failed:true});self.close();}
})();
