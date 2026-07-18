import type { RiskLevel } from '../harness/types.js';

// Action → risk classification (design §10). Unknown actions fail closed to HIGH
// so a new/mistyped action can never silently auto-execute.
const HIGH = new Set([
  'post_public',
  'reply_comment',
  'reply_message',
  'publish',
  'delete',
  'send_email',
  'spend',
]);

const MEDIUM = new Set(['schedule_item', 'create_draft', 'generate_image']);

const LOW = new Set([
  'read_profile',
  'read',
  'search_web',
  'search_serp',
  'generate_draft',
  'fetch_web_page',
  'fetch_feed',
]);

export function assessRisk(action: string, _params?: Record<string, unknown>): RiskLevel {
  if (HIGH.has(action)) return 'HIGH';
  if (MEDIUM.has(action)) return 'MEDIUM';
  if (LOW.has(action)) return 'LOW';
  return 'HIGH'; // fail closed
}
