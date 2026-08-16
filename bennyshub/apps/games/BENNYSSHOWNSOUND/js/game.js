// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Phaser boot
//
// SUPERSAMPLING — read this before changing the scale config.
//
// The obvious approach (and the one Football/Baseball use) is
// `scale: { mode: FIT, zoom: N }`, on the assumption that `zoom` enlarges the
// canvas backing store. **It does not.** Measured on Phaser 3.60:
//
//     FIT  + zoom:2                  -> canvas 1000x600   (zoom ignored)
//     NONE + zoom:2                  -> canvas 1000x600   (zoom ignored)
//     width:2000,height:1200 + FIT   -> canvas 2000x1200  ✓
//
// With a 1000x600 backing store stretched across ~1500 device pixels, every
// edge is resampled up — which is exactly the "jagged / low resolution" look.
//
// So the game is created at SS times the world size and the main camera is
// zoomed by SS, which leaves every coordinate in the code in the original
// 1000x600 space. Scenes call setupCamera() to opt in; anything that reads
// pointer coordinates must use worldX/worldY, not x/y.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supersample factor: how many canvas pixels to render per world unit.
 *
 * Sized so the backing store is never smaller than the device pixels it will be
 * stretched across. Uses the larger of the window and the screen so maximising
 * later does not suddenly soften everything, and is capped at 4 (a 4000x2400
 * canvas, ~38MB) which still covers a 4K display.
 */
function computeSupersample() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(window.innerWidth || 0, (window.screen && window.screen.width) || 0, W);
    const cssH = Math.max(window.innerHeight || 0, (window.screen && window.screen.height) || 0, H);
    const need = Math.max((cssW * dpr) / W, (cssH * dpr) / H);
    return Math.min(4, Math.max(1, Math.ceil(need)));
}

/**
 * Put a scene's camera into world space.
 *
 * The game canvas is W*SS x H*SS; zooming the camera by SS and centring it on
 * the world midpoint makes the visible region exactly W x H, so every layout
 * constant stays in 1000x600 units.
 */
function setupCamera(scene) {
    const ss = window.__GAME_ZOOM || 1;
    const cam = scene.cameras.main;
    cam.setZoom(ss);
    cam.centerOn(W / 2, H / 2);
    return cam;
}

window.addEventListener('load', () => {
    const SS = computeSupersample();
    window.__GAME_ZOOM = SS;

    // Phaser text rasterises at 1x and is then scaled by the camera, so it must
    // be told to render at the supersampled density too or it stays soft while
    // everything around it sharpens up.
    const _factoryText = Phaser.GameObjects.GameObjectFactory.prototype.text;
    Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
        const obj = _factoryText.call(this, x, y, text, style);
        if (obj && obj.setResolution) obj.setResolution(SS);
        return obj;
    };

    const config = {
        type: Phaser.AUTO,
        width: W * SS,
        height: H * SS,
        parent: 'game',
        backgroundColor: THEME.BG,
        render: {
            antialias: true,
            antialiasGL: true,
            roundPixels: false,
            pixelArt: false
            // NO mipmapFilter. WebGL1 cannot mipmap non-power-of-two textures,
            // and every Phaser Text object is backed by an NPOT canvas — asking
            // for a mipmap filter leaves those textures incomplete. scenes.js
            // resamples panel art on the CPU instead.
        },
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
            // Deliberately no `zoom` here — see the header. Supersampling comes
            // from the game size above plus the per-scene camera zoom.
        },
        // Panel images come from user packs and may be served from anywhere the
        // pack was copied from; without this a cross-origin image taints the
        // canvas and Phaser cannot use it.
        loader: { crossOrigin: 'anonymous' },
        scene: [BootScene, TitleScene, SettingsScene, CategoryScene, WheelScene]
    };

    window.__shownSoundGame = new Phaser.Game(config);
});
