# dunno — Future Ideas

## Scratchpad Scenarios

### 1. Clipboard as First-Class Data
- Paste an image → dunno stores it as a `data:` URI and shows a thumbnail inline (contenteditable supports `<img>`).
- Paste a table from Excel → auto-detect TSV, format as aligned text or markdown table.
- Paste a URL → fetch page title and show as a clickable markdown link, or render a preview pane.
- This makes the scratchpad feel like a "gathering ground" without export friction.

### 2. Templates / Boilerplate
- A `Snip` command with named snippets stored in localStorage.
- Right-click `Snip gofunc` → inserts a Go function skeleton.
- The backend-injected version could fetch snippet libraries from the server.
- Fits both modes: quick personal shortcuts locally, shared team templates via backend.

### 3. Scratch Session Timeline
- Beyond undo, a `History` command that shows prior versions of *this pane* as a vertical strip of mini-panes.
- Click any version to diff against current.
- Since dunno already has diff, this is mostly UI glue.

## Backend-Injected Editor Scenarios

### 4. Capability Handshake
- Right now the backend just opens a WebSocket and receives events.
- A proper negotiation: backend sends `{capabilities: ["lint", "format", "goimports"]}` on connect.
- Dunno auto-registers placeholder commands (`Lint`, `Format`) that show "connecting…" toasts until the backend confirms it supports them.
- This lets the *same* dunno.html work with different backends (Go server, Python server, etc.) without hardcoding commands.

### 5. Efficient Sync Protocol
- Currently the remote event sends text length, not content.
- For real backend work, the backend needs the text — but sending full text on every keystroke is wasteful.
- A simple diff-sync: dunno sends a `{event: "change", ...}`; backend replies with `{type: "patch", ops: [...]}` using the same diff engine already in `js/diff.js`.
- Or at minimum, a `dunno.remoteRequest()` that fetches full text on demand rather than broadcasting it.

### 6. Plugin Sandbox / Iframe Mode
- The backend can already inject JS, but there's no isolation.
- An `editor.sandbox(html, js)` API that creates an iframe-based pane with `postMessage` bridge.
- Backend scripts run in the iframe; only whitelisted messages cross into dunno.
- This lets backends ship arbitrary UI (custom inspectors, dashboards) without owning the whole page.

### 7. Presence / Cursors (Lightweight)
- If two people open the same backend-injected dunno, show other users' cursor positions as faint carets in pane gutters.
- No full OT/CRDT needed — just overlay other people's selections.
- Backend forwards `{type: "cursor", paneId, start, end, color}` and dunno renders it.

## Cross-Cutting (Useful in Both)

### 8. Pane Tags as Reactive Status Bars
- Right now tags are just command bars.
- Backend could push tag updates: `dunno.remoteSend({type: "tag", paneId: "7", text: "main.go · 3 errors"})`.
- Tags become status indicators, not just commands.

### 9. A Real Command Palette
- `42` (or a new `Menu` command) opens a fuzzy-search palette listing all registered commands.
- Since dunno's whole UX is "right-click a word you see," a palette feels like training wheels — but for backends injecting 20+ commands, it's discoverable.
- Could be a transient overlay at the bottom of the active pane.

### 10. Export as Single Markdown Bundle
- `Bundle` command walks all panes across all tabs and writes a single markdown file with `---` separators, filename headers, and content.
- Makes the scratchpad actually *shareable* beyond dunno.
