'use strict';

export function normalizeLabel(text) {
  return text.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n').trim();
}

// "melt: 4 oz butter" → { prep: "melt", ingredient: "4 oz butter" }
export function splitPrepLabel(text) {
  const m = text.match(/^([a-zA-Z ]{1,20}):\s*(.+)$/);
  if (m) return { prep: m[1].trim(), ingredient: m[2].trim() };
  return { prep: null, ingredient: text };
}

// Number of leaf nodes in this subtree (= rowspan of this cell).
export function calcRowspan(node) {
  if (node.children.length === 0) return 1;
  return node.children.reduce((s, c) => s + calcRowspan(c), 0);
}

// Distance from this node to its deepest leaf (= column index in the table).
export function calcHeight(node) {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(calcHeight));
}

// Numbered-depth syntax (line-by-line):
//   # Title
//   > prep step
//   N. action text   — action at depth N; higher N = closer to final dish (rightward)
//   plain text       — ingredient leaf under the most recent N. action
//   ---              — separator; everything after is a finishing step (one per line)
export function parseRecipe(md) {
  const recipe = { title: null, prepSteps: [], roots: [], finishSteps: [] };
  const stack = []; // [{number, node}]
  let inFinish = false;

  function stackTop() { return stack.length ? stack[stack.length - 1] : null; }
  function attach(node) {
    const p = stackTop();
    if (p) p.node.children.push(node);
    else recipe.roots.push(node);
  }

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim() === '---') { inFinish = true; continue; }

    if (inFinish) {
      const text = line.trim();
      if (text) recipe.finishSteps.push({ label: normalizeLabel(text), prepLabel: null, children: [] });
      continue;
    }

    const titleM = line.match(/^#\s+(.+)/);
    if (titleM) { recipe.title = titleM[1].trim(); continue; }

    const prepM = line.match(/^>\s*(.+)/);
    if (prepM) { recipe.prepSteps.push(prepM[1].trim()); continue; }

    const closeM = line.match(/^\.(\d+)\s*$/);
    if (closeM) {
      const n = parseInt(closeM[1], 10);
      while (stack.length && stack[stack.length - 1].number <= n) stack.pop();
      continue;
    }

    const actionM = line.match(/^(\d+)\.\s+(.+)/);
    if (actionM) {
      const n = parseInt(actionM[1], 10);
      const text = normalizeLabel(actionM[2].trim());
      while (stack.length && stack[stack.length - 1].number < n) stack.pop();
      const top = stackTop();
      if (top && top.number === n) {
        const { prep, ingredient } = splitPrepLabel(text);
        top.node.children.push({ label: ingredient, prepLabel: prep, children: [] });
      } else {
        const node = { label: text, prepLabel: null, children: [] };
        attach(node);
        stack.push({ number: n, node });
      }
      continue;
    }

    const text = line.trim();
    if (text) {
      const { prep, ingredient } = splitPrepLabel(text);
      attach({ label: ingredient, prepLabel: prep, children: [] });
    }
  }

  return recipe;
}

export function buildLayoutCells(recipe) {
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
        rowspan: rs, colspan: Math.max(1, parentHeight - h),
        text: node.label, prepLabel: null,
        type: 'action',
      });
      const sortedChildren = node.children.slice();
      let childRow = startRow;
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
