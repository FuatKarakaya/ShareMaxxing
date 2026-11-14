import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use npm test.');
const prefix = `housing-${randomUUID()}`;
const api = request(createApp());
let owner: { id: string; token: string }, other: typeof owner, admin: typeof owner;
let districtId: string;
async function user(role: 'USER' | 'ADMIN' = 'USER') {
  const row = await prisma.user.create({ data: { email: `${prefix}-${randomUUID()}@itu.edu.tr`, displayName: 'Öğrenci', passwordHash: 'unused', role, emailVerifiedAt: new Date() } });
  return { id: row.id, token: issueAccessToken(row.id) };
}
beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
  owner = await user(); other = await user(); admin = await user('ADMIN');
  districtId = (await prisma.istanbulDistrict.findFirstOrThrow()).id;
});
afterAll(async () => {
  await prisma.moderationCase.deleteMany({ where: { targetHousing: { author: { email: { startsWith: prefix } } } } });
  // Solved cases retain history with NULL targets; test cases are tagged before deletion below.
  await prisma.moderationCase.deleteMany({ where: { reason: prefix } });
  await prisma.housingListing.deleteMany({ where: { author: { email: { startsWith: prefix } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});
const payload = () => ({ districtId, listingType: 'HAVE_ROOM', title: 'Kampüse yakın oda', description: 'Bir ev arkadaşı arıyorum.', contactDetails: 'İlan sahibinin verdiği iletişim' });
const post = (data: unknown = payload()) => api.post('/api/housing').auth(owner.token, { type: 'bearer' }).type('json').send(JSON.stringify(data));
test('requires verified active accounts for reads and writes', async () => {
  await api.get('/api/housing').expect(401);
  for (const field of ['emailVerifiedAt', 'status']) {
    await prisma.user.update({ where: { id: other.id }, data: field === 'status' ? { status: 'SUSPENDED' } : { emailVerifiedAt: null } });
    await api.get('/api/housing').auth(other.token, { type: 'bearer' }).expect(403);
    await prisma.user.update({ where: { id: other.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
  }
});
test('validates fields, unknown fields, lookups, identifiers and pagination', async () => {
  for (const data of [{}, { ...payload(), title: ' ' }, { ...payload(), districtId: randomUUID() }, { ...payload(), listingType: 'OTHER' }, { ...payload(), authorId: other.id }, { ...payload(), description: 'x'.repeat(6001) }, { ...payload(), contactDetails: 42 }]) await post(data).expect(400);
  for (const query of ['page=0', 'page=1.2', 'page=2&page=3', 'listingType=OTHER', 'districtId=bad', 'mine=true']) await api.get(`/api/housing?${query}`).auth(owner.token, { type: 'bearer' }).expect(400);
  await api.get('/api/housing/bad').auth(owner.token, { type: 'bearer' }).expect(400);
  await api.get(`/api/housing/${randomUUID()}`).auth(owner.token, { type: 'bearer' }).expect(404);
});
test('creates, filters, edits, closes and reopens without exposing private account fields', async () => {
  const created = (await post().expect(201)).body.listing;
  expect(created).toMatchObject({ title: payload().title, status: 'ACTIVE', author: { id: owner.id } });
  expect(JSON.stringify(created)).not.toMatch(/password|@itu.edu.tr/);
  expect(await prisma.moderationCase.count({ where: { targetHousingId: created.id, aiUnavailable: true } })).toBe(1);
  const read = await api.get(`/api/housing?districtId=${districtId}&listingType=HAVE_ROOM`).auth(other.token, { type: 'bearer' }).expect(200);
  expect(read.body.listings.map((x: { id: string }) => x.id)).toContain(created.id);
  for (const token of [other.token, admin.token]) {
    await api.patch(`/api/housing/${created.id}`).auth(token, { type: 'bearer' }).send({ title: 'Başka' }).expect(403);
    await api.delete(`/api/housing/${created.id}`).auth(token, { type: 'bearer' }).expect(403);
  }
  await api.patch(`/api/housing/${created.id}`).auth(owner.token, { type: 'bearer' }).send({ status: 'CLOSED', contactDetails: null }).expect(200);
  await api.get(`/api/housing/${created.id}`).auth(other.token, { type: 'bearer' }).expect(404);
  const mine = await api.get('/api/housing/mine').auth(owner.token, { type: 'bearer' }).expect(200);
  expect(mine.body.listings.some((x: { id: string }) => x.id === created.id)).toBe(true);
  await api.patch(`/api/housing/${created.id}`).auth(owner.token, { type: 'bearer' }).send({ status: 'ACTIVE' }).expect(200);
  expect(await prisma.moderationCase.count({ where: { targetHousingId: created.id, status: 'ACTIVE' } })).toBe(1);
});
test('hides moderated listings from browse/detail but retains author and staff access', async () => {
  const row = (await post().expect(201)).body.listing;
  await prisma.housingListing.update({ where: { id: row.id }, data: { hiddenAt: new Date() } });
  await api.get(`/api/housing/${row.id}`).auth(other.token, { type: 'bearer' }).expect(404);
  for (const token of [owner.token, admin.token]) await api.get(`/api/housing/${row.id}`).auth(token, { type: 'bearer' }).expect(200);
  const list = await api.get('/api/housing').auth(owner.token, { type: 'bearer' }).expect(200);
  expect(list.body.listings.some((x: { id: string }) => x.id === row.id)).toBe(false);
});
test('deletion resolves moderation cases atomically before clearing their content reference', async () => {
  const row = (await post().expect(201)).body.listing;
  await prisma.moderationCase.updateMany({ where: { targetHousingId: row.id }, data: { reason: prefix } });
  await api.patch(`/api/housing/${row.id}`).auth(owner.token, { type: 'bearer' }).send({}).expect(400);
  await api.delete(`/api/housing/${row.id}`).auth(owner.token, { type: 'bearer' }).expect(204);
  expect(await prisma.moderationCase.findFirst({ where: { reason: prefix } })).toMatchObject({ targetHousingId: null, status: 'SOLVED', resolution: 'CONTENT_DELETED' });
});
test('returns deterministic pages of twenty and migration-owned districts', async () => {
  const data = Array.from({ length: 22 }, (_, i) => ({ authorId: other.id, districtId, listingType: 'NEED_ROOM' as const, title: `Oda ${i}`, description: 'Oda arıyorum.' }));
  await prisma.housingListing.createMany({ data });
  const ids: string[] = [];
  for (const page of [1, 2]) {
    const r = await api.get(`/api/housing?listingType=NEED_ROOM&page=${page}`).auth(owner.token, { type: 'bearer' }).expect(200);
    expect(r.body.listings.length).toBeLessThanOrEqual(20);
    if (page === 1) expect(r.body.hasMore).toBe(true);
    ids.push(...r.body.listings.map((x: { id: string }) => x.id));
  }
  expect(new Set(ids).size).toBe(ids.length);
  const lookup = await api.get('/api/housing/districts').auth(owner.token, { type: 'bearer' }).expect(200);
  expect(lookup.body.districts.length).toBe(39);
});
