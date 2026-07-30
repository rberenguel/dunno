const KEY = 'dunno-session';

let _meta = [];    // [{ label, dirty }]
let _states = [];  // [state | null]
let _active = 0;
let _tabBarEl = null;
let _onSwitch = null;
let _onClose = null;

export function init({ onSwitch, onClose }) {
  _onSwitch = onSwitch;
  _onClose = onClose;
  _tabBarEl = document.getElementById('tab-bar');

  const saved = _load();
  if (saved && saved.version === 2) {
    _meta = (saved.workspaces || []).map(w => ({ label: w.label || 'untitled', dirty: w.dirty || false }));
    _states = (saved.workspaces || []).map(w => w.state || null);
    _active = saved.activeIndex || 0;
    if (_active >= _meta.length) _active = 0;
  } else {
    const oldRaw = localStorage.getItem('dunno-state');
    let state = null;
    if (oldRaw) {
      try { state = JSON.parse(oldRaw); } catch {}
    }
    _meta = [{ label: 'untitled', dirty: false }];
    _states = [state];
    _active = 0;
  }
  _render();
  return _states[_active] ?? null;
}

export function tabCount() { return _meta.length; }
export function getActiveIndex() { return _active; }

export function createTab() {
  _meta.push({ label: `untitled ${_meta.length + 1}`, dirty: false });
  _states.push(null);
  _active = _meta.length - 1;
  _render();
}

export function closeTab(idx) {
  if (_meta.length <= 1) return false;
  _meta.splice(idx, 1);
  _states.splice(idx, 1);
  if (idx < _active) _active--;
  else if (_active >= _meta.length) _active = _meta.length - 1;
  _render();
  return true;
}

export function switchTab(idx) {
  if (idx === _active) return;
  _active = idx;
  _render();
}

export function saveActiveState(state) {
  if (_active >= 0 && _active < _states.length) {
    _states[_active] = state;
  }
}

export function getActiveState() {
  return _states[_active] ?? null;
}

export function getAllStates() {
  return _states.map((state, i) => ({ index: i, label: _meta[i]?.label || 'untitled', state })).filter(s => s.state);
}

export function markDirty() {
  if (_active >= 0 && _active < _meta.length) {
    _meta[_active].dirty = true;
    _render();
  }
}

export function clearTabDirty() {
  if (_active >= 0 && _active < _meta.length) {
    _meta[_active].dirty = false;
    _render();
  }
}

export function isTabDirty(idx) {
  return idx >= 0 && idx < _meta.length ? _meta[idx].dirty : false;
}

export function setLabel(idx, label) {
  if (idx >= 0 && idx < _meta.length) {
    _meta[idx].label = label;
    _render();
  }
}

export function saveAll() {
  try {
    const workspaces = _meta.map((m, i) => ({ ...m, state: _states[i] }));
    localStorage.setItem(KEY, JSON.stringify({ version: 2, workspaces, activeIndex: _active }));
    localStorage.removeItem('dunno-state');
  } catch {}
}

export function importWorkspaces(workspaces, activeIndex = 0) {
  _meta = workspaces.map(w => ({ label: w.label || 'imported', dirty: w.dirty || false }));
  _states = workspaces.map(w => w.state || null);
  _active = Math.min(activeIndex, _meta.length - 1);
  saveAll();
  _render();
}

function _render() {
  if (!_tabBarEl) return;
  _tabBarEl.innerHTML = '';
  _meta.forEach((m, idx) => {
    const tab = document.createElement('div');
    tab.className = 'tab-item' + (idx === _active ? ' active' : '') + (m.dirty ? ' is-dirty' : '');
    tab.title = m.label;
    tab.innerHTML = `
      <span class="tab-title">${_esc(m.label)}</span>
      <span class="tab-dirty">·</span>
      <span class="tab-close">×</span>
    `;
    tab.addEventListener('click', e => {
      if (e.target.closest('.tab-close')) {
        e.stopPropagation();
        if (_onClose) _onClose(idx);
      } else {
        if (_onSwitch) _onSwitch(idx);
      }
    });
    _tabBarEl.appendChild(tab);
  });
}

function _esc(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
