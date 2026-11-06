-- Migration 2 of 3: everything Prisma cannot express in schema.prisma.
-- Hand-written from docs/databaseplan.md v1.3 (sections 4.1 - 4.10). Keep every rule here, in
-- migration history, so a fresh database always gets the same guarantees.
--
-- Enum-valued columns (status, role, kind, ...) are already restricted by native enum types in
-- migration 1, so the plan's `CHECK (status IN (...))` clauses are not repeated here.

-- ═══════════════════════════ CHECK constraints ═══════════════════════════

-- users (4.1)
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk" CHECK (email = lower(email)),
  ADD CONSTRAINT "users_email_itu_chk" CHECK (email ~ '^[a-z0-9._%+-]+@itu[.]edu[.]tr$'),
  ADD CONSTRAINT "users_display_name_chk" CHECK (length(trim(display_name)) > 0);

-- email_verification_codes (4.1)
ALTER TABLE "email_verification_codes"
  ADD CONSTRAINT "email_verification_codes_attempts_chk" CHECK (failed_attempts BETWEEN 0 AND 5);

-- cities (4.1)
ALTER TABLE "cities"
  ADD CONSTRAINT "cities_code_chk" CHECK (code BETWEEN 1 AND 81);

-- trips (4.2): exactly two different cities, one of them İstanbul (plate code 34)
ALTER TABLE "trips"
  ADD CONSTRAINT "trips_seat_capacity_chk" CHECK (seat_capacity > 0),
  ADD CONSTRAINT "trips_price_chk" CHECK (price_minor > 0),
  ADD CONSTRAINT "trips_distinct_cities_chk" CHECK (origin_city_code <> destination_city_code),
  ADD CONSTRAINT "trips_istanbul_endpoint_chk" CHECK (origin_city_code = 34 OR destination_city_code = 34);

-- bookings (4.2)
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_price_chk" CHECK (price_minor > 0),
  ADD CONSTRAINT "bookings_expiry_chk" CHECK (reservation_expires_at > created_at),
  ADD CONSTRAINT "bookings_completed_chk" CHECK (
    status <> 'COMPLETED' OR (completed_at IS NOT NULL AND passenger_completed_at IS NOT NULL)
  );

-- sponsorship_requests (4.3)
ALTER TABLE "sponsorship_requests"
  ADD CONSTRAINT "sponsorship_requests_amount_chk" CHECK (amount_minor > 0),
  ADD CONSTRAINT "sponsorship_requests_expiry_chk" CHECK (expires_at > created_at);

-- payments (4.3)
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK (amount_minor > 0);

-- payment_ledger (4.4)
ALTER TABLE "payment_ledger"
  ADD CONSTRAINT "payment_ledger_amount_chk" CHECK (amount_minor > 0);

-- ride_ratings (4.5)
ALTER TABLE "ride_ratings"
  ADD CONSTRAINT "ride_ratings_score_chk" CHECK (score BETWEEN 1 AND 5);

-- housing_listings (4.6)
ALTER TABLE "housing_listings"
  ADD CONSTRAINT "housing_listings_title_chk" CHECK (length(trim(title)) > 0),
  ADD CONSTRAINT "housing_listings_description_chk" CHECK (length(trim(description)) > 0);

-- forum_posts (4.6): a QUESTION has category + title and no parent; an ANSWER has a parent and neither
ALTER TABLE "forum_posts"
  ADD CONSTRAINT "forum_posts_body_chk" CHECK (length(trim(body)) > 0),
  ADD CONSTRAINT "forum_posts_not_own_parent_chk" CHECK (parent_post_id IS DISTINCT FROM id),
  ADD CONSTRAINT "forum_posts_kind_shape_chk" CHECK (
       (kind = 'QUESTION' AND parent_post_id IS NULL
          AND category_id IS NOT NULL AND title IS NOT NULL
          AND length(trim(title)) > 0)
    OR (kind = 'ANSWER' AND parent_post_id IS NOT NULL
          AND category_id IS NULL AND title IS NULL)
  );

-- moderation_cases (4.8)
ALTER TABLE "moderation_cases"
  ADD CONSTRAINT "moderation_cases_ai_score_chk" CHECK (ai_score BETWEEN 0 AND 1),
  ADD CONSTRAINT "moderation_cases_reason_chk" CHECK (length(trim(reason)) > 0),
  -- at most one target, and exactly one while the case is ACTIVE
  ADD CONSTRAINT "moderation_cases_one_target_chk" CHECK (
    num_nonnulls(target_user_id, target_trip_id, target_housing_id, target_post_id) <= 1
  ),
  ADD CONSTRAINT "moderation_cases_active_has_target_chk" CHECK (
    status = 'SOLVED'
    OR num_nonnulls(target_user_id, target_trip_id, target_housing_id, target_post_id) = 1
  ),
  -- USER cases need a reporter; AI cases have none and target a post or listing while ACTIVE
  ADD CONSTRAINT "moderation_cases_source_chk" CHECK (
       (source = 'USER' AND reporter_id IS NOT NULL)
    OR (source = 'AI' AND reporter_id IS NULL
        AND (ai_model IS NOT NULL OR ai_unavailable)
        AND (status = 'SOLVED' OR num_nonnulls(target_post_id, target_housing_id) = 1))
  ),
  -- lifecycle: ACTIVE has no resolution; SOLVED has one (reviewer optional only for CONTENT_DELETED)
  ADD CONSTRAINT "moderation_cases_lifecycle_chk" CHECK (
       (status = 'ACTIVE' AND reviewed_by IS NULL AND resolution IS NULL AND resolved_at IS NULL)
    OR (status = 'SOLVED' AND resolution IS NOT NULL AND resolved_at IS NOT NULL
        AND (resolution = 'CONTENT_DELETED' OR reviewed_by IS NOT NULL))
  );

-- ═════════════ Partial unique indexes (business rules, 4.2 - 4.4) ═════════════
-- A violation surfaces in Prisma Client as error code P2002 (unique constraint failed).

-- A passenger may hold only one live booking per trip.
CREATE UNIQUE INDEX "one_active_booking_per_passenger"
  ON "bookings"("trip_id", "passenger_id")
  WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED');

-- A recipient may have only one live funding request per trip.
CREATE UNIQUE INDEX "one_live_funding_request"
  ON "sponsorship_requests"("trip_id", "recipient_id")
  WHERE status IN ('OPEN', 'FUNDING', 'FUNDED');

-- A booking has at most one non-failed payment; a new attempt is allowed only after FAILED.
CREATE UNIQUE INDEX "one_nonfailed_payment_per_booking"
  ON "payments"("booking_id")
  WHERE status <> 'FAILED';

-- Full release OR full refund, never both.
CREATE UNIQUE INDEX "one_terminal_ledger_event"
  ON "payment_ledger"("payment_id")
  WHERE event_type IN ('RELEASE', 'REFUND');

-- ═══════════════════ Partial / expression indexes (4.9) ═══════════════════

CREATE INDEX "trips_search_idx" ON "trips"("origin_city_code", "destination_city_code", "departure_at")
  WHERE status = 'PUBLISHED';

CREATE INDEX "booking_expiry_idx" ON "bookings"("reservation_expires_at")
  WHERE status = 'PENDING_PAYMENT';

CREATE INDEX "funding_pool_idx" ON "sponsorship_requests"("created_at", "id")
  WHERE status = 'OPEN';

CREATE INDEX "payments_open_idx" ON "payments"("status")
  WHERE status IN ('PENDING', 'HELD');

CREATE INDEX "housing_browse_idx" ON "housing_listings"("district_id", "listing_type", "created_at" DESC)
  WHERE status = 'ACTIVE' AND hidden_at IS NULL;

CREATE INDEX "forum_browse_idx" ON "forum_posts"("category_id", "created_at" DESC)
  WHERE kind = 'QUESTION' AND hidden_at IS NULL;

-- Keyword search. The query must use the exact same expression (see databaseplan.md 4.9).
CREATE INDEX "forum_keyword_idx" ON "forum_posts"
  USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || body));

CREATE INDEX "unread_notifications_idx" ON "notifications"("recipient_id", "created_at" DESC)
  WHERE read_at IS NULL;

-- ═════════════════ Append-only ledger trigger (4.4) ═════════════════

CREATE FUNCTION reject_record_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: %', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "ledger_is_append_only"
  BEFORE UPDATE OR DELETE ON "payment_ledger"
  FOR EACH ROW EXECUTE FUNCTION reject_record_mutation();

-- ═══════════════════════════ Views (4.10) ═══════════════════════════
-- Views are read helpers, not authorization. Use explicit API field allowlists.

CREATE VIEW "trip_availability" AS
SELECT t.id AS trip_id,
       t.seat_capacity - count(b.id)::integer AS free_seats
FROM trips t
LEFT JOIN bookings b ON b.trip_id = t.id
  AND b.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED')
GROUP BY t.id, t.seat_capacity;

-- The anonymous askıda bilet pool: request UUID, amount, date, status - nothing else.
CREATE VIEW "open_sponsorship_pool" AS
SELECT id AS request_id, amount_minor, status, created_at AS requested_at
FROM sponsorship_requests
WHERE status = 'OPEN' AND expires_at > now()
  AND EXISTS (SELECT 1 FROM trips t
              WHERE t.id = sponsorship_requests.trip_id
                AND t.status = 'PUBLISHED' AND t.departure_at > now());

-- Ratings stay hidden until both directions exist.
CREATE VIEW "revealed_ride_ratings" AS
SELECT r.booking_id, r.direction, r.score, r.review, r.created_at
FROM ride_ratings r
WHERE (SELECT count(*) FROM ride_ratings r2
       WHERE r2.booking_id = r.booking_id) = 2;

CREATE VIEW "payment_reconciliation" AS
SELECT p.id AS payment_id, p.amount_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'PAYMENT'), 0) AS received_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'HOLD'), 0)
    - coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type IN ('RELEASE', 'REFUND')), 0) AS held_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'RELEASE'), 0) AS released_minor,
  coalesce(sum(l.amount_minor) FILTER (WHERE l.event_type = 'REFUND'), 0) AS refunded_minor
FROM payments p
LEFT JOIN payment_ledger l ON l.payment_id = p.id
GROUP BY p.id, p.amount_minor;

-- NOT defined in databaseplan.md, although sections 4.10 and 5 say the driver's passenger list "must
-- come from driver_visible_bookings". Funded seats (sponsorship_request_id set) are excluded so the
-- driver never sees them; they still count toward trip_availability. No donor or payer identity here.
CREATE VIEW "driver_visible_bookings" AS
SELECT b.id AS booking_id, b.trip_id, t.driver_id, b.passenger_id,
       b.status AS booking_status, p.status AS payment_status,
       b.created_at, b.completed_at, b.passenger_completed_at
FROM bookings b
JOIN trips t ON t.id = b.trip_id
LEFT JOIN payments p ON p.booking_id = b.id AND p.status <> 'FAILED'
WHERE b.sponsorship_request_id IS NULL;
