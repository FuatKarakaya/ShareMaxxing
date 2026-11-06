# İTÜ ShareMaxxing

A web and mobile platform where verified İTÜ students share intercity rides to and from İstanbul, fund seats for students in need, find housing and roommates, and ask questions in a student forum.

## Team

| Member | Development Role | Management Role |
| :---- | :---- | :---- |
| Mehmet Fuat Karakaya | Backend Developer (Rides, Search, Booking) | Product Owner |
| Ege Demir | DevOps, Authentication, Forum/Housing and AI Integration | Configuration Manager |
| Alperen Akbaş | Backend Developer (Payments, Askıda Bilet) | Quality Assurance (QA) Manager |
| Bünyamin Kalaycı | Web Frontend Developer | Project Manager (GitHub Projects) |
| Egemen Çevik | Mobile App Developer | UI/UX Coordinator |

## Local Prisma setup

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

## Repository structure

- `backend/` — TypeScript backend and its Prisma/PostgreSQL setup.
- `backend/prisma/` — schema, migrations, and demo/mock seed scripts.
- `docs/` — project documents.
- `tests/` — shared tests.
