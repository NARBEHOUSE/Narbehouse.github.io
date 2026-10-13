const bb2Graphics = NarbeGraphics.openGame('baseball');
function bb2GraphicsOption() {
    const state = bb2Graphics.get();
    return { value: 'graphics-quality', label: 'Graphics quality: ' + (state.choice === 'hub' ? 'Use Hub setting' : NarbeGraphics.title(state.choice)), hint: bb2Graphics.label().replace('Graphics quality: ', ''), speakText: () => bb2Graphics.label() };
}

function bb2GraphicsCaption(menu) {
    if (!menu.graphicsCaption) {
        menu.graphicsCaption = menu.scene.add.text(W / 2, H - 12, '', {
            fontSize: '15px', fontFamily: 'Arial', color: '#dff5df',
            wordWrap: { width: W - 30 }, align: 'center'
        }).setOrigin(0.5, 1).setDepth(44);
        menu.container.add(menu.graphicsCaption);
    }
    menu.graphicsCaption.setText(bb2Graphics.label());
}

// Keep gameplay in 1000x600 world units while drawing into a denser canvas.
function bb2RenderScale() {
    const fit = Math.min(window.innerWidth / W, window.innerHeight / H);
    const physical = fit * (window.devicePixelRatio || 1);
    // This canvas also draws menus/text: keep at least display resolution.
    const quality = bb2Graphics.get().quality;
    return quality === 'high' ? 3 : Math.min(3, Math.max(1, quality === 'low' ? physical : Math.ceil(physical)));
}

class BaseballScene extends Phaser.Scene {
    init() {
        const cam = this.cameras.main;
        const scale = window.__BASEBALL_RENDER_SCALE || 1;
        cam.setOrigin(0, 0).setZoom(scale).setScroll(0, 0);
        this._renderScale = scale;
        // Phaser 3.60's built-in world-view/bounds calculations assume a
        // centered camera origin. This game uses a top-left origin so pinned
        // menus retain their logical coordinates at every backing resolution.
        cam.clampX = x => Math.max(0, Math.min(W - cam.width / cam.zoom, x));
        cam.clampY = y => Math.max(0, Math.min(H - cam.height / cam.zoom, y));
        const preRender = cam.preRender;
        cam.preRender = function () {
            preRender.call(this);
            this.worldView.setTo(this.scrollX, this.scrollY, this.width / this.zoom, this.height / this.zoom);
            this.midPoint.set(this.worldView.centerX, this.worldView.centerY);
        };
    }
}

function bb2ResizeRender(game) {
    const scale = bb2RenderScale(), previous = window.__BASEBALL_RENDER_SCALE || 1;
    if (scale === previous) return;
    window.__BASEBALL_RENDER_SCALE = scale;
    game.scale.resize(W * scale, H * scale);
    for (const scene of game.scene.getScenes(false)) {
        if (!scene.cameras || !scene.cameras.main) continue;
        const cam = scene.cameras.main;
        cam.setSize(W * scale, H * scale).setZoom(cam.zoom / (scene._renderScale || previous) * scale);
        scene._renderScale = scale;
        if (scene._cameraMove && scene._viewRequest) {
            scene._cameraMove.stop();scene._cameraMove=null;
            const view=scene._viewRequest,z=view.zoom;
            cam.setZoom(z*scale).setScroll(
                Math.max(0,Math.min(W-W/z,view.x-W/(2*z))),
                Math.max(0,Math.min(H-H/z,view.y-H/(2*z))));
        }
        const updateText = object => {
            if (object.type === 'Text') object.setResolution(scale);
            if (object.list) object.list.forEach(updateText);
        };
        scene.children.list.forEach(updateText);
    }
}
