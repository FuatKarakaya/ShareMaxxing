import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../auth/middleware';
import { invalid, object, text, uuid } from '../content/validation';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export function createReportRouter(): Router {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Çok fazla rapor isteği. Lütfen daha sonra tekrar deneyin.' } },
  });

  router.post('/', authenticate, limit, async (req, res, next) => {
    try {
      const body = object(req.body, ['targetType', 'targetId', 'reason']);
      const id = uuid(body.targetId).toLowerCase();
      const reason = text(body.reason, 1000);
      const reporterId: string = res.locals.user.id;

      const report = await prisma.$transaction(async tx => {
        let target;
        let rows: { id: string }[];
        switch (body.targetType) {
          case 'USER':
            if (id === reporterId) throw invalid();
            target = { targetUserId: id };
            rows = await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid AND email_verified_at IS NOT NULL FOR UPDATE`;
            break;
          case 'TRIP':
            target = { targetTripId: id };
            rows = await tx.$queryRaw`SELECT id FROM trips WHERE id = ${id}::uuid FOR UPDATE`;
            break;
          case 'HOUSING':
            target = { targetHousingId: id };
            rows = await tx.$queryRaw`SELECT id FROM housing_listings WHERE id = ${id}::uuid AND hidden_at IS NULL FOR UPDATE`;
            break;
          case 'POST': {
            target = { targetPostId: id };
            // The forum uses the question row to serialize edits and deletion of its answers.
            const post = await tx.forumPost.findUnique({ where: { id }, select: { parentPostId: true } });
            if (!post) throw missingTarget();
            const questionId = post.parentPostId ?? id;
            const question = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM forum_posts WHERE id = ${questionId}::uuid AND hidden_at IS NULL FOR UPDATE`;
            if (!question.length) throw missingTarget();
            rows = await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${id}::uuid AND hidden_at IS NULL`;
            break;
          }
          default:
            throw invalid();
        }
        if (!rows.length) throw missingTarget();
        const where = { ...target, source: 'USER' as const, status: 'ACTIVE' as const, reporterId };
        if (await tx.moderationCase.findFirst({ where, select: { id: true } })) {
          throw new ApiError(409, 'REPORT_ALREADY_OPEN', 'Bu hedef için açık bir bildiriminiz var.');
        }
        return tx.moderationCase.create({ data: { ...where, reason }, select: { id: true, status: true } });
      });

      res.status(201).json({ report });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

function missingTarget() {
  return new ApiError(404, 'REPORT_TARGET_NOT_FOUND', 'Bildirim yapılacak hedef bulunamadı.');
}
