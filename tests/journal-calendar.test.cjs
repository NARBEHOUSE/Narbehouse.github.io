const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('journal month navigation clamps month ends and preserves leap day',()=>{
  const env={window:{}};vm.runInNewContext(fs.readFileSync('bennyshub/apps/tools/journal/calendar-view.js','utf8'),env);
  const shift=env.window.BennyJournalCalendar.shiftMonth;
  for(const [year,month,day,delta,want]of [[2026,2,31,-1,[2026,1,28]],[2024,2,31,-1,[2024,1,29]],[2026,0,31,1,[2026,1,28]],[2026,0,15,-1,[2025,11,15]]]){
    const original=new Date(year,month,day),result=shift(original,delta);
    assert.deepEqual([result.getFullYear(),result.getMonth(),result.getDate()],want);assert.equal(original.getDate(),day);
  }
});
