'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const extensions=new Set(['.html','.js','.mjs','.css','.json','.webmanifest','.svg','.png','.jpg','.jpeg','.gif','.webp','.ico','.wav','.mp3','.mp4','.webm','.ogg','.wasm','.gz','.csv','.txt','.woff','.woff2','.ttf','.glb','.gltf','.bin','.obj','.mtl']);
// One publication rule is shared by the website build and the offline inventory.
async function isPublicFile(root,source){
    const rel=path.relative(root,source).replaceAll('\\','/');const name=path.basename(source);
    if((await fs.lstat(source)).isSymbolicLink())throw Error('Symlink in public files');
    if(name.startsWith('.')||/(?:^|\/)(node_modules|__pycache__|chrome_profile|tests|artifacts|playwright-report|test-results)(?:\/|$)/.test(rel)||/\/games\/[^/]+\/tools(?:\/|$)/.test(rel)||/\/(?:BENNYSFOOTBALL|BENNYSBASEBALL2)\/art(?:\/|$)/.test(rel)||/test-player\.(html|js)$|^rt-convo|^package(?:-lock)?\.json$|^playwright\.config\.|^DESKTOP_PROMPT\.txt$/.test(name))return false;
    // Keep original project photographs as source; publish the compressed JPEG derivatives.
    if(/^codex-physical-builds\/images\/.*\.png$/i.test(rel))return false;
    // Retired prediction experiment stays in the source tree, not the public app.
    if(/^bennyshub\/apps\/tools\/keyboard\/kenlm(?:\/|-(?:client|worker)\.js$)/.test(rel))return false;
    // Switch Stories production references never ship with the playable books.
    if(/^bennyshub\/apps\/games\/NARBESWITCHSTORIES\/(?:.*\/)?(?:source|incoming|reference|art|prototype)(?:\/|$)/i.test(rel)||(/^bennyshub\/apps\/games\/NARBESWITCHSTORIES\//.test(rel)&&/\.pdf$/i.test(name)))return false;
    // Private publishing records never enter a website build, regardless of file type.
    if (/(?:^|\/)rights and publishing[^/]*(?:\/|$)/i.test(rel)) return false;
    // Publish the game's README alongside its license, notice and credits.
    if (rel === 'bennyshub/apps/games/CHASINGRAINBOWS/README.md') return true;
    // Chasing Rainbows partner source documents/art are local references, not web assets.
    if(/^bennyshub\/apps\/games\/CHASINGRAINBOWS\/REFERENCE DATA(?:\/|$)/.test(rel))return false;
    // Local Fish Mystery authoring sources are ignored by Git and are not runtime assets.
    if(/^bennyshub\/apps\/games\/BENNYSFISHMYSTERY\/(?:content(?:\/|$)|editor\.html$)/.test(rel))return false;
    // The Faster voice phonemizer needs this pinned public data package.
    if(rel === 'bennyshub/shared/communication-fast-vendor/piper_phonemize.data')return true;
    return (await fs.stat(source)).isDirectory()||/(?:^|[-_.])(?:LICENSE|COPYING|NOTICE|CREDITS)(?:\.(?:md|txt))?$/i.test(name)||extensions.has(path.extname(name).toLowerCase());
}
module.exports={isPublicFile};
