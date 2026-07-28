# Session Compaction Summary

## User Intent

- Add a code formatter (Prettier) and a bc-style calculator (math.js) to dunno
- Make the editor usable on mobile via long-press command triggering
- Bump version and keep the bundle healthy after each feature

## Contextual Work Summary

### Prettier / Format Command
- Vendored `prettier@3.9.6` browser plugins to `libs/prettier/` (standalone + babel, estree, postcss, markdown, html, yaml)
- Added `js/format.js` with `resolveParser` (selection word → parser, filename ext → parser, default: `markdown`) and `formatSource`
- Registered `Format` command in `main.js`; reformats pane in-place, no split pane
- Help entry added with language aliases and fallback behaviour documented

### Calc Command (bc-style REPL pane)
- Vendored `mathjs@15.2.0` browser UMD build to `libs/math.js` (~650 KB)
- Added `js/calc.js` with `attachCalc(pane)`: intercepts Enter in capture phase (`stopImmediatePropagation` prevents CodeJar's own handler), evaluates current line with `math.parser()`, inserts `= result` on the next line, positions cursor on the empty input line below
- `Calc` command in `main.js` follows the same split-pane pattern as Help/Preview/Plot: creates a new pane below, sets its tag to `calc Del`, reuses it on subsequent calls
- Scope (variables) persists for the pane's lifetime; right-clicking `Calc` again resets scope
- Cursor bug fixed: `jar.restore()` uses strict `>` so it can't land at `offset === text.length`; guard appends a sentinel `\n` when needed so the cursor position always falls within the text node

### Long-Press (Mobile)
- Added `_addLongPress(el, paneId)` in `tiling.js`: 500ms hold → fires `_onContextMenu` at touch coordinates
- Capture the selection on `touchstart` (mirrors right-click mousedown capture)
- Movement > 10px cancels the timer; `touchend`/`touchcancel` also cancel
- One-shot `contextmenu` suppressor prevents the browser's native long-press menu appearing after command fires
- Attached to `tagBarEl`, `editorEl`, and `bodyEl` for every pane

### Version Bump
- `manifest.json` bumped from `0.2.0` → `0.3.0`

### Bundle
- `go run bundle.go` confirmed clean after each change; final size ~2393 KB (up from ~340 KB pre-Prettier/math.js)

## Files Touched

### JavaScript
- **js/format.js**: New — `resolveParser` + `formatSource`; default parser is `markdown`
- **js/calc.js**: New — `attachCalc(pane)`; bc-style Enter handler with sentinel-`\n` cursor fix
- **js/main.js**: Added imports for `formatSource`, `resolveParser`, `attachCalc`; registered `Format` and `Calc` commands
- **js/tiling.js**: Added `_addLongPress` helper and wired it to all three pane elements in `createPane`
- **js/help.js**: Added `Format` and `Calc` entries in SECTIONS (View group) and full topic entries in TOPICS

### HTML
- **index.html**: Added `<script>` tags for `libs/math.js` and all seven `libs/prettier/*.js` files

### Vendored Libs
- **libs/prettier/**: standalone.js, babel.js, estree.js, postcss.js, markdown.js, html.js, yaml.js, LICENSE
- **libs/math.js**: mathjs 15.2.0 browser UMD build

### Config
- **manifest.json**: version `0.3.0`
