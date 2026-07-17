import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Per-tenant wrapped Data Encryption Key (DEK). The DEK is generated per tenant,
// encrypted ("wrapped") with the master KEK, and stored here. Rotating the KEK
// re-wraps this row only — not every credential (design §11, envelope encryption).
export const tenantDeks = pgTable('tenant_deks', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  wrappedDek: text('wrapped_dek').notNull(), // base64: iv || authTag || ciphertext
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Encrypted platform secrets. `ciphertext` is AES-256-GCM under the tenant DEK.
// Plaintext secrets never touch this table, logs, or traces.
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    credentialType: text('credential_type').notNull().default('api_key'), // api_key | oauth_tokens
    ciphertext: text('ciphertext').notNull(), // base64: iv || authTag || ciphertext
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('credentials_tenant_platform_type_key').on(
      t.tenantId,
      t.platform,
      t.credentialType,
    ),
  ],
);
