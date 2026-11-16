# Booking screens — WBS-7.2

Adds the passenger side of booking under `/yolculuklar`. The API is described
in [BookingBackend.md](BookingBackend.md).

- `/yolculuklar/:tripId` — the trip detail page shows a `Rezervasyon yap`
  button to passengers when the trip is published and has a free seat. It
  calls `POST /api/bookings` and then opens "Rezervasyonlarım". The driver, a
  full trip and a cancelled or completed trip get no button. If the API
  rejects the booking, its message is shown on the page.
- `/yolculuklar/rezervasyonlarim` — "Rezervasyonlarım" lists the user's own
  bookings (`GET /api/bookings`), newest first, with route, driver, departure
  time, price, booking status and payment status. An unpaid booking shows
  until when the seat is held.
- A booking that is waiting for payment or confirmed has a
  `Rezervasyonu iptal et` button. It asks for confirmation and then calls
  `POST /api/bookings/:bookingId/cancel`.

Not in this part: the payment page and payment result screens (WBS-10.3) and
the optional waitlist button (WBS-8.2). Until the payment step exists, a new
booking stays in "Ödeme bekleniyor" and expires after 15 minutes.

## Verification

Run from `frontend/`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`frontend/tests/bookings.test.tsx` mocks `fetch` and covers booking from the
trip page, a rejected booking, the cases without a booking button, the list
with its statuses, confirmed cancellation, a rejected cancellation and the
empty list.
