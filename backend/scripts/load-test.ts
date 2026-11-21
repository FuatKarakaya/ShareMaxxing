// Load test (WBS-28.3, NFR-04), see docs/SpeedAndLoadChecks.md.
//
//   LOADTEST_PASSWORD='...' LOADTEST_API_URL='https://sharemaxxing-api.onrender.com' npm run loadtest
//
// About 100 virtual users search trips, book and cancel a seat and read the
// forum at the same time. Run "npm run loadtest:seed" first.
import { LOAD_TEST_DRIVER, LOAD_TEST_KEYWORD, LOAD_TEST_PASSENGERS } from './load-test-data';

const LIMIT_MS = 5000; // NFR-03: an answer within 5 seconds
const MAX_FAILED_SHARE = 0.01;

export type LoadTestOptions = {
  apiUrl: string;
  password: string;
  virtualUsers?: number;
  rounds?: number;
  // Pause between two requests of one virtual user, chosen at random in this range.
  thinkTimeMs?: [number, number];
};

export type StepResult = { step: string; requests: number; failed: number; medianMs: number; p95Ms: number; maxMs: number };
export type LoadTestResult = {
  virtualUsers: number;
  rounds: number;
  seconds: number;
  steps: StepResult[];
  bookingsMade: number;
  fullTripAnswers: number;
  problems: string[];
  passed: boolean;
};

type Sample = { step: string; ms: number; ok: boolean };
// The body is whatever JSON the endpoint returns.
type Answer = { status: number; body: any };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function percentile(sorted: number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)];
}

export async function runLoadTest(options: LoadTestOptions): Promise<LoadTestResult> {
  const api = options.apiUrl.replace(/\/+$/, '');
  const virtualUsers = options.virtualUsers ?? 100;
  const rounds = options.rounds ?? 5;
  const [thinkMin, thinkMax] = options.thinkTimeMs ?? [200, 1000];
  const samples: Sample[] = [];
  const problems = new Set<string>();

  async function call(token: string | null, method: 'GET' | 'POST', path: string, body?: object): Promise<Answer> {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  // One measured request of a virtual user. A status outside "expected" or no answer counts as failed.
  async function step(name: string, expected: number[], token: string, method: 'GET' | 'POST', path: string, body?: object): Promise<Answer | null> {
    const started = performance.now();
    let answer: Answer | null = null;
    try {
      answer = await call(token, method, path, body);
    } catch {
      // No answer at all (timeout or connection error).
    }
    samples.push({ step: name, ms: performance.now() - started, ok: answer !== null && expected.includes(answer.status) });
    await sleep(thinkMin + Math.random() * (thinkMax - thinkMin));
    return answer;
  }

  // Free hosting sleeps when idle: give the API time to wake up before measuring.
  for (let attempt = 0; ; attempt += 1) {
    const awake = await call(null, 'GET', '/health').then(answer => answer.status === 200, () => false);
    if (awake) break;
    if (attempt === 30) throw new Error(`The API at ${api} does not answer /health.`);
    await sleep(3000);
  }

  async function login(email: string): Promise<string> {
    const answer = await call(null, 'POST', '/api/auth/login', { email, password: options.password });
    if (answer.status === 429) throw new Error('Login is rate limited. Wait 15 minutes and run the test again.');
    if (answer.status !== 200) throw new Error(`Cannot log in as ${email}. Run "npm run loadtest:seed" with the same LOADTEST_PASSWORD first.`);
    return answer.body.accessToken;
  }
  const driver = await login(LOAD_TEST_DRIVER);
  const passengers: string[] = [];
  for (const email of LOAD_TEST_PASSENGERS) passengers.push(await login(email));

  const mine = await call(driver, 'GET', '/api/trips/mine');
  const trips: string[] = mine.body.trips.filter((trip: { status: string }) => trip.status === 'PUBLISHED').map((trip: { id: string }) => trip.id);
  const forum = await call(driver, 'GET', '/api/forum/questions/mine');
  const questions: string[] = forum.body.questions.map((question: { id: string }) => question.id);
  if (!trips.length || !questions.length) throw new Error('No load test trips or forum questions found. Run "npm run loadtest:seed" first.');
  // Every virtual user gets its own account and trip pair, because an account can hold one seat per trip.
  if (virtualUsers > passengers.length * trips.length) throw new Error(`At most ${passengers.length * trips.length} virtual users are supported.`);

  let bookingsMade = 0;
  let fullTripAnswers = 0;

  async function virtualUser(index: number): Promise<void> {
    const token = passengers[index % passengers.length];
    const tripId = trips[Math.floor(index / passengers.length) % trips.length];
    await sleep(Math.random() * thinkMax); // do not start everyone in the same millisecond
    for (let round = 0; round < rounds; round += 1) {
      await step('Search trips', [200], token, 'GET', '/api/trips?originCityCode=34&destinationCityCode=6');
      const detail = await step('Open trip', [200], token, 'GET', `/api/trips/${tripId}`);
      if (detail?.status === 200 && detail.body.trip.occupiedSeats > detail.body.trip.seatCapacity) {
        problems.add('A trip had more booked seats than its capacity.');
      }
      // Ten users want the four seats of one trip, so "full" (409) is a correct answer too.
      const booked = await step('Book seat', [201, 409], token, 'POST', '/api/bookings', { tripId });
      await step('My bookings', [200], token, 'GET', '/api/bookings');
      if (booked?.status === 201) {
        bookingsMade += 1;
        await step('Cancel booking', [200], token, 'POST', `/api/bookings/${booked.body.booking.id}/cancel`);
      } else if (booked?.status === 409 && booked.body?.error?.code === 'TRIP_FULL') {
        fullTripAnswers += 1;
      } else if (booked) {
        problems.add(`A booking was refused with ${booked.body?.error?.code ?? booked.status}.`);
      }
      await step('Forum list', [200], token, 'GET', '/api/forum/questions');
      await step('Forum search', [200], token, 'GET', `/api/forum/questions?q=${LOAD_TEST_KEYWORD}`);
      await step('Open question', [200], token, 'GET', `/api/forum/questions/${questions[(index + round) % questions.length]}`);
    }
  }

  const started = performance.now();
  await Promise.all(Array.from({ length: virtualUsers }, (_, index) => virtualUser(index)));
  const seconds = (performance.now() - started) / 1000;

  // Every booking was cancelled again, so no seat may still be taken.
  for (const tripId of trips) {
    const detail = await call(driver, 'GET', `/api/trips/${tripId}`);
    if (detail.status !== 200 || detail.body.trip.occupiedSeats !== 0) problems.add('A seat stayed booked after all bookings were cancelled.');
  }

  const names = [...new Set(samples.map(sample => sample.step))];
  const steps = names.map(name => {
    const own = samples.filter(sample => sample.step === name);
    const times = own.map(sample => sample.ms).sort((a, b) => a - b);
    return {
      step: name,
      requests: own.length,
      failed: own.filter(sample => !sample.ok).length,
      medianMs: Math.round(percentile(times, 0.5)),
      p95Ms: Math.round(percentile(times, 0.95)),
      maxMs: Math.round(times[times.length - 1]),
    };
  });
  const failed = samples.filter(sample => !sample.ok).length;
  if (failed > samples.length * MAX_FAILED_SHARE) problems.add(`${failed} of ${samples.length} requests failed.`);
  for (const result of steps) {
    if (result.p95Ms > LIMIT_MS) problems.add(`"${result.step}" took longer than ${LIMIT_MS} ms for more than 5% of the requests.`);
  }

  return { virtualUsers, rounds, seconds, steps, bookingsMade, fullTripAnswers, problems: [...problems], passed: problems.size === 0 };
}

// The result as Markdown, ready for the Software Test Report.
export function formatLoadTestResult(result: LoadTestResult): string {
  const total = result.steps.reduce((sum, step) => sum + step.requests, 0);
  return [
    `${result.virtualUsers} virtual users, ${result.rounds} rounds each, ${total} requests in ${result.seconds.toFixed(1)} s.`,
    `${result.bookingsMade} seats were booked and cancelled again; ${result.fullTripAnswers} booking attempts got the answer "trip is full".`,
    '',
    '| Step | Requests | Failed | Median (ms) | 95% under (ms) | Slowest (ms) |',
    '|---|---|---|---|---|---|',
    ...result.steps.map(step => `| ${step.step} | ${step.requests} | ${step.failed} | ${step.medianMs} | ${step.p95Ms} | ${step.maxMs} |`),
    '',
    result.passed ? 'Result: PASSED' : `Result: FAILED\n${result.problems.map(problem => `- ${problem}`).join('\n')}`,
  ].join('\n');
}

async function main() {
  const password = process.env.LOADTEST_PASSWORD;
  if (!password) throw new Error('Set LOADTEST_PASSWORD to the password used for "npm run loadtest:seed".');
  const result = await runLoadTest({
    apiUrl: process.env.LOADTEST_API_URL ?? 'http://localhost:3000',
    password,
    virtualUsers: Number(process.env.LOADTEST_USERS ?? 100),
    rounds: Number(process.env.LOADTEST_ROUNDS ?? 5),
  });
  console.log(formatLoadTestResult(result));
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'The load test could not run.');
    process.exitCode = 1;
  });
}
