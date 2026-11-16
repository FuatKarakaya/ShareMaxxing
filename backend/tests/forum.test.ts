import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';
import { createAnswer } from '../src/forum/service';
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use npm test.');
const prefix = `forum-${randomUUID()}`;
const api = request(createApp());
let owner: { id: string; token: string; role: 'USER' }, other: typeof owner;
let categoryId: string;
async function user() {
  const row = await prisma.user.create({ data: { email: `${prefix}-${randomUUID()}@itu.edu.tr`, displayName: 'Öğrenci', passwordHash: 'unused', emailVerifiedAt: new Date() } });
  return { id: row.id, token: issueAccessToken(row.id), role: 'USER' as const };
}
beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
  owner = await user(); other = await user(); categoryId = (await prisma.forumCategory.findFirstOrThrow()).id;
});
afterAll(async () => {
  await prisma.moderationCase.deleteMany({ where: { OR: [{ targetPost: { author: { email: { startsWith: prefix } } } }, { reason: prefix }] } });
  await prisma.notification.deleteMany({ where: { recipient: { email: { startsWith: prefix } } } });
  await prisma.forumPost.deleteMany({ where: { author: { email: { startsWith: prefix } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});
const payload = () => ({ categoryId, title: 'Kampüs sorusu', body: 'Kütüphane ne zaman açık?' });
const post = (data: unknown = payload()) => api.post('/api/forum/questions').auth(owner.token, { type: 'bearer' }).type('json').send(JSON.stringify(data));
test('requires live verified active authentication for forum reads/writes', async () => {
  await api.get('/api/forum/questions').expect(401);
  await prisma.user.update({ where: { id: other.id }, data: { emailVerifiedAt: null } });
  await api.get('/api/forum/categories').auth(other.token, { type: 'bearer' }).expect(403);
  await prisma.user.update({ where: { id: other.id }, data: { emailVerifiedAt: new Date(), status: 'SUSPENDED' } });
  await api.get('/api/forum/questions').auth(other.token, { type: 'bearer' }).expect(403);
  await prisma.user.update({ where: { id: other.id }, data: { status: 'ACTIVE' } });
});
test('validates shape, blank/overlong content, lookups, UUIDs and pagination', async () => {
  for (const data of [{}, { ...payload(), title: ' ' }, { ...payload(), body: 'x'.repeat(6001) }, { ...payload(), categoryId: randomUUID() }, { ...payload(), kind: 'ANSWER' }, { ...payload(), parentPostId: randomUUID() }]) await post(data).expect(400);
  for (const query of ['page=0', 'categoryId=bad', 'page=1&page=2', 'kind=ANSWER']) await api.get(`/api/forum/questions?${query}`).auth(owner.token, { type: 'bearer' }).expect(400);
  await api.get('/api/forum/questions/bad').auth(owner.token, { type: 'bearer' }).expect(400);
});
test('creates and filters questions with only display-safe author fields', async () => {
  const row = (await post().expect(201)).body.question;
  const r = await api.get(`/api/forum/questions?categoryId=${categoryId}`).auth(other.token, { type: 'bearer' }).expect(200);
  expect(r.body.questions.map((x: { id: string }) => x.id)).toContain(row.id);
  expect(JSON.stringify(row)).not.toMatch(/password|@itu.edu.tr/);
  expect(row.category.id).toBe(categoryId);
  await api.get('/api/forum/categories').auth(owner.token, { type: 'bearer' }).expect(200).expect(r => expect(r.body.categories).toHaveLength(6));
});
test('rejects answer-to-answer and injected category/parent/title, creates one notification after a reply', async () => {
  const q = (await post().expect(201)).body.question;
  const email = jest.fn(async () => {});
  const a = await createAnswer(other, q.id, { body: 'Akşam da açık.' }, email);
  expect(email).toHaveBeenCalledTimes(1);
  expect(await prisma.notification.count({ where: { recipientId: owner.id, kind: 'FORUM_REPLY', payload: { path: ['answerId'], equals: a.id } } })).toBe(1);
  await api.post(`/api/forum/questions/${a.id}/answers`).auth(other.token, { type: 'bearer' }).send({ body: 'Yanıt' }).expect(400);
  await api.post(`/api/forum/questions/${q.id}/answers`).auth(other.token, { type: 'bearer' }).send({ body: 'Yanıt', categoryId }).expect(400);
  await createAnswer(owner, q.id, { body: 'Kendi yanıtım.' }, email);
  expect(email).toHaveBeenCalledTimes(1);
});
test('email failure after commit keeps the answer and its notification', async () => {
  const q = (await post().expect(201)).body.question;
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const a = await createAnswer(other, q.id, { body: 'Bilgi' }, async () => { throw new Error('Provider unavailable'); });
    expect(await prisma.forumPost.findUnique({ where: { id: a.id } })).not.toBeNull();
    expect(await prisma.notification.count({ where: { recipientId: owner.id, payload: { path: ['answerId'], equals: a.id } } })).toBe(1);
    expect(warning).toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});
test('only author may edit/delete, including when a different caller is admin', async () => {
  const q = (await post().expect(201)).body.question;
  await prisma.user.update({ where: { id: other.id }, data: { role: 'ADMIN' } });
  await api.patch(`/api/forum/posts/${q.id}`).auth(other.token, { type: 'bearer' }).send({ title: 'Değişti' }).expect(403);
  await api.delete(`/api/forum/posts/${q.id}`).auth(other.token, { type: 'bearer' }).expect(403);
  await prisma.user.update({ where: { id: other.id }, data: { role: 'USER' } });
  await api.patch(`/api/forum/posts/${q.id}`).auth(owner.token, { type: 'bearer' }).send({ title: 'Yeni başlık', body: 'Düzenlendi' }).expect(200);
  await api.patch(`/api/forum/posts/${q.id}`).auth(owner.token, { type: 'bearer' }).send({}).expect(400);
  expect(await prisma.moderationCase.count({ where: { targetPostId: q.id, status: 'ACTIVE' } })).toBe(1);
});
test('hidden questions/answers are omitted for other students but accessible to their author or staff', async () => {
  const q = (await post().expect(201)).body.question;
  const a = await createAnswer(owner, q.id, { body: 'Gizli yanıt' });
  await prisma.forumPost.update({ where: { id: a.id }, data: { hiddenAt: new Date() } });
  const detail = await api.get(`/api/forum/questions/${q.id}`).auth(other.token, { type: 'bearer' }).expect(200);
  expect(detail.body.answers).toHaveLength(0);
  await prisma.forumPost.update({ where: { id: q.id }, data: { hiddenAt: new Date() } });
  await api.get(`/api/forum/questions/${q.id}`).auth(other.token, { type: 'bearer' }).expect(404);
  await api.get(`/api/forum/questions/${q.id}`).auth(owner.token, { type: 'bearer' }).expect(200);
  const list = await api.get('/api/forum/questions').auth(owner.token, { type: 'bearer' }).expect(200);
  expect(list.body.questions.some((x: { id: string }) => x.id === q.id)).toBe(false);
});
test('deleting a question cascades answers and solves all their active cases', async () => {
  const q = (await post().expect(201)).body.question;
  const a = await createAnswer(owner, q.id, { body: 'Yanıt' });
  await prisma.moderationCase.updateMany({ where: { targetPostId: { in: [q.id, a.id] } }, data: { reason: prefix } });
  await api.delete(`/api/forum/posts/${q.id}`).auth(owner.token, { type: 'bearer' }).expect(204);
  expect(await prisma.forumPost.count({ where: { id: { in: [q.id, a.id] } } })).toBe(0);
  const cases = await prisma.moderationCase.findMany({ where: { reason: prefix } });
  expect(cases).toHaveLength(2);
  expect(cases.every(c => c.status === 'SOLVED' && c.targetPostId === null && c.resolution === 'CONTENT_DELETED')).toBe(true);
});
test('paginates answers in stable chronological order', async () => {
  const q = (await post().expect(201)).body.question;
  await prisma.forumPost.createMany({ data: Array.from({ length: 22 }, (_, i) => ({ authorId: owner.id, kind: 'ANSWER' as const, parentPostId: q.id, body: `Yanıt ${i}` })) });
  const ids: string[] = [];
  for (const page of [1, 2]) {
    const r = await api.get(`/api/forum/questions/${q.id}?page=${page}`).auth(owner.token, { type: 'bearer' }).expect(200);
    if (page === 1) expect(r.body.hasMore).toBe(true);
    ids.push(...r.body.answers.map((x: { id: string }) => x.id));
  }
  expect(ids).toHaveLength(22); expect(new Set(ids).size).toBe(22);
});

test('searches literal title/body and visible replies without exposing hidden posts', async () => {
  const key = randomUUID();
  const title = (await post({ ...payload(), title: `${key} Campus` }).expect(201)).body.question;
  const body = (await post({ ...payload(), body: `${key} campus` }).expect(201)).body.question;
  const reply = (await post().expect(201)).body.question;
  const hiddenReply = (await post().expect(201)).body.question;
  await prisma.forumPost.createMany({ data: [
    { authorId: owner.id, kind: 'ANSWER', parentPostId: reply.id, body: `${key} CAMPUS` },
    { authorId: owner.id, kind: 'ANSWER', parentPostId: hiddenReply.id, body: `${key} campus`, hiddenAt: new Date() },
  ] });
  const search = (q: string, extra = '') => api.get(`/api/forum/questions?q=${encodeURIComponent(q)}${extra}`).auth(other.token, { type: 'bearer' });
  const results = await search(`  ${key} campus  `).expect(200);
  expect(results.body.questions.map((q: { id: string }) => q.id).sort()).toEqual([title.id, body.id, reply.id].sort());
  await prisma.forumPost.update({ where: { id: title.id }, data: { hiddenAt: new Date() } });
  expect((await search(key).expect(200)).body.questions.map((q: { id: string }) => q.id)).not.toContain(title.id);
  expect((await search(key, `&categoryId=${randomUUID()}`).expect(200)).body.questions).toEqual([]);
  const literal = `${key}%_\\`;
  const exact = (await post({ ...payload(), body: literal }).expect(201)).body.question;
  expect((await search(literal).expect(200)).body.questions.map((q: { id: string }) => q.id)).toEqual([exact.id]);
  expect((await search(randomUUID()).expect(200)).body.questions).toEqual([]);
  for (const query of ['q=a&q=b', 'q[x]=a', `q=${'x'.repeat(201)}`]) {
    await api.get(`/api/forum/questions?${query}`).auth(other.token, { type: 'bearer' }).expect(400);
  }
  await search('   ').expect(200);
  await api.get(`/api/forum/questions/mine?q=${key}`).auth(owner.token, { type: 'bearer' }).expect(200)
    .expect(r => expect(r.body.questions.some((q: { id: string }) => q.id === title.id)).toBe(true));
});

test('search results paginate stably without duplicating matching reply parents', async () => {
  const key = randomUUID();
  await prisma.forumPost.createMany({ data: Array.from({ length: 22 }, () => ({ authorId: owner.id, kind: 'QUESTION' as const, categoryId, title: key, body: 'Search pagination' })) });
  const ids: string[] = [];
  for (const page of [1, 2]) {
    const r = await api.get(`/api/forum/questions?q=${key}&page=${page}`).auth(owner.token, { type: 'bearer' }).expect(200);
    expect(r.body.hasMore).toBe(page === 1);
    ids.push(...r.body.questions.map((q: { id: string }) => q.id));
  }
  expect(ids).toHaveLength(22); expect(new Set(ids).size).toBe(22);
});
