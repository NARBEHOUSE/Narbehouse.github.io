/* Load the game's plain-script modules into Node for tools and checks. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

module.exports = function load(files) {
  const ctx = { console, Math, Date, JSON, Float32Array, Object, Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const dir = path.resolve(__dirname, '../js');
  for (const f of files || ['util.js', 'course.js', 'physics.js']) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.MG;
};
