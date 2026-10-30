/** The editable chart is the source of truth, including in the offline hub.
 * A sandboxed local document sends plain table text. Web requests use the parent
 * page's offline cache; file:// keeps direct loading. No generated duplicate,
 * network service, or executable chart content runs in this page.
 */
window.NSS = window.NSS || {};
NSS.Descriptions = (function () {
    'use strict';
    let loading, rows = new Map();
    const fields = ['bookImage', 'bookAction', 'simpleImage', 'simpleAction'];
    function load() {
        if (loading) return loading;
        loading = new Promise(resolve => {
            const frame = document.createElement('iframe');
            frame.hidden = true;
            frame.tabIndex = -1;
            frame.setAttribute('aria-hidden', 'true');
            frame.setAttribute('sandbox', 'allow-scripts');
            frame.title = 'Story description data';
            let timer, request, finished = false;
            function finish() {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (request) request.abort();
                window.removeEventListener('message', receive);
                frame.remove();
                resolve();
            }
            function receive(event) {
                if (event.source !== frame.contentWindow || event.data?.type !== 'nss-description-chart-v1') return;
                const data = event.data.rows;
                if (!Array.isArray(data) || data.length > 10000) return;
                const next = new Map();
                for (const row of data) {
                    if (!row || !/^[a-z0-9-]+$/.test(row.story) || !Number.isInteger(row.page) || row.page < 0) continue;
                    const value = {};
                    fields.forEach(key => { value[key] = typeof row[key] === 'string' ? row[key].replace(/\s+/g, ' ').trim().slice(0, 8000) : ''; });
                    next.set(row.story + ':' + row.page, value);
                }
                rows = next;
                finish();
            }
            window.addEventListener('message', receive);
            timer = setTimeout(() => { console.warn('[NSS] Image description chart did not load.'); finish(); }, 8000);
            function attach(html) {
                if (finished) return;
                if (typeof html === 'string') frame.srcdoc = html;
                else frame.src = 'IMAGE-DESCRIPTIONS.html';
                document.body.appendChild(frame);
            }
            if (/^https?:$/.test(window.location.protocol)) {
                // An opaque-origin sandbox navigation can bypass the Hub's
                // service worker. Fetch through the controlled parent, then
                // run the unchanged chart in the same isolated sandbox.
                request = new AbortController();
                fetch('IMAGE-DESCRIPTIONS.html', { signal: request.signal, credentials: 'same-origin' })
                    .then(response => {
                        if (!response.ok) throw new Error('Description chart: HTTP ' + response.status);
                        return response.text();
                    })
                    .then(attach)
                    .catch(() => { if (!finished) attach(); });
            } else {
                attach();
            }
        });
        return loading;
    }
    function get(story, page, simple, kind) {
        const row = rows.get(story + ':' + page);
        return row ? row[(simple ? 'simple' : 'book') + (kind === 'after' ? 'Action' : 'Image')] : '';
    }
    // Keep Extra Large text readable on phones even after an editor adds prose.
    // Prefer sentence boundaries; long sentences split only between words.
    function parts(text) {
        const result = [];
        let part = '';
        for (const sentence of (text.match(/[^.!?]+[.!?]+(?:["”’']+)?|[^.!?]+$/g) || [])) {
            if (part && part.length + 1 + sentence.trim().length > 115) { result.push(part); part = ''; }
            for (const word of sentence.trim().split(/\s+/)) {
                if (part && (part + ' ' + word).length > 115) { result.push(part); part = ''; }
                part += (part ? ' ' : '') + word;
            }
        }
        if (part) result.push(part);
        return result;
    }
    function check(stories) {
        const missing = [];
        stories.forEach(story => story.pages.forEach((page, i) => {
            for (const simple of [false, true]) for (const kind of ['before', 'after']) {
                if (kind === 'after' && page.action === 'none') continue;
                if (!get(story.id, i, simple, kind)) missing.push(story.id + ' page ' + i + ' ' + (simple ? 'simple ' : 'book ') + kind);
            }
        }));
        if (missing.length) console.warn('[NSS] Missing image descriptions: ' + missing.join(', '));
        return missing;
    }
    return { load, get, parts, check };
})();
