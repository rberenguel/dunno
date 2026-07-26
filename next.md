# Next steps

## 1. Bundler (`bundle.go`) — priority

Produce a single self-contained `dunno.html` with no external dependencies, same approach as `../scream/weave.go`:

- Inline `css/app.css`
- Bundle the ES module graph (`js/main.js` + transitive imports) into an IIFE — strip `import`/`export` keywords, concatenate in dependency order
- Inline `libs/codejar.js` as part of the IIFE
- Strip the service-worker registration block
- Remove the manifest link

The result should open directly from the filesystem or be shared as a single file.

## 2. Plot improvements

- `set logscale x` / `set logscale y` / `set logscale xy`
- `set xtics` / `set ytics` for manual tick control
- `smooth csplines` / `smooth bezier` on `plot` — interpolate sparse data
- Error bars: `with errorbars using 1:2:3` (col 3 = ±error)
- Multiple y-axes (`axes x1y2`)
- Light-mode SVG colours (currently hardcoded dark)
- Clamp lines at clip boundary rather than dropping whole segment

## 3. Pane resize

Drag the tag bar vertically to resize panes within a column. Drag a column border horizontally to resize columns. Store sizes in saved state.

## 4. Markdown preview

A `Preview` command that renders the current pane's markdown as HTML in a display pane below (using `marked.min.js`, already in scream). Toggle back with `Preview` again.

## 5. File I/O

- `Open` — File System Access API (`showOpenFilePicker`) to load a file into the current pane
- `Write` — save current pane content back to the file it was opened from
- Fallback: download as `.md` / `.txt` when File System Access is unavailable

## 6. Text manipulation commands

Short, composable commands that operate on the pane content (or selection if one is active):

- `Sort` — sort lines alphabetically
- `Uniq` — deduplicate adjacent lines
- `Upper` / `Lower` — case conversion
- `Wrap N` — hard-wrap at N columns (default 80)
- `Json` — pretty-print JSON

These would make dunno useful as a lightweight scratchpad for data wrangling.

## 7. Pane identity

Allow the first word of the tag bar (before the command words) to serve as a pane name, so commands like `Diff` and `Plot` can reference panes by name rather than relying solely on "previously active":

```
data.csv  Del New Diff
spec      Del New Plot
```

`plot "-" using 1:2` would still use the previously active pane for compatibility, but an explicit `plot "data.csv"` could look up the pane named `data.csv`.
