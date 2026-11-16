import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use npm test.');

const prefix = `reports-${randomUUID()}`;
const api = request(createApp());
let reporter: string;
let targetUser: string;
let token: string;
let targets: Record<string, string>;

beforeAll(async () => {
  process.env.JWT_SECRET = 'report-test-secret-only-at-least-32-characters';
  const user = (name: string) => prisma.user.create({
    data: { email: `${prefix}-${name}@itu.edu.tr`, displayName: name, passwordHash: 'unused', emailVerifiedAt: new Date() },
  });
  reporter = (await user('reporter')).id;
  targetUser = (await user('target')).id;
  token = issueAccessToken(reporter);
  const trip = await api.post('/api/trips').auth(issueAccessToken(targetUser), { type: 'bearer' }).send({
    originCityCode: 34, destinationCityCode: 6, departureAt: new Date(Date.now() + 86_400_000).toISOString(),
    seatCapacity: 2, priceMinor: 10000,
  }).expect(201);
  const districtId = (await prisma.istanbulDistrict.findFirstOrThrow()).id;
  const housing = await prisma.housingListing.create({ data: {
    authorId: targetUser, districtId, listingType: 'HAVE_ROOM', title: 'Oda', description: 'İlan',
  } });
  const categoryId = (await prisma.forumCategory.findFirstOrThrow()).id;
  const post = await prisma.forumPost.create({ data: {
    authorId: targetUser, kind: 'QUESTION', categoryId, title: 'Soru', body: 'Kampüs hakkında',
  } });
  targets = { USER: targetUser, TRIP: trip.body.trip.id, HOUSING: housing.id, POST: post.id };
});

afterAll(async () => {
  try {
    await prisma.moderationCase.deleteMany({ where: { reporter: { email: { startsWith: prefix } } } });
    await prisma.trip.deleteMany({ where: { driver: { email: { startsWith: prefix } } } });
    await prisma.housingListing.deleteMany({ where: { author: { email: { startsWith: prefix } } } });
    await prisma.forumPost.deleteMany({ where: { author: { email: { startsWith: prefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  } finally { await prisma.$disconnect(); }
});

const report = (data: object) => api.post('/api/reports').auth(token, { type: 'bearer' }).send(data);

test('only verified students can file a report and the reporter comes from the session', async () => {
  await api.post('/api/reports').send({}).expect(401);
  await prisma.user.update({ where: { id: reporter }, data: { emailVerifiedAt: null } });
  try { await report({ targetType: 'USER', targetId: targetUser, reason: 'Test' }).expect(403); }
  finally { await prisma.user.update({ where: { id: reporter }, data: { emailVerifiedAt: new Date() } }); }
  await report({ targetType: 'USER', targetId: targetUser, reason: 'Test', reporterId: targetUser }).expect(400);
});

test('rejects invalid payloads and missing or hidden targets', async () => {
  for (const data of [
    { targetType: 'ITEM', targetId: targetUser, reason: 'Test' },
    { targetType: 'USER', targetId: 'bad', reason: 'Test' },
    { targetType: 'USER', targetId: targetUser, reason: ' ' },
    { targetType: 'USER', targetId: targetUser, reason: 'x'.repeat(1001) },
    { targetType: 'USER', targetId: reporter.toUpperCase(), reason: 'Test' },
  ]) await report(data).expect(400);
  await report({ targetType: 'USER', targetId: randomUUID(), reason: 'Test' }).expect(404);
  await prisma.forumPost.update({ where: { id: targets.POST }, data: { hiddenAt: new Date() } });
  try { await report({ targetType: 'POST', targetId: targets.POST, reason: 'Test' }).expect(404); }
  finally { await prisma.forumPost.update({ where: { id: targets.POST }, data: { hiddenAt: null } }); }
});

test.each([['USER', 'targetUserId'], ['TRIP', 'targetTripId'], ['HOUSING', 'targetHousingId'], ['POST', 'targetPostId']])(
  'adds a %s report to the active moderation queue and rejects duplicates',
  async (targetType, field) => {
    const data = { targetType, targetId: targets[targetType], reason: '  İncelensin  ' };
    const results = await Promise.all([report(data), report(data)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    const created = results.find(r => r.status === 201)!.body.report;
    expect(created).toEqual({ id: expect.any(String), status: 'ACTIVE' });
    expect(await prisma.moderationCase.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      reporterId: reporter, reason: 'İncelensin', status: 'ACTIVE', source: 'USER', [field]: targets[targetType],
    });
  },
);
