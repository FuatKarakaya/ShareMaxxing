# Speed and load checks — WBS-28.3

Two checks are run against the live site and their results go into the
Software Test Report (WBS-30.4):

| Check | Requirement | Passes when |
|---|---|---|
| Load test | NFR-04: about 100 students use the site at the same time | The run below ends with `Result: PASSED` |
| Speed check | NFR-03: pages load within 5 seconds on a phone | Each main page shows its main content within 5 s in Lighthouse |

## Load test

`backend/scripts/load-test.ts` starts 100 virtual users. Each one repeats this
five times, with a short pause between the requests: search trips, open a
trip, book a seat, open "my bookings", cancel the booking, open the forum
list, search the forum and open a question.

The test passes when:

- fewer than 1% of the requests fail;
- in every step, 95% of the requests are answered within 5 seconds;
- no trip ever has more booked seats than its capacity;
- no seat is still booked at the end.

Ten users share the four seats of one trip, so some booking attempts get the
answer "trip is full". That is expected and is counted separately.

### Run it on the live site

From `backend/`:

```sh
# 1. Create the load test accounts, trips and forum questions in the live database.
DATABASE_URL='<Neon connection string>' LOADTEST_PASSWORD='<a new throwaway password>' npm run loadtest:seed

# 2. Run the test.
LOADTEST_PASSWORD='<the same password>' LOADTEST_API_URL='https://sharemaxxing-api.onrender.com' npm run loadtest

# 3. Remove the accounts and their data again.
DATABASE_URL='<Neon connection string>' npm run loadtest:clean
```

On PowerShell set each variable first with `$env:NAME = 'value'`.

- The data belongs to accounts whose e-mail starts with `loadtest-`. Cleaning
  removes only these accounts and what they created.
- Always clean after the test. Until then the accounts can log in with the
  password you chose.
- One run logs in 11 times. Login allows 30 attempts in 15 minutes from one
  address, so run the test at most twice in 15 minutes.
- The script waits until the API is awake before it starts to measure.

### Run it locally

Start the API with `npm run dev`, then run the three commands without
`DATABASE_URL` and `LOADTEST_API_URL`. They use `backend/.env` and
`http://localhost:3000`.

A local run on 17.11.2026 sent 3874 requests in 28 seconds with no failed
request; the slowest step answered 95% of its requests within 20 ms. This
only shows that the script works. The result that counts is the one from the
live site.

`backend/tests/load-test.test.ts` runs a small version of the test in CI, so
the script keeps working when the endpoints change.

## Speed check

Lighthouse imitates a mid-range phone on a slow mobile connection. Run it for
these pages of the live website: `/`, `/yolculuklar`, `/barinma`, `/forum`.

Either open <https://pagespeed.web.dev>, enter the page address and look at the
**Mobile** result, or in Chrome open DevTools > **Lighthouse**, choose
**Mobile** and **Performance**, and click **Analyze page load**.

A page passes when **Largest Contentful Paint** is under 5 seconds.

Lighthouse opens each page without logging in, so it measures how fast the
page frame and the sign-in form appear. How fast search results arrive is
measured by the "Search trips" step of the load test.

## Results on the live site

Not run yet: the live site does not exist yet (WBS-29.1).
