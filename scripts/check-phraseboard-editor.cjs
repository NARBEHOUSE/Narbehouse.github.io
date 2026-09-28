// Uses a disposable profile and mocked symbol responses; no personal boards are touched.
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const PB=require('../bennyshub/apps/tools/phraseboard/board-core.js');
const root=path.resolve(__dirname,'..'),url='http://127.0.0.1:4173/bennyshub/apps/tools/phraseboard/';
const executablePath=process.env.PHRASEBOARD_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const symbol='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><circle cx="1500" cy="1500" r="1400" fill="orange"/></svg>');
  await context.route('https://www.opensymbols.org/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{name:'test symbol',image_url:symbol,license:'CC0',author:'Test'}])}));
  await page.goto(url+'phrase-editor.html');
  const fixture=PB.normalize([{category:'Words',display:'I',speak:'I',image:symbol},{category:'Words',display:'want',speak:'want'},{category:'Words',display:'music',speak:'music'},{category:'Food',display:'pizza',speak:'pizza'},{category:'Food',display:'water',speak:'water'},{category:'Media',display:'Watch',speak:'https://www.youtube.com/watch?v=test'}].map((r,i)=>({...r,boardName:'Graphic practice',categoryOrder:r.category==='Words'?1:r.category==='Food'?2:3,tileOrder:i+1,scanOrder:i+1})));
  await page.evaluate(csv=>{PhraseBoard.save(localStorage,PhraseBoard.parse(csv));},PB.csv(fixture));await page.reload();
  // The program-style menu overlays the page without moving the header or canvas.
  const headerBefore=await page.locator('header').boundingBox(),canvasBefore=await page.locator('#canvas').boundingBox();
  await page.locator('#boardMenuButton').click();await expect(page.locator('#boardMenu')).toBeVisible();
  assert.deepEqual(await page.locator('header').boundingBox(),headerBefore);assert.deepEqual(await page.locator('#canvas').boundingBox(),canvasBefore);
  await page.keyboard.press('ArrowDown');await expect(page.locator('#import')).toBeFocused();await page.keyboard.press('End');await expect(page.locator('#reload')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#boardMenuButton')).toBeFocused();
  await page.locator('#boardMenuButton').click();await page.locator('#openSuggestions').click();await expect(page.locator('#analysisModel')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#boardOptions')).toBeHidden();
  await page.locator('#boardMenuButton').click();await page.locator('header h1').click();await expect(page.locator('#boardMenu')).toBeHidden();
  await page.locator('#boardSearch').fill('water');await expect(page.locator('#boardSearchStatus')).toContainText('1 exact match');await page.locator('.word-search-result').filter({hasText:'water'}).click();await expect(page.locator('#categoryName')).toHaveValue('Food');
  await page.locator('#boardSearch').fill('no-such-word-xyz');await expect(page.locator('#boardSearchStatus')).toContainText('No matching');await page.locator('#boardSearch').fill('');await page.locator('#categories button').filter({hasText:'Words'}).click();
  await expect(page.locator('#boardOptions')).not.toHaveAttribute('open','');await expect(page.locator('#tileImagePreview')).toBeVisible();
  await page.locator('.canvas-tile').first().locator('input[type=checkbox]').uncheck();assert.equal(await page.evaluate(()=>selectedTiles.size),0);
  await page.locator('.canvas-tile').nth(1).click();await expect(page.locator('#tileImagePreview')).toBeHidden();assert.equal(await page.locator('#tileImagePreview').getAttribute('src'),null);
  await page.locator('[data-symbol-target="tile"]').click();await expect(page.locator('#symbolResults img').first()).toBeVisible();
  assert.equal(await page.locator('#symbolDialog').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
  assert.ok((await page.locator('#symbolResults img').first().boundingBox()).width<=88);
  await page.locator('#symbolResults button').first().click();await expect(page.locator('#tileImagePreview')).toBeVisible();
  await page.locator('.canvas-tile').nth(2).click();await expect(page.locator('#tileImagePreview')).toBeHidden();
  // Automatic symbol lookup remains available when committing a phrase.
  await page.locator('#display').fill('happy');await page.locator('#display').blur();await expect(page.locator('#tileImagePreview')).toBeVisible();
  await page.locator('#mapView').click();await expect(page.locator('.map-category')).toHaveCount(3);
  // Zoom and pan change only the viewport, with a reliable way to see the full board.
  const csvBefore=await page.evaluate(()=>PB.csv(rows));await page.locator('#mapFit').click();
  const scaleBefore=await page.evaluate(()=>mapZoom),widthBefore=(await page.locator('.map-category').first().boundingBox()).width;
  await page.locator('#mapZoomOut').click();assert.ok(await page.evaluate(old=>mapZoom<old,scaleBefore));assert.ok((await page.locator('.map-category').first().boundingBox()).width<widthBefore);
  await page.locator('#mapZoomIn').click();
  const viewport=page.locator('.canvas-scroll'),viewBox=await viewport.boundingBox();
  await page.mouse.move(viewBox.x+viewBox.width/2,viewBox.y+viewBox.height/2);await page.keyboard.down('Control');await page.mouse.wheel(0,-150);await page.keyboard.up('Control');await page.waitForTimeout(50);assert.ok(await page.evaluate(old=>mapZoom>old,scaleBefore));
  await expect(page.locator('#mapPan .cursor-icon')).toBeVisible();await expect(page.locator('#mapPan .hand-icon')).toBeHidden();await page.locator('#mapPan').click();await expect(page.locator('#mapPan')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#mapPan .hand-icon')).toBeVisible();await expect(page.locator('#mapPan .cursor-icon')).toBeHidden();const wheelZoom=await page.evaluate(()=>mapZoom);await page.mouse.move(viewBox.x+120,viewBox.y+120);await page.mouse.wheel(0,160);await page.waitForTimeout(50);assert.ok(await page.evaluate(old=>mapZoom<old,wheelZoom));const scrollBefore=await viewport.evaluate(n=>n.scrollLeft);await page.mouse.move(viewBox.x+80,viewBox.y+110);await page.mouse.down();await page.mouse.move(viewBox.x+150,viewBox.y+150,{steps:5});await page.mouse.up();assert.notEqual(await viewport.evaluate(n=>n.scrollLeft),scrollBefore);await page.locator('#mapPan').click();await expect(page.locator('#mapPan .cursor-icon')).toBeVisible();await expect(page.locator('#mapPan')).toHaveAttribute('aria-pressed','false');
  assert.equal(await page.evaluate(()=>PB.csv(rows)),csvBefore);
  await page.locator('#mapDetails').click();await expect(page.locator('#inspector')).toBeHidden();await page.locator('#mapFit').click();
  const fullBoard=await page.locator('#canvas').boundingBox();assert.ok(fullBoard.x>=viewBox.x&&fullBoard.y>=viewBox.y);assert.ok(fullBoard.x+fullBoard.width<=viewBox.x+viewBox.width+1&&fullBoard.y+fullBoard.height<=viewBox.y+viewBox.height+1);
  await page.locator('#mapZoomOut').click();
  // Box-select two tiles, then change both colors from their context menu.
  const first=page.locator('.map-category').first().locator('.canvas-tile');
  const a=await first.nth(0).boundingBox(),b=await first.nth(1).boundingBox();
  await page.mouse.move(a.x-4,a.y-4);await page.mouse.down();await page.mouse.move(b.x+b.width+4,b.y+b.height+2,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>selectedTiles.size),2);
  await first.nth(0).click({button:'right'});await expect(page.locator('.map-context-menu')).toBeVisible();
  await page.locator('.map-context-menu input[type=color]').evaluate(n=>{n.value='#e04488';n.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.deepEqual(await page.evaluate(()=>[rows[0].tileColor,rows[1].tileColor]),['#e04488','#e04488']);
  assert.ok((await first.nth(0).evaluate(n=>getComputedStyle(n).backgroundColor)).includes('224, 68, 136'));
  await page.locator('.map-context-menu').getByRole('button',{name:'Close',exact:true}).click();
  const drag=async(source,target,after=false)=>{await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await target.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width*(after?.8:.3),b.y+b.height/2,{steps:12});await page.mouse.up();};
  // Drag the selection into another category; Undo restores both tiles.
  await drag(first.nth(0),page.locator('.map-category-heading').filter({hasText:'Food'}));
  assert.deepEqual(await page.evaluate(()=>[rows[0].category,rows[1].category]),['Food','Food']);
  await page.locator('#undo').click();assert.deepEqual(await page.evaluate(()=>[rows[0].category,rows[1].category]),['Words','Words']);
  await drag(page.locator('.map-category-heading').filter({hasText:'Words'}),page.locator('.map-category-heading').filter({hasText:'Media'}),true);
  assert.deepEqual(await page.evaluate(()=>orderedCategories()),['Food','Media','Words']);await page.locator('#undo').click();
  await page.locator('.map-category-heading').filter({hasText:'Food'}).click({button:'right'});
  await page.locator('.map-context-menu input[type=color]').evaluate(n=>{n.value='#448844';n.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>rows.find(r=>r.category==='Food').categoryColor),'#448844');await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(root,'artifacts','phraseboard-editor-map.png')});
  // Category headings can also be box-selected and moved as a group.
  const heads=page.locator('.map-category-heading'),ha=await heads.nth(0).boundingBox(),hb=await heads.nth(1).boundingBox();
  await page.mouse.move(ha.x-4,ha.y-4);await page.mouse.down();await page.mouse.move(hb.x+hb.width+4,hb.y+hb.height+2,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>selectedCategories.size),2);assert.equal(await page.evaluate(()=>selectedTiles.size),0);
  await drag(page.locator('.map-category-heading').filter({hasText:'Words'}),page.locator('.map-category-heading').filter({hasText:'Media'}),true);
  assert.deepEqual(await page.evaluate(()=>orderedCategories()),['Media','Words','Food']);await page.locator('#undo').click();
  await page.locator('#mapDetails').click();
  // Move to names the selection, requires a destination, and leaves the source category visible.
  await page.locator('.map-category-heading').filter({hasText:'Words'}).click();await page.locator('#basicView').click();await page.locator('.canvas-tile').first().click();
  await page.locator('.bulk-more > summary').click();await page.locator('#moveTiles').click();await expect(page.locator('#moveTilesDescription')).toContainText('1 selected tile');await expect(page.locator('#confirmMoveTiles')).toBeDisabled();await page.locator('#moveCategory').selectOption('Food');await page.locator('#confirmMoveTiles').click();
  await expect(page.locator('#categoryName')).toHaveValue('Words');assert.equal(await page.evaluate(()=>rows[0].category),'Food');await expect(page.locator('#status')).toContainText('Moved 1 tile');await page.locator('#undo').click();await expect(page.locator('#bulkScanGroup')).toBeHidden();await page.locator('.bulk-more > summary').click();
  await page.locator('#mapView').click();
  // Basic grid drag reorders; free placement still supports direct placement.
  await page.locator('.map-category-heading').filter({hasText:'Words'}).click();await page.locator('#basicView').click();await page.locator('#deselectTiles').click();
  await drag(page.locator('.canvas-tile').first(),page.locator('.canvas-tile').last(),true);
  assert.deepEqual(await page.locator('.canvas-tile > span:not(.resize-handle)').allTextContents(),['want','happy','I']);
  await page.locator('#categoryLayout').selectOption('free');const old=await page.evaluate(()=>({x:rows[0].x,y:rows[0].y}));
  const tile=page.locator('.canvas-tile[data-index="0"]');const box=await tile.boundingBox();await page.mouse.move(box.x+50,box.y+40);await page.mouse.down();await page.mouse.move(box.x+80,box.y+65,{steps:5});await page.mouse.up();assert.ok(await page.evaluate(old=>rows[0].x>old.x&&rows[0].y>old.y,old));
  await page.locator('#save').click();await page.locator('#preview').click();await expect(page.frameLocator('#previewFrame').locator('#editBoard')).toBeHidden();await page.locator('#closePreview').click();
  await page.screenshot({path:path.join(root,'artifacts','phraseboard-editor-basic.png')});
  await page.locator('#return').click();await expect(page.locator('#statusFooter')).toContainText('Saved changes loaded');await page.evaluate(()=>{state.sentenceMode=true;state.predictionsEnabled=true;state.ttsOnScan=true;state.sentence=[{text:'I'}];window.spoken=[];speak=text=>spoken.push(text);renderMessage();});
  await page.evaluate(()=>{const index=groupScanner.groups.findIndex(g=>g.name==='Suggestions');groupScanner.group=index;groupScanner.tile=0;paintGroups();});
  assert.ok(await page.evaluate(()=>spoken.length>0));
  await page.evaluate(()=>renderMainMenu());await expect(page.locator('#sentenceRow')).toBeHidden();
  // The real expanded board remains a flat tree; search zooms to a word in any category.
  const wordsEditor=await context.newPage();await wordsEditor.route('https://d18vdu4p71yql0.cloudfront.net/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>'}));
  await wordsEditor.goto(url+'phrase-editor.html');await wordsEditor.evaluate(csv=>{PhraseBoard.save(localStorage,PhraseBoard.parse(csv));},fs.readFileSync(path.join(root,'bennyshub/apps/tools/phraseboard/boards/NARBE_Words.csv'),'utf8'));await wordsEditor.reload();await wordsEditor.locator('#mapView').click();await wordsEditor.locator('#mapFit').click();
  const tops=await wordsEditor.locator('.map-category-heading').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));assert.equal(new Set(tops).size,1);
  await wordsEditor.locator('#boardSearch').fill('go');await expect(wordsEditor.locator('#boardSearchStatus')).toContainText('1 exact match');await wordsEditor.locator('.word-search-result').filter({has:wordsEditor.locator('strong',{hasText:/^go$/})}).click();await expect(wordsEditor.locator('#categoryName')).toHaveValue('Core');assert.ok(await wordsEditor.evaluate(()=>mapZoom>=.85));
  const found=await wordsEditor.locator('.canvas-tile.selected').boundingBox(),visible=await wordsEditor.locator('.canvas-scroll').boundingBox();assert.ok(found.x>=visible.x&&found.y>=visible.y&&found.x+found.width<=visible.x+visible.width&&found.y+found.height<=visible.y+visible.height);
  await wordsEditor.close();

  // Default boards open as personal copies, preserving the saved board until Save.
  const defaultsContext=await browser.newContext({viewport:{width:1200,height:900}}),defaults=await defaultsContext.newPage();
  defaults.on('pageerror',e=>errors.push(e.message));
  await defaultsContext.route('https://**',r=>r.abort());
  await defaults.goto(url+'phrase-editor.html');await defaults.evaluate(csv=>PhraseBoard.save(localStorage,PhraseBoard.parse(csv)),PB.csv(fixture));await defaults.reload();
  const originalCsv=await defaults.evaluate(()=>PB.csv(rows));
  const openDefaults=async()=>{await defaults.locator('#boardMenuButton').click();await defaults.locator('#openDefaultBoards').click();await expect(defaults.locator('#defaultBoardsDialog')).toBeVisible();};
  const files=JSON.parse(fs.readFileSync(path.join(root,'bennyshub/apps/tools/phraseboard/boards/index.json'),'utf8')).files;
  await openDefaults();await expect(defaults.locator('#createDefaultCopy')).toBeEnabled();
  assert.deepEqual(await defaults.locator('#defaultBoardChoice option').evaluateAll(nodes=>nodes.map(n=>n.value)),files);
  await defaults.keyboard.press('Escape');await expect(defaults.locator('#boardMenuButton')).toBeFocused();assert.equal(await defaults.evaluate(()=>PB.csv(rows)),originalCsv);
  for(const file of files){
    await openDefaults();await expect(defaults.locator('#createDefaultCopy')).toBeEnabled();await defaults.locator('#defaultBoardChoice').selectOption(file);await expect(defaults.locator('#createDefaultCopy')).toBeEnabled();
    const source=PB.parse(fs.readFileSync(path.join(root,'bennyshub/apps/tools/phraseboard/boards',file),'utf8'));
    await expect(defaults.locator('#defaultBoardStatus')).toContainText(source.length.toLocaleString()+' tiles');
    const savedBefore=await defaults.evaluate(()=>localStorage.getItem(PB.KEY));
    await defaults.locator('#defaultBoardName').fill('My test copy');await defaults.locator('#createDefaultCopy').click();
    assert.deepEqual(await defaults.evaluate(()=>rows),PB.normalize(source.map(r=>({...r,boardName:'My test copy'}))));
    assert.equal(await defaults.evaluate(()=>localStorage.getItem(PB.KEY)),savedBefore);assert.equal(await defaults.evaluate(()=>dirty),true);
    await defaults.locator('#undo').click();assert.equal(await defaults.evaluate(()=>PB.csv(rows)),originalCsv);await defaults.locator('#save').click();
  }
  // Network failure and declined replacement leave the current edits intact.
  await defaults.locator('#boardName').fill('Work to keep');await defaults.locator('#boardName').blur();
  const editedCsv=await defaults.evaluate(()=>PB.csv(rows));
  const brokenUrl=url+'boards/NARBE_Default.csv';await defaults.route(brokenUrl,r=>r.fulfill({status:503,body:'Unavailable'}));
  await openDefaults();await expect(defaults.locator('#retryDefaultBoards')).toBeVisible();await expect(defaults.locator('#createDefaultCopy')).toBeDisabled();assert.equal(await defaults.evaluate(()=>PB.csv(rows)),editedCsv);
  await defaults.unroute(brokenUrl);await defaults.locator('#retryDefaultBoards').click();await expect(defaults.locator('#createDefaultCopy')).toBeEnabled();
  defaults.once('dialog',d=>d.dismiss());await defaults.locator('#createDefaultCopy').click();await expect(defaults.locator('#defaultBoardsDialog')).toBeVisible();assert.equal(await defaults.evaluate(()=>PB.csv(rows)),editedCsv);
  defaults.once('dialog',d=>d.accept());await defaults.locator('#createDefaultCopy').click();await expect(defaults.locator('#defaultBoardsDialog')).toBeHidden();
  await defaults.locator('#save').click();const personalCsv=await defaults.evaluate(()=>PB.csv(rows));await defaults.reload();assert.equal(await defaults.evaluate(()=>PB.csv(rows)),personalCsv);
  // A late response after closing the picker cannot replace the board.
  let releaseDownload,downloadStarted;const downloading=new Promise(resolve=>downloadStarted=resolve);
  await defaults.route(brokenUrl,async r=>{downloadStarted();await new Promise(resolve=>releaseDownload=resolve);await r.fulfill({contentType:'text/csv',body:PB.csv(fixture)}).catch(()=>{});});
  await openDefaults();await downloading;await defaults.locator('#cancelDefaultBoards').click();releaseDownload();await expect(defaults.locator('#defaultBoardsDialog')).toBeHidden();assert.equal(await defaults.evaluate(()=>PB.csv(rows)),personalCsv);
  await defaultsContext.close();
  assert.deepEqual(errors,[]);console.log('Editor checks passed: default-board copies, failure/cancel recovery, overlay menu/keyboard, zoom/pan/fit, symbols, automatic images, inspector reset, box selection while zoomed, bulk colors, tile/category drag, undo, preview isolation, spoken suggestions.');await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
