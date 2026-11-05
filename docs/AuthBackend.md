# Authentication backend — WBS-1.1 and WBS-2.1

Implemented: İTÜ-only sign-up, salted scrypt password hashing, verified-account
login, one-hour JWT access tokens, and authentication middleware that reads the
current user status from PostgreSQL on every protected request.

WBS-1.2 (email code generation, Nodemailer delivery, verification and resend) is
not implemented yet. New accounts stay unverified and cannot log in. No endpoint
allows clients to mark themselves verified. Use the local verified demo account
to test login until WBS-1.2 is connected. Role authorization (WBS-2.2) and login
pages (WBS-2.3) remain separate work.

## Local setup

Use Node.js 22 (the CI version) and PostgreSQL 16. Run backend commands from
`sharemaxxing/backend`, where `package.json` lives; the repository root is not
an npm project.

```bash
cd sharemaxxing/backend
npm ci
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL` to your PostgreSQL server and database name and replace
`JWT_SECRET` with a random secret of at least 32 characters. For example, generate
one with `openssl rand -hex 32`. Do not commit `.env` or use the example placeholder
as a secret. The server loads `.env` automatically and refuses to start with a
missing database URL or missing/placeholder JWT secret.

```bash
npm run build
npm run dev
```

PostgreSQL must already be running. The configured database user needs permission
to create databases for automatic first-time setup (or an administrator must
create the empty databases once).

`npm run build` generates Prisma Client, compiles TypeScript and runs
the database setup helper. If the database does not exist, the helper creates it
through PostgreSQL's `postgres` maintenance database, then runs
`prisma migrate deploy` to apply the SQL migrations in `prisma/migrations/`.
The same credentials are used; an existing database does not require connecting
to the maintenance database. These versioned `migration.sql`
files serve as the initialization scripts; there is no separate `init.sql` to
keep in sync. Prisma records applied migrations in `_prisma_migrations`, so
rebuilding with only backend/frontend code changes preserves existing data.
Pending migrations run once on the next build. Build never resets or seeds data.

`npm run start` starts the compiled server after `npm run build`.
Default URL: `http://localhost:3000`; health endpoint: `GET /health`.
For compilation without connecting to PostgreSQL, use `npm run build:code`.

The TypeScript configuration pairs `module: "Node16"` with
`moduleResolution: "Node16"`. Without `type: "module"` in `package.json`, these
`.ts` files still compile to CommonJS. The previous `"Node"` option refers to
the old Node10 resolution algorithm, which is deprecated in TypeScript 6.
The project currently uses TypeScript 5.9.3; the IDE may use a newer bundled
version. If diagnostics remain stale, select the workspace TypeScript version
and restart the IDE's TypeScript server.

## Schema changes and manual reset

When the data model changes, edit `prisma/schema.prisma` and create a migration:

```bash
npm run db:migrate -- --name describe_your_change
```

Commit both the schema and the generated migration. A schema edit alone is not
applied by `migrate deploy`; the migration file must exist. For changes that Prisma
cannot represent (such as the existing SQL CHECK constraints), keep the custom
SQL in the migration. `migrate dev` may require permission to create a temporary
shadow database for checking schema changes.

To clear development data and reconstruct the schema from all migrations:

```bash
npm run db:reset
```

This deliberately deletes the configured development database's schema/data;
Prisma asks for terminal confirmation. It replays migrations without running
the demo seed. It does not invent a migration from unrecorded schema edits.
Create the migration first, then reset if you also want an empty database.
Reset commands refuse to run with `NODE_ENV=production`.

### Existing SQL databases and P3005

An existing database created by importing SQL can contain tables without Prisma's
migration history. `migrate deploy` then stops with P3005 instead of assuming
those tables match the initial migration. Verify the existing columns,
constraints, role/status values and table ownership before baselining. Marking
an incompatible migration as applied would leave the database inconsistent with
the Prisma schema. The application's PostgreSQL role also needs access to tables
created by another owner. Preserve the existing schema/data while deciding
whether to adopt that schema or use a separate development database.

## Local demo users

Set `SEED_PASSWORD` in your local `.env` to a demo-only password (8–128 characters),
then run `npm run db:seed`. This creates:

| Email | Email verified | Expected login |
| --- | --- | --- |
| `demo.verified@itu.edu.tr` | Yes | 200 + JWT |
| `demo.unverified@itu.edu.tr` | No | 403 `EMAIL_NOT_VERIFIED` |

The seed refuses to run with `NODE_ENV=production`, creates only USER accounts,
and leaves existing accounts and their passwords unchanged. Rerunning it with a
different password does not reset existing demo accounts.

## API contract

All request bodies are JSON. Errors use
`{ "error": { "code": "...", "message": "..." } }`.

| Endpoint | Body / header | Success | Main errors |
| --- | --- | --- | --- |
| `POST /api/auth/signup` | `email`, `password`, `displayName` | 201 `{ user, verificationRequired: true }` | 400 invalid input, 409 duplicate email |
| `POST /api/auth/login` | `email`, `password` | 200 `{ accessToken, tokenType: "Bearer", expiresIn: 3600, user }` | 401 wrong credentials, 403 unverified/suspended |
| `GET /api/auth/me` | `Authorization: Bearer <accessToken>` | 200 `{ user }` | 401 missing/invalid/expired token, 403 unverified/suspended |

Email is trimmed and lowercased; only the exact `@itu.edu.tr` domain is allowed.
Passwords are 8–128 characters and are never trimmed. Display names are trimmed
and must be 1–100 characters. Sign-up rejects extra fields, including role and
verification fields. Passwords and hashes never appear in responses or JWTs.
The `user` in these responses belongs to the caller; its email must not be reused
as a public profile response.

Sign-up and login each allow 30 requests per IP per 15 minutes and return 429
when exceeded. This initial limiter uses process-local memory. When deploying
multiple API instances, configure a shared limiter store and the exact trusted
proxy configuration. `/me` is not counted against login attempts.

JWTs use HS256 with a fixed issuer/audience and an expiration. The middleware
also checks the current database account: suspension takes effect even for an
already-issued token, and roles are read from the database. Logout has no server
endpoint in this WBS: discarding the token on the client does not revoke copies;
they expire after one hour. Immediate server-side session revocation would need
an additional design decision before claiming that behavior.

Example sign-up:

```bash
curl -i http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"student@itu.edu.tr","password":"example-password-123","displayName":"Öğrenci"}'
```

Example login with a seeded account (replace the password with your `SEED_PASSWORD`):

```bash
curl -i http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo.verified@itu.edu.tr","password":"your-local-demo-password"}'
```

Pass the returned token to `/api/auth/me` as a Bearer header. A browser or mobile
UI can call the same endpoints later; these curl requests already exercise the
backend without a frontend.

## Tests and CI

All backend tests live in the existing `sharemaxxing/backend/tests/` directory.
The duplicate repository-root test directory has been removed. The submission
guide asks for tests in a `tests/` folder but does not explicitly require that
folder to be at the repository root; this follows the existing backend scaffold.

With the single `DATABASE_URL` in `.env`, run the Jest tests:

```bash
npm test
```

The runner derives the test URL by appending `_test` to the database name and
keeps the same server, credentials and connection options. For example,
`sharemaxxing` becomes `sharemaxxing_test`. `npm test` generates Prisma Client
and compiles the TypeScript tests before the runner creates the test database
if absent, applies pending migrations and starts Jest
with that test database as their `DATABASE_URL`. No separate URL or manual
database creation/migration step is needed. An optional `TEST_DATABASE_URL` can
override the connection; the name must end in `_test` and differ from the
development database name. The runner reads `.env` automatically.

Normal test runs preserve the test database and clean up only their unique
fixture accounts. To explicitly clear/recreate its schema from migrations:

```bash
npm run db:test:reset
```

This also asks for confirmation and leaves the development database untouched.
`npm run db:setup` and `npm run db:test:setup` apply migrations without compiling
or running tests, if needed independently.

The integration suite uses Supertest to exercise the Express HTTP routes against PostgreSQL:
normalization, database constraints, hashing, duplicates, account state, JWT
tampering/expiration/issuer/audience, response privacy, malformed requests and
rate limiting. Additional tests check independent password salts/comparisons and
test database URL derivation/isolation.

`.github/workflows/ci.yml` at the repository root provisions PostgreSQL 16, uses
Node.js 22, installs from `package-lock.json`, builds and runs `npm test`. These
commands create and migrate their respective databases automatically from a
single URL. Branch protection must separately require
this CI job before merge.

Prisma CLI and Client are pinned together to 6.19.3. Its `@prisma/config`
dependency uses an explicit `deepmerge-ts` 8.0.2 override to address
[GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx).
Password hashing uses the asynchronous [Node.js scrypt API](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback);
token signing/verification uses [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken).

## Report backend before the report button — WBS-17.1

WBS-17.1 is not implemented in this change. Its backend can precede the frontend:
an authenticated report endpoint validates the target and reason and creates an
open `moderation_cases` row. Test this contract using HTTP requests first; later
the report button/form sends the same request. Moderator queue listing/actions
belong to WBS-25.1. Because WBS-17.1's acceptance criterion includes the button
and form, keep the WBS in progress until that UI is connected and checked.
