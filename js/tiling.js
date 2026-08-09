import { CodeJar }           from '../libs/codejar.js';
import { isCommand, execute } from './commands.js';
import { diffLines }          from './diff.js';
import { makeHighlighter }    from './highlight.js';

let _id = 0;
const uid = () => String(++_id);

const _hesc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const _cols  = new Map(); // id -> { id, el, paneIds }
const _panes = new Map(); // id -> pane object
let _colOrder     = [];
let _activeId     = null;
let _prevActiveId = null;

// Pane IDs currently being loaded (suppress dirty during programmatic updates).
const _suppressDirtyFor = new Set();

const _layout = () => document.getElementById('layout');

let _dirtyCb = null;
export function setDirtyCallback(fn) { _dirtyCb = fn; }

// Capture selection on right-mousedown before the browser collapses it.
let _rightClickSel = null;

// File drop handler set by main.js.
let _fileDropHandler = null;
export function setFileDropHandler(fn) { _fileDropHandler = fn; }
document.addEventListener('mousedown', e => {
  if (e.button === 2) _rightClickSel = window.getSelection?.()?.toString().trim() || null;
}, true);

// ── Long-press → command (mobile) ──────────────────────────────────────────────
const LONG_PRESS_MS = 500;

function _addLongPress(el, paneId) {
  let timer = null;
  let startX, startY;
  // Suppress the browser context menu that follows a long-press touch.
  let _suppressNext = false;

  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    // Capture selection at touch start, same as mousedown for right-click.
    _rightClickSel = window.getSelection?.()?.toString().trim() || null;
    timer = setTimeout(() => {
      timer = null;
      _suppressNext = true;
      _onContextMenu({ clientX: startX, clientY: startY, preventDefault: () => {} }, paneId);
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
      clearTimeout(timer); timer = null;
    }
  }, { passive: true });

  const _cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('touchend',    _cancel, { passive: true });
  el.addEventListener('touchcancel', _cancel, { passive: true });

  el.addEventListener('contextmenu', e => {
    if (_suppressNext) { _suppressNext = false; e.preventDefault(); }
  });
}

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

export function getAllPanes() {
  return Array.from(_panes.values()).filter(p => !p.transient);
}

export function isAnyPaneDirty() {
  for (const p of _panes.values()) if (p.dirty) return true;
  return false;
}

export function resetLayout() {
  _layout().innerHTML = '';
  _cols.clear();
  _panes.clear();
  _colOrder = [];
  _activeId = null;
  _prevActiveId = null;
}

export function toggleLineNumbers(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return false;
  pane.showLineNums = !pane.showLineNums;
  pane.el.classList.toggle('show-nums', pane.showLineNums);
  pane.lineNumEl.hidden = !pane.showLineNums;
  if (pane.showLineNums) {
    const lines = pane.jar.toString().split('\n').length;
    pane.lineNumEl.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
  }
  return pane.showLineNums;
}

export function toggleRuler(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return false;
  pane.showRuler = !pane.showRuler;
  pane.el.classList.toggle('show-ruler', pane.showRuler);
  return pane.showRuler;
}

export function toggleLock(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return false;
  pane.locked = !pane.locked;
  pane.editorEl.contentEditable = pane.locked ? 'false' : 'true';
  pane.lockEl.hidden = !pane.locked;
  return pane.locked;
}

export function setHighlightLang(paneId, lang) {
  const pane = _panes.get(paneId);
  if (!pane) return false;
  pane.highlightLang = lang;
  if (lang && window.Prism) {
    pane.jar.updateCode(pane.jar.toString());
  }
  return true;
}

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
  if (_dirtyCb) _dirtyCb(paneId);
}

export function clearDirty(paneId) {
  const pane = _panes.get(paneId);
  if (!pane) return;
  pane.dirty = false;
  pane.dirtyEl.hidden = true;
  if (_dirtyCb) _dirtyCb(paneId);
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

export function createColumnBefore(colId) {
  const id = uid();
  const el = document.createElement('div');
  el.className = 'column';
  el.dataset.colId = id;
  const ref = _cols.get(colId);
  if (ref) {
    ref.el.before(el);
    const idx = _colOrder.indexOf(colId);
    _colOrder.splice(idx, 0, id);
  } else {
    _layout().prepend(el);
    _colOrder.unshift(id);
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

export function rebuildColHandles() { _rebuildColHandles(); }

// Proportionally scale every column except exceptColId to fill the remaining
// space after exceptColId's width is reserved. Needed when inserting a fixed-
// width column (e.g. TOC) so existing columns don't overflow or leave a gap.
export function normalizeColWidths(exceptColId) {
  const otherEls = _colOrder
    .filter(id => id !== exceptColId)
    .map(id => _cols.get(id)?.el)
    .filter(Boolean);
  if (!otherEls.length) return;
  // Only redistribute if every other column already has an explicit flex-basis
  // (i.e. the user has dragged a resize handle). Auto-sized columns don't need
  // adjustment — the browser's flex algorithm already fills the available space.
  if (!otherEls.every(el => el.style.flexBasis !== '')) return;
  const layout = _layout();
  if (!layout) return;
  const totalW   = layout.getBoundingClientRect().width;
  const exceptEl = _cols.get(exceptColId)?.el;
  const exceptW  = exceptEl ? exceptEl.getBoundingClientRect().width : 0;
  const available = totalW - exceptW;
  if (available <= 0) return;
  const currentTotal = otherEls.reduce((s, el) => s + el.getBoundingClientRect().width, 0);
  if (currentTotal <= 0) return;
  const scale = available / currentTotal;
  otherEls.forEach(el => {
    el.style.flex = `0 0 ${Math.round(el.getBoundingClientRect().width * scale)}px`;
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

  const lockEl = document.createElement('span');
  lockEl.className = 'pane-lock';
  lockEl.textContent = '🔒';
  lockEl.hidden = true;

  tagEl.className       = 'pane-tag';
  tagEl.contentEditable = 'true';
  tagEl.spellcheck      = false;
  tagEl.textContent     = tagText ?? 'Del New Newcol Help';
  tagEl.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

  bodyEl.className   = 'pane-body';
  editorEl.className = 'editor';

  const lineNumEl = document.createElement('div');
  lineNumEl.className = 'line-gutter';
  lineNumEl.hidden = true;

  bodyEl.appendChild(editorEl);
  bodyEl.appendChild(lineNumEl);
  tagBarEl.appendChild(filenameEl);
  tagBarEl.appendChild(dirtyEl);
  tagBarEl.appendChild(lockEl);
  tagBarEl.appendChild(tagEl);
  el.appendChild(tagBarEl);
  el.appendChild(bodyEl);
  col.el.appendChild(el);
  col.paneIds.push(id);

  let _extraHighlight = null;
  let pane = null;

  function _updateLineNumbers() {
    const lines = pane.jar.toString().split('\n').length;
    pane.lineNumEl.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
  }

  function _doHighlight(editor, _pos) {
    if (pane && pane.highlightLang && window.Prism) {
      const grammar = window.Prism.languages[pane.highlightLang];
      if (grammar) {
        const text = editor.textContent;
        const html = window.Prism.highlight(text, grammar, pane.highlightLang);
        editor.innerHTML = html;
        if (pane.highlightLang === 'markdown') {
          editor.querySelectorAll('.token.title.important').forEach(el => {
            const punc = el.querySelector('.token.punctuation');
            if (!punc) return;
            const m = punc.textContent.match(/^(#+)/);
            if (m) el.dataset.mdLevel = Math.min(m[1].length, 6);
          });
          editor.querySelectorAll('.token.code-snippet').forEach(el => {
            const raw = el.textContent;
            const m = raw.match(/^(`+)([\s\S]*?)\1$/);
            if (!m) return;
            const bt = _hesc(m[1]);
            const inner = _hesc(m[2]);
            el.innerHTML = `<span class="md-bt">${bt}</span><span class="md-code-inner">${inner}</span><span class="md-bt">${bt}</span>`;
          });
        }
      }
    }
    if (_extraHighlight) _extraHighlight(editor);
    if (pane && pane.showLineNums) _updateLineNumbers();
  }

  _suppressDirtyFor.add(id);
  const jar = CodeJar(editorEl, _doHighlight, { tab: '  ', preserveIdent: true, addClosing: false, catchTab: true, history: true });
  editorEl.style.overflowY = 'visible';
  if (content) jar.updateCode(content);
  _suppressDirtyFor.delete(id);

  tagBarEl.addEventListener('contextmenu', e => _onContextMenu(e, id));
  editorEl.addEventListener('contextmenu', e => _onContextMenu(e, id));
  bodyEl.addEventListener('contextmenu',   e => { if (!editorEl.contains(e.target)) _onContextMenu(e, id); });
  _addLongPress(tagBarEl, id);
  _addLongPress(editorEl, id);
  _addLongPress(bodyEl,   id);
  tagBarEl.addEventListener('mousedown',   () => _setActive(id));
  editorEl.addEventListener('mousedown',   () => _setActive(id));
  editorEl.addEventListener('input',       () => { if (!_suppressDirtyFor.has(id)) _markDirty(id); });

  bodyEl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  bodyEl.addEventListener('drop', e => {
    e.preventDefault();
    _setActive(id);
    const file = e.dataTransfer.files[0];
    if (file && _fileDropHandler) _fileDropHandler(id, file);
  });

  pane = {
    id, colId, el, tagBarEl, filenameEl, dirtyEl, lockEl, tagEl, bodyEl, editorEl, jar, lineNumEl,
    mode: 'edit', savedContent: null,
    dirty: false, fileHandle: null, filename: null,
    plotOutputId: null, evalOutputId: null,
    showLineNums: false, showRuler: false, fontSize: null, locked: false,
    highlightLang: null,
    setHighlight: fn => { _extraHighlight = fn; },
  };
  _panes.set(id, pane);
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

// Toggle the relationship between the current pane and the previously active
// pane: if they're stacked together in one column, pull the current pane out
// into its own new column (vertical -> horizontal). If they're already in
// separate columns, trade places exactly: each takes over the other's slot,
// so column sizes are unchanged (horizontal -> vertical, or just reordering).
export function swapPane(paneId) {
  const pane = _panes.get(paneId);
  const prev = _panes.get(_prevActiveId);
  if (!pane || !prev || pane === prev) return;

  const oldColId  = pane.colId;
  const prevColId = prev.colId;

  if (oldColId === prevColId) {
    // Same column -> promote `pane` into its own new column.
    const oldCol = _cols.get(oldColId);
    oldCol.paneIds = oldCol.paneIds.filter(id => id !== paneId);

    const newColId = createColumn(oldColId);
    const newCol   = _cols.get(newColId);
    newCol.el.appendChild(pane.el);
    newCol.paneIds.push(paneId);
    pane.colId = newColId;

    _rebuildPaneHandles(oldColId);
    _rebuildPaneHandles(newColId);
    if (oldCol.paneIds.length === 0) _deleteColumn(oldColId);
  } else {
    // Different columns -> exchange slots exactly, no folding/merging.
    const oldCol  = _cols.get(oldColId);
    const prevCol = _cols.get(prevColId);
    const oldIdx  = oldCol.paneIds.indexOf(paneId);
    const prevIdx = prevCol.paneIds.indexOf(prev.id);

    // Swap the two DOM nodes in place (classic parent/nextSibling swap).
    const parentA = pane.el.parentNode, nextA = pane.el.nextSibling;
    const parentB = prev.el.parentNode, nextB = prev.el.nextSibling;
    parentB.insertBefore(pane.el, nextB);
    parentA.insertBefore(prev.el, nextA);

    oldCol.paneIds[oldIdx]   = prev.id;
    prevCol.paneIds[prevIdx] = paneId;
    pane.colId = prevColId;
    prev.colId = oldColId;

    _rebuildPaneHandles(oldColId);
    _rebuildPaneHandles(prevColId);
  }

  _rebuildColHandles();
  _setActive(paneId);
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
  pane.transient = true;
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
  for (const [id, col] of _cols) {
    const paneIds = col.paneIds.filter(pid => !_panes.get(pid)?.transient);
    if (paneIds.length === 0) continue;
    state.cols[id] = { paneIds, flexBasis: col.el.style.flexBasis || null };
  }
  state.colOrder = state.colOrder.filter(id => state.cols[id]);
  for (const [id, pane] of _panes) {
    if (pane.transient) continue;
    state.panes[id] = {
      colId:     pane.colId,
      tag:       pane.tagEl.textContent,
      content:   pane.mode === 'diff' ? (pane.savedContent ?? '') : pane.jar.toString(),
      filename:  pane.filename || null,
      flexBasis: pane.el.style.flexBasis || null,
      isCalc:    pane.isCalc || false,
      showLineNums: pane.showLineNums || false,
      showRuler: pane.showRuler || false,
      fontSize:  pane.fontSize || null,
      locked:    pane.locked || false,
      highlightLang: pane.highlightLang || null,
      tocActive: pane.tocActive || false,
    };
  }
  return state;
}

export function restoreState(state, onPaneRestored) {
  _layout().innerHTML = '';
  _cols.clear(); _panes.clear();
  _colOrder = []; _activeId = null; _prevActiveId = null;
  if (!state || !state.colOrder) return;

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
      if (p.fontSize) {
        pane.fontSize = p.fontSize;
        pane.editorEl.style.fontSize = p.fontSize + 'px';
      }
      if (p.showRuler) {
        pane.showRuler = true;
        pane.el.classList.add('show-ruler');
      }
      if (p.locked) {
        pane.locked = true;
        pane.editorEl.contentEditable = 'false';
        pane.lockEl.hidden = false;
      }
      if (p.highlightLang) {
        pane.highlightLang = p.highlightLang;
      }
      if (onPaneRestored) onPaneRestored(pane, p);
    }
    _rebuildPaneHandles(newColId);
  }
  _rebuildColHandles();
}
