# dunno

A tiled text editor inspired by Plan 9's Acme, with a gnuplot-compatible inline plotter, side-by-side diff, Markdown preview, and JS eval.

![](https://raw.githubusercontent.com/rberenguel/dunno/refs/heads/gh-pages/dunno.jpeg)

## Running

Open `index.html` from a local HTTP server (required for file I/O):

```sh
cd dunno && python3 -m http.server 8080
# then open http://localhost:8080
```

Or use the single-file build — `go run bundle.go` produces `dist/dunno.html`, which works offline with no external dependencies.

Drag-and-drop files onto any pane works in all contexts including `file://`.

## Core mechanic

**Right-click any known word** anywhere — tag bar or body — to execute it as a command. No menus.

Select text first to give commands context. For example, select `plot` then right-click `Help` to get plot-specific documentation.

## Commands

### Layout

| Command | Effect |
|---------|--------|
| `New` | Split current pane |
| `Newcol` | Add a column to the right |
| `Del` | Delete this pane |

### File I/O

| Command | Effect |
|---------|--------|
| `Load` | Open a file via picker (localhost/HTTPS) or drag-and-drop |
| `Save` | Write to file via picker, or download as blob if picker unavailable |
| `Get` | Reload from file, or restore session from localStorage |

Autosaves to localStorage every 30s and on unload. `⌘S` / `Ctrl+S` saves the session manually.

### Edit

| Command | Effect |
|---------|--------|
| `Find` | Search bar at the bottom of the pane |
| `Replace` | Find & replace bar |

**ed substitute:** select `s/pat/rep/g` anywhere and right-click — the substitution is applied to the pane body. The separator is inferred from the first character after `s`, so `s|foo|bar|` works too.

### View

**Diff** compares the current pane against the previously active pane. A colour-coded gutter appears on the left edge — red for changed lines, green for lines only in the other pane. Word-level differences are highlighted within changed pairs. Right-click `Diff` again to dismiss.

**Plot** reads the previously active pane as data and the current pane as a gnuplot-compatible spec, then renders an SVG below.

```gnuplot
set title "My plot"
set xlabel "time (s)"
set ylabel "voltage"
set grid
plot "-" using 1:2 with lines title "ch1", \
     "-" using 1:3 with linespoints title "ch2"
```

`"-"` refers to the data pane (equivalent to stdin in real gnuplot — swap for a filename and the spec runs unchanged in actual gnuplot). Right-click `Help` with `plot` selected for full syntax reference and examples.

Supported styles: `lines`, `points`, `linespoints`, `dots`, `impulses`, `boxes`/`bars`, `area`, `steps`

**Eval** runs the current pane as JavaScript. `console.log/warn/error` output appears in a split pane below.

**Preview** renders the current pane as Markdown → HTML in a split pane below.

### Theme

Right-click `dark` or `light` anywhere.

### Help

Right-click `Help` for the full command reference. Select a command name first (`plot`, `diff`, `eval`, `preview`, `find`) then right-click `Help` for topic-specific documentation with examples.

## Bundling

```sh
go run bundle.go             # → dist/dunno.html
go run bundle.go --out foo.html
```

Inlines all CSS, JS (ES modules → IIFE), `marked.min.js`, and the favicon as base64. Version is read from `manifest.json` and injected at build time.
