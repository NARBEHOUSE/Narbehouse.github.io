"""Package the public-domain OpenSLR 11 English model and candidate index.

The index only proposes candidates; the KenLM WebAssembly engine scores them.
No personal keyboard history or Streaming catalog is used in model creation.
"""
import gzip
import hashlib
import heapq
import json
from pathlib import Path
import re
import shutil

root = Path(__file__).resolve().parent.parent
source = root / 'artifacts/kenlm-research/librispeech-3gram.arpa.gz'
out = root / 'bennyshub/apps/tools/keyboard/kenlm'
out.mkdir(parents=True, exist_ok=True)
vocab, following = {}, {}
word_pattern = re.compile(r"^[A-Z]+(?:'[A-Z]+)*$")
order = 0
with gzip.open(source, 'rt', encoding='utf-8') as lines:
    for line in lines:
        match = re.match(r'\\(\d+)-grams:', line)
        if match:
            order = int(match[1])
            continue
        parts = line.split()
        if not order or len(parts) < order + 1:
            continue
        try:
            score = float(parts[0])
        except ValueError:
            continue
        words = parts[1:order+1]
        if not all(word_pattern.fullmatch(w) for w in words):
            continue
        if order == 1:
            vocab[words[0]] = score
        elif all(vocab.get(w, -99) > -5.5 for w in words[:-1]):
            context = ' '.join(words[:-1])
            best = following.setdefault(context, [])
            heapq.heappush(best, (score, words[-1]))
            if len(best) > 24:
                heapq.heappop(best)

entries = sorted(vocab.items())
ids = {word: i for i, (word, _) in enumerate(entries)}
index = {'version': 1, 'order': 3, 'vocabulary': entries,
         'following': {context: [ids[word] for _, word in sorted(best, reverse=True)]
                       for context, best in following.items()}}
with gzip.GzipFile(filename=str(out / 'candidates.json.gz'), mode='wb', mtime=0) as f:
    f.write(json.dumps(index, separators=(',', ':')).encode())
shutil.copyfile(source, out / 'english.arpa.gz')
metadata = {
    'model': 'LibriSpeech English 3-gram, pruned 3e-7',
    'source': 'https://www.openslr.org/11/',
    'download': 'https://www.openslr.org/resources/11/3-gram.pruned.3e-7.arpa.gz',
    'license': 'Public domain (OpenSLR 11)',
    'authors': 'Vassil Panayotov, Daniel Povey, Sanjeev Khudanpur',
    'vocabulary': len(entries), 'candidateContexts': len(following),
    'kenlmCommit': '4cb443e60b7bf2c0ddf3c745378f76cb59e254e5',
    'emscripten': '4.0.15',
    'files': {name: {'bytes': (out/name).stat().st_size,
                     'sha256': hashlib.sha256((out/name).read_bytes()).hexdigest()}
              for name in ['english.arpa.gz', 'candidates.json.gz']}
}
(out / 'model-info.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
print(json.dumps(metadata, indent=2))
