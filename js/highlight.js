const _LANG_MAP = {
  js: 'javascript', jsx: 'javascript', javascript: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
  css: 'css', scss: 'css', less: 'css',
  html: 'markup', htm: 'markup', xml: 'markup',
  md: 'markdown', markdown: 'markdown',
  yaml: 'yaml', yml: 'yaml',
  json: 'json',
  c: 'c',
  cpp: 'cpp', cc: 'cpp', 'c++': 'cpp',
  go: 'go', golang: 'go',
  py: 'python', python: 'python',
  sh: 'bash', bash: 'bash', shell: 'bash',
  rs: 'rust', rust: 'rust',
};

const _EXT_MAP = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.css': 'css', '.scss': 'css', '.less': 'css',
  '.html': 'markup', '.htm': 'markup', '.xml': 'markup',
  '.md': 'markdown', '.markdown': 'markdown',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.json': 'json',
  '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.go': 'go',
  '.py': 'python',
  '.sh': 'bash', '.bash': 'bash',
  '.rs': 'rust',
};

export function resolvePrismLang(selection, filename) {
  if (selection) {
    const key = selection.trim().toLowerCase().replace(/[^a-z0-9+]/g, '');
    if (_LANG_MAP[key]) return _LANG_MAP[key];
  }
  if (filename) {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    if (_EXT_MAP[ext]) return _EXT_MAP[ext];
  }
  return null;
}

export function makeHighlighter(language) {
  return (editor) => {
    const grammar = window.Prism?.languages?.[language];
    if (!grammar) return;
    const text = editor.textContent;
    const html = window.Prism.highlight(text, grammar, language);
    editor.innerHTML = html;
  };
}

export function getKnownLangs() {
  return Object.keys(_LANG_MAP);
}
