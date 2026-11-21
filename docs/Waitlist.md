# Waitlist backend — WBS-8.1 *(optional)*

A passenger can join the waitlist of a full trip (FR-16, UC-08). When a seat
becomes free, the first person in line gets it for 6 hours, or until departure
if that is sooner. If they do not book in that time, the seat goes to the next
person.

All endpoints need a logged-in, verified user. Errors use the usual shape
`{ "error": { "code": "...", "message": "..." } }`.

## Endpoints

| Method and path | What it does | Success |
|---|---|---|
| `POST /api/waitlist` with `{ "tripId": "<uuid>" }` | Joins the waitlist of a full trip | `201 { entry }`, or `200 { entry }` if already on it |
| `GET /api/waitlist` | The caller's live entries, newest first | `200 { entries: [...] }` |
| `DELETE /api/waitlist/:tripId` | Leaves the waitlist of the trip | `204` |

An entry:

```json
{
  "id": "…",
  "status": "WAITING",
  "position": 2,
  "offerExpiresAt": null,
  "createdAt": "2026-11-17T09:00:00.000Z",
  "trip": { "id": "…", "departureAt": "…", "originCity": { "code": 34, "name": "İstanbul" }, "destinationCity": { "code": 6, "name": "Ankara" } }
}
```

- `WAITING`: in line; `position` 1 is next.
- `OFFERED`: a seat is held for the caller until `offerExpiresAt`; `position` is `null`. The caller books it with the normal `POST /api/bookings`.

## Rules

- Only a published trip that has not left yet, has no free seat and is not the
  caller's own can be joined. A caller who already has a booking on the trip
  cannot join.
- When a seat is freed (a booking is cancelled or an unpaid reservation runs
  out), it is offered to the first `WAITING` person and they get a `BOOKING`
  notification with a link to the trip.
- While a seat is offered, `POST /api/bookings` answers `TRIP_FULL` to
  everyone else.
- Booking the trip ends the entry (`BOOKED`). Leaving ends it (`LEFT`); a held
  seat then goes to the next person. An unused offer, or a trip that is
  cancelled or has left, ends it (`EXPIRED`).
- Trips without a waitlist work exactly as before.

Everything runs under the same trip row lock as booking, so two people joining
at the same moment get different places, and a seat cannot be offered twice.

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `tripId` is not a UUID |
| 404 | `TRIP_NOT_FOUND` | No trip with this ID |
| 404 | `WAITLIST_ENTRY_NOT_FOUND` | Leaving a list the caller is not on |
| 409 | `TRIP_NOT_BOOKABLE` | Trip is cancelled, completed or already started |
| 409 | `OWN_TRIP` | The caller is the driver |
| 409 | `ALREADY_BOOKED` | The caller already has a booking on the trip |
| 409 | `SEATS_AVAILABLE` | The trip has a free seat: book it instead |

## Database

Table `waitlist_entries` (migration `20261117000000_waitlist`): trip, user,
status, the offer deadline and timestamps. A user has at most one live
(`WAITING` or `OFFERED`) entry per trip; an `OFFERED` entry always has a
deadline.

## Limits

- Offers are checked when someone books, cancels, joins, leaves or opens their
  waitlist. There is no timer, so an unpaid reservation that runs out frees
  its seat for the waitlist only at the next of these actions on that trip.
- Trip search and the trip page still count a held seat as free, so a trip
  can look like it has a free seat while booking it answers `TRIP_FULL`.
- The notification is written straight into the `notifications` table. Once
  the notification service (#52) is merged, it should use
  `createNotification(..., tx)`.

## Screens — WBS-8.2

- Trip detail page (`/yolculuklar/:tripId`): on a full trip a passenger sees
  `Bekleme listesine katıl`. On the list they see their place and
  `Bekleme listesinden çık`. When a seat is held for them they see until when,
  the `Rezervasyon yap` button and the leave button. The driver sees none of
  these.
- "Rezervasyonlarım" (`/yolculuklar/rezervasyonlarim`) has a
  "Bekleme listelerim" section with each list, the place in line or the offer
  deadline.

The code is in `frontend/src/features/waitlist/WaitlistScreens.tsx`, the tests
in `frontend/tests/waitlist.test.tsx`.
