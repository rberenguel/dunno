'use strict';

// ── Label normalization ───────────────────────────────────────────────────────

function normalizeLabel(text) {
  return text.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n').trim();
}

// ── Tree math ─────────────────────────────────────────────────────────────────

function calcRowspan(node) {
  if (node.children.length === 0) return 1;
  return node.children.reduce((s, c) => s + calcRowspan(c), 0);
}

function calcHeight(node) {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(calcHeight));
}

// ── Parser ────────────────────────────────────────────────────────────────────
//
// Heading-based recipe syntax:
//   # Title
//   > prep step (blockquote = full-width row at top)
//   ## root action  (## depth 1, ### depth 2, …)
//   plain paragraph = ingredient leaf
//   "verb: ingredient" = prep-labelled ingredient
//   \n or <br/> in a label = extra vertical text column (wider, not taller)
//   1. finish step (ordered list = rightmost column(s))

function splitPrepLabel(text) {
  const m = text.match(/^([a-zA-Z ]{1,20}):\s*(.+)$/);
  if (m) return { prep: m[1].trim(), ingredient: m[2].trim() };
  return { prep: null, ingredient: text };
}

export function parseRecipe(md) {
  const tokens = window.marked.lexer(md);
  const recipe = { title: null, prepSteps: [], roots: [], finishSteps: [] };
  const stack = [];

  function stackTop() { return stack.length ? stack[stack.length - 1] : null; }
  function attach(node) {
    const p = stackTop();
    if (p) p.node.children.push(node);
    else recipe.roots.push(node);
  }

  for (const tok of tokens) {
    if (tok.type === 'heading') {
      if (tok.depth === 1) { recipe.title = tok.text.replace(/\*\*/g, ''); continue; }
      while (stack.length && stack[stack.length - 1].depth >= tok.depth) stack.pop();
      const node = { label: normalizeLabel(tok.text.replace(/\*\*/g, '')), prepLabel: null, children: [] };
      attach(node);
      stack.push({ depth: tok.depth, node });

    } else if (tok.type === 'paragraph') {
      tok.text.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        const { prep, ingredient } = splitPrepLabel(line);
        attach({ label: ingredient, prepLabel: prep, children: [] });
      });

    } else if (tok.type === 'blockquote') {
      tok.raw.replace(/^>\s*/gm, '').trim()
        .split('\n').map(l => l.trim()).filter(Boolean)
        .forEach(l => normalizeLabel(l).split('\n').map(s => s.trim()).filter(Boolean)
          .forEach(s => recipe.prepSteps.push(s)));

    } else if (tok.type === 'list' && tok.ordered) {
      for (const item of tok.items) {
        const raw = item.tokens
          .filter(t => t.type === 'text' || t.type === 'paragraph')
          .map(t => (t.text || t.raw || '').replace(/\*\*/g, '').trim())
          .join(' ').trim();
        recipe.finishSteps.push({ label: normalizeLabel(raw), prepLabel: null, children: [] });
      }
    }
  }

  return recipe;
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function buildLayoutCells(recipe) {
  const { title, prepSteps, roots, finishSteps } = recipe;
  const treeH    = roots.length ? Math.max(...roots.map(calcHeight)) : 0;
  const totalRows = roots.reduce((s, r) => s + calcRowspan(r), 0);
  const totalCols = (treeH + 1) + finishSteps.length;

  const slots = Array.from({ length: totalRows }, () => []);

  function place(node, startRow, parentHeight) {
    const rs     = calcRowspan(node);
    const isLeaf = node.children.length === 0;
    const h      = calcHeight(node);

    if (isLeaf) {
      slots[startRow].push({
        row: startRow, col: 0,
        rowspan: rs, colspan: Math.max(1, parentHeight),
        text: node.label, prepLabel: node.prepLabel,
        type: 'ingredient',
      });
    } else {
      slots[startRow].push({
        row: startRow, col: h,
        rowspan: rs, colspan: 1,
        text: node.label, prepLabel: null,
        type: 'action',
      });
      let childRow = startRow;
      // In bottom-up recipes a nested sub-recipe (taller tree) is usually
      // the chronologically earlier step; place it first so it appears
      // higher in the layout while keeping original order among ties.
      const sortedChildren = node.children.slice().sort((a, b) => calcHeight(b) - calcHeight(a));
      for (const child of sortedChildren) {
        place(child, childRow, h);
        childRow += calcRowspan(child);
      }
    }
  }

  let cur = 0;
  for (const root of roots) { place(root, cur, treeH + 1); cur += calcRowspan(root); }

  const bodyCells = [];
  for (let r = 0; r < totalRows; r++) {
    slots[r].sort((a, b) => a.col - b.col);
    bodyCells.push(...slots[r]);
  }

  finishSteps.forEach((step, fi) => bodyCells.push({
    row: 0, col: treeH + 1 + fi,
    rowspan: totalRows, colspan: 1,
    text: step.label, prepLabel: null,
    type: 'finish',
  }));

  return { bodyCells, title, prepSteps, totalRows, totalCols, treeH };
}

// ── DOM table ─────────────────────────────────────────────────────────────────

export function buildTable(recipe) {
  const { bodyCells, title, prepSteps, totalRows, totalCols } = buildLayoutCells(recipe);

  const table = document.createElement('table');
  table.className = 'recipe-table';

  if (title) {
    const tr = document.createElement('tr');
    tr.className = 'title-row';
    const td = document.createElement('td');
    td.colSpan = totalCols;
    td.textContent = title;
    tr.appendChild(td);
    table.appendChild(tr);
  }

  for (const prep of prepSteps) {
    const tr = document.createElement('tr');
    tr.className = 'prep-row';
    const td = document.createElement('td');
    td.colSpan = totalCols;
    td.textContent = prep;
    tr.appendChild(td);
    table.appendChild(tr);
  }

  if (totalRows === 0) return table;

  const rows = Array.from({ length: totalRows }, () => {
    const tr = document.createElement('tr');
    table.appendChild(tr);
    return tr;
  });

  const finishCells = bodyCells.filter(c => c.type === 'finish');
  const mainCells   = bodyCells.filter(c => c.type !== 'finish');

  for (const c of mainCells) {
    const td = document.createElement('td');
    td.rowSpan = c.rowspan;
    td.colSpan = c.colspan;

    if (c.type === 'ingredient') {
      td.className = 'cell-ingredient';
      if (c.prepLabel) {
        const sp = document.createElement('span');
        sp.className = 'prep-label';
        sp.textContent = c.prepLabel + ':';
        td.appendChild(sp);
      }
      td.appendChild(document.createTextNode(c.text));
    } else {
      td.className = 'cell-action';
      const sp = document.createElement('span');
      sp.textContent = c.text;
      td.appendChild(sp);
    }
    rows[c.row].appendChild(td);
  }

  for (const c of finishCells) {
    const td = document.createElement('td');
    td.rowSpan = c.rowspan;
    td.className = 'cell-finish';
    const sp = document.createElement('span');
    sp.textContent = c.text;
    td.appendChild(sp);
    rows[0].appendChild(td);
  }

  return table;
}

// ── Canvas export ─────────────────────────────────────────────────────────────

export function exportToCanvas(recipe) {
  const SCALE      = 2;
  const FS         = 14;
  const FONT       = `${FS}px Inter, sans-serif`;
  const BOLD       = `bold ${FS}px Inter, sans-serif`;
  const ITALIC     = `italic ${FS}px Inter, sans-serif`;
  const TITLE_FS   = 16;
  const TITLE_FONT = `bold ${TITLE_FS}px Inter, sans-serif`;
  const PAD        = 8;
  const LINE_H     = Math.round(FS * 1.5);
  const ACTION_W   = 30;
  const PREP_H     = 32;
  const TITLE_H    = 36;
  const BW         = 1.5;
  const BORDER     = '#000000';
  const BG         = '#ffffff';
  const FG         = '#000000';
  const MAX_INGR   = 280;
  const MARGIN     = 2;

  const { bodyCells, title, prepSteps, totalRows, totalCols, treeH } = buildLayoutCells(recipe);

  const probe = document.createElement('canvas').getContext('2d');

  function measureW(text, font) {
    probe.font = font;
    return probe.measureText(text).width;
  }

  function wrapText(text, maxWidth) {
    probe.font = FONT;
    if (measureW(text, FONT) <= maxWidth) return [text];
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (cur && measureW(test, FONT) > maxWidth) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
  }

  let ingrW = 100;
  for (const c of bodyCells) {
    if (c.type !== 'ingredient') continue;
    const full = c.prepLabel ? c.prepLabel + ': ' + c.text : c.text;
    ingrW = Math.max(ingrW, Math.min(MAX_INGR, measureW(full, FONT) + PAD * 2));
  }

  const colW = Array.from({ length: totalCols }, (_, i) => i === 0 ? ingrW : ACTION_W);
  for (const c of bodyCells) {
    if (c.type !== 'action' && c.type !== 'finish') continue;
    colW[c.col] = Math.max(colW[c.col], c.text.split('\n').length * ACTION_W);
  }

  const rowH = new Array(totalRows).fill(PREP_H);
  const wrapped = new Map();

  for (const c of bodyCells) {
    if (c.type !== 'ingredient') continue;
    const avail = colW.slice(c.col, c.col + c.colspan).reduce((s, w) => s + w, 0) - PAD * 2;
    const full  = c.prepLabel ? c.prepLabel + ': ' + c.text : c.text;
    const lines = wrapText(full, avail);
    wrapped.set(c, lines);
    const needed = lines.length * LINE_H + PAD * 2;
    const curH   = rowH.slice(c.row, c.row + c.rowspan).reduce((s, h) => s + h, 0);
    if (needed > curH) {
      const extra = Math.ceil((needed - curH) / c.rowspan);
      for (let r = c.row; r < c.row + c.rowspan; r++) rowH[r] += extra;
    }
  }

  for (const c of bodyCells) {
    if (c.type !== 'action' && c.type !== 'finish') continue;
    const needed = measureW(c.text, BOLD) + PAD * 2;
    const curH   = rowH.slice(c.row, c.row + c.rowspan).reduce((s, h) => s + h, 0);
    if (needed > curH) {
      const extra = Math.ceil((needed - curH) / c.rowspan);
      for (let r = c.row; r < c.row + c.rowspan; r++) rowH[r] += extra;
    }
  }

  // Uniform row height: every row gets the same height as the tallest one.
  const uniformH = Math.max(...rowH);
  rowH.fill(uniformH);

  const tableW = colW.reduce((s, w) => s + w, 0);
  const titleH = title ? TITLE_H : 0;
  const tableH = titleH + prepSteps.length * PREP_H + rowH.reduce((s, h) => s + h, 0);

  const canvas = document.createElement('canvas');
  canvas.width  = (tableW + MARGIN * 2) * SCALE;
  canvas.height = (tableH + MARGIN * 2) * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = [MARGIN];
  for (const w of colW) cx.push(cx[cx.length - 1] + w);

  const ry = [MARGIN + titleH + prepSteps.length * PREP_H];
  for (const h of rowH) ry.push(ry[ry.length - 1] + h);

  // Draw only top + left edges per cell so shared edges are never doubled.
  // The table's right and bottom edges are drawn once at the end.
  function drawRect(x, y, w, h) {
    ctx.fillStyle = BG;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = BW;
    ctx.beginPath();
    ctx.moveTo(x,          y + BW / 2); ctx.lineTo(x + w, y + BW / 2); // top
    ctx.moveTo(x + BW / 2, y);          ctx.lineTo(x + BW / 2, y + h); // left
    ctx.stroke();
  }

  const fullW = cx[totalCols] - cx[0];
  if (title) {
    const x = cx[0], y = MARGIN;
    drawRect(x, y, fullW, TITLE_H);
    ctx.save();
    ctx.font = TITLE_FONT;
    ctx.fillStyle = FG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + fullW / 2, y + TITLE_H / 2);
    ctx.restore();
  }

  for (let i = 0; i < prepSteps.length; i++) {
    const x = cx[0], y = MARGIN + titleH + i * PREP_H;
    drawRect(x, y, fullW, PREP_H);
    ctx.save();
    ctx.font = ITALIC;
    ctx.fillStyle = FG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(prepSteps[i], x + fullW / 2, y + PREP_H / 2);
    ctx.restore();
  }

  for (const c of bodyCells) {
    const x = cx[c.col];
    const y = ry[c.row];
    const w = cx[c.col + c.colspan] - cx[c.col];
    const h = ry[c.row + c.rowspan] - ry[c.row];

    drawRect(x, y, w, h);

    if (c.type === 'ingredient') {
      const lines  = wrapped.get(c) || [c.text];
      const blockH = lines.length * LINE_H;
      let   ty     = y + (h - blockH) / 2 + LINE_H / 2;
      ctx.save();
      ctx.fillStyle    = FG;
      ctx.textBaseline = 'middle';
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (li === 0 && c.prepLabel) {
          const prefix = c.prepLabel + ': ';
          const after  = line.startsWith(prefix) ? line.slice(prefix.length) : line;
          ctx.font      = ITALIC;
          ctx.textAlign = 'left';
          const lw      = measureW(c.prepLabel + ':', ITALIC);
          ctx.fillText(c.prepLabel + ':', x + PAD, ty);
          ctx.font      = FONT;
          ctx.fillText(after, x + PAD + lw + 3, ty);
        } else {
          ctx.font      = FONT;
          ctx.textAlign = 'left';
          ctx.fillText(line, x + PAD, ty);
        }
        ty += LINE_H;
      }
      ctx.restore();
    } else {
      const lines   = c.text.split('\n');
      const n       = lines.length;
      const colStep = ACTION_W;
      const span    = (n - 1) * colStep;
      ctx.save();
      ctx.font         = BOLD;
      ctx.fillStyle    = FG;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(Math.PI / 2);
      for (let li = 0; li < n; li++) {
        ctx.fillText(lines[li], 0, -span / 2 + li * colStep);
      }
      ctx.restore();
    }
  }

  // Close the table with right and bottom edges (each drawn exactly once).
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = BW;
  ctx.beginPath();
  ctx.moveTo(cx[totalCols] - BW / 2, MARGIN);
  ctx.lineTo(cx[totalCols] - BW / 2, ry[totalRows]);
  ctx.moveTo(cx[0], ry[totalRows] - BW / 2);
  ctx.lineTo(cx[totalCols], ry[totalRows] - BW / 2);
  ctx.stroke();

  return canvas;
}
