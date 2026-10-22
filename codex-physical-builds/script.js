'use strict';
(() => {
  const demo = document.querySelector('.switch-demo');
  const options = [...document.querySelectorAll('.demo-option')];
  const status = document.querySelector('#demo-status');
  const responses = { Play: 'Play selected. A game is one choice away.', Watch: 'Watch selected. Browse a personal library of shows and movies.', Speak: 'Speak selected. Type a message or choose a phrase.' };
  let current = -1;
  function move() {
    current = (current + 1) % options.length;
    options.forEach((option, index) => { option.classList.toggle('active', index === current); option.classList.remove('selected'); });
    status.textContent = options[current].dataset.choice + ' highlighted. Select to choose it.';
  }
  function select() {
    if (current < 0) { status.textContent = 'First press Move to highlight a choice.'; return; }
    options[current].classList.add('selected');
    status.textContent = responses[options[current].dataset.choice];
  }
  document.querySelector('#demo-move').addEventListener('click', move);
  document.querySelector('#demo-select').addEventListener('click', select);
  demo.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault();
      if (event.code === 'Space') move(); else select();
    }
  });
  const dialog = document.querySelector('#lightbox');
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('p');
  let trigger;
  document.querySelectorAll('[data-lightbox]').forEach(link => link.addEventListener('click', event => {
    if (typeof dialog.showModal !== 'function' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    trigger = link;
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    caption.textContent = image.alt;
    dialog.showModal();
  }));
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { image.removeAttribute('src'); if(trigger) trigger.focus(); });
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Copied';
      document.querySelector('#copy-status').textContent = 'Command copied.';
      setTimeout(() => { button.textContent = 'Copy'; }, 1800);
    } catch {
      const range = document.createRange(); range.selectNodeContents(code);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.querySelector('#copy-status').textContent = 'Command selected. Use your device’s copy command.';
    }
  }));
  function openHashDetails() { const id = decodeURIComponent(location.hash.slice(1)); if (!id) return; const target = document.getElementById(id); if (target?.tagName === 'DETAILS') target.open = true; }
  window.addEventListener('hashchange', openHashDetails); openHashDetails();
})();
