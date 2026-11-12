# Trip backend — WBS-5.1

Implemented: list Turkish provinces (`GET /api/cities`), publish a new intercity
trip (`POST /api/trips`), list the caller's own posted trips (`GET /api/trips/mine`),
edit a trip (`PATCH /api/trips/:tripId`), and cancel a trip (`POST /api/trips/:tripId/cancel`).

Not in this part: trip search and trip detail (`WBS-6.1`), trip posting pages (`WBS-5.2`),
refunds on cancellation (`WBS-11.1`), and notifications (`WBS-22.2`).

All endpoints require a logged-in, verified, `ACTIVE` user (`Authorization: Bearer <token>`,
see [AuthBackend.md](AuthBackend.md)). Errors use `{ "error": { "code": "...", "message": "..." } }`.

## Endpoints

| Method and path | What it does | Success |
|---|---|---|
| `GET /api/cities` | Lists all 81 Turkish provinces ordered by plate code (`34` = İstanbul) | `200 { cities: [{ code, name }, ...] }` |
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

### Trip response shape

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

`priceMinor` is in kuruş (`40000` = `400.00 TL`). `description` and `contactDetails`
are optional (`null` when omitted or blank).

## Rules

- **Route validation (`FR-07`, `FR-08`)**: `originCityCode` and `destinationCityCode`
  must be distinct valid plate codes (`1..81`), and at least one of them must be
  İstanbul (`34`).
- **Future departure**: `departureAt` must be in the future when creating, editing,
  or cancelling a trip.
- **Seat capacity & price**: `seatCapacity` (`1..50`) counts passenger seats excluding
  the driver. `priceMinor` is a positive integer in kuruş.
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
| 400 | `VALIDATION_ERROR` | Invalid city codes, non-İstanbul route, same origin/destination, past departure, invalid capacity/price, unknown fields, or invalid UUID |
| 401 / 403 | see AuthBackend.md | Not logged in, unverified email, or suspended user |
| 403 | `FORBIDDEN` | Caller is not the driver of the trip |
| 404 | `TRIP_NOT_FOUND` | No trip with this ID |
| 409 | `TRIP_NOT_EDITABLE` | Trip is cancelled, completed, or already departed |
| 409 | `TRIP_FIELDS_FROZEN` | Editing route, departure time, or price after a live booking or funding request exists |
| 409 | `CAPACITY_BELOW_OCCUPIED` | Lowering `seatCapacity` below currently occupied seats |
| 409 | `TRIP_NOT_CANCELLABLE` | Trip is already cancelled or completed |
| 409 | `TRIP_ALREADY_STARTED` | Cancelling a trip at or after its departure time |
