// Keep gameplay in 1000x600 world units while drawing into a denser canvas.
function bb2RenderScale() {
    const fit = Math.min(window.innerWidth / W, window.innerHeight / H);
    return Math.min(3, Math.max(1, Math.ceil(fit * (window.devicePixelRatio || 1))));
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
