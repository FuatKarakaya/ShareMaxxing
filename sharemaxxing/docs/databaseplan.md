# İTÜ ShareMaxxing: Database Plan v1.3

BLG411E Software Engineering / The Goys | PostgreSQL + Prisma | Revised from v1.2 (30 Oct 2026)

A shared relational database for verified student accounts, intercity rides, anonymous seat funding, housing and the student forum. This document gives the tables, SQL definitions, relationships and the transaction rules the backend must enforce.

Status: an implementation proposal derived from the project plan (v1.1). SQL constraints cover row-level integrity; the service transactions in Section 5 are also required. This is a database plan, not a deployed database.

## 1. Table map (17 tables)

| Table | One row represents | Requirements |
|---|---|---|
| users | One account and profile; role USER, MODERATOR or ADMIN | T-01 to T-03 |
| email_verification_codes | One pending sign-up code per user | T-01 |
| driver_submerchants | One driver's iyzico sandbox payee key | T-10, T-11 |
| cities | One Turkish province, using its plate code | T-05, T-06 |
| istanbul_districts | One İstanbul district for housing | T-18 |
| trips | One driver offer: two cities, time, capacity, price | T-05, T-06, T-09 |
| bookings | One passenger reserving one seat on one trip | T-07, T-09, T-15 |
| sponsorship_requests | One private seat-funding request | T-12, T-13 |
| payments | One provider payment attempt; payer can be a donor | T-10, T-11, T-13 |
| payment_ledger | One immutable PAYMENT / HOLD / RELEASE / REFUND event | T-14 |
| ride_ratings | One direction of a driver/passenger rating pair | T-16 |
| no_show_reports | One no-show record for a booking | T-15 |
| housing_listings | One room offer or room-needed advert | T-18 |
| forum_categories | One seeded category | T-19 |
| forum_posts | One question, or one answer linked to a question | T-19, T-21 |
| moderation_cases | One user report or AI flag with one target | T-17, T-24, T-25 |
| notifications | One in-app event for one recipient | T-22 |

Derive ride history, rating averages, free seats, dashboards and donor balances from bookings, ratings, payments and the ledger. No session table is needed for JWT.

## 2. Relationships

| Parent | Child / cardinality | Meaning |
|---|---|---|
| users | trips, bookings, payments: 1 to many | A user can drive, ride and pay |
| users | driver_submerchants: 1 to 0..1 | Only paid-trip drivers need a payee key |
| users | email_verification_codes: 1 to 0..1 | At most one pending code |
| trips | bookings, sponsorship_requests: 1 to many | |
| sponsorship_requests | bookings: 1 to 0..1 | An open request has no seat; funding creates its booking |
| bookings | payments: 1 to many (one non-failed) | A new attempt is allowed only after FAILED |
| payments | payment_ledger: 1 to 0..3 | PAYMENT, HOLD, then RELEASE or REFUND |
| bookings | ride_ratings: 1 to 0..2 | One per direction |
| forum_posts | forum_posts: 1 question to many answers | `parent_post_id`; deleting the question deletes answers |
| istanbul_districts | housing_listings: 1 to many | |
| users, trips, housing_listings, forum_posts | moderation_cases: 1 to many | An open case targets exactly one of them |
| users | notifications: 1 to many | Only the recipient may read |

## 3. Design decisions

| Decision | Behavior |
|---|---|
| One booking = one seat | No multi-seat purchases in this schema |
| Completion per pair | Driver confirms the trip once; each passenger confirms their own booking; that booking's payment is released after both |
| Auto end | If a confirmation is missing 48 hours after departure, a job sets the missing timestamps (WBS-9.1) |
| Seat reservations expire | PENDING_PAYMENT holds a seat for 15 minutes (configurable); a job expires unpaid holds. An OPEN funding request holds no seat |
| Cancellation and refunds | Allowed before departure and before release; refund goes to the original payer, including a donor |
| No-show | A record only (T-15). It does not change booking or payment state and does not punish anyone by itself |
| Funding-request privacy | The pool exposes only request UUID, amount (TL), request date and OPEN status. Anonymity is an API access policy |
| Trip edits | Route, departure and price are frozen after the first live request or booking. Contact/description can change. Capacity can change only if it stays at or above occupied seats |
| Roles | USER, MODERATOR, ADMIN. Moderators and admins review cases. Only admins change roles, reactivate users, manage users, and see the ledger and askıda bilet overview |
| Moderation actions | **Hide** content (`hidden_at`), **warn** a user (notification), **suspend** a user (`status = SUSPENDED`), or dismiss the case |
| Deletion | Authors may hard-delete their own forum posts and listings (a deleted question takes its answers). Staff hide instead of delete. Banned/suspended users stay as rows. Never cascade deletion of payments, bookings or ledger rows |

**Conventions.** Surrogate keys are UUIDs from `gen_random_uuid()`. Natural keys stay natural (cities use plate codes, İstanbul = 34; `ride_ratings` uses `(booking_id, direction)`; `email_verification_codes` and `driver_submerchants` use `user_id`). Money is integer kuruş in TL (25000 = 250.00 TL), never floating point, and no table has a currency column. Timestamps are `timestamptz`, displayed in Europe/İstanbul. SQL is PostgreSQL 14+; pin the PostgreSQL and Prisma versions. Unspecified FK delete behaviour is NO ACTION, with exceptions: `ON DELETE CASCADE` from a question to its answers, and `ON DELETE SET NULL` for case references to a deleted post or listing. Mutable tables use `updated_at` (Prisma `@updatedAt` or explicit in raw SQL).

## 4. Core SQL (execute in this order)

### 4.1 Accounts and location

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name varchar(100) NOT NULL,
  bio varchar(500),
  role text NOT NULL DEFAULT 'USER'
    CHECK (role IN ('USER','MODERATOR','ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','SUSPENDED')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email)),
  CHECK (email ~ '^[a-z0-9._%+-]+@itu[.]edu[.]tr$'),
  CHECK (length(trim(display_name)) > 0)
);

CREATE TABLE driver_submerchants (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  iyzico_submerchant_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_codes (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  code_hash text NOT NULL,
  failed_attempts smallint NOT NULL DEFAULT 0
    CHECK (failed_attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL
);

CREATE TABLE cities (
  code smallint PRIMARY KEY CHECK (code BETWEEN 1 AND 81),
  name varchar(80) NOT NULL UNIQUE
);

CREATE TABLE istanbul_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE
);
```

Service rules:
- Only verified, ACTIVE users may use the application. A SUSPENDED user is refused on every request (the auth middleware reads `users.status` from the database, even with a valid JWT).
- Hash passwords (for example Argon2id) and HMAC the short verification codes with a server-held secret.
- Sign-up and resend upsert the user's single code row: new `code_hash`, `failed_attempts = 0`, `expires_at = now() + 10 minutes`.
- Lock the row (`SELECT ... FOR UPDATE`) while checking. Reject without comparing once `failed_attempts` is 5; each wrong code adds 1. On success delete the row and set `users.email_verified_at`.
- Delete expired rows with a periodic job; rate-limit by email/IP.
- Public profile endpoints never return email or password fields.

### 4.2 Trips and bookings

```sql
CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES users(id),
  origin_city_code smallint NOT NULL REFERENCES cities(code),
  destination_city_code smallint NOT NULL REFERENCES cities(code),
  departure_at timestamptz NOT NULL,
  seat_capacity smallint NOT NULL CHECK (seat_capacity > 0),
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  description text,
  contact_details varchar(250),
  status text NOT NULL DEFAULT 'PUBLISHED'
    CHECK (status IN ('PUBLISHED','COMPLETED','CANCELLED')),
  driver_completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (origin_city_code <> destination_city_code),
  CHECK (origin_city_code = 34 OR destination_city_code = 34)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id),
  passenger_id uuid NOT NULL REFERENCES users(id),
  sponsorship_request_id uuid UNIQUE,   -- FK added after sponsorship_requests
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  status text NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (status IN ('PENDING_PAYMENT','CONFIRMED','COMPLETED',
                      'CANCELLED','EXPIRED')),
  reservation_expires_at timestamptz NOT NULL,
  passenger_completed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reservation_expires_at > created_at),
  CHECK (status <> 'COMPLETED' OR
         (completed_at IS NOT NULL AND passenger_completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX one_active_booking_per_passenger
  ON bookings(trip_id, passenger_id)
  WHERE status IN ('PENDING_PAYMENT','CONFIRMED','COMPLETED');
```

Capacity: `seat_capacity` counts passenger seats, excluding the driver. Occupied = PENDING_PAYMENT, CONFIRMED and COMPLETED bookings, funded ones included. No cached `free_seats` column. Expire stale reservations under a trip-row lock; the same lock protects inserts, cancellations and capacity edits.

Service rules: driver ≠ passenger; both verified and ACTIVE; departure is in the future when booking; price is copied from the trip and is always TL in kuruş. A booking with `sponsorship_request_id` set is a funded seat and is never shown to the driver.

### 4.3 Funding requests and payments

```sql
CREATE TABLE sponsorship_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id),
  recipient_id uuid NOT NULL REFERENCES users(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','FUNDING','FUNDED','CANCELLED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX one_live_funding_request
  ON sponsorship_requests(trip_id, recipient_id)
  WHERE status IN ('OPEN','FUNDING','FUNDED');

ALTER TABLE bookings ADD CONSTRAINT booking_sponsorship_fk
  FOREIGN KEY (sponsorship_request_id) REFERENCES sponsorship_requests(id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  payer_id uuid NOT NULL REFERENCES users(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  provider text NOT NULL DEFAULT 'IYZICO_SANDBOX'
    CHECK (provider = 'IYZICO_SANDBOX'),
  provider_payment_id text UNIQUE,
  provider_transaction_id text UNIQUE,
  provider_refund_id text,
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED','PENDING','HELD','RELEASED',
                      'REFUNDED','FAILED')),
  failure_code text,
  held_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_nonfailed_payment_per_booking
  ON payments(booking_id) WHERE status <> 'FAILED';
```

For an ordinary booking, payer = passenger. For a funded booking, the payment's payer is the donor and the booking references the request. Only a definitively failed attempt allows a new attempt row. An uncertain provider timeout stays PENDING and is reconciled before retrying. Refunded bookings are not reused. Every amount is TL; the iyzico adapter sends the constant currency TRY, so none is stored.

### 4.4 Ledger

```sql
CREATE TABLE payment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  event_type text NOT NULL
    CHECK (event_type IN ('PAYMENT','HOLD','RELEASE','REFUND')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, event_type)
);

-- Full release OR full refund, not both.
CREATE UNIQUE INDEX one_terminal_ledger_event
  ON payment_ledger(payment_id)
  WHERE event_type IN ('RELEASE','REFUND');

CREATE FUNCTION reject_record_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: %', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ledger_is_append_only
  BEFORE UPDATE OR DELETE ON payment_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_record_mutation();
```

| Event | When inserted | Meaning |
|---|---|---|
| PAYMENT | Provider confirms a successful collection | Gross cash collected from the payer |
| HOLD | Same transaction as PAYMENT | The amount is held for the booking |
| RELEASE | Provider confirms release after completion | The held amount becomes payable to the driver |
| REFUND | Provider confirms the full refund | The held amount returns to the payer |

Amounts are positive event magnitudes; never sum all four types as revenue. Gross received = ΣPAYMENT; held = ΣHOLD − ΣRELEASE − ΣREFUND; released = ΣRELEASE; refunded = ΣREFUND. For each paid booking, gross received equals held + released + refunded. This is a lifecycle ledger, not double-entry accounting.

Rules: ledger rows are inserted only after confirmed provider results. Duplicate callbacks must not charge, notify or insert ledger rows twice: the handler locks the payment row and treats an already-processed result as a no-op, with `provider_payment_id` and `UNIQUE (payment_id, event_type)` as backstops. Never store card numbers, CVV, API secrets or raw checkout requests. Keep both the provider payment ID and the item transaction ID (item approval uses `paymentTransactionId`). HELD / RELEASED are application states, not a claim that a SQL row holds money.

### 4.5 Ratings and no-shows

```sql
CREATE TABLE ride_ratings (
  booking_id uuid NOT NULL REFERENCES bookings(id),
  direction text NOT NULL CHECK (direction IN
    ('DRIVER_TO_PASSENGER','PASSENGER_TO_DRIVER')),
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  review varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, direction)
);

CREATE TABLE no_show_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  missing_party text NOT NULL CHECK (missing_party IN ('DRIVER','PASSENGER')),
  details varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, missing_party)
);
```

- Do not store reviewer/subject IDs. For DRIVER_TO_PASSENGER the reviewer is `trips.driver_id` and the subject is `bookings.passenger_id`; reverse for PASSENGER_TO_DRIVER. Derive them with joins.
- Only the right participant can create each direction, only for a COMPLETED booking. Ratings are immutable: the service never updates or deletes them.
- Ratings stay hidden until both exist. 
- No-show: the reporter is the other participant (`missing_party = DRIVER` is reported by the passenger). Allowed after scheduled departure for a CONFIRMED or COMPLETED booking. It is a record only. It does not change booking or payment state.

### 4.6 Housing and forum

```sql
CREATE TABLE housing_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id),
  district_id uuid NOT NULL REFERENCES istanbul_districts(id),
  listing_type text NOT NULL CHECK (listing_type IN ('HAVE_ROOM','NEED_ROOM')),
  title varchar(160) NOT NULL CHECK (length(trim(title)) > 0),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  contact_details varchar(250),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE forum_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  label_tr varchar(80) NOT NULL
);

INSERT INTO forum_categories(code, label_tr) VALUES
  ('COURSE','Dersler'), ('GENERAL','Genel'),
  ('CAFETERIA','Yemekhane'), ('HOUSING','Barınma'),
  ('TRANSPORT','Ulaşım'), ('CAMPUS_LIFE','Kampüs Yaşamı');

CREATE TABLE forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('QUESTION','ANSWER')),
  parent_post_id uuid REFERENCES forum_posts(id) ON DELETE CASCADE,
  category_id uuid REFERENCES forum_categories(id),
  title varchar(180),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_post_id IS DISTINCT FROM id),
  CHECK ((kind = 'QUESTION' AND parent_post_id IS NULL
          AND category_id IS NOT NULL AND title IS NOT NULL
          AND length(trim(title)) > 0)
      OR (kind = 'ANSWER' AND parent_post_id IS NOT NULL
          AND category_id IS NULL AND title IS NULL))
);
```

- Seed all 81 cities (İstanbul = 34) and the current İstanbul district list before enabling posting. Lookup data is migration-owned.
- Contact details are returned only to verified ACTIVE students, and only when the poster filled them in. They are never copied from a private account field.
- A CLOSED listing leaves browsing but stays in the owner's list.
- Hidden content (`hidden_at` set) is omitted from browse, search and detail for ordinary users. The author, moderators and admins can still see it.
- An ANSWER must point to a QUESTION, never another answer; its category is inherited. `kind`, parent and category are immutable except an explicit category edit on a question.

### 4.7 Notifications

```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('BOOKING','CANCELLATION',
    'RIDE_REMINDER','PAYMENT','FUNDING','FORUM_REPLY','MODERATION')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Insert the notification in the same transaction as the business event so it is created once. `payload` holds display-safe text and an internal link (for example a trip, booking or forum post ID where appropriate). It never contains donor or recipient identities or private routes for funding events. Only the recipient may read a notification.

### 4.8 Moderation queue

```sql
CREATE TABLE moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('USER','AI')),
  reporter_id uuid REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  target_trip_id uuid REFERENCES trips(id),
  target_housing_id uuid REFERENCES housing_listings(id) ON DELETE SET NULL,
  target_post_id uuid REFERENCES forum_posts(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  ai_model text,
  ai_score numeric(5,4) CHECK (ai_score BETWEEN 0 AND 1),
  ai_unavailable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SOLVED')),
  reviewed_by uuid REFERENCES users(id),
  resolution text CHECK (resolution IN
    ('DISMISSED','CONTENT_HIDDEN','CONTENT_DELETED',
     'USER_WARNED','USER_SUSPENDED')),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(target_user_id, target_trip_id,
         target_housing_id, target_post_id) <= 1),
  CHECK (status = 'SOLVED' OR num_nonnulls(target_user_id,
         target_trip_id, target_housing_id, target_post_id) = 1),
  CHECK ((source = 'USER' AND reporter_id IS NOT NULL)
      OR (source = 'AI' AND reporter_id IS NULL
          AND (ai_model IS NOT NULL OR ai_unavailable)
          AND (status = 'SOLVED'
               OR num_nonnulls(target_post_id, target_housing_id) = 1))),
  CHECK ((status = 'ACTIVE' AND reviewed_by IS NULL
          AND resolution IS NULL AND resolved_at IS NULL)
      OR (status = 'SOLVED' AND resolution IS NOT NULL
          AND resolved_at IS NOT NULL
          AND (resolution = 'CONTENT_DELETED' OR reviewed_by IS NOT NULL)))
);
```

Lifecycle: a case starts ACTIVE in the queue. A moderator or admin resolves it in one step: dismiss, hide the content, warn the user, or suspend the user. The case becomes SOLVED with the matching `resolution`, an optional `resolution_note` and `resolved_at`. `CONTENT_DELETED` is used only when the author deletes content that has an open case (`reviewed_by` may be empty on that path).

Four nullable target FKs plus the CHECKs make an open case point at exactly one existing object. Deleting a post or listing sets its target to NULL, so SOLVED cases stay as history. Because the CHECK blocks that while a case is open, delete in one transaction: first mark every open case on the content SOLVED with `CONTENT_DELETED` (statement in Section 5), then delete. AI scores are optional hints, not proven probabilities.

### 4.9 Indexes

```sql
CREATE INDEX trips_search_idx ON trips
  (origin_city_code, destination_city_code, departure_at)
  WHERE status = 'PUBLISHED';
CREATE INDEX trips_driver_idx ON trips(driver_id, departure_at);
CREATE INDEX bookings_trip_status_idx ON bookings(trip_id, status);
CREATE INDEX bookings_passenger_idx ON bookings(passenger_id, created_at DESC);
CREATE INDEX booking_expiry_idx ON bookings(reservation_expires_at)
  WHERE status = 'PENDING_PAYMENT';
CREATE INDEX funding_pool_idx ON sponsorship_requests(created_at, id)
  WHERE status = 'OPEN';
CREATE INDEX funding_recipient_idx ON sponsorship_requests(recipient_id);
CREATE INDEX payments_payer_idx ON payments(payer_id, created_at DESC);
CREATE INDEX payments_open_idx ON payments(status)
  WHERE status IN ('PENDING','HELD');
CREATE INDEX housing_browse_idx ON housing_listings
  (district_id, listing_type, created_at DESC)
  WHERE status = 'ACTIVE' AND hidden_at IS NULL;
CREATE INDEX housing_author_idx ON housing_listings(author_id);
CREATE INDEX forum_browse_idx ON forum_posts(category_id, created_at DESC)
  WHERE kind = 'QUESTION' AND hidden_at IS NULL;
CREATE INDEX forum_answers_idx ON forum_posts(parent_post_id, created_at);
CREATE INDEX forum_author_idx ON forum_posts(author_id);
CREATE INDEX forum_keyword_idx ON forum_posts USING gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || body));
CREATE INDEX moderation_queue_idx ON moderation_cases(status, created_at);
CREATE INDEX unread_notifications_idx ON notifications(recipient_id, created_at DESC)
  WHERE read_at IS NULL;
```

Keyword search (bind `$1` as user input):

```sql
SELECT id, parent_post_id, kind, title
FROM forum_posts
WHERE hidden_at IS NULL
  AND to_tsvector('simple', coalesce(title, '') || ' ' || body)
      @@ plainto_tsquery('simple', $1)
ORDER BY created_at DESC, id LIMIT 30;
```

The `simple` configuration gives token matching with no Turkish stemming or substring matching. Use the same expression in the index and the query.

### 4.10 Views

```sql
CREATE VIEW trip_availability AS
SELECT t.id AS trip_id,
       t.seat_capacity - count(b.id)::integer AS free_seats
FROM trips t LEFT JOIN bookings b ON b.trip_id = t.id
  AND b.status IN ('PENDING_PAYMENT','CONFIRMED','COMPLETED')
GROUP BY t.id, t.seat_capacity;

CREATE VIEW open_sponsorship_pool AS
SELECT id AS request_id, amount_minor, status, created_at AS requested_at
FROM sponsorship_requests
WHERE status = 'OPEN' AND expires_at > now()
  AND EXISTS (SELECT 1 FROM trips t
              WHERE t.id = sponsorship_requests.trip_id
                AND t.status = 'PUBLISHED' AND t.departure_at > now());


CREATE VIEW revealed_ride_ratings AS
SELECT r.booking_id, r.direction, r.score, r.review, r.created_at
FROM ride_ratings r
WHERE (SELECT count(*) FROM ride_ratings r2
       WHERE r2.booking_id = r.booking_id) = 2;

CREATE VIEW payment_reconciliation AS
SELECT p.id AS payment_id, p.amount_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'PAYMENT'), 0) AS received_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'HOLD'), 0)
    - coalesce(sum(l.amount_minor) FILTER
        (WHERE l.event_type IN ('RELEASE','REFUND')), 0) AS held_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'RELEASE'), 0) AS released_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'REFUND'), 0) AS refunded_minor
FROM payments p LEFT JOIN payment_ledger l ON l.payment_id = p.id
GROUP BY p.id, p.amount_minor;
```

Trip search order (free-seat trips first, full trips after):

```sql
SELECT t.id, t.departure_at, t.price_minor, a.free_seats
FROM trips t JOIN trip_availability a ON a.trip_id = t.id
WHERE t.origin_city_code = $1 AND t.destination_city_code = $2
  AND t.status = 'PUBLISHED' AND t.departure_at > now()
ORDER BY (a.free_seats > 0) DESC, t.departure_at, t.id;
```

Views are read helpers, not authorization. Students must not have direct DB access. Use explicit API field allowlists; never serialize a Prisma relation graph into a pool, driver list, donor receipt or public profile. The driver's passenger list must come from `driver_visible_bookings`.

## 5. Backend contracts (required alongside the SQL)

### A. Reserve a normal paid seat
1. Require a verified ACTIVE passenger. Start a short transaction and lock the trip row with `SELECT ... FOR UPDATE`.
2. Require PUBLISHED, future departure, driver ≠ passenger, and no live booking for this passenger and trip. Expire stale holds under the same lock.
3. Count occupied bookings. If count ≥ `seat_capacity`, return "full"; otherwise insert a PENDING_PAYMENT booking (price copied from the trip, 15-minute expiry).
4. Create its CREATED payment row with a server-controlled idempotency key, insert the booking notification, commit.
5. Call the sandbox provider after commit. Move the payment to PENDING/HELD only through the verified result handler.

Every path that changes occupancy uses the same lock order: trip → sponsorship request (if any) → booking → payment. A count followed by an unlocked insert is unsafe.

### B. Create and anonymously fund a request
1. The recipient chooses a trip privately. Lock the trip; ensure no active self-booking or live funding request exists. Create an OPEN request with the current seat price, expiring before departure. Reserve no seat yet.
2. The pool returns only `open_sponsorship_pool` fields. A donor picks an opaque request ID and sees no route, date, recipient or contact details.
3. Funding locks trip then request. Recheck OPEN, expiry, quote and free seats. The donor must be verified, ACTIVE, and different from the recipient and the driver.
4. In one transaction set FUNDING, create the recipient's PENDING_PAYMENT booking with the request FK, and create the donor's payment attempt. Commit before calling the provider.
5. On success the booking becomes CONFIRMED and the request FUNDED. The driver sees nothing (the booking is omitted from the passenger list and only reduces free seats). The recipient gets a generic "seat funded" notification.

Only one donor can change OPEN to FUNDING under the row lock. On final failure or expiry, mark the booking and request EXPIRED and free the seat; the recipient may create a new request. Never reset a request to OPEN after it has a booking. A provider success arriving after expiry or cancellation must not confirm a seat: record PAYMENT and HOLD, then issue a full refund and keep the booking inactive.

### C. Payment states and results

| Entity | Normal path | Alternative |
|---|---|---|
| Booking | PENDING_PAYMENT → CONFIRMED → COMPLETED | PENDING_PAYMENT → EXPIRED; active → CANCELLED |
| Funding request | OPEN → FUNDING → FUNDED | OPEN/FUNDING → EXPIRED; live/funded → CANCELLED |
| Payment | CREATED → PENDING → HELD → RELEASED | before collection → FAILED; HELD → REFUNDED |

- Verify the provider callback or fetch the result server-side; never trust a browser "success" URL. Validate amount and reference IDs against the server-created attempt.
- On success, in one transaction: insert PAYMENT + HOLD, set the payment HELD and the booking CONFIRMED (if the seat is still valid). A duplicate or out-of-order result is a no-op.
- On cancellation: set the booking CANCELLED; if the payment is HELD, call the provider refund after commit and, only on confirmed refund, insert REFUND and set REFUNDED. An uncollected attempt stays PENDING until its outcome is known.
- A small scheduled worker finds work from status alone: payments PENDING (reconcile with the provider), HELD payments whose booking is CANCELLED or EXPIRED (refund), and HELD payments whose booking is COMPLETED (release). No retry columns or job table are needed. On a network timeout, fetch provider state before repeating.

### D. Completion and release
- After scheduled departure the driver sets `trips.driver_completed_at`; a passenger sets `bookings.passenger_completed_at` on their own CONFIRMED booking.
- When both are present, set that booking COMPLETED in one transaction. The worker then calls provider approval and, on a verified success, inserts RELEASE and sets the payment RELEASED. Process all newly eligible bookings when the driver confirms.
- **Auto end (WBS-9.1):** 48 hours after `departure_at`, a job sets any missing driver or passenger timestamps for CONFIRMED bookings so release can proceed.
- Set the trip COMPLETED when the driver has confirmed and every non-cancelled, non-expired booking is completed.

### E. Housing and forum

| Action | Who | Rule |
|---|---|---|
| Post / edit listing or question | Author | Required fields present; new listings ACTIVE; queue the AI check after each save |
| Browse | Any verified user | ACTIVE, not hidden; filter by district and type (housing) or category (forum); newest first, 20 per page. Authors also see their own CLOSED or hidden items |
| Close / reopen listing | Author | Switch ACTIVE and CLOSED |
| Answer | Any verified user | Parent must be a QUESTION. Insert a FORUM_REPLY notification for the question's author (skip when answering your own question) in the same transaction; send email after commit; a failed email is logged and never undoes the answer |
| Keyword search | Any verified user | Query in Section 4.9, at most 30 results; an answer hit links to its question |
| Delete | Author only | Statement below |

Delete steps: check the caller is the author; start one transaction; close open cases on the content with the statement below (a question's answers are included); delete the row (a question's answers go with it, and the FKs empty case links); commit.

```sql
-- $1 post/listing id
UPDATE moderation_cases
SET status = 'SOLVED', resolution = 'CONTENT_DELETED',
    resolved_at = now(), updated_at = now()
WHERE status <> 'SOLVED'
  AND (target_post_id = $1 OR target_housing_id = $1
       OR target_post_id IN (SELECT id FROM forum_posts
                             WHERE parent_post_id = $1));
```

### F. Reports, AI flags and moderation actions

**How cases are created**
1. **User report.** A user names exactly one target (user, trip, listing or post) and a reason. Reject an empty reason, reporting yourself or your own content, and a second open report by the same user on the same target. Insert a USER case (ACTIVE). The reporter can read only ACTIVE or SOLVED for their own reports.
2. **AI flag.** After a post or listing is saved, a background job (never inside the user's request or a DB transaction) sends its text to the AI provider. Note the content's `updated_at` first. If the text is judged unsuitable, re-read the row: if it is gone or `updated_at` changed, drop the result; otherwise insert an AI case (`ai_model`, `ai_score`, `reason`) unless an open AI case on that target exists.
3. **AI unavailable.** On a timeout, malformed response or quota error, insert an AI case with `ai_unavailable = true` and reason `AI_UNAVAILABLE` (same stale and duplicate checks). The content stays visible and is never marked safe; a human decides.
4. AI only creates cases. It never hides content or suspends users.

**How staff work a case.** Moderators and admins see the queue, ACTIVE cases first, oldest first, filterable by source, with the reason, AI score and the reported content. Resolve with one statement (0 rows updated means another reviewer got there first: return 409):

```sql
-- $1 case, $2 reviewer, $3 resolution, $4 note
UPDATE moderation_cases
SET status = 'SOLVED', reviewed_by = $2, resolution = $3,
    resolution_note = $4, resolved_at = now(), updated_at = now()
WHERE id = $1 AND status = 'ACTIVE';
```

| Action | Resolution | What the backend does (same transaction as the statement) |
|---|---|---|
| Dismiss | DISMISSED | Nothing else |
| Hide content | CONTENT_HIDDEN | Set `hidden_at = now()` on the post or listing; notify the author (MODERATION, plain text) |
| Warn user | USER_WARNED | Insert a MODERATION notification for the user (the target, or the owner of the targeted content) |
| Suspend user | USER_SUSPENDED | Set `users.status = 'SUSPENDED'` for that user |

**User management**
- Suspend: moderators may suspend only USER accounts; admins may suspend USER or MODERATOR accounts. Nobody can suspend an ADMIN (change the role first) or themselves.
- Reactivate (set ACTIVE) and change role (USER / MODERATOR / ADMIN): admins only. You cannot change your own role, so at least one admin always remains.
- A suspension does not touch trips, bookings or payments. A suspended driver cannot confirm rides; an admin cancels their trips through the normal refund flow when needed.

**Admin overview (admins only, read only).** Askıda bilet overview: counts and TL totals of `sponsorship_requests` per status, with paid totals from `payment_reconciliation`. Usage statistics: counts of users, trips, bookings, listings and posts. Show totals only, never donor, recipient or trip identities. A test checks that the overview matches the ledger.

### G. Privacy and access checks
- **Passenger:** own booking and funding status; no donor fields.
- **Donor:** own payment amount and status and a generic receipt; no booking, recipient or trip link.
- **Driver:** seat and payment state and ordinary passenger details; funded seats are not displayed at all.
- **Moderator:** queue, reported content and the allowed actions; no ledger and no user or role management.
- **Admin:** everything above plus user management, ledger and overview.
- Never expose `provider_transaction_id`, internal joins or raw notification payloads through ordinary endpoints.

## 6. Prisma handoff

1. Represent the tables in Prisma with explicit `@map` / `@@map` names. Declare every id as `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`; do not use `autoincrement()`. Use `BigInt` for money and `DateTime @db.Timestamptz` for timestamps. Use `@@id` for composite keys and `@@unique` for compound uniqueness. Map delete rules with `onDelete: Cascade` (forum parent) and `onDelete: SetNull` (case post/listing references).
2. Generate a draft: `npx prisma migrate dev --create-only --name initial`. Review the SQL against Section 4 and add the missing CHECKs, views, the trigger function and expression indexes. Do not append duplicate `CREATE TABLE` statements.
3. Apply with `npx prisma migrate dev`; commit `schema.prisma`, migrations and the seed script together. Use `prisma migrate deploy` in deployment.
4. Partial-index support depends on the pinned Prisma version; use raw migration SQL if needed. Keep every rule in migration history.
5. Seed script (WBS-27.2): all 81 cities, İstanbul districts, forum categories, sample users for each role (including a temporary test login), and sample trips, requests, listings and posts.

Set `@updatedAt` on mutable models. `BigInt` cannot go through `JSON.stringify`; send money as decimal strings. Use parameterized raw queries for row locking and keyword search; never interpolate user input into SQL. Runtime DB credentials must not own tables or have DDL/TRUNCATE privileges; use separate migration credentials.

## 7. Integration checks before the demo

| Check | Expected result |
|---|---|
| Email and access | Non-İTÜ sign-up rejected; expired code, reused code and a sixth wrong attempt rejected; unverified or SUSPENDED user blocked even with a valid JWT |
| Roles | A moderator can handle cases but gets 403 on user management and the ledger; an admin can do both |
| Trip integrity | Same-city or non-İstanbul route rejected; stale departure cannot be booked |
| Last-seat race | Two concurrent attempts for one seat produce one reservation |
| Funding race and anonymity | Two donors claim one request: one wins. Pool, receipt, driver list and notification payloads never expose prohibited identities or trip data; a funded passenger never appears in the driver's list |
| Payment reliability | Duplicate results create one PAYMENT/HOLD pair; timeout reconciles; cancellation plus late success refunds without taking a seat |
| Completion and ratings | One-sided confirmation cannot release; both can; the 48-hour auto end releases. A single rating is absent from public lists and averages. |
| Ledger | Reconciliation identity holds per payment; ledger edits fail |
| Housing, forum, notifications | Only the author can edit or delete (others get 403); answer-to-answer rejected; deleting a question deletes its answers; CLOSED and hidden items are not browsable; a reply creates one notification |
| Reports and AI | Duplicate open report rejected; reporter sees only the safe status; stale AI flag dropped; deleting content with an open case solves that case |
| AI reliability | Timeout, malformed response and quota errors each create an `ai_unavailable` case and the content stays visible; AI alone can never hide content or suspend a user |
| Moderation actions | Hide removes content from browse; warn creates a notification; suspend blocks the user; a second reviewer gets 409; moderators cannot suspend admins or other moderators |

## 8. Traceability and decisions to record

Source: "Software Engineering: Project Plan" v1.1 (İTÜ ShareMaxxing), §1.1 scope, D-01 to D-09, T-01 to T-27, and the Security, Reliability, Privacy and AI reliability requirements. Optional items D-13, D-14, T-08, T-20, T-23 and T-34 are not designed here.

References: PostgreSQL constraints, explicit locking and full-text search docs; Prisma custom-migration docs; iyzico marketplace implementation and item-approval docs.

Confirm as a team before coding:
- The per-passenger release rule, the 15-minute seat hold and the funding-request expiry.
- Cancellation policy and the simplified no-show record.
- The plan's roles (student, moderator, admin) now match this schema: students are `USER`.

Deliberately omitted: chat, intermediate stops, GPS, driving-licence records, real-money wallets, rent/deposit payments, financial-need documents, other-university accounts, English content tables, waitlist, forum votes, course-code tags, vector search, admin audit log, payment event table and retry machinery.

Build order: accounts and location seeds → trips/bookings → sandbox payments and funding → ratings/no-show → forum/housing → moderation/notifications/admin. Agree on these shared migrations before each developer builds their feature endpoints.