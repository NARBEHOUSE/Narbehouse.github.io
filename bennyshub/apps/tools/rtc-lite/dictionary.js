/* RTC Lite adapter for the web Keyboard's existing prediction JSON.
   No extra canned words, remote prediction service, or dictionary copy. */
(function(){
'use strict';
const dataUrl=new URL('../keyboard/web_keyboard_predictions.json',document.currentScript.src).href;
class RtcDictionary {
 constructor(){this.data={frequent_words:{},bigrams:{},trigrams:{}};this.loadError=null;this.ready=this.load();}
 async load(){try{const response=await fetch(dataUrl);if(!response.ok)throw Error('Dictionary unavailable.');const data=await response.json();if(!data?.frequent_words)throw Error('Invalid dictionary.');this.data=data;}catch(e){this.loadError=e;}}
 calculateScore(value){return Number(value?.count)||0;}
 async getHybridPredictions(buffer){
  await this.ready;
  const input=String(buffer).replace(/\s+/g,' ').toUpperCase(),parts=input.trim().split(' ').filter(Boolean),partial=input.endsWith(' ')?'':parts.pop()||'';
  const context=parts,previous=partial?'':context.at(-1),scores=new Map();
  for(const [field,n,boost] of [['trigrams',2,100],['bigrams',1,10]]){
   const prefix=context.slice(-n).join(' ');if(context.length<n||!prefix)continue;
   for(const [key,value] of Object.entries(this.data[field]||{})){
    const words=key.toUpperCase().split(' ');if(words.length!==n+1||words.slice(0,n).join(' ')!==prefix)continue;
    const word=words.at(-1);if(word.startsWith(partial)&&word!==previous)scores.set(word,(scores.get(word)||0)+this.calculateScore(value)*boost);
   }
  }
  const words=[...scores].sort((a,b)=>b[1]-a[1]).map(([word])=>word);
  if(!this.frequent)this.frequent=Object.entries(this.data.frequent_words).sort((a,b)=>this.calculateScore(b[1])-this.calculateScore(a[1])).map(([word])=>word.toUpperCase());
  for(const word of this.frequent){if(words.length>=6)break;if(word.startsWith(partial)&&word!==previous&&!words.includes(word))words.push(word);}
  return words.slice(0,6);
 }
  async getPhrasePredictions(buffer, seedWords, limit = 5) {
    await this.ready;
    // Build small context lookups once. Never invent links between unrelated words.
    if (this.phraseIndexData !== this.data) {
      this.phraseIndexData = this.data;
      this.phraseBigrams = new Map();
      this.phraseTrigrams = new Map();
      for (const [field, size, index] of [['bigrams', 2, this.phraseBigrams], ['trigrams', 3, this.phraseTrigrams]]) {
        for (const [key, data] of Object.entries(this.data[field] || {})) {
          const parts = key.toUpperCase().trim().split(/\s+/);
          if (parts.length !== size || parts.some(word => !/^[\p{L}\p{N}'’-]+$/u.test(word))) continue;
          const context = parts.slice(0, -1).join(' ');
          if (!index.has(context)) index.set(context, []);
          index.get(context).push({ word: parts.at(-1), data });
        }
      }
    }
    const input = String(buffer).replace('|', '').replace(/\s+/g, ' ').toUpperCase();
    const parts = input.trim().split(' ').filter(Boolean);
    const context = input.endsWith(' ') ? parts : parts.slice(0, -1);
    const next = (prefix, onlyTrigrams = false) => {
      const choices = new Map();
      const add = (entries, specificity) => {
        for (const item of entries || []) {
          if (item.word === prefix.at(-1)) continue;
          if (!choices.has(item.word)) choices.set(item.word, { ...item, specificity });
        }
      };
      add(this.phraseTrigrams.get(prefix.slice(-2).join(' ')), 2);
      if (!choices.size && !onlyTrigrams) add(this.phraseBigrams.get(prefix.at(-1)), 1);
      return [...choices.values()].sort((a, b) => b.specificity - a.specificity || this.calculateScore(b.data) - this.calculateScore(a.data));
    };
    const words = seedWords || await this.getHybridPredictions(buffer, { dictionaryOnly: true });
    const contextual = new Set(next(context).map(item => item.word));
    const matching = words.filter(word => contextual.has(word.toUpperCase()));
    const candidates = [];
    (matching.length ? matching : words).filter(Boolean).slice(0, 6).forEach((first, i) => {
      first = first.toUpperCase();
      next([...context, first]).slice(0, 3).forEach(({word: second}, j) => {
        candidates.push({text:first + ' ' + second, rank:i * 2 + j});
        // A matching three-word pattern already includes the draft's previous word.
        // Keep that complete unit instead of extending it into a less reliable chain.
        if (this.phraseTrigrams.get([...context, first].slice(-2).join(' '))?.some(item => item.word === second)) return;
        // A third word must be an observed three-word sequence, not a loose chain.
        next([first, second], true).slice(0, 2).forEach(({word: third}, k) => {
          candidates.push({text:first + ' ' + second + ' ' + third, rank:i * 2 + j + 2.5 + k});
        });
      });
    });
    const seen = new Set();
    return candidates.sort((a, b) => a.rank - b.rank).map(item => item.text).filter(text => {
      if (seen.has(text)) return false;
      seen.add(text); return true;
    }).slice(0, limit);
  }

}
window.predictionSystem=new RtcDictionary();
})();
