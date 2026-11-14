# İTÜ ShareMaxxing

A web and mobile platform where verified İTÜ students share intercity rides to and from İstanbul, fund seats for students in need, find housing and roommates, and ask questions in a student forum.

## Team

| Member | Development Role | Management Role |
| :---- | :---- | :---- |
| Mehmet Fuat Karakaya | Backend Developer (Rides, Search, Booking) | Product Owner |
| Ege Demir | DevOps, Authentication, Forum/Housing and AI Integration | Configuration Manager |
| Alperen Akbaş | Backend Developer (Payments, Askıda Bilet) | Quality Assurance (QA) Manager |
| Bünyamin İbrahim Kalaycı | Web Frontend Developer | Project Manager (GitHub Projects) |
| Egemen Çevik | Mobile App Developer | UI/UX Coordinator |


Backend setup and the sign-up/login API contract are documented in
[AuthBackend.md](docs/AuthBackend.md).


From `backend/`, install dependencies, configure the local PostgreSQL connection, start PostgreSQL, generate the client, and apply migrations:

```bash
cd backend
npm install
cp .env.example .env
sudo docker compose up -d
npm run db:generate
npm run db:migrate
```

Do not use `prisma db push`: migrations also maintain this project’s raw-SQL constraints, indexes, triggers, views, and lookup data.

Generate the deterministic mock dataset after migrations with:

```bash
npm run db:seed:mock
```

This runs `backend/prisma/seed-mock.ts`, is safe to re-run, and refuses to run in production.

From `frontend/`, install dependencies and start the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to `http://localhost:3000`. Run frontend tests and production build checks with `npm test` and `npm run build`.

## Development and CI

- Work on feature branches. Do not commit directly
  to main.
- Open pull requests targeting main.
- Every feature must include relevant automated tests.

### Database changes

- Coordinate shared schema changes with Alperen.
- Every database structure change requires a Prisma
  migration.
- Commit schema.prisma and migration files together.
- Never use prisma db push as a replacement for
  committed migrations.

