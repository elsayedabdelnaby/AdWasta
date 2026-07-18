// Prompt-injection defense for untrusted external content (design §16). Web
// pages, SERP snippets, and pasted intel are user content — never instructions.
// The Content/arm system prompts additionally forbid obeying anything inside the
// delimiter; this function defangs the common lead-ins and prevents breakout.

const DELIMITER_OPEN = '<untrusted_content>';
const DELIMITER_CLOSE = '</untrusted_content>';

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|messages?)/gi,
  /disregard\s+(the\s+)?(above|previous|prior|all)/gi,
  /forget\s+(everything|all|the\s+above|previous)/gi,
  /new\s+instructions?\s*:/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now\b/gi,
  /act\s+as\s+(if\s+you\s+are\s+)?(a\s+)?(system|admin|developer)/gi,
  /\bBEGIN\s+SYSTEM\b/gi,
  /override\s+(the\s+)?(previous|prior|system)/gi,
];

/**
 * Neutralize injection patterns and wrap the result in the untrusted delimiter.
 * Any injected open/close delimiter tags are stripped so external content cannot
 * break out of the wrapper.
 */
export function sanitizeExternal(raw: string): string {
  let s = raw;
  // Strip any delimiter tags the content tries to inject (breakout defense).
  s = s.replace(new RegExp(`${DELIMITER_OPEN}|${DELIMITER_CLOSE}`, 'gi'), '');
  for (const pattern of INJECTION_PATTERNS) {
    s = s.replace(pattern, '[filtered]');
  }
  return `${DELIMITER_OPEN}\n${s.trim()}\n${DELIMITER_CLOSE}`;
}
