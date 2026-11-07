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

