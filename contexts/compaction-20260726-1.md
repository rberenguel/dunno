# Session Compaction Summary

## User Intent

- Build a new Acme-inspired tiled text editor ("dunno") from scratch, distinct from the old `../weave` project
- Core mechanic: right-click any known word anywhere to execute it as a command (no menus)
- Key use case: side-by-side diff between panes, and gnuplot-compatible inline plotting
- Follow the same dev/dist duality as `../scream`: ES modules in dev, single-file bundler later

## Contextual Work Summary

### Architecture Decision
- Tiled layout: columns (horizontal) containing panes (vertical stacks), using CSS flex — no drag-resize yet
- Each pane has an editable tag bar (one line, Acme-style) above a CodeJar editor body
- Command dispatch: `contextmenu` event → `caretRangeFromPoint` word detection → registry lookup → execute or fall through to browser default
- "Previously active pane" tracked globally (`_prevActiveId`) for context-dependent commands (Diff, Plot)

### Core App Built
- Full tiling system with `New`, `Newcol`, `Del` commands
- Dark mode by default, `dark`/`light` toggle, theme persisted in localStorage
- Autosave every 30s + on unload, `Save`/`Get` commands, `Cmd+S` shortcut
- Service worker added then immediately removed (too early — app not done)

### Diff
- `Diff` paints a gutter overlay on the left edge of the editor (editor stays visible and editable)
- Red marks = lines that differ; thin green stripes = lines only in other pane
- LCS-based line diff in `diff.js`; gutter marks are absolutely positioned divs inside `.pane-body`
- Line height hardcoded to match CSS (`14px × 1.7 = 23.8px`, `14px` top padding)
- Right-click `Diff` again to dismiss

### Plot
- `Plot` parses the current pane as a gnuplot-compatible spec, reads the previously active pane as data
- Output SVG rendered in a new pane inserted below the spec pane (reused on re-run)
- Gnuplot compatibility is intentional: swap `"-"` for a real filename and the spec runs in actual gnuplot
- Multiple `plot` commands: last one wins (correct gnuplot behaviour); use comma-separated series instead
- Supported styles: `lines`, `points`, `linespoints`, `dots`, `impulses`, `boxes`/`bars`, `area`, `steps`
- Data: auto-detects CSV/TSV/whitespace, optional header row, `#` comments ignored

### Naming
- Project is "dunno" (the folder), not "Weave" — all references updated across HTML, JS, manifest, localStorage key

## Files Touched

### Core App
- **index.html**: PWA shell, dark body class by default, SW unregistered (dev mode)
- **manifest.json**: name = "dunno"
- **sw.js**: exists but unregistered until app is stable

### JavaScript
- **js/main.js**: bootstrap, all command registrations, persistence, welcome text
- **js/tiling.js**: column/pane model, CodeJar setup, right-click dispatch, diff gutter, `setPaneDisplay` for plot output
- **js/commands.js**: simple registry (`register`, `execute`, `isCommand`)
- **js/diff.js**: LCS diff (line-level + word-level for adjacent del/ins pairs), `renderDiffHtml` (unused now)
- **js/plot.js**: gnuplot parser (`parsePlotSpec`) + SVG renderer (`renderSVG`), dark-themed output

### Styles
- **css/app.css**: full tiling layout, tag bar, diff gutter vars and marks, `.pane-display` for SVG output

### Libs
- **libs/codejar.js**: copied from `../scream/libs/codejar.js`

### Docs & Data
- **README.md**: usage guide, commands, plot syntax
- **next.md**: prioritised next steps (bundler first, then plot improvements, resize, preview, file I/O, text commands, pane identity)
- **sample.csv**: 40-row, 6-column test data (t, linear, sine, noisy_sine, quadratic, exponential)

## Key Next Step

Write `bundle.go` (port of `../scream/weave.go`) to produce a single self-contained `dunno.html`.
