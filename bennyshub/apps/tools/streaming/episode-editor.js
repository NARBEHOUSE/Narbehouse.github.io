// Visual episode editing. The catalog remains keyed by the original show title;
// episode_key on a renamed card preserves that relationship.
async function openEpisodeEditor(id) {
    const item = allData.find(row => row.id === id);
    if (!item || document.getElementById('episode-editor')) return;
    const show = item.episode_key || item.title;
    const dialog = document.createElement('dialog');
    dialog.id = 'episode-editor';
    dialog.setAttribute('aria-labelledby', 'episode-editor-title');
    dialog.innerHTML = `
        <form novalidate>
            <h2 id="episode-editor-title"></h2>
            <p>A single playback link is enough for a show. Use this optional menu to add more seasons and episodes.</p>
            <p>Season 0 is reserved for existing special/default links and is hidden in the app's season menu.</p>
            <fieldset disabled>
                <div class="episode-toolbar">
                    <label>Season <select class="episode-season"></select></label>
                    <label>New season number <input class="episode-new-season" type="number" min="1" max="9999" step="1" value="1"></label>
                    <button type="button" class="btn btn-primary episode-add-season">Add season</button>
                    <button type="button" class="btn btn-danger episode-remove-season">Remove season</button>
                </div>
                <div class="episode-rows"></div>
                <button type="button" class="btn episode-use-link" hidden>Use current playback link as Season 1, Episode 1</button>
                <button type="button" class="btn btn-primary episode-add">Add episode</button>
            </fieldset>
            <p class="episode-status" role="status" aria-live="polite">Loading episodes...</p>
            <div class="episode-toolbar">
                <button type="submit" class="btn btn-success episode-save" disabled>Save episodes</button>
                <button type="button" class="btn episode-close">Close</button>
            </div>
        </form>`;
    dialog.querySelector('h2').textContent = `${item.title} — Seasons & Episodes`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    const select = dialog.querySelector('.episode-season');
    const rows = dialog.querySelector('.episode-rows');
    const status = dialog.querySelector('.episode-status');
    const save = dialog.querySelector('.episode-save');
    const close = dialog.querySelector('.episode-close');
    const useLink = dialog.querySelector('.episode-use-link');
    let draft = {};
    let dirty = false;
    let saving = false;
    function changed() {
        dirty = true;
        close.textContent = 'Discard changes';
        status.textContent = 'Unsaved changes';
    }
    close.onclick = () => { if (!saving) { dialog.close(); dialog.remove(); } };
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        if (dirty || saving) status.textContent = 'Use Save episodes or Discard changes to close.';
        else close.click();
    });
    dialog.showModal();

    function renderSeasons(selected) {
        const numbers = Object.keys(draft).sort((a, b) => Number(a) - Number(b));
        useLink.hidden = numbers.length > 0 || !WebStreaming.imageURL(item.url);
        select.replaceChildren();
        for (const number of numbers) {
            const option = document.createElement('option');
            option.value = number;
            option.textContent = `Season ${number} (${draft[number].length} episodes)`;
            select.appendChild(option);
        }
        if (numbers.includes(String(selected))) select.value = String(selected);
        else if (numbers.some(number => Number(number) > 0)) select.value = numbers.find(number => Number(number) > 0);
        dialog.querySelector('.episode-new-season').value = Math.max(0, ...numbers.map(Number)) + 1;
        dialog.querySelector('.episode-add').disabled = !numbers.length;
        dialog.querySelector('.episode-remove-season').disabled = !numbers.length;
        renderRows();
    }
    function renderRows() {
        rows.replaceChildren();
        const season = select.value;
        if (!season) {
            rows.textContent = 'No seasons yet. Add a season to get started.';
            return;
        }
        const episodes = draft[season];
        if (!episodes.length) rows.textContent = 'No episodes yet. Empty seasons are omitted when you save.';
        episodes.forEach((episode, index) => {
            const row = document.createElement('div');
            row.className = 'episode-edit-row';
            for (const [key, label, type] of [['episode', 'Episode number', 'number'], ['title', 'Episode title', 'text'], ['url', 'Playback URL', 'url']]) {
                const wrapper = document.createElement('label');
                wrapper.textContent = label;
                const input = document.createElement('input');
                input.type = type;
                input.required = true;
                input.value = episode[key] ?? '';
                if (type === 'number') { input.min = '0'; input.step = '1'; }
                input.oninput = () => {
                    episode[key] = key === 'episode' ? (input.value === '' ? null : Number(input.value)) : input.value;
                    changed();
                };
                wrapper.appendChild(input);
                row.appendChild(wrapper);
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-danger';
            remove.textContent = 'Remove episode';
            remove.onclick = () => { episodes.splice(index, 1); changed(); renderSeasons(season); };
            row.appendChild(remove);
            rows.appendChild(row);
        });
    }
    select.onchange = renderRows;
    useLink.onclick = () => {
        draft['1'] = [{ season: 1, episode: 1, title: 'Episode 1', url: item.url }];
        changed();
        renderSeasons('1');
    };
    dialog.querySelector('.episode-add-season').onclick = () => {
        const input = dialog.querySelector('.episode-new-season');
        const number = Number(input.value);
        if (!Number.isSafeInteger(number) || number < 1 || number > 9999) {
            status.textContent = 'Enter a whole season number from 1 to 9999.';
            input.focus();
            return;
        }
        if (Object.hasOwn(draft, number)) {
            status.textContent = 'That season already exists.';
            select.value = String(number);
            renderRows();
            return;
        }
        draft[number] = [];
        changed();
        renderSeasons(number);
    };
    dialog.querySelector('.episode-remove-season').onclick = () => {
        delete draft[select.value];
        changed();
        renderSeasons();
    };
    dialog.querySelector('.episode-add').onclick = () => {
        const season = select.value;
        const episodes = draft[season];
        episodes.push({ season: Number(season), episode: Math.max(0, ...episodes.map(ep => Number(ep.episode) || 0)) + 1, title: '', url: '' });
        changed();
        renderSeasons(season);
        rows.lastElementChild.querySelector('input').focus();
    };
    form.onsubmit = async event => {
        event.preventDefault();
        if (saving) return;
        // Validate all seasons, including ones that are not currently visible.
        for (const [season, episodes] of Object.entries(draft)) {
            const seen = new Set();
            for (const ep of episodes) {
                let validUrl = false;
                try { WebStreaming.playbackURL(ep.url); validUrl = true; } catch (_) {}
                if (!Number.isSafeInteger(ep.episode) || ep.episode < 0 || seen.has(ep.episode) || !ep.title.trim() || !validUrl) {
                    select.value = season;
                    renderRows();
                    status.textContent = `Check season ${season}: each episode needs a unique whole number, title, and http/https playback URL.`;
                    return;
                }
                seen.add(ep.episode);
            }
        }
        saving = true;
        save.disabled = close.disabled = true;
        dialog.querySelector('fieldset').disabled = true;
        status.textContent = 'Saving episodes...';
        try {
            draft = await WebStreaming.saveShowEpisodes(show, draft);
            dirty = false;
            renderSeasons(select.value);
            close.textContent = 'Close';
            status.textContent = 'Episodes saved. Reopen the show in the streaming app to see them.';
        } catch (error) {
            status.textContent = `Save failed: ${error.message}. Your changes are still here; try again.`;
        } finally {
            saving = false;
            save.disabled = close.disabled = false;
            dialog.querySelector('fieldset').disabled = false;
        }
    };
    try {
        draft = structuredClone(await WebStreaming.getEpisodes(show));
        if (!dialog.isConnected) return;
        renderSeasons();
        dialog.querySelector('fieldset').disabled = false;
        save.disabled = false;
        status.textContent = 'Choose a season or add a new one.';
    } catch (error) {
        status.textContent = `Could not load episodes: ${error.message}. Close and retry; existing episodes have not been changed.`;
    }
}
