const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../bennyshub/shared/communication-pocket.js');
test('an all-capitals message from the keyboard is spoken in sentence case',async()=>{
  const {pocketCase}=await load();
  assert.equal(pocketCase('I HAVE A QUESTION FOR YOU'),'I have a question for you');
  assert.equal(pocketCase('DO YOU HAVE THE REMOTE? I WANT IT. THANKS'),'Do you have the remote? I want it. Thanks');
  assert.equal(pocketCase("I'M HUNGRY AND I'LL WAIT, DON'T GO"),"I'm hungry and I'll wait, don't go");
});
test('names keep a capital and known acronyms stay in capitals',async()=>{
  const {pocketCase}=await load();
  assert.equal(pocketCase('CAN YOU ASK ARI TO COME HERE'),'Can you ask Ari to come here');
  assert.equal(pocketCase('OK TURN ON THE TV FOR BENNY'),'OK turn on the TV for Benny');
  assert.equal(pocketCase('WATCH ESPN AT 7'),'Watch ESPN at 7');
});
test('names from Settings are said as spelled there',async()=>{
  const {pocketCase}=await load();
  assert.equal(pocketCase('TELL MCKENNA AND MARY ANN I SAID HI',['McKenna','Mary Ann']),'Tell McKenna and Mary Ann I said hi');
  assert.equal(pocketCase('ASK ARI',['ari']),'Ask Ari'); // a name typed in lowercase still gets its capital
  assert.equal(pocketCase('ASK ZOË ABOUT IT',['Zoë']),'Ask Zoë about it');
});
test('Ari is respelled so Pocket says it like "sorry", wherever it is',async()=>{
  const {pocketText}=await load();
  assert.equal(pocketText('ARI IS MY BROTHER'),'Ahree is my brother');
  assert.equal(pocketText("MY BROTHER IS ARI. ARI'S HERE"),"My brother is Ahree. Ahree's here");
  assert.equal(pocketText('Ask ari about Ariel'),'Ask Ahree about Ariel');
});
test('text with any lowercase is left as written',async()=>{
  const {pocketCase}=await load();
  for(const text of ['I have a question','Ask ari','NASA called me','123 456'])assert.equal(pocketCase(text),text);
});
