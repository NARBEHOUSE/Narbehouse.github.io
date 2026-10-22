/**
 * Switch Stories - the stories in the library, in the order they show.
 *
 * To add a story:
 *   1. Copy the stories/_template folder and give the copy a new name, like
 *      stories/rocky-goes-to-the-park (lowercase, dashes, no spaces).
 *   2. Write the story in that folder's story.js.
 *   3. Add the folder's name to this list.
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
 * last edited. Newest sorts by this date, newest first. Leave existing release
 * dates unchanged when fixing artwork/text. Undated books appear last; equal
 * dates keep this list's order. All Stories always uses the list order below.
 */

window.NSS = window.NSS || {};

NSS.STORY_LIST = [
    'froggy-family-goes-to-cape-cod',
    'rocky-says-hello',
    'lily-loves-books'
];
