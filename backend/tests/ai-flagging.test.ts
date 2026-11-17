import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { resetAiUsage } from '../src/ai/provider';
import { createApp } from '../src/app';
import { reviewsSettled } from '../src/content/review';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use npm test.');

const prefix = `ai-flagging-${randomUUID()}`;
const api = request(createApp());
// The AI provider is replaced: no test calls a real one.
const fetchMock = jest.spyOn(globalThis, 'fetch');
const AI_SETTINGS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_TIMEOUT_MS', 'AI_DAILY_LIMIT'];
let author: { id: string; token: string };
let reader: typeof author;
let categoryId: string;
let districtId: string;

async function user(displayName: string) {
  const row = await prisma.user.create({ data: { email: `${prefix}-${randomUUID()}@itu.edu.tr`, displayName, passwordHash: 'unused', emailVerifiedAt: new Date() } });
  return { id: row.id, token: issueAccessToken(row.id) };
}

const answer = (content: string, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
const verdict = (unsuitable: boolean, score: number, reason: string) => answer(JSON.stringify({ unsuitable, score, reason }));
// A provider that never answers, until the request is cut off.
const never = (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
});
function gate() {
  let open!: (response: Response) => void;
  const waiting = new Promise<Response>(resolve => { open = resolve; });
  return { waiting, open };
}
async function until(condition: () => boolean) {
  for (let i = 0; i < 400 && !condition(); i += 1) await new Promise(resolve => setTimeout(resolve, 5));
  if (!condition()) throw new Error('The condition was not reached in time.');
  await new Promise(resolve => setTimeout(resolve, 5));
}

const as = (who: typeof author) => ({
  get: (path: string) => api.get(path).auth(who.token, { type: 'bearer' }),
  post: (path: string, body: object) => api.post(path).auth(who.token, { type: 'bearer' }).send(body),
  patch: (path: string, body: object) => api.patch(path).auth(who.token, { type: 'bearer' }).send(body),
  delete: (path: string) => api.delete(path).auth(who.token, { type: 'bearer' }),
});
async function postQuestion(body = 'Kütüphane hafta sonu açık mı?'): Promise<{ id: string }> {
  return (await as(author).post('/api/forum/questions', { categoryId, title: 'Kampüs sorusu', body }).expect(201)).body.question;
}
async function postListing(description: string): Promise<{ id: string }> {
  const data = { districtId, listingType: 'HAVE_ROOM', title: 'Kampüse yakın oda', description, contactDetails: 'gizli-iletisim@example.test' };
  return (await as(author).post('/api/housing', data).expect(201)).body.listing;
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
  author = await user('Flag Yazar');
  reader = await user('Flag Okur');
  categoryId = (await prisma.forumCategory.findFirstOrThrow()).id;
  districtId = (await prisma.istanbulDistrict.findFirstOrThrow()).id;
});

beforeEach(() => {
  process.env.AI_BASE_URL = 'https://ai.example.test/v1';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  delete process.env.AI_TIMEOUT_MS;
  delete process.env.AI_DAILY_LIMIT;
  resetAiUsage();
  fetchMock.mockReset();
});

afterEach(reviewsSettled);

afterAll(async () => {
  fetchMock.mockRestore();
  for (const name of AI_SETTINGS) delete process.env[name];
  const authors = { author: { email: { startsWith: prefix } } };
  await prisma.moderationCase.deleteMany({ where: { OR: [{ targetPost: authors }, { targetHousing: authors }] } });
  await prisma.notification.deleteMany({ where: { recipient: { email: { startsWith: prefix } } } });
  await prisma.forumPost.deleteMany({ where: authors });
  await prisma.housingListing.deleteMany({ where: authors });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test('unsuitable content goes to the moderation queue, and the AI flag alone changes nothing else', async () => {
  fetchMock.mockResolvedValueOnce(verdict(true, 0.93, 'Hakaret içeriyor.'));
  const listing = await postListing('Bu evde kalanlar aptaldır, hepsinden nefret ediyorum.');
  await reviewsSettled();

  const cases = await prisma.moderationCase.findMany({ where: { targetHousingId: listing.id } });
  expect(cases).toHaveLength(1);
  expect(cases[0]).toMatchObject({
    source: 'AI', status: 'ACTIVE', reason: 'Hakaret içeriyor.', aiModel: 'test-model', aiUnavailable: false,
    reporterId: null, reviewedById: null, resolution: null,
  });
  expect(Number(cases[0].aiScore)).toBe(0.93);

  // The listing is still published and its author can still use the site.
  const read = await as(reader).get(`/api/housing/${listing.id}`).expect(200);
  expect(read.body.listing).toMatchObject({ status: 'ACTIVE', hiddenAt: null });
  const browse = await as(reader).get('/api/housing').expect(200);
  expect(browse.body.listings.map((row: { id: string }) => row.id)).toContain(listing.id);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).status).toBe('ACTIVE');
  await as(author).get('/api/auth/me').expect(200);

  // Only the text goes to the provider: no author, e-mail or contact details.
  const sent = String(fetchMock.mock.calls[0][1]?.body);
  expect(sent).toContain('Kampüse yakın oda');
  expect(sent).toContain('hepsinden nefret ediyorum');
  expect(sent).not.toMatch(/gizli-iletisim|itu\.edu\.tr|Flag Yazar/);
});

test('suitable content gets no case', async () => {
  fetchMock.mockResolvedValueOnce(verdict(false, 0.02, 'Uygun.'));
  const question = await postQuestion();
  await reviewsSettled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await prisma.moderationCase.count({ where: { targetPostId: question.id } })).toBe(0);
});

test('answers are checked like questions', async () => {
  fetchMock.mockResolvedValueOnce(verdict(false, 0.02, 'Uygun.')).mockResolvedValueOnce(verdict(true, 0.8, 'Tehdit içeriyor.'));
  const question = await postQuestion();
  await reviewsSettled();
  const reply = (await as(reader).post(`/api/forum/questions/${question.id}/answers`, { body: 'Seni bulacağım.' }).expect(201)).body.answer;
  await reviewsSettled();
  expect(await prisma.moderationCase.findMany({ where: { targetPostId: reply.id } })).toMatchObject([{ source: 'AI', reason: 'Tehdit içeriyor.' }]);
});

test.each([
  ['a timeout', () => { process.env.AI_TIMEOUT_MS = '20'; fetchMock.mockImplementationOnce(never); }],
  ['an answer that is not JSON', () => { fetchMock.mockResolvedValueOnce(answer('Bu içerik bence uygun.')); }],
  ['a JSON answer with the wrong fields', () => { fetchMock.mockResolvedValueOnce(answer('{"unsuitable": "no", "score": 5}')); }],
  ['a quota error', () => { fetchMock.mockResolvedValueOnce(answer('{}', 429)); }],
  ['a provider error', () => { fetchMock.mockResolvedValueOnce(answer('{}', 500)); }],
  ['a missing API key', () => { delete process.env.AI_API_KEY; }],
])('%s keeps the content and sends it to human review as "AI unavailable"', async (_name, simulate) => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    simulate();
    const question = await postQuestion();
    await reviewsSettled();

    const cases = await prisma.moderationCase.findMany({ where: { targetPostId: question.id } });
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ source: 'AI', status: 'ACTIVE', aiUnavailable: true, reason: 'AI_UNAVAILABLE', aiModel: null, aiScore: null });
    const read = await as(reader).get(`/api/forum/questions/${question.id}`).expect(200);
    expect(read.body.question.hiddenAt).toBeNull();
  } finally {
    warning.mockRestore();
  }
});

test('after the daily limit, content goes to human review without calling the provider', async () => {
  process.env.AI_DAILY_LIMIT = '1';
  fetchMock.mockResolvedValueOnce(verdict(false, 0.02, 'Uygun.'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const first = await postQuestion();
    await reviewsSettled();
    const second = await postQuestion();
    await reviewsSettled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.moderationCase.count({ where: { targetPostId: first.id } })).toBe(0);
    expect(await prisma.moderationCase.count({ where: { targetPostId: second.id, aiUnavailable: true } })).toBe(1);
  } finally {
    warning.mockRestore();
  }
});

test('an open AI case is not opened twice for the same content', async () => {
  fetchMock.mockImplementation(async () => verdict(true, 0.8, 'Uygunsuz.'));
  const question = await postQuestion('Uygunsuz metin');
  await reviewsSettled();
  await as(author).patch(`/api/forum/posts/${question.id}`, { body: 'Yine uygunsuz metin' }).expect(200);
  await reviewsSettled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await prisma.moderationCase.count({ where: { targetPostId: question.id, source: 'AI', status: 'ACTIVE' } })).toBe(1);
});

test('a result for a text that was edited meanwhile is dropped', async () => {
  const slow = gate();
  fetchMock.mockImplementationOnce(() => slow.waiting).mockResolvedValueOnce(verdict(false, 0.01, 'Uygun.'));
  const question = await postQuestion('İlk metin');
  await until(() => fetchMock.mock.calls.length === 1);
  await as(author).patch(`/api/forum/posts/${question.id}`, { body: 'Düzeltilmiş metin' }).expect(200);
  await until(() => fetchMock.mock.calls.length === 2);
  // The verdict for the first text arrives only now.
  slow.open(verdict(true, 0.9, 'İlk metin uygunsuz.'));
  await reviewsSettled();
  expect(await prisma.moderationCase.count({ where: { targetPostId: question.id } })).toBe(0);
});

test('a result for content that was deleted meanwhile is dropped', async () => {
  const slow = gate();
  fetchMock.mockImplementationOnce(() => slow.waiting);
  const failed = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const listing = await postListing('Silinecek ilan');
    await until(() => fetchMock.mock.calls.length === 1);
    await as(author).delete(`/api/housing/${listing.id}`).expect(204);
    slow.open(verdict(true, 0.9, prefix));
    await reviewsSettled();
    expect(await prisma.moderationCase.count({ where: { reason: prefix } })).toBe(0);
    expect(failed).not.toHaveBeenCalled();
  } finally {
    failed.mockRestore();
  }
});
