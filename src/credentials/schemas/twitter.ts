import { z } from 'zod';

// X (Twitter) API v2 OAuth 1.0a user-context credentials (design §21, Task 8.2).
export const twitterCredentialsSchema = z
  .object({
    apiKey: z.string().min(1),
    apiSecret: z.string().min(1),
    accessToken: z.string().min(1),
    accessSecret: z.string().min(1),
  })
  .strict();

export type TwitterCredentials = z.infer<typeof twitterCredentialsSchema>;
