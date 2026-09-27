Benny's Hub on-device English predictions
========================================

The actual KenLM C++ query engine runs as WebAssembly in kenlm-worker.js.
No typed text leaves the device. All network requests made by the predictor
are fixed, same-origin downloads of public model/runtime files. No API key,
microphone, extension, Python helper or prediction server is required.

The English model and candidate index download about 17 MB on the first
Keyboard visit. The PWA caches these assets after a successful download;
KenLM can then run offline. The original local predictor remains available
during model loading, on a missing/failed model, or when scoring exceeds
250 ms. It also works if WebAssembly or DecompressionStream is unavailable.
Offline use requires first loading the Hub online so its service worker can
cache the Keyboard and local dictionary. Cache eviction can require a new
download. Personal learned words are kept in this browser's localStorage.

Six suggestions remain in the original keyboard. KenLM ranks candidates
against up to two preceding words, handles partial words, and combines the
results with learned personal vocabulary. Asynchronous results for old text
are discarded. The keyboard's existing scanning and speaking controls remain.

Model: OpenSLR 11 LibriSpeech English 3-gram, pruned at 3e-7.
Source: https://www.openslr.org/11/
Authors: Vassil Panayotov, Daniel Povey and Sanjeev Khudanpur.
License: public domain, as listed by OpenSLR.
This is a general English books corpus, not a personalized AAC model.
Predictions are statistical suggestions and can include dated vocabulary.
The candidate index narrows search; scoring uses the real KenLM engine.
See model-info.json for file checksums and the pinned source revision.

KenLM: https://github.com/kpu/kenlm
Revision: 4cb443e60b7bf2c0ddf3c745378f76cb59e254e5
License: LGPL-2.1-or-later, with separately licensed utility components.
Read KENLM-LICENSE.txt, COPYING-LGPL-2.1.txt, DOUBLE-CONVERSION-LICENSE.txt
and the retained notices in the complete source archive.
The JavaScript runtime includes Emscripten code; see EMSCRIPTEN-LICENSE.txt.

Rebuilding/relinking
-------------------
rebuild-source.tar.gz contains the matching, unmodified KenLM source under
artifacts/kenlm-source, plus scripts/kenlm-browser.cc, build-kenlm.py and
package-keyboard-model.py. You may replace/modify KenLM and relink the module.

Extract the archive into a workspace. Install Emscripten SDK 4.0.15 under
artifacts/emsdk and activate it locally. Run:
  python scripts/build-kenlm.py

The query-only build needs no Boost and produces kenlm.js and kenlm.wasm
under bennyshub/apps/tools/keyboard/kenlm. It uses C++14, a 512 MB memory
ceiling and a small source wrapper with load_model and score_word exports.
The compiler is developer tooling only and is not part of the public app.

To reproduce the candidate index, download the model URL in model-info.json
to artifacts/kenlm-research/librispeech-3gram.arpa.gz, then run:
  python scripts/package-keyboard-model.py

The original local dictionary is kept as a fallback, not used as training
text for the shipped KenLM model. No personal history is packaged.
