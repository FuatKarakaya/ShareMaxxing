/**
 * Mock data for development: 10 rows in every table that holds user data.
 *
 *   npm run db:seed:mock
 *
 * Run it after migrations (and optionally after `npm run db:seed`; the two never collide).
 * Safe to re-run: every row has a fixed UUID and is inserted with `skipDuplicates`.
 * It never updates or deletes anything (the payment ledger is append-only).
 *
 * Tables with 10 rows: users, driver_submerchants, email_verification_codes, trips, bookings,
 * sponsorship_requests, payments, ride_ratings, no_show_reports, housing_listings, forum_posts,
 * notifications, moderation_cases.
 * payment_ledger has 22 rows, because each payment needs 2-3 ledger events for its lifecycle.
 * cities, istanbul_districts and forum_categories are lookup tables filled by migrations.
 *
 * Accounts: mock01@itu.edu.tr ... mock10@itu.edu.tr, password "ShareMaxxing!2026".
 * mock10 is a MODERATOR, everyone else is a USER.
 * Never run this against production: it refuses when NODE_ENV=production.
 */
import { PrismaClient } from '@prisma/client';

export const MOCK_PASSWORD = 'ShareMaxxing!2026';
const PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$3Gc8Qc8gGOEVAs0UJRQ88Q$IGGUmoeX+BBbJ7Odt0t/n61EZv7iqArcT1AMm12PUJs';

// Group numbers start at 101 so these ids never collide with seed.ts (groups 1-11).
const uid = (group: number, n: number): string =>
  `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const G = { user: 101, trip: 102, booking: 103, request: 104, payment: 105, ledger: 106, housing: 107, post: 108, notification: 109, moderation: 110, idem: 111 };

const HOUR = 3_600_000;
const MIN = 60_000;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

type Tally = Record<string, { inserted: number; total: number }>;

export async function seedMock(prisma: PrismaClient): Promise<Tally> {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to add mock data: NODE_ENV=production.');

  const [cityCount, districts, categories] = await Promise.all([
    prisma.city.count(),
    prisma.istanbulDistrict.findMany({ select: { id: true, name: true } }),
    prisma.forumCategory.findMany({ select: { id: true, code: true } }),
  ]);
  if (cityCount !== 81 || districts.length === 0 || categories.length === 0) {
    throw new Error('Lookup data is missing. Run `npm run db:migrate` before adding mock data.');
  }
  const district = (name: string): string => {
    const d = districts.find((x) => x.name === name);
    if (!d) throw new Error(`Unknown district: ${name}`);
    return d.id;
  };
  const category = (code: string): string => {
    const c = categories.find((x) => x.code === code);
    if (!c) throw new Error(`Unknown forum category: ${code}`);
    return c.id;
  };

  const now = Date.now();
  const at = (hours: number): Date => new Date(now + hours * HOUR);
  const tally: Tally = {};
  const add = (table: string, r: { count: number }, total: number): void => {
    tally[table] = { inserted: r.count, total };
  };
  const U = (i: number): string => uid(G.user, i + 1);
  const T = (i: number): string => uid(G.trip, i + 1);
  const B = (i: number): string => uid(G.booking, i + 1);
  const P = (i: number): string => uid(G.payment, i + 1);
  const pad = (i: number): string => String(i + 1).padStart(2, '0');

  // ── users (index 0-9) ──
  const first = ['Mert', 'Selin', 'Burak', 'Ece', 'Kaan', 'Defne', 'Emre', 'Ayşe', 'Oğuz', 'Melis'];
  const last = ['Aydın', 'Çelik', 'Doğan', 'Erdem', 'Güneş', 'Kılıç', 'Polat', 'Şen', 'Taş', 'Yalçın'];
  const users = range(10).map((i) => ({
    id: U(i), email: `mock${pad(i)}@itu.edu.tr`, passwordHash: PASSWORD_HASH, displayName: `${first[i]} ${last[i]}`,
    bio: i % 2 === 0 ? `Mock kullanıcı ${pad(i)}` : null, role: i === 9 ? ('MODERATOR' as const) : ('USER' as const),
    emailVerifiedAt: at(-24 * 60), createdAt: at(-24 * 60),
  }));
  add('users', await prisma.user.createMany({ data: users, skipDuplicates: true }), users.length);

  const submerchants = range(10).map((i) => ({ userId: U(i), iyzicoSubmerchantKey: `mock-submerchant-${pad(i)}` }));
  add('driver_submerchants', await prisma.driverSubmerchant.createMany({ data: submerchants, skipDuplicates: true }), 10);

  // Only meaningful for unverified users; here just dummy rows so the table has data.
  const codes = range(10).map((i) => ({ userId: U(i), codeHash: `mock-not-a-real-hash-${pad(i)}`, failedAttempts: i % 5, expiresAt: at(24) }));
  add('email_verification_codes', await prisma.emailVerificationCode.createMany({ data: codes, skipDuplicates: true }), 10);

  // ── trips: 0-4 finished (past), 5-9 upcoming. Driver of trip i is user i. ──
  const cities = [6, 35, 16, 26, 7, 41, 54, 55, 61, 42]; // Ankara, İzmir, Bursa, Eskişehir, Antalya, Kocaeli, Sakarya, Samsun, Trabzon, Konya
  const departure = (i: number): Date => (i < 5 ? at(-24 * (10 - i)) : at(24 * (i - 4)));
  const trips = range(10).map((i) => ({
    id: T(i), driverId: U(i),
    originCityCode: i % 2 === 0 ? 34 : cities[i], destinationCityCode: i % 2 === 0 ? cities[i] : 34,
    departureAt: departure(i), seatCapacity: 2 + (i % 3), priceMinor: BigInt(20000 + i * 4000),
    description: `Mock yolculuk ${pad(i)}`, contactDetails: i % 3 === 0 ? `WhatsApp: 0555 100 00 ${pad(i)}` : null,
    status: i < 5 ? ('COMPLETED' as const) : ('PUBLISHED' as const),
    driverCompletedAt: i < 5 ? new Date(departure(i).getTime() + 2 * HOUR) : null,
    createdAt: at(-24 * 20),
  }));
  add('trips', await prisma.trip.createMany({ data: trips, skipDuplicates: true }), 10);

  // ── bookings: booking i is on trip i; the passenger is the next user ──
  const bookingStatus = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'CONFIRMED', 'CONFIRMED', 'CANCELLED', 'PENDING_PAYMENT', 'EXPIRED'] as const;
  const bookingCreated = (i: number): Date => (i < 5 ? new Date(departure(i).getTime() - 72 * HOUR) : i === 8 ? new Date(now - 5 * MIN) : at(-48 - i));
  const bookings = range(10).map((i) => {
    const created = bookingCreated(i);
    const status = bookingStatus[i];
    return {
      id: B(i), tripId: T(i), passengerId: U((i + 1) % 10), priceMinor: BigInt(20000 + i * 4000), status,
      createdAt: created, reservationExpiresAt: new Date(created.getTime() + 15 * MIN),
      passengerCompletedAt: status === 'COMPLETED' ? new Date(departure(i).getTime() + 2 * HOUR) : null,
      completedAt: status === 'COMPLETED' ? new Date(departure(i).getTime() + 3 * HOUR) : null,
      cancelledAt: status === 'CANCELLED' ? new Date(created.getTime() + 24 * HOUR) : null,
    };
  });
  add('bookings', await prisma.booking.createMany({ data: bookings, skipDuplicates: true }), 10);

  // ── sponsorship requests: two per upcoming trip (5-9), recipients are never the driver ──
  const requests = range(10).map((i) => {
    const t = 5 + Math.floor(i / 2);
    const status = i < 6 ? ('OPEN' as const) : i < 8 ? ('EXPIRED' as const) : ('CANCELLED' as const);
    return {
      id: uid(G.request, i + 1), tripId: T(t), recipientId: U((t + 2 + (i % 2)) % 10), amountMinor: BigInt(20000 + t * 4000), status,
      createdAt: at(status === 'OPEN' ? -6 - i : -72), expiresAt: at(status === 'EXPIRED' ? -1 : 48),
    };
  });
  add('sponsorship_requests', await prisma.sponsorshipRequest.createMany({ data: requests, skipDuplicates: true }), 10);

  // ── payments: one per booking, status matches the booking ──
  const paymentStatus = ['RELEASED', 'RELEASED', 'RELEASED', 'RELEASED', 'RELEASED', 'HELD', 'HELD', 'REFUNDED', 'PENDING', 'FAILED'] as const;
  const held = (i: number): Date => new Date(bookingCreated(i).getTime() + MIN);
  const released = (i: number): Date => new Date(departure(i).getTime() + 4 * HOUR);
  const refunded = (i: number): Date => new Date(bookingCreated(i).getTime() + 24 * HOUR);
  const payments = range(10).map((i) => {
    const s = paymentStatus[i];
    const everHeld = s === 'RELEASED' || s === 'HELD' || s === 'REFUNDED';
    return {
      id: P(i), bookingId: B(i), payerId: U((i + 1) % 10), amountMinor: BigInt(20000 + i * 4000),
      providerPaymentId: s === 'FAILED' ? null : `mock-payment-${pad(i)}`, providerTransactionId: everHeld ? `mock-item-${pad(i)}` : null,
      idempotencyKey: uid(G.idem, i + 1), status: s, failureCode: s === 'FAILED' ? 'MOCK_CARD_DECLINED' : null,
      heldAt: everHeld ? held(i) : null, releasedAt: s === 'RELEASED' ? released(i) : null, refundedAt: s === 'REFUNDED' ? refunded(i) : null,
      createdAt: bookingCreated(i),
    };
  });
  add('payments', await prisma.payment.createMany({ data: payments, skipDuplicates: true }), 10);

  // ── ledger (insert-only): PAYMENT + HOLD for every held payment, then RELEASE or REFUND ──
  const ledger: { id: string; paymentId: string; eventType: 'PAYMENT' | 'HOLD' | 'RELEASE' | 'REFUND'; amountMinor: bigint; createdAt: Date }[] = [];
  for (const i of range(8)) {
    const amount = BigInt(20000 + i * 4000);
    const row = (eventType: 'PAYMENT' | 'HOLD' | 'RELEASE' | 'REFUND', createdAt: Date) =>
      ledger.push({ id: uid(G.ledger, ledger.length + 1), paymentId: P(i), eventType, amountMinor: amount, createdAt });
    row('PAYMENT', held(i));
    row('HOLD', held(i));
    if (paymentStatus[i] === 'RELEASED') row('RELEASE', released(i));
    if (paymentStatus[i] === 'REFUNDED') row('REFUND', refunded(i));
  }
  add('payment_ledger', await prisma.paymentLedgerEntry.createMany({ data: ledger, skipDuplicates: true }), ledger.length);

  // ── ratings: both directions on the 5 completed rides ──
  const ratings = range(5).flatMap((i) => [
    { bookingId: B(i), direction: 'PASSENGER_TO_DRIVER' as const, score: 3 + (i % 3), review: `Mock yorum (yolcu → sürücü) ${pad(i)}`, createdAt: at(-24 * (9 - i)) },
    { bookingId: B(i), direction: 'DRIVER_TO_PASSENGER' as const, score: 4 + (i % 2), review: null, createdAt: at(-24 * (9 - i)) },
  ]);
  add('ride_ratings', await prisma.rideRating.createMany({ data: ratings, skipDuplicates: true }), ratings.length);

  const noShows = range(10).map((i) => ({
    id: uid(G.booking + 100, i + 1), bookingId: B(i), missingParty: i % 2 === 0 ? ('PASSENGER' as const) : ('DRIVER' as const),
    details: `Mock no-show ${pad(i)}`, createdAt: at(-24 * 5),
  }));
  add('no_show_reports', await prisma.noShowReport.createMany({ data: noShows, skipDuplicates: true }), 10);

  // ── housing ──
  const districtNames = ['Kadıköy', 'Beşiktaş', 'Sarıyer', 'Şişli', 'Üsküdar', 'Maltepe', 'Kartal', 'Beyoğlu', 'Bakırköy', 'Esenyurt'];
  const housing = range(10).map((i) => ({
    id: uid(G.housing, i + 1), authorId: U(i), districtId: district(districtNames[i]),
    listingType: i % 2 === 0 ? ('HAVE_ROOM' as const) : ('NEED_ROOM' as const),
    title: i % 2 === 0 ? `${districtNames[i]}’de boş oda` : `${districtNames[i]} civarında oda arıyorum`,
    description: `Mock ilan açıklaması ${pad(i)}. Gerçek bir ilan değildir.`, contactDetails: i % 2 === 0 ? `WhatsApp: 0555 200 00 ${pad(i)}` : null,
    status: i === 8 ? ('CLOSED' as const) : ('ACTIVE' as const), hiddenAt: i === 9 ? at(-1) : null, createdAt: at(-24 * (i + 1)),
  }));
  add('housing_listings', await prisma.housingListing.createMany({ data: housing, skipDuplicates: true }), 10);

  // ── forum: 6 questions (0-5) and 4 answers (6-9) ──
  const codesCycle = ['COURSE', 'GENERAL', 'CAFETERIA', 'HOUSING', 'TRANSPORT', 'CAMPUS_LIFE'];
  const Q = (i: number): string => uid(G.post, i + 1);
  const questions = range(6).map((i) => ({
    id: Q(i), authorId: U(i), kind: 'QUESTION' as const, categoryId: category(codesCycle[i]),
    title: `Mock soru ${pad(i)}: ${codesCycle[i].toLowerCase()} hakkında`, body: `Bu bir mock sorudur (${pad(i)}). Önerisi olan var mı?`, createdAt: at(-24 * (10 - i)),
  }));
  const answerParents = [0, 0, 1, 2];
  const answers = range(4).map((k) => ({
    id: Q(6 + k), authorId: U(6 + k), kind: 'ANSWER' as const, parentPostId: Q(answerParents[k]),
    body: `Mock cevap ${pad(6 + k)}: bence şöyle yapabilirsin.`, createdAt: at(-24 * (5 - k)),
  }));
  add('forum_posts', await prisma.forumPost.createMany({ data: [...questions, ...answers], skipDuplicates: true }), 10);

  // ── notifications: every kind at least once; funding ones never name donor or recipient ──
  const kinds = ['BOOKING', 'CANCELLATION', 'RIDE_REMINDER', 'PAYMENT', 'FUNDING', 'FORUM_REPLY', 'MODERATION', 'BOOKING', 'PAYMENT', 'FUNDING'] as const;
  const notifications = range(10).map((i) => ({
    id: uid(G.notification, i + 1), recipientId: U(i), kind: kinds[i], createdAt: at(-i), readAt: i % 2 === 0 ? at(-i + 0.5) : null,
    payload: { title: `Mock bildirim ${pad(i)}`, body: `${kinds[i]} türünde örnek bildirim.`, link: { type: 'trip', id: T(i) } },
  }));
  add('notifications', await prisma.notification.createMany({ data: notifications, skipDuplicates: true }), 10);

  // ── moderation: 4 user reports + 3 AI flags (ACTIVE), 3 resolved by mock10 ──
  const aiModel = 'mock-moderation-v1';
  const M = (i: number): string => uid(G.moderation, i + 1);
  const cases = [
    { id: M(0), source: 'USER' as const, reporterId: U(0), targetUserId: U(5), reason: 'Rahatsız edici davranış' },
    { id: M(1), source: 'USER' as const, reporterId: U(1), targetTripId: T(6), reason: 'Yanıltıcı yolculuk ilanı' },
    { id: M(2), source: 'USER' as const, reporterId: U(2), targetHousingId: uid(G.housing, 2), reason: 'Şüpheli konut ilanı' },
    { id: M(3), source: 'USER' as const, reporterId: U(3), targetPostId: Q(1), reason: 'Spam' },
    { id: M(4), source: 'AI' as const, aiModel, aiScore: '0.9100', targetPostId: Q(2), reason: 'AI: uygunsuz içerik olasılığı yüksek' },
    { id: M(5), source: 'AI' as const, aiModel, aiScore: '0.8700', targetHousingId: uid(G.housing, 4), reason: 'AI: dolandırıcılık şüphesi' },
    { id: M(6), source: 'AI' as const, aiUnavailable: true, targetPostId: Q(3), reason: 'AI_UNAVAILABLE' },
    { id: M(7), source: 'USER' as const, reporterId: U(4), targetPostId: Q(4), reason: 'Spam', status: 'SOLVED' as const, reviewedById: U(9), resolution: 'DISMISSED' as const, resolutionNote: 'Sorun yok.', resolvedAt: at(-3) },
    { id: M(8), source: 'USER' as const, reporterId: U(5), targetUserId: U(7), reason: 'Hakaret', status: 'SOLVED' as const, reviewedById: U(9), resolution: 'USER_WARNED' as const, resolutionNote: 'Uyarıldı.', resolvedAt: at(-2) },
    { id: M(9), source: 'USER' as const, reporterId: U(6), targetPostId: Q(5), reason: 'Uygunsuz içerik', status: 'SOLVED' as const, reviewedById: U(9), resolution: 'CONTENT_HIDDEN' as const, resolutionNote: 'Gizlendi.', resolvedAt: at(-1) },
  ].map((c, i) => ({ ...c, createdAt: at(-24 - i) }));
  add('moderation_cases', await prisma.moderationCase.createMany({ data: cases, skipDuplicates: true }), 10);

  return tally;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tally = await seedMock(prisma);
    console.log('Mock data finished (new rows / defined rows):');
    for (const [table, { inserted, total }] of Object.entries(tally)) console.log(`  ${table.padEnd(26)} ${inserted} / ${total}`);
    console.log(`\nLogins: mock01@itu.edu.tr ... mock10@itu.edu.tr, password "${MOCK_PASSWORD}" (mock10 is a moderator)`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
