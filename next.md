# Next steps

## Plot improvements

Remaining from the original list:
- `set logscale x` / `set logscale y` / `set logscale xy`
- `set xtics` / `set ytics` for manual tick control
- `smooth csplines` / `smooth bezier` — interpolate sparse data
- Error bars: `with errorbars using 1:2:3` (col 3 = ±error)
- Multiple y-axes (`axes x1y2`)
- Light-mode SVG colours (currently hardcoded dark)
- Clamp lines at clip boundary rather than dropping whole segment

Already done: categorical / date x-axis, hover tooltips, PNG export.

## Autoload JS panes

A pane flagged as autoload would have its content eval'd on session restore, making plugins available immediately without manual right-click Eval.

The flag could live in the saved pane state (a boolean `autoload` property) or be detected from a magic first line (`// @autoload`) to keep it visible and editable in the pane itself. The latter is more transparent — the user can see and toggle it without a separate UI.

Hook point is `_onPaneRestored` in `main.js`, which already handles per-pane state like `isCalc` and `highlightLang`.

### Open questions

- Should autoload panes run in a restricted scope or full `window` access? (Full access is needed for `dunno.register` to work.)
- Should errors in autoload panes surface as toasts, or silently log to console?

## Bulk file loading / folder loading

`showOpenFilePicker` already accepts `multiple: true` — a `LoadAll` command could open several files at once, each into its own pane. `showDirectoryPicker` (Chrome/Edge) could load an entire folder, filtering by extension (e.g. `.js` for plugin directories).

Combined with autoload, a workflow emerges: pick a plugins folder, load all `.js` files as autoload panes, and they're available on every subsequent session start without re-loading.

### Open questions

- Should `LoadAll` create panes in the current column or spread across new columns?
- Folder loading should probably filter by extension — configurable via selection (e.g. select `js` then right-click `LoadDir`)?

---

## Done

### Extension event system

Built: `js/events.js` bus, nine events (`activate`, `change`, `newpane`, `delpane`, `theme`, `command`, `save`, `load`, `tab`), 150 ms debounce on `change`, wildcard `*` support, `dunno.on`/`dunno.off` returning unsubscribe functions.

### Remote event bridge

Built: `js/remote.js` WebSocket client with auto-reconnect (3s → 30s). `dunno.remote(url)` auto-forwards all events as JSON metadata. `dunno.remoteSend(obj)` for one-off messages. `dunno.remoteOff()` to disconnect.

### Plot categorical x-axis

Auto-detects non-numeric x-columns (dates, names), places points by row index, renders 60° slanted tick labels with extra bottom margin so labels sit outside the plot area.
