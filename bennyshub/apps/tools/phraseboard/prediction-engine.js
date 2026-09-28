/* Hybrid, local prediction. The live board never needs a generative model. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhrasePredictions=api;})(globalThis,function(){
  'use strict';
  const HISTORY_KEY='phraseboard_spoken_history_v1';
  const words=text=>String(text).normalize('NFKC').replace(/[’]/g,"'").toLowerCase().match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)||[];
  const key=text=>words(text).join(' ');
  const usable=text=>typeof text==='string'&&text.trim()&&!/(?:https?:\/\/|www\.)/i.test(text);
  const starters=['I want','I need','I feel','Can you'];
  const MAX_PREPARED=1500;
  // Common base forms, ordered by usefulness in everyday communication, not alphabetically.
  const actionOrder=words('go eat drink play watch listen rest sleep talk see get sit stand move read write call come stop help open close turn take give make use find look tell ask say show change leave wait try learn work breathe start answer put choose remember understand explain repeat spell mean decide agree disagree accept refuse finish continue pause return stay reach hold carry push pull lift lower raise bend stretch relax wash dry brush bathe shower dress undress wear remove fix repair charge clean cook bake cut chew swallow cough sneeze smile laugh cry hug kiss drive ride visit travel buy pay spend share join dance sing draw paint count smell taste touch think feel be have do');
  const canonical=text=>String(text).replace(/\binpain\b/gi,'in pain').replace(/\bicecream\b/gi,'ice cream');
  // Original communication examples complement the general-purpose corpus.
  const examples=[
    'I want to eat','I want to drink','I want to go outside','I want to listen to music','I want to watch a video','I want some water','I want to play a game','I want to talk to you',
    'I need help','I need a break','I need more time','I need the bathroom','I need to rest','I need you to listen','I need my glasses','I need to move',
    'I feel happy','I feel tired','I feel uncomfortable','I feel cold','I feel hot','I feel worried','I feel excited','I feel sad','I feel sick','I feel better',
    'Can you help me','Can you wait please','Can you tell me more','Can you turn it up','Can you turn it down','Can you come here','Can you move this','Can you explain that',
    'I like this','I like that','I like it','I like to read','I do not like that','I do not want that','I do not know','I do not understand','I am ready','I am not ready','I am finished','I am hungry','I am thirsty',
    'Please stop','Please wait','Please give me time','Please say that again','Please come back','Please help me','Thank you','You are welcome','That is right','That is not right',
    'What is happening','What are we doing','What do you think','Where are we going','Where is my phone','When are we leaving','Who is coming','How are you','How does it work',
    'Let us go','Let us do something else','It is my turn','It is your turn','I have a question','I have something to say','I would like something different','I would like more',
    'I want to see my family','I want to call my friend','I want to go home','I want to sit here','I want to go to the park','I want to read a book','I want to change the channel',
    'Turn on the music','Turn off the light','Play it again','Pause the video','Stop the music','This is too loud','This is too quiet','I want a different song',
    'I think so','I think we should try','I remember that','I forgot what I wanted to say','I want to tell you about my day','I went to the park','We had a good time','I will see you later',
    'My favorite food is pizza','My favorite color is blue','I would rather stay home','I agree with you','I disagree with that','I changed my mind','I meant something else'
  ];
  const functionWords=new Set(words('I you we they he she it me my your our their his her us them am is are was were be been being do does did have has had can could would should will may might want need like feel go to a an the some any more less not no and or but with for from at in on of please this that these those very now later again too much little what where when who how why help see hear tell get give make let something someone different'));
  function indexPhrase(index,text,score,source){
    if(!usable(text))return;
    // Never learn an adjacency across sentence boundaries or across unrelated tiles.
    for(const segment of text.split(/[.!?;\n]+/)){
      const tokens=words(segment);if(!tokens.length||tokens.length>100)continue;
      for(let pos=1;pos<tokens.length;pos++)for(let n=1;n<=Math.min(6,pos);n++){
        const ctx=tokens.slice(pos-n,pos).join(' '),next=tokens[pos],rest=tokens.slice(pos,Math.min(tokens.length,pos+6)).join(' ');
        if(!index.has(ctx))index.set(ctx,new Map());
        for(const candidate of new Set([next,rest])){const prior=index.get(ctx).get(candidate);if(!prior||prior.score<score)index.get(ctx).set(candidate,{text:candidate,score,source});}
      }
    }
  }
  function readHistory(storage){try{const value=JSON.parse(storage.getItem(HISTORY_KEY)||'[]');return Array.isArray(value)?value.filter(x=>usable(x?.text)&&Number.isFinite(x.count)&&x.count>0).slice(0,200):[];}catch{return [];}}
  function remember(storage,text,now=Date.now()){
    if(!usable(text)||!words(text).length||text.length>1000)return readHistory(storage);
    const history=readHistory(storage),match=history.find(x=>key(x.text)===key(text));
    if(match){match.count=Math.min(1000,match.count+1);match.time=now;match.text=text.trim();}else history.push({text:text.trim(),count:1,time:now});
    history.sort((a,b)=>(b.time||0)-(a.time||0));const bounded=history.slice(0,200);storage.setItem(HISTORY_KEY,JSON.stringify(bounded));return bounded;
  }
  function validatePhrases(value,rows){
    let input=value;try{if(typeof input==='string')input=JSON.parse(input);}catch{return [];}
    if(!Array.isArray(input))return [];
    const allowed=new Set([...functionWords,...rows.flatMap(r=>usable(r.speak||r.display)?words((r.speak||r.display)+' '+canonical(r.speak||r.display)):[])]);
    const seen=new Set();
    return input.filter(usable).map(s=>canonical(s.trim())).filter(s=>{
      const normalized=key(s),tokens=words(s);
      if(seen.has(normalized)||s.length>180||tokens.length<2||tokens.length>12||!tokens.every(w=>allowed.has(w))||/\b(?:want|need|like|going|have) to (?:am|is|are|was|were|been|being|has|had|does|did)\b/i.test(s))return false;
      seen.add(normalized);return true;
    }).slice(0,MAX_PREPARED);
  }
  function boardVocabulary(rows){
    return new Set(rows.flatMap(r=>{const text=r.speak||r.display;return usable(text)?words(text+' '+canonical(text)):[];}));
  }
  function onBoard(text,vocabulary){const tokens=words(canonical(text));return tokens.length>0&&tokens.every(w=>vocabulary.has(w));}
  function validContinuation(context,text){
    const first=words(text)[0];
    // The source corpus has a few sentence-boundary artifacts, e.g. "want to I".
    const subject='i you he she it we they',finite='am is are was were has had does did been being';
    if(/(?:want|need|like|going|have|used) to$/.test(context)||/^(?:i|you|he|she|it|we|they) (?:can|could|would|should|will|must|may|might)$/.test(context)||/^(?:can|could|would|will|should) (?:you|we|i|they|he|she)$/.test(context))return !words(subject+' '+finite+' a an the to and or but can could would should will must may might').includes(first);
    if(/(?:^| )(?:want|need)$/.test(context)&&words('i '+finite).includes(first))return false;
    return true;
  }
  function dictionaryForBoard(data,vocabulary){
    const index=new Map(),patterns=new Set();
    for(const [context,options] of Object.entries(data.contexts||{})){
      if(!onBoard(context,vocabulary)||!Array.isArray(options))continue;
      const candidates=new Map();
      for(const [text,weight] of options){
        if(!usable(text)||!onBoard(text,vocabulary)||!validContinuation(context,text))continue;
        const normalized=key(text);candidates.set(normalized,{text:normalized,score:100+Math.min(12,Number(weight)||0),source:'language'});patterns.add(context+' '+normalized);
      }
      if(candidates.size)index.set(context,candidates);
    }
    return {index,patterns:[...patterns]};
  }
  // These are recorded dictionary patterns, not sentences assembled from categories.
  function automaticPhrases(rows,data={}){return dictionaryForBoard(data,boardVocabulary(rows)).patterns.slice(0,MAX_PREPARED);}
  function analysisBatches(rows){
    const buckets=new Map(),seen=new Set();
    rows.forEach(r=>{const text=canonical(r.speak||r.display||'').trim();if(!usable(text)||text.length>180||seen.has(key(text)))return;seen.add(key(text));if(!buckets.has(r.category))buckets.set(r.category,[]);buckets.get(r.category).push({category:r.category,text});});
    const shared={actions:actionOrder.filter(w=>seen.has(w)).slice(0,36),categories:[...buckets].map(([category,items])=>({category:String(category||'Words').slice(0,40),words:items.slice(0,4).map(x=>x.text.slice(0,50))}))};
    const queue=[];while([...buckets.values()].some(items=>items.length))for(const items of buckets.values())if(items.length)queue.push(items.shift());
    const batches=[];let focus=[],size=0;
    for(const item of queue){if(focus.length&&(focus.length===24||size+item.text.length>1400)){batches.push({shared,focus});focus=[];size=0;}focus.push(item);size+=item.text.length;}if(focus.length)batches.push({shared,focus});
    return batches.map((batch,i)=>{let categories=[];for(let n=0;n<shared.categories.length;n++){const item=shared.categories[(i+n)%shared.categories.length];if(JSON.stringify(categories).length+JSON.stringify(item).length>2400)break;categories.push(item);}return {shared:{actions:shared.actions,categories},focus:batch.focus};});
  }
  class Predictor {
    constructor(data={}){this.data=data;this.rows=[];this.history=[];this.boardIndex=new Map();this.historyIndex=new Map();this.aiIndex=new Map();this.dictionaryIndex=new Map();this.tokens=new Set();this.terms=[];this.baseIndex=new Map();examples.forEach((text,i)=>indexPhrase(this.baseIndex,text,107-i*.015,'built-in'));}
    setBoard(rows){
      const prepared=rows.find(r=>r.predictionPhrases)?.predictionPhrases||[];
      const signature=JSON.stringify(rows.map(r=>[r.category,r.speak,r.display]))+JSON.stringify(prepared);
      if(this.boardSignature===signature){this.rows=rows;return this;}this.boardSignature=signature;
      this.rows=rows;this.boardIndex=new Map();this.aiIndex=new Map();this.tokens=boardVocabulary(rows);this.terms=[];
      rows.forEach(r=>{const raw=r.speak||r.display;if(!usable(raw))return;const text=canonical(raw),tokens=words(text);indexPhrase(this.boardIndex,text,113,'board');if(tokens.length&&tokens.length<=6)this.terms.push(tokens.join(' '));});
      const dictionary=dictionaryForBoard(this.data,this.tokens);this.dictionaryIndex=dictionary.index;this.dictionaryPatternCount=dictionary.patterns.length;this.automaticPhrases=dictionary.patterns.slice(0,MAX_PREPARED);
      this.aiPhrases=validatePhrases(prepared,rows);this.aiPhrases.forEach(s=>indexPhrase(this.aiIndex,s,108,'prepared'));
      return this;
    }
    setHistory(history=[]){const signature=JSON.stringify(history);if(this.historySignature===signature)return this;this.historySignature=signature;this.history=history;this.historyIndex=new Map();history.forEach(s=>indexPhrase(this.historyIndex,s.text,130+Math.min(30,Math.log2(1+s.count)*8),'history'));return this;}
    suggest(message,{limit=4}={}){
      if(limit<1)return [];
      const sentence=String(message).split(/[.!?;\n]+/).at(-1),tokens=words(sentence),out=new Map();
      const add=(text,score,source,contextLength=0)=>{
        if(!usable(text)||(source!=='history'&&!onBoard(text,this.tokens)))return;
        const normalized=key(canonical(text));if(!normalized||normalized===tokens.at(-1)||normalized===tokens.join(' '))return;
        const entry=out.get(normalized);if(!entry||entry.score<score)out.set(normalized,{text:normalized,score,source,contextLength});
      };
      if(!tokens.length){
        starters.forEach((text,i)=>add(text,80-i,'built-in'));
        this.history.forEach(h=>{const phrase=words(h.text).slice(0,6).join(' ');if(words(h.text).length>1)add(phrase,95+Math.min(20,Math.log2(1+h.count)*4),'history');});
        // Literal board tiles fill spare starter slots; no new sentence is invented.
        this.terms.forEach(text=>add(text,30+(Number(this.data.vocabulary?.[text])||0),'board'));
        const ranked=[...out.values()].sort((a,b)=>b.score-a.score||a.text.localeCompare(b.text));
        const personal=ranked.filter(x=>x.source==='history').slice(0,2),common=ranked.filter(x=>x.source!=='history');
        return [...personal,...common].slice(0,limit).map(display);
      }
      const collect=n=>{
        const context=tokens.slice(-n).join(' ');
        for(const index of [this.boardIndex,this.historyIndex,this.aiIndex,this.baseIndex,...(n<=2?[this.dictionaryIndex]:[])]){
          for(const candidate of index.get(context)?.values()||[]){
            if(candidate.source!=='history'&&!validContinuation(tokens.slice(-2).join(' '),candidate.text))continue;
            add(candidate.text,candidate.score+n*4,candidate.source,n);
          }
        }
      };
      // Prefer recorded trigrams (last two words), plus longer matches in actual phrases/history.
      // Only fall back to a single-word context when no more-specific match is available.
      for(let n=Math.min(6,tokens.length);n>=2;n--)collect(n);
      if(!out.size)collect(1);
      const ranked=[...out.values()].sort((a,b)=>b.score-a.score||a.text.localeCompare(b.text));
      const selected=[],roots=new Set(),alternatives=[];
      for(const item of ranked){const first=words(item.text)[0];if(roots.has(first)){alternatives.push(item);continue;}selected.push(item);roots.add(first);if(selected.length===limit)break;}
      for(const item of alternatives){if(selected.length>=limit)break;selected.push(item);}
      return selected.map(display);
    }
  }
  function display(item){return {...item,text:item.text.replace(/^i(?=\s|$)/,'I').replace(/\bi'm\b/g,"I'm").replace(/\bi've\b/g,"I've").replace(/\bi'll\b/g,"I'll")};}
  return {Predictor,HISTORY_KEY,MAX_PREPARED,readHistory,remember,validatePhrases,automaticPhrases,analysisBatches,words,key,examples,starters};
});
