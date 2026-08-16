// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Photo editor (crop / rotate / magic-wand background removal)
//
// Ported from Matchy Match's editor (`BENNYSMATCHYMATCH/editor_new.js`, the
// "Photo Editor" block), which is where these tools were designed and proven.
// The four tools (undo, rotate, magic wand, crop) are lifted close to as-is —
// they only ever touch the canvas/image state declared right here.
//
// What did NOT come along, on purpose: Matchy Match treats a card's `image` as
// an INDIRECT reference (a filename resolved through an asset-pool/IndexedDB/
// server-upload pipeline), so its save step mints a new filename and registers
// it in all of that. Show n Sound has no such layer — `p.image` IS the data:
// URI (see `applyAsset()` in editor.js) — so saving here is just writing the
// edited canvas back onto the panel directly.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

let photoCanvas, photoCtx, photoImage, originalPhotoImage;
let currentPhotoPanelIndex = null;
let photoRotation = 0;
let photoHistory = [];
const MAX_HISTORY = 20;

let isCropMode = false;
let isWandMode = false;
let wandTolerance = 30;
let isDraggingCrop = false;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };
let dragHandle = null; // 'nw','n','ne','e','se','s','sw','w','move', or null
const HANDLE_SIZE = 10;

function openPhotoEditor(panelIndex) {
    const p = panels()[panelIndex];
    const src = p && panelSrc(p);
    if (!src) { toast('This panel has no picture to edit', true); return; }

    currentPhotoPanelIndex = panelIndex;
    photoCanvas = document.getElementById('photo-editor-canvas');
    photoCtx = photoCanvas.getContext('2d');

    photoImage = new Image();
    originalPhotoImage = new Image();

    photoImage.onload = () => {
        photoCanvas.width = photoImage.width;
        photoCanvas.height = photoImage.height;
        photoCtx.drawImage(photoImage, 0, 0);
        photoRotation = 0;
        isCropMode = false;
        isWandMode = false;
        photoHistory = [];
        saveToHistory();

        document.getElementById('crop-instructions').style.display = 'none';
        document.getElementById('apply-crop-btn').style.display = 'none';
        document.getElementById('magic-wand-controls').style.display = 'none';
        photoCanvas.style.cursor = 'default';
        photoCanvas.onmousedown = photoCanvas.onmousemove = photoCanvas.onmouseup = null;

        document.addEventListener('keydown', handlePhotoEditorKeydown);
        openModal('photo-editor-modal');
    };
    photoImage.onerror = () => toast('Could not load this picture for editing', true);

    photoImage.src = src;
    originalPhotoImage.src = src;
}

function closePhotoEditor() {
    closeModal('photo-editor-modal');
    document.removeEventListener('keydown', handlePhotoEditorKeydown);
    currentPhotoPanelIndex = null;
}

function cancelPhotoEdit() { closePhotoEditor(); }

async function savePhotoEdit() {
    const p = panels()[currentPhotoPanelIndex];
    if (!p || !photoCanvas) { closePhotoEditor(); return; }

    let dataUri = photoCanvas.toDataURL('image/png');
    try { dataUri = await shrinkImage(dataUri); } catch (e) { /* keep the unshrunk version */ }

    p.image = dataUri;
    p._src = dataUri;
    // A crop changes the image's aspect ratio, which changes what the OLD
    // focal point/zoom meant relative to the wedge — reset it rather than
    // reframe a now-different picture in a way nobody asked for.
    p.art = null;

    closePhotoEditor();
    renderPanels(); renderPreview(); autosave();
    toast('Picture updated');
}

function handlePhotoEditorKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoPhotoEdit();
    }
}

function saveToHistory() {
    if (photoHistory.length >= MAX_HISTORY) photoHistory.shift();
    photoHistory.push({
        src: photoImage.src,
        rotation: photoRotation,
        width: photoCanvas.width,
        height: photoCanvas.height
    });
}

function undoPhotoEdit() {
    if (photoHistory.length <= 1) return; // keep the initial state
    photoHistory.pop();
    const prev = photoHistory[photoHistory.length - 1];

    const img = new Image();
    img.onload = () => {
        photoImage = img;
        photoRotation = prev.rotation;
        photoCanvas.width = prev.width;
        photoCanvas.height = prev.height;
        redrawCanvasWithSelection();
    };
    img.src = prev.src;
}

// ─── Rotate ──────────────────────────────────────────────────────────────────

function rotateImage() {
    if (!photoImage) return;
    photoRotation = (photoRotation + 90) % 360;

    if (photoRotation % 180 !== 0) {
        photoCanvas.width = photoImage.height;
        photoCanvas.height = photoImage.width;
    } else {
        photoCanvas.width = photoImage.width;
        photoCanvas.height = photoImage.height;
    }
    redrawCanvasWithSelection();
    saveToHistory();
}

// ─── Magic wand (flood-fill background removal) ─────────────────────────────
// A colour-distance flood fill, not real segmentation — works well on the
// flat-colour / clip-art backgrounds these packs mostly use, less well on
// photos with soft gradients or noise.

function activateMagicWand() {
    isWandMode = !isWandMode;
    isCropMode = false;
    document.getElementById('crop-instructions').style.display = 'none';
    document.getElementById('apply-crop-btn').style.display = 'none';

    const controls = document.getElementById('magic-wand-controls');
    const btn = document.getElementById('magic-wand-btn');

    if (isWandMode) {
        controls.style.display = 'block';
        btn.style.background = '#e6f2ff';
        btn.style.border = '2px solid #007bff';
        photoCanvas.style.cursor = 'crosshair';

        photoCanvas.onmousedown = (e) => {
            const rect = photoCanvas.getBoundingClientRect();
            const scaleX = photoCanvas.width / rect.width;
            const scaleY = photoCanvas.height / rect.height;
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);
            floodFillTransparency(x, y, wandTolerance);
        };
        photoCanvas.onmousemove = null;
        photoCanvas.onmouseup = null;
    } else {
        controls.style.display = 'none';
        btn.style.background = '';
        btn.style.border = '';
        photoCanvas.style.cursor = 'default';
        photoCanvas.onmousedown = null;
    }
}

function updateWandTolerance(val) {
    wandTolerance = parseInt(val, 10);
    document.getElementById('wand-tolerance-val').textContent = val;
}

function floodFillTransparency(startX, startY, tolerance) {
    const width = photoCanvas.width, height = photoCanvas.height;
    const imageData = photoCtx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const startPos = (startY * width + startX) * 4;
    const targetR = data[startPos], targetG = data[startPos + 1], targetB = data[startPos + 2];
    if (data[startPos + 3] === 0) return; // already transparent

    const stack = [[startX, startY]];
    const seen = new Set();
    const pixelsToRemove = [];

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = x + ',' + y;
        if (seen.has(key)) continue;
        seen.add(key);

        const pos = (y * width + x) * 4;
        const a = data[pos + 3];
        if (a === 0) continue;

        const r = data[pos], g = data[pos + 1], b = data[pos + 2];
        const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
        if (diff <= tolerance * 3) {
            pixelsToRemove.push(pos);
            if (x > 0) stack.push([x - 1, y]);
            if (x < width - 1) stack.push([x + 1, y]);
            if (y > 0) stack.push([x, y - 1]);
            if (y < height - 1) stack.push([x, y + 1]);
        }
    }

    // Flash magenta briefly so the contributor sees what's about to go before
    // it actually disappears.
    pixelsToRemove.forEach(pos => {
        data[pos] = 255; data[pos + 1] = 0; data[pos + 2] = 255; data[pos + 3] = 255;
    });
    photoCtx.putImageData(imageData, 0, 0);

    setTimeout(() => {
        pixelsToRemove.forEach(pos => { data[pos + 3] = 0; });
        photoCtx.putImageData(imageData, 0, 0);

        const newImg = new Image();
        newImg.onload = () => { photoImage = newImg; saveToHistory(); };
        newImg.src = photoCanvas.toDataURL();
    }, 300);
}

// ─── Crop ────────────────────────────────────────────────────────────────────
// An interactive rectangle with 8 drag handles (corners + edge midpoints) plus
// a move zone in the middle, rendered over a dimmed copy of the image.

function enableCropMode() {
    isCropMode = true;
    isWandMode = false;
    document.getElementById('magic-wand-controls').style.display = 'none';
    document.getElementById('magic-wand-btn').style.background = '';
    document.getElementById('magic-wand-btn').style.border = '';

    document.getElementById('crop-instructions').style.display = 'block';
    document.getElementById('apply-crop-btn').style.display = 'inline-block';

    const w = photoCanvas.width * 0.8, h = photoCanvas.height * 0.8;
    cropRect = { x: (photoCanvas.width - w) / 2, y: (photoCanvas.height - h) / 2, w, h };
    redrawCanvasWithSelection();

    photoCanvas.onmousedown = (e) => {
        if (!isCropMode) return;
        const { mx, my } = canvasPointFromEvent(e);
        dragHandle = getHandleUnderMouse(mx, my);
        isDraggingCrop = true;
    };
    photoCanvas.onmousemove = (e) => {
        if (!isCropMode) return;
        const { mx, my } = canvasPointFromEvent(e);
        if (isDraggingCrop && dragHandle) {
            updateCropRect(mx, my);
            redrawCanvasWithSelection();
        } else {
            setCursorForHandle(getHandleUnderMouse(mx, my));
        }
    };
    photoCanvas.onmouseup = () => { isDraggingCrop = false; dragHandle = null; };
}

function canvasPointFromEvent(e) {
    const rect = photoCanvas.getBoundingClientRect();
    const scaleX = photoCanvas.width / rect.width, scaleY = photoCanvas.height / rect.height;
    return { mx: (e.clientX - rect.left) * scaleX, my: (e.clientY - rect.top) * scaleY };
}

function getHandleUnderMouse(mx, my) {
    const { x, y, w, h } = cropRect;
    const hs = HANDLE_SIZE;

    if (Math.abs(mx - x) < hs && Math.abs(my - y) < hs) return 'nw';
    if (Math.abs(mx - (x + w)) < hs && Math.abs(my - y) < hs) return 'ne';
    if (Math.abs(mx - (x + w)) < hs && Math.abs(my - (y + h)) < hs) return 'se';
    if (Math.abs(mx - x) < hs && Math.abs(my - (y + h)) < hs) return 'sw';

    if (Math.abs(mx - (x + w / 2)) < hs && Math.abs(my - y) < hs) return 'n';
    if (Math.abs(mx - (x + w)) < hs && Math.abs(my - (y + h / 2)) < hs) return 'e';
    if (Math.abs(mx - (x + w / 2)) < hs && Math.abs(my - (y + h)) < hs) return 's';
    if (Math.abs(mx - x) < hs && Math.abs(my - (y + h / 2)) < hs) return 'w';

    if (mx > x && mx < x + w && my > y && my < y + h) return 'move';
    return null;
}

function setCursorForHandle(handle) {
    switch (handle) {
        case 'nw': case 'se': photoCanvas.style.cursor = 'nwse-resize'; break;
        case 'ne': case 'sw': photoCanvas.style.cursor = 'nesw-resize'; break;
        case 'n': case 's': photoCanvas.style.cursor = 'ns-resize'; break;
        case 'e': case 'w': photoCanvas.style.cursor = 'ew-resize'; break;
        case 'move': photoCanvas.style.cursor = 'move'; break;
        default: photoCanvas.style.cursor = 'default';
    }
}

/**
 * Resize/move the crop rect for one mouse-move step. `move` re-centres the
 * rect on the pointer rather than tracking a drag offset from the grab point
 * — a known small rough edge carried over from the Matchy Match original
 * (jumps slightly if you grab off-centre) rather than a Show n Sound bug.
 */
function updateCropRect(mx, my) {
    let { x, y, w, h } = cropRect;
    const minSize = 20;
    const right = x + w, bottom = y + h;

    switch (dragHandle) {
        case 'move':
            x = mx - w / 2;
            y = my - h / 2;
            break;
        case 'nw':
            x = Math.min(mx, right - minSize); y = Math.min(my, bottom - minSize);
            w = right - x; h = bottom - y;
            break;
        case 'ne':
            y = Math.min(my, bottom - minSize);
            w = Math.max(mx - x, minSize); h = bottom - y;
            break;
        case 'se':
            w = Math.max(mx - x, minSize); h = Math.max(my - y, minSize);
            break;
        case 'sw':
            x = Math.min(mx, right - minSize);
            w = right - x; h = Math.max(my - y, minSize);
            break;
        case 'n':
            y = Math.min(my, bottom - minSize); h = bottom - y;
            break;
        case 's':
            h = Math.max(my - y, minSize);
            break;
        case 'w':
            x = Math.min(mx, right - minSize); w = right - x;
            break;
        case 'e':
            w = Math.max(mx - x, minSize);
            break;
    }

    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > photoCanvas.width) {
        if (dragHandle === 'move') x = photoCanvas.width - w; else w = photoCanvas.width - x;
    }
    if (y + h > photoCanvas.height) {
        if (dragHandle === 'move') y = photoCanvas.height - h; else h = photoCanvas.height - y;
    }
    if (w < minSize) w = minSize;
    if (h < minSize) h = minSize;

    cropRect = { x, y, w, h };
}

function redrawCanvasWithSelection() {
    photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
    photoCtx.save();
    photoCtx.translate(photoCanvas.width / 2, photoCanvas.height / 2);
    photoCtx.rotate(photoRotation * Math.PI / 180);
    photoCtx.drawImage(photoImage, -photoImage.width / 2, -photoImage.height / 2);
    photoCtx.restore();

    if (!isCropMode) return;

    photoCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    photoCtx.fillRect(0, 0, photoCanvas.width, photoCanvas.height);

    const { x, y, w, h } = cropRect;
    photoCtx.save();
    photoCtx.beginPath();
    photoCtx.rect(x, y, w, h);
    photoCtx.clip();
    photoCtx.translate(photoCanvas.width / 2, photoCanvas.height / 2);
    photoCtx.rotate(photoRotation * Math.PI / 180);
    photoCtx.drawImage(photoImage, -photoImage.width / 2, -photoImage.height / 2);
    photoCtx.restore();

    photoCtx.strokeStyle = '#fff';
    photoCtx.lineWidth = 2;
    photoCtx.strokeRect(x, y, w, h);

    photoCtx.fillStyle = '#007bff';
    const half = HANDLE_SIZE / 2;
    const drawHandle = (hx, hy) => photoCtx.fillRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
    drawHandle(x, y); drawHandle(x + w, y); drawHandle(x + w, y + h); drawHandle(x, y + h);
    drawHandle(x + w / 2, y); drawHandle(x + w, y + h / 2);
    drawHandle(x + w / 2, y + h); drawHandle(x, y + h / 2);
}

function applyCrop() {
    if (!cropRect || cropRect.w < 10 || cropRect.h < 10) return;
    const { x, y, w, h } = cropRect;

    // Draw the clean (non-overlay) image before reading pixels back out.
    photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
    photoCtx.save();
    photoCtx.translate(photoCanvas.width / 2, photoCanvas.height / 2);
    photoCtx.rotate(photoRotation * Math.PI / 180);
    photoCtx.drawImage(photoImage, -photoImage.width / 2, -photoImage.height / 2);
    photoCtx.restore();

    const data = photoCtx.getImageData(x, y, w, h);
    photoCanvas.width = w;
    photoCanvas.height = h;
    photoCtx.putImageData(data, 0, 0);

    isCropMode = false;
    document.getElementById('crop-instructions').style.display = 'none';
    document.getElementById('apply-crop-btn').style.display = 'none';
    photoCanvas.style.cursor = 'default';
    photoCanvas.onmousedown = photoCanvas.onmousemove = photoCanvas.onmouseup = null;

    const newImg = new Image();
    newImg.onload = () => {
        photoImage = newImg;
        photoRotation = 0;
        saveToHistory();
    };
    newImg.src = photoCanvas.toDataURL();
}

function resetPhotoEditor() {
    photoRotation = 0;
    isCropMode = false;
    isWandMode = false;
    document.getElementById('crop-instructions').style.display = 'none';
    document.getElementById('apply-crop-btn').style.display = 'none';
    document.getElementById('magic-wand-controls').style.display = 'none';
    document.getElementById('magic-wand-btn').style.background = '';
    document.getElementById('magic-wand-btn').style.border = '';
    photoCanvas.onmousedown = photoCanvas.onmousemove = photoCanvas.onmouseup = null;
    photoCanvas.style.cursor = 'default';

    photoImage = originalPhotoImage;
    photoCanvas.width = photoImage.width;
    photoCanvas.height = photoImage.height;
    photoCtx.drawImage(photoImage, 0, 0);
    saveToHistory();
}
