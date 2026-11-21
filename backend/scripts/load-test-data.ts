// Sample data for the load test (WBS-28.3), see docs/SpeedAndLoadChecks.md.
//
//   LOADTEST_PASSWORD='...' npm run loadtest:seed
//   npm run loadtest:clean
//
// It writes to the database in DATABASE_URL. Everything it creates belongs to
// accounts whose e-mail starts with "loadtest-", and "clean" removes only those.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/passwords';

export const LOAD_TEST_DRIVER = 'loadtest-driver@itu.edu.tr';
export const LOAD_TEST_PASSENGERS = Array.from({ length: 10 }, (_, i) => `loadtest-${String(i + 1).padStart(2, '0')}@itu.edu.tr`);
export const LOAD_TEST_KEYWORD = 'yuktesti';
const TRIPS = 10;
const SEATS_PER_TRIP = 4;
const QUESTIONS = 5;
const HOUR = 3_600_000;

const accounts = { email: { startsWith: 'loadtest-' } };

export async function cleanLoadTestData(prisma: PrismaClient): Promise<number> {
  const bookings = { OR: [{ passenger: accounts }, { trip: { driver: accounts } }] };
  await prisma.payment.deleteMany({ where: { booking: bookings } });
  await prisma.booking.deleteMany({ where: bookings });
  await prisma.trip.deleteMany({ where: { driver: accounts } });
  await prisma.moderationCase.deleteMany({ where: { targetPost: { author: accounts } } });
  await prisma.forumPost.deleteMany({ where: { author: accounts } });
  await prisma.notification.deleteMany({ where: { recipient: accounts } });
  return (await prisma.user.deleteMany({ where: accounts })).count;
}

export async function seedLoadTestData(prisma: PrismaClient, password: string): Promise<void> {
  if (password.length < 8) throw new Error('LOADTEST_PASSWORD must have at least 8 characters. Do not use a real password.');
  await cleanLoadTestData(prisma);

  const passwordHash = await hashPassword(password);
  const account = (email: string, displayName: string) => prisma.user.create({
    data: { email, displayName, passwordHash, emailVerifiedAt: new Date() },
  });
  const driver = await account(LOAD_TEST_DRIVER, 'Yük Testi Sürücü');
  const passengers = [];
  for (const [index, email] of LOAD_TEST_PASSENGERS.entries()) {
    passengers.push(await account(email, `Yük Testi Yolcu ${index + 1}`));
  }

  // İstanbul (34) → Ankara (6), one week from now.
  await prisma.trip.createMany({
    data: Array.from({ length: TRIPS }, (_, i) => ({
      driverId: driver.id,
      originCityCode: 34,
      destinationCityCode: 6,
      departureAt: new Date(Date.now() + (7 * 24 + i) * HOUR),
      seatCapacity: SEATS_PER_TRIP,
      priceMinor: 40000n,
      description: 'Yük testi yolculuğu',
    })),
  });

  const category = await prisma.forumCategory.findFirstOrThrow({ orderBy: { code: 'asc' } });
  for (let i = 1; i <= QUESTIONS; i += 1) {
    const question = await prisma.forumPost.create({
      data: { authorId: driver.id, kind: 'QUESTION', categoryId: category.id, title: `Yük testi sorusu ${i}`, body: `Bu soru ${LOAD_TEST_KEYWORD} için eklendi.` },
    });
    await prisma.forumPost.createMany({
      data: passengers.slice(0, 2).map(passenger => ({ authorId: passenger.id, kind: 'ANSWER' as const, parentPostId: question.id, body: 'Yük testi yanıtı.' })),
    });
  }
}

async function main() {
  const command = process.argv[2];
  if (command !== 'seed' && command !== 'clean') throw new Error('Expected seed or clean.');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL.');
  const prisma = new PrismaClient();
  try {
    if (command === 'seed') {
      await seedLoadTestData(prisma, process.env.LOADTEST_PASSWORD ?? '');
      console.log(`Load test data is ready: 1 driver, ${LOAD_TEST_PASSENGERS.length} passengers, ${TRIPS} trips, ${QUESTIONS} forum questions.`);
    } else {
      console.log(`Removed ${await cleanLoadTestData(prisma)} load test accounts and their data.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Load test data command failed.');
    process.exitCode = 1;
  });
}
