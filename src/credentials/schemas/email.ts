import { z } from 'zod';

// design §21. CAN-SPAM requires a physical address + accurate From/Reply-To.
export const emailCredentialsSchema = z
  .object({
    provider: z.enum(['smtp', 'sendgrid', 'resend']),
    apiKey: z.string().min(1),
    fromAddress: z.string().email(),
    fromName: z.string().optional(),
    replyTo: z.string().email().optional(),
    physicalAddress: z.string().min(1),
    webhookSecret: z.string().optional(),
  })
  .strict();

export type EmailCredentials = z.infer<typeof emailCredentialsSchema>;
