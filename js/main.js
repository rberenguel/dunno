import {
  createColumn, createPane,
  deletePane, splitPane, addColumn, diffPane,
  getPrev, getPane, setPaneDisplay,
  getState, restoreState,
  setPaneFile, getPaneFile, clearDirty, loadContent,
} from './tiling.js';
import { register } from './commands.js';
import { parsePlotSpec, renderSVG } from './plot.js';
import { openFind, openReplace, closeFind } from './find.js';

// ── Layout commands ────────────────────────────────────────────────────────────

register('Del',    ctx => deletePane(ctx.paneId));
register('New',    ctx => splitPane(ctx.paneId));
register('Newcol', ctx => addColumn(ctx.paneId));
register('Diff',   ctx => diffPane(ctx.paneId));
register('dark',   () => document.body.classList.add('dark'));
register('light',  () => document.body.classList.remove('dark'));

// ── File I/O ───────────────────────────────────────────────────────────────────

register('Load', async ctx => {
  if (!window.showOpenFilePicker) return;
  try {
    const [handle] = await window.showOpenFilePicker();
    const file = await handle.getFile();
    loadContent(ctx.paneId, await file.text());
    setPaneFile(ctx.paneId, handle, file.name);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
});

register('Save', async ctx => {
  const { handle } = getPaneFile(ctx.paneId) ?? {};
  if (handle) {
    await _writeToHandle(ctx.paneId, handle);
  } else if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: 'untitled.txt' });
      await _writeToHandle(ctx.paneId, h);
      setPaneFile(ctx.paneId, h, h.name ?? 'untitled.txt');
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }
  _sessionSave(); // always keep session backup current
});

register('Get', async ctx => {
  const { handle } = getPaneFile(ctx.paneId) ?? {};
  if (handle) {
    try {
      const file = await handle.getFile();
      loadContent(ctx.paneId, await file.text());
      clearDirty(ctx.paneId);
    } catch (e) { console.error(e); }
  } else {
    _sessionLoad();
  }
});

async function _writeToHandle(paneId, handle) {
  const pane = getPane(paneId);
  if (!pane) return;
  try {
    const w = await handle.createWritable();
    await w.write(pane.jar.toString());
    await w.close();
    clearDirty(paneId);
  } catch (e) { console.error(e); }
}

// ── Find / Replace ─────────────────────────────────────────────────────────────

register('Find',    ctx => openFind(ctx.pane));
register('Replace', ctx => openReplace(ctx.pane));

// ── Eval ───────────────────────────────────────────────────────────────────────

register('Eval', ctx => {
  const code = ctx.pane.jar.toString();
  const logs = [];
  const wrap = (orig, prefix = '') => (...a) => {
    orig(...a);
    logs.push(prefix + a.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
  };
  const origLog  = console.log;
  const origWarn = console.warn;
  const origErr  = console.error;
  console.log   = wrap(origLog);
  console.warn  = wrap(origWarn, 'warn: ');
  console.error = wrap(origErr,  'error: ');

  try {
    // eslint-disable-next-line no-new-func
    const ret = new Function(code)();
    if (ret !== undefined) logs.push(String(ret));
  } catch (e) {
    logs.push('! ' + e.message);
  } finally {
    console.log   = origLog;
    console.warn  = origWarn;
    console.error = origErr;
  }

  const output = logs.join('\n') || '(no output)';
  let outId = ctx.pane.evalOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.evalOutputId = outId;
    const out = getPane(outId);
    if (out) out.tagEl.textContent = 'eval-out Del';
  }
  getPane(outId)?.jar.updateCode(output);
});

// ── Plot ───────────────────────────────────────────────────────────────────────

register('Plot', ctx => {
  const dataPane = getPrev();
  if (!dataPane || dataPane.id === ctx.paneId) return;

  const spec = parsePlotSpec(ctx.pane.jar.toString());
  const svg  = renderSVG(spec, dataPane.jar.toString());

  let outId = ctx.pane.plotOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.plotOutputId = outId;
    const out = getPane(outId);
    if (out) out.tagEl.textContent = 'plot-out Del';
  }
  setPaneDisplay(outId, svg);
});

// ── Persistence (session) ──────────────────────────────────────────────────────

const KEY = 'dunno-state';

function _sessionSave() {
  try {
    const state = getState();
    state.dark = document.body.classList.contains('dark');
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

function _sessionLoad() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    document.body.classList.toggle('dark', state.dark ?? true);
    restoreState(state);
    return true;
  } catch { return false; }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const WELCOME = `dunno

Right-click any command word to execute it.
Works in this body text too, not just the tag bar.

Layout:   Del  New  Newcol
Tools:    Diff  Plot  Eval
File:     Load  Save  Get
Find:     Find  Replace
Theme:    dark  light

──

Load: load a file into this pane (File System Access API).
Save: write this pane to its file, or prompt for a filename.
Get:  reload this pane from its file (or restore session).
Eval: run this pane as JS; stdout → split pane below.
Find/Replace: search (and replace) text in this pane.
Diff: compare against the previously active pane.
Plot: render a gnuplot-compatible spec using prev pane as data.`;

function _init() {
  if (!_sessionLoad()) {
    const col = createColumn();
    createPane(col, WELCOME);
  }
}

window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); _sessionSave(); }
});
window.addEventListener('beforeunload', _sessionSave);
setInterval(_sessionSave, 30_000);

_init();
