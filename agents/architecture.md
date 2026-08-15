# dunno — Agent Extension Guide

dunno is a tiled text editor. Right-clicking any word in a pane fires it as a command against the command registry. The registry is a `Map` from lowercase name to handler; unrecognised words are silently ignored.

`window.dunno` is the extension surface, available after the page loads. Load extension scripts after the dunno script tag.

## API

| Member | Description |
|---|---|
| `dunno.register(cmd, fn)` | Registers a right-click command. `fn` receives an editor handle for the clicked pane. |
| `dunno.getActiveEditor()` | Returns an editor handle for the active pane, or `null`. |
| `dunno.getPreviousEditor()` | Returns an editor handle for the previously active pane, or `null`. |
| `dunno.toast(msg)` | Shows a notification (3-second auto-dismiss). |
| `editor.getText()` | Returns the full pane text as a string. |
| `editor.setText(str)` | Replaces the pane content with `str`. |
| `editor.getSelection()` | Returns the text selected at right-click time (inside `register`), or the current DOM selection otherwise. |
| `editor.setTag(label)` | Sets the tag bar text of this pane. |
| `editor.setDisplay(html)` | Renders HTML into this pane, replacing the editable content (same as Preview/Plot). |
| `editor.getFilename()` | Returns the filename associated with this pane, or `null`. |
| `editor.focus()` | Moves keyboard focus to this pane. |
| `editor.split(key, tag?)` | Returns an editor handle for a persistent output pane in the same column (horizontal split). Creates on first call; reuses on subsequent calls. `key` is a string scoped to the source pane. `tag` sets the tag bar label. |
| `editor.splitLeft(key, tag?)` | Like `split`, but creates a new column to the left of the source pane's column. |
| `editor.splitRight(key, tag?)` | Like `split`, but creates a new column to the right of the source pane's column. |
| `dunno.isDark()` | Returns `true` if the dark theme is active. |
| `dunno.on(event, fn)` | Subscribe to a lifecycle event. Returns an unsubscribe function. |
| `dunno.off(event, fn)` | Remove a listener registered with `dunno.on`. |
| `dunno.remote(url)` | Open a WebSocket and auto-forward all events as JSON. |
| `dunno.remoteSend(obj)` | Send a one-off JSON message over the remote socket. |
| `dunno.remoteOff()` | Close the remote socket and stop auto-forwarding. |

Command names are case-insensitive. A registered name that matches a built-in overwrites it.

## Usage

### Register a command

1. Call `dunno.register(name, fn)`.
2. In `fn`, call `editor.getSelection()` to read the selected text.
3. Call `editor.getText()` to read the full pane text.
4. Call `editor.setText(str)` to replace the pane text.
5. Call `dunno.toast(msg)` to notify the user.

```js
dunno.register('Shout', editor => {
  const sel = editor.getSelection();
  editor.setText(sel ? sel.toUpperCase() : editor.getText().toUpperCase());
  dunno.toast('Done');
});
```

### Render HTML into a persistent output pane

1. Call `editor.split(key, tag)` to get or create an output pane.
2. Call `out.setDisplay(html)` to render HTML into it, or `out.setText(str)` for plain text.

```js
dunno.register('WordCount', editor => {
  const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
  const out = editor.split('wordcount', 'wordcount Del');
  out.setDisplay(`<p style="padding:1em">${words} words</p>`);
});
```

The output pane persists across invocations — right-clicking `WordCount` again refreshes it in place rather than opening a second pane.

### Use the previous pane as input

1. Call `dunno.getPreviousEditor()`.
2. Check the result is not `null` before use.
3. Call `getText()` to read its content.

```js
dunno.register('Diff2', editor => {
  const prev = dunno.getPreviousEditor();
  if (!prev) { dunno.toast('No previous pane'); return; }
  // compare editor.getText() with prev.getText() ...
});
```

### Read or write the active pane from outside a command

1. Call `dunno.getActiveEditor()`.
2. Check the result is not `null` before use.
3. Call `getText()` or `setText(str)` on the result.

```js
const ed = dunno.getActiveEditor();
if (ed) ed.setText(ed.getText().trim());
```

### Subscribe to lifecycle events

1. Call `dunno.on(event, fn)` — `fn` receives an editor handle for pane events, or a raw value for `theme`.
2. Store the returned function and call it to unsubscribe.
3. Or call `dunno.off(event, fn)` with the original function.

| Event | Payload | Description |
|---|---|---|
| `activate` | `editor` | Pane gained focus. |
| `change` | `editor` | Pane content changed (150 ms debounce). |
| `newpane` | `editor` | New pane created. |
| `delpane` | `editor` | Pane destroyed (fires before DOM removal). |
| `theme` | `isDark` | `true` = dark, `false` = light. |
| `command` | `(name, editor)` | After any command executes (built-in or registered). |
| `save` | `editor` | Pane saved to file (after write succeeds). |
| `load` | `editor` | File loaded into pane (after read succeeds). |
| `tab` | `(index, label)` | Workspace tab switched. |

```js
const unsub = dunno.on('change', editor => {
  if (editor.getFilename() === 'notes.md') {
    const html = window.marked.parse(editor.getText());
    editor.split('preview', 'preview Del').setDisplay(html);
  }
});

// Later: remove listener
unsub();
```

### Forward events to a server

1. Call `dunno.remote(url)` with a WebSocket URL.
2. Every dunno event is serialized and sent automatically.
3. The server receives JSON with metadata (pane id, filename, tag, text length) — not full text, to avoid flooding.
4. Call `dunno.remoteOff()` to disconnect.

```js
dunno.remote('wss://localhost:8080/dunno');

// Server sees:
// {event: 'save', pane: {id: '7', filename: 'main.go', tag: 'Del', textLength: 1420}}
// {event: 'theme', isDark: true}
// {event: 'command', name: 'Save', pane: {id: '7', ...}}
```

The socket auto-reconnects with exponential backoff (3s → 30s max).
Silently no-op if WebSocket is unavailable.
