import type { AddressInfo } from 'node:net';
import { cleanLoadTestData, seedLoadTestData } from '../scripts/load-test-data';
import { formatLoadTestResult, runLoadTest } from '../scripts/load-test';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use npm test.');

const PASSWORD = 'load-test-only-password';
const STEPS = ['Search trips', 'Open trip', 'Book seat', 'My bookings', 'Cancel booking', 'Forum list', 'Forum search', 'Open question'];

afterAll(async () => {
  await cleanLoadTestData(prisma);
  await prisma.$disconnect();
});

// Keeps the load test script working when the endpoints it uses change.
test('a small load test run passes against the real API and leaves no seat booked', async () => {
  process.env.JWT_SECRET = 'integration-test-secret-only-at-least-32-characters';
  await seedLoadTestData(prisma, PASSWORD);
  const server = createApp().listen(0);
  try {
    const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const result = await runLoadTest({ apiUrl, password: PASSWORD, virtualUsers: 12, rounds: 2, thinkTimeMs: [0, 0] });

    expect(result.problems).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.steps.map(step => step.step).sort()).toEqual([...STEPS].sort());
    expect(result.steps.every(step => step.failed === 0 && step.requests > 0)).toBe(true);
    expect(result.bookingsMade).toBeGreaterThan(0);
    expect(await prisma.booking.count({ where: { passenger: { email: { startsWith: 'loadtest-' } }, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } } })).toBe(0);
    expect(formatLoadTestResult(result)).toContain('Result: PASSED');

    await expect(runLoadTest({ apiUrl, password: 'a-wrong-password', virtualUsers: 1, rounds: 1, thinkTimeMs: [0, 0] })).rejects.toThrow('loadtest:seed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}, 60_000);

test('cleaning removes every load test account', async () => {
  await seedLoadTestData(prisma, PASSWORD);
  expect(await cleanLoadTestData(prisma)).toBe(11);
  expect(await prisma.user.count({ where: { email: { startsWith: 'loadtest-' } } })).toBe(0);
  expect(await prisma.trip.count({ where: { description: 'Yük testi yolculuğu' } })).toBe(0);
});
