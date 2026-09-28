'use strict';
// Shares the editor's rows/snapshot/render bindings; only accepted proposals enter CSV.
let analysisWorker=null,analysisTimer=null,analysisSource='',analysisResult=[];
const analysisVocabulary=()=>JSON.stringify(rows.map(r=>[r.category,r.display,r.speak]));
const suggestionPreview=new PhrasePredictions.Predictor(window.PhrasePredictionData);
function showPredictionPreview(){
  suggestionPreview.setBoard(rows).setHistory(PhrasePredictions.readHistory(localStorage));
  const results=suggestionPreview.suggest($('predictionContext').value,{category});
  $('predictionExamples').replaceChildren();
  results.forEach(item=>{const span=document.createElement('span');span.className='preview-suggestion';span.textContent=item.text;$('predictionExamples').append(span);});
  if(!results.length)$('predictionExamples').textContent='No matching continuation on this board yet.';
  const prepared=suggestionPreview.aiPhrases.length;
  $('predictionSummary').textContent='Matches '+suggestionPreview.dictionaryPatternCount.toLocaleString()+' keyboard dictionary patterns against '+suggestionPreview.tokens.size.toLocaleString()+' words across all '+new Set(rows.map(r=>r.category)).size+' categories'+(prepared?', plus '+prepared+' prepared phrases':'')+'. Uses the last two words first, then one-word matches when needed. This preview also includes your saved spoken messages.';
}
function endAnalysis(){if(analysisWorker)analysisWorker.terminate();analysisWorker=null;clearTimeout(analysisTimer);$('analyzeBoard').disabled=false;$('cancelAnalysis').hidden=true;}
$('predictionContext').addEventListener('input',showPredictionPreview);
$('analyzeBoard').onclick=()=>{
  if(!navigator.gpu){$('analysisStatus').textContent='This browser does not offer WebGPU. Automatic and learned suggestions are already available without the optional model.';return;}
  endAnalysis();analysisSource=analysisVocabulary();analysisResult=[];$('analysisReview').hidden=true;$('analyzeBoard').disabled=true;$('cancelAnalysis').hidden=false;
  $('analysisStatus').textContent='Loading the optional model. First use downloads model files; you can cancel and keep editing.';
  try{
    analysisWorker=new Worker('prediction-worker.js',{type:'module'});
    analysisTimer=setTimeout(()=>{endAnalysis();$('analysisStatus').textContent='Analysis timed out. Automatic suggestions are still ready; try a smaller board or another device.';},Math.min(60*60*1000,3*60*1000+PhrasePredictions.analysisBatches(rows).length*60*1000));
    analysisWorker.onerror=()=>{endAnalysis();$('analysisStatus').textContent='The optional model could not load. Check your connection or try another browser. Automatic suggestions still work.';};
    analysisWorker.onmessage=event=>{
      const result=event.data;
      if(result.type==='progress'){$('analysisStatus').textContent=result.text;return;}
      endAnalysis();
      if(result.type==='error'){$('analysisStatus').textContent=result.text;return;}
      if(analysisVocabulary()!==analysisSource){$('analysisStatus').textContent='The board changed during analysis. Run analysis again for the updated vocabulary.';return;}
      analysisResult=PhrasePredictions.validatePhrases(result.phrases,rows);
      $('analysisStatus').textContent=analysisResult.length?'Review '+analysisResult.length+' additional AI phrases. '+suggestionPreview.dictionaryPatternCount.toLocaleString()+' matching dictionary patterns already work automatically.':'The model did not produce usable additional phrases. Automatic suggestions are already ready.';
      $('analysisChoices').replaceChildren();
      analysisResult.forEach((phrase,index)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.value=index;label.append(input,document.createTextNode(phrase));$('analysisChoices').append(label);});
      $('analysisReview').hidden=!analysisResult.length;
    };
    analysisWorker.postMessage({rows:rows.map(r=>({category:r.category,display:r.display,speak:r.speak})),model:$('analysisModel').value});
  }catch(error){endAnalysis();$('analysisStatus').textContent=error.message;}
};
$('cancelAnalysis').onclick=()=>{endAnalysis();$('analysisStatus').textContent='Analysis canceled. Automatic suggestions are still ready.';};
$('applyAnalysis').onclick=()=>{
  if(analysisVocabulary()!==analysisSource){$('analysisStatus').textContent='The board changed. Run analysis again before applying these phrases.';return;}
  const chosen=[...$('analysisChoices').querySelectorAll('input:checked')].map(n=>analysisResult[Number(n.value)]);
  snapshot();const prepared=JSON.stringify(PhrasePredictions.validatePhrases([...suggestionPreview.aiPhrases,...chosen],rows));rows.forEach(r=>r.predictionPhrases=prepared);$('analysisReview').hidden=true;render();showPredictionPreview();status('Prepared suggestions added. Save to use them on the board.');
};
$('clearPrepared').onclick=()=>{snapshot();rows.forEach(r=>r.predictionPhrases='');$('analysisReview').hidden=true;render();showPredictionPreview();status('Prepared phrases removed. Automatic and learned suggestions still work. Save to apply.');};
// Rebuild on edits/imports, not on every live scan step.
const renderBeforePredictions=render;
render=function(){renderBeforePredictions();showPredictionPreview();};
showPredictionPreview();
window.addEventListener('pagehide',endAnalysis);
window.addEventListener('storage',event=>{if(event.key===PhrasePredictions.HISTORY_KEY||event.key===null)showPredictionPreview();});
