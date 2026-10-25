/** Static song artwork in both looks; note feedback belongs to the piano. */
window.NSS = window.NSS || {};
NSS.Scenes = (function () {
    'use strict';
    function mount(host, song) {
        host.dataset.scene = song.scene;
        const picture = document.createElement('picture');
        picture.className = 'nss-scene-picture';
        const wide = document.createElement('source');
        wide.media = '(orientation: landscape)';
        wide.srcset = 'images/scenes-wide/' + song.scene + '.webp';
        const image = document.createElement('img');
        image.src = 'images/scenes/' + song.scene + '.webp';
        image.alt = '';
        image.width = 1280;
        image.height = 800;
        image.draggable = false;
        picture.append(wide, image);
        host.replaceChildren(picture);
    }

    return { mount };
})();
