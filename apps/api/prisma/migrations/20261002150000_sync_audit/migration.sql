-- CreateEnum
CREATE TYPE "sync_event_type" AS ENUM ('delivery outcome', 'proof of delivery');

-- CreateEnum
CREATE TYPE "event_target_type" AS ENUM ('Order', 'Trip', 'TripStop', 'LoadingRecord', 'DeliveryRecord', 'ProofOfDelivery', 'Deferral', 'Exception', 'Receipt');

-- CreateTable
CREATE TABLE "sync_events" (
    "id" UUID NOT NULL,
    "client_event_id" TEXT NOT NULL,
    "event_type" "sync_event_type" NOT NULL,
    "target_type" "event_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "client_created_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "last_attempt_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "actor_user_id" UUID,
    "target_type" "event_target_type",
    "target_id" UUID,
    "details" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_events_client_event_id_key" ON "sync_events"("client_event_id");

-- CreateIndex
CREATE INDEX "sync_events_target_type_target_id_idx" ON "sync_events"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_events_target_type_target_id_idx" ON "audit_events"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_client_event_id_non_empty" CHECK (btrim("client_event_id") <> '');
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_attempt_count_non_negative" CHECK ("attempt_count" IS NULL OR "attempt_count" >= 0);
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_reference_complete" CHECK (("target_type" IS NULL) = ("target_id" IS NULL));
