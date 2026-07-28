// ── Calc — bc-style calculator pane ───────────────────────────────────────────
// Each line is evaluated by math.js on Enter; results appear as "= value" lines.
// Variables persist within the pane's lifetime.

export function attachCalc(pane) {
  if (pane.isCalc) {
    pane.calcParser = window.math.parser();
    return;
  }
  pane.isCalc = true;
  pane.calcParser = window.math.parser();
  pane.tagEl.textContent = 'calc Del';

  pane.editorEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;

    const text = pane.jar.toString();
    let cursorOffset;
    try { cursorOffset = pane.jar.save().start; } catch { return; }

    const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
    const nlIdx     = text.indexOf('\n', lineStart);
    const lineEnd   = nlIdx === -1 ? text.length : nlIdx;
    const line      = text.slice(lineStart, lineEnd).trim();

    // Empty lines, result lines, and comments: let CodeJar handle normally.
    if (!line || line.startsWith('=') || line.startsWith('#')) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    let result;
    try {
      const val = pane.calcParser.evaluate(line);
      result = (val !== undefined && typeof val !== 'function')
        ? window.math.format(val, { precision: 14 })
        : null;
    } catch (err) {
      result = '! ' + err.message;
    }

    const resultLine = '\n= ' + (result ?? '(no value)');
    let newText, newCursor;
    if (nlIdx === -1) {
      newText   = text + resultLine + '\n';
      newCursor = newText.length; // will be fixed by guard below
    } else {
      newText   = text.slice(0, nlIdx) + resultLine + text.slice(nlIdx);
      newCursor = nlIdx + resultLine.length + 1;
    }

    // jar.restore uses strict > so it can't land at text.length.
    // Append a sentinel \n so newCursor falls within the text node.
    if (newCursor >= newText.length) newText += '\n';

    pane.jar.updateCode(newText);
    requestAnimationFrame(() => pane.jar.restore({ start: newCursor, end: newCursor }));
  }, true); // capture phase — runs before CodeJar's bubble-phase Enter handler
}
