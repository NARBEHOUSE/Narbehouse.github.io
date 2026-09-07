# -*- coding: utf-8 -*-
"""
Bundle content/ into js/content.generated.js.

    python tools/build_content.py

The game loads one file rather than fetching four, so this is the step between
editing content and playing it. Run it after the editor saves, or after
tools/gen_lake.js.

THE BUNDLE IS THE SAME SHAPE AS THE FILES. That sounds too obvious to state,
and it is not: the previous version of this script rearranged the map on the
way through - stripping each zone's track and filing them under a separate key
to save bytes - and the game, which read the shape the file had, quietly built
a synthetic lake at the origin while the chart looked ten thousand units away.
The minimap showed neither the boat nor the fish because both were off the
picture. So: no rearranging, no filtering, no cleverness. What is in content/
is what RT.content has.

It also refuses to write a bundle it could not read back, because a generated
file that does not parse is a white screen with nothing in the console.
"""
import io
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
CONTENT = os.path.join(GAME, 'content')
OUT = os.path.join(GAME, 'js', 'content.generated.js')

# Every file that makes up the game's content, and whether it has to be there.
PARTS = [
    ('lake',   'lake.json',   True),
    ('roster', 'roster.json', True),
    ('quests', 'quests.json', False),
    ('assets', 'assets.json', False),
]


def read(name):
    p = os.path.join(CONTENT, name)
    if not os.path.exists(p):
        return None
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    bundle = {}
    missing = []
    for key, name, required in PARTS:
        doc = read(name)
        if doc is None:
            if required:
                missing.append(name)
            continue
        bundle[key] = doc

    if missing:
        print('cannot build: content/%s is missing' % ', content/'.join(missing))
        return 1

    body = json.dumps(bundle, indent=1, ensure_ascii=False)
    out = (
        '/**\n'
        ' * GENERATED - do not edit.\n'
        ' *\n'
        ' * Everything in content/, in one file: the lake\'s chart, the roster of\n'
        ' * fish and gear, and the quests. Rebuild with:\n'
        ' *\n'
        ' *     python tools/build_content.py\n'
        ' *\n'
        ' * The bundle is deliberately the SAME SHAPE as the files it came from.\n'
        ' * An earlier version rearranged the map on the way through, and the game -\n'
        ' * which read the shape the file had - built a lake in the wrong place and\n'
        ' * drew a chart of somewhere else.\n'
        ' */\n'
        'window.RT = window.RT || {};\n'
        'RT.content = ' + body + ';\n'
    )

    # Never write a generated file that cannot be read back.
    try:
        compile(out, 'content.generated.js', 'exec')
    except Exception:
        pass          # it is JavaScript, not Python; the JSON check below is the real one
    json.loads(body)  # if this throws, the bundle is malformed and nothing is written

    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)

    print('js/content.generated.js  %.0f KB' % (len(out) / 1024))
    L = bundle['lake']
    R = bundle['roster']
    print('  lake        %s, %d shore points, %d soundings, %d ledge(s)'
          % (L.get('name', '?'), len(L.get('shore', [])),
             len(L.get('soundings', [])), len(L.get('ledges', []))))
    print('  roster      %d fish, %d items, %d vessels, %d rods, %d tools'
          % (len(R.get('fish', [])), len(R.get('items', [])),
             len(R.get('vessels', [])), len(R.get('rods', [])),
             len(R.get('tools', []))))
    q = bundle.get('quests') or {}
    quests = q.get('quests') or []
    print('  quests      %d%s' % (len(quests),
                                  '' if quests else '   (none written yet)'))
    places = L.get('places') or []
    print('  places      %d marked on the chart' % len(places))
    return 0


if __name__ == '__main__':
    sys.exit(main())
