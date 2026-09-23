"""Guard upright outfield posture and recovery without changing contact timing."""
import numpy as np
from build_players import pose, project

for t in np.linspace(0, 1, 101):
    standing = pose('ready', t, 'outfielder')
    ready = pose('pitch_ready', t, 'outfielder')
    infield = pose('ready', t, 'fielder')
    assert standing['hip'][1] > .52
    assert ready['hip'][1] > .50
    assert ready['chest'][2] < .06
    assert ready['lh'][1] > .58
    assert standing['hip'][1] > infield['hip'][1] + .06
    for action in ['catch_fly', 'field_bounce']:
        p = pose(action, t, 'outfielder')
        assert np.isfinite(np.concatenate([p[k] for k in ['hip','chest','lh','rh']])).all()
    assert pose('catch_fly', t, 'outfielder')['hip'][1] >= .50

for action in ['catch_fly', 'field_bounce']:
    for endpoint in [0, 1]:
        p = pose(action, endpoint, 'outfielder')
        ready = pose('pitch_ready', 0, 'outfielder')
        for key in ['hip','chest','lf','rf','lk','rk','lh','rh','le','re']:
            assert np.allclose(p[key], ready[key]), (action, endpoint, key)
assert pose('catch_fly', 4/7, 'outfielder')['lh'][1] > 1.1
assert pose('field_bounce', 4/7, 'outfielder')['lh'][1] < .25
# From LF, the front of the body points screen-right toward home; RF mirrors it.
assert project([0,.9,.2], -25)[0] > project([0,.9,0], -25)[0]
assert project([0,.9,.2], 25)[0] < project([0,.9,0], 25)[0]
print('Passed: upright outfield stance, modest pitch set, home-facing orientation, contact and catch/gather recovery.')
