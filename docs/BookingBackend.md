# Booking backend — WBS-7.1

Implemented: book a seat, list my bookings, cancel a booking. Seat counts stay
correct when several people book the same trip at the same moment.

Not in this part: payment and hold (WBS-10.1), refunds (WBS-11.1), booking
screens (WBS-7.2) and the optional waitlist (WBS-8.1).

All endpoints need a logged-in, verified user (`Authorization: Bearer <token>`,
see [AuthBackend.md](AuthBackend.md)). Errors use the same shape as the auth
endpoints: `{ "error": { "code": "...", "message": "..." } }`.

## Endpoints

| Method and path | What it does | Success |
|---|---|---|
| `POST /api/bookings` with body `{ "tripId": "<uuid>" }` | Books one seat on the trip for the caller | `201 { booking }` |
| `GET /api/bookings` | Lists the caller's own bookings, newest first | `200 { bookings: [...] }` |
| `POST /api/bookings/:bookingId/cancel` | Cancels the caller's booking and frees the seat | `200 { booking }` |

A booking in a response looks like this:

```json
{
  "id": "…",
  "status": "PENDING_PAYMENT",
  "priceMinor": 40000,
  "paymentStatus": null,
  "reservationExpiresAt": "2026-11-12T18:15:00.000Z",
  "cancelledAt": null,
  "createdAt": "2026-11-12T18:00:00.000Z",
  "trip": {
    "id": "…",
    "departureAt": "2026-11-14T15:00:00.000Z",
    "status": "PUBLISHED",
    "originCity": { "code": 34, "name": "İstanbul" },
    "destinationCity": { "code": 6, "name": "Ankara" },
    "driver": { "id": "…", "displayName": "Ahmet Demir" }
  }
}
```

`priceMinor` is in kuruş (40000 = 400.00 TL) and is copied from the trip when
the booking is made. `paymentStatus` is the status of the booking's payment, or
`null` when there is no payment yet.

## Rules

- A new booking starts as `PENDING_PAYMENT` and holds its seat for 15 minutes.
  The payment step (WBS-10.1) sets it to `CONFIRMED`. If it is not paid in
  time, it becomes `EXPIRED` and the seat is free again.
- `PENDING_PAYMENT`, `CONFIRMED` and `COMPLETED` bookings occupy a seat, the
  same rule as the `trip_availability` view.
- Only `PENDING_PAYMENT` and `CONFIRMED` bookings can be cancelled, and only
  before the trip starts.
- A passenger can have one live booking per trip and cannot book their own trip.

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `tripId` or `bookingId` is not a UUID |
| 401 / 403 | see AuthBackend.md | Not logged in, not verified or suspended |
| 404 | `TRIP_NOT_FOUND` | No trip with this ID |
| 404 | `BOOKING_NOT_FOUND` | No such booking, or it belongs to another user |
| 409 | `TRIP_NOT_BOOKABLE` | Trip is cancelled, completed or already started |
| 409 | `OWN_TRIP` | The caller is the driver of the trip |
| 409 | `ALREADY_BOOKED` | The caller already has a live booking on this trip |
| 409 | `TRIP_FULL` | No free seat |
| 409 | `BOOKING_NOT_CANCELLABLE` | Booking is already cancelled, expired or completed |
| 409 | `TRIP_ALREADY_STARTED` | Cancelling after the departure time |

## For payment and refund work (WBS-10.1, WBS-11.1)

`createBooking` and `cancelBooking` in `src/bookings/service.ts` lock the trip
row (`SELECT … FOR UPDATE`) before they count or change seats. Code that
confirms, expires or cancels bookings should take the same lock. The refund of
a `CONFIRMED` booking belongs in `cancelBooking`, at the `TODO(WBS-11.1)` line.
