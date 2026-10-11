/* Official statement dialog. The dedicated HTML page remains the no-JavaScript fallback. */
(function () {
  'use strict';
  var script = document.currentScript;
  var theme = script && script.dataset.theme || 'house';
  var autoOpen = script && script.dataset.autoOpen === 'session';
  var storageKey = 'narbe-crypto-statement-dismissed-2026-10-10';
  if (document.getElementById('narbe-crypto-dialog')) return;

  function build() {
    if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
    var style = document.createElement('style');
    style.textContent = [
      '#narbe-crypto-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;width:calc(100% - 2rem);max-width:42rem;max-height:calc(100vh - 2rem);max-height:calc(100dvh - 2rem);padding:1.5rem;border:1px solid #374151;border-radius:16px;background:#141414;color:#e5e7eb;font:400 1rem/1.65 Inter,system-ui,sans-serif;text-align:left;overflow:auto;box-shadow:0 24px 80px #0006;color-scheme:dark;}',
      '#narbe-crypto-dialog:not([open]){display:none;}',
      '#narbe-crypto-dialog::backdrop{background:rgba(0,0,0,.65);}',
      '#narbe-crypto-dialog[data-theme="foundation"]{background:#fff;color:#1e293b;border-color:#cbd5e1;color-scheme:light;}',
      '#narbe-crypto-dialog[data-theme="switched"]{background:#fff;color:#0f1e30;border-color:#d2e0f0;font-family:Nunito,system-ui,sans-serif;color-scheme:light;}',
      '#narbe-crypto-dialog h2{font-family:inherit;font-size:clamp(1.4rem,4vw,1.85rem);font-weight:800;line-height:1.25;margin:0 0 .75rem;color:inherit;overflow-wrap:anywhere;}',
      '#narbe-crypto-dialog p{font:inherit;color:inherit;margin:0 0 1rem;}',
      '#narbe-crypto-dialog .crypto-date{font-size:.875rem;color:#aeb8c8;}',
      '#narbe-crypto-dialog[data-theme="foundation"] .crypto-date,#narbe-crypto-dialog[data-theme="switched"] .crypto-date{color:#475569;}',
      '#narbe-crypto-dialog .crypto-actions{display:flex;justify-content:flex-end;margin-top:1.5rem;}',
      '#narbe-crypto-dialog button{box-sizing:border-box;min-height:44px;padding:.6rem 1.25rem;border:0;border-radius:8px;background:#ff5c00;color:#141414;font-family:inherit;font-size:1rem;font-weight:700;line-height:1.4;cursor:pointer;}',
      '#narbe-crypto-dialog[data-theme="foundation"] button{background:#6d28d9;color:#fff;}',
      '#narbe-crypto-dialog[data-theme="switched"] button{background:#1e60b3;color:#fff;}',
      '#narbe-crypto-dialog button:focus-visible{outline:3px solid currentColor;outline-offset:4px;}',
      '#narbe-crypto-dialog[data-theme="house"] button:focus-visible{outline-color:#22d3ee;}',
      '#narbe-crypto-dialog[data-theme="foundation"] button:focus-visible{outline-color:#6d28d9;}',
      '#narbe-crypto-dialog[data-theme="switched"] button:focus-visible{outline-color:#1e60b3;}',
      '.crypto-statement-trigger{display:inline;background:none;border:0;border-radius:0;padding:0;min-width:0;min-height:0;font:inherit;color:inherit;line-height:inherit;text-decoration:underline;text-underline-offset:.15em;cursor:pointer;}',
      '.crypto-statement-trigger:focus-visible{outline:2px solid currentColor;outline-offset:3px;}'
    ].join('');
    document.head.appendChild(style);

    var dialog = document.createElement('dialog');
    dialog.id = 'narbe-crypto-dialog';
    dialog.dataset.theme = theme;
    dialog.setAttribute('aria-labelledby', 'narbe-crypto-title');
    dialog.setAttribute('aria-describedby', 'narbe-crypto-text narbe-crypto-donations');
    dialog.innerHTML = '<h2 id="narbe-crypto-title" tabindex="-1" autofocus>Official Statement: No Cryptocurrency Affiliation</h2>' +
      '<p class="crypto-date">Posted <time datetime="2026-10-10">October 10, 2026</time></p>' +
      '<p id="narbe-crypto-text">NARBE House, NARBE Foundation, SwitchedGames, and Benny\'s Hub are not affiliated with, and do not endorse, any cryptocurrency, token, coin, or crypto donation page using our names. We never authorized these and receive no proceeds from them.</p>' +
      '<p id="narbe-crypto-donations">NARBE accepts donations only through our official campaigns listed on our official websites. Everything we build is free and open source.</p>' +
      '<div class="crypto-actions"><button type="button">Close</button></div>';
    document.body.appendChild(dialog);
    var closeButton = dialog.querySelector('button');
    var returnFocus = null;
    var previousOverflow = '';

    function open(trigger) {
      if (dialog.open) return;
      returnFocus = trigger || document.activeElement;
      previousOverflow = document.documentElement.style.overflow;
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    }
    closeButton.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', function () {
      document.documentElement.style.overflow = previousOverflow;
      try { sessionStorage.setItem(storageKey, '1'); } catch (_) { /* Storage may be unavailable. */ }
      if (returnFocus && returnFocus.isConnected && returnFocus !== document.body) {
        returnFocus.focus({ preventScroll: true });
      }
    });

    document.querySelectorAll('footer a[href="/crypto-statement/"]').forEach(function (link) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'crypto-statement-trigger';
      button.textContent = link.textContent;
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', dialog.id);
      button.addEventListener('click', function () { open(button); });
      link.replaceWith(button);
    });

    var dismissed = false;
    try { dismissed = sessionStorage.getItem(storageKey) === '1'; } catch (_) { /* Show normally without storage. */ }
    if (autoOpen && !dismissed && !document.querySelector('dialog[open]')) open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
  else build();
})();
