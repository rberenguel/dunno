# Session Compaction Summary

## User Intent
- Fix the dunno "Prompt" command so it triggers on-device LLM model downloads, matching the behavior in the `times` Chrome extension
- Make the prompt system robust across different Chrome API shapes and origins
- Document the exposed prompt APIs for plugin developers

## Contextual Work Summary

### Root Cause Analysis
- Discovered `times` works because it's a Chrome extension on `chrome-extension://` origin where the legacy `LanguageModel` global is exposed
- dunno as a web app on `http://localhost` sees no AI APIs at all — Chrome gates built-in AI to **secure contexts (HTTPS)** even with flags enabled
- Once served over HTTPS, dunno detected a *different* API shape: a constructor with `.availability()` and `.create()`, not the old `.params()` namespace

### Prompt Engine Rewrite
- Rewrote `js/prompt.js` to detect and handle **both** API families:
  - Modern: `window.ai.languageModel` (web/PWA path)
  - Legacy: `self.LanguageModel` (extension path, plus the HTTPS web variant)
- Added cascading availability probes: `.availability()` → `.capabilities()` → `.params()` → blind allow
- Added cascading create options: modern `{systemPrompt}` first, then legacy `{expectedInputs, expectedOutputs, initialPrompts}` fallback
- Removed the permanent negative cache so installing a model after page load is detected on next click

### Documentation
- Added three new methods to `agents/architecture.md`:
  - `dunno.prompt(text, opts?)` — `Promise<string>`
  - `dunno.promptJSON(text, opts?)` — `Promise<object>`
  - `dunno.isPromptAvailable()` — `Promise<boolean>`
- Added a complete plugin example showing prompt + `editor.split()` for output
- Documented the HTTPS requirement explicitly

### Build
- Ran `go run bundle.go` to rebuild the woven single-file artifact so the prompt changes are available in `dist/dunno.html`.

## Files Touched

### Core Logic
- **js/prompt.js**: Complete rewrite. Dual API detection, multi-shape availability probing, fallback create options, cache invalidation. All debug logging stripped in final version.

### Documentation
- **agents/architecture.md**: Added `dunno.prompt`, `dunno.promptJSON`, `dunno.isPromptAvailable` to the API table plus a new "Run on-device LLM prompts from a plugin" section with example code and HTTPS requirement note.

### Build Output
- **dist/dunno.html**: Rebuilt via `bundle.go` to inline the updated `js/prompt.js` into the single-file distribution.
