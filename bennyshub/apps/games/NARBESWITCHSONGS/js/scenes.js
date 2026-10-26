/** Static song artwork in both looks; note feedback belongs to the piano. */
window.NSS = window.NSS || {};
NSS.Scenes = (function () {
    'use strict';
    // Portrait cover framing: keep the defining subject in view when the
    // original landscape illustration is wider than the screen.
    const PORTRAIT_X = {
        twinkle: 85, abc: 52, baabaa: 35, mary: 46, hotcross: 36,
        rowboat: 40, spider: 18, frere: 14, macdonald: 40, bingo: 60,
        farmer: 21, weasel: 82, oldman: 31, muffin: 70, mountain: 25,
        ants: 34, yankee: 52, ballgame: 55, saints: 46, funiculi: 85,
        birthday: 53, jingle: 53, deck: 33, lullaby: 30, grace: 60,
        greensleeves: 71, range: 20, bonnie: 28, elise: 61, entertainer: 65,
        cancan: 42, mountainking: 23, williamtell: 49, toreador: 31
    };
    function mount(host, song) {
        host.dataset.scene = song.scene;
        host.style.setProperty('--scene-portrait-position', (PORTRAIT_X[song.scene] ?? 50) + '% 35%');
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
