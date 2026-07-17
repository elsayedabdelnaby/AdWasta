import type { ZodTypeAny } from 'zod';
import { facebookCredentialsSchema } from './facebook.js';
import { twitterCredentialsSchema } from './twitter.js';

export interface CredentialField {
  name: string;
  label: string;
  secret: boolean;
}

export interface CredentialRequirements {
  schema: ZodTypeAny;
  fields: CredentialField[];
}

// Per-platform credential shape + a UI-facing field descriptor (design §10, Task 0.5).
export const credentialRequirements: Record<string, CredentialRequirements> = {
  facebook: {
    schema: facebookCredentialsSchema,
    fields: [
      { name: 'pageId', label: 'Facebook Page ID', secret: false },
      { name: 'accessToken', label: 'Page Access Token', secret: true },
    ],
  },
  twitter: {
    schema: twitterCredentialsSchema,
    fields: [
      { name: 'apiKey', label: 'API Key', secret: false },
      { name: 'apiSecret', label: 'API Secret', secret: true },
      { name: 'accessToken', label: 'Access Token', secret: false },
      { name: 'accessSecret', label: 'Access Secret', secret: true },
    ],
  },
};

export function getCredentialRequirements(platform: string): CredentialRequirements | undefined {
  return credentialRequirements[platform];
}
