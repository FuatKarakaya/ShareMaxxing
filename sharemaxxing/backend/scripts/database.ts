import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getDevelopmentDatabaseUrl, getTestDatabaseUrl } from './database-config';

export const backendDirectory = resolve(__dirname, '..');

export function runPrisma(args: string[], databaseUrl: string): void {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
    cwd: backendDirectory,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
  if (result.error) throw new Error('Could not start the Prisma CLI. Check that backend dependencies are installed.');
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(' ')} failed (exit ${result.status ?? result.signal}). Resolve the Prisma error shown above before retrying.`);
  }
}

async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  // Load after generation so `npm test` also works with an ungenerated client.
  const { PrismaClient, Prisma } = require('@prisma/client') as typeof import('@prisma/client');
  const target = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await target.$connect();
    return;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientInitializationError) || error.errorCode !== 'P1003') {
      throw new Error('Cannot connect to PostgreSQL. Check DATABASE_URL, credentials and that the server is running.');
    }
  } finally {
    await target.$disconnect();
  }

  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const rows = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = ${name})
    `;
    if (!rows[0].exists) {
      // Identifiers cannot be query parameters; quote embedded double quotes.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } catch (error) {
    // Another concurrent setup may have created the database first.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)
      || error.code !== 'P2010' || error.meta?.code !== '42P04') {
      throw new Error('Cannot create the database. The configured PostgreSQL user needs access to the postgres maintenance database and CREATEDB permission, or the empty database must be created once by an administrator.');
    }
  } finally {
    await admin.$disconnect();
  }
}

export async function prepareDatabase(databaseUrl: string): Promise<void> {
  await ensureDatabaseExists(databaseUrl);
  // Prisma records applied migrations; subsequent runs only apply pending ones.
  runPrisma(['migrate', 'deploy'], databaseUrl);
}

async function main() {
  const command = process.argv[2];
  if (!['setup', 'test:setup', 'reset', 'test:reset'].includes(command)) {
    throw new Error('Expected setup, test:setup, reset or test:reset.');
  }
  const test = command.startsWith('test:');
  const databaseUrl = test ? getTestDatabaseUrl() : getDevelopmentDatabaseUrl();
  if (command.endsWith('reset')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database reset is disabled when NODE_ENV=production.');
    }
    // Keep Prisma's interactive confirmation. Resets always delete data,
    // replay committed migrations, and never run the demo seed implicitly.
    runPrisma(['migrate', 'reset', '--skip-seed', '--skip-generate'], databaseUrl);
  } else {
    await prepareDatabase(databaseUrl);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Database command failed.');
    process.exitCode = 1;
  });
}
