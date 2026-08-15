// examples/tooltips.js — overlay tooltip demo for dunno
//
// Paste this into any pane and right-click Eval, or load it as a script:
//   <script src="examples/tooltips.js"></script>
//
// Then right-click Lint on a pane to inject fake diagnostics,
// hover the underlined words to see tooltips,
// and right-click Fix or Del inside any tooltip to act on that range.

(function () {
  const SRC =
    'Hello world this is a test of the overlay tooltip system.\n' +
    'Second line here with more text to hover.\n' +
    'Third line for the info style tooltip.';

  // ── Lint : inject fake diagnostics ───────────────────────────────────────
  dunno.register('Lint', editor => {
    editor.setText(SRC);
    editor.clearOverlays();

    editor.addOverlay({
      start: 6, end: 11,
      className: 'ov-error',
      tooltip: 'Typo: should be "worlds"   Fix Del',
    });

    editor.addOverlay({
      start: 40, end: 46,
      className: 'ov-warning',
      tooltip: 'Consider: shorter phrase   Fix Del',
    });

    editor.addOverlay({
      start: 85, end: 89,
      className: 'ov-info',
      tooltip: 'Info: third item   Del',
    });

    dunno.toast('Lint: 3 overlays injected');
  });

  // ── Fix : replace the hovered range with "FIXED" ─────────────────────────
  dunno.register('Fix', editor => {
    const ov = editor.getOverlay();
    if (!ov) {
      dunno.toast('Fix: run from inside a tooltip');
      return;
    }
    const text = editor.getText();
    editor.setText(text.slice(0, ov.start) + 'FIXED' + text.slice(ov.end));
    editor.clearOverlays();
    dunno.toast(`Fixed ${ov.className} at ${ov.start}…${ov.end}`);
  });

  // ── FixRemote : send fix request to a backend via the remote socket ──────
  // Backend receives:
  //   {type:"fix", paneId:"7", filename:"notes.md", start:42, end:55, reason:"Typo"}
  dunno.register('FixRemote', editor => {
    const ov = editor.getOverlay();
    if (!ov) {
      dunno.toast('FixRemote: no overlay context');
      return;
    }
    dunno.remoteSend({
      type: 'fix',
      paneId: editor.getId(),
      filename: editor.getFilename(),
      start: ov.start,
      end: ov.end,
      className: ov.className,
      reason: ov.tooltip,
    });
    dunno.toast(`Sent fix request for ${editor.getFilename() ?? 'untitled'}`);
  });

  // ── Clear : remove all overlays ──────────────────────────────────────────
  dunno.register('Clear', editor => {
    editor.clearOverlays();
    dunno.toast('Overlays cleared');
  });

  console.log('tooltips.js loaded — try right-clicking Lint, then hover the underlines');
})();
