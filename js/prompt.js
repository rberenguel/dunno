// js/prompt.js — Chrome in-device LLM wrapper (window.ai.languageModel + legacy LanguageModel)

let _cachedApi = undefined; // { type:'ai'|'legacy', api } or null
let _cachedAvailability = undefined;

function _detectAPI() {
  if (_cachedApi !== undefined) return _cachedApi;

  // Newer Chrome built-in AI API for web pages / PWAs
  if (typeof self !== 'undefined' && self.ai && self.ai.languageModel) {
    _cachedApi = { type: 'ai', api: self.ai.languageModel };
    return _cachedApi;
  }

  // Legacy experimental API (still used in some extension contexts)
  if (typeof self !== 'undefined' && 'LanguageModel' in self) {
    _cachedApi = { type: 'legacy', api: self.LanguageModel };
    return _cachedApi;
  }

  _cachedApi = null;
  return _cachedApi;
}

/** Check whether an on-device LLM is present and ready (or downloadable). */
export async function isAvailable() {
  const entry = _detectAPI();
  if (!entry) {
    _cachedAvailability = false;
    return false;
  }

  // Re-check if we previously failed (model may have been installed since page load).
  if (_cachedAvailability === false) {
    _cachedAvailability = undefined;
  }
  if (_cachedAvailability !== undefined) return _cachedAvailability;

  try {
    if (entry.type === 'ai') {
      const caps = await entry.api.capabilities();
      // "readily"  → ready now
      // "after-download" → will trigger download on create()
      // "no"     → unavailable
      _cachedAvailability = caps.available === 'readily' || caps.available === 'after-download';
    } else {
      // Legacy LanguageModel API shape changed across Chrome builds.
      const api = entry.api;
      if (typeof api.availability === 'function') {
        const avail = await api.availability();
        // availability() returns 'unavailable' | 'available' | 'downloadable'
        // in some builds, or 'no' | 'after-download' | 'readily' in others.
        const ok = typeof avail === 'string'
          ? avail !== 'unavailable' && avail !== 'no'
          : !!avail;
        _cachedAvailability = ok;
      } else if (typeof api.capabilities === 'function') {
        const caps = await api.capabilities();
        _cachedAvailability = caps.available === 'readily' || caps.available === 'after-download';
      } else if (typeof api.params === 'function') {
        await api.params();
        _cachedAvailability = true;
      } else {
        // Can't probe availability — let create() decide.
        _cachedAvailability = true;
      }
    }
    return _cachedAvailability;
  } catch {
    _cachedAvailability = false;
    return false;
  }
}

/**
 * Run a single prompt and return the text response.
 * @param {string} text
 * @param {object} opts
 * @param {string} [opts.systemPrompt] – system prompt text
 * @param {object} [opts.createOptions] – extra options passed through to create()
 * @returns {Promise<string>}
 */
export async function runPrompt(text, opts = {}) {
  const entry = _detectAPI();
  if (!entry) throw new Error('LanguageModel not available');

  let session;
  const createOpts = { ...opts.createOptions };

  if (entry.type === 'ai') {
    if (opts.systemPrompt) createOpts.systemPrompt = opts.systemPrompt;
    session = await entry.api.create(createOpts);
  } else {
    // Legacy API: try modern shape first, fall back to old extension shape.
    if (opts.systemPrompt && !('systemPrompt' in createOpts)) {
      createOpts.systemPrompt = opts.systemPrompt;
    }
    try {
      session = await entry.api.create(createOpts);
    } catch {
      const legacyOpts = {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        ...opts.createOptions,
      };
      if (opts.systemPrompt) {
        legacyOpts.initialPrompts = [{ role: 'system', content: opts.systemPrompt }];
      }
      session = await entry.api.create(legacyOpts);
    }
  }

  const result = await session.prompt(text);
  session.destroy();
  return result;
}

/**
 * Run a prompt and parse the response as JSON.
 * @param {string} text
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function runPromptJSON(text, opts = {}) {
  const result = await runPrompt(text, opts);
  try {
    return JSON.parse(result);
  } catch (e) {
    throw new Error('LLM response is not valid JSON: ' + e.message + '\nResponse:\n' + result.slice(0, 500));
  }
}
