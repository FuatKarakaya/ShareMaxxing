# Trip and search backend — WBS-5.1 and WBS-6.1

Implemented: list Turkish provinces (`GET /api/cities`), publish a new intercity
trip (`POST /api/trips`), list the caller's own posted trips (`GET /api/trips/mine`),
search published future trips (`GET /api/trips`), view trip details (`GET /api/trips/:tripId`),
edit a trip (`PATCH /api/trips/:tripId`), and cancel a trip (`POST /api/trips/:tripId/cancel`).

Not in this part: trip posting pages (`WBS-5.2`), search and trip detail pages (`WBS-6.2`),
refunds on cancellation (`WBS-11.1`), and notifications (`WBS-22.2`).

All endpoints require a logged-in, verified, `ACTIVE` user (`Authorization: Bearer <token>`,
see [AuthBackend.md](AuthBackend.md)). Errors use `{ "error": { "code": "...", "message": "..." } }`.

## Endpoints

| Method and path | What it does | Success |
|---|---|---|
| `GET /api/cities` | Lists all 81 Turkish provinces ordered by plate code (`34` = İstanbul) | `200 { cities: [{ code, name }, ...] }` |
| `GET /api/trips?originCityCode=34&destinationCityCode=6[&date=YYYY-MM-DD]` | Searches published future trips between two cities; free-seat trips first, full trips after them | `200 { trips: [...] }` |
| `GET /api/trips/:tripId` | Returns trip details, seat availability, contact details, and the driver's revealed rating summary | `200 { trip }` |
| `POST /api/trips` | Publishes a new trip for the caller as driver | `201 { trip }` |
| `GET /api/trips/mine` | Lists the caller's own trips, newest departure first | `200 { trips: [...] }` |
| `PATCH /api/trips/:tripId` | Updates the driver's published future trip | `200 { trip }` |
| `POST /api/trips/:tripId/cancel` | Cancels the driver's published future trip and cancels active bookings / requests | `200 { trip }` |

### `POST /api/trips` request body

```json
{
  "originCityCode": 34,
  "destinationCityCode": 6,
  "departureAt": "2026-11-20T15:00:00.000Z",
  "seatCapacity": 3,
  "priceMinor": 40000,
  "description": "Maslak kampüsten hareket, bagaj yeri var.",
  "contactDetails": "0555 000 00 00"
}
```

### Trip response shape (`POST /api/trips`, `GET /api/trips`, `GET /api/trips/mine`)

```json
{
  "id": "…",
  "status": "PUBLISHED",
  "departureAt": "2026-11-20T15:00:00.000Z",
  "seatCapacity": 3,
  "occupiedSeats": 0,
  "freeSeats": 3,
  "isFull": false,
  "priceMinor": 40000,
  "description": "Maslak kampüsten hareket, bagaj yeri var.",
  "contactDetails": "0555 000 00 00",
  "driverCompletedAt": null,
  "cancelledAt": null,
  "createdAt": "2026-11-12T18:00:00.000Z",
  "updatedAt": "2026-11-12T18:00:00.000Z",
  "originCity": { "code": 34, "name": "İstanbul" },
  "destinationCity": { "code": 6, "name": "Ankara" },
  "driver": { "id": "…", "displayName": "Mert Yılmaz" }
}
```

### Trip detail response (`GET /api/trips/:tripId`)

Includes all fields above plus the driver's public bio and two-way revealed rating summary (`FR-12`, `FR-28`):

```json
{
  "trip": {
    "id": "…",
    "status": "PUBLISHED",
    "freeSeats": 2,
    "isFull": false,
    "contactDetails": "0555 000 00 00",
    "driver": {
      "id": "…",
      "displayName": "Mert Yılmaz",
      "bio": "4. sınıf Bilgisayar Mühendisliği",
      "ratingSummary": {
        "averageScore": 4.5,
        "ratingCount": 2
      },
      "ratings": [
        {
          "score": 5,
          "review": "Çok dakik ve güvenli bir yolculuktu.",
          "createdAt": "2026-11-10T18:00:00.000Z"
        }
      ]
    }
  }
}
```

`priceMinor` is in kuruş (`40000` = `400.00 TL`). `description` and `contactDetails`
are optional (`null` when omitted or blank).

## Rules

- **Route validation (`FR-07`, `FR-08`)**: `originCityCode` and `destinationCityCode`
  must be distinct valid plate codes (`1..81`), and at least one of them must be
  İstanbul (`34`) when publishing or editing a trip.
- **Search ordering (`FR-11`, `databaseplan.md` §4.10)**: `GET /api/trips` returns
  only `PUBLISHED` trips with `departureAt > now()` matching `originCityCode` and
  `destinationCityCode` (and optional `date=YYYY-MM-DD`). Trips with `freeSeats > 0`
  (`isFull: false`) are listed first, followed by full trips (`freeSeats: 0`,
  `isFull: true`), ordered within each group by `departureAt ASC, id ASC`.
- **Stale reservation expiry**: Search and detail queries expire stale `PENDING_PAYMENT`
  bookings (`reservationExpiresAt <= now()`) before calculating `freeSeats` and `isFull`.
- **Driver ratings (`FR-12`, `FR-28`)**: `GET /api/trips/:tripId` reads from the
  `revealed_ride_ratings` view (`direction = 'PASSENGER_TO_DRIVER'`), so one-sided
  ratings stay hidden until both driver and passenger have submitted their ratings.
- **Edit freeze rules (`databaseplan.md` §3)**: `updateTrip` locks the trip row
  (`SELECT … FOR UPDATE`) and expires stale `PENDING_PAYMENT` bookings and stale
  `OPEN` sponsorship requests first. Once a trip has any live booking
  (`PENDING_PAYMENT`, `CONFIRMED`, `COMPLETED`) or live sponsorship request
  (`OPEN`, `FUNDING`, `FUNDED`), its `originCityCode`, `destinationCityCode`,
  `departureAt`, and `priceMinor` are frozen (`409 TRIP_FIELDS_FROZEN`).
  `description` and `contactDetails` can still be updated, and `seatCapacity` can
  change as long as it remains `>= occupiedSeats` (`409 CAPACITY_BELOW_OCCUPIED`).
- **Driver cancellation (`FR-09`)**: `cancelTrip` locks the trip row, marks the trip
  `CANCELLED`, and cancels all `PENDING_PAYMENT` and `CONFIRMED` bookings as well
  as `OPEN` and `FUNDING` askıda bilet requests on that trip.

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid city codes, non-İstanbul route, same origin/destination, past departure, invalid date filter, invalid capacity/price, unknown fields, or invalid UUID |
| 401 / 403 | see AuthBackend.md | Not logged in, unverified email, or suspended user |
| 403 | `FORBIDDEN` | Caller is not the driver of the trip |
| 404 | `TRIP_NOT_FOUND` | No trip with this ID |
| 409 | `TRIP_NOT_EDITABLE` | Trip is cancelled, completed, or already departed |
| 409 | `TRIP_FIELDS_FROZEN` | Editing route, departure time, or price after a live booking or funding request exists |
| 409 | `CAPACITY_BELOW_OCCUPIED` | Lowering `seatCapacity` below currently occupied seats |
| 409 | `TRIP_NOT_CANCELLABLE` | Trip is already cancelled or completed |
| 409 | `TRIP_ALREADY_STARTED` | Cancelling a trip at or after its departure time |
