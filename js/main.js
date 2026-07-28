import {
  createColumn, createPane,
  deletePane, splitPane, addColumn, diffPane,
  getPrev, getPane, setPaneDisplay,
  getState, restoreState,
  setPaneFile, getPaneFile, clearDirty, loadContent,
  setFileDropHandler,
} from './tiling.js';
import { register } from './commands.js';
import { parsePlotSpec, renderSVG } from './plot.js';
import { openFind, openReplace } from './find.js';
import { renderPreviewHTML } from './preview.js';
import { formatSource, resolveParser } from './format.js';
import { attachCalc } from './calc.js';
import { renderHelpHTML } from './help.js';
import { loadVersion } from './version.js';

// ── Toast notifications ────────────────────────────────────────────────────────

function _toast(msg, durationMs = 3000) {
  const el = document.createElement('div');
  el.className = 'dunno-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('dunno-toast-show'));
  setTimeout(() => {
    el.classList.remove('dunno-toast-show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, durationMs);
}

// ── Layout commands ────────────────────────────────────────────────────────────

register('Del',    ctx => deletePane(ctx.paneId));
register('New',    ctx => splitPane(ctx.paneId));
register('Newcol', ctx => addColumn(ctx.paneId));
register('Diff',   ctx => diffPane(ctx.paneId));
register('dark',   () => document.body.classList.add('dark'));
register('light',  () => document.body.classList.remove('dark'));

// ── File I/O ───────────────────────────────────────────────────────────────────

function _downloadBlob(paneId) {
  const pane = getPane(paneId);
  if (!pane) return;
  const { name } = getPaneFile(paneId) ?? {};
  const blob = new Blob([pane.jar.toString()], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: name || 'untitled.txt' });
  a.click();
  URL.revokeObjectURL(url);
}

register('Load', async ctx => {
  if (!window.showOpenFilePicker) {
    _toast('Drop a file onto this pane to load it');
    return;
  }
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
  } else {
    _downloadBlob(ctx.paneId);
  }
  _sessionSave();
});

setFileDropHandler(async (paneId, file) => {
  loadContent(paneId, await file.text());
  setPaneFile(paneId, null, file.name);
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

// ── Preview ────────────────────────────────────────────────────────────────────

register('Preview', ctx => {
  const html = renderPreviewHTML(ctx.pane.jar.toString());
  let outId = ctx.pane.previewOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.previewOutputId = outId;
    const out = getPane(outId);
    if (out) out.tagEl.textContent = 'preview Del';
  }
  setPaneDisplay(outId, html);
});

// ── Format (Prettier) ────────────────────────────────────────────────────────

register('Format', async ctx => {
  const { name } = getPaneFile(ctx.paneId) ?? {};
  const parser = resolveParser(ctx.selection, name);
  if (!parser) {
    _toast('Format: could not resolve a parser (this should not happen)');
    return;
  }
  try {
    const formatted = await formatSource(ctx.pane.jar.toString(), parser);
    ctx.pane.jar.updateCode(formatted);
  } catch (e) {
    _toast('Format failed: ' + e.message);
  }
});

// ── Calc ──────────────────────────────────────────────────────────────────────

register('Calc', ctx => {
  let outId = ctx.pane.calcOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.calcOutputId = outId;
  }
  const outPane = getPane(outId);
  if (outPane) attachCalc(outPane);
});

// ── Help ───────────────────────────────────────────────────────────────────────

register('Help', ctx => {
  let outId = ctx.pane.helpOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.helpOutputId = outId;
    const out = getPane(outId);
    if (out) out.tagEl.textContent = 'help Del';
  }
  setPaneDisplay(outId, renderHelpHTML(ctx.selection));
});

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

let _clearPending = false;
register('42clear', () => { _clearPending = true; localStorage.removeItem(KEY); location.reload(); });

function _sessionSave() {
  if (_clearPending) return;
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

const WELCOME = `dunno  —  inspired by Plan 9's Acme

Right-click any command word to execute it.
Right-click Help for commands. Select a word first for topic help.`;

async function _init() {
  await loadVersion();
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
