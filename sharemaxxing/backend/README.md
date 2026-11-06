# ShareMaxxing backend

## Prisma quick start

Prerequisites: Node.js, npm, Docker, and Docker Compose.

```bash
npm install
cp .env.example .env
sudo docker compose up -d
npm run db:generate
npm run db:migrate
```

`db:migrate` applies the committed migrations and their lookup data to the local PostgreSQL database. Do not use `prisma db push`; this project has raw-SQL constraints, indexes, triggers, and views that migrations maintain.

Useful commands:

```bash
npm run db:deploy       # apply committed migrations (deployment/CI)
npm run db:reset        # recreate the local database, then run the normal seed
npm run db:seed         # add the small demo seed
npm run db:seed:mock    # add the larger deterministic mock dataset
```

## Mock seed

`prisma/seed-mock.ts` is the mock-data generator. After migrations have run, generate its data with:

```bash
npm run db:seed:mock
```

It creates deterministic development rows (including `mock01@itu.edu.tr` through `mock10@itu.edu.tr`) and can be safely re-run. It refuses to run when `NODE_ENV=production`.
