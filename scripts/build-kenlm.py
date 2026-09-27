"""Build the browser KenLM query library with Emscripten 4.0.15.

Source: kpu/kenlm, commit 4cb443e60b7bf2c0ddf3c745378f76cb59e254e5.
Run after cloning KenLM to artifacts/kenlm-source and activating artifacts/emsdk.
The generated runtime is static, on-device, and has no network API credentials.
"""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
source = root / 'artifacts/kenlm-source'
out = root / 'bennyshub/apps/tools/keyboard/kenlm'
out.mkdir(parents=True, exist_ok=True)
files = [p for folder in ['util/double-conversion', 'util', 'lm']
         for p in (source / folder).glob('*.cc')
         if not p.name.endswith(('test.cc', 'main.cc'))]
compiler = root / 'artifacts/emsdk/upstream/emscripten/em++.py'
env = dict(os.environ, EM_CONFIG=str(root / 'artifacts/emsdk/.emscripten'))
args = [sys.executable, str(compiler), '-O3', '-std=c++14', '-DNDEBUG',
        '-DKENLM_MAX_ORDER=6', '-I' + str(source), '-fexceptions',
        '-ffile-prefix-map=' + str(root) + '=/benny-build',
        *map(str, files), str(root / 'scripts/kenlm-browser.cc'),
        '-sMODULARIZE=1', '-sEXPORT_NAME=createKenLM', '-sENVIRONMENT=worker,node',
        '-sALLOW_MEMORY_GROWTH=1', '-sMAXIMUM_MEMORY=536870912',
        '-sINITIAL_MEMORY=33554432', '-sFORCE_FILESYSTEM=1',
        '-sEXPORTED_FUNCTIONS=["_load_model","_model_error","_score_word"]',
        '-sEXPORTED_RUNTIME_METHODS=["ccall","FS"]',
        '-o', str(out / 'kenlm.js')]
subprocess.run(args, env=env, check=True)
# Older compiler diagnostic macros may still embed the developer's absolute
# workspace. Replace only that exact prefix, preserving every WASM byte offset.
binary = out / 'kenlm.wasm'
data = binary.read_bytes()
for prefix in [str(root).encode(), root.as_posix().encode()]:
    replacement = b'/build/' + b'_' * (len(prefix) - len(b'/build/'))
    if len(replacement) == len(prefix):
        data = data.replace(prefix, replacement)
binary.write_bytes(data)
print('Built KenLM WebAssembly runtime:', out)
