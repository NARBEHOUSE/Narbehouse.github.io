const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Symlink in release');return e.isDirectory()?files(p):[p];});}
const problems=[],findings=[];let bytes=0;
for(const file of files(dist)){
  const rel=path.relative(dist,file).replaceAll('\\','/');bytes+=fs.statSync(file).size;
  if(/(?:^|\/)(?:TO BE ADDED|artifacts|node_modules|workers|extension|__pycache__|rt-convo[^/]*)(?:\/|$)|(?:\.pem|\.key|\.py|\.exe|\.log)$|test-player\./i.test(rel))problems.push({file:rel,kind:'private/development file'});
  if(fs.statSync(file).size>100_000_000)problems.push({file:rel,kind:'file exceeds GitHub repository 100 MB limit'});
  if(!/\.(?:html|js|mjs|json|txt|css|csv|svg|webmanifest)$/.test(file))continue;
  const text=fs.readFileSync(file,'utf8');
  const patterns={credential:/AIza[\w-]{25,}|sk-(?:proj-|ant-)[\w-]{20,}|gh[pousr]_[\w]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,private_calendar:/calendar\/ical\/[^\s"<>]*private[^\s"<>]*/,plex_server:/plex\.tv\/[^\s"<>]*server\/[a-f0-9]{20,}/,personal_path:/(?:[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}|\/Users\/)[^\s"<>]+|[A-Za-z]:[\\/]PROJECT FILES[\\/]/i,api_literal:/(?:api[_-]?key|token|secret)\s*[=:]\s*["'][A-Za-z0-9_\-]{24,}["']/i};
  for(const [kind,pattern]of Object.entries(patterns))if(pattern.test(text))problems.push({file:rel,kind});
  if(text.includes('/home/web_user'))findings.push({file:rel,kind:'generic build-container path; not personal data'});
}
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dist,'bennyshub/apps/tools/streaming/data.json'))),[]);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dist,'bennyshub/apps/tools/streaming/episodes.json'))),{});
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dist,'bennyshub/apps/tools/journal/entries.json'))),{entries:[]});
if(bytes>1_000_000_000)problems.push({kind:'site exceeds 1 GB Pages size target'});
const report={checkedAt:new Date().toISOString(),publicFiles:files(dist).length,bytes,problems,findings,scope:'Automated scan of built public files, not a guarantee of no sensitive content. Local archives and browser storage are excluded, not erased.'};
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/release-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(problems.length)process.exitCode=1;
