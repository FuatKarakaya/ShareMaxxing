import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { hashPassword, verifyPassword } from '../src/lib/passwords';
import { prisma } from '../src/lib/prisma';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Run npm test to prepare the isolated test database automatically.');
}

const jwtSecret = 'integration-test-secret-only-at-least-32-characters';
const prefix = `auth-test-${randomUUID()}`;
const password = 'Test password 123 ';
let passwordHash: string;
let email: string;
let api: ReturnType<typeof request>;

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecret;
  passwordHash = await hashPassword(password);
});

beforeEach(() => {
  email = `${prefix}-${randomUUID()}@itu.edu.tr`;
  api = request(createApp());
});

afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  } finally {
    await prisma.$disconnect();
  }
});

function post(path: string, body: unknown) {
  return api.post(`/api/auth/${path}`).type('json').send(JSON.stringify(body));
}

const signup = (extra: object = {}) => post('signup', { email, password, displayName: '  Test Öğrenci  ', ...extra });
const login = (extra: object = {}) => post('login', { email, password, ...extra });

function me(accessToken?: string) {
  const result = api.get('/api/auth/me');
  return accessToken ? result.set('Authorization', `Bearer ${accessToken}`) : result;
}

function createUser(verified = false) {
  return prisma.user.create({
    data: { email, passwordHash, displayName: 'Test Öğrenci', emailVerifiedAt: verified ? new Date() : null },
  });
}

function expectNoSecrets(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(/password|passwordHash|password_hash|scrypt\$/i);
}

test('health is available without authentication', async () => {
  await api.get('/health').expect(200);
});

test('rejects foreign domains and lookalike domains', async () => {
  for (const invalid of ['student@gmail.com', 'student@itu.edu.tr.evil.test', 'student@sub.itu.edu.tr']) {
    await signup({ email: invalid }).expect(400);
  }
});

test('rejects malformed fields, weak passwords, and role/verification injection', async () => {
  for (const extra of [{ password: 'short' }, { password: 'x'.repeat(129) }, { email: 42 },
    { displayName: '   ' }, { displayName: 'x'.repeat(101) }, { role: 'ADMIN' }, { emailVerifiedAt: new Date() }]) {
    await signup(extra).expect(400);
  }
  await post('signup', null).expect(400);
  await post('signup', []).expect(400);
});

test('creates a normalized, unverified USER with a hashed password', async () => {
  const { body } = await signup({ email: `  ${email.toUpperCase()}  ` }).expect(201);
  expectNoSecrets(body);
  expect(body.verificationRequired).toBe(true);
  expect(body.user).toMatchObject({ email, displayName: 'Test Öğrenci', role: 'USER', emailVerifiedAt: null });
  expect(body.accessToken).toBeUndefined();
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } });
  expect(stored.passwordHash).not.toBe(password);
  await expect(verifyPassword(password, stored.passwordHash)).resolves.toBe(true);
});

test('database constraints reject invalid domain and empty display name', async () => {
  for (const data of [
    { email: `${prefix}@gmail.com`, displayName: 'Test' },
    { email, displayName: ' ' },
    { email: email.toUpperCase(), displayName: 'Test' },
  ]) {
    await expect(prisma.user.create({ data: { ...data, passwordHash: 'unused' } })).rejects.toThrow();
  }
});

test('returns conflict for an existing email without changing the password', async () => {
  const { id } = await createUser();
  await signup({ password: 'different-password' }).expect(409);
  expect(await prisma.user.count({ where: { email } })).toBe(1);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  await expect(verifyPassword(password, user.passwordHash)).resolves.toBe(true);
});

test('rejects unverified login even with the correct password', async () => {
  await createUser();
  const { body } = await login().expect(403);
  expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
});

test('returns the same error for unknown account and wrong password', async () => {
  await createUser();
  const wrong = await login({ password: 'wrong-password' }).expect(401);
  const unknown = await login({ email: `${prefix}-unknown@itu.edu.tr` }).expect(401);
  expect(wrong.body).toEqual(unknown.body);
});

test('verified account receives a JWT and can read its own user', async () => {
  const { id } = await createUser(true);
  const { body } = await login({ email: email.toUpperCase() }).expect(200).expect('Cache-Control', 'no-store');
  expectNoSecrets(body);
  expect(body.tokenType).toBe('Bearer');
  expect(body.expiresIn).toBe(3600);
  const token = body.accessToken;
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  expect(payload.sub).toBe(id);
  expect(payload.exp - payload.iat).toBe(3600);
  expect(payload.email).toBeUndefined();
  const profile = await me(token).expect(200);
  expect(profile.body.user.id).toBe(id);
  expectNoSecrets(profile.body);
});

test('rejects absent, tampered, expired, and wrong-audience tokens', async () => {
  const { id } = await createUser(true);
  const { body } = await login().expect(200);
  const [header, payload, signature] = body.accessToken.split('.');
  await me().expect(401);
  await me('invalid').expect(401);
  const tampered = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: randomUUID() };
  await me(`${header}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${signature}`).expect(401);

  for (const claims of [{ exp: 1 }, { aud: 'other-api' }, { iss: 'other-issuer' }, { sub: 'bad-uuid' }, { sub: randomUUID() }]) {
    const signedPayload = Buffer.from(JSON.stringify({ sub: id, iss: 'sharemaxxing', aud: 'sharemaxxing-api',
      exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString('base64url');
    const unsigned = `${header}.${signedPayload}`;
    const signed = createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
    await me(`${unsigned}.${signed}`).expect(401);
  }
});

test('existing token reads current role and refuses suspended/unverified users', async () => {
  const { id } = await createUser(true);
  const { body } = await login().expect(200);
  const token = body.accessToken;
  await prisma.user.update({ where: { id }, data: { role: 'MODERATOR' } });
  const profile = await me(token).expect(200);
  expect(profile.body.user.role).toBe('MODERATOR');
  await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
  await me(token).expect(403);
  await login().expect(403);
  await prisma.user.update({ where: { id }, data: { status: 'ACTIVE', emailVerifiedAt: null } });
  await me(token).expect(403);
});

test('malformed JSON and oversized requests have structured errors', async () => {
  for (const [body, status] of [['{bad', 400], [JSON.stringify({ data: 'x'.repeat(17000) }), 413]] as const) {
    const response = await api.post('/api/auth/signup').type('json').send(body).expect(status);
    expect(response.body.error.code).toBeTruthy();
  }
});

test('login attempts are rate limited while health stays available', async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    await login({ email: 'invalid' }).expect(400);
  }
  const response = await login({ email: 'invalid' }).expect(429);
  expect(response.headers['retry-after']).toBeTruthy();
  await api.get('/health').expect(200);
  await me().expect(401);
});
