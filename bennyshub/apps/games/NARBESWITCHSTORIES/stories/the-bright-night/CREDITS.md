# The Bright Night

- Author: Sarah Fauzia
- Illustrator: Larasputri
- Contributing translator: Chansomey Chheang
- Publisher and copyright: © 2026 The Asia Foundation – Let's Read
- Source: the supplied `thebrightnight.pdf`, available through [Let's Read](https://www.letsreadasia.org/)
- License: [Creative Commons Attribution–NonCommercial 4.0 International](https://creativecommons.org/licenses/by-nc/4.0/)

This switch-access adaptation is by NARBE LLC and retains the source license.
Created to expand access to stories for people who use switches and support a wider range of accessibility needs.
Switch animations, Simple High Contrast images and image descriptions have been added.

The original story text is retained except for changing “Umai” to “Mom” (or “Mom's”),
localizing the Java Sea reference to the Atlantic, changing Sanja's near miss
with the chair to an actual bump, normalizing whitespace, and
adding an ending page.
“Recess” has a speech-only “ree-sess” pronunciation hint; its printed spelling
is unchanged. Longer passages are presented
in successive sections over the same illustration. Three empty repeated PDF
pages and the two informational pages about low vision and the original setting
are omitted. The final story scene leads directly to The End.

Original illustrations were extended into panoramic landscape scenes with the built-in
image generation tool. Classroom board writing and the beach sign were localized
into English. The source illustrator remains credited; the extensions are changes
made for this adaptation. Prompts are recorded in `LANDSCAPE-PROMPTS.json`.
Each entry includes the first landscape prompt and the subsequent panorama
extension prompt. `spreadFocus` protects each scene's important content from
captions; `spreadCore` identifies the central region that must keep its proportions.

The cover, all 20 story pages, and The End have switch-triggered picture actions and isolated
subjects for Simple High Contrast. Matching cutouts, a blink frame, and a clean
chair background, Braille book and tracing hand, mother/daughter expressions,
mirror/sunglasses frames, walking poses, ocean waves, seated expressions, and
the upward-looking stargazing cutout, Uncle Ampong and his separate cane,
his listening profile, a shallow-water patch, Sanja holding sand, and the
yellow/blue/green ocean-light vignettes were prepared with the
built-in image generation tool; prompts
and asset provenance are recorded in `ACTION-PROMPTS.json`. Pages 17–21 add
a curling wave, books and headphones, friends exploring a tactile book,
Sanja's celebration, and a new group ending. These illustrations and registered
poses were also prepared with the built-in image generation tool.

Page 7 uses a left-facing body and one continuous painted leg taken from a
complete generated walking pose. The leg bends smoothly without separate knee
or ankle pieces. Each supporting foot stays in place and leaves a print at its
previous contact when it lifts. Eight shorter, lower steps keep the knees gently
bent and the flip-flops near the sand. Earlier walking poses and component pieces are
retained as source artwork but are no longer loaded by the game. Page 8 starts
with Sanja standing and looking toward the ocean. On a switch press she cups
her ear and leans from her hips while both feet stay planted. Floating musical
notes remain a visible sound cue, including when audio is muted. The separate
standing/listening poses and cleared beach background match the original art.
Page 9 opens Sanja's eyes, closes them during a gentle sigh, and returns to rest.
On page 10, Sanja stays still while the stars glow and twinkle.

Page 11 keeps Uncle's feet grounded while his forearm and gripping hand move
with the whole cane, including its handle. The assembled layers receive one
continuous outline in Simple High Contrast. Page 12 brightens sparkles by his
ear. Page 13 shows Uncle's hand and red-sleeved forearm holding the cane;
the naturally sized forearm enters at the screen edge, and the grip and cane
lift and dip together with ripples at the waterline. Page 14 lets
sand fall straight down through Sanja's fingers;
the shell in her raised hand was replaced with sand in the adapted panorama.
Page 15 gives the stars and yellow water lights larger, brighter, slowly pulsing
halos in Picture Book, without
circular ripples; its focused water vignette retains a gentle flowing motion.
Page 16 brightens
the initially dim blue and green lights among the sea plants, with growing halos. Backgrounds for pages 11 and
13 have clean areas for the separate moving cane/character layers.

Page 17 grows a wave from a fixed waterline and curls its crest over. Page 18
hinges a blue cover open to reveal a new school book with tactile kite and
balloon pictures and Braille dots. The headphones stay fully visible beside
the book. It starts fully closed; the interior appears only as the cover opens.
The foreground chair was removed. This differs from the earlier book in Sanja's room. Page 19
adds shared smiles and hands exploring the book. Page 20 keeps Sanja's fist
raised during a jump, with a grounded shadow and a return to her starting
position. Pages 13 and 20 align their original sharp paintings with the top of
the screen instead of leaving a blurred wash above them. The End shows Sanja,
books, and friends cheering in a warm glow in a classroom with a chalkboard
and teacher's desk behind the group.
Clean background plates prevent duplicate static subjects behind moving sprites.
Earlier source frames remain available for authoring but replaced frames are
not loaded by the story.

Each action becomes available only after the final text section on its page.
A separate press after the animation finishes turns the page; presses during
the animation give feedback without queuing a page turn.

`tools/extract-bright-night-book.cjs` extracts the embedded source images without
resampling. `images/` holds those small source extracts; `backgrounds/` holds the
landscape game artwork. Source PDF page numbers are retained in the asset names,
while the game's page count counts each distinct scene once, plus cover and
ending. Continuations do not add pages to that count.
