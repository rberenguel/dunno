# Session Compaction Summary

## User Intent
- Fix CSP violation in the bundled `dist/dunno.html` where the browser blocked the inline IIFE bundle script
- Root cause was traced to `injectCSP` computing the wrong hash set after `recipe.js` / Sheet command changes

## Contextual Work Summary

### Investigation
- Confirmed the IIFE bundle hash was present in CSP when bundle was fresh, but stale `dist/dunno.html` had wrong hashes
- Isolated that the issue only appeared after adding the Sheet command template literal containing raw HTML

### Bug 1: Inner script tags in template literal
- The Sheet command in `js/main.js` builds a printable HTML page via a template literal containing `<script>...</script>`
- The bundler escapes `</script>` in the IIFE, but the CSP regex also saw the inner `<script>` as a separate block
- Fixed by replacing literal tags with `__SCRIPT__` / `__SCRIPT_END__` placeholders, restored with string concatenation (`'<' + 'script>'`) just before Blob creation

### Bug 2: `injectCSP` regex matching inside JS strings
- `bundle.go` `injectCSP` used `(<meta charset="UTF-8"\s*/?>\n)` to find insertion point
- The Sheet template literal contained `<meta charset="UTF-8">` (no self-closing slash), which matched
- This inserted the CSP meta tag **inside the IIFE bundle**, altering its content after the hash was computed
- Fixed by tightening the regex to `(<meta charset="UTF-8" />\n)` so it only matches the actual `index.html` tag

## Files Touched

### Application Logic
- **js/main.js**: Sheet command template literal now uses `__SCRIPT__`/`__SCRIPT_END__` placeholders instead of literal `<script>` tags; restored at runtime via string concatenation before Blob creation

### Build Tool
- **bundle.go**: `injectCSP` `reCharset` regex tightened from `(<meta charset="UTF-8"\s*/?>\n)` to `(<meta charset="UTF-8" />\n)` to prevent matching meta tags inside inlined JavaScript template literals
