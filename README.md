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

## Frontend development (WBS-4.1 / WBS-4.2)

The frontend uses the WBS-28.1 React 18, TypeScript, Vite, Tailwind CSS 3 and React Router 6 scaffold. Backend and frontend remain independent npm packages with separate lockfiles. Use Node.js 22.12+ (CI uses Node 22).

```sh
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. On Windows PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

The Turkish shared layout includes responsive navigation, a skip link, page frame, footer and reusable form, card, button and alert components. `/` is the home page. `/yolculuklar`, `/askida-bilet`, `/barinma` and `/forum` are labelled placeholders for later work packages; unknown URLs show the shared 404 page. Tests live in `frontend/tests/` and use Vitest and React Testing Library. See [frontend conventions](frontend/README.md) for extension points.

The shell runs without a database or environment file. Future requests use `frontend/src/lib/api.ts`; Vite proxies `/api` and `/health` to the Express backend at `http://localhost:3000`. Start that backend separately using [the authentication guide](docs/AuthBackend.md). Prisma, migrations and `DATABASE_URL` belong only in `backend/`; never put secrets in `VITE_*` variables. The backend ignore rules retain `.env.example` while excluding real `.env` files.

For a phone on the same network, use `npm run dev -- --host 0.0.0.0`. A production static host must rewrite application routes to `index.html` and route `/api` to the backend, or supply a public `VITE_API_BASE_URL` with appropriate backend CORS support.
