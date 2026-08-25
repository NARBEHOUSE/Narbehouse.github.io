// Editor for Elouise's Word Search category libraries.
// A library is { version, name, categories: [{ name, words: [] }] }.

const MIN_LEN = 3;
const MAX_LEN = 10;

// Must stay in step with `difficulties` in game.js — the editor reports whether
// a category can actually fill each difficulty's length band.
const BANDS = [
    { label: 'Easy', lo: 3, hi: 5, need: 5 },
    { label: 'Medium', lo: 5, hi: 7, need: 10 },
    { label: 'Hard', lo: 6, hi: 10, need: 20 }
];

class WordSearchEditor {
    constructor() {
        this.library = { version: 1, name: 'My Word List', categories: [] };
        this.selectedIndex = -1;
        this.dirty = false;

        this.els = {
            list: document.getElementById('category-list'),
            filter: document.getElementById('filter-input'),
            count: document.getElementById('count-display'),
            fileName: document.getElementById('filename-input'),
            title: document.getElementById('editing-title'),
            catName: document.getElementById('cat-name-input'),
            words: document.getElementById('words-input'),
            chips: document.getElementById('word-chips'),
            previewCount: document.getElementById('preview-count'),
            validation: document.getElementById('validation'),
            status: document.getElementById('status-bar')
        };

        this.loadBuiltIn(true);

        window.addEventListener('beforeunload', (e) => {
            if (!this.dirty) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    // --- Library level ---
    async loadBuiltIn(silent = false) {
        if (!silent && !this.confirmDiscard()) return;
        try {
            const res = await fetch('categories.json');
            const data = await res.json();
            this.library = {
                version: 1,
                name: data.name || 'Word List',
                categories: (data.categories || []).map(c => ({
                    name: c.name || 'Untitled',
                    words: Array.isArray(c.words) ? c.words.slice() : []
                }))
            };
            this.els.fileName.value = 'my-word-list';
            this.dirty = false;
            this.selectedIndex = this.library.categories.length ? 0 : -1;
            this.renderList();
            this.loadCategory(this.selectedIndex);
            if (!silent) this.status(`Loaded the built-in list (${this.library.categories.length} categories)`);
        } catch (e) {
            console.error('Could not load categories.json', e);
            if (!silent) alert('Could not load the built-in word list.');
        }
    }

    newLibrary() {
        if (!this.confirmDiscard()) return;
        this.library = { version: 1, name: 'My Word List', categories: [] };
        this.els.fileName.value = 'my-word-list';
        this.selectedIndex = -1;
        this.dirty = false;
        this.renderList();
        this.loadCategory(-1);
        this.status('Started a new empty list');
    }

    confirmDiscard() {
        if (!this.dirty) return true;
        return confirm('You have unsaved changes. Discard them?');
    }

    markDirty() {
        this.dirty = true;
    }

    // --- Category list ---
    renderList() {
        const filter = this.els.filter.value.trim().toLowerCase();
        this.els.list.innerHTML = '';

        this.library.categories.forEach((cat, i) => {
            if (filter && !cat.name.toLowerCase().includes(filter)) return;
            const div = document.createElement('div');
            div.className = 'cat-item' + (i === this.selectedIndex ? ' active' : '');
            div.onclick = () => this.selectCategory(i);
            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = cat.name;
            const count = document.createElement('span');
            count.className = 'count';
            count.textContent = cat.words.length + ' words';
            div.appendChild(name);
            div.appendChild(count);
            this.els.list.appendChild(div);
        });

        const total = this.library.categories.reduce((n, c) => n + c.words.length, 0);
        this.els.count.textContent = `${this.library.categories.length} categories · ${total} words`;
    }

    selectCategory(index) {
        if (index === this.selectedIndex) return;
        if (this.hasPendingEdits() && !confirm('Discard the unapplied edits to this category?')) return;
        this.selectedIndex = index;
        this.renderList();
        this.loadCategory(index);
    }

    loadCategory(index) {
        const cat = this.library.categories[index];
        if (!cat) {
            this.els.title.textContent = 'No category selected';
            this.els.catName.value = '';
            this.els.words.value = '';
            this.els.catName.disabled = true;
            this.els.words.disabled = true;
            this.updatePreview();
            return;
        }
        this.els.catName.disabled = false;
        this.els.words.disabled = false;
        this.els.title.textContent = 'Editing: ' + cat.name;
        this.els.catName.value = cat.name;
        this.els.words.value = cat.words.join('\n');
        this.updatePreview();
    }

    hasPendingEdits() {
        const cat = this.library.categories[this.selectedIndex];
        if (!cat) return false;
        return this.els.catName.value !== cat.name ||
            this.els.words.value !== cat.words.join('\n');
    }

    newCategory() {
        this.library.categories.push({ name: 'New Category', words: [] });
        this.selectedIndex = this.library.categories.length - 1;
        this.markDirty();
        this.renderList();
        this.loadCategory(this.selectedIndex);
        this.els.catName.focus();
        this.els.catName.select();
    }

    deleteCategory() {
        const cat = this.library.categories[this.selectedIndex];
        if (!cat) return;
        if (!confirm(`Delete "${cat.name}" and its ${cat.words.length} words?`)) return;
        this.library.categories.splice(this.selectedIndex, 1);
        this.selectedIndex = Math.min(this.selectedIndex, this.library.categories.length - 1);
        this.markDirty();
        this.renderList();
        this.loadCategory(this.selectedIndex);
        this.status('Category deleted');
    }

    // --- Word parsing ---
    parseWords(text) {
        return text
            .split(/[\n,;]+/)
            .map(w => w.trim().toUpperCase().replace(/[^A-Z]/g, ''))
            .filter(w => w.length > 0);
    }

    updatePreview() {
        const words = this.parseWords(this.els.words.value);
        const seen = new Set();
        const problems = { short: [], long: [], dupe: [] };

        this.els.chips.innerHTML = '';
        words.forEach((w, i) => {
            let bad = '';
            if (w.length < MIN_LEN) { bad = 'short'; problems.short.push(w); }
            else if (w.length > MAX_LEN) { bad = 'long'; problems.long.push(w); }
            else if (seen.has(w)) { bad = 'dupe'; problems.dupe.push(w); }
            seen.add(w);

            const chip = document.createElement('span');
            chip.className = 'chip' + (bad ? ' bad' : '');
            chip.textContent = w;
            const x = document.createElement('button');
            x.textContent = '×';
            x.title = 'Remove';
            x.onclick = () => this.removeWordAt(i);
            chip.appendChild(x);
            this.els.chips.appendChild(chip);
        });

        const usable = [...new Set(words)].filter(w => w.length >= MIN_LEN && w.length <= MAX_LEN);
        const coverage = BANDS
            .map(b => {
                const n = usable.filter(w => w.length >= b.lo && w.length <= b.hi).length;
                return `${b.label} ${n}/${b.need}${n < b.need ? ' ⚠' : ''}`;
            })
            .join('   ');
        this.els.previewCount.textContent =
            `— ${words.length} entered, ${seen.size} unique, ${usable.length} usable   ·   ${coverage}`;

        const msgs = [];
        if (problems.short.length) msgs.push(`Too short (under ${MIN_LEN} letters): ${problems.short.join(', ')}`);
        if (problems.long.length) msgs.push(`Too long (over ${MAX_LEN} letters): ${problems.long.join(', ')}`);
        if (problems.dupe.length) msgs.push(`Duplicates: ${[...new Set(problems.dupe)].join(', ')}`);

        const thin = BANDS.filter(b => usable.filter(w => w.length >= b.lo && w.length <= b.hi).length < b.need);
        if (thin.length) {
            msgs.push('Not enough words for: ' + thin.map(b =>
                `${b.label} (needs ${b.need} words of ${b.lo}–${b.hi} letters)`).join(', ') +
                '. The game will widen the length band to fill the grid, so the round will still play.');
        }

        this.els.validation.textContent = msgs.join('\n');
    }

    removeWordAt(index) {
        const words = this.parseWords(this.els.words.value);
        words.splice(index, 1);
        this.els.words.value = words.join('\n');
        this.markDirty();
        this.updatePreview();
    }

    sortWords() {
        const words = this.parseWords(this.els.words.value);
        words.sort((a, b) => a.localeCompare(b));
        this.els.words.value = words.join('\n');
        this.markDirty();
        this.updatePreview();
    }

    dedupeWords() {
        const words = [...new Set(this.parseWords(this.els.words.value))];
        this.els.words.value = words.join('\n');
        this.markDirty();
        this.updatePreview();
    }

    stripInvalid() {
        const words = this.parseWords(this.els.words.value)
            .filter(w => w.length >= MIN_LEN && w.length <= MAX_LEN);
        this.els.words.value = [...new Set(words)].join('\n');
        this.markDirty();
        this.updatePreview();
    }

    applyChanges() {
        const cat = this.library.categories[this.selectedIndex];
        if (!cat) return alert('Pick a category first, or press "+ New".');

        const name = this.els.catName.value.trim();
        if (!name) return alert('Give the category a name.');

        const words = [...new Set(this.parseWords(this.els.words.value))]
            .filter(w => w.length >= MIN_LEN && w.length <= MAX_LEN);

        if (!words.length) return alert('This category needs at least one usable word.');

        cat.name = name;
        cat.words = words;
        this.markDirty();
        this.renderList();
        this.loadCategory(this.selectedIndex);
        this.status(`Applied — "${name}" now has ${words.length} words`);
    }

    // --- Persistence ---
    fileBaseName() {
        const raw = this.els.fileName.value.trim() || 'my-word-list';
        return raw.replace(/\.json$/i, '').replace(/[\\/:*?"<>|]/g, '').trim() || 'my-word-list';
    }

    payload() {
        return {
            version: 1,
            name: this.fileBaseName(),
            categories: this.library.categories.map(c => ({ name: c.name, words: c.words.slice() }))
        };
    }

    saveToLocalStorage() {
        if (this.hasPendingEdits() &&
            !confirm('This category has edits you have not applied yet. Save without them?')) return;
        if (!this.library.categories.length) return alert('Add at least one category first.');

        const key = 'wordsearch_list_' + this.fileBaseName();
        try {
            localStorage.setItem(key, JSON.stringify(this.payload()));
            this.dirty = false;
            this.status(`Saved to this browser as "${this.fileBaseName()}"`);
        } catch (e) {
            console.error(e);
            alert('Could not save to browser storage: ' + e.message);
        }
    }

    downloadJSON() {
        if (this.hasPendingEdits() &&
            !confirm('This category has edits you have not applied yet. Download without them?')) return;
        if (!this.library.categories.length) return alert('Add at least one category first.');

        const blob = new Blob([JSON.stringify(this.payload(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileBaseName() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        this.dirty = false;
        this.status('Downloaded ' + a.download);
    }

    uploadJSON(input) {
        const file = input.files[0];
        if (!file) return;
        if (!this.confirmDiscard()) { input.value = ''; return; }

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                let text = String(ev.target.result).trim();
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const data = JSON.parse(text);

                const cats = Array.isArray(data) ? data : data.categories;
                if (!Array.isArray(cats) || !cats.length) throw new Error('No categories found.');

                this.library = {
                    version: 1,
                    name: data.name || file.name.replace(/\.json$/i, ''),
                    categories: cats.map(c => ({
                        name: c.name || 'Untitled',
                        words: Array.isArray(c.words) ? c.words.slice() : []
                    }))
                };
                this.els.fileName.value = file.name.replace(/\.json$/i, '');
                this.selectedIndex = this.library.categories.length ? 0 : -1;
                this.dirty = false;
                this.renderList();
                this.loadCategory(this.selectedIndex);
                this.status(`Loaded ${this.library.categories.length} categories from ${file.name}`);
            } catch (err) {
                console.error('JSON Load Error', err);
                alert('Invalid JSON: ' + err.message);
            }
            input.value = '';
        };
        reader.readAsText(file);
    }

    status(msg) {
        this.els.status.textContent = msg;
        this.els.status.style.display = 'block';
        clearTimeout(this.statusTimer);
        this.statusTimer = setTimeout(() => {
            this.els.status.style.display = 'none';
        }, 2600);
    }
}

const editor = new WordSearchEditor();
