// Games whose website copy is its own GitHub Pages repo (https://narbehouse.github.io/<repo>/), kept locally in
// F:\PROJECT FILES\WEBSITES\GAMES\<repo>. The local preview (serve.cjs) serves every folder there by itself; the link
// checks use BIG_GAMES; scripts/copy-big-game.cjs uses GAMES to copy a game from Ben's PC Hub (the Electron app, the
// source of truth) into its repo with the website-only changes. Listing a game here does not put it in any catalog.
const GAMES={
  'switch-stories':{
    source:'NARBESWITCHSTORIES',             // bennyshub/apps/games/<source> in Ben's PC Hub
    // PC files that never go to the website: production references the game does not load.
    exclude:['**/source/','**/incoming/','**/reference/','**/art/','**/prototype/','**/*.pdf','stories/*/images/','**/*-PROMPTS.json'],
    // Website-owned files: made or changed for the website only. The copy never overwrites or removes them.
    // js/descriptions.js: the web copy reads descriptions through the parent page's offline cache (2026-10-30, 37e13a8).
    keep:['README.md','LICENSE','CREDITS.md','.gitignore','.nojekyll','tests/','js/descriptions.js'],
    cacheTag:true,                           // ?v=<date> on the game's own scripts and styles in index.html
  },
  'bens-food-court':{
    source:'BENSFOODCOURT',
    exclude:[],                              // everything, reference art and docs included (for the hand-over)
    keep:['README.md','LICENSE','.gitignore','.nojekyll'],
    cacheTag:false,
  },
};
module.exports={GAMES,BIG_GAMES:Object.keys(GAMES)};
