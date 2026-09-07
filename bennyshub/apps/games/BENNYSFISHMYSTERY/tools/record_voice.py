# -*- coding: utf-8 -*-
"""Record Walt's outstanding lines with ElevenLabs.

    python tools/record_voice.py --list          what is still missing
    python tools/record_voice.py --script        their full words, to read aloud
    python tools/record_voice.py --out           write audio/vo/TO_RECORD.md
    python tools/record_voice.py --voices        which voices the account has
    python tools/record_voice.py                 record everything missing
    python tools/record_voice.py q09_send q16b   record just these

The game plays a recording wherever it knows the cue id and falls back to the
system voice where it does not, so "which lines are missing" is not a list
anybody should be keeping by hand: it is the difference between the cue ids in
content/quests.json and the keys in audio/vo/index.json. This works that out,
generates only those, writes them in as <cue>.mp3, and adds them to the
manifest - which is the same thing tools/record.html does when a person reads
a line into a microphone.

THE KEY IS NEVER WRITTEN DOWN HERE. Set it in the environment for the one
command:

    ELEVENLABS_API_KEY=... python tools/record_voice.py

The voice defaults to the one Walt has been speaking in. Any part of the name
will do - it is matched against the account's voice list - or pass a voice id
outright with --voice.
"""
import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUESTS = os.path.join(ROOT, 'content', 'quests.json')
VO_DIR = os.path.join(ROOT, 'audio', 'vo')
MANIFEST = os.path.join(VO_DIR, 'index.json')

API = 'https://api.elevenlabs.io/v1'
DEFAULT_VOICE = 'Matthew Schmitz'          # "warm mountain man"
# The model that reads a script rather than performing it. Walt is a man
# talking across a counter, not a narrator.
DEFAULT_MODEL = 'eleven_multilingual_v2'


def api_key():
    k = os.environ.get('ELEVENLABS_API_KEY') or os.environ.get('XI_API_KEY')
    if not k:
        sys.exit('No key. Set ELEVENLABS_API_KEY for this command and try again.')
    return k


def get(path):
    req = urllib.request.Request(API + path, headers={'xi-api-key': api_key()})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def script_lines():
    """Every line Walt can say, in the order he says them, with its cue id."""
    doc = json.load(io.open(QUESTS, encoding='utf-8'))
    walt = doc.get('walt') or {}
    out, seen = [], set()

    def add(cue, where):
        text = (walt.get(cue) or '').strip()
        if not cue or not text or cue in seen:
            return
        seen.add(cue)
        out.append({'cue': cue, 'text': text, 'where': where})

    for q in doc.get('quests') or []:
        n = q.get('n')
        lines = q.get('lines') or {}
        for c in lines.get('brief') or []:
            add(c, 'briefing job %s' % n)
        for c in lines.get('done') or []:
            add(c, 'handing job %s in' % n)
        nudge = (q.get('say') or {}).get('nudge')
        if nudge:
            cue = q['id'] + '_nudge'
            if cue not in seen:
                seen.add(cue)
                out.append({'cue': cue, 'text': nudge.strip(),
                            'where': 'nudge on job %s' % n})
    for cue, where in (('tackle_lost_1', 'a bare line'),
                       ('tackle_lost_again', 'a bare line, again')):
        add(cue, where)
    # What he says at the counter, which belongs to no job - pooled, so the
    # line at the end of every trip is not the same line every trip.
    where_of = {'done': 'finishing any job', 'log': 'logging the catch', 'logBig': 'logging a good one',
                'logMany': 'logging an armful', 'logOne': 'logging a single tag',
                'hold': 'arriving with a boat full'}
    for name, cues in (doc.get('waltPools') or {}).items():
        for c in cues:
            add(c, where_of.get(name, 'the counter'))
    # AND EVERYTHING ELSE IN THE SCRIPT. Some of his lines belong to no job
    # and no pool - the way he greets you, the way he asks for the logbook,
    # the way he says a thing is yours. They are read straight out of the
    # script by the cards that show them, and this walked the jobs only, so
    # they were invisible to "what still needs recording".
    for cue in walt:
        add(cue, 'across the counter')
    return out


def manifest():
    try:
        return json.load(io.open(MANIFEST, encoding='utf-8'))
    except Exception:
        return {'_what': 'Which cue ids have a recording, and the file for each.',
                'lines': {}}


def missing():
    have = set((manifest().get('lines') or {}).keys())
    return [l for l in script_lines() if l['cue'] not in have]


def pick_voice(want):
    """Match a voice by id, or by any part of its name."""
    voices = get('/voices').get('voices') or []
    for v in voices:
        if v.get('voice_id') == want:
            return v
    hits = [v for v in voices if want.lower() in (v.get('name') or '').lower()]
    if len(hits) == 1:
        return hits[0]
    if not hits:
        sys.exit('No voice matching "%s". Run --voices to see the list.' % want)
    sys.exit('More than one voice matches "%s": %s' %
             (want, ', '.join(v['name'] for v in hits)))


def main():
    ap = argparse.ArgumentParser(description="Record Walt's outstanding lines.")
    ap.add_argument('cues', nargs='*', help='specific cue ids (default: everything missing)')
    ap.add_argument('--voice', default=DEFAULT_VOICE, help='voice name or id')
    ap.add_argument('--model', default=DEFAULT_MODEL)
    ap.add_argument('--list', action='store_true', help='what is missing, and stop')
    ap.add_argument('--script', action='store_true',
                    help='the full words of every missing line, to read or paste')
    ap.add_argument('--out', nargs='?', const=os.path.join(VO_DIR, 'TO_RECORD.md'),
                    help='write the outstanding lines to a file to hand to somebody else')
    ap.add_argument('--voices', action='store_true', help='the account\'s voices, and stop')
    ap.add_argument('--force', action='store_true', help='re-record even if a clip exists')
    args = ap.parse_args()

    if args.voices:
        for v in get('/voices').get('voices') or []:
            print('  %-28s %s' % (v.get('name'), v.get('voice_id')))
        return

    if args.out:
        todo = missing()
        lines = []
        lines.append("# Walt's lines still to record")
        lines.append('')
        lines.append('Voice: **%s** - the warm mountain man Walt already speaks in.' % DEFAULT_VOICE)
        lines.append('')
        lines.append('%d lines. Each one is saved into `audio/vo/` under the filename given,'
                     % len(todo))
        lines.append('as an mp3. The filename IS the wiring: the game looks a line up by its')
        lines.append('cue id, so `q09_send.mp3` is what makes q09_send play instead of the')
        lines.append('system voice reading it out.')
        lines.append('')
        lines.append('When the files are in, add them to `audio/vo/index.json` under `lines`')
        lines.append('(`"q09_send": "q09_send.mp3"`), or just run `python tools/record_voice.py`')
        lines.append('which writes the manifest itself. `node tools/voicecheck.js` confirms it.')
        lines.append('')
        for l in todo:
            lines.append('---')
            lines.append('')
            lines.append('### `%s.mp3`' % l['cue'])
            lines.append('')
            lines.append('*Where it plays: %s.*' % l['where'])
            lines.append('')
            lines.append('> ' + l['text'])
            lines.append('')
        out = args.out
        io.open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
        print('wrote %s - %d lines' % (out, len(todo)))
        return

    if args.script:
        for l in missing():
            print('=' * 68)
            print('%s   (%s)' % (l['cue'], l['where']))
            print(l['text'])
        return

    todo = missing()
    if args.cues:
        byid = {l['cue']: l for l in script_lines()}
        todo = []
        for c in args.cues:
            if c not in byid:
                sys.exit('No line with the cue id "%s".' % c)
            todo.append(byid[c])

    if args.list or not todo:
        print("WALT'S SCRIPT: %d lines, %d still to record" %
              (len(script_lines()), len(missing())))
        for l in missing():
            print('  %-12s %-22s %s' % (l['cue'], l['where'], l['text'][:56] + '...'))
        if not args.list:
            print('\nNothing to do.')
        return

    man = manifest()
    man.setdefault('lines', {})
    os.makedirs(VO_DIR, exist_ok=True)

    # ADOPT WHAT IS ALREADY THERE. A clip somebody else generated is a clip:
    # it wants a manifest entry, not another trip to the API - and wiring up
    # work already done should never need a key.
    adopted = []
    if not args.force:
        for l in list(todo):
            path = os.path.join(VO_DIR, l['cue'] + '.mp3')
            if os.path.exists(path) and os.path.getsize(path) > 2048:
                man['lines'][l['cue']] = l['cue'] + '.mp3'
                adopted.append(l)
                todo.remove(l)
    if adopted:
        print('already in the folder, wired up:')
        for l in adopted:
            print('  %-12s %6.1f kB' %
                  (l['cue'], os.path.getsize(os.path.join(VO_DIR, l['cue'] + '.mp3')) / 1024.0))
        print()
        if not todo:
            io.open(MANIFEST, 'w', encoding='utf-8', newline=chr(10)).write(
                json.dumps(man, indent=2, ensure_ascii=False) + chr(10))
            print('manifest updated: %d lines recorded in all' % len(man['lines']))
            print('Check it with:  node tools/voicecheck.js')
            return

    v = pick_voice(args.voice)
    print('voice: %s (%s)' % (v.get('name'), v.get('voice_id')))
    print('lines to generate: %d' % len(todo))
    print()

    for l in todo:
        path = os.path.join(VO_DIR, l['cue'] + '.mp3')
        body = json.dumps({
            'text': l['text'],
            'model_id': args.model,
            'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8,
                               'style': 0.25, 'use_speaker_boost': True},
        }).encode('utf-8')
        req = urllib.request.Request(
            '%s/text-to-speech/%s' % (API, v['voice_id']),
            data=body,
            headers={'xi-api-key': api_key(), 'Content-Type': 'application/json',
                     'Accept': 'audio/mpeg'})
        try:
            audio = urllib.request.urlopen(req, timeout=180).read()
        except urllib.error.HTTPError as e:
            sys.exit('  %s failed: %s %s' % (l['cue'], e.code, e.read()[:200]))
        io.open(path, 'wb').write(audio)
        man['lines'][l['cue']] = l['cue'] + '.mp3'
        print('  %-12s %6.1f kB  %s' % (l['cue'], len(audio) / 1024.0, l['text'][:44] + '...'))

    io.open(MANIFEST, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(man, indent=2, ensure_ascii=False) + '\n')
    print()
    print('manifest updated: %d lines recorded in all' % len(man['lines']))
    print('Check it with:  node tools/voicecheck.js')


if __name__ == '__main__':
    main()
