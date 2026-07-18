import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, customType } from 'drizzle-orm/pg-core';

// drizzle-orm has no built-in bytea column type.
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  industry: text('industry'),
  locale: text('locale').notNull().default('en'),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantProfiles = pgTable(
  'tenant_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    description: text('description'),
    audience: text('audience'),
    goals: jsonb('goals').$type<string[]>().notNull().default([]),
    voice: text('voice'),
    competitors: jsonb('competitors').$type<string[]>().notNull().default([]),
    platforms: jsonb('platforms').$type<string[]>().notNull().default([]),
    website: text('website'),
    // Public page urls keyed by platform (facebook/instagram/...) — research
    // context, not publishing credentials (those live in platform_connections).
    socialUrls: jsonb('social_urls').$type<Record<string, string>>().notNull().default({}),
    // Logo stored inline (≤2MB, png/jpeg/webp) — served via GET /tenants/:id/logo.
    logo: bytea('logo'),
    logoMime: text('logo_mime'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tenant_profiles_tenant_id_key').on(t.tenantId)],
);
