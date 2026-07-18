import { sanitizeExternal } from '../guardrails/sanitize-external.js';

// v1 path for social-post-level signals (design §12 tier 2): the user pastes
// competitor post text/screenshot transcriptions. Untrusted → sanitized before
// it can enter any LLM context.
export interface PastedIntel {
  raw: string;
  sanitized: string;
}

export function readPastedIntel(text: string): PastedIntel {
  return { raw: text, sanitized: sanitizeExternal(text) };
}
