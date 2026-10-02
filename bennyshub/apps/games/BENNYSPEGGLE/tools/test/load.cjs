// Loads the game's pure modules into node (no THREE, no DOM).
const path = require('path');
global.window = global;
const js = (f) => require(path.join(__dirname, '..', '..', 'js', f));
['util.js', 'catalog.js', 'levels.js', 'physics.js', 'match.js'].forEach(js);
module.exports = global.P3;
