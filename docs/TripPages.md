# Trip pages — WBS-5.2

Implements the driver trip posting and management pages under `/yolculuklar`:

- `/yolculuklar/benim` — Lists the signed-in driver's own trips (`GET /api/trips/mine`), showing route, departure time (`Europe/Istanbul`), seat availability, price per seat in TL, status (`Yayında`, `İptal edildi`, `Tamamlandı`), optional description/contact details, and edit/cancel controls for published trips.
- `/yolculuklar/yeni` — Publishes a new trip (`POST /api/trips`) after loading Turkish provinces from `GET /api/cities`, checking that origin and destination differ and at least one city is İstanbul (`34`).
- `/yolculuklar/:tripId/duzenle` — Loads trip details (`GET /api/trips/:tripId`), verifies the logged-in student is the driver, and sends only changed frozen fields (`originCityCode`, `destinationCityCode`, `departureAt`, `priceMinor`) alongside `seatCapacity`, `description`, and `contactDetails` to `PATCH /api/trips/:tripId`.
- Trip cancellation requires explicit two-step confirmation before calling `POST /api/trips/:tripId/cancel`.

## Verification

Run from `frontend/`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Interaction tests in `frontend/tests/trips-posting.test.tsx` mock `fetch` at the HTTP boundary and cover publishing, İstanbul/same-city route validation, editing with escaped rendering, frozen-field preservation, non-driver edit rejection, confirmed cancellation, and API error retry.
