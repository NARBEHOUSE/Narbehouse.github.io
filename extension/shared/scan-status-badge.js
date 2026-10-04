/**
 * Shared scan feedback. Parked has a status badge outside the choices.
 * Scan pause uses only a dotted outline on the selected choice.
 */
window.NarbeScanStatusBadge = (function () {
  'use strict';
  function create({ host } = {}) {
    if (!host) throw new Error('Reserve a statusHost outside the choice items');
    const node = document.createElement('span');
    node.className = 'narbe-scan-status-badge';
    node.hidden = true;
    node.setAttribute('data-scan-exclude', '');
    host.classList.add('narbe-scan-status-host');
    host.appendChild(node);
    let markedItem = null, previous = '', wasSuspended = false;
    function clearMarker() {
      markedItem?.removeAttribute('data-narbe-scan-paused');
      markedItem = null;
    }
    return {
      update(value, context = {}) {
        const next = value === 'Parked' || value === 'Paused' ? value : '';
        clearMarker();
        if (next === 'Paused' && context.item?.nodeType === 1) {
          markedItem = context.item;
          markedItem.setAttribute('data-narbe-scan-paused', '');
        }
        node.textContent = next === 'Parked' ? next : '';
        node.hidden = next !== 'Parked';
        const suspended = !!context.state?.suspended;
        // Actual parking clears every choice. Bring its existing status into
        // view once; do not scroll on ordinary -1 steps or create a new panel.
        if (next === 'Parked' && !suspended && (previous !== 'Parked' || wasSuspended)) {
          host.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
        }
        previous = next;
        wasSuspended = suspended;
      },
      destroy() { clearMarker(); node.remove(); }
    };
  }
  return { create };
})();
