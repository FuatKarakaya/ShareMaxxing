import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { resetAiUsage } from '../src/ai/provider';
import { createApp } from '../src/app';
import { reviewsSettled } from '../src/content/review';
import { indexingSettled } from '../src/forum/ai-search';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use npm test.');

const prefix = `ai-search-${randomUUID()}`;
const api = request(createApp());
const fetchMock = jest.spyOn(globalThis, 'fetch');
// A unique topic word per run keeps other test data out of the results.
const topic = `konu${randomUUID().slice(0, 8)}`;
let author: { id: string; token: string };
let reader: typeof author;
let categoryId: string;

// Fake embeddings: texts about the meal hall, the library or this run's topic point in different directions.
function vectorFor(text: string): number[] {
  const lower = text.toLocaleLowerCase('tr');
  return [lower.includes('yemekhane') ? 1 : 0, lower.includes('kütüphane') ? 1 : 0, lower.includes(topic) ? 1 : 0, 0.05];
}
function embeddings(_url: unknown, init?: RequestInit) {
  const { input } = JSON.parse(String(init?.body)) as { input: string[] };
  return Promise.resolve(new Response(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: vectorFor(text) })) })));
}

async function user(name: string) {
  const row = await prisma.user.create({ data: { email: `${prefix}-${randomUUID()}@itu.edu.tr`, displayName: name, passwordHash: 'unused', emailVerifiedAt: new Date() } });
  return { id: row.id, token: issueAccessToken(row.id) };
}
const ask = (title: string, body: string) => api.post('/api/forum/questions').auth(author.token, { type: 'bearer' }).send({ categoryId, title, body }).expect(201).then(r => r.body.question as { id: string });
const search = (q: string) => api.get(`/api/forum/ai-search?q=${encodeURIComponent(q)}`).auth(reader.token, { type: 'bearer' });
async function settle() { await indexingSettled(); await reviewsSettled(); }

beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
  author = await user('Arama Yazar');
  reader = await user('Arama Okur');
  categoryId = (await prisma.forumCategory.findFirstOrThrow()).id;
});

beforeEach(() => {
  process.env.AI_BASE_URL = 'https://ai.example.test/v1';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_EMBEDDING_MODEL = 'test-embedding';
  delete process.env.AI_MODEL; // content flagging is not under test here
  resetAiUsage();
  fetchMock.mockReset();
  fetchMock.mockImplementation(embeddings);
});

afterAll(async () => {
  await settle();
  fetchMock.mockRestore();
  for (const name of ['AI_BASE_URL', 'AI_API_KEY', 'AI_EMBEDDING_MODEL']) delete process.env[name];
  const authors = { author: { email: { startsWith: prefix } } };
  await prisma.moderationCase.deleteMany({ where: { targetPost: authors } });
  await prisma.notification.deleteMany({ where: { recipient: { email: { startsWith: prefix } } } });
  await prisma.forumPost.deleteMany({ where: authors });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test('a new question is indexed and found by a question in other words, with a link to it', async () => {
  const question = await ask(`Yemekhane ${topic}`, 'Cumartesi günleri açık mı?');
  await settle();
  expect(await prisma.forumPostEmbedding.findUnique({ where: { postId: question.id } })).toMatchObject({ model: 'test-embedding' });

  const response = await search(`${topic} hafta sonu yemekhane saatleri`).expect(200);
  expect(response.body.results[0]).toMatchObject({ questionId: question.id, link: `/forum/${question.id}`, matchedAnswer: false });
  expect(JSON.stringify(response.body)).not.toMatch(/@itu\.edu\.tr|Arama Yazar/);
});

test('a matching answer leads to its question', async () => {
  const question = await ask(`Ders ${topic}`, 'Sınav haftası nerede çalışılır?');
  const answer = await api.post(`/api/forum/questions/${question.id}/answers`).auth(reader.token, { type: 'bearer' }).send({ body: `Kütüphane ${topic} gece de açık.` }).expect(201);
  await settle();
  const results = (await search(`kütüphane ${topic}`).expect(200)).body.results;
  expect(results[0]).toMatchObject({ questionId: question.id, matchedAnswer: true });
  expect(results[0].excerpt).toContain('gece de açık');
  expect(answer.body.answer.id).toBeTruthy();
});

test('nothing related gives an empty list', async () => {
  await ask(`Yemekhane ${topic} menü`, 'Menü nerede?');
  await settle();
  expect((await search('otopark ücreti').expect(200)).body.results).toEqual([]);
});

test('hidden posts are never returned', async () => {
  const question = await ask(`Gizli ${topic}`, 'Bu gizlenecek.');
  await settle();
  await prisma.forumPost.update({ where: { id: question.id }, data: { hiddenAt: new Date() } });
  const ids = (await search(topic).expect(200)).body.results.map((r: { questionId: string }) => r.questionId);
  expect(ids).not.toContain(question.id);
});

test('an edited post is indexed again; a deleted post leaves the index', async () => {
  const question = await ask('Eski başlık', 'Eski metin');
  await settle();
  await api.patch(`/api/forum/posts/${question.id}`).auth(author.token, { type: 'bearer' }).send({ body: `Artık ${topic} yemekhane hakkında` }).expect(200);
  await settle();
  expect((await search(`${topic} yemekhane`).expect(200)).body.results.map((r: { questionId: string }) => r.questionId)).toContain(question.id);
  await api.delete(`/api/forum/posts/${question.id}`).auth(author.token, { type: 'bearer' }).expect(204);
  expect(await prisma.forumPostEmbedding.count({ where: { postId: question.id } })).toBe(0);
});

test('when the AI is unavailable the page is told to use keyword search', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
  const response = await search('yemekhane').expect(503);
  expect(response.body.error.code).toBe('AI_SEARCH_UNAVAILABLE');
  delete process.env.AI_EMBEDDING_MODEL;
  expect((await search('yemekhane').expect(503)).body.error.code).toBe('AI_SEARCH_UNAVAILABLE');
});

test('validates the query and requires login', async () => {
  await api.get('/api/forum/ai-search?q=x').expect(401);
  for (const query of ['', 'q=', 'q=%20%20', `q=${'x'.repeat(301)}`, 'q=a&q=b', 'q=a&page=2']) {
    await api.get(`/api/forum/ai-search?${query}`).auth(reader.token, { type: 'bearer' }).expect(400);
  }
});
