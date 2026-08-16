// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Emoji picker
//
// The fastest way to build a pack: no files to source, nothing to download, no
// licensing to think about, and the result stays perfectly crisp at any size
// because the game draws emoji as text rather than as a bitmap.
//
// An emoji panel and a picture panel are mutually exclusive — setting one
// clears the other, so there is never an ambiguous card.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const EMOJI_LIB = [
    ['animals',
     '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦆🦉🐓🐑🐐🐴🦄🐝🐛🦋🐌🐞🐟🐠🐬🐳🐙🦀🐘🦒🦓🦍🐪🦏🐍🐢🐊🦈🦖🐿️🦔🦇'],
    ['food',
     '🍎🍌🍇🍓🍉🍊🍑🍐🥕🌽🍅🥦🍞🥐🧀🥚🥑🍖🍗🍔🍟🍕🌭🌮🍝🍜🍣🍱🍨🍦🍰🎂🍪🍫🍬🍩☕🥛🧃🍿'],
    ['faces',
     '😄😊😂🥰😍🤩😘😋😛🙃🤔🤫🙄😏😒😴😪🤥🤒🤕🤢🥵🥶🥳😎🤓😕😟😢😭😱😠😡🥺👍👎👏💪👋🤚'],
    ['travel',
     '🚗🚕🚌🚎🚓🚑🚒🚚🚜🚲🛴🏍️🚆🚃🚋✈️🚁🚀🛸⛵🚤🛳️⛴️🏠🏫🏥🎪🎡🎢🗼🏰⛺'],
    ['nature',
     '☀️🌤️⛅🌥️☁️🌧️⛈️🌨️❄️⚡🔥🌈⭐🌟🌞🌜🌍🌲🌳🌴🌵🍀🌷🌸🌻🌼🍄🌊⛰️🌋'],
    ['play',
     '⚽🏀🏈⚾🎾🏐🎳🏓🥅🎯🎮🎲🧩🎨🖍️🎸🎹🥁🎺🎷🎤🎧🎵🔔📚🧸🎈🎁🎉🎪']
];

// Search terms per group, so typing "car" or "happy" narrows sensibly without
// shipping an entire emoji-name database.
const EMOJI_TAGS = {
    animals: 'animal animals pet dog cat farm zoo bird fish bug wild lion cow pig sheep horse bear',
    food:    'food eat fruit veg drink snack sweet dinner lunch pizza apple cake yum',
    faces:   'face faces feeling feelings emotion happy sad angry silly love mood hand thumbs',
    travel:  'travel vehicle vehicles car bus train plane boat bike transport building place house',
    nature:  'nature weather sun rain cloud snow tree flower plant space star outside',
    play:    'play sport sports game games toy toys music art ball party instrument'
};

function openEmojiPicker() {
    document.getElementById('emoji-search').value = '';
    document.getElementById('emoji-custom').value = '';
    renderEmojiGrid('');
    openModal('emoji-modal');
    document.getElementById('emoji-search').focus();
}

function renderEmojiGrid(query) {
    const q = (query || '').trim().toLowerCase();
    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = '';

    EMOJI_LIB.forEach(([group, chars]) => {
        // A query matches the group name or one of its tags; with no query,
        // every group shows.
        if (q && !group.includes(q) && !(EMOJI_TAGS[group] || '').includes(q)) return;

        // Array.from splits by code point, so multi-byte emoji stay intact
        // where a plain [...str] on .length would tear surrogate pairs apart.
        Array.from(chars).forEach(ch => {
            if (ch === '️') return;          // skip stray variation selectors
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = ch;
            b.title = group;
            b.style.cssText = 'font-size:30px; line-height:1; padding:7px 0; cursor:pointer;'
                + 'background:#fff; border:1px solid #ddd; border-radius:7px;';
            b.onmouseover = () => { b.style.background = '#ece7f8'; b.style.borderColor = '#5b3fd6'; };
            b.onmouseout = () => { b.style.background = '#fff'; b.style.borderColor = '#ddd'; };
            b.onclick = () => applyEmoji(ch);
            grid.appendChild(b);
        });
    });

    if (!grid.children.length) {
        grid.innerHTML = '<div class="muted" style="grid-column:1/-1; padding:16px;">'
            + 'Nothing matched. Paste any emoji in the box above instead.</div>';
    }
}

function useCustomEmoji() {
    const v = document.getElementById('emoji-custom').value.trim();
    if (!v) { toast('Paste an emoji first', true); return; }
    applyEmoji(v);
}

function applyEmoji(ch) {
    if (!pendingTarget) return;
    const p = panels()[pendingTarget.panelIndex];
    if (!p) return;
    p.emoji = ch;
    p.image = '';                 // emoji wins; never leave both set
    closeModal('emoji-modal');
    closeModal('selector-modal');
    renderPanels();
    renderPreview();
    autosave();
    toast('Emoji added');
    pendingTarget = null;
}
