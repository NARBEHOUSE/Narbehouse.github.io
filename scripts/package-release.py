"""Prepare local artifacts only. Does not publish or contact either store."""
from pathlib import Path
import json, re, shutil, zipfile, hashlib, sys, subprocess

ROOT=Path(__file__).resolve().parents[1]
# Shared policy must be current before creating any release artifact.
subprocess.run(['node',str(ROOT/'scripts'/'sync-companion-shared.cjs'),'--check'],cwd=ROOT,check=True)
SOURCE=ROOT/'extension'
manifest=json.loads((SOURCE/'manifest.json').read_text(encoding='utf-8'))
OUT=ROOT/'releases'/manifest['version']
PACKAGE=OUT/'extension'
OUT.mkdir(parents=True,exist_ok=True)
if PACKAGE.exists():
    assert not PACKAGE.is_symlink() and PACKAGE.resolve().is_relative_to((ROOT/'releases').resolve())
PACKAGE.mkdir(exist_ok=True)
runtime=['background.mjs','calendar.mjs','hub-content.js','options.html','options.css','options.mjs','player-adapters.js','player-platform.js','shared/choice-scan.js','shared/voice-manager.js','shared/scan-status-badge.js','shared/scan-status-badge.css','shared/scan-status-badge-style.js','player-content.js','player-loading.html','player-registration.mjs','player-view.js','policy.mjs','vendor/ical.es5.min.cjs','vendor/ICAL-LICENSE']
# Resolve the exact bundled parser filename from the source tree.
runtime=[name for name in runtime if not name.startswith('vendor/')]+[str(p.relative_to(SOURCE)).replace('\\','/') for p in (SOURCE/'vendor').iterdir() if p.is_file()]
runtime += ['icons/icon'+str(size)+'.png' for size in [16,32,48,128]]
allowed=set(runtime+['manifest.json','LICENSE'])
for p in PACKAGE.rglob('*'):
    assert not p.is_symlink(),p
    if p.is_file():assert p.relative_to(PACKAGE).as_posix() in allowed,('Unexpected file in package',p.name)
for name in runtime:
    src=SOURCE/name
    assert src.is_file() and not src.is_symlink(),name
    dst=PACKAGE/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
shutil.copy2(ROOT/'LICENSE',PACKAGE/'LICENSE')
manifest['content_scripts'][0]['matches']=['https://narbehouse.github.io/bennyshub/*']
manifest['content_scripts'][0].pop('exclude_matches',None)
manifest['optional_host_permissions']=[x for x in manifest['optional_host_permissions'] if x.startswith('https://')]
(PACKAGE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
def change(name,pattern,replacement):
    p=PACKAGE/name;text=p.read_text(encoding='utf-8');text,count=re.subn(pattern,lambda _:replacement,text,flags=re.S)
    assert count==1,(name,count);p.write_text(text,encoding='utf-8')
change('policy.mjs',r'export const DEVELOPMENT = true;','export const DEVELOPMENT = false;')
change('policy.mjs',r'export const HUB_ORIGINS = \[.*?\];',"export const HUB_ORIGINS = ['https://narbehouse.github.io'];")
change('hub-content.js',r'const origins=\[.*?\];',"const origins=['https://narbehouse.github.io'];")
change('options.html',r'  <details class="advanced" data-development-only>.*?</details>','')
change('options.mjs',r"if\(\$\('fixture'\)\).*?Local video test enabled\.';\}\);",'')

def archive(source,dest):
    with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(source.rglob('*')):
            assert not p.is_symlink(),p
            if p.is_file():
                item=zipfile.ZipInfo(p.relative_to(source).as_posix(),date_time=(2026,1,1,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(item,p.read_bytes())
archive(PACKAGE,OUT/('bennys-hub-companion-'+manifest['version']+'.zip'))
# Also serve the same generated ZIP when previewing the source with an IDE server.
download=ROOT/'bennyshub'/'downloads'
assert not download.is_symlink() and download.resolve().is_relative_to(ROOT.resolve())
download.mkdir(exist_ok=True)
shutil.copy2(OUT/('bennys-hub-companion-'+manifest['version']+'.zip'),download/('bennys-hub-companion-'+manifest['version']+'.zip'))
if '--extension-only' in sys.argv:
    print('Prepared production-origin Companion ZIP for local release packaging.')
    sys.exit(0)
docs=OUT/'submission';docs.mkdir(exist_ok=True)
for p in (ROOT/'submission').iterdir():
    if p.is_file():shutil.copy2(p,docs/p.name)
if (ROOT/'artifacts/release-audit.json').exists():shutil.copy2(ROOT/'artifacts/release-audit.json',OUT/'release-audit.json')
if (ROOT/'dist').exists():archive(ROOT/'dist',OUT/'website-github-pages.zip')
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.glob('*.zip') if p.name!='submission-kit.zip'}
(OUT/'SHA256SUMS.txt').write_text(''.join(value+'  '+name+'\n' for name,value in sorted(hashes.items())),encoding='utf-8')
with zipfile.ZipFile(OUT/'submission-kit.zip','w',zipfile.ZIP_DEFLATED) as kit:
    selected=[OUT/('bennys-hub-companion-'+manifest['version']+'.zip'),OUT/'SHA256SUMS.txt',OUT/'release-audit.json']
    selected += [p for d in [docs,OUT/'assets'] if d.exists() for p in d.rglob('*') if p.is_file()]
    for p in selected:
        if p.exists():kit.write(p,p.relative_to(OUT).as_posix())
print('Prepared local release:',OUT)
print('Extension ZIP has manifest.json at its root, production-only Hub matching, no local permissions, no private catalog.')
