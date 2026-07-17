// Live publish modes. `browser` is a RESERVED value only — deferred post-v1
// (ADR-001); no adapter implements it and resolveAdapter refuses it.
export type PublishMode = 'copy_pack' | 'api';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface HealthResult {
  healthy: boolean;
  detail?: string;
}

export interface ApprovedPost {
  draftId: string;
  [key: string]: unknown;
}

export interface ApprovedReply {
  engagementItemId: string;
  [key: string]: unknown;
}

export interface PublishResult {
  status: 'published' | 'ready' | 'failed';
  [key: string]: unknown;
}

export interface ReplyResult {
  status: 'sent' | 'ready' | 'failed';
  [key: string]: unknown;
}

// design §21. publishPost/reply* are optional — copy_pack fills them; api stubs
// refuse until Phase 8 activation.
export interface PlatformAdapter {
  platform: string;
  mode: PublishMode;
  validateCredentials(creds: unknown): Promise<ValidationResult>;
  healthCheck(tenantId: string): Promise<HealthResult>;
  publishPost?(input: ApprovedPost): Promise<PublishResult>;
  replyToComment?(input: ApprovedReply): Promise<ReplyResult>;
  replyToMessage?(input: ApprovedReply): Promise<ReplyResult>;
}
