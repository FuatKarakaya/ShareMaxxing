/**
 * Development / demo seed (WBS-27.2, WBS-32.2).
 *
 *   npm run db:seed        (also runs automatically after `prisma migrate reset`)
 *
 * What it creates: one user per role plus drivers, passengers, a donor, a suspended user and a
 * temporary test login; trips (one full, one completed); an open askıda bilet request; a held and a
 * released payment with their ledger rows; a rated ride; housing listings; forum questions and answers;
 * notifications; and two moderation cases.
 *
 * What it does NOT create: cities, İstanbul districts and forum categories. Those are lookup data owned
 * by migration 20261105000200_lookup_data, so `prisma migrate deploy` already provides them everywhere.
 *
 * Safe to re-run: every row has a fixed UUID and is inserted with `skipDuplicates`, so existing rows
 * are left untouched and nothing is ever updated or deleted. (The ledger is append-only: a trigger
 * rejects UPDATE and DELETE, so this script must never try either.)
 *
 * All sample accounts share one password (DEV_PASSWORD). It is only a demo password, so the seed
 * refuses to run with NODE_ENV=production unless ALLOW_PRODUCTION_SEED=true (needed once to load the
 * demo data onto the live site; remove the accounts or change the passwords afterwards).
 */
import { PrismaClient } from '@prisma/client';

/** Plain-text password of every sample account. */
export const DEV_PASSWORD = 'ShareMaxxing!2026';

/** Argon2id hash of DEV_PASSWORD (m=19456, t=2, p=1). Verifies with any Argon2 library. */
const DEV_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$3Gc8Qc8gGOEVAs0UJRQ88Q$IGGUmoeX+BBbJ7Odt0t/n61EZv7iqArcT1AMm12PUJs';

/** Deterministic UUID: `group` identifies the table, `n` the row. */
const uid = (group: number, n: number): string =>
  `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const HOUR = 3_600_000;
const MIN = 60_000;

const ID = {
  user: { admin: uid(1, 1), moderator: uid(1, 2), ahmet: uid(1, 3), zeynep: uid(1, 4), elif: uid(1, 5), can: uid(1, 6), deniz: uid(1, 7), test: uid(1, 8), suspended: uid(1, 9) },
  trip: { ankaraOut: uid(2, 1), ankaraIn: uid(2, 2), izmirFull: uid(2, 3), bursaIn: uid(2, 4), pastEskisehir: uid(2, 5) },
  booking: { izmir: uid(3, 1), past: uid(3, 2) },
  request: { canOpen: uid(4, 1) },
  payment: { izmir: uid(5, 1), past: uid(5, 2) },
  housing: { kadikoy: uid(7, 1), sariyer: uid(7, 2), besiktas: uid(7, 3) },
  post: { q1: uid(8, 1), q2: uid(8, 2), q3: uid(8, 3), a1: uid(8, 4), a2: uid(8, 5), a3: uid(8, 6) },
};

/** Rows inserted vs rows defined, so a re-run visibly reports "0 new". */
type Tally = Record<string, { inserted: number; total: number }>;

export async function seed(prisma: PrismaClient): Promise<Tally> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Refusing to seed: NODE_ENV=production. Set ALLOW_PRODUCTION_SEED=true to load the demo data on purpose.');
  }

  // ── Lookup data comes from migrations. Fail early and clearly if it is missing. ──
  const [cityCount, districts, categories] = await Promise.all([
    prisma.city.count(),
    prisma.istanbulDistrict.findMany({ select: { id: true, name: true } }),
    prisma.forumCategory.findMany({ select: { id: true, code: true } }),
  ]);
  if (cityCount !== 81 || districts.length === 0 || categories.length === 0) {
    throw new Error('Lookup data is missing. Run `npm run db:migrate` (or `prisma migrate deploy`) before seeding.');
  }
  const district = (name: string): string => {
    const found = districts.find((d) => d.name === name);
    if (!found) throw new Error(`Unknown İstanbul district: ${name}`);
    return found.id;
  };
  const category = (code: string): string => {
    const found = categories.find((c) => c.code === code);
    if (!found) throw new Error(`Unknown forum category: ${code}`);
    return found.id;
  };

  const now = Date.now();
  const at = (hoursFromNow: number): Date => new Date(now + hoursFromNow * HOUR);
  const tally: Tally = {};
  const record = (table: string, result: { count: number }, total: number): void => {
    tally[table] = { inserted: result.count, total };
  };

  // ── Users (all verified; one of each role) ──
  const verifiedAt = at(-24 * 30);
  const user = (id: string, email: string, displayName: string, extra: { role?: 'USER' | 'MODERATOR' | 'ADMIN'; status?: 'ACTIVE' | 'SUSPENDED'; bio?: string } = {}) => ({
    id,
    email,
    passwordHash: DEV_PASSWORD_HASH,
    displayName,
    emailVerifiedAt: verifiedAt,
    createdAt: verifiedAt,
    ...extra,
  });
  const users = [
    user(ID.user.admin, 'admin@itu.edu.tr', 'Admin Yılmaz', { role: 'ADMIN' }),
    user(ID.user.moderator, 'moderator@itu.edu.tr', 'Moderatör Kaya', { role: 'MODERATOR' }),
    user(ID.user.ahmet, 'ahmet.demir@itu.edu.tr', 'Ahmet Demir', { bio: 'Hafta sonları İstanbul–Ankara arası gidip geliyorum.' }),
    user(ID.user.zeynep, 'zeynep.arslan@itu.edu.tr', 'Zeynep Arslan', { bio: 'Bursa ve İzmir yolculukları yapıyorum.' }),
    user(ID.user.elif, 'elif.yildiz@itu.edu.tr', 'Elif Yıldız'),
    user(ID.user.can, 'can.ozturk@itu.edu.tr', 'Can Öztürk'),
    user(ID.user.deniz, 'deniz.sahin@itu.edu.tr', 'Deniz Şahin'),
    user(ID.user.test, 'test.user@itu.edu.tr', 'Test Kullanıcı', { bio: 'Geçici test hesabı: kimlik doğrulama tamamlanana kadar kullanılır.' }),
    user(ID.user.suspended, 'suspended.user@itu.edu.tr', 'Askıya Alınmış Kullanıcı', { status: 'SUSPENDED' }),
  ];
  record('users', await prisma.user.createMany({ data: users, skipDuplicates: true }), users.length);

  const submerchants = [
    { userId: ID.user.ahmet, iyzicoSubmerchantKey: 'sandbox-submerchant-ahmet' },
    { userId: ID.user.zeynep, iyzicoSubmerchantKey: 'sandbox-submerchant-zeynep' },
  ];
  record('driver_submerchants', await prisma.driverSubmerchant.createMany({ data: submerchants, skipDuplicates: true }), submerchants.length);

  // ── Trips (city codes are plate codes: 34 İstanbul, 6 Ankara, 35 İzmir, 16 Bursa, 26 Eskişehir) ──
  const trips = [
    {
      id: ID.trip.ankaraOut, driverId: ID.user.ahmet, originCityCode: 34, destinationCityCode: 6,
      departureAt: at(72), seatCapacity: 3, priceMinor: 40000n, createdAt: at(-48),
      description: 'Cuma akşamı Ayazağa kampüsünden çıkış. Bagaj yeri sınırlı.', contactDetails: 'WhatsApp: 0555 000 00 01',
    },
    {
      id: ID.trip.ankaraIn, driverId: ID.user.ahmet, originCityCode: 6, destinationCityCode: 34,
      departureAt: at(96), seatCapacity: 3, priceMinor: 40000n, createdAt: at(-48),
      description: 'Pazar akşamı Ankara’dan dönüş.',
    },
    {
      // capacity 1 + one confirmed booking below = a FULL trip, to demo "free seats first, full trips after"
      id: ID.trip.izmirFull, driverId: ID.user.zeynep, originCityCode: 34, destinationCityCode: 35,
      departureAt: at(120), seatCapacity: 1, priceMinor: 55000n, createdAt: at(-24),
      description: 'Tek koltuk, sigara içilmez.',
    },
    {
      id: ID.trip.bursaIn, driverId: ID.user.zeynep, originCityCode: 16, destinationCityCode: 34,
      departureAt: at(48), seatCapacity: 2, priceMinor: 20000n, createdAt: at(-24),
    },
    {
      // finished ride, so profiles have ride history and ratings
      id: ID.trip.pastEskisehir, driverId: ID.user.ahmet, originCityCode: 34, destinationCityCode: 26,
      departureAt: at(-240), seatCapacity: 2, priceMinor: 30000n, createdAt: at(-336),
      status: 'COMPLETED' as const, driverCompletedAt: at(-237),
    },
  ];
  record('trips', await prisma.trip.createMany({ data: trips, skipDuplicates: true }), trips.length);

  // ── Askıda bilet: an OPEN request holds no seat and has no booking yet ──
  const requests = [
    { id: ID.request.canOpen, tripId: ID.trip.ankaraOut, recipientId: ID.user.can, amountMinor: 40000n, status: 'OPEN' as const, createdAt: at(-1), expiresAt: at(70) },
  ];
  record('sponsorship_requests', await prisma.sponsorshipRequest.createMany({ data: requests, skipDuplicates: true }), requests.length);

  // ── Bookings, payments and ledger (the ledger rows are insert-only) ──
  const izmirCreated = at(-2);
  const pastCreated = at(-24 * 13);
  const bookings = [
    {
      id: ID.booking.izmir, tripId: ID.trip.izmirFull, passengerId: ID.user.elif, priceMinor: 55000n,
      status: 'CONFIRMED' as const, createdAt: izmirCreated, reservationExpiresAt: new Date(izmirCreated.getTime() + 15 * MIN),
    },
    {
      id: ID.booking.past, tripId: ID.trip.pastEskisehir, passengerId: ID.user.elif, priceMinor: 30000n,
      status: 'COMPLETED' as const, createdAt: pastCreated, reservationExpiresAt: new Date(pastCreated.getTime() + 15 * MIN),
      passengerCompletedAt: at(-238), completedAt: at(-237),
    },
  ];
  record('bookings', await prisma.booking.createMany({ data: bookings, skipDuplicates: true }), bookings.length);

  const payments = [
    {
      id: ID.payment.izmir, bookingId: ID.booking.izmir, payerId: ID.user.elif, amountMinor: 55000n,
      providerPaymentId: 'sandbox-payment-1', providerTransactionId: 'sandbox-item-1', idempotencyKey: uid(11, 1),
      status: 'HELD' as const, heldAt: new Date(izmirCreated.getTime() + MIN), createdAt: izmirCreated,
    },
    {
      id: ID.payment.past, bookingId: ID.booking.past, payerId: ID.user.elif, amountMinor: 30000n,
      providerPaymentId: 'sandbox-payment-2', providerTransactionId: 'sandbox-item-2', idempotencyKey: uid(11, 2),
      status: 'RELEASED' as const, heldAt: new Date(pastCreated.getTime() + MIN), releasedAt: at(-236), createdAt: pastCreated,
    },
  ];
  record('payments', await prisma.payment.createMany({ data: payments, skipDuplicates: true }), payments.length);

  const ledger = [
    { id: uid(6, 1), paymentId: ID.payment.izmir, eventType: 'PAYMENT' as const, amountMinor: 55000n, createdAt: new Date(izmirCreated.getTime() + MIN) },
    { id: uid(6, 2), paymentId: ID.payment.izmir, eventType: 'HOLD' as const, amountMinor: 55000n, createdAt: new Date(izmirCreated.getTime() + MIN) },
    { id: uid(6, 3), paymentId: ID.payment.past, eventType: 'PAYMENT' as const, amountMinor: 30000n, createdAt: new Date(pastCreated.getTime() + MIN) },
    { id: uid(6, 4), paymentId: ID.payment.past, eventType: 'HOLD' as const, amountMinor: 30000n, createdAt: new Date(pastCreated.getTime() + MIN) },
    { id: uid(6, 5), paymentId: ID.payment.past, eventType: 'RELEASE' as const, amountMinor: 30000n, createdAt: at(-236) },
  ];
  record('payment_ledger', await prisma.paymentLedgerEntry.createMany({ data: ledger, skipDuplicates: true }), ledger.length);

  // Both directions exist, so the pair is revealed (revealed_ride_ratings).
  const ratings = [
    { bookingId: ID.booking.past, direction: 'PASSENGER_TO_DRIVER' as const, score: 5, review: 'Zamanında çıktı, rahat bir yolculuktu.', createdAt: at(-230) },
    { bookingId: ID.booking.past, direction: 'DRIVER_TO_PASSENGER' as const, score: 4, review: 'Dakik ve kibar bir yolcu.', createdAt: at(-229) },
  ];
  record('ride_ratings', await prisma.rideRating.createMany({ data: ratings, skipDuplicates: true }), ratings.length);

  // ── Housing ──
  const housing = [
    {
      id: ID.housing.kadikoy, authorId: ID.user.elif, districtId: district('Kadıköy'), listingType: 'HAVE_ROOM' as const,
      title: 'Kadıköy’de 2+1 evde boş oda', description: 'Moda’ya yürüme mesafesinde, eşyalı oda. Kira ev arkadaşlarıyla paylaşılıyor. Ayrıntılar için iletişime geçin.',
      contactDetails: 'WhatsApp: 0555 000 00 05', createdAt: at(-72),
    },
    {
      id: ID.housing.sariyer, authorId: ID.user.can, districtId: district('Sarıyer'), listingType: 'NEED_ROOM' as const,
      title: 'Maslak civarında oda arıyorum', description: 'Ayazağa kampüsüne yakın, sakin bir evde oda arıyorum. Sigara içmiyorum.', createdAt: at(-48),
    },
    {
      id: ID.housing.besiktas, authorId: ID.user.ahmet, districtId: district('Beşiktaş'), listingType: 'HAVE_ROOM' as const,
      title: 'Beşiktaş’ta oda (kapandı)', description: 'Oda kiraya verildi. Bu ilan kapalı ilanların davranışını göstermek için örnek olarak duruyor.',
      status: 'CLOSED' as const, createdAt: at(-120),
    },
  ];
  record('housing_listings', await prisma.housingListing.createMany({ data: housing, skipDuplicates: true }), housing.length);

  // ── Forum: questions first, then answers (an answer has a parent, no category and no title) ──
  const questions = [
    {
      id: ID.post.q1, authorId: ID.user.can, kind: 'QUESTION' as const, categoryId: category('COURSE'),
      title: 'Veri Yapıları dersi için kaynak önerisi?', body: 'Bu dönem Veri Yapıları alıyorum. Vize öncesi çalışmak için hangi kaynakları önerirsiniz?', createdAt: at(-30),
    },
    {
      id: ID.post.q2, authorId: ID.user.elif, kind: 'QUESTION' as const, categoryId: category('CAFETERIA'),
      title: 'Yemekhane hafta sonu açık mı?', body: 'Cumartesi ve pazar günleri yemekhane öğle yemeği veriyor mu?', createdAt: at(-20),
    },
    {
      id: ID.post.q3, authorId: ID.user.test, kind: 'QUESTION' as const, categoryId: category('TRANSPORT'),
      title: 'Ayazağa’dan Kadıköy’e en pratik yol nedir?', body: 'Kampüsten Kadıköy’e metro ve vapurla gitmeyi düşünüyorum. Daha hızlı bir alternatif var mı?', createdAt: at(-10),
    },
  ];
  record('forum_posts (questions)', await prisma.forumPost.createMany({ data: questions, skipDuplicates: true }), questions.length);

  const answers = [
    { id: ID.post.a1, authorId: ID.user.ahmet, kind: 'ANSWER' as const, parentPostId: ID.post.q1, body: 'Cormen’in kitabıyla başla, çıkmış vize sorularını da çöz.', createdAt: at(-28) },
    { id: ID.post.a2, authorId: ID.user.zeynep, kind: 'ANSWER' as const, parentPostId: ID.post.q1, body: 'Ders notlarındaki ağaç ve graf örneklerini mutlaka kendin kodla.', createdAt: at(-26) },
    { id: ID.post.a3, authorId: ID.user.deniz, kind: 'ANSWER' as const, parentPostId: ID.post.q3, body: 'M2 ile Levent’e inip M4’e aktarma yapmak genelde en hızlısı.', createdAt: at(-8) },
  ];
  record('forum_posts (answers)', await prisma.forumPost.createMany({ data: answers, skipDuplicates: true }), answers.length);

  // ── Notifications: display-safe text plus an internal link, never donor/recipient identities ──
  const notifications = [
    {
      id: uid(9, 1), recipientId: ID.user.zeynep, kind: 'BOOKING' as const, createdAt: izmirCreated,
      payload: { title: 'Yeni rezervasyon', body: 'İstanbul → İzmir yolculuğunuz için bir koltuk rezerve edildi.', link: { type: 'trip', id: ID.trip.izmirFull } },
    },
    {
      id: uid(9, 2), recipientId: ID.user.can, kind: 'FORUM_REPLY' as const, createdAt: at(-28),
      payload: { title: 'Sorunuza yanıt geldi', body: 'Veri Yapıları sorunuza yeni bir yanıt yazıldı.', link: { type: 'forum_post', id: ID.post.q1 } },
    },
    {
      id: uid(9, 3), recipientId: ID.user.elif, kind: 'PAYMENT' as const, createdAt: izmirCreated, readAt: at(-1),
      payload: { title: 'Ödemeniz alındı', body: 'İstanbul → İzmir yolculuğu için ödemeniz güvenle tutuluyor.', link: { type: 'booking', id: ID.booking.izmir } },
    },
  ];
  record('notifications', await prisma.notification.createMany({ data: notifications, skipDuplicates: true }), notifications.length);

  // ── Moderation queue: one user report, one "AI unavailable" case (content stays visible) ──
  const cases = [
    {
      id: uid(10, 1), source: 'USER' as const, reporterId: ID.user.elif, targetPostId: ID.post.q3,
      reason: 'Spam şüphesi', createdAt: at(-6),
    },
    {
      id: uid(10, 2), source: 'AI' as const, aiUnavailable: true, targetPostId: ID.post.q2,
      reason: 'AI_UNAVAILABLE', createdAt: at(-5),
    },
  ];
  record('moderation_cases', await prisma.moderationCase.createMany({ data: cases, skipDuplicates: true }), cases.length);

  return tally;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tally = await seed(prisma);
    console.log('Seed finished (new rows / defined rows):');
    for (const [table, { inserted, total }] of Object.entries(tally)) {
      console.log(`  ${table.padEnd(26)} ${inserted} / ${total}`);
    }
    console.log(`\nSample logins: <email>@itu.edu.tr, password "${DEV_PASSWORD}"`);
    console.log('  admin@itu.edu.tr, moderator@itu.edu.tr, test.user@itu.edu.tr, ahmet.demir@itu.edu.tr (driver), elif.yildiz@itu.edu.tr (passenger)');
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (`tsx prisma/seed.ts`), not when imported by a test.
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
