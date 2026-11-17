-- Optional waitlist of a full trip (WBS-8.1, docs/Waitlist.md).

-- CreateEnum
CREATE TYPE "waitlist_status" AS ENUM ('WAITING', 'OFFERED', 'BOOKED', 'LEFT', 'EXPIRED');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "waitlist_status" NOT NULL DEFAULT 'WAITING',
    "offer_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_queue_idx" ON "waitlist_entries"("trip_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "waitlist_user_idx" ON "waitlist_entries"("user_id");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Raw SQL that Prisma cannot express.
-- A user is on the list of a trip at most once at a time.
CREATE UNIQUE INDEX "one_live_waitlist_entry"
  ON "waitlist_entries"("trip_id", "user_id")
  WHERE status IN ('WAITING', 'OFFERED');

-- An offered seat always has a deadline.
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_offer_has_deadline"
  CHECK (status <> 'OFFERED' OR offer_expires_at IS NOT NULL);
