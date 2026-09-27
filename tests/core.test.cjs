const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('all new classic JavaScript and inline application scripts parse',()=>{
  const dirs=['bennyshub/apps/tools/dayhub','bennyshub/apps/tools/journal','bennyshub/apps/tools/streaming','bennyshub/apps/tools/keyboard','extension'];
  const extra=['bennyshub/index.html','bennyshub/shared/extension-client.js','bennyshub/shared/tool-gate.js','bennyshub/shared/web-data.js','bennyshub/shared/web-tool-ui.js','bennyshub/data-settings.js','bennyshub/service-worker.js'];
  const files=[...extra,...dirs.flatMap(d=>fs.readdirSync(path.join(root,d)).map(f=>d+'/'+f))];
  for(const f of files){if(f.endsWith('.js'))new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});if(f.endsWith('.html')){const html=fs.readFileSync(path.join(root,f),'utf8');for(const match of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:f});}}
});
test('privileged URL policy rejects lookalikes and arbitrary hosts',async()=>{
  const p=await import('../extension/policy.mjs');assert.equal(p.isHub('http://127.0.0.1:4173/bennyshub/index.html'),true);assert.equal(p.isHub('http://127.0.0.1:3000/bennyshub/index.html'),true);assert.equal(p.isHub('http://localhost:3000/bennyshub/index.html'),true);assert.equal(p.isHub('http://127.0.0.1:3001/bennyshub/index.html'),false);assert.equal(p.isHub('https://evil.example/bennyshub/'),false);
  for(const url of ['javascript:alert(1)','https://www.netflix.com.evil.example/watch/1','http://www.youtube.com/watch?v=1','https://user:secret@www.youtube.com/watch?v=1','http://192.168.1.1/','https://www.youtube.com:444/'])assert.throws(()=>p.playerURL(url));
  assert.equal(p.playerURL('https://www.youtube.com/watch?v=test').hostname,'www.youtube.com');assert.equal(p.playerURL('http://127.0.0.1:4173/bennyshub/test-player.html').hostname,'127.0.0.1');assert.throws(()=>p.playerURL('http://127.0.0.1:4173/private'));
  assert.throws(()=>p.calendarURL('https://calendar.google.com.evil.example/calendar/ical/a.ics'));
});
test('public streaming starts empty and has original PNG cards',()=>{
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'bennyshub/apps/tools/streaming/data.json'),'utf8')),[]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'bennyshub/apps/tools/streaming/episodes.json'),'utf8')),{});
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'bennyshub/apps/tools/tools.json')));
  for(const tool of catalog.tools)assert.ok(fs.existsSync(path.join(root,'bennyshub',tool.image)));
});

test('calendar expands recurrence, EXDATE, override, all-day and cancellation',async()=>{
  const {calendarWeek}=await import('../extension/calendar.mjs');const ics=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:daily','DTSTART:20260927T120000Z','DTEND:20260927T130000Z','RRULE:FREQ=DAILY;COUNT=4','EXDATE:20260928T120000Z','SUMMARY:Daily','END:VEVENT','BEGIN:VEVENT','UID:daily','RECURRENCE-ID:20260929T120000Z','DTSTART:20260929T140000Z','DTEND:20260929T150000Z','SUMMARY:Changed','END:VEVENT','BEGIN:VEVENT','UID:all','DTSTART;VALUE=DATE:20260930','DTEND;VALUE=DATE:20261001','SUMMARY:All day','END:VEVENT','BEGIN:VEVENT','UID:cancel','DTSTART:20260930T120000Z','STATUS:CANCELLED','SUMMARY:Cancelled','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const result=calendarWeek(ics,new Date('2026-09-27T16:00:00Z')),events=Object.values(result.events).flat();assert.equal(result.totalCount,4);assert.ok(events.some(e=>e.summary==='Changed'));assert.ok(events.some(e=>e.allDay));assert.ok(!events.some(e=>e.summary==='Cancelled'));
});
test('new tools ship with no native endpoints or bundled credentials',()=>{
  for(const app of ['dayhub','journal','streaming'])for(const f of fs.readdirSync(path.join(root,'bennyshub/apps/tools',app))){if(!/\.(html|js)$/.test(f))continue;const text=fs.readFileSync(path.join(root,'bennyshub/apps/tools',app,f),'utf8');assert.doesNotMatch(text,/electronAPI|\/api\/save_|\/api\/ai-call|\/api\/rt-convo|BEGIN PRIVATE KEY|\bsk-(?:proj-|ant-)[\w-]{20,}/);}
});
