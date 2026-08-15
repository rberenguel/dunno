# dunno — Future Ideas (Refined)

## Done

### Clipboard Image Paste (Fake WYSIWYG)
- Paste an image → resize on canvas to max 1200px, compress as JPEG 92%.
- Store as markdown `![](data:...)` in the text model so it survives save/restore/tab switch.
- The editor highlight callback detects `![](data:...)` and renders it as a visible `<img>` inline, while keeping the raw markdown in a hidden `display:none` span.
- Result: images look WYSIWYG in the editor but are still plain text underneath.

### Tags as Reactive Status Bars
- `editor.setStatus(key, text)` / `clearStatus(key)` / `clearAllStatus()`.
- Multiple keyed fragments joined with `·`; never overwrites the command tag.
- Backend pushes via `dunno.remoteSend({type: "tag", paneId: "7", text: "main.go · 3 errors"})`.

## Keep

### Pane History / Timeline
- `History` command shows prior versions of the current pane as a vertical strip of mini-panes.
- Click any version to diff against current.
- Since dunno already has diff, this is mostly UI glue.

### Command Palette (via `42`)
- `42` (or `Menu`) opens a fuzzy-search palette listing all registered commands.
- For backends or local scripts injecting many commands, this is the discoverability layer.
- Transient overlay at the bottom of the active pane.

### Tab Bundles / Loadable Workspaces
- Save a single tab (its columns, panes, tags, content) as a named bundle in localStorage.
- `SaveTab plugins` dumps the current tab; `LoadTab plugins` restores it.
- Use case: pre-canned workspaces like "calculator + plot" or "backend plugin suite".
- Simpler than full session export — just one tab, not all tabs.

## Drop

- URL fetch on paste (security risk).
- Excel/TSV table paste (paste markdown directly instead).
- Capability handshake (single backend, no negotiation needed).
- Plugin sandbox / iframe mode (single user, acceptable risk).
- Presence / cursors (single user editor).
- Full session export as markdown bundle (complex, not needed).
