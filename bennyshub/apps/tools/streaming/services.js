// Shared platform choices and URL detection for the app and editor.
(function (root) {
    const names = ['Netflix', 'Disney+', 'Hulu', 'Prime Video', 'Max', 'Paramount+', 'PlutoTV', 'Plex', 'YouTube', 'Apple TV+', 'Peacock', 'Tubi', 'Crunchyroll', 'The Roku Channel'];
    const icons = {
        'Netflix': 'logos/netflix-com.ico', 'Disney+': 'logos/disneyplus-com.ico',
        'Hulu': 'logos/hulu-com.png', 'Prime Video': 'logos/primevideo-com.ico',
        'Max': 'logos/hbomax-com.ico', 'Paramount+': 'logos/paramountplus-com.ico',
        'PlutoTV': 'logos/pluto-tv.ico', 'Plex': 'logos/plex-tv.png',
        'YouTube': 'logos/youtube-com.ico', 'Apple TV+': 'logos/tv-apple-com.png',
        'Peacock': 'logos/peacocktv-com.ico', 'Tubi': 'logos/tubitv-com.png',
        'Crunchyroll': 'logos/crunchyroll-com.png', 'The Roku Channel': 'logos/therokuchannel-roku-com.ico'
    };
    const scriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : null;
    const domains = {
        'netflix.com': 'Netflix', 'disneyplus.com': 'Disney+', 'hulu.com': 'Hulu',
        'primevideo.com': 'Prime Video', 'amazon.com': 'Prime Video',
        'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'plex.tv': 'Plex',
        'max.com': 'Max', 'hbomax.com': 'Max', 'paramountplus.com': 'Paramount+',
        'pluto.tv': 'PlutoTV', 'tv.apple.com': 'Apple TV+', 'peacocktv.com': 'Peacock',
        'tubi.tv': 'Tubi', 'tubitv.com': 'Tubi', 'crunchyroll.com': 'Crunchyroll', 'therokuchannel.roku.com': 'The Roku Channel'
    };
    function detect(url) {
        try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
            const host = parsed.hostname.toLowerCase();
            for (const [domain, name] of Object.entries(domains)) {
                if (host === domain || host.endsWith('.' + domain)) return name;
            }
        } catch (_) {}
        return '';
    }
    function nameFor(item) {
        const saved = (item.service || '').trim();
        if (saved && saved.toLowerCase() !== 'other') return saved;
        const detected = detect(item.url);
        if (detected) return detected;
        try { return new URL(item.url).hostname.replace(/^www\./, ''); } catch (_) {}
        return 'Platform not set';
    }
    function faviconFor(item) {
        const icon = icons[nameFor(item)] || item.service_icon || '';
        if (!icon) return '';
        try {
            const url = scriptUrl ? new URL(icon, scriptUrl) : new URL(icon);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
        } catch (_) { return icons[nameFor(item)] || ''; }
    }
    function indicator(item, className = 'service-indicator') {
        const element = document.createElement('span');
        element.className = className;
        const icon = faviconFor(item);
        if (icon) {
            const image = document.createElement('img');
            image.className = 'service-icon';
            image.src = icon;
            image.alt = '';
            image.onerror = () => { image.hidden = true; };
            element.appendChild(image);
        }
        const label = document.createElement('span');
        label.textContent = nameFor(item);
        element.appendChild(label);
        return element;
    }
    const api = { names, icons, detect, nameFor, faviconFor, indicator };
    root.StreamingServices = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
