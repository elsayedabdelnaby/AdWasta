import { z } from 'zod';

export const facebookCredentialsSchema = z
  .object({
    pageId: z.string().min(1),
    accessToken: z.string().min(1),
  })
  .strict();

export type FacebookCredentials = z.infer<typeof facebookCredentialsSchema>;
