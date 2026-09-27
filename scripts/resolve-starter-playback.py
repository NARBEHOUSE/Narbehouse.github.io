"""Extract episode IDs and play links from public provider pages; output proposals only."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlparse, parse_qs, urlencode
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
import json, re, ast, time, html
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    def __init__(self): super().__init__(); self.scripts=[]; self.current=None; self.links=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='script' and (attrs.get('type')=='application/ld+json' or attrs.get('id')=='__NEXT_DATA__'): self.current=''
        if tag=='a' and attrs.get('href'): self.links.append(attrs)
    def handle_data(self,text):
        if self.current is not None:self.current+=text
    def handle_endtag(self,tag):
        if tag=='script' and self.current is not None:self.scripts.append(json.loads(self.current));self.current=None

def walk(value):
    if isinstance(value,dict):
        yield value
        for child in value.values():yield from walk(child)
    elif isinstance(value,list):
        for child in value:yield from walk(child)

def resolve(task):
    service,item=task; source=item['source_url']; result={'service':service,'id':item['id'],'title':item['title'],'source':source}
    try:
        source=source.replace('/detail/','/region/na/detail/') if service=='prime' and '/region/' not in source else source
        cache=ROOT/'artifacts/provider-public-pages'/(item['id']+'.html');cache.parent.mkdir(exist_ok=True)
        if cache.exists():body=cache.read_text(encoding='utf-8')
        else:
            for attempt in range(3):
                try:
                    with urlopen(Request(source,headers={'User-Agent':'Mozilla/5.0','Accept-Language':'en-US,en;q=0.9'}),timeout=20) as r:body=r.read(5000000).decode('utf-8','replace')
                    cache.write_text(body,encoding='utf-8');break
                except Exception:
                    if attempt==2:raise
                    time.sleep(2)
        page=Page();page.feed(body)
        if service=='hulu':
            episodes=[v for d in page.scripts for v in walk(d) if v.get('type')=='episode' and v.get('season') and v.get('number') and v.get('seriesName')]
            episodes.sort(key=lambda v:(v['season'],v['number']))
            ep=episodes[0]; assert re.fullmatch(r'[a-f0-9-]{36}',ep['id'])
            result.update(url='https://www.hulu.com/watch/'+ep['id'],episode=ep['number'],season=ep['season'],episodeTitle=ep['name'],series=ep['seriesName'])
        elif service=='tubi':
            episodes=[v for d in page.scripts for v in walk(d) if v.get('@type')=='TVEpisode' and v.get('url','').startswith('/tv-shows/')]
            ep=episodes[0];result.update(url=urljoin(source,ep['url']),episodeTitle=ep['name'],series=ep.get('partOfSeries',{}).get('name'))
        elif service=='netflix':
            match=re.search(r"netflix\.reactContext\.models\.graphql\s*=\s*JSON\.parse\(('(?:\\.|[^'\\])*')\)",body)
            data=json.loads(ast.literal_eval(match.group(1)))['data']
            show=next(v for v in data.values() if isinstance(v,dict) and v.get('__typename')=='Show' and str(v.get('videoId'))==source.rsplit('/',1)[1])
            seasonRefs=[v['__ref'] for v in walk(show.get('seasons',{})) if '__ref' in v and v['__ref'].startswith('Season:')]
            season=data[seasonRefs[0]]
            episodeRefs=[v['__ref'] for v in walk(season['episodes']) if '__ref' in v and v['__ref'].startswith('Episode:')]
            ep=data[episodeRefs[0]];result.update(url='https://www.netflix.com/watch/'+str(ep['videoId']),episodeTitle=ep['title'],episode=ep['number'],seasonTitle=season['title'])
        elif service=='prime':
            links=[a for a in page.links if 'autoplay=1' in a['href'] and ('/detail/' in a['href'])]
            if item['type']=='shows':links=[a for a in links if a.get('data-testid')=='episodes-playbutton']
            link=links[0]; u=urlparse(urljoin(source,html.unescape(link['href'])))
            result.update(url=u._replace(query='autoplay=1',fragment='').geturl(),evidence='Provider Watch now link')
        return result
    except Exception as error:
        result['error']=type(error).__name__+': '+str(error)[:150];return result

if __name__=='__main__':
    tasks=[(p.stem.replace('-starter',''),i) for p in sorted((ROOT/'bennyshub/apps/tools/streaming/collections').glob('*-starter.json')) for i in json.loads(p.read_text(encoding='utf-8'))['library'] if i['type']=='shows' or p.stem=='prime-starter']
    results=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(resolve,tasks):
            results.append(result);print(json.dumps(result,ensure_ascii=True),flush=True)
    (ROOT/'artifacts/starter-playback-proposals.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
