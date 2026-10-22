# Switch Stories image optimization

The shipping game uses optimized WebP images. Original dimensions are unchanged.
Sprites, outlines, and high-contrast images use pixel-exact lossless compression,
including transparency. Lily’s six room panoramas are also lossless. Other opaque backgrounds use WebP quality 90. An image keeps
its original format when conversion would make it larger.

The complete pre-optimization game, including original artwork, source PDFs,
incoming generations, references and edit prompts, is kept outside the shipping
game under `local-reference/switchstories-originals-20261022-153601/game/`
at the project root. The archive is ignored by Git and sits outside the desktop
package's included directories. Do not copy it into the website repository.

Measured sizes (decimal MB), before code-reference/documentation updates:
- Runtime images: 200,369,927 bytes to 87,461,325 bytes (56.4% smaller).
- Authoring/reference material moved out of the shipping folder: 85,317,452 bytes.
- Complete game folder: 286,135,150 bytes to 87,909,096 bytes (69.3% smaller).

The archive also contains the per-file compression report and checksums.
Reproduce conversions with `tools/optimize-switchstories-images.py` using the
archived game as input and a new empty output directory. Review and update image
references when changing formats; contact-shadow keys must ignore the extension.
The script requires Pillow with WebP support.

Keep each story's credits and content license when distributing optimized files.
Image optimization does not replace or change those licenses.

Validation: image pixels/alpha and dimensions verified; responsive layout, outline colors and all Froggy pages/animations passed. Lily artwork and desktop-through-phone checks passed. Its 320px floor-seam assertion also fails against the untouched original game; this pre-existing layout issue was not changed by image optimization.
