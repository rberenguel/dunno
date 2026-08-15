// js/overlay.js — visual overlays on pane text ranges
// Each overlay is a set of absolutely-positioned mark divs inside the pane's
// overlay layer. The layer lives inside .editor-wrap (position: relative) so
// marks scroll naturally with the editor content without scroll listeners.

export function addOverlay(pane, opts) {
  const id = ++pane._ovId;
  const ov = {
    id,
    start: opts.start ?? 0,
    end: opts.end ?? 0,
    className: opts.className || '',
    tooltip: opts.tooltip || '',
    elements: [],
  };
  _renderOverlay(pane, ov);
  pane.overlays.set(id, ov);
  return id;
}

export function removeOverlay(pane, id) {
  const ov = pane.overlays.get(id);
  if (!ov) return;
  ov.elements.forEach(el => el.remove());
  pane.overlays.delete(id);
}

export function clearOverlays(pane) {
  for (const ov of pane.overlays.values()) {
    ov.elements.forEach(el => el.remove());
  }
  pane.overlays.clear();
}

export function refreshOverlays(pane) {
  for (const ov of pane.overlays.values()) {
    ov.elements.forEach(el => el.remove());
    ov.elements = [];
    _renderOverlay(pane, ov);
  }
}

function _renderOverlay(pane, ov) {
  const editorEl = pane.editorEl;
  const wrapEl = pane.editorWrap;
  const overlayEl = pane.overlayEl;

  if (ov.end <= ov.start) return;

  // Map offsets to DOM nodes
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null, false);
  let pos = 0;
  let startNode, startOff, endNode, endOff;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.length;
    if (!startNode && pos + len > ov.start) {
      startNode = node;
      startOff = ov.start - pos;
    }
    if (startNode && !endNode && pos + len >= ov.end) {
      endNode = node;
      endOff = ov.end - pos;
      break;
    }
    pos += len;
  }
  if (!startNode) return;

  const range = document.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode ?? startNode, endOff ?? startOff);

  const rects = range.getClientRects();
  const wrapRect = wrapEl.getBoundingClientRect();
  const PAD = 3;

  for (const rect of rects) {
    const mark = document.createElement('div');
    mark.className = 'overlay-mark ' + ov.className;
    mark.style.left = `${rect.left - wrapRect.left - PAD}px`;
    mark.style.top = `${rect.top - wrapRect.top}px`;
    mark.style.width = `${rect.width + PAD * 2}px`;
    mark.style.height = `${rect.height}px`;
    mark.dataset.ovId = ov.id;

    if (ov.tooltip) {
      const tip = document.createElement('div');
      tip.className = 'overlay-tooltip';
      tip.textContent = ov.tooltip;
      mark.appendChild(tip);
    }

    overlayEl.appendChild(mark);
    ov.elements.push(mark);
  }
}
