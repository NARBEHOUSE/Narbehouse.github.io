/**
 * Switch Stories - the stories to load into the library.
 *
 * To add a story:
 *   1. Copy the stories/_template folder and give the copy a new name, like
 *      stories/rocky-goes-to-the-park (lowercase, dashes, no spaces).
 *   2. Write the story in that folder's story.js.
 *   3. Add the folder's name to this list.
 *      Set availableOn in its story.js to the date it first becomes available
 *      on the hub so it appears first when it is the newest release.
 *   4. Add a row for each page (cover is 0) in ../IMAGE-DESCRIPTIONS.html.
 *      Fill both image columns and, for animated pages, both after-action
 *      columns. The game reads that editable table directly on startup.
 *
 * Add these optional fields beside title in NSS.registerStory({...}):
 *   description: 'One or two inviting sentences that spark curiosity.',
 *   availableOn: '2026-10-21', // YYYY-MM-DD: first available on the hub
 *   readingTag: 'Repetition',  // a one- or two-word description of the text
 *   tags: ['Animals', 'Friendship']
 * Filters build themselves from tags and readingTag (case-insensitive, no duplicates).
 * Introduce the character or setting in descriptions without revealing plot
 * events or endings. Invite readers to discover what happens for themselves.
 * Prefer one or two existing topics; add a new topic when it helps people choose.
 * Describe the text rather than assigning an age to the reader. Page counts
 * come from pages.length and include the title and ending. Animations are
 * standard for these stories and do not need a tag.
 * The By Page Count submenu groups these counts automatically; no page-range
 * tags need to be added to a story.
 * State whether the story is original or adapted in its title-page credits,
 * along with artwork provenance. Story type is not a library filter.
 *
 * availableOn is internal sorting metadata: never displayed as a date. Set it
 * when the book becomes available on the hub, not when it was written or
 * last edited. All Stories and tag/page-count results sort by this date, newest
 * first. Most Read instead uses reading sessions saved in this browser, with
 * newer releases first when counts tie. Opening a story or choosing Read Again
 * counts once; page navigation, pausing and Start Over do not add sessions.
 * Leave existing release
 * dates unchanged when fixing artwork/text. Undated books appear last; equal
 * dates keep this list's order.
 *
 * For a longer page, use textParts: ['First few sentences.', 'Next sentences.']
 * instead of text. Each switch press replaces the passage on the same picture;
 * a page's action, if any, follows the final passage. Keep each passage short
 * enough for Extra Large text on a phone. Continuations do not add page counts.
 * Static illustrated pages may use spread: 'backgrounds/page-01.webp' with
 * action: 'none'. This shows the same art in both looks until simplified art
 * is authored. spreadFocus: [left, top, right, bottom] uses 0–1 image coordinates
 * to keep key content above captions. For panoramas, spreadCore: [left, right]
 * protects the character region while added outer scenery fills wider screens.
 * The Bright Night shows how to add spreadAction cutouts to these panoramas:
 * object names a transparent story object; bounds gives its action region in
 * source-image coordinates. Optional closedObject/overlay supply blink frames.
 * poses lists additional object frames; overlays lists matching panorama frames.
 * detailObject adds a moving detail such as a hand; travel sets horizontal
 * movement as a fraction of the source image width. Keep pose canvases aligned.
 * For beachwalk, rig.leg names one continuous painted leg; the body is object.
 * The assembled character gets one outline and its feet plant in world space.
 * requireFreshTurn: true makes a story wait for a new press after each action,
 * even if the reader pressed while it was still playing.
 */

window.NSS = window.NSS || {};

NSS.STORY_LIST = [
    'froggy-family-goes-to-cape-cod',
    'rocky-says-hello',
    'lily-loves-books',
    'the-bright-night'
];
