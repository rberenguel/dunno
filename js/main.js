import {
  createColumn, createColumnBefore, createPane, rebuildColHandles, normalizeColWidths,
  deletePane, splitPane, addColumn, swapPane, diffPane,
  getPrev, getPane, setPaneDisplay,
  getState, restoreState, resetLayout,
  setPaneFile, getPaneFile, clearDirty, loadContent,
  setFileDropHandler,
  toggleLineNumbers, toggleRuler, toggleLock, setHighlightLang,
  getAllPanes, isAnyPaneDirty, setDirtyCallback,
  getActive,
} from './tiling.js';
import {
  init,
  createTab,
  closeTab,
  switchTab,
  saveActiveState,
  getActiveState,
  getAllStates,
  markDirty,
  clearTabDirty,
  isTabDirty,
  setLabel,
  saveAll,
  importWorkspaces,
  tabCount,
  getActiveIndex,
} from './tabs.js';
import { register } from './commands.js';
import { parsePlotSpec, renderSVG } from './plot.js';
import { openFind, openReplace } from './find.js';
import { renderPreviewHTML } from './preview.js';
import { formatSource, resolveParser } from './format.js';
import { resolvePrismLang } from './highlight.js';
import { parseRecipe, buildTable, exportToCanvas } from './recipe.js';
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

function _syncTabDirty() {
  if (isAnyPaneDirty()) markDirty(); else clearTabDirty();
}

function _onPaneRestored(pane, saved) {
  if (saved.isCalc) attachCalc(pane);
  if (saved.showLineNums) toggleLineNumbers(pane.id);
  if (saved.highlightLang) setHighlightLang(pane.id, saved.highlightLang);
  // Rebuild TOC after the full layout is restored so all columns exist and
  // getBoundingClientRect() returns accurate widths for normalisation.
  if (saved.tocActive) requestAnimationFrame(() => _buildToc(pane, true));
}

// ── Modal ───────────────────────────────────────────────────────────────────────

let _modalResolve = null;

function _showModal(msg) {
  const overlay = document.getElementById('modal');
  const msgEl   = document.getElementById('modal-msg');
  if (!overlay) return Promise.resolve(true);
  msgEl.textContent = msg;
  overlay.classList.remove('hidden');
  return new Promise(resolve => { _modalResolve = resolve; });
}

function _hideModal(result) {
  const overlay = document.getElementById('modal');
  if (overlay) overlay.classList.add('hidden');
  if (_modalResolve) { _modalResolve(result); _modalResolve = null; }
}

function _setupModal() {
  document.getElementById('modal-confirm')?.addEventListener('click', () => _hideModal(true));
  document.getElementById('modal-cancel')?.addEventListener('click', () => _hideModal(false));
  document.getElementById('modal')?.addEventListener('click', e => {
    if (e.target.id === 'modal') _hideModal(false);
  });
}

// ── Layout commands ────────────────────────────────────────────────────────────

register('Del',    ctx => {
  if (ctx.pane.tocSourcePaneId) {
    const src = getPane(ctx.pane.tocSourcePaneId);
    if (src) src.tocActive = false;
  }
  deletePane(ctx.paneId);
});
register('New',    ctx => splitPane(ctx.paneId));
register('Newcol', ctx => addColumn(ctx.paneId));
register('Swap',   ctx => swapPane(ctx.paneId));
register('Diff',   ctx => diffPane(ctx.paneId));
register('Tab',    () => {
  const state = getState();
  state.dark = document.body.classList.contains('dark');
  saveActiveState(state);
  createTab();
  resetLayout();
  const col = createColumn();
  createPane(col);
  _syncTabDirty();
});
register('Deltab', () => {
  if (tabCount() <= 1) { _toast('Cannot close the last tab'); return; }
  const state = getState();
  state.dark = document.body.classList.contains('dark');
  saveActiveState(state);
  const idx = getActiveIndex();
  closeTab(idx);
  resetLayout();
  const next = getActiveState();
  if (next) {
    document.body.classList.toggle('dark', next.dark ?? true);
    restoreState(next, _onPaneRestored);
  } else {
    const col = createColumn();
    createPane(col);
  }
  _syncTabDirty();
});
register('Nametab', ctx => {
  const name = (ctx.selection || '').trim();
  if (!name) { _toast('Select a name first, then right-click Nametab'); return; }
  setLabel(getActiveIndex(), name);
  _toast('Tab: ' + name);
});
register('Zoom',   ctx => {
  const was = ctx.pane.el.classList.contains('zoomed');
  document.querySelectorAll('.pane.zoomed').forEach(el => el.classList.remove('zoomed'));
  if (!was) ctx.pane.el.classList.add('zoomed');
});
register('Nums',   ctx => {
  const on = toggleLineNumbers(ctx.paneId);
  _toast(on ? 'Line numbers on' : 'Line numbers off');
});
function _formatTimestamp(d, timeZone, withZoneName) {
  const opts = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  };
  if (timeZone) opts.timeZone = timeZone;
  if (withZoneName) opts.timeZoneName = 'short';
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value;
  let s = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  const zn = get('timeZoneName');
  if (zn) s += ` ${zn}`;
  return s;
}

const _TZ_MAP = {
  'pst': 'America/Los_Angeles', 'pdt': 'America/Los_Angeles',
  'pacific': 'America/Los_Angeles', 'sunnyvale': 'America/Los_Angeles',
  'est': 'America/New_York', 'edt': 'America/New_York',
  'eastern': 'America/New_York',
  'cst': 'America/Chicago', 'cdt': 'America/Chicago',
  'central': 'America/Chicago',
  'mst': 'America/Denver', 'mdt': 'America/Denver',
  'mountain': 'America/Denver',
  'utc': 'UTC', 'gmt': 'UTC',
  'local': undefined,
};

register('Now',    ctx => {
  const sel = (ctx.selection || '').trim().toLowerCase();
  const tz = _TZ_MAP[sel];
  const withName = tz !== undefined && sel !== 'local';
  const now = _formatTimestamp(new Date(), tz, withName);
  ctx.pane.editorEl.focus();
  document.execCommand('insertText', false, now);
});
register('Copy',   async ctx => {
  try {
    await navigator.clipboard.writeText(ctx.pane.jar.toString());
    _toast('Copied to clipboard');
  } catch (e) { _toast('Copy failed'); }
});
register('Grep',   ctx => {
  const pattern = ctx.selection;
  if (!pattern) { _toast('Select a pattern first, then right-click Grep'); return; }
  let re;
  try { re = new RegExp(pattern, 'gi'); } catch (e) {
    _toast('Invalid regex: ' + e.message);
    return;
  }
  const results = [];
  for (const pane of getAllPanes()) {
    const text = pane.jar.toString();
    const lines = text.split('\n');
    const matches = [];
    lines.forEach((line, idx) => {
      re.lastIndex = 0;
      if (re.test(line)) matches.push({ line: idx + 1, text: line.trim().slice(0, 200) });
    });
    if (matches.length) {
      const label = pane.filename || `pane ${pane.id}`;
      results.push(`${label} (${matches.length})`);
      matches.forEach(m => results.push(`  ${m.line}: ${m.text}`));
      results.push('');
    }
  }
  const allStates = getAllStates();
  for (const { index, label, state } of allStates) {
    if (index === getActiveIndex()) continue;
    if (!state.panes) continue;
    for (const [paneId, p] of Object.entries(state.panes)) {
      if (!p || typeof p.content !== 'string') continue;
      const lines = p.content.split('\n');
      const matches = [];
      lines.forEach((line, idx) => {
        re.lastIndex = 0;
        if (re.test(line)) matches.push({ line: idx + 1, text: line.trim().slice(0, 200) });
      });
      if (matches.length) {
        const fileLabel = p.filename || `pane ${paneId}`;
        results.push(`[${label}] ${fileLabel} (${matches.length})`);
        matches.forEach(m => results.push(`  ${m.line}: ${m.text}`));
        results.push('');
      }
    }
  }
  const output = results.join('\n') || '(no matches)';
  let outId = ctx.pane.grepOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.grepOutputId = outId;
    const out = getPane(outId);
    if (out) { out.tagEl.textContent = 'grep Del'; out.transient = true; }
  }
  getPane(outId)?.jar.updateCode(output);
});

// ── Text transforms ───────────────────────────────────────────────────────────

function _sortKey(line, col) {
  const parts = line.trim().split(/\s+/);
  return (col > 0 && col <= parts.length) ? parts[col - 1] : line;
}

register('Sort', ctx => {
  const sel = (ctx.selection || '').trim().toLowerCase();
  const lines = ctx.pane.jar.toString().split('\n');
  const numeric = sel === 'num' || sel === 'n';
  const col = sel && !numeric ? parseInt(sel, 10) : 0;
  const sorted = lines.slice().sort((a, b) => {
    if (numeric) {
      const na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
    }
    if (col > 0) return _sortKey(a, col).localeCompare(_sortKey(b, col));
    return a.localeCompare(b);
  });
  ctx.pane.jar.updateCode(sorted.join('\n'));
});
register('Trim', ctx => {
  let text = ctx.pane.jar.toString();
  text = text.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
  text = text.replace(/\n*$/, '\n');
  ctx.pane.jar.updateCode(text);
});
register('Lower', ctx => { ctx.pane.jar.updateCode(ctx.pane.jar.toString().toLowerCase()); });
register('Upper', ctx => { ctx.pane.jar.updateCode(ctx.pane.jar.toString().toUpperCase()); });
register('Title', ctx => {
  const text = ctx.pane.jar.toString();
  ctx.pane.jar.updateCode(text.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()));
});
register('Unique', ctx => {
  const seen = new Set();
  const out = [];
  for (const line of ctx.pane.jar.toString().split('\n')) {
    if (!seen.has(line)) { seen.add(line); out.push(line); }
  }
  ctx.pane.jar.updateCode(out.join('\n'));
});
register('Reverse', ctx => {
  ctx.pane.jar.updateCode(ctx.pane.jar.toString().split('\n').reverse().join('\n'));
});

// ── View ────────────────────────────────────────────────────────────────────────

register('Ruler', ctx => {
  const on = toggleRuler(ctx.paneId);
  _toast(on ? 'Ruler on' : 'Ruler off');
});
register('Big', ctx => {
  const current = parseInt(getComputedStyle(ctx.pane.editorEl).fontSize, 10) || 14;
  const next = Math.min(current + 2, 24);
  ctx.pane.editorEl.style.fontSize = next + 'px';
  ctx.pane.fontSize = next;
  _toast(`Font size ${next}px`);
});
register('Small', ctx => {
  const current = parseInt(getComputedStyle(ctx.pane.editorEl).fontSize, 10) || 14;
  const next = Math.max(current - 2, 10);
  ctx.pane.editorEl.style.fontSize = next + 'px';
  ctx.pane.fontSize = next;
  _toast(`Font size ${next}px`);
});

function _caretOffset(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.cloneContents().textContent.length;
}

register('Split', ctx => {
  const text = ctx.pane.jar.toString();
  const offset = _caretOffset(ctx.pane.editorEl);
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  ctx.pane.jar.updateCode(before);
  const newId = splitPane(ctx.paneId);
  if (newId) {
    loadContent(newId, after);
    getPane(newId)?.editorEl.focus();
  }
});
register('Lock', ctx => {
  const on = toggleLock(ctx.paneId);
  _toast(on ? 'Pane locked' : 'Pane unlocked');
});
register('Highlight', ctx => {
  const { name } = getPaneFile(ctx.paneId) ?? {};
  const sel = (ctx.selection || '').trim().toLowerCase();
  if (sel === 'off') {
    setHighlightLang(ctx.paneId, null);
    _toast('Highlight off');
    return;
  }
  const lang = resolvePrismLang(sel || null, name);
  if (!lang) {
    if (ctx.pane.highlightLang) {
      setHighlightLang(ctx.paneId, null);
      _toast('Highlight off');
    } else {
      _toast('Select a language (e.g. js) or infer from filename');
    }
    return;
  }
  setHighlightLang(ctx.paneId, lang);
  _toast('Highlight: ' + lang);
});

// ── Session ───────────────────────────────────────────────────────────────────

register('Export', ctx => {
  saveActiveState(getState());
  saveAll();
  const all = getAllStates().map(s => ({ label: s.label, state: s.state }));
  const json = JSON.stringify(all, null, 2);
  let outId = ctx.pane.exportOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.exportOutputId = outId;
    const out = getPane(outId);
    if (out) out.tagEl.textContent = 'export Del';
  }
  getPane(outId)?.jar.updateCode(json);
});
register('Import', ctx => {
  const text = ctx.pane.jar.toString().trim();
  if (!text) { _toast('Nothing to import'); return; }
  let data;
  try { data = JSON.parse(text); } catch (e) {
    _toast('Invalid JSON: ' + e.message);
    return;
  }
  if (Array.isArray(data)) {
    importWorkspaces(data.map(w => ({ label: w.label || 'imported', state: w.state })));
    _toast('Imported ' + data.length + ' workspaces — reloading');
    setTimeout(() => location.reload(), 600);
  } else if (data && data.colOrder) {
    const state = getState();
    state.dark = document.body.classList.contains('dark');
    saveActiveState(state);
    saveAll();
    resetLayout();
    restoreState(data, _onPaneRestored);
    _syncTabDirty();
    _toast('Imported workspace');
  } else {
    _toast('Unrecognised JSON format');
  }
});

function _syncThemeColor() {
  const dark = document.body.classList.contains('dark');
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0f1020' : '#dde3ff');
}

register('dark',  () => { document.body.classList.add('dark');    _syncThemeColor(); });
register('light', () => { document.body.classList.remove('dark'); _syncThemeColor(); });

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
      const h = await window.showSaveFilePicker({ suggestedName: 'untitled.md' });
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
    _sessionSave();
    const state = getActiveState();
    if (state) {
      resetLayout();
      document.body.classList.toggle('dark', state.dark ?? true);
      restoreState(state, _onPaneRestored);
      _syncTabDirty();
    }
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

// ── TOC ────────────────────────────────────────────────────────────────────────

// Shared TOC build logic used both by the Toc command and auto-restore.
// silent=true suppresses the "no headings" toast (used during restore).
function _buildToc(srcPane, silent = false) {
  const srcText = srcPane.jar.toString();
  const headings = [];
  const re = /^(#{1,6})\s+(.+)$/gm;
  let m;
  while ((m = re.exec(srcText)) !== null) {
    headings.push({ level: m[1].length, text: m[2].trim(), offset: m.index });
  }
  if (!headings.length) { if (!silent) _toast('No headings found'); return; }

  // Create or reuse the TOC pane in its own column.
  let tocPaneId = srcPane.tocOutputId;
  if (!tocPaneId || !getPane(tocPaneId)) {
    const newColId = createColumnBefore(srcPane.colId);
    tocPaneId = createPane(newColId, '', 'toc Del');
    srcPane.tocOutputId = tocPaneId;
    const tocColEl = getPane(tocPaneId)?.el.parentElement;
    if (tocColEl) tocColEl.style.flex = '0 0 220px';
    // Proportionally shrink/grow the other columns so they fill the remaining
    // space and the layout never overflows or leaves a gap on the right.
    normalizeColWidths(newColId);
    rebuildColHandles();
    const tocPane = getPane(tocPaneId);
    if (tocPane) tocPane.tocSourcePaneId = srcPane.id;
  }

  srcPane.tocActive = true;

  const tocPane = getPane(tocPaneId);
  if (!tocPane) return;

  // Mark as transient so state serialisation skips it.
  tocPane.transient = true;
  tocPane.editorEl.style.display = 'none';

  let displayEl = tocPane.bodyEl.querySelector('.pane-display');
  if (!displayEl) {
    displayEl = document.createElement('div');
    displayEl.className = 'pane-display';
    tocPane.bodyEl.appendChild(displayEl);
  }

  // Collapsed state: Set of heading indices whose children are hidden.
  const collapsed = new Set();

  function hasChildren(idx) {
    const lvl = headings[idx].level;
    return idx + 1 < headings.length && headings[idx + 1].level > lvl;
  }

  function isHidden(idx) {
    for (let p = idx - 1; p >= 0; p--) {
      if (headings[p].level < headings[idx].level && collapsed.has(p)) return true;
    }
    return false;
  }

  function render() {
    const ul = document.createElement('ul');
    ul.className = 'toc-list';
    headings.forEach((h, i) => {
      const li = document.createElement('li');
      li.className = `toc-item toc-h${h.level}${isHidden(i) ? ' toc-hidden' : ''}`;

      const toggle = document.createElement('span');
      toggle.className = 'toc-toggle';
      if (hasChildren(i)) {
        toggle.textContent = collapsed.has(i) ? '▶' : '▼';
        toggle.addEventListener('click', e => {
          e.stopPropagation();
          if (collapsed.has(i)) collapsed.delete(i); else collapsed.add(i);
          render();
        });
      }

      const label = document.createElement('span');
      label.className = 'toc-label';
      label.textContent = h.text;
      label.title = h.text;
      label.addEventListener('click', () => _scrollToHeading(srcPane.id, h.offset));

      li.appendChild(toggle);
      li.appendChild(label);
      ul.appendChild(li);
    });
    displayEl.innerHTML = '';
    displayEl.appendChild(ul);
  }

  render();
}

register('Toc', ctx => _buildToc(ctx.pane));

function _scrollToHeading(paneId, charOffset) {
  const pane = getPane(paneId);
  if (!pane) return;
  const walker = document.createTreeWalker(pane.editorEl, NodeFilter.SHOW_TEXT);
  let cur = 0;
  let node;
  while ((node = walker.nextNode())) {
    if (node.length === 0) continue;
    if (cur + node.length > charOffset) {
      const range = document.createRange();
      range.setStart(node, charOffset - cur);
      range.collapse(true);
      const rect     = range.getBoundingClientRect();
      const bodyRect = pane.bodyEl.getBoundingClientRect();
      pane.bodyEl.scrollTop += rect.top - bodyRect.top - 40;
      return;
    }
    cur += node.length;
  }
}

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
    if (out) { out.tagEl.textContent = 'eval-out Del'; out.transient = true; }
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

// ── Recipe ────────────────────────────────────────────────────────────────────

register('Recipe', ctx => {
  const md      = ctx.pane.jar.toString();
  const recipes = md.split(/(?=^# )/m).map(s => s.trim()).filter(Boolean);

  if (recipes.length === 0) {
    _toast('No recipe structure found — see Help for syntax');
    return;
  }

  let tables;
  try {
    tables = recipes.map(r => buildTable(parseRecipe(r)));
  } catch (e) {
    _toast('Recipe parse error: ' + e.message);
    return;
  }

  let outId = ctx.pane.recipeOutputId;
  if (!outId || !getPane(outId)) {
    outId = splitPane(ctx.paneId);
    ctx.pane.recipeOutputId = outId;
    const out = getPane(outId);
    if (out) {
      out.tagEl.textContent = 'Png Del';
      out.recipeSourceId = ctx.paneId;
    }
  }

  const wrap = document.createElement('div');
  wrap.className = 'recipe-display';
  tables.forEach(t => wrap.appendChild(t));
  setPaneDisplay(outId, wrap.outerHTML);
});

register('Png', ctx => {
  const sourceId = ctx.pane.recipeSourceId;
  const src = sourceId ? getPane(sourceId) : null;
  if (!src) { _toast('Png: no recipe source pane (run Recipe first)'); return; }
  const md      = src.jar.toString();
  const recipes = md.split(/(?=^# )/m).map(s => s.trim()).filter(Boolean);
  if (recipes.length === 0) { _toast('Png: no recipes found'); return; }

  document.fonts.ready.then(async () => {
    try {
      const files = await Promise.all(recipes.map(recipeMd => {
        const recipe   = parseRecipe(recipeMd);
        const canvas   = exportToCanvas(recipe);
        const slug     = (recipe.title || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recipe';
        const filename = slug + '.png';
        return new Promise(res => canvas.toBlob(b => res(new File([b], filename, { type: 'image/png' })), 'image/png'));
      }));

      if (window.showSaveFilePicker) {
        for (const file of files) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: file.name,
              types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(file);
            await writable.close();
          } catch (e) {
            if (e.name !== 'AbortError') _toast('Save error: ' + e.message);
          }
        }
      } else if (navigator.canShare?.({ files })) {
        navigator.share({ files })
          .catch(e => { if (e.name !== 'AbortError') _toast('Share error: ' + e.message); });
      } else {
        for (const file of files) {
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.download = file.name;
          a.href = url;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) {
      _toast('Png export error: ' + e.message);
    }
  });
});

// ── Sheet ─────────────────────────────────────────────────────────────────────

register('Sheet', ctx => {
  const md      = ctx.pane.jar.toString();
  const recipes = md.split(/(?=^# )/m).map(s => s.trim()).filter(Boolean).slice(0, 4);

  if (recipes.length === 0) {
    _toast('Sheet: no recipes found — start each recipe with # Title');
    return;
  }

  try {
    const slots = recipes.map(recipeMd =>
      buildTable(parseRecipe(recipeMd)).outerHTML
    );
    // Pad to 4 slots so the grid is always 2×2.
    while (slots.length < 4) slots.push('');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Recipe Sheet</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: landscape; margin: 0; }

body {
  padding: 0.5cm;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  background: white;
}

.slot {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px dashed #ccc;
}

.slot-inner { transform-origin: center center; }

@media print {
  .slot { border: none; }
}

/* ── Recipe table ── */
.recipe-table {
  border-collapse: collapse;
  font-family: system-ui, sans-serif;
  font-size: 13px;
}
.recipe-table td {
  border: 1px solid #555;
  padding: 5px 9px;
  vertical-align: middle;
  line-height: 1.35;
  color: #111;
}
.recipe-table .title-row td {
  text-align: center;
  font-size: 14px;
  font-weight: bold;
  color: #000;
}
.recipe-table .prep-row td {
  text-align: center;
  color: #444;
  font-style: italic;
}
.recipe-table .cell-ingredient { white-space: nowrap; }
.recipe-table .cell-ingredient .prep-label {
  font-style: italic;
  margin-right: 4px;
  opacity: .75;
}
.recipe-table .cell-action,
.recipe-table .cell-finish {
  font-weight: bold;
  min-width: 26px;
  padding: 4px 2px;
  text-align: center;
}
.recipe-table .cell-action span,
.recipe-table .cell-finish span {
  display: inline-block;
  writing-mode: vertical-rl;
  white-space: pre-line;
}
</style>
</head>
<body>
${slots.map(t => `<div class="slot"><div class="slot-inner">${t}</div></div>`).join('\n')}
__SCRIPT__
window.addEventListener('load', () => {
  document.querySelectorAll('.slot').forEach(slot => {
    const inner = slot.querySelector('.slot-inner');
    if (!inner || !inner.firstChild) return;
    const r  = inner.getBoundingClientRect();
    const sW = slot.clientWidth, sH = slot.clientHeight;
    const s0  = Math.min(sW / r.width,  sH / r.height);
    const s90 = Math.min(sW / r.height, sH / r.width);
    if (s90 > s0) {
      inner.style.transform = \`rotate(90deg) scale(\${s90})\`;
    } else {
      inner.style.transform = \`scale(\${s0})\`;
    }
  });
});
__SCRIPT_END__
</body>
</html>`;

    const finalHtml = html.replace(/__SCRIPT__/g, '<' + 'script>').replace(/__SCRIPT_END__/g, '<' + '/script>');
    const blob = new Blob([finalHtml], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (e) {
    _toast('Sheet error: ' + e.message);
  }
});

// ── Persistence (session) ──────────────────────────────────────────────────────

let _clearPending = false;
register('nuke', () => {
  _clearPending = true;
  try {
    localStorage.removeItem('dunno-session');
    localStorage.removeItem('dunno-state');
  } catch {}
  location.reload();
});

function _sessionSave() {
  if (_clearPending) return;
  try {
    const state = getState();
    state.dark = document.body.classList.contains('dark');
    saveActiveState(state);
    saveAll();
  } catch {}
}

function _sessionLoad() {
  // Workspace persistence is now handled by the tab system.
  return false;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const WELCOME = `dunno  —  inspired by Plan 9's Acme

Right-click any command word to execute it.
Right-click Help for commands. Select a word first for topic help.`;

async function _init() {
  _setupModal();
  await loadVersion();

  const activeState = init({
    onSwitch: (idx) => {
      const state = getState();
      state.dark = document.body.classList.contains('dark');
      saveActiveState(state);
      switchTab(idx);
      resetLayout();
      const next = getActiveState();
      if (next) {
        document.body.classList.toggle('dark', next.dark ?? true);
        restoreState(next, _onPaneRestored);
      } else {
        const col = createColumn();
        createPane(col);
      }
      _syncTabDirty();
    },
    onClose: async (idx) => {
      if (tabCount() <= 1) {
        _toast('Cannot close the last tab');
        return;
      }
      if (isTabDirty(idx)) {
        const confirmed = await _showModal('This tab has unsaved changes. Close anyway?');
        if (!confirmed) return;
      }
      const wasActive = idx === getActiveIndex();
      if (wasActive) {
        const state = getState();
        state.dark = document.body.classList.contains('dark');
        saveActiveState(state);
      }
      closeTab(idx);
      if (wasActive) {
        resetLayout();
        const next = getActiveState();
        if (next) {
          document.body.classList.toggle('dark', next.dark ?? true);
          restoreState(next, _onPaneRestored);
        } else {
          const col = createColumn();
          createPane(col);
        }
      }
      _syncTabDirty();
    },
  });

  setDirtyCallback(() => _syncTabDirty());

  if (activeState) {
    document.body.classList.toggle('dark', activeState.dark ?? true);
    restoreState(activeState, _onPaneRestored);
  } else {
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

// ── Public extension API ───────────────────────────────────────────────────────

function _editorHandle(pane, selection = null) {
  return {
    getText: () => pane.jar.toString(),
    setText: text => pane.jar.updateCode(text),
    getSelection: () => selection ?? window.getSelection?.()?.toString().trim() ?? '',
    setTag: label => { pane.tagEl.textContent = label; },
    setDisplay: html => setPaneDisplay(pane.id, html),
    getFilename: () => getPaneFile(pane.id)?.name ?? null,
    focus: () => pane.editorEl.focus(),
    split(key, tag = '') {
      const storeKey = '__ext_' + key;
      let outId = pane[storeKey];
      if (!outId || !getPane(outId)) {
        outId = splitPane(pane.id);
        pane[storeKey] = outId;
      }
      const out = getPane(outId);
      if (out && tag) out.tagEl.textContent = tag;
      return out ? _editorHandle(out) : null;
    },
    splitLeft(key, tag = '') {
      const storeKey = '__ext_col_l_' + key;
      let outId = pane[storeKey];
      if (!outId || !getPane(outId)) {
        const colId = createColumnBefore(pane.colId);
        outId = createPane(colId, '', tag);
        pane[storeKey] = outId;
        rebuildColHandles();
      }
      const out = getPane(outId);
      if (out && tag) out.tagEl.textContent = tag;
      return out ? _editorHandle(out) : null;
    },
    splitRight(key, tag = '') {
      const storeKey = '__ext_col_r_' + key;
      let outId = pane[storeKey];
      if (!outId || !getPane(outId)) {
        const colId = createColumn(pane.colId);
        outId = createPane(colId, '', tag);
        pane[storeKey] = outId;
        rebuildColHandles();
      }
      const out = getPane(outId);
      if (out && tag) out.tagEl.textContent = tag;
      return out ? _editorHandle(out) : null;
    },
  };
}

window.dunno = {
  register(cmd, fn) {
    register(cmd, ctx => fn(_editorHandle(ctx.pane, ctx.selection)));
  },
  getActiveEditor() {
    const pane = getActive();
    return pane ? _editorHandle(pane) : null;
  },
  getPreviousEditor() {
    const pane = getPrev();
    return pane ? _editorHandle(pane) : null;
  },
  toast: msg => _toast(msg),
  isDark: () => document.body.classList.contains('dark'),
};
