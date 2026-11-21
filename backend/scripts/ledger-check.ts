import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { findLedgerMismatches } from '../src/payments/ledger';

// npm run ledger:check — lists payments whose balances do not match the ledger (WBS-14.1).
async function main() {
  const mismatches = await findLedgerMismatches();
  if (!mismatches.length) {
    console.log('Ledger OK: every payment matches its ledger entries.');
    return;
  }
  console.error(`${mismatches.length} payment(s) do not match the ledger:`);
  for (const m of mismatches) {
    console.error(`- ${m.paymentId} (${m.status}): amount ${m.amountMinor}, received ${m.receivedMinor}, `
      + `held ${m.heldMinor}, released ${m.releasedMinor}, refunded ${m.refundedMinor}`);
  }
  process.exitCode = 1;
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'Ledger check failed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
