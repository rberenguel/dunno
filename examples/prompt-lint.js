// examples/prompt-lint.js — LLM-powered linting via dunno.promptJSON
//
// Paste this into any pane and right-click Eval, or load it as a script:
//   <script src="examples/prompt-lint.js"></script>
//
// Then select text (or the whole pane) and right-click LintAI.
// If Chrome's in-device LLM is available, it returns structured JSON
// diagnostics that are rendered as overlays (red/yellow squiggles).
//
// Expected LLM response format:
//   { "issues": [
//       { "start": 10, "end": 15, "message": "typo", "severity": "error" },
//       { "start": 30, "end": 40, "message": "unclear", "severity": "warning" }
//   ] }

(function () {
  const SYSTEM =
    'You are a copy editor. When given text, reply with ONLY a JSON object. ' +
    'The schema is: {issues:[{start:number,end:number,message:string,severity:"error"|"warning"|"info"}]}.' +
    'start/end are zero-based character offsets in the original text. ' +
    'severity defaults to "warning" if omitted.';

  dunno.register('LintAI', async editor => {
    const available = await dunno.isPromptAvailable();
    if (!available) {
      dunno.toast('LintAI: no on-device LLM (enable Chrome Language Model flags)');
      return;
    }

    const text = editor.getText();
    if (!text.trim()) {
      dunno.toast('LintAI: pane is empty');
      return;
    }

    editor.setStatus('lintai', '⏳');

    try {
      const json = await dunno.promptJSON(
        'Find issues in this text. Return JSON only.\n\n' + text,
        { systemPrompt: SYSTEM }
      );

      editor.clearOverlays();
      const issues = json.issues || [];
      let errors = 0, warnings = 0, infos = 0;

      for (const issue of issues) {
        const sev = (issue.severity || 'warning').toLowerCase();
        const cls = sev === 'error' ? 'ov-error' : sev === 'info' ? 'ov-info' : 'ov-warning';
        if (sev === 'error') errors++;
        else if (sev === 'info') infos++;
        else warnings++;

        editor.addOverlay({
          start: Math.max(0, Math.min(issue.start || 0, text.length)),
          end:   Math.max(0, Math.min(issue.end   || 0, text.length)),
          className: cls,
          tooltip: (issue.message || 'issue') + '   Del',
        });
      }

      const parts = [];
      if (errors)   parts.push(errors   + ' error');
      if (warnings) parts.push(warnings + ' warning');
      if (infos)    parts.push(infos    + ' info');

      if (parts.length) {
        editor.setStatus('lintai', parts.join(' · '));
        dunno.toast('LintAI: ' + parts.join(', '));
      } else {
        editor.clearStatus('lintai');
        dunno.toast('LintAI: no issues found');
      }
    } catch (e) {
      editor.clearStatus('lintai');
      dunno.toast('LintAI failed: ' + e.message);
    }
  });

  dunno.register('ClearLintAI', editor => {
    editor.clearOverlays();
    editor.clearStatus('lintai');
    dunno.toast('LintAI cleared');
  });

  console.log('prompt-lint.js loaded — try right-clicking LintAI');
})();
