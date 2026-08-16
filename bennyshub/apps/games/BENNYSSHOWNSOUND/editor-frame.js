// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Panel framing
//
// In fill mode the artwork is cropped to a wedge, so which PART of the picture
// survives the crop matters. This lets a contributor choose it per panel: drag
// the picture around inside its wedge, or nudge with sliders, and see the real
// wheel update as they go.
//
// The stored value is a focal point in SOURCE-image space (x, y each 0..1) plus
// a zoom. Storing a focal point rather than a pixel offset means the framing
// survives the image being re-exported at a different size, and it is the same
// idea as CSS `object-position`.
//
// There is no separate "Position" dialog — the live wheel preview IS the
// position editor. `framePanel` is which wedge dragging/scrolling/the sliders
// currently affect; clicking a different wedge on the preview switches it.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

let framePanel = -1;

/** Mode switch in the preview pane. Saves it on the current category. */
function setPreviewMode(mode) {
    setArtFill(mode === 'fill');
    syncPreviewMode(); // keep the radio in sync even if this wasn't reached via a click on it
    renderPreview();
    renderPanels();
}

function syncPreviewMode() {
    const on = getArtFill();
    const el = document.querySelector(`input[name="artmode"][value="${on ? 'fill' : 'fit'}"]`);
    if (el) el.checked = true;
}

/** Framing only has any visible effect in fill mode — switch there the moment
 *  someone actually tries to drag, scroll-zoom, or slide a position control. */
function ensureFillModeForPositioning() {
    if (getArtFill()) return;
    setArtFill(true);
    syncPreviewMode();
}

function frameOf(i) {
    const p = panels()[i];
    if (!p) return { x: 0.5, y: 0.5, zoom: 1, rot: 0 };
    if (!p.art) p.art = { x: 0.5, y: 0.5, zoom: 1, rot: 0 };
    return p.art;
}

/** Keep framePanel valid as panels are added, removed, or reordered. */
function ensureFramePanel() {
    const n = panels().length;
    if (framePanel >= n) framePanel = n - 1;
    if (framePanel < 0 && n > 0) framePanel = 0;
}

function syncFrameInputs() {
    const n = panels().length;
    const has = framePanel >= 0 && framePanel < n;
    const f = frameOf(framePanel);
    const p = panels()[framePanel] || {};

    document.getElementById('frame-x').value = f.x;
    document.getElementById('frame-y').value = f.y;
    document.getElementById('frame-zoom').value = f.zoom;
    document.getElementById('frame-zoom-val').textContent = (+f.zoom).toFixed(2) + 'x';
    document.getElementById('frame-rot').value = f.rot || 0;
    document.getElementById('frame-rot-val').textContent = Math.round(f.rot || 0) + '°';
    ['frame-x', 'frame-y', 'frame-zoom', 'frame-rot'].forEach(id => {
        document.getElementById(id).disabled = !has;
    });

    document.getElementById('frame-title').textContent = has
        ? `Position: ${p.title || 'Panel ' + (framePanel + 1)}`
        : 'Position: (add a panel to the wheel first)';

    document.getElementById('frame-note').innerHTML = !has ? ''
        : (!p.image && !p.emoji) ? 'This panel has no picture or emoji yet — nothing to position.'
        : 'Sliders move which part sits in the middle of the wedge — same for a picture or an emoji.';
}

function setFrame(key, value) {
    const f = frameOf(framePanel);
    f[key] = parseFloat(value);
    ensureFillModeForPositioning();
    renderPreview();
    autosave();
}

function resetFrame() {
    const p = panels()[framePanel];
    if (!p) return;
    p.art = { x: 0.5, y: 0.5, zoom: 1, rot: 0 };
    renderPreview();
    autosave();
}

/** Switch which panel is being positioned. */
function selectFramePanel(i) {
    const n = panels().length;
    if (!n || i < 0 || i >= n) return;
    framePanel = i;
    renderPreview();
}

/** Move to the next/previous panel. */
function frameStep(dir) {
    const n = panels().length;
    if (!n) return;
    selectFramePanel((framePanel + dir + n) % n);
}

/**
 * Which wedge sits under a canvas-local pixel point (px, py), or null if the
 * point falls outside the wheel or inside the hub. Deliberately the exact
 * inverse of the transform drawWheelInto() uses to PLACE the wedges — same
 * centring, same scale, same angle convention — so a click always lands on
 * the wedge the player can see there, not an approximation of it.
 */
function wedgeAtCanvasPoint(cv, px, py) {
    const n = panels().length;
    if (!n) return null;
    const pad = WHEEL.RIM;
    const world = (WHEEL.R + pad) * 2;
    const scale = cv.width / world;
    const wx = (px - cv.width / 2) / scale;
    const wy = (py - cv.height / 2) / scale;
    const r = Math.hypot(wx, wy);
    if (r < WHEEL.HUB_R * WHEEL.R || r > WHEEL.R) return null;
    const theta = WheelGeom.sectorAngle(n);
    const angle = norm2pi(Math.atan2(wy, wx));
    return Math.min(n - 1, Math.floor(angle / theta));
}

/** Convert a mouse event's viewport coordinates into canvas-local pixels. */
function eventToCanvasPoint(cv, e) {
    const rect = cv.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (cv.width / rect.width),
        y: (e.clientY - rect.top) * (cv.height / rect.height)
    };
}

// ─── Drag to reposition, or click a wedge to switch to it ───────────────────
// Dragging is the fast way to frame a picture; the sliders are there for fine
// adjustment and for anyone who cannot drag accurately. A plain click (barely
// any movement between down and up) instead jumps straight to whichever
// panel's wedge was clicked, so there is no need to hunt for Prev/Next just to
// work on a different character. This all lives on the live wheel preview
// itself — there is no separate position canvas or dialog.

(function initFrameDrag() {
    document.addEventListener('DOMContentLoaded', () => {
        const cv = document.getElementById('wheel-preview');
        if (!cv) return;
        // Below this many CSS pixels of total movement, mouseup is treated as
        // a click (select the wedge) rather than a drag (pan the picture).
        const CLICK_SLOP = 6;
        let dragging = false, lastX = 0, lastY = 0, moved = 0;

        const start = (e) => {
            if (framePanel < 0) return;
            dragging = true;
            moved = 0;
            lastX = e.clientX;
            lastY = e.clientY;
            e.preventDefault();
        };
        const move = (e) => {
            if (!dragging) return;
            moved += Math.hypot(e.clientX - lastX, e.clientY - lastY);

            const f = frameOf(framePanel);
            // Scale the drag by the canvas's on-screen size so a pixel of mouse
            // movement feels the same regardless of how the canvas is laid out.
            const rect = cv.getBoundingClientRect();
            const dx = (e.clientX - lastX) / rect.width;
            const dy = (e.clientY - lastY) / rect.height;
            lastX = e.clientX; lastY = e.clientY;

            // The picture is drawn ROTATED by this wedge's position on the
            // wheel (see WheelGeom.anchor / drawFace), so a screen-space drag
            // has to be rotated back into the picture's own local axes before
            // it is applied — otherwise "drag right" only moves the image
            // right for whichever wedge happens to sit unrotated, and goes
            // sideways or backwards for every other one.
            const n = panels().length;
            const rot = WheelGeom.sectorMid(framePanel, n) + Math.PI / 2;
            const cosR = Math.cos(rot), sinR = Math.sin(rot);
            const localDX = dx * cosR + dy * sinR;
            const localDY = -dx * sinR + dy * cosR;

            // Drag moves the PICTURE, so the focal point moves the other way.
            f.x = Math.min(1, Math.max(0, f.x - localDX * 1.6));
            f.y = Math.min(1, Math.max(0, f.y - localDY * 1.6));
            ensureFillModeForPositioning();
            renderPreview();
        };
        const end = (e) => {
            if (!dragging) return;
            dragging = false;

            if (moved < CLICK_SLOP) {
                // A tap/click, not a drag: jump to whatever wedge is there.
                const pt = eventToCanvasPoint(cv, e);
                const idx = wedgeAtCanvasPoint(cv, pt.x, pt.y);
                if (idx != null) selectFramePanel(idx);
                return;
            }
            autosave();
        };

        cv.addEventListener('mousedown', start);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);

        // Scroll to zoom, matching the slider's own range and step.
        cv.addEventListener('wheel', (e) => {
            if (framePanel < 0) return;
            e.preventDefault();
            const zoomEl = document.getElementById('frame-zoom');
            const min = parseFloat(zoomEl.min), max = parseFloat(zoomEl.max);
            const step = parseFloat(zoomEl.step) || 0.05;
            const f = frameOf(framePanel);
            const dir = e.deltaY < 0 ? 1 : -1;
            const next = Math.min(max, Math.max(min, f.zoom + dir * step * 2));
            setFrame('zoom', next);
        }, { passive: false });
    });
})();

document.addEventListener('DOMContentLoaded', syncPreviewMode);
