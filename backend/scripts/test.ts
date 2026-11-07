import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getTestDatabaseUrl } from './database-config';
import { backendDirectory, prepareDatabase } from './database';

async function main() {
  const databaseUrl = getTestDatabaseUrl();
  await prepareDatabase(databaseUrl);
  const files = readdirSync(join(backendDirectory, 'tests'))
    .filter(name => name.endsWith('.test.ts'))
    .map(name => join(backendDirectory, 'dist', 'tests', name.replace(/\.ts$/, '.js')));
  if (!files.length) throw new Error('No backend test files found.');
  const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--runInBand', '--runTestsByPath', ...files], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Test setup failed.');
  process.exitCode = 1;
});
