import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config/env.js';
import { createDb } from '../src/db/client.js';
import { tenants, tenantProfiles } from '../src/db/schema/tenants.js';
import { memberships } from '../src/db/schema/memberships.js';
import { messagingAngles } from '../src/db/schema/messaging-angles.js';
import { contentDrafts } from '../src/db/schema/content-drafts.js';
import { publishedItems } from '../src/db/schema/approval-queue.js';
import { postMetrics } from '../src/db/schema/post-metrics.js';

// Demo tenant "Aurora Coffee Co" (design §7.2). 6 published items with post_metrics
// containing a planted winning angle and a losing one — drives the Analyst demo.
try {
  process.loadEnvFile('.env');
} catch {
  /* rely on the process environment */
}

const DEMO_USER = process.env.DEMO_USER ?? 'demo-owner';
const db = createDb(loadConfig());

async function seedAngleItems(tenantId: string, angleId: string, likes: number): Promise<void> {
  await db.withTenant(tenantId, async (tx) => {
    for (let i = 0; i < 3; i++) {
      const [draft] = await tx.insert(contentDrafts).values({ tenantId, angleId, channel: 'social', platform: 'facebook', body: `demo post ${i}`, status: 'approved' }).returning({ id: contentDrafts.id });
      const [item] = await tx.insert(publishedItems).values({ tenantId, draftId: draft!.id, platform: 'facebook' }).returning({ id: publishedItems.id });
      await tx.insert(postMetrics).values({ tenantId, publishedItemId: item!.id, reach: 100, likes });
    }
  });
}

try {
  const existing = await db.adminPool.query("SELECT id FROM tenants WHERE name = 'Aurora Coffee Co'");
  if (existing.rowCount && existing.rowCount > 0) {
    // eslint-disable-next-line no-console
    console.log('demo tenant already seeded:', existing.rows[0].id);
  } else {
    const tenantId = randomUUID();
    await db.withTenant(tenantId, async (tx) => {
      await tx.insert(tenants).values({ id: tenantId, name: 'Aurora Coffee Co', industry: 'specialty coffee DTC' });
      await tx.insert(memberships).values({ tenantId, userId: DEMO_USER, role: 'owner' });
      await tx.insert(tenantProfiles).values({ tenantId, description: 'Specialty coffee, direct to consumer', audience: 'local cafe-goers + online subscribers', voice: 'warm, unpretentious', platforms: ['facebook', 'twitter'], competitors: ['Blue Bottle', 'Stumptown'] });
    });
    const [winner, loser] = await db.withTenant(tenantId, async (tx) => {
      const rows = await tx.insert(messagingAngles).values([
        { tenantId, channel: 'social', angle: 'local sourcing story' },
        { tenantId, channel: 'social', angle: 'generic discount' },
      ]).returning({ id: messagingAngles.id });
      return [rows[0]!.id, rows[1]!.id];
    });
    await seedAngleItems(tenantId, winner, 25); // planted winner (25% engagement)
    await seedAngleItems(tenantId, loser, 2); // planted loser (2% engagement)
    // eslint-disable-next-line no-console
    console.log('seeded demo tenant Aurora Coffee Co:', tenantId, '| demo user:', DEMO_USER);
  }
} finally {
  await db.close();
}
