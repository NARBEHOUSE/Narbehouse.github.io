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
  const invalidInfinitives=new Set(words('am is are was were being been has had does did'));
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
  const categories={
    food:'food foods snack snacks meals breakfast lunch dinner fruit vegetables drinks beverages',
    feeling:'feeling feelings emotions mood symptoms comfort',place:'place places location locations destinations rooms',
    action:'action actions verb verbs activities leisure',person:'people person family friends names',object:'things objects needs clothing belongings'
  };
  const lexicon={
    food:'water juice milk tea coffee soda lemonade food pizza sandwich pasta rice soup toast bread cereal eggs chicken fish meat cheese apple banana orange fruit vegetables snack chocolate cookie ice cream yogurt drink',
    feeling:'happy sad tired hungry thirsty cold hot sick comfortable uncomfortable excited worried scared angry upset bored hurt sore dizzy sleepy okay fine better worse proud frustrated calm lonely relaxed anxious',
    place:'home school park shop store bathroom kitchen bedroom outside inside garden library hospital beach restaurant work cinema zoo pool',
    action:'eat drink play read watch listen go sit stand walk run swim dance sing talk call sleep rest help stop wait open close turn move change choose make get give take bring show tell',
    person:'mom dad mother father sister brother grandmother grandfather friend teacher nurse doctor family parents',
    object:'music book phone glasses coat shoes shirt blanket pillow toy ball game video television movie computer wheelchair charger tablet'
  };
  const functionWords=new Set(words('I you we they he she it me my your our their his her us them am is are was were be been being do does did have has had can could would should will may might want need like feel go to a an the some any more less not no and or but with for from at in on of please this that these those very now later again too much little what where when who how why help see hear tell get give make let something someone different'));
  function tags(text,category){const textWords=words(text),c=words(category);return Object.keys(lexicon).filter(tag=>{
    if(tag==='action')return actionOrder.includes(textWords[0])&&!invalidInfinitives.has(textWords[0]);
    return textWords.some(w=>words(lexicon[tag]).includes(w))||c.some(w=>words(categories[tag]).includes(w));
  });}
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
  function automaticPhrases(rows){
    const terms=new Map(),vocabulary=new Set();
    rows.forEach(r=>{const raw=r.speak||r.display;if(!usable(raw))return;const text=key(canonical(raw));words(text).forEach(w=>vocabulary.add(w));if(words(text).length<=4&&!terms.has(text))terms.set(text,{text,tags:tags(text,r.category),category:key(r.category)});});
    const phrases=[],pools=[];let pool=null;const add=text=>(pool||phrases).push(text),has=text=>terms.has(text),all=[...terms.values()];
    const actions=actionOrder.filter(has);
    // These start with core vocabulary drawn across the entire board, including Core.
    const complements={watch:'this',see:'you',get:'this',read:'this',write:'this',call:'you',help:'you',open:'this',close:'this',turn:'this',take:'this',give:'you this',make:'this',use:'this',find:'this',tell:'you something',ask:'you something',say:'something',show:'you this',change:'this',answer:'you',put:'this here',be:'here',have:'this',do:'this'};
    for(const verb of actions)for(const start of ['I want to','I need to','Can you','I would like to','I can','We can'])add(start+' '+verb+(complements[verb]?' '+complements[verb]:''));
    examples.forEach(text=>{if(words(text).every(w=>vocabulary.has(w)||functionWords.has(w)))add(text);});
    for(const term of all){
      pool=[];const text=term.text;
      if(term.tags.includes('feeling'))for(const start of (text.startsWith('in ')?['I am','I am not']:['I feel','I am','I am not','I feel very']))add(start+' '+text);
      if(term.tags.includes('food')){
        const countable=words('apple banana orange grape strawberry blueberry peach pear carrot potato onion cookie cracker chip egg bean pea sandwich muffin pancake waffle bagel burger taco lemon lime avocado melon cucumber mushroom peach pretzel biscuit sausage').includes(text),object=countable?(/^[aeiou]/.test(text)?'an ':'a ')+text:text;
        for(const start of ['I want','I need','I would like','Can I have','I do not want'])add(start+' '+object);
        for(const start of ['I want some','I need more'])add(start+' '+text);add('I like '+(countable?'this ':'')+text);
        const drink=words('water juice milk tea coffee soda lemonade').includes(text);
        if(has(drink?'drink':'eat')&&!words('salt pepper oil butter sauce').includes(text))for(const start of ['I want to','I need to','Can I'])add(start+' '+(drink?'drink':'eat')+' '+object);
      }
      if(term.tags.includes('place')&&!['living','near','far','left','right'].includes(text)){
        const destination=['home','outside','inside','here','there'].includes(text)?text:['school','work','bed'].includes(text)?'to '+text:'to the '+text;
        if(has('go'))for(const start of ['I want to go','I need to go','Can we go','I would like to go','Let us go'])add(start+' '+destination);
        if(!['home','outside','inside'].includes(text))add('Where is the '+text);
      }
      if(term.tags.includes('person')){
        for(const start of ['I want to see','I need to see','Can you call','I want to talk to','Where is'])add(start+' '+text);
      }
      if(term.tags.includes('object')){
        for(const start of ['I want my','I need my','Can you get my','Where is my','Please give me the','I want to use the'])add(start+' '+text);
      }
      if(term.category==='health'){
        if(['pain','nausea','allergies'].includes(text))add('I have '+text);
        if(['allergy','fever','headache','cramp','injury','seizure'].includes(text))add('I have '+(/^[aeiou]/.test(text)?'an ':'a ')+text);
        if(['medicine','medication','bandage','oxygen','inhaler','prescription'].includes(text))for(const start of ['I need my','Can you get my','Where is my'])add(start+' '+text);
        if(['breathing','hearing','vision','itching','coughing'].includes(text))add('I need help with my '+text);
      }
      if(['technology','school','money','travel','activities','nature'].includes(term.category)&&!actionOrder.includes(text))for(const start of ['I want to talk about','Can you tell me about','I have a question about'])add(start+' '+text);
      if(term.category==='body')for(const start of ['I need help with my','Can you look at my'])add(start+' '+text);
      if(pool.length)pools.push(pool);
    }
    pool=null;
    const combinations=[['listen to','music'],['watch','tv'],['watch','a video'],['watch','a movie'],['play','a game'],['read','a book'],['write','my name'],['take','a break'],['change','my position'],['get','some rest']];
    for(const [verb,object] of combinations)if(words(verb+' '+object).every(w=>vocabulary.has(w)||functionWords.has(w)))for(const start of ['I want to','I need to','Can I','Can you','I would like to','We can'])add(start+' '+verb+' '+object);
    // Interleave variants so the phrase budget covers vocabulary from late categories too.
    for(let i=0;i<Math.max(0,...pools.map(p=>p.length));i++)for(const variants of pools)if(variants[i])phrases.push(variants[i]);
    return validatePhrases(phrases,rows);
  }
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
    constructor(data={}){this.data=data;this.rows=[];this.history=[];this.boardIndex=new Map();this.historyIndex=new Map();this.baseIndex=new Map();this.aiIndex=new Map();this.tokens=new Set();this.terms=[];examples.forEach((s,i)=>indexPhrase(this.baseIndex,s,50-i*0.12,'built-in'));}
    setBoard(rows){
      const prepared=rows.find(r=>r.predictionPhrases)?.predictionPhrases||[];
      const signature=JSON.stringify(rows.map(r=>[r.category,r.speak,r.display]))+JSON.stringify(prepared);
      if(this.boardSignature===signature){this.rows=rows;return this;}this.boardSignature=signature;
      this.rows=rows;this.categoryIndexes=new Map();this.boardIndex=new Map();this.aiIndex=new Map();this.tokens=new Set();this.terms=[];
      rows.forEach(r=>{const text=r.speak||r.display;if(!usable(text))return;const tokens=words(text);tokens.forEach(w=>this.tokens.add(w));indexPhrase(this.boardIndex,text,95,'board');if(!this.categoryIndexes.has(r.category))this.categoryIndexes.set(r.category,new Map());indexPhrase(this.categoryIndexes.get(r.category),text,103,'board');if(tokens.length&&tokens.length<=4)this.terms.push({text:tokens.join(' '),tags:tags(text,r.category),category:r.category});});
      this.automaticPhrases=automaticPhrases(rows);this.automaticIndex=new Map();this.automaticPhrases.forEach((s,i)=>indexPhrase(this.automaticIndex,s,82-i*.002,'automatic'));
      this.aiPhrases=validatePhrases(prepared,rows);this.aiPhrases.forEach(s=>indexPhrase(this.aiIndex,s,88,'prepared'));
      return this;
    }
    setHistory(history=[]){this.history=history;this.historyIndex=new Map();history.forEach(s=>indexPhrase(this.historyIndex,s.text,105+Math.min(30,Math.log2(1+s.count)*8),'history'));return this;}
    suggest(message,{limit=4,category=''}={}){
      const sentence=String(message).split(/[.!?;\n]+/).at(-1),tokens=words(sentence),out=new Map();
      const add=(text,score,source)=>{if(!usable(text))return;const normalized=key(text);if(!normalized||normalized===tokens.at(-1)||normalized===tokens.join(' '))return;const entry=out.get(normalized);if(!entry||entry.score<score)out.set(normalized,{text:normalized,score,source});};
      if(!tokens.length){
        starters.forEach((text,i)=>add(text,55-i,'built-in'));
        this.history.forEach(h=>{const phrase=words(h.text).slice(0,6).join(' ');if(words(h.text).length>1)add(phrase,65+Math.min(20,Math.log2(1+h.count)*4),'history');});
        // Retain general starters even after extensive personal use.
        const personal=[...out.values()].filter(x=>x.source==='history').sort((a,b)=>b.score-a.score).slice(0,2);
        const common=[...out.values()].filter(x=>x.source!=='history');return [...personal,...common].slice(0,limit).map(display);
      }
      for(let n=Math.min(6,tokens.length);n>=1;n--){
        const ctx=tokens.slice(-n).join(' ');
        for(const index of [this.baseIndex,this.boardIndex,this.historyIndex,this.aiIndex,this.automaticIndex||new Map(),this.categoryIndexes?.get(category)||new Map()])for(const candidate of index.get(ctx)?.values()||[])add(candidate.text,candidate.score+n*4,candidate.source);
        if(n<=2)for(const [text,weight]of this.data.contexts?.[ctx]||[])add(text,16+n*5+weight+(this.tokens.has(text)?16:0),'language');
      }
      const tail=tokens.slice(-4).join(' ');let desired=[];
      if(/(?:^| )(?:want|need|like)(?: some| a| my)?$/.test(tail))desired=['food','object'];
      if(/(?:^| )(?:feel|am)(?: very| so)?$/.test(tail))desired=['feeling'];
      if(/(?:eat|drink)(?: some)?$/.test(tail))desired=['food'];
      if(/(?:go|going)(?: to)?$/.test(tail))desired=['place'];
      if(/(?:want to|need to|like to|can you|could you|please|i can|we can|i will|we will)$/.test(tail))desired=['action'];
      if(/(?:call|see|with|ask)$/.test(tail))desired=['person'];
      this.terms.forEach(term=>{if(desired.some(t=>term.tags.includes(t))){let text=canonical(term.text);if(text==='in pain'&&/(?:^| )feel$/.test(tail))text='pain';if(/(?:go|going)$/.test(tail)&&!['home','outside','inside'].includes(text))text='to '+(['park','shop','store','bathroom','kitchen','library','beach','restaurant','cinema','zoo','pool'].includes(text)?'the ':'')+text;const score=desired.includes('action')?112-Math.max(0,actionOrder.indexOf(words(text)[0]))*.7:96;add(text,score+(term.category===category?2:0),'board');}});
      // Preserve common AAC continuations before less frequent nouns/adjectives.
      let common=[];
      if(/(?:^| )need$/.test(tail))common=['help','a break','water','the bathroom','more time','to rest'];
      else if(/(?:^| )want$/.test(tail))common=['to','water','music','food','a break','to go'];
      else if(/(?:^| )feel$/.test(tail))common=['happy','tired','sad','hungry','thirsty','sick','uncomfortable'];
      common.forEach((text,i)=>{if(words(text).every(w=>this.tokens.has(w)||['a','the','my','some','to'].includes(w))&&(text!=='to'||this.terms.some(t=>t.tags.includes('action'))))add(text,114-i*.8,'board');});
      // Context-free fallback still provides useful continuations without learning first.
      if(!out.size)['and','please','now','again'].forEach((s,i)=>add(s,10-i,'built-in'));
      const ranked=[...out.values()].sort((a,b)=>b.score-a.score||a.text.localeCompare(b.text));
      const selected=[];const roots=new Map();
      for(const item of ranked){const first=words(item.text)[0];if((roots.get(first)||0)>=2)continue;selected.push(item);roots.set(first,(roots.get(first)||0)+1);if(selected.length===limit)break;}
      return selected.map(display);
    }
  }
  function display(item){return {...item,text:item.text.replace(/^i(?=\s|$)/,'I').replace(/\bi'm\b/g,"I'm").replace(/\bi've\b/g,"I've").replace(/\bi'll\b/g,"I'll")};}
  return {Predictor,HISTORY_KEY,MAX_PREPARED,readHistory,remember,validatePhrases,automaticPhrases,analysisBatches,words,key,examples,starters};
});
