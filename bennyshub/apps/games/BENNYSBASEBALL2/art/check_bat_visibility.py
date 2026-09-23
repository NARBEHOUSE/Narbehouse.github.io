"""Measure visible barrel pixels through the actual game camera and depth buffer."""
import numpy as np
from build_players import build, pose, render_view, CENTER, DIST, PITCH

# On the batter, material 5 is the wooden barrel and knob. Other geometry
# still writes depth, so a black helmet can hide the bat in the full render.
colors = [[0, 0, 0] for _ in range(9)]
colors[5] = [1, 1, 1]
for name, count in [('load_charge',33),('bunt',8),('swing_normal',12),('swing_power',12)]:
    ratios = []
    for i in range(count):
        vertices, triangles, materials, _ = build(name, i/(count-1), 'batter')
        view = dict(yaw_deg=270, pitch_deg=PITCH, width=256, height=256,
                    center=CENTER, dist=DIST, bg=(0,0,0), ambient=(1,0,0))
        full = render_view(vertices, triangles, materials, colors, **view)
        wood = materials == 5
        isolated = render_view(vertices, triangles[wood], materials[wood], colors, **view)
        expected = np.count_nonzero(isolated[...,0] > .01)
        assert expected > 0, (name, i, 'missing barrel')
        visible = np.count_nonzero(full[...,0] > .01)/expected
        # A squared bunt puts the top hand farther along the wood. That hand
        # legitimately hides more of the grip than two stacked swing hands.
        # Check the exposed barrel separately so this cannot conceal head clipping.
        p=pose(name,i/(count-1));a,b=p['bat'];axis=b-a
        split=np.linalg.norm(p['rh']-p['lh'])>.12
        assert visible >= (.74 if split else .85), (name, i, 'bat obscured', visible)
        along=((vertices[triangles].mean(axis=1)-a)@axis)/np.dot(axis,axis)
        tip=wood&(along>.75)
        tip_materials=np.where(tip,5,0)
        full_tip=render_view(vertices,triangles,tip_materials,colors,**view)
        isolated_tip=render_view(vertices,triangles[wood],tip_materials[wood],colors,**view)
        tip_pixels=np.count_nonzero(isolated_tip[...,0]>.01)
        assert tip_pixels>20,(name,i,'barrel end unreadable')
        assert np.count_nonzero(full_tip[...,0]>.01)/tip_pixels>=.98,(name,i,'exposed barrel clipped')
        ratios.append(visible)
    print(name, 'minimum visible wood:', round(min(ratios)*100,1), '%')
