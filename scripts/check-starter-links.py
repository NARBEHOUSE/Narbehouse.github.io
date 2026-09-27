"""Audit public starter destinations without accounts, cookies or playback claims.
Writes an ignored report; never changes a catalog based on HTTP success alone.
"""
from pathlib import Path
from urllib.parse import urlparse, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
import json, re, time, unicodedata

ROOT = Path(__file__).resolve().parents[1]
class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(); self.titles = []; self.capture = None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('title', 'h1'): self.capture = ''
        if tag == 'meta' and attrs.get('property', attrs.get('name')) in ('og:title', 'twitter:title'):
            self.titles.append(attrs.get('content', ''))
    def handle_data(self, text):
        if self.capture is not None: self.capture += text
    def handle_endtag(self, tag):
        if tag in ('title', 'h1') and self.capture is not None:
            self.titles.append(self.capture.strip()); self.capture = None

def normalized(text):
    text = unicodedata.normalize('NFKD', text.lower().replace('&', 'and'))
    text = re.sub(r'\(\d{4}\)', '', text)
    return re.sub(r'[^a-z0-9]', '', text)

def fetch(url):
    for attempt in range(2):
        try:
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9'})
            with urlopen(req, timeout=18) as response:
                body = response.read(4000000).decode('utf-8', 'replace')
                parser = Metadata(); parser.feed(body)
                return {'status': response.status, 'finalURL': response.url, 'pageTitles': list(dict.fromkeys(parser.titles))}
        except HTTPError as error:
            if error.code in (429, 503) and attempt == 0:
                time.sleep(2); continue
            return {'status': error.code}
        except Exception as error:
            return {'error': type(error).__name__}

def check(args):
    service, item = args
    url = item['url']; source = item.get('source_url', url)
    result = {'service': service, 'id': item['id'], 'title': item['title'], 'url': url, 'type': item['type']}
    if service == 'youtube':
        endpoint = 'https://www.youtube.com/oembed?' + urlencode({'url': url, 'format': 'json'})
        try:
            with urlopen(Request(endpoint, headers={'User-Agent': 'Mozilla/5.0'}), timeout=18) as response:
                data = json.load(response)
                result['destination'] = {'status': response.status, 'pageTitles': [data['title']], 'author': data.get('author_name')}
        except HTTPError as error: result['destination'] = {'status': error.code}
        except Exception as error: result['destination'] = {'error': type(error).__name__}
    else:
        result['destination'] = fetch(url)
    evidence = result['destination']
    if not any(normalized(item['title']) in normalized(title) for title in evidence.get('pageTitles', [])) and source != url:
        result['reference'] = fetch(source); evidence = result['reference']
    result['identity'] = 'title-matched' if any(normalized(item['title']) in normalized(title) for title in evidence.get('pageTitles', [])) else 'needs-review'
    result['playback'] = 'not-tested-signed-out'
    return result

if __name__ == '__main__':
    items = [(p.stem.replace('-starter', ''), item) for p in sorted((ROOT/'bennyshub/apps/tools/streaming/collections').glob('*-starter.json')) for item in json.loads(p.read_text(encoding='utf-8'))['library']]
    results = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(check, items):
            results.append(result)
            if len(results) % 20 == 0: print('Checked', len(results), 'of', len(items), flush=True)
    output = ROOT/'artifacts/starter-link-audit.json'; output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(results, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    print(json.dumps(dict(Counter((r['service']+': '+r['identity']) for r in results)), indent=2))
    print('Public identity/link checks only; account access and playback require signed-in testing.')
