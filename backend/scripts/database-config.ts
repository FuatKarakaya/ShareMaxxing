type Environment = Record<string, string | undefined>;

function parseDatabaseUrl(value: string | undefined, label: string): URL {
  if (!value) throw new Error(`Set ${label} in the backend .env file.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !databaseName(url)) {
    throw new Error(`${label} must be a PostgreSQL URL with a database name.`);
  }
  return url;
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

export function getDevelopmentDatabaseUrl(env: Environment = process.env): string {
  return parseDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL').toString();
}

export function getTestDatabaseUrl(env: Environment = process.env): string {
  const development = env.DATABASE_URL ? parseDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL') : undefined;
  let test: URL;
  if (env.TEST_DATABASE_URL) {
    test = parseDatabaseUrl(env.TEST_DATABASE_URL, 'TEST_DATABASE_URL');
  } else {
    test = parseDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');
    const name = `${databaseName(test)}_test`;
    if (Buffer.byteLength(name, 'utf8') > 63) {
      throw new Error('Derived test database name is too long; set TEST_DATABASE_URL with a shorter name ending in _test.');
    }
    test.pathname = `/${encodeURIComponent(name)}`;
  }
  if (!databaseName(test).endsWith('_test')) {
    throw new Error('The test database name must end in _test.');
  }
  if (development && databaseName(test) === databaseName(development)) {
    throw new Error('Development and test database names must differ.');
  }
  return test.toString();
}
