import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { getJwtSecret } from '../lib/tokens';

const lifetimeMs = 10 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxAttempts = 5;

function hashCode(userId: string, code: string) {
  return createHmac('sha256', getJwtSecret()).update(`email-verification:${userId}:${code}`).digest('hex');
}

function lockAccount(tx: Prisma.TransactionClient, email: string) {
  return tx.$queryRaw<{ id: string; verified: boolean; active: boolean }[]>`
    SELECT id, email_verified_at IS NOT NULL AS verified, status = 'ACTIVE' AS active
    FROM users WHERE email = ${email} FOR UPDATE
  `;
}

export async function issueVerificationCode(email: string) {
  return prisma.$transaction(async tx => {
    const [account] = await lockAccount(tx, email);
    if (!account || account.verified || !account.active) return null;
    const now = Date.now();
    const current = await tx.emailVerificationCode.findUnique({ where: { userId: account.id } });
    if (current && current.expiresAt.getTime() - lifetimeMs + resendCooldownMs > now) {
      return null;
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const data = { codeHash: hashCode(account.id, code), failedAttempts: 0, expiresAt: new Date(now + lifetimeMs) };
    await tx.emailVerificationCode.upsert({
      where: { userId: account.id },
      create: { userId: account.id, ...data },
      update: data,
    });
    return code;
  });
}

export async function verifyEmailCode(email: string, code: string) {
  const verified = await prisma.$transaction(async tx => {
    const [account] = await lockAccount(tx, email);
    if (!account || account.verified || !account.active) return false;
    const where = { userId: account.id };
    const current = await tx.emailVerificationCode.findUnique({ where });
    if (!current || current.failedAttempts >= maxAttempts) return false;
    if (current.expiresAt.getTime() <= Date.now()) return false;
    const storedHash = Buffer.from(current.codeHash, 'hex');
    const submittedHash = Buffer.from(hashCode(account.id, code), 'hex');
    if (storedHash.length !== submittedHash.length || !timingSafeEqual(storedHash, submittedHash)) {
      await tx.emailVerificationCode.update({ where, data: { failedAttempts: { increment: 1 } } });
      return false;
    }
    await tx.user.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
    await tx.emailVerificationCode.delete({ where });
    return true;
  });
  if (!verified) throw new ApiError(400, 'INVALID_VERIFICATION_CODE', 'Kod geçersiz veya süresi dolmuş. Gerekirse yeni kod isteyin.');
}
