import type { Prisma } from '@prisma/client';
// No AI provider is configured yet. Persist a human-review item, never a "safe" verdict.
// The future WBS-24.1 worker must use updatedAt to discard stale provider results.
export async function queueHumanReview(tx: Prisma.TransactionClient, target: { targetHousingId: string } | { targetPostId: string }) {
  const existing = await tx.moderationCase.findFirst({ where: { ...target, source: 'AI', status: 'ACTIVE' } });
  if (!existing) await tx.moderationCase.create({ data: { ...target, source: 'AI', aiUnavailable: true, reason: 'AI_UNAVAILABLE' } });
}
