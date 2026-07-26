// find.js — find/replace panel embedded in a pane

const LINE_H  = 14 * 1.7; // must match .editor CSS
const PAD_TOP = 14;

export function openFind(pane)    { _open(pane, false); }
export function openReplace(pane) { _open(pane, true);  }

export function closeFind(pane) {
  pane.el.querySelector('.find-bar')?.remove();
  pane.bodyEl.querySelector('.find-gutter')?.remove();
  window.getSelection()?.removeAllRanges();
}

function _open(pane, replaceMode) {
  pane.el.querySelector('.find-bar')?.remove();
  const bar = _makeBar(pane);
  pane.el.appendChild(bar);
  bar.querySelector(replaceMode ? '.rep-input' : '.find-input').focus();
}

function _makeBar(pane) {
  const bar    = document.createElement('div');
  bar.className = 'find-bar';

  const fi     = _inp('find-input', 'find…');
  const ri     = _inp('rep-input',  'replace…');
  const count  = Object.assign(document.createElement('span'), { className: 'find-count', textContent: '' });
  const prev   = _btn('↑');
  const next   = _btn('↓');
  const repOne = _btn('→1');
  const repAll = _btn('→all');
  const close  = _btn('×');

  bar.append(fi, count, prev, next, ri, repOne, repAll, close);

  let matches = [];
  let cur     = -1;

  const search = () => {
    matches = fi.value ? _findAll(pane.jar.toString(), fi.value) : [];
    cur = matches.length ? 0 : -1;
    _showCount(count, matches, cur);
    _drawGutter(pane, matches, cur);
    if (cur >= 0) _select(pane.editorEl, matches[cur]);
  };

  const go = delta => {
    if (!matches.length) return;
    cur = ((cur + delta) % matches.length + matches.length) % matches.length;
    _showCount(count, matches, cur);
    _drawGutter(pane, matches, cur);
    _select(pane.editorEl, matches[cur]);
  };

  fi.addEventListener('input', search);
  fi.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') closeFind(pane);
  });
  ri.addEventListener('keydown', e => { if (e.key === 'Escape') closeFind(pane); });

  prev.addEventListener('click',  () => go(-1));
  next.addEventListener('click',  () => go(1));
  close.addEventListener('click', () => closeFind(pane));

  repOne.addEventListener('click', () => {
    if (cur < 0 || !fi.value) return;
    const m = matches[cur];
    const t = pane.jar.toString();
    pane.jar.updateCode(t.slice(0, m.start) + ri.value + t.slice(m.end));
    matches = fi.value ? _findAll(pane.jar.toString(), fi.value) : [];
    cur = Math.min(cur, matches.length - 1);
    _showCount(count, matches, cur);
    _drawGutter(pane, matches, cur);
    if (cur >= 0) _select(pane.editorEl, matches[cur]);
  });

  repAll.addEventListener('click', () => {
    if (!fi.value) return;
    pane.jar.updateCode(pane.jar.toString().split(fi.value).join(ri.value));
    matches = []; cur = -1;
    _showCount(count, matches, cur);
    _drawGutter(pane, matches, cur);
  });

  return bar;
}

function _inp(cls, ph) {
  return Object.assign(document.createElement('input'), { className: cls, placeholder: ph });
}

function _btn(txt) {
  return Object.assign(document.createElement('button'), { className: 'find-btn', textContent: txt });
}

function _findAll(text, term) {
  const out = [];
  const lo  = term.toLowerCase();
  const src = text.toLowerCase();
  let i = 0;
  while ((i = src.indexOf(lo, i)) >= 0) {
    out.push({ start: i, end: i + term.length });
    i++;
  }
  return out;
}

function _showCount(el, matches, cur) {
  el.textContent = matches.length ? `${cur + 1}/${matches.length}` : '0/0';
}

function _drawGutter(pane, matches, cur) {
  pane.bodyEl.querySelector('.find-gutter')?.remove();
  if (!matches.length) return;

  const text   = pane.jar.toString();
  const gutter = document.createElement('div');
  gutter.className = 'find-gutter';

  const lineOf = pos => text.slice(0, pos).split('\n').length - 1;

  for (let i = 0; i < matches.length; i++) {
    const line = lineOf(matches[i].start);
    const mark = document.createElement('div');
    mark.className = 'find-mark' + (i === cur ? ' find-mark-current' : '');
    mark.style.top    = `${PAD_TOP + line * LINE_H}px`;
    mark.style.height = `${LINE_H}px`;
    gutter.appendChild(mark);
  }

  pane.bodyEl.appendChild(gutter);
}

function _select(editorEl, match) {
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  let pos = 0, startNode, endNode, startOff, endOff;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.length;
    if (!startNode && pos + len > match.start) {
      startNode = node;
      startOff  = match.start - pos;
    }
    if (startNode && !endNode && pos + len >= match.end) {
      endNode = node;
      endOff  = match.end - pos;
      break;
    }
    pos += len;
  }
  if (!startNode) return;

  const range = document.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode ?? startNode, endOff ?? startOff);

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  range.startContainer.parentElement?.scrollIntoView({ block: 'nearest' });
}
