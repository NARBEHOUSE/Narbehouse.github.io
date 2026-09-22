"""Check every rendered body frame for cropping: python art/atlascheck.py."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

assets = Path(__file__).resolve().parent.parent / 'images/players'
for stem in ['gridiron', 'gridiron_actions']:
    data = json.loads((assets / f'{stem}.json').read_text())
    for layer in ['base', 'jersey']:
        alpha = np.asarray(Image.open(assets / f'{stem}_{layer}.png'))[..., 3]
        clipped = []
        for row in range(data['rows']):
            for direction in range(data['directions']):
                cell = alpha[row*64:(row+1)*64, direction*64:(direction+1)*64]
                if max(cell[0].max(), cell[-1].max(), cell[:,0].max(), cell[:,-1].max()) > 20:
                    clipped.append((row, direction))
        assert not clipped, (stem, layer, 'cropped frames (row, direction)', clipped)
print('Both atlases: no cropped body or jersey frames in any direction.')
