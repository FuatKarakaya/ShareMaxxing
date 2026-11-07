import { getDevelopmentDatabaseUrl, getTestDatabaseUrl } from '../scripts/database-config';

test('test database is derived from one URL while retaining server, credentials and options', () => {
  const databaseUrl = 'postgresql://student:p%40ss@localhost:5433/sharemaxxing?schema=custom&host=/tmp/postgres';
  const development = new URL(databaseUrl);
  const derived = new URL(getTestDatabaseUrl({ DATABASE_URL: databaseUrl }));
  expect(derived.pathname).toBe('/sharemaxxing_test');
  expect(derived.host).toBe(development.host);
  expect(derived.username).toBe(development.username);
  expect(derived.password).toBe(development.password);
  expect(derived.search).toBe(development.search);
  expect(getDevelopmentDatabaseUrl({ DATABASE_URL: databaseUrl })).toBe(databaseUrl);
});

test('optional test override must name a separate test database', () => {
  const databaseUrl = 'postgresql://student:secret@localhost/sharemaxxing';
  expect(new URL(getTestDatabaseUrl({ DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: 'postgresql://student:secret@localhost/custom_test' })).pathname).toBe('/custom_test');
  expect(() => getTestDatabaseUrl({ DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl })).toThrow(/must end in _test/);
  expect(() => getTestDatabaseUrl({ DATABASE_URL: `${databaseUrl}_test`, TEST_DATABASE_URL: `${databaseUrl}_test` })).toThrow(/must differ/);
});

test('missing or invalid database configuration fails before executing a command', () => {
  for (const value of [undefined, 'not-a-url', 'sqlite://localhost/db', 'postgresql://localhost/']) {
    expect(() => getDevelopmentDatabaseUrl({ DATABASE_URL: value })).toThrow();
    expect(() => getTestDatabaseUrl({ DATABASE_URL: value })).toThrow();
  }
  expect(() => getTestDatabaseUrl({ DATABASE_URL: `postgresql://localhost/${'x'.repeat(60)}` })).toThrow(/too long/);
});
