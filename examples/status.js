// examples/status.js — tag bar status demo for dunno
//
// Paste this into any pane and right-click Eval, or load it as a script:
//   <script src="examples/status.js"></script>
//
// Then right-click Test on any pane to see keyed status fragments in the tag bar.

(function () {
  dunno.register('Test', editor => {
    editor.setStatus('demo', 'active');
    dunno.toast('Status set — look between the icons and the tag text');
  });

  dunno.register('Lint', editor => {
    editor.setStatus('lint', '3 errors');
    editor.setStatus('type', 'go');
    dunno.toast('Lint + type status injected');
  });

  dunno.register('ClearLint', editor => {
    editor.clearStatus('lint');
    dunno.toast('Lint status cleared');
  });

  dunno.register('ClearAll', editor => {
    editor.clearAllStatus();
    dunno.toast('All status cleared');
  });

  console.log('status.js loaded — try right-clicking Lint or Test');
})();
