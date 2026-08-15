# Session Compaction Summary

## User Intent
- Add a visual overlay system to dunno for displaying backend-generated diagnostics (errors, warnings, info) directly on text ranges
- Tooltips should show on hover and support right-clickable commands, maintaining dunno's Acme-style "any word is a command" philosophy
- Ensure the overlay system is rich enough for a real backend integration: pane identity, range metadata, and command context

## Contextual Work Summary

### Overlay Engine
- New `js/overlay.js` module maps text offsets to DOM rects via `TreeWalker` + `Range.getClientRects()`
- Each overlay produces absolutely-positioned `.overlay-mark` divs inside a `.pane-overlay` layer
- The overlay layer lives inside `.editor-wrap` (position: relative) so marks scroll naturally with content
- Built-in severity classes: `.ov-error`, `.ov-warning`, `.ov-info` with colored backgrounds and wavy underlines
- Marks extend 3px beyond text rects for breathing room; `border-radius: 2px`

### Tooltip UX
- CSS-only hover tooltips with `visibility`/`opacity` transition to avoid layout flicker
- Tooltip overlaps its mark by 2px (`top: calc(100% - 2px)`) so moving the mouse straight down never leaves the hover zone
- `white-space: normal` + `min/max-width` so sentences flow naturally
- Any word in the tooltip is right-clickable just like normal pane text

### Lifecycle & Reflow
- Overlays auto-clear on `input` (character offsets go stale on edit)
- `ResizeObserver` on `.editor-wrap` auto-refreshes all overlays on column resize, window resize, font zoom
- Overlays stored per-pane in a `Map` with incremental IDs; `clearOverlays()` and `removeOverlay(id)` available

### Public API Extension
- `editor.addOverlay({start, end, className?, tooltip?})` returns an overlay id
- `editor.clearOverlays()` / `editor.removeOverlay(id)`
- `editor.getOverlay()` returns `{id, start, end, className, tooltip}` when a command is triggered from inside a tooltip — so commands know which range they refer to
- `editor.getId()` returns the stable pane identifier (same id sent in remote WebSocket events)
- Updated `agents/architecture.md` with full overlay API docs and backend-correlation example

### Example & Version
- `examples/tooltips.js` created as a self-contained demo registering `Lint`, `Fix`, `FixRemote`, and `Clear` commands
- `FixRemote` demonstrates sending `{type: 'fix', paneId, filename, start, end, reason}` to a backend via `dunno.remoteSend()`
- Version bumped from `0.10.0` → `0.11.0` in `manifest.json` and `sw.js` cache key

## Files Touched

### Core Logic
- **js/overlay.js**: New overlay rendering engine (offset-to-rect mapping, mark creation, tooltip attachment)
- **js/tiling.js**: Added `.editor-wrap` and `.pane-overlay` DOM structure; overlay lifecycle; ResizeObserver wiring; `getOverlay` context passed to command dispatch
- **js/main.js**: Exposed `addOverlay`, `clearOverlays`, `removeOverlay`, `getOverlay`, `getId` on public editor handles; threaded overlay metadata through `_editorHandle` and command registration

### Styles
- **css/app.css**: `.editor-wrap`, `.pane-overlay`, `.overlay-mark`, `.overlay-tooltip`, and `.ov-error`/`.ov-warning`/`.ov-info` styles with light+dark variants

### Examples
- **examples/tooltips.js**: Self-contained demo script with `Lint`, `Fix`, `FixRemote`, `Clear` commands showing full backend integration pattern

### Docs
- **agents/architecture.md**: Documented all overlay methods, built-in severity classes, tooltip behavior, and `getOverlay`/`getId` correlation pattern

### Config
- **manifest.json**: Version `0.11.0`
- **sw.js**: Cache key `dunno-0.11.0`
