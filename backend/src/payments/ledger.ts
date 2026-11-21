import { Prisma, type LedgerEventType } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Ledger (WBS-14.1, database plan §4.4). This is the only place that inserts
// payment_ledger rows. The table is append-only (a trigger rejects UPDATE/DELETE).

// Records one event. The caller must hold the payment row lock (SELECT … FOR UPDATE),
// so the existence check cannot race. Returns false when the event already exists:
// duplicate callbacks are no-ops. (Catching a unique violation instead would abort
// the whole Postgres transaction.)
export async function recordLedgerEvent(
  tx: Prisma.TransactionClient,
  paymentId: string,
  eventType: LedgerEventType,
  amountMinor: bigint,
): Promise<boolean> {
  const existing = await tx.paymentLedgerEntry.findUnique({
    where: { paymentId_eventType: { paymentId, eventType } },
    select: { id: true },
  });
  if (existing) return false;
  await tx.paymentLedgerEntry.create({ data: { paymentId, eventType, amountMinor } });
  return true;
}

export type LedgerMismatch = {
  paymentId: string;
  status: string;
  amountMinor: bigint;
  receivedMinor: bigint;
  heldMinor: bigint;
  releasedMinor: bigint;
  refundedMinor: bigint;
};

// Balance check (FR-25, NFR-06), from the payment_reconciliation view:
// - every payment: received = held + released + refunded;
// - collected payments (HELD/RELEASED/REFUNDED): received = the payment amount,
//   and the ledger state matches the payment status;
// - uncollected payments (CREATED/PENDING/FAILED): no ledger rows.
export async function findLedgerMismatches(paymentIds?: string[]): Promise<LedgerMismatch[]> {
  const filter = paymentIds
    ? Prisma.sql`AND r.payment_id = ANY(${paymentIds}::uuid[])`
    : Prisma.empty;
  return prisma.$queryRaw<LedgerMismatch[]>`
    SELECT r.payment_id AS "paymentId", p.status::text AS status, r.amount_minor::bigint AS "amountMinor",
      r.received_minor::bigint AS "receivedMinor", r.held_minor::bigint AS "heldMinor",
      r.released_minor::bigint AS "releasedMinor", r.refunded_minor::bigint AS "refundedMinor"
    FROM payment_reconciliation r
    JOIN payments p ON p.id = r.payment_id
    WHERE TRUE ${filter} AND (
      r.received_minor <> r.held_minor + r.released_minor + r.refunded_minor
      OR (p.status IN ('HELD', 'RELEASED', 'REFUNDED') AND r.received_minor <> r.amount_minor)
      OR (p.status = 'HELD' AND r.held_minor <> r.amount_minor)
      OR (p.status = 'RELEASED' AND r.released_minor <> r.amount_minor)
      OR (p.status = 'REFUNDED' AND r.refunded_minor <> r.amount_minor)
      OR (p.status IN ('CREATED', 'PENDING', 'FAILED') AND r.received_minor <> 0)
    )
    ORDER BY r.payment_id`;
}
