/** Short, non-blocking song celebrations. No flashes, sound APIs or input ownership. */
window.NSS = window.NSS || {};
NSS.Celebration = (function () {
    'use strict';
    const themes = [
        { id: 'stars', icon: '★', message: 'You made the music.' },
        { id: 'notes', icon: '♫', message: 'Every note was yours.' },
        { id: 'confetti', icon: '♪', message: 'What a performance!' },
        { id: 'rings', icon: '✦', message: 'You played it your way.' }
    ];
    const colors = ['#99ead4', '#ffce7a', '#b8a5ff', '#ff9fbf', '#9cdbff'];
    let bag = [], last = null, host = null, cleanup = null;
    let menu = null, menuObserver = null;

    // The translucent menu reveals the picture, never moving celebration pieces.
    function maskMenu() {
        if (!host || !menu) return;
        const r = menu.getBoundingClientRect();
        const left = r.left - 6, right = r.right + 6, top = r.top - 6, bottom = r.bottom + 6;
        host.style.clipPath = 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' +
            left + 'px ' + top + 'px, ' + left + 'px ' + bottom + 'px, ' +
            right + 'px ' + bottom + 'px, ' + right + 'px ' + top + 'px, ' + left + 'px ' + top + 'px)';
    }

    function stopMask() {
        if (menuObserver) menuObserver.disconnect();
        menuObserver = null; menu = null;
        window.removeEventListener('resize', maskMenu);
        document.removeEventListener('scroll', maskMenu, true);
        if (host) host.style.removeProperty('clip-path');
    }

    function next() {
        if (!bag.length) {
            bag = themes.slice();
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
            if (bag[0].id === last) [bag[0], bag[1]] = [bag[1], bag[0]];
        }
        const theme = bag.shift(); last = theme.id; return theme;
    }

    function stop() {
        clearTimeout(cleanup); cleanup = null;
        stopMask();
        if (host) { host.replaceChildren(); delete host.dataset.celebration; }
        host = null;
    }

    function start(target, badge) {
        stop(); host = target;
        const theme = next();
        host.dataset.celebration = theme.id;
        badge.textContent = theme.icon;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduced) {
            menu = badge.closest('.nss-card');
            maskMenu();
            if (menu) {
                menuObserver = new ResizeObserver(maskMenu);
                menuObserver.observe(menu);
                window.addEventListener('resize', maskMenu);
                document.addEventListener('scroll', maskMenu, true);
            }
            const count = NSS.Settings.get('look') === 'contrast' ? 24 : 60;
            for (let i = 0; i < count; i++) {
                const piece = document.createElement('span');
                piece.className = 'nss-celebration-piece';
                piece.style.setProperty('--x', (2 + (i + Math.random()) / count * 96) + '%');
                piece.style.setProperty('--y', (5 + Math.random() * 90) + '%');
                piece.style.setProperty('--drift', (-80 + Math.random() * 160) + 'px');
                piece.style.setProperty('--delay', (Math.random() * 1.2) + 's');
                piece.style.setProperty('--turn', (-180 + Math.random() * 360) + 'deg');
                piece.style.setProperty('--piece-color', colors[i % colors.length]);
                piece.textContent = theme.id === 'stars' ? '★' : theme.id === 'notes' ? (i % 2 ? '♪' : '♫') : '';
                host.appendChild(piece);
            }
            const ownHost = host;
            cleanup = setTimeout(function () {
                ownHost.querySelectorAll('.nss-celebration-piece').forEach(function (piece) { piece.remove(); });
                stopMask();
                cleanup = null;
            }, 6000);
        }
        return theme.message;
    }

    return { start: start, stop: stop };
})();
