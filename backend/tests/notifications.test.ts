import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { issueAccessToken } from '../src/lib/tokens';
import { createNotification } from '../src/notifications/service';

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('Use npm test.');
}

const prefix = `notif-${randomUUID()}`;
const api = request(createApp());

let alice: { id: string; token: string };
let bob: { id: string; token: string };

async function makeUser(label: string) {
  const row = await prisma.user.create({
    data: {
      email: `${prefix}-${label}-${randomUUID()}@itu.edu.tr`,
      displayName: label,
      passwordHash: 'unused',
      emailVerifiedAt: new Date(),
    },
  });
  return { id: row.id, token: issueAccessToken(row.id) };
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
  alice = await makeUser('alice');
  bob = await makeUser('bob');
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { recipient: { email: { startsWith: prefix } } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: prefix } },
  });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.notification.deleteMany({
    where: { recipientId: { in: [alice.id, bob.id] } },
  });
});

test('requires live verified active authentication on all notification endpoints', async () => {
  await api.get('/api/notifications').expect(401);
  await api.get('/api/notifications/unread-count').expect(401);
  await api.post('/api/notifications/read-all').expect(401);
  await api.post(`/api/notifications/${randomUUID()}/read`).expect(401);

  await prisma.user.update({ where: { id: bob.id }, data: { emailVerifiedAt: null } });
  await api.get('/api/notifications').auth(bob.token, { type: 'bearer' }).expect(403);

  await prisma.user.update({ where: { id: bob.id }, data: { emailVerifiedAt: new Date(), status: 'SUSPENDED' } });
  await api.get('/api/notifications/unread-count').auth(bob.token, { type: 'bearer' }).expect(403);

  await prisma.user.update({ where: { id: bob.id }, data: { status: 'ACTIVE' } });
});

test('creates notifications standalone and transactionally, and lists them newest first', async () => {
  const first = await createNotification({
    recipientId: alice.id,
    kind: 'BOOKING',
    text: 'Yolculuğunuz için yeni bir rezervasyon var.',
    link: '/yolculuklar/trip-1',
    metadata: { bookingId: 'booking-1' },
  });

  await new Promise(resolve => setTimeout(resolve, 10));

  const second = await prisma.$transaction(tx =>
    createNotification(
      {
        recipientId: alice.id,
        kind: 'PAYMENT',
        text: 'Ödemeniz onaylandı.',
        link: '/yolculuklar/rezervasyonlarim',
      },
      tx,
    ),
  );

  const countRes = await api
    .get('/api/notifications/unread-count')
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  expect(countRes.headers['cache-control']).toBe('no-store');
  expect(countRes.body).toEqual({ unreadCount: 2 });

  const listRes = await api
    .get('/api/notifications')
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  expect(listRes.headers['cache-control']).toBe('no-store');
  expect(listRes.body.unreadCount).toBe(2);
  expect(listRes.body.page).toBe(1);
  expect(listRes.body.hasMore).toBe(false);
  expect(listRes.body.notifications.map((n: { id: string }) => n.id)).toEqual([second.id, first.id]);
  expect(listRes.body.notifications[0]).toMatchObject({
    id: second.id,
    recipientId: alice.id,
    kind: 'PAYMENT',
    text: 'Ödemeniz onaylandı.',
    link: '/yolculuklar/rezervasyonlarim',
    isRead: false,
    readAt: null,
  });
  expect(listRes.body.notifications[0].payload).toBeUndefined();
});

test('enforces FUNDING privacy checks and validates inputs and query parameters', async () => {
  const forbiddenMetadataList: Record<string, string | number | boolean | null>[] = [
    { donorId: randomUUID() },
    { payerId: randomUUID() },
    { recipientId: randomUUID() },
    { driverId: randomUUID() },
    { tripId: randomUUID() },
    { originCity: 'İstanbul' },
    { destinationCityCode: 6 },
    { email: 'secret@itu.edu.tr' },
    { displayName: 'Gizli' },
  ];
  for (const forbiddenKey of forbiddenMetadataList) {
    await expect(
      createNotification({
        recipientId: alice.id,
        kind: 'FUNDING',
        text: 'Askıda bilet talebiniz desteklendi.',
        metadata: forbiddenKey,
      }),
    ).rejects.toThrow(/kimlik|rota/i);
  }

  const safeFunding = await createNotification({
    recipientId: alice.id,
    kind: 'FUNDING',
    text: 'Askıda bilet talebiniz desteklendi.',
    link: '/askida-bilet',
    metadata: { requestStatus: 'FUNDED' },
  });
  expect(safeFunding.kind).toBe('FUNDING');

  await expect(
    createNotification({
      recipientId: alice.id,
      kind: 'MODERATION',
      text: '   ',
    }),
  ).rejects.toThrow();

  await expect(
    createNotification({
      recipientId: alice.id,
      kind: 'MODERATION',
      text: 'Uyarı',
      link: 'https://evil.example/phish',
    }),
  ).rejects.toThrow();

  await expect(
    createNotification({
      recipientId: alice.id,
      kind: 'MODERATION',
      text: 'Uyarı',
      link: '//evil.example',
    }),
  ).rejects.toThrow();

  for (const badQuery of ['page=0', 'page=abc', 'unreadOnly=yes', 'extra=1']) {
    await api.get(`/api/notifications?${badQuery}`).auth(alice.token, { type: 'bearer' }).expect(400);
  }
  await api.post('/api/notifications/not-a-uuid/read').auth(alice.token, { type: 'bearer' }).expect(400);
});

test('supports unreadOnly filtering and deterministic pagination', async () => {
  const createdIds: string[] = [];
  for (let i = 0; i < 22; i++) {
    const n = await createNotification({
      recipientId: alice.id,
      kind: 'RIDE_REMINDER',
      text: `Hatırlatma ${i + 1}`,
    });
    createdIds.push(n.id);
  }

  // Mark one notification as read so unreadOnly omits it.
  await api.post(`/api/notifications/${createdIds[0]}/read`).auth(alice.token, { type: 'bearer' }).expect(200);

  const page1 = await api.get('/api/notifications?page=1').auth(alice.token, { type: 'bearer' }).expect(200);
  expect(page1.body.notifications).toHaveLength(20);
  expect(page1.body.hasMore).toBe(true);
  expect(page1.body.unreadCount).toBe(21);

  const page2 = await api.get('/api/notifications?page=2').auth(alice.token, { type: 'bearer' }).expect(200);
  expect(page2.body.notifications).toHaveLength(2);
  expect(page2.body.hasMore).toBe(false);

  const pageIds = new Set([
    ...page1.body.notifications.map((n: { id: string }) => n.id),
    ...page2.body.notifications.map((n: { id: string }) => n.id),
  ]);
  expect(pageIds.size).toBe(22);

  const unreadPage1 = await api
    .get('/api/notifications?unreadOnly=true&page=1')
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  const unreadPage2 = await api
    .get('/api/notifications?unreadOnly=true&page=2')
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  const unreadIds = [
    ...unreadPage1.body.notifications.map((n: { id: string }) => n.id),
    ...unreadPage2.body.notifications.map((n: { id: string }) => n.id),
  ];
  expect(unreadIds).toHaveLength(21);
  expect(unreadIds).not.toContain(createdIds[0]);
});

test('marks individual notifications as read idempotently and enforces recipient isolation', async () => {
  const aliceNotif = await createNotification({
    recipientId: alice.id,
    kind: 'CANCELLATION',
    text: 'Bir yolculuk iptal edildi.',
  });
  const bobNotif = await createNotification({
    recipientId: bob.id,
    kind: 'BOOKING',
    text: 'Yeni rezervasyon.',
  });

  // Bob cannot mark Alice's notification as read, and receives 404.
  await api.post(`/api/notifications/${aliceNotif.id}/read`).auth(bob.token, { type: 'bearer' }).expect(404);
  await api.post(`/api/notifications/${randomUUID()}/read`).auth(alice.token, { type: 'bearer' }).expect(404);

  const firstRead = await api
    .post(`/api/notifications/${aliceNotif.id}/read`)
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  expect(firstRead.body.notification.isRead).toBe(true);
  expect(firstRead.body.notification.readAt).toBeTruthy();
  expect(firstRead.body.unreadCount).toBe(0);

  // Re-marking the already-read notification is idempotent and preserves readAt.
  const secondRead = await api
    .post(`/api/notifications/${aliceNotif.id}/read`)
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  expect(secondRead.body.notification.readAt).toBe(firstRead.body.notification.readAt);
  expect(secondRead.body.unreadCount).toBe(0);

  // Bob still sees his own unread notification.
  const bobCount = await api
    .get('/api/notifications/unread-count')
    .auth(bob.token, { type: 'bearer' })
    .expect(200);
  expect(bobCount.body.unreadCount).toBe(1);
  expect(bobNotif.id).toBeTruthy();
});

test('marks all caller notifications as read without touching other recipients', async () => {
  await createNotification({ recipientId: alice.id, kind: 'BOOKING', text: 'Bildirim 1' });
  await createNotification({ recipientId: alice.id, kind: 'PAYMENT', text: 'Bildirim 2' });
  await createNotification({ recipientId: bob.id, kind: 'BOOKING', text: 'Bob bildirimi' });

  const res = await api
    .post('/api/notifications/read-all')
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  expect(res.body).toEqual({ updatedCount: 2, unreadCount: 0 });

  const aliceCount = await api
    .get('/api/notifications/unread-count')
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  expect(aliceCount.body.unreadCount).toBe(0);

  // Repeating read-all reports 0 updated rows.
  const repeatRes = await api
    .post('/api/notifications/read-all')
    .auth(alice.token, { type: 'bearer' })
    .expect(200);
  expect(repeatRes.body).toEqual({ updatedCount: 0, unreadCount: 0 });

  // Bob's notification remains unread.
  const bobCount = await api
    .get('/api/notifications/unread-count')
    .auth(bob.token, { type: 'bearer' })
    .expect(200);
  expect(bobCount.body.unreadCount).toBe(1);
});
