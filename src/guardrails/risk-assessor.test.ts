import { describe, it, expect } from 'vitest';
import { assessRisk } from './risk-assessor.js';
import { canExecute } from './permissions.js';

describe('assessRisk (design §10)', () => {
  it('classifies the HIGH-risk actions', () => {
    for (const a of ['post_public', 'reply_comment', 'reply_message', 'publish', 'delete', 'send_email']) {
      expect(assessRisk(a)).toBe('HIGH');
    }
  });

  it('classifies MEDIUM-risk actions', () => {
    for (const a of ['schedule_item', 'create_draft', 'generate_image']) {
      expect(assessRisk(a)).toBe('MEDIUM');
    }
  });

  it('classifies LOW-risk actions', () => {
    for (const a of ['read_profile', 'search_web', 'generate_draft']) {
      expect(assessRisk(a)).toBe('LOW');
    }
  });

  it('defaults unknown actions to HIGH (fail closed)', () => {
    expect(assessRisk('something_new')).toBe('HIGH');
  });
});

describe('canExecute — harness gate before adapter (design §10)', () => {
  it('blocks HIGH-risk actions without approval', () => {
    expect(canExecute('t1', 'publish', 'pending').allowed).toBe(false);
    expect(canExecute('t1', 'reply_message', 'rejected').allowed).toBe(false);
    expect(canExecute('t1', 'publish', undefined).allowed).toBe(false);
  });

  it('allows HIGH-risk actions once approved', () => {
    expect(canExecute('t1', 'publish', 'approved').allowed).toBe(true);
  });

  it('allows LOW and MEDIUM actions without approval', () => {
    expect(canExecute('t1', 'search_web', undefined).allowed).toBe(true);
    expect(canExecute('t1', 'generate_image', undefined).allowed).toBe(true);
  });
});
