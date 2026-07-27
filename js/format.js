// ── Format (Prettier) ──────────────────────────────────────────────────────
// Language resolution: explicit selection word > file extension > markdown (default).

const EXT_TO_PARSER = {
  js: 'babel', jsx: 'babel', mjs: 'babel', cjs: 'babel', json: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html',
  md: 'markdown', markdown: 'markdown',
  yml: 'yaml', yaml: 'yaml',
};

// Selection word aliases -> prettier `parser` value.
const ALIASES = {
  js: 'babel', javascript: 'babel', jsx: 'babel',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html',
  markdown: 'markdown', md: 'markdown',
  yaml: 'yaml', yml: 'yaml',
  json: 'json',
};

export function resolveParser(selection, filename) {
  const bySel = selection && ALIASES[selection.trim().toLowerCase()];
  if (bySel) return bySel;
  const ext = filename?.split('.').pop()?.toLowerCase();
  return (ext ? EXT_TO_PARSER[ext] : null) ?? 'markdown';
}

function _plugins() {
  const p = window.prettierPlugins || {};
  return [p.babel, p.estree, p.postcss, p.markdown, p.html, p.yaml].filter(Boolean);
}

export async function formatSource(source, parser) {
  if (!window.prettier) throw new Error('prettier not loaded');
  return window.prettier.format(source, { parser, plugins: _plugins() });
}
