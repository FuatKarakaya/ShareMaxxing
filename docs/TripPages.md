# Trip pages — WBS-5.2 and WBS-6.2

Implements the trip posting, search, and detail pages under `/yolculuklar`:

- `/yolculuklar` (`WBS-6.2`) — Passenger trip search form (`GET /api/trips?originCityCode=...&destinationCityCode=...[&date=YYYY-MM-DD]`) with client-side İstanbul / same-city checks, URL query persistence, free-seat trips listed first, full trips marked clearly as `Dolu`, and an explicit empty state (`Seçilen kriterlere uygun yolculuk bulunamadı.`).
- `/yolculuklar/:tripId` (`WBS-6.2`) — Trip detail view (`GET /api/trips/:tripId`) displaying route, departure time, price per seat in TL, seat availability, `Dolu` unbookable state (`Bu yolculuk dolu; koltuk rezervasyonu yapılamaz.`), optional description and verified-student contact details (with fallback text when absent), driver bio, two-way revealed rating summary + reviews, and driver edit/cancel controls. Booking action buttons connect here in `WBS-7.2`.
- `/yolculuklar/benim` (`WBS-5.2`) — Lists the signed-in driver's own trips (`GET /api/trips/mine`) with status (`Yayında`, `İptal edildi`, `Tamamlandı`), seat availability, price per seat in TL, optional description/contact details, and edit/confirmed cancel controls for published trips.
- `/yolculuklar/yeni` (`WBS-5.2`) — Publishes a new trip (`POST /api/trips`) after loading Turkish provinces from `GET /api/cities`, checking that origin and destination differ and at least one city is İstanbul (`34`).
- `/yolculuklar/:tripId/duzenle` (`WBS-5.2`) — Loads trip details (`GET /api/trips/:tripId`), verifies the logged-in student is the driver, and sends only changed frozen fields (`originCityCode`, `destinationCityCode`, `departureAt`, `priceMinor`) alongside `seatCapacity`, `description`, and `contactDetails` to `PATCH /api/trips/:tripId`.
- Trip cancellation requires explicit two-step confirmation before calling `POST /api/trips/:tripId/cancel`.

## Verification

Run from `frontend/`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Interaction tests in `frontend/tests/trips-posting.test.tsx` and `frontend/tests/trips-search.test.tsx` mock `fetch` at the HTTP boundary and cover posting, route validation, editing with escaped rendering, frozen-field preservation, non-driver edit rejection, confirmed cancellation, trip search ordering/empty state, trip detail contact & driver ratings display, full-trip unbookable state, and API error retry.
