# Next steps

## 1. Plot improvements

- `set logscale x` / `set logscale y` / `set logscale xy`
- `set xtics` / `set ytics` for manual tick control
- `smooth csplines` / `smooth bezier` — interpolate sparse data
- Error bars: `with errorbars using 1:2:3` (col 3 = ±error)
- Multiple y-axes (`axes x1y2`)
- Light-mode SVG colours (currently hardcoded dark)
- Clamp lines at clip boundary rather than dropping whole segment

## 2. Pane identity

Allow the first word of the tag bar (before the command words) to serve as a pane name, so commands like `Diff` and `Plot` can reference panes by name rather than relying solely on "previously active":

```
data.csv  Del New Diff
spec      Del New Plot
```

`plot "-" using 1:2` would still use the previously active pane for compatibility, but an explicit `plot "data.csv"` could look up the pane named `data.csv`.

## 3. Autoload JS panes

A pane flagged as autoload would have its content eval'd on session restore, making plugins available immediately without manual right-click Eval.

The flag could live in the saved pane state (a boolean `autoload` property) or be detected from a magic first line (`// @autoload`) to keep it visible and editable in the pane itself. The latter is more transparent — the user can see and toggle it without a separate UI.

Hook point is `_onPaneRestored` in `main.js`, which already handles per-pane state like `isCalc` and `highlightLang`.

### Open questions

- Should autoload panes run in a restricted scope or full `window` access? (Full access is needed for `dunno.register` to work.)
- Should errors in autoload panes surface as toasts, or silently log to console?

## 4. Bulk file loading / folder loading

`showOpenFilePicker` already accepts `multiple: true` — a `LoadAll` command could open several files at once, each into its own pane. `showDirectoryPicker` (Chrome/Edge) could load an entire folder, filtering by extension (e.g. `.js` for plugin directories).

Combined with autoload, a workflow emerges: pick a plugins folder, load all `.js` files as autoload panes, and they're available on every subsequent session start without re-loading.

### Open questions

- Should `LoadAll` create panes in the current column or spread across new columns?
- Folder loading should probably filter by extension — configurable via selection (e.g. select `js` then right-click `LoadDir`)?

## 5. Extension event system

Plugins registered via `dunno.register` only run on demand (right-click). A live plugin — one that updates its output as the user moves around — needs to subscribe to pane lifecycle events.

### Proposed API

```js
dunno.on('activate', editor => { /* pane gained focus */ })
dunno.on('change',   editor => { /* pane content changed */ })
dunno.on('theme',    isDark  => { /* dark/light toggled */ })
dunno.off('activate', fn)
```

### Implementation sketch

A small internal emitter (new `js/events.js` or inline in `tiling.js`) fires at existing hook points:

- `activate` — end of `_setActive` in `tiling.js`
- `change` — the `input` listener already on `editorEl`
- `theme` — wherever `dark`/`light` commands toggle `body.classList`

`main.js` wraps the emitter behind `dunno.on` / `dunno.off`; listeners receive an editor handle via `_editorHandle`, never the raw pane.

### Open questions

- `change` fires on every keystroke — should dunno debounce internally (e.g. 300 ms) or leave it to the plugin?
- Should `on` return an unsubscribe function in addition to `off`?
