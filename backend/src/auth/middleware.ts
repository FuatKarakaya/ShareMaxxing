import type { RequestHandler } from 'express';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { readAccessToken } from '../lib/tokens';
import { ownUserSelect, requireActiveVerified } from './service';

export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '');
    if (!match) throw new ApiError(401, 'UNAUTHORIZED', 'Giriş yapmanız gerekiyor.');
    let userId: string;
    try {
      userId = readAccessToken(match[1]);
    } catch {
      throw new ApiError(401, 'INVALID_TOKEN', 'Oturum geçersiz veya süresi dolmuş.');
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: ownUserSelect });
    if (!user) throw new ApiError(401, 'INVALID_TOKEN', 'Oturum geçersiz veya süresi dolmuş.');
    // Check live database state, even when the token is still valid.
    requireActiveVerified(user);
    res.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
