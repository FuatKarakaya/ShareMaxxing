import { Prisma, type User, type ForumPost } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { invalid, object, text, uuid, page } from '../content/validation';
import { queueHumanReview } from '../content/review';
type Actor = Pick<User, 'id' | 'role'>;
const include = { author: { select: { id: true, displayName: true } }, category: true };
const missing = () => new ApiError(404, 'NOT_FOUND', 'Gönderi bulunamadı.');
const visible = (row: ForumPost, actor: Actor) => !row.hiddenAt || row.authorId === actor.id || actor.role !== 'USER';
function input(value: unknown, question: boolean, partial = false) {
  const data = object(value, question ? ['title', 'body', 'categoryId'] : ['body']);
  if (!Object.keys(data).length) throw invalid();
  const result: { title?: string; body?: string; categoryId?: string } = {};
  for (const key of question ? ['title', 'body', 'categoryId'] as const : ['body'] as const) {
    if (!partial || key in data) result[key] = key === 'categoryId' ? uuid(data[key]) : text(data[key], key === 'title' ? 180 : 6000);
  }
  return result;
}
async function category(tx: Prisma.TransactionClient, id?: string) {
  if (id && !await tx.forumCategory.findUnique({ where: { id } })) throw invalid();
}
export async function listQuestions(actor: Actor, query: unknown, mine = false) {
  const data = object(query, ['categoryId', 'page', 'q']);
  const current = page(data.page);
  const where: Prisma.ForumPostWhereInput = { kind: 'QUESTION', ...(mine ? { authorId: actor.id } : { hiddenAt: null }) };
  if (data.categoryId !== undefined) where.categoryId = uuid(data.categoryId);
  if (data.q !== undefined) {
    if (typeof data.q !== 'string' || data.q.length > 200) throw invalid();
    const keyword = data.q.trim();
    if (keyword) {
      // Prisma contains uses LIKE: escape metacharacters for literal substring search.
      const contains = keyword.replace(/[\\%_]/g, '\\$&');
      const match = { contains, mode: 'insensitive' as const };
      where.OR = [
        { title: match }, { body: match },
        { answers: { some: { kind: 'ANSWER', hiddenAt: null, body: match } } },
      ];
    }
  }
  const rows = await prisma.forumPost.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (current - 1) * 20, take: 21 });
  return { questions: rows.slice(0, 20), page: current, hasMore: rows.length > 20 };
}
export async function questionDetail(actor: Actor, id: string, query: unknown) {
  uuid(id);
  const current = page(object(query, ['page']).page);
  const question = await prisma.forumPost.findUnique({ where: { id }, include });
  if (!question || question.kind !== 'QUESTION' || !visible(question, actor)) throw missing();
  const rows = await prisma.forumPost.findMany({ where: { parentPostId: id, ...(actor.role === 'USER' ? { OR: [{ hiddenAt: null }, { authorId: actor.id }] } : {}) }, include, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (current - 1) * 20, take: 21 });
  return { question, answers: rows.slice(0, 20), page: current, hasMore: rows.length > 20 };
}
export async function createQuestion(actor: Actor, value: unknown) {
  const data = input(value, true);
  return prisma.$transaction(async tx => {
    await category(tx, data.categoryId);
    const row = await tx.forumPost.create({ data: { authorId: actor.id, kind: 'QUESTION', title: data.title!, body: data.body!, categoryId: data.categoryId! }, include });
    await queueHumanReview(tx, { targetPostId: row.id });
    return row;
  });
}
export type ReplyEvent = { questionId: string; answerId: string; recipientId: string };
export type ReplyEmail = (event: ReplyEvent) => Promise<void>;
export async function createAnswer(actor: Actor, id: string, value: unknown, sendEmail?: ReplyEmail) {
  uuid(id);
  const data = input(value, false);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${id}::uuid FOR UPDATE`;
    const parent = await tx.forumPost.findUnique({ where: { id } });
    if (!parent || !visible(parent, actor)) throw missing();
    if (parent.kind !== 'QUESTION') throw invalid();
    const answer = await tx.forumPost.create({ data: { authorId: actor.id, kind: 'ANSWER', parentPostId: id, body: data.body! }, include });
    await queueHumanReview(tx, { targetPostId: answer.id });
    const event = parent.authorId === actor.id ? null : { questionId: id, answerId: answer.id, recipientId: parent.authorId };
    if (event) await tx.notification.create({ data: { recipientId: event.recipientId, kind: 'FORUM_REPLY', payload: { questionId: id, answerId: answer.id, link: `/forum/${id}`, text: 'Sorunuza yeni bir yanıt geldi.' } } });
    return { answer, event };
  });
  if (result.event) {
    // Delivery is after commit, so provider failure cannot roll back a published answer.
    try {
      if (!sendEmail) throw new Error('Reply email delivery is not configured.');
      await sendEmail(result.event);
    } catch { console.warn('FORUM_REPLY_EMAIL_UNAVAILABLE', result.answer.id); }
  }
  return result.answer;
}
export async function changePost(actor: Actor, id: string, value?: unknown, remove = false) {
  uuid(id);
  return prisma.$transaction(async tx => {
    const initial = await tx.forumPost.findUnique({ where: { id } });
    if (!initial) throw missing();
    const parentId = initial.parentPostId ?? id;
    await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${parentId}::uuid FOR UPDATE`;
    const row = await tx.forumPost.findUnique({ where: { id } });
    if (!row) throw missing();
    if (row.authorId !== actor.id) throw new ApiError(403, 'FORBIDDEN', 'Yalnızca kendi gönderinizi değiştirebilirsiniz.');
    if (!remove) {
      const data = input(value, row.kind === 'QUESTION', true);
      await category(tx, data.categoryId);
      const updated = await tx.forumPost.update({ where: { id }, data, include });
      await queueHumanReview(tx, { targetPostId: id });
      return updated;
    }
    const answers = row.kind === 'QUESTION' ? await tx.forumPost.findMany({ where: { parentPostId: id }, select: { id: true } }) : [];
    await tx.moderationCase.updateMany({ where: { targetPostId: { in: [id, ...answers.map(answer => answer.id)] }, status: 'ACTIVE' }, data: { status: 'SOLVED', resolution: 'CONTENT_DELETED', resolvedAt: new Date() } });
    await tx.forumPost.delete({ where: { id } });
    return null;
  });
}
