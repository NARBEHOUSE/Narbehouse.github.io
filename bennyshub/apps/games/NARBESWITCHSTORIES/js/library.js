/**
 * NARBE Switch Stories - the story library.
 *
 * Every story lives in its own folder, stories/<folder>/, next to its
 * pictures and recordings. Its story.js registers itself by calling
 * NSS.registerStory({...}). stories/list.js names the folders, in the order
 * the library shows them.
 *
 * The story files are plain <script> tags, never fetched as JSON, so the game
 * still works when it is opened straight from the files on a computer and in
 * the desktop app.
 *
 * A story with a small mistake still loads: an unknown action or object is
 * replaced (with a warning in the console), and a picture or recording that
 * is missing is simply left out when the page is shown.
 */

window.NSS = window.NSS || {};

NSS.Library = (function () {
    'use strict';

    const C = NSS.CONFIG;
    const ROOT = 'stories/';
    const DEFAULT_BG = '#9fd8ff';

    const byFolder = {};
    let stories = [];
    let loading = null;

    function warn(story, msg) { console.warn('[NSS] Story "' + story + '": ' + msg); }

    /** The folder of the story.js that is running right now. */
    function folderOf(def) {
        const src = document.currentScript && document.currentScript.src;
        const m = src && src.match(/stories\/([^\/?#]+)\/story\.js(?:[?#]|$)/);
        if (m) return decodeURIComponent(m[1]);
        return typeof def.folder === 'string' ? def.folder : null;
    }

    /** A file name in a story is relative to that story's folder. */
    function resolver(base) {
        return function (file) {
            if (typeof file !== 'string' || !file.trim()) return null;
            file = file.trim();
            return /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(file) ? file : base + file;
        };
    }

    /** page-01.png -> page-01-cvi.png, for when a page does not name its CVI picture. */
    function cviNameFor(file) {
        return file.replace(/(\.[a-z0-9]+)(?=([?#].*)?$)/i, '-cvi$1');
    }

    /** cover, page-01, page-02 ... : the name every page's own files use. */
    function pageName(i) { return i === 0 ? 'cover' : 'page-' + (i < 10 ? '0' : '') + i; }

    function color(value, fallback) {
        if (typeof value !== 'string') return fallback;
        let v = value.trim();
        if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
        return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
    }

    /** A picture and its CVI partner, ready for the scene. */
    function picture(name, image, cviImage, file) {
        const img = file(image);
        if (!img) return null;
        const cvi = file(cviImage) || cviNameFor(img);
        // The CVI picture's outline ring on its own (rocky-sit-cvi-outline.png),
        // for the Outline colour setting. Optional: without it the edge stays as drawn.
        const outline = cvi.replace(/(\.[a-z0-9]+)(?=([?#].*)?$)/i, '-outline$1');
        return { image: img, cviImage: cvi, cviGuessed: !file(cviImage), outline: outline, label: name };
    }

    /** A pose name on a page, checked against the story's character poses. */
    function poseName(value, poses, title, where, field) {
        if (value === undefined || value === null || value === '') return null;
        const name = String(value).trim();
        if (poses && poses[name]) return name;
        warn(title, where + ' has ' + field + ' "' + value + '", which is not one of the character\'s poses' +
            (poses ? ': ' + Object.keys(poses).join(', ') : ' (the story has no character poses)') + '.');
        return null;
    }

    /** A background picture: colourful only (Simple High Contrast never shows backgrounds). */
    function background(value, file) {
        const img = file(value);
        return img ? { image: img, background: true } : null;
    }

    function floorStrip(value) {
        return Array.isArray(value) && value.length === 2 &&
            value.every(n => Number.isFinite(n) && n >= 0.5 && n <= 1) &&
            value[1] - value[0] >= 0.05 ? value.slice() : null;
    }

    // A wider illustration shares the original room's height and actor layout.
    // Its outer edges contain only scenery, so they can expand on very wide screens.
    function panorama(value, file) {
        if (!value || typeof value !== 'object') return null;
        const image = background(value.image, file), floor = floorStrip(value.floor);
        if (!image || !floor) return null;
        const bounds = value.afterBounds;
        return {
            picture: image, afterPicture: background(value.afterImage, file), floor: floor,
            edge: Number.isFinite(value.edge) ? clampNum(value.edge, 0.01, 0.1) : 0.06,
            extensionPicture: background(value.extensionImage, file),
            afterBounds: Array.isArray(bounds) && bounds.length === 4 &&
                bounds.every(n => Number.isFinite(n) && n >= 0 && n <= 1) &&
                bounds[0] < bounds[2] && bounds[1] < bounds[3] ? bounds.slice() : null
        };
    }

    /** An object name on a page: a built-in thing (ball, bird ...) or one of the story's own objects. */
    function objectName(value, objects, title, where, field) {
        if (typeof value !== 'string' || !value.trim()) return null;
        const name = value.trim().toLowerCase();
        if (C.objects.indexOf(name) >= 0 || objects[name]) return name;
        warn(title, where + ' has ' + field + ' "' + value + '", which is not one of the story\'s objects: ' +
            Object.keys(objects).concat(C.objects).join(', ') + '. Leaving it out.');
        return null;
    }

    /**
     * A page's cast: who is on it, where (at: 0 left to 1 right), and which of
     * their poses they show before, during and after the action.
     */
    function castList(raw, cast, title, where) {
        if (!Array.isArray(raw)) return null;
        const list = [];
        raw.forEach(function (m, k) {
            if (!m || typeof m !== 'object') return;
            const who = typeof m.who === 'string' ? m.who.trim().toLowerCase() : '';
            if (!cast || !cast[who]) {
                warn(title, where + ' cast has "' + m.who + '", who is not in the story\'s cast' + (cast ? ': ' + Object.keys(cast).join(', ') : '') + '.');
                return;
            }
            const poses = cast[who].poses;
            const pose = poseName(m.pose, poses, title, where + ' (' + who + ')', 'pose') || Object.keys(poses)[0];
            list.push({
                who: who,
                at: typeof m.at === 'number' ? clampNum(m.at, 0, 1) : (k + 1) / (raw.length + 1),
                afterAt: typeof m.afterAt === 'number' ? clampNum(m.afterAt, 0, 1) : null,
                settleAt: typeof m.settleAt === 'number' ? clampNum(m.settleAt, 0, 1) : 1,
                size: typeof m.size === 'number' ? clampNum(m.size, 0.3, 2) : cast[who].size,
                pose: pose,
                actionPose: poseName(m.actionPose, poses, title, where + ' (' + who + ')', 'actionPose'),
                afterPose: poseName(m.afterPose, poses, title, where + ' (' + who + ')', 'afterPose'),
                wiggle: !!m.wiggle
            });
        });
        return list.length ? list : null;
    }

    function clampNum(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function plainText(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }

    // An optional hub release date, kept out of the interface. Undated books sort last.
    function releaseDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
        const time = Date.parse(value + 'T00:00:00Z');
        return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : '';
    }

    function storyTags(raw) {
        const tags = [];
        (Array.isArray(raw) ? raw : []).forEach(value => {
            const tag = plainText(value);
            if (tag && !tags.some(t => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
        });
        return tags;
    }

    function normalizeIllustration(raw, objects) {
        if (!raw || !Array.isArray(raw.layers)) return null;
        const poses = frames => (Array.isArray(frames) ? frames : [])
            .filter(f => f && objects[f.object] && Number.isFinite(f.at))
            .map(f => ({ object: f.object, at: clampNum(f.at, 0, 1) }))
            .sort((a, b) => a.at - b.at);
        const layers = raw.layers.filter(l => l && objects[l.object]).map(l => ({
            object: l.object, x: clampNum(Number(l.x) || 0.5, 0, 1),
            bottom: clampNum(Number(l.bottom) || 0.75, 0, 1),
            height: clampNum(Number(l.height) || 0.4, 0.04, 1),
            foot: clampNum(Number(l.foot) || 0.96, 0.8, 1),
            grounded: !!l.grounded, active: !!l.active, cviActive: !!l.cviActive, contrastOnly: !!l.contrastOnly,
            motion: ['hop', 'fly', 'sunset'].includes(l.motion) ? l.motion : '',
            poses: poses(l.poses), cviPoses: poses(l.cviPoses),
            travel: Number.isFinite(l.travel) ? clampNum(l.travel, -0.7, 0.7) : 0,
            drop: Number.isFinite(l.drop) ? clampNum(l.drop, -0.3, 0.3) : 0
        }));
        if (!layers.length) return null;
        const focus = raw.focus;
        return {
            layers: layers,
            panorama: objects[raw.panorama] ? raw.panorama : null,
            extension: objects[raw.extension] ? raw.extension : null,
            panoramaBounds: Array.isArray(raw.panoramaBounds) && raw.panoramaBounds.length === 3 && raw.panoramaBounds.every(Number.isFinite) &&
                raw.panoramaBounds[0] > 0 && raw.panoramaBounds[0] < raw.panoramaBounds[1] && raw.panoramaBounds[1] < 1 &&
                raw.panoramaBounds[2] > 0.7 && raw.panoramaBounds[2] < 1
                ? raw.panoramaBounds : [0.05, 0.95, 0.90],
            shoreline: raw.shoreline && objects[raw.shoreline.object] && Array.isArray(raw.shoreline.mask)
                ? { object: raw.shoreline.object, mask: raw.shoreline.mask.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) }
                : null,
            focus: Array.isArray(focus) && focus.length === 4 && focus.every(Number.isFinite) &&
                focus[0] < focus[2] && focus[1] < focus[3] ? focus.map(n => clampNum(n, 0, 1)) : [0, 0, 1, 1],
            colors: (raw.colors || []).slice(0, 3).map(c => color(c, '#fff2d2')),
            cover: !!raw.cover
        };
    }

    function normalizeCredits(raw) {
        if (!raw || typeof raw.text !== 'string') return null;
        return { text: raw.text, links: (Array.isArray(raw.links) ? raw.links : [])
            .filter(l => l && typeof l.label === 'string' && /^https:\/\//i.test(l.url || ''))
            .map(l => ({ label: l.label, url: l.url })) };
    }

    /** [x, y] as fractions of the picture (where an object comes out of, or where a character starts). */
    function point(value, fallback) {
        return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number')
            ? [clampNum(value[0], 0, 1), clampNum(value[1], 0, 1)] : fallback;
    }

    function normalizePage(raw, i, title, file, lastBg, poses, objects, cast) {
        const where = 'page ' + (i + 1);
        const p = raw && typeof raw === 'object' ? raw : {};
        let text = typeof p.text === 'string' ? p.text.replace(/\s+/g, ' ').trim() : '';
        if (!text) { warn(title, where + ' has no text.'); text = ' '; }
        let action = typeof p.action === 'string' ? p.action.trim().toLowerCase() : '';
        if (!C.actions[action]) {
            warn(title, where + ' has action "' + p.action + '", which is not one of: ' + Object.keys(C.actions).join(', ') + '. Using "wag".');
            action = 'wag';
        }
        const object = objectName(p.object, objects, title, where, 'object');
        const castOnPage = castList(p.cast, cast, title, where);
        const cviRaw = p.cvi && typeof p.cvi === 'object' ? p.cvi : {};
        return {
            // --- pages with a cast of characters and a background picture ---
            illustration: normalizeIllustration(p.illustration, objects),
            cast: castOnPage,
            castOverlap: typeof p.castOverlap === 'number' ? clampNum(p.castOverlap, 0, 0.5) : 0,
            actor: castOnPage ? (castOnPage.find(m => m.who === String(p.actor || '').toLowerCase()) || castOnPage[0]).who : null,
            background: background(p.background, file),
            afterBackground: background(p.afterBackground, file),      // fades in during the action (doors opening)
            backgroundFit: p.backgroundFit === 'contain' ? 'contain' : 'cover',
            backgroundExtend: p.backgroundExtend === true,
            panorama: panorama(p.panorama, file),
            // Optional clear-floor strip, bounded by horizontal board or paving seams.
            backgroundFloor: floorStrip(p.backgroundFloor),
            ground: typeof p.ground === 'number' ? clampNum(p.ground, 0.4, 1) : 0.86,
            // For illustrated rooms, measure children against the background,
            // not the independently changing screen/text-box height.
            characterHeight: typeof p.characterHeight === 'number' ? clampNum(p.characterHeight, 0.1, 1) : null,
            from: point(p.from, null),                                  // where a roll starts, or where an object comes out
            objectBounds: Array.isArray(p.objectBounds) && p.objectBounds.length === 4
                ? p.objectBounds.map(v => clampNum(Number(v) || 0, 0, 1)) : null,
            objectAction: objectName(p.objectAction, objects, title, where, 'objectAction'),
            objectSize: typeof p.objectSize === 'number' ? clampNum(p.objectSize, 0.1, 1) : 0.6,
            // Simple High Contrast: the one thing this page shows on black.
            cvi: {
                keepPositions: cviRaw.keepPositions === true,
                show: Array.isArray(cviRaw.show) ? cviRaw.show.map(s => String(s).toLowerCase()).filter(s => cast && cast[s]) : null,
                object: objectName(cviRaw.object, objects, title, where, 'cvi.object'),
                actionObject: objectName(cviRaw.actionObject, objects, title, where, 'cvi.actionObject'),
                sizeLike: cast && cast[cviRaw.sizeLike] ? cviRaw.sizeLike : null
            },
            // --- every page ---
            number: i,
            text: text,
            action: action,
            object: object || null,
            bg: color(p.bg, lastBg),
            picture: picture(where, p.image, p.cviImage, file),
            // Which of the character's poses to show: before, during and after the action.
            pose: poseName(p.pose, poses, title, where, 'pose'),
            actionPose: poseName(p.actionPose, poses, title, where, 'actionPose'),
            afterPose: poseName(p.afterPose, poses, title, where, 'afterPose'),
            // Retained as book metadata for possible future narrated editions.
            // The reader currently uses computer voice and does not load these files.
            narration: file(p.narration) || file('audio/' + pageName(i) + '.mp3'),
            narrationNamed: !!file(p.narration),
            // actionSound plays instead of the built-in one ('none' for silence);
            // afterSound plays right after the action, as well.
            actionSound: p.actionSound === 'none' ? null : file(p.actionSound),
            actionSilent: p.actionSound === 'none',
            afterSound: file(p.afterSound)
        };
    }

    /**
     * Called by each story.js. Returns the story as the game will use it, or
     * null if it cannot be used at all.
     */
    function register(def) {
        if (!def || typeof def !== 'object') { console.warn('[NSS] registerStory needs a story.'); return null; }
        const folder = folderOf(def);
        const title = typeof def.title === 'string' && def.title.trim() ? def.title.trim() : (folder || 'Untitled');
        if (!folder) { warn(title, 'could not tell which folder it is in. Load it from stories/<folder>/story.js.'); return null; }
        if (!Array.isArray(def.pages) || !def.pages.length) { warn(title, 'has no pages.'); return null; }

        const base = ROOT + folder + '/';
        const file = resolver(base);

        // The character's poses: { sit: 'sprites/rocky-sit.png', ... }. Each is a
        // transparent picture, so actions move just the character.
        let poses = null;
        const ch = def.character;
        if (ch && ch.poses && typeof ch.poses === 'object') {
            poses = {};
            Object.keys(ch.poses).forEach(function (name) {
                const v = ch.poses[name];
                const pic = typeof v === 'string' ? picture('pose ' + name, v, null, file) : v && picture('pose ' + name, v.image, v.cviImage, file);
                if (pic) poses[name] = pic;
            });
            if (!Object.keys(poses).length) poses = null;
        }
        // Pictures for the things on a page: { ball: 'sprites/ball.png', ... }.
        const objects = {};
        if (def.objects && typeof def.objects === 'object') {
            Object.keys(def.objects).forEach(function (name) {
                const v = def.objects[name];
                const pic = typeof v === 'string' ? picture(name, v, null, file) : v && picture(name, v.image, v.cviImage, file);
                if (pic) objects[name] = pic;
            });
        }

        // A cast of characters, each with their own poses:
        // { lily: { name: 'Lily', poses: { seated: 'sprites/lily-seated.png', ... } }, ... }
        let cast = null;
        if (def.cast && typeof def.cast === 'object') {
            cast = {};
            Object.keys(def.cast).forEach(function (id) {
                const c = def.cast[id] || {};
                const who = id.toLowerCase();
                const cp = {};
                Object.keys(c.poses || {}).forEach(function (name) {
                    const v = c.poses[name];
                    const pic = typeof v === 'string' ? picture(who + ' ' + name, v, null, file) : v && picture(who + ' ' + name, v.image, v.cviImage, file);
                    if (pic) cp[name] = pic;
                });
                if (Object.keys(cp).length) cast[who] = {
                    name: typeof c.name === 'string' ? c.name : id, poses: cp, grounded: c.grounded === true,
                    size: typeof c.size === 'number' ? clampNum(c.size, 0.3, 2) : 1
                };
                else warn(title, 'cast member "' + id + '" has no poses.');
            });
            if (!Object.keys(cast).length) cast = null;
        }

        // Contact points are measured from each sprite's opaque wheels/feet at build time.
        // Keeping these in story data avoids canvas pixel reads (and file:// tainting).
        const contactMap = def.contactShadows || {};
        const contactPics = Object.values(poses || {}).concat(Object.values(objects), ...Object.values(cast || {}).map(c => Object.values(c.poses)));
        contactPics.forEach(pic => {
            pic.cviOutline = def.cviOutline === 'alpha' ? 'alpha' : null;
            if (pic.cviOutline === 'alpha') pic.outline = null;
            const key = pic.image.split('/').pop().replace(/\.(?:png|webp|jpe?g)$/i, '');
            pic.contacts = (contactMap[key] || []).filter(c => Array.isArray(c) && c.length === 3 && c.every(Number.isFinite))
                .map(c => c.map(v => clampNum(v, 0, 1)));
        });

        let lastBg = DEFAULT_BG;
        const pages = def.pages.map(function (raw, i) {
            const page = normalizePage(raw, i, title, file, lastBg, poses, objects, cast);
            lastBg = page.bg;
            return page;
        });
        if (pages.length < 2) warn(title, 'has only a cover page.');

        const story = {
            id: folder,
            title: title,
            description: plainText(def.description),
            availableOn: releaseDate(def.availableOn),
            readingTag: plainText(def.readingTag),
            storyType: ['original', 'adapted'].includes(def.storyType) ? def.storyType : '',
            tags: storyTags((Array.isArray(def.tags) ? def.tags : []).concat(def.readingTag)),
            pageCount: pages.length,
            base: base,
            credits: normalizeCredits(def.credits),
            poses: poses,
            grounded: !!(def.character && def.character.grounded),
            firstPose: poses ? Object.keys(poses)[0] : null,
            cast: cast,
            objects: objects,
            // While its pictures are still being made, a story shows labelled
            // placeholders for the missing ones, without a warning for each.
            artInProgress: !!def.artInProgress,
            pages: pages
        };
        if (story.artInProgress) {
            const quiet = pic => { if (pic) pic.quiet = true; };
            Object.keys(objects).forEach(k => quiet(objects[k]));
            Object.keys(cast || {}).forEach(id => Object.keys(cast[id].poses).forEach(k => quiet(cast[id].poses[k])));
            pages.forEach(p => { quiet(p.background); quiet(p.afterBackground); });
        }
        // Each page knows its story (kept out of the way of anything that lists a page's fields).
        pages.forEach(function (p) { Object.defineProperty(p, 'story', { value: story }); });
        if (byFolder[folder]) warn(title, 'was registered twice; using the second one.');
        byFolder[folder] = story;
        return story;
    }

    /** Load every story named in stories/list.js. Resolves once all have run (or failed). */
    function load() {
        if (loading) return loading;
        const list = Array.isArray(NSS.STORY_LIST) ? NSS.STORY_LIST.filter(f => typeof f === 'string' && f.trim()) : [];
        if (!list.length) console.warn('[NSS] stories/list.js names no stories.');
        loading = Promise.all(list.map(function (folder) {
            folder = folder.trim();
            if (byFolder[folder]) return Promise.resolve();   // already on the page (a bundled copy)
            return new Promise(function (resolve) {
                const s = document.createElement('script');
                s.src = ROOT + encodeURIComponent(folder) + '/story.js';
                s.async = false;      // run in list order
                s.onload = resolve;
                s.onerror = function () { console.warn('[NSS] Could not load ' + s.src + '. Is the folder name in stories/list.js right?'); resolve(); };
                document.head.appendChild(s);
            });
        })).then(function () {
            stories = list.map(f => byFolder[f.trim()]).filter(Boolean);
            return stories;
        });
        return loading;
    }

    return {
        register: register,
        load: load,
        all: function () { return stories.slice(); },
        get: function (id) { return byFolder[id] || null; }
    };
})();

/** What a story's story.js calls. */
NSS.registerStory = NSS.Library.register;
