const {chromium,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173';let context;
(async()=>{
  const extension=path.join(root,'extension');context=await chromium.launchPersistentContext(path.join(root,'artifacts','journal-calendar-'+Date.now()),{channel:'chromium',headless:true,viewport:{width:1280,height:900},args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/bennyshub/apps/tools/journal/index.html');await page.waitForFunction(()=>BennyExtension.supports('journal'));
  const yesterdayKey=await page.evaluate(()=>{const today=new Date(),yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);BennyData.set('journal.entries',[{id:1,date:today.toISOString(),question:'Today',answer:'Synthetic entry for today.'},{id:2,date:yesterday.toISOString(),question:'Yesterday',answer:'Synthetic entry for yesterday.'}]);NarbeVoiceManager.updateSettings({ttsEnabled:false});return [yesterday.getFullYear(),yesterday.getMonth()+1,yesterday.getDate()].join('-');});
  await page.reload();await page.waitForFunction(()=>BennyExtension.supports('journal'));await page.locator('[data-action="entries"]').click();
  await page.evaluate(()=>{window.journalSpeech=[];NarbeVoiceManager.speak=text=>window.journalSpeech.push(text);});
  const press=async key=>{await page.waitForTimeout(350);await page.keyboard.press(key,{delay:150});};
  await expect(page.locator('.journal-date-nav')).toBeVisible();await expect(page.locator('[data-action="next-day"]')).toBeDisabled();
  await page.locator('[data-action="previous-day"]').click();await expect(page.locator('#entriesList')).toContainText('Synthetic entry for yesterday');await expect(page.locator('[data-action="next-day"]')).toBeEnabled();
  await expect(page.locator('#journalDayContext')).toHaveText('Viewing a past day');
  await press('Space');await expect(page.locator('#entriesScreen [data-action="return-today"]')).toHaveClass(/highlighted/);
  await press('Enter');await expect(page.locator('#journalDayContext')).toHaveText('Today');
  await expect(page.locator('#entriesScreen [data-action="return-today"]')).toBeDisabled();
  await page.locator('[data-action="previous-day"]').click();await page.locator('.entry-item').click();
  await expect(page.locator('.entry-paper')).toContainText('Synthetic entry for yesterday');
  await page.screenshot({path:path.join(root,'artifacts','journal-notebook-entry-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'artifacts','journal-notebook-entry-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#entryViewModal [data-action="return-today"]').click();await expect(page.locator('#entryViewModal')).toHaveClass(/hidden/);await expect(page.locator('#entriesList')).toContainText('Synthetic entry for today');
  await page.setViewportSize({width:1280,height:900});await page.locator('[data-action="previous-day"]').click();
  await page.locator('[data-action="next-day"]').click();await expect(page.locator('#entriesList')).toContainText('Synthetic entry for today');await expect(page.locator('[data-action="next-day"]')).toBeDisabled();
  await page.locator('[data-action="change-view"]').click();await expect(page.locator('.calendar-day[aria-current="date"] .calendar-entry-count')).toHaveText('1');
  await expect.poll(()=>page.evaluate(()=>journalSpeech.at(-1))).toMatch(/^Calendar view\..*entr(?:y|ies) on \d days?\./);
  await press('Space');await expect(page.locator('#calendarPreviousMonth')).toHaveClass(/highlighted/);
  await press('Space');assert.ok(await page.locator('.calendar-week .highlighted').count()>0);
  await expect.poll(()=>page.evaluate(()=>journalSpeech.at(-1))).toMatch(/^Week .*No entries this week\.$|^Week .*\d entr(?:y|ies) on \d days?\.$/);
  await press('Enter');await expect(page.locator('.calendar-week .highlighted')).toHaveCount(1);
  const chosen=await page.locator('.calendar-day.highlighted').getAttribute('data-date');
  await press('Enter');await expect(page.locator('#changeViewModal')).toHaveClass(/hidden/);
  const expected=await page.evaluate(value=>{const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});},chosen);
  await expect(page.locator('#currentPeriod')).toHaveText(expected);
  await page.locator('[data-action="change-view"]').click();await page.locator('#calendarToday').click();await expect(page.locator('#entriesList')).toContainText('Synthetic entry for today');
  await page.locator('[data-action="change-view"]').click();
  if(await page.locator('[data-date="'+yesterdayKey+'"]').count()){
    await page.locator('[data-date="'+yesterdayKey+'"]').click();await expect(page.locator('#entriesList')).toContainText('Synthetic entry for yesterday');await page.locator('[data-action="change-view"]').click();
  }
  await page.locator('#calendarPreviousMonth').click();await expect(page.locator('#calendarNextMonth')).toBeEnabled();await page.locator('#calendarNextMonth').click();
  await page.screenshot({path:path.join(root,'artifacts','journal-calendar-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'artifacts','journal-calendar-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('[data-action="close-view-modal"]').click();await page.screenshot({path:path.join(root,'artifacts','journal-daily-mobile.png')});
  await page.evaluate(()=>BennyData.set('journal.entries',Array.from({length:8},(_,i)=>({id:i+1,date:new Date().toISOString(),question:'Entry '+(i+1),answer:'Synthetic entry.'}))));
  await page.reload();await page.waitForFunction(()=>BennyExtension.supports('journal'));await page.locator('[data-action="entries"]').click();await expect(page.locator('.entry-item')).toHaveCount(8);
  await page.locator('[data-action="change-view"]').click();await expect(page.locator('.calendar-day[aria-current="date"] .calendar-entry-count')).toHaveText('8');
  await expect(page.locator('#calendarOverview')).toContainText('8 entries on 1 day.');
  await page.evaluate(()=>{window.journalSpeech=[];NarbeVoiceManager.speak=text=>window.journalSpeech.push(text);});
  const weeks=await page.locator('.calendar-week').count();
  await press('Space');
  for(let i=0;i<weeks;i++){
    await press('Space');
    if(await page.locator('.calendar-day[aria-current="date"]').evaluate(el=>el.classList.contains('highlighted'))){
      await expect.poll(()=>page.evaluate(()=>journalSpeech.at(-1))).toMatch(/^Week .*8 entries on 1 day\.$/);break;
    }
    if(i===weeks-1)throw Error('Today was not reached by row scanning');
  }
  await page.locator('#calendarPreviousMonth').click();
  await expect.poll(()=>page.evaluate(()=>journalSpeech.at(-1))).toMatch(/No entries this month\./);
  assert.deepEqual(errors,[]);console.log('Journal dates: previous/next, today boundary, entry badges, row/day switch selection, direct selection, month navigation and mobile layout passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
