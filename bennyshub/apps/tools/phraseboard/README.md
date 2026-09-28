# Phrase & Media Board

Open `index.html` through the website or the local preview server. Use **Edit this board** to edit the current board/category with a mouse and keyboard. Existing `phrase-builder.html` bookmarks open the new editor.

## Everyday use

- **Two switches:** Space advances, Enter selects. Holding Enter returns from a tile scan to its row/group. Holding Space scans backwards.
- **One switch:** Enable automatic scanning in Settings → Scan Settings; either switch selects. The first-use practice tour starts automatic scanning and offers a Two switches option. Leaving the tour restores the previous scan configuration.
- **Grid:** The default for old and new CSVs; existing row/cell preferences are retained. Phone screens show two readable columns and scroll vocabulary into view during scanning.
- **Free placement:** Choose it for the board or override it per category. Named groups scan first, then tiles, ordered by their separate scan-order numbers. Each active group offers **Back to groups**. Group labels and outlines supplement color; spoken names and dimming are optional Settings choices.
- **Messages:** New users start with sentence creation enabled. Existing users keep saved preferences; old installations without a stored sentence preference keep the previous off default. Select the message to speak, or use Delete/Clear All. Text and Tiles displays share the same spoken text. Quick phrases marked “Speak immediately” bypass message composition. Media links keep opening the player.
- **Suggestions:** Enabled for new users, with existing preferences preserved. Built-in vocabulary, board phrases, optional prepared phrases, and past messages spoken deliberately provide suggestions from day one. Suggestions occupy a separate scan group and are read aloud when scan speech is enabled. Selecting one only appends it; Speak reads the composed message. Learning stays in this browser and can be disabled or cleared in Settings. No model download is required for these automatic suggestions.
- **Help:** Replay the skippable practice tour from Help or Settings. Practice messages do not replace the personal board or message.

## Editor and responsive layouts

**Basic view** shows the selected category. Drag to reorder Grid tiles, or place and resize Free placement tiles. Select multiple tiles with checkboxes or Ctrl/Shift-click; drag them onto a category to move them together.

**Graphic view** shows the current board, its categories, and their tiles as connected nodes in one horizontal row of category branches. Drag empty space to box-select tiles or category headings. Drag tiles between categories, or drag category headings to change category order. Right-click for colors, Move to, ordering, and deletion; the Actions button and Shift+F10 offer the same controls. Choose a tile to edit its text, speech, image, or advanced scan settings. Graphic view fills the available window, with floating properties that can be hidden. Use +/− to zoom, the percentage button for 100%, or Fit board to show the whole map. The tool toggle shows a cursor in selection mode and a hand in Pan mode. Click it to switch modes. Scroll to pan; use Pan mode, the middle mouse button, or hold Space over the workspace and drag. In Pan mode the wheel zooms. Ctrl/Cmd + scroll also zooms around the pointer in selection mode. Box selection and dragging also work while zoomed. Move to opens a dialog naming the selection and destination category. Basic view stays in the source category when it still contains tiles, with a confirmation and a link to the destination. Scanning-group assignment is shown only for Free placement, and changes scan membership rather than category or position. The map edits the current board, not a library of separate boards. Switching views leaves the board layout intact.

The header’s **Find a word** search matches labels and spoken text across every category, reports exact matches, and selects the result in either view. Graphic view zooms to the result.

The header’s **Board** dropdown contains New, Import, Download, board settings, suggestions, and recovery commands. It overlays the workspace without resizing the header. Save, Preview, Return, and Undo stay visible. Category appearance and advanced scan/size settings remain available when needed. Bundled OpenSymbols matches provide fast lookup for known words, with original image URLs and per-symbol attribution in `boards/opensymbols-attribution.json`. OpenSymbols automatically finds images for new text when enabled; existing images and manually supplied image URLs take precedence. Choose image opens a bounded, opaque symbol picker that also accepts arbitrary image URLs.

Automatic preparation combines vocabulary from every category with common grammatical patterns, creating up to 1,500 ready-to-use phrases. Base verbs are ranked by common use, so “I want to” offers “go” without model analysis. Personal spoken-message history can outrank those defaults.

Optional local AI preparation is under Board → Suggestions & local AI. A WebGPU-capable browser downloads a Qwen 0.5B or 1.5B model on request. Model batches mix categories and share core vocabulary; up to 1,500 additional prepared phrases can be saved. Generated phrases are validated against board vocabulary and shown for review before applying and saving; the live board never runs the model. Prepared phrases export with the board, while personal spoken-message history does not. First-time model downloads and the OpenSymbols service need a network connection.

Save applies a browser-local board. Download CSV makes a portable backup including layout and scanning metadata. Preview scanning opens the actual live board in an iframe at the chosen desktop, tablet, or phone width. Close preview returns to editing. Return to board retains the original board when edits are discarded, and confirms loaded saves when saved changes are applied.

The desktop free-placement canvas uses 1000 logical horizontal units. Tile X/Width scale to the available width; Y/Height are pixel-based. Under 760 px, tiles reflow into two columns in reading order (Y, then X), use readable minimum sizes, and expand for long text. The desktop canvas is not scaled down into an unreadable miniature. Scan order stays independent of this reflow. Use the live preview to inspect long labels, images, and intended spacing.

The symbol picker preserves custom URLs. Automatic remote assignment requires a matching symbol label; unrelated search results are not silently assigned. Reviewed related concepts and source/license metadata are recorded with bundled matches. `node scripts/fill-phraseboard-symbols.cjs` fills missing matches using the public service, preserves existing images, and requires network access. Successful matches and unresolved lookups are cached so interrupted runs can resume efficiently. Use `--retry-unresolved` to search previously unmatched terms again after the catalogue changes. Verb-form tiles can share a verified base-action symbol; the visible word distinguishes tense and person.

Groups with equal order keep their first occurrence; tiles with equal scan order keep their existing tile order. Empty editor groups are omitted from saves and scanning. Assign at least one tile before saving a new group.

## Compatibility and recovery

`board-core.js` reads the original CSV columns and adds optional `BoardLayout,CategoryLayout,Group,GroupColor,GroupOrder,ScanOrder,X,Y,Width,Height,Immediate,PredictionPhrases`. CSVs without those columns stay Grid. Quoted multiline text, commas, quotes, and Unicode round-trip. Media remains in the Speak column. NARBE Words now contains 2,957 tiles across 30 categories. This expansion adds 2,000 everyday words and phrases to the previous 957-tile board, including modal verbs, contractions, common inflections, adverbs, relationships, self-advocacy, household tasks, health, work, travel, and conversation. New Contractions, Adverbs, and Verb forms categories keep grammatical forms findable. Existing entries and their tile/category order are retained; additions are appended within categories. 2,194 tiles have OpenSymbols image links; 763 unmatched or ambiguous terms remain text-only for manual review. Use Board settings → Review tiles without images to find them. Existing saved personal boards are not overwritten; open or import the updated built-in CSV to use the expansion.

The original `narbe_phrase_builder` localStorage key and `{boardName,csv}` envelope are retained. Version 2 adds a revision token and previous save. Current and previous data commit together in one storage write, so a quota failure leaves both unchanged. A separate recovery copy supports damaged current data. **Restore previous save** loads the previous version for review; **Save** applies it. **Undo last edit** recovers unsaved changes. Stale editors are prevented from silently overwriting newer saves; download their edits, then reload. Recovery is local to the browser/origin and is not a substitute for a downloaded CSV.

## Verification

From the repository root:

```sh
npm test
npm start
# In another terminal:
npm run test:phraseboard
```

The browser script uses a fresh profile. Set `PHRASEBOARD_BROWSER` to a Chromium executable if needed; otherwise it uses installed Chrome/Edge on Windows or Playwright's Chromium. Screenshots are written to `artifacts/phraseboard-{desktop,tablet,phone}.png`.

Automated checks cover every shipped CSV, multiline and mixed-layout round trips, atomic recovery after quota failure, stale writes, independent scan ordering, tour completion, one/two-switch events, touch events, message actions, audible scan cues and deliberate prediction insertion, responsive sizes, media exit with an unavailable YouTube API, simulated YouTube pause/seek/mute/playlist API calls, drag/resize, flat tree layout, board-wide search, zoom/pan/fit, box selection at different zoom levels, Move to dialogs, multi-tile moves and colors, category ordering, image selection and inspector reset, editor saves, restore, and isolated live previews. Model request/schema and unsupported-WebGPU checks use a stub engine; they do not certify actual model quality or download compatibility.

Before a public release, also validate with the intended physical switches and users, iOS Safari/Android browsers, the user's real boards, audible device voices, and successful online YouTube playback (including playlists, pause/seek/mute, and closing after fullscreen). Automated network-failure checks verify escape behavior; they do not certify third-party playback availability or hardware compatibility.
