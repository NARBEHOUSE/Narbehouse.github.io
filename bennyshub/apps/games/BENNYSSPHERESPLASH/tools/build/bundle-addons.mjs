// Builds js/vendor/three-addons.js: GLTFLoader + SkeletonUtils from three@0.155.0,
// as one plain script that hangs them off the global THREE the hub already loads.
//
// Why: the hub ships Three.js r155 as a global <script> (no ES modules, no import
// maps, works offline and from file://). r155 no longer ships non-module add-ons,
// so this bundles the module versions once and rewires their `import ... from 'three'`
// to the existing global. Same version as js/vendor/three.min.js - never mix versions.
//
// Run from this folder:  npm install && npm run addons
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../js/vendor/three-addons.js');

const globalThree = {
  name: 'global-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'global-three' }));
    b.onLoad({ filter: /.*/, namespace: 'global-three' }, () => ({
      contents: 'module.exports = window.THREE;',
      loader: 'js',
    }));
  },
};

await build({
  stdin: {
    contents: [
      "import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';",
      "import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';",
      'window.THREE.GLTFLoader = GLTFLoader;',
      'window.THREE.SkeletonUtils = SkeletonUtils;',
    ].join('\n'),
    resolveDir: here,
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  target: ['es2018'],
  minify: true,
  legalComments: 'inline',
  banner: { js: '/* three-addons.js - GLTFLoader + SkeletonUtils from three@0.155.0 (MIT, three.js authors). Built by tools/build/bundle-addons.mjs; do not edit. */' },
  plugins: [globalThree],
  outfile: out,
});
console.log('wrote', path.relative(process.cwd(), out));
