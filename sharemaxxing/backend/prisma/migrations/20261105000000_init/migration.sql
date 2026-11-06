-- Migration 1 of 3: tables, enums, keys and plain indexes (everything Prisma models directly).
-- Mirrors prisma/schema.prisma. Raw-SQL-only objects (CHECKs, partial indexes, trigger, views)
-- are in migration 2; lookup data is in migration 3.

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('PUBLISHED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "sponsorship_status" AS ENUM ('OPEN', 'FUNDING', 'FUNDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('IYZICO_SANDBOX');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('CREATED', 'PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ledger_event_type" AS ENUM ('PAYMENT', 'HOLD', 'RELEASE', 'REFUND');

-- CreateEnum
CREATE TYPE "rating_direction" AS ENUM ('DRIVER_TO_PASSENGER', 'PASSENGER_TO_DRIVER');

-- CreateEnum
CREATE TYPE "missing_party" AS ENUM ('DRIVER', 'PASSENGER');

-- CreateEnum
CREATE TYPE "housing_listing_type" AS ENUM ('HAVE_ROOM', 'NEED_ROOM');

-- CreateEnum
CREATE TYPE "housing_status" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "post_kind" AS ENUM ('QUESTION', 'ANSWER');

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('BOOKING', 'CANCELLATION', 'RIDE_REMINDER', 'PAYMENT', 'FUNDING', 'FORUM_REPLY', 'MODERATION');

-- CreateEnum
CREATE TYPE "moderation_source" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "moderation_status" AS ENUM ('ACTIVE', 'SOLVED');

-- CreateEnum
CREATE TYPE "moderation_resolution" AS ENUM ('DISMISSED', 'CONTENT_HIDDEN', 'CONTENT_DELETED', 'USER_WARNED', 'USER_SUSPENDED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "bio" VARCHAR(500),
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
    CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email")),
    CONSTRAINT "users_email_itu" CHECK ("email" ~ '^[a-z0-9._%+-]+@itu[.]edu[.]tr$'),
    CONSTRAINT "users_display_name_nonempty" CHECK (length(trim("display_name")) > 0)
);

-- CreateTable
CREATE TABLE "driver_submerchants" (
    "user_id" UUID NOT NULL,
    "iyzico_submerchant_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_submerchants_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "email_verification_codes" (
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "failed_attempts" SMALLINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "cities" (
    "code" SMALLINT NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "istanbul_districts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "istanbul_districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "origin_city_code" SMALLINT NOT NULL,
    "destination_city_code" SMALLINT NOT NULL,
    "departure_at" TIMESTAMPTZ(6) NOT NULL,
    "seat_capacity" SMALLINT NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "description" TEXT,
    "contact_details" VARCHAR(250),
    "status" "trip_status" NOT NULL DEFAULT 'PUBLISHED',
    "driver_completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "sponsorship_request_id" UUID,
    "price_minor" BIGINT NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "reservation_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "passenger_completed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorship_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" "sponsorship_status" NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorship_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "provider" "payment_provider" NOT NULL DEFAULT 'IYZICO_SANDBOX',
    "provider_payment_id" TEXT,
    "provider_transaction_id" TEXT,
    "provider_refund_id" TEXT,
    "idempotency_key" UUID NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'CREATED',
    "failure_code" TEXT,
    "held_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "event_type" "ledger_event_type" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_ratings" (
    "booking_id" UUID NOT NULL,
    "direction" "rating_direction" NOT NULL,
    "score" SMALLINT NOT NULL,
    "review" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_ratings_pkey" PRIMARY KEY ("booking_id","direction")
);

-- CreateTable
CREATE TABLE "no_show_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "missing_party" "missing_party" NOT NULL,
    "details" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "no_show_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housing_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "listing_type" "housing_listing_type" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "contact_details" VARCHAR(250),
    "status" "housing_status" NOT NULL DEFAULT 'ACTIVE',
    "hidden_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housing_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "label_tr" VARCHAR(80) NOT NULL,

    CONSTRAINT "forum_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "kind" "post_kind" NOT NULL,
    "parent_post_id" UUID,
    "category_id" UUID,
    "title" VARCHAR(180),
    "body" TEXT NOT NULL,
    "hidden_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" "moderation_source" NOT NULL,
    "reporter_id" UUID,
    "target_user_id" UUID,
    "target_trip_id" UUID,
    "target_housing_id" UUID,
    "target_post_id" UUID,
    "reason" TEXT NOT NULL,
    "ai_model" TEXT,
    "ai_score" DECIMAL(5,4),
    "ai_unavailable" BOOLEAN NOT NULL DEFAULT false,
    "status" "moderation_status" NOT NULL DEFAULT 'ACTIVE',
    "reviewed_by" UUID,
    "resolution" "moderation_resolution",
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "driver_submerchants_iyzico_submerchant_key_key" ON "driver_submerchants"("iyzico_submerchant_key");

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_key" ON "cities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "istanbul_districts_name_key" ON "istanbul_districts"("name");

-- CreateIndex
CREATE INDEX "trips_driver_idx" ON "trips"("driver_id", "departure_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_sponsorship_request_id_key" ON "bookings"("sponsorship_request_id");

-- CreateIndex
CREATE INDEX "bookings_trip_status_idx" ON "bookings"("trip_id", "status");

-- CreateIndex
CREATE INDEX "bookings_passenger_idx" ON "bookings"("passenger_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "funding_recipient_idx" ON "sponsorship_requests"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_transaction_id_key" ON "payments"("provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_payer_idx" ON "payments"("payer_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_ledger_payment_id_event_type_key" ON "payment_ledger"("payment_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "no_show_reports_booking_id_missing_party_key" ON "no_show_reports"("booking_id", "missing_party");

-- CreateIndex
CREATE INDEX "housing_author_idx" ON "housing_listings"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "forum_categories_code_key" ON "forum_categories"("code");

-- CreateIndex
CREATE INDEX "forum_answers_idx" ON "forum_posts"("parent_post_id", "created_at");

-- CreateIndex
CREATE INDEX "forum_author_idx" ON "forum_posts"("author_id");

-- CreateIndex
CREATE INDEX "moderation_queue_idx" ON "moderation_cases"("status", "created_at");

-- AddForeignKey
ALTER TABLE "driver_submerchants" ADD CONSTRAINT "driver_submerchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_origin_city_code_fkey" FOREIGN KEY ("origin_city_code") REFERENCES "cities"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_city_code_fkey" FOREIGN KEY ("destination_city_code") REFERENCES "cities"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_sponsorship_request_id_fkey" FOREIGN KEY ("sponsorship_request_id") REFERENCES "sponsorship_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sponsorship_requests" ADD CONSTRAINT "sponsorship_requests_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sponsorship_requests" ADD CONSTRAINT "sponsorship_requests_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_ledger" ADD CONSTRAINT "payment_ledger_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "no_show_reports" ADD CONSTRAINT "no_show_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "housing_listings" ADD CONSTRAINT "housing_listings_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "housing_listings" ADD CONSTRAINT "housing_listings_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "istanbul_districts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_parent_post_id_fkey" FOREIGN KEY ("parent_post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "forum_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_target_trip_id_fkey" FOREIGN KEY ("target_trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_target_housing_id_fkey" FOREIGN KEY ("target_housing_id") REFERENCES "housing_listings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_target_post_id_fkey" FOREIGN KEY ("target_post_id") REFERENCES "forum_posts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
