import { Prisma, type User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ApiError } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/passwords';
import { prisma } from '../lib/prisma';
import { issueAccessToken, tokenLifetimeSeconds } from '../lib/tokens';

export const ownUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export function requireActiveVerified(user: Pick<User, 'status' | 'emailVerifiedAt'>): void {
  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Hesabınız askıya alınmış.');
  }
  if (!user.emailVerifiedAt) {
    throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Önce e-posta adresinizi doğrulayın.');
  }
}

export async function signup(input: { email: string; password: string; displayName: string }) {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { email: input.email, displayName: input.displayName, passwordHash },
      select: ownUserSelect,
    });
    return { user, verificationRequired: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Bu e-posta adresi zaten kayıtlı.');
    }
    throw error;
  }
}

let dummyHash: Promise<string> | undefined;

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Still perform a password comparison for unknown accounts.
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  const validPassword = await verifyPassword(input.password, user?.passwordHash ?? await dummyHash);
  if (!user || !validPassword) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-posta veya parola hatalı.');
  }
  requireActiveVerified(user);
  const { id, email, displayName, role, status, emailVerifiedAt, createdAt } = user;
  return {
    accessToken: issueAccessToken(user.id),
    tokenType: 'Bearer',
    expiresIn: tokenLifetimeSeconds,
    user: { id, email, displayName, role, status, emailVerifiedAt, createdAt },
  };
}
