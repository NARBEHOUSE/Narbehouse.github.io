/** Exact uncontracted UEB picture labels, drawn from six-dot cells.
 * Sources: ICEB, Rules of Unified English Braille (2024), alphabet;
 * https://brailleauthority.org/signage/index.html (cell numbering).
 * These are lowercase labels, not sentences: no capital or punctuation signs.
 * Keep generated artwork free of dots; never ask an image model to transcribe.
 */
window.NSS = window.NSS || {};
NSS.BrailleBooks = (function () {
    'use strict';
    const alphabet = {
        a:'1', b:'12', c:'14', d:'145', e:'15', f:'124', g:'1245', h:'125', i:'24', j:'245',
        k:'13', l:'123', m:'134', n:'1345', o:'135', p:'1234', q:'12345', r:'1235', s:'234', t:'2345',
        u:'136', v:'1236', w:'2456', x:'1346', y:'13456', z:'1356'
    };
    const labels = { 'braille-book-blank.webp':['turtle','shell'], 'school-braille-book-blank.webp':['kite','balloon'] };
    const cache = new WeakMap();
    function cells(word) {
        return Array.from(word, letter => {
            if (!alphabet[letter]) throw Error('Braille picture labels use lowercase a-z only.');
            return Array.from(alphabet[letter], Number);
        });
    }
    function label(ctx, word, center, top, scale) {
        const encoded = cells(word), advance = 60 * scale, spacing = 23 * scale;
        const left = center - ((encoded.length - 1) * advance + spacing) / 2;
        encoded.forEach((dots, i) => dots.forEach(dot => {
            const col = dot > 3 ? 1 : 0, row = (dot - 1) % 3;
            const x = left + i * advance + col * spacing, y = top + row * spacing, radius = 7.5 * scale;
            ctx.save();
            ctx.shadowColor = '#b0a58b'; ctx.shadowBlur = 2 * scale; ctx.shadowOffsetY = 2 * scale;
            const fill = ctx.createRadialGradient(x-radius*.4,y-radius*.5,0,x,y,radius);
            fill.addColorStop(0,'#fffdf0'); fill.addColorStop(.65,'#e9dec3'); fill.addColorStop(1,'#bfb293');
            ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill(); ctx.restore();
        }));
    }
    function render(img) {
        const words = labels[(img.src || '').split('/').pop()];
        if (!words) return img;
        if (cache.has(img)) return cache.get(img);
        const c = document.createElement('canvas'); c.width=img.width; c.height=img.height; c.src=img.src;
        const ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
        label(ctx,words[0],c.width*.285,c.height*.70,c.width/1536);
        label(ctx,words[1],c.width*.717,c.height*.70,c.width/1536);
        cache.set(img,c); return c;
    }
    return {render,cells,labels};
})();
