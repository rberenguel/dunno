import { CodeJar }           from '../libs/codejar.js';
import { isCommand, execute } from './commands.js';
import { diffLines }          from './diff.js';

let _id = 0;
const uid = () => String(++_id);

const _cols  = new Map(); // id -> { id, el, paneIds }
const _panes = new Map(); // id -> pane object
let _colOrder     = [];
let _activeId     = null;
let _prevActiveId = null;

// Pane IDs currently being loaded (suppress dirty during programmatic updates).
const _suppressDirtyFor = new Set();

const _layout = () => document.getElementById('layout');

// Capture selection on right-mousedown before the browser collapses it.
let _rightClickSel = null;

// File drop handler set by main.js.
let _fileDropHandler = null;
export function setFileDropHandler(fn) { _fileDropHandler = fn; }
document.addEventListener('mousedown', e => {
  if (e.button === 2) _rightClickSel = window.getSelection?.()?.toString().trim() || null;
}, true);

// ── Word detection ─────────────────────────────────────────────────────────────

function _wordAtPoint(x, y) {
  let node, offset;
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r) return null;
    node = r.startContainer; offset = r.startOffset;
  } else {
    const pos = document.caretPositionFromPoint?.(x, y);
    if (!pos) return null;
    node = pos.offsetNode; offset = pos.offset;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent;
  let s = offset, e = offset;
  while (s > 0 && /\w/.test(text[s - 1])) s--;
  while (e < text.length && /\w/.test(text[e])) e++;
  return text.slice(s, e) || null;
}

// ── Active tracking ────────────────────────────────────────────────────────────

function _setActive(id) {
  if (_activeId === id) return;
  if (_activeId) _panes.get(_activeId)?.el.classList.remove('active');
  _prevActiveId = _activeId;
  _activeId = id;
  _panes.get(id)?.el.classList.add('active');
}

export const getActive   = () => _panes.get(_activeId);
export const getPrev     = () => _panes.get(_prevActiveId);
export const getPane     = id => _panes.get(id);
export const getActiveId = () => _activeId;

// ── Context menu ───────────────────────────────────────────────────────────────

const _reEdSub = /^s(.)(.+?)\1(.*?)\1([gi]*)$/;

function _tryEdSubstitute(paneId, sel) {
  if (!sel) return false;
  const m = sel.match(_reEdSub);
  if (!m) return false;
  const pane = _panes.get(paneId);
  if (!pane) return false;
  let re;
  try { re = new RegExp(m[2], m[4] || ''); } catch { return false; }
  const next = pane.jar.toString().replace(re, m[3]);
  if (next === pane.jar.toString()) return true; // matched syntax, just no change
  _suppressDirtyFor.add(paneId);
  pane.jar.updateCode(next);
  _suppressDirtyFor.delete(paneId);
  _markDirty(paneId);
  return true;
}

function _onContextMenu(e, paneId) {
  const sel = _rightClickSel;
  if (_tryEdSubstitute(paneId, sel)) { e.preventDefault(); return; }
  const word = _wordAtPoint(e.clientX, e.clientY);
  if (word && isCommand(word)) {
    e.preventDefault();
    execute(word, { paneId, pane: _panes.get(paneId), selection: sel });
  }
}

// ── Dirty / file tracking ──────────────────────────────────────────────────────

function _markDirty(paneId) {
  const pane = _panes.get(paneId);
  if (!pane || pane.dirty) return;
  pane.dirty = true;
  pane.dirtyEl.hidden = false;
}

export function clearDirty(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return;
  pane.dirty = false;
  pane.dirtyEl.hidden = true;
}

export function setPaneFile(paneId, handle, name) {
  const pane = _panes.get(paneId);
  if (!pane) return;
  pane.fileHandle = handle;
  pane.filename   = name;
  pane.filenameEl.textContent = name;
  pane.filenameEl.hidden = false;
  clearDirty(paneId);
}

export function getPaneFile(paneId) {
  const pane = _panes.get(paneId);
  return pane ? { handle: pane.fileHandle, name: pane.filename } : null;
}

// Wrap jar.updateCode() without marking dirty (e.g. opening/reloading a file).
export function loadContent(paneId, text) {
  const pane = _panes.get(paneId);
  if (!pane) return;
  _suppressDirtyFor.add(paneId);
  pane.jar.updateCode(text);
  _suppressDirtyFor.delete(paneId);
}

// ── Columns ────────────────────────────────────────────────────────────────────

export function createColumn(afterColId = null) {
  const id = uid();
  const el = document.createElement('div');
  el.className = 'column';
  el.dataset.colId = id;

  if (afterColId && _cols.has(afterColId)) {
    _cols.get(afterColId).el.after(el);
    const idx = _colOrder.indexOf(afterColId);
    _colOrder.splice(idx + 1, 0, id);
  } else {
    _layout().appendChild(el);
    _colOrder.push(id);
  }

  _cols.set(id, { id, el, paneIds: [] });
  return id;
}

function _deleteColumn(colId) {
  _cols.get(colId)?.el.remove();
  _cols.delete(colId);
  _colOrder = _colOrder.filter(id => id !== colId);
}

// ── Resize handles ─────────────────────────────────────────────────────────────

function _initVResize(handle, colId) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const col = _cols.get(colId);
    if (!col) return;
    const paneEls    = col.paneIds.map(id => _panes.get(id)?.el).filter(Boolean);
    const handleEls  = Array.from(col.el.querySelectorAll('.resize-v'));
    const handleIdx  = handleEls.indexOf(handle);
    if (handleIdx < 0) return;
    const heights = paneEls.map(el => el.getBoundingClientRect().height);
    const startY  = e.clientY;
    const aboveH  = heights[handleIdx];
    const belowH  = heights[handleIdx + 1];

    const onMove = ev => {
      const dy       = ev.clientY - startY;
      const newAbove = Math.max(40, aboveH + dy);
      const newBelow = Math.max(40, belowH - dy);
      paneEls.forEach((el, i) => {
        if      (i === handleIdx)     el.style.flex = `0 0 ${newAbove}px`;
        else if (i === handleIdx + 1) el.style.flex = `0 0 ${newBelow}px`;
        else                          el.style.flex = `0 0 ${heights[i]}px`;
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function _rebuildPaneHandles(colId) {
  const col = _cols.get(colId);
  if (!col) return;
  col.el.querySelectorAll('.resize-v').forEach(h => h.remove());
  const paneEls = col.paneIds.map(id => _panes.get(id)?.el).filter(Boolean);
  if (paneEls.length === 1) {
    paneEls[0].style.flex = '';
    return;
  }
  for (let i = 0; i < paneEls.length - 1; i++) {
    const h = document.createElement('div');
    h.className = 'resize-v';
    paneEls[i].after(h);
    _initVResize(h, colId);
  }
}

function _initHResize(handle) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const colEls   = _colOrder.map(id => _cols.get(id)?.el).filter(Boolean);
    const handleEls = Array.from(_layout().querySelectorAll('.resize-h'));
    const handleIdx = handleEls.indexOf(handle);
    if (handleIdx < 0) return;
    const widths = colEls.map(el => el.getBoundingClientRect().width);
    const startX = e.clientX;
    const leftW  = widths[handleIdx];
    const rightW = widths[handleIdx + 1];

    const onMove = ev => {
      const dx      = ev.clientX - startX;
      const newLeft = Math.max(100, leftW + dx);
      const newRight = Math.max(100, rightW - dx);
      colEls.forEach((el, i) => {
        if      (i === handleIdx)     el.style.flex = `0 0 ${newLeft}px`;
        else if (i === handleIdx + 1) el.style.flex = `0 0 ${newRight}px`;
        else                          el.style.flex = `0 0 ${widths[i]}px`;
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function _rebuildColHandles() {
  _layout().querySelectorAll('.resize-h').forEach(h => h.remove());
  const colEls = _colOrder.map(id => _cols.get(id)?.el).filter(Boolean);
  if (colEls.length === 1) {
    colEls[0].style.flex = '';
    return;
  }
  for (let i = 0; i < colEls.length - 1; i++) {
    const h = document.createElement('div');
    h.className = 'resize-h';
    colEls[i].after(h);
    _initHResize(h);
  }
}

// ── Panes ──────────────────────────────────────────────────────────────────────

export function createPane(colId, content = '', tagText = null) {
  const id  = uid();
  const col = _cols.get(colId);
  if (!col) return null;

  const el         = document.createElement('div');
  const tagBarEl   = document.createElement('div');
  const filenameEl = document.createElement('span');
  const dirtyEl    = document.createElement('span');
  const tagEl      = document.createElement('div');
  const bodyEl     = document.createElement('div');
  const editorEl   = document.createElement('div');

  el.className       = 'pane';
  el.dataset.paneId  = id;

  tagBarEl.className = 'pane-tag-bar';

  filenameEl.className = 'pane-filename';
  filenameEl.hidden    = true;

  dirtyEl.className  = 'pane-dirty';
  dirtyEl.textContent = '·';
  dirtyEl.hidden     = true;

  tagEl.className       = 'pane-tag';
  tagEl.contentEditable = 'true';
  tagEl.spellcheck      = false;
  tagEl.textContent     = tagText ?? 'Del New Newcol Help';
  tagEl.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

  bodyEl.className   = 'pane-body';
  editorEl.className = 'editor';

  bodyEl.appendChild(editorEl);
  tagBarEl.appendChild(filenameEl);
  tagBarEl.appendChild(dirtyEl);
  tagBarEl.appendChild(tagEl);
  el.appendChild(tagBarEl);
  el.appendChild(bodyEl);
  col.el.appendChild(el);
  col.paneIds.push(id);

  _suppressDirtyFor.add(id);
  const jar = CodeJar(editorEl, () => {
    if (!_suppressDirtyFor.has(id)) _markDirty(id);
  }, { tab: '  ', preserveIdent: true, addClosing: false, catchTab: true, history: true });
  editorEl.style.overflowY = 'visible';
  if (content) jar.updateCode(content);
  _suppressDirtyFor.delete(id);

  tagBarEl.addEventListener('contextmenu', e => _onContextMenu(e, id));
  editorEl.addEventListener('contextmenu', e => _onContextMenu(e, id));
  bodyEl.addEventListener('contextmenu',   e => { if (!editorEl.contains(e.target)) _onContextMenu(e, id); });
  tagBarEl.addEventListener('mousedown',   () => _setActive(id));
  editorEl.addEventListener('mousedown',   () => _setActive(id));

  bodyEl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  bodyEl.addEventListener('drop', e => {
    e.preventDefault();
    _setActive(id);
    const file = e.dataTransfer.files[0];
    if (file && _fileDropHandler) _fileDropHandler(id, file);
  });

  _panes.set(id, {
    id, colId, el, tagBarEl, filenameEl, dirtyEl, tagEl, bodyEl, editorEl, jar,
    mode: 'edit', savedContent: null,
    dirty: false, fileHandle: null, filename: null,
    plotOutputId: null, evalOutputId: null,
  });
  _setActive(id);
  return id;
}

export function deletePane(paneId) {
  if (_panes.size <= 1) return;
  const pane = _panes.get(paneId);
  if (!pane) return;
  const colId = pane.colId;
  const col   = _cols.get(colId);

  pane.el.remove();
  _panes.delete(paneId);
  if (col) col.paneIds = col.paneIds.filter(id => id !== paneId);

  if (col && col.paneIds.length === 0) {
    _deleteColumn(colId);
    _rebuildColHandles();
  } else {
    _rebuildPaneHandles(colId);
  }

  if (_activeId === paneId) {
    _activeId = null;
    const first = _panes.values().next().value;
    if (first) { _setActive(first.id); first.editorEl.focus(); }
  }
}

export function splitPane(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return;
  const newId   = createPane(pane.colId);
  const newPane = _panes.get(newId);
  const col     = _cols.get(pane.colId);

  pane.el.after(newPane.el);
  col.paneIds = col.paneIds.filter(id => id !== newId);
  const idx = col.paneIds.indexOf(paneId);
  col.paneIds.splice(idx + 1, 0, newId);

  _rebuildPaneHandles(pane.colId);
  newPane.editorEl.focus();
  return newId;
}

export function addColumn(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return;
  const newColId = createColumn(pane.colId);
  createPane(newColId);
  _rebuildColHandles();
}

// ── Diff ───────────────────────────────────────────────────────────────────────

const EDITOR_LINE_H = 14 * 1.7;
const EDITOR_PAD_T  = 14;

function _exitDiff(pane) {
  pane.bodyEl.querySelector('.diff-gutter')?.remove();
  pane.mode = 'edit';
}

export function diffPane(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return;

  if (pane.mode === 'diff') { _exitDiff(pane); return; }

  const other = _panes.get(_prevActiveId);
  if (!other || other.id === paneId) return;

  const hunks = diffLines(pane.jar.toString(), other.jar.toString());

  const gutterEl = document.createElement('div');
  gutterEl.className = 'diff-gutter';
  gutterEl.addEventListener('click', () => _exitDiff(pane));

  let lineIdx = 0;
  for (const h of hunks) {
    if (h.type === 'eq') {
      lineIdx++;
    } else if (h.type === 'del') {
      const mark = document.createElement('div');
      mark.className = 'diff-mark diff-mark-del';
      mark.style.top    = `${EDITOR_PAD_T + lineIdx * EDITOR_LINE_H}px`;
      mark.style.height = `${EDITOR_LINE_H}px`;
      gutterEl.appendChild(mark);
      lineIdx++;
    } else {
      const mark = document.createElement('div');
      mark.className = 'diff-mark diff-mark-ins';
      mark.style.top    = `${EDITOR_PAD_T + lineIdx * EDITOR_LINE_H - 2}px`;
      mark.style.height = `4px`;
      gutterEl.appendChild(mark);
    }
  }

  pane.bodyEl.appendChild(gutterEl);
  pane.mode = 'diff';
}

// ── Display pane (plot output etc.) ───────────────────────────────────────────

export function setPaneDisplay(paneId, html) {
  const pane = _panes.get(paneId);
  if (!pane) return;
  pane.editorEl.style.display = 'none';
  let el = pane.bodyEl.querySelector('.pane-display');
  if (!el) {
    el = document.createElement('div');
    el.className = 'pane-display';
    pane.bodyEl.appendChild(el);
  }
  el.innerHTML = html;
}

// ── State serialisation ────────────────────────────────────────────────────────

export function getState() {
  const state = { colOrder: [..._colOrder], cols: {}, panes: {} };
  for (const [id, col] of _cols)
    state.cols[id] = {
      paneIds:   [...col.paneIds],
      flexBasis: col.el.style.flexBasis || null,
    };
  for (const [id, pane] of _panes)
    state.panes[id] = {
      colId:     pane.colId,
      tag:       pane.tagEl.textContent,
      content:   pane.mode === 'diff' ? (pane.savedContent ?? '') : pane.jar.toString(),
      filename:  pane.filename || null,
      flexBasis: pane.el.style.flexBasis || null,
    };
  return state;
}

export function restoreState(state) {
  _layout().innerHTML = '';
  _cols.clear(); _panes.clear();
  _colOrder = []; _activeId = null; _prevActiveId = null;

  for (const colId of state.colOrder) {
    const colData = state.cols[colId];
    if (!colData) continue;
    const newColId = createColumn();
    const col = _cols.get(newColId);
    if (colData.flexBasis && col) col.el.style.flex = `0 0 ${colData.flexBasis}`;

    for (const paneId of colData.paneIds) {
      const p = state.panes[paneId];
      if (!p) continue;
      const newPaneId = createPane(newColId, p.content, p.tag);
      if (!newPaneId) continue;
      const pane = _panes.get(newPaneId);
      if (!pane) continue;
      if (p.flexBasis) pane.el.style.flex = `0 0 ${p.flexBasis}`;
      if (p.filename) {
        pane.filename = p.filename;
        pane.filenameEl.textContent = p.filename;
        pane.filenameEl.hidden = false;
      }
      clearDirty(newPaneId);
    }
    _rebuildPaneHandles(newColId);
  }
  _rebuildColHandles();
}
