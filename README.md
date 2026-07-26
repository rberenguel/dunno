# dunno

A tiled text editor inspired by Plan 9's Acme, with a gnuplot-compatible inline plotter and side-by-side diff.

Runs as a local HTML file — open `index.html` directly in a browser. No build step, no server.

## Usage

**Right-click any known word** anywhere (tag bar or body) to execute it as a command.

### Layout

| Command | Effect |
|---------|--------|
| `New` | New pane below in the same column |
| `Newcol` | New column to the right |
| `Del` | Delete this pane (last pane is protected) |

### Diff

`Diff` compares the current pane against the **previously active** pane and paints a gutter on the left edge:

- Solid red bar — line exists here but differs from the other pane
- Thin green stripe — other pane has lines here that this one doesn't

Right-click `Diff` again to dismiss the gutter.

### Plot

`Plot` reads the **previously active pane** as data and the current pane as a gnuplot-compatible spec, then renders an SVG below.

**Data pane:** CSV, TSV, or whitespace-separated. Optional header row (auto-detected). `#` lines are ignored.

**Spec pane:**

```gnuplot
set title "My plot"
set xlabel "time (s)"
set ylabel "voltage"
set grid
plot "-" using 1:2 with lines title "ch1", \
     "-" using 1:3 with linespoints title "ch2"
```

`"-"` always refers to the data pane (equivalent to stdin in real gnuplot — swap it for a filename and the spec runs unchanged in actual gnuplot).

**Supported `with` styles:** `lines`, `points`, `linespoints`, `dots`, `impulses`, `boxes`/`bars`, `area`, `steps`

Right-click `Plot` again to refresh after editing the spec or the data.

### Theme & persistence

| Command | Effect |
|---------|--------|
| `dark` / `light` | Toggle theme |
| `Save` | Save layout and content to localStorage |
| `Get` | Restore from localStorage |

`Cmd+S` also saves. State is autosaved every 30 seconds and on page unload.

## Running

```
open src/index.html        # macOS
xdg-open src/index.html    # Linux
```

Or drag `index.html` onto a browser window.

A single-file build (no external resources, works offline) will be produced by `bundle.go` — see `next.md`.
