// Phrase Board: starter suggestions + tiles always make a sensible spoken sentence.
// Run with the preview server on 4173: node scripts/check-phraseboard-short-forms.cjs
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const url='http://127.0.0.1:4173/bennyshub/apps/tools/phraseboard/';
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
    await context.route('https://**',route=>route.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'index.html');
    await expect(page.locator('#statusFooter')).toHaveText('Pick a board to start, try Narbe Default');
    // Open it the way the tester did: Narbe Default, then Needs.
    await page.locator('#mainGrid button',{hasText:/^Narbe Default$/}).click();
    await page.locator('#mainGrid button',{hasText:/^Needs$/}).first().click();
    await page.evaluate(()=>{state.predictionsEnabled=true;state.sentenceMode=true;state.ttsOnScan=false;speak=()=>{};renderMessage();});
    const message=()=>page.evaluate(()=>messageText());
    const clear=()=>page.evaluate(()=>clearSentence());
    const starter=text=>page.locator('[data-prediction]',{hasText:new RegExp('^'+text+'$')}).click();
    const tile=text=>page.locator('#mainGrid button:not([data-prediction])',{hasText:new RegExp('^\\s*'+text+'\\s*$')}).first().click();

    // The tester's example: "I need" + Drink.
    await starter('I need');await tile('Drink');
    assert.equal(await message(),'I need a drink');
    // Every Needs tile has a short form that follows "I need".
    for(const [label,expected] of [['Bathroom','I need the bathroom'],['Food','I need something to eat'],['TV','I need the TV on']]){
      await clear();await starter('I need');await tile(label);assert.equal(await message(),expected);
    }
    // "I want" works too.
    await clear();await starter('I want');await tile('Music');assert.equal(await message(),'I want to listen to music');

    // No starter: the full sentence, exactly as before.
    await clear();await tile('Drink');assert.equal(await message(),'Can I have a drink, please?');
    // Tile after tile still appends.
    await tile('Bed');assert.equal(await message(),'Can I have a drink, please? I want to rest in bed');

    // A full-sentence tile with no short form replaces the starter instead of appending.
    await clear();await starter('I need');
    await page.evaluate(()=>openCategory('Basic'));await tile('How are you\\?');
    assert.equal(await message(),'How are you?');
    // Earlier tiles are kept; only the trailing starter is replaced.
    // (Starters are offered at the start of a sentence, so the earlier tile ends with "?".)
    await page.evaluate(()=>openCategory('Needs'));await clear();await tile('Drink');await starter('I need');
    await page.evaluate(()=>openCategory('Basic'));await tile('How are you\\?');
    assert.equal(await message(),'Can I have a drink, please? How are you?');

    // A short whole sentence ("I'm happy") also replaces the starter.
    await clear();await starter('I need');await page.evaluate(()=>openCategory('Feelings'));await tile('Happy');
    assert.equal(await message(),"I'm happy");
    // A one-word tile with no short form after a starter still appends.
    await clear();await starter('I want');await page.evaluate(()=>openCategory('People'));await tile('Mom');
    assert.equal(await message(),'I want Mom');

    assert.deepEqual(errors,[]);
    console.log('Phrase Board short forms passed: starter + short form, full sentence replaces starter, no-starter and tile-after-tile unchanged, one-word tiles append, new status line.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
