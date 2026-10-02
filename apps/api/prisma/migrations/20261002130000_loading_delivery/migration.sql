-- CreateTable
CREATE TABLE "loading_records" (
    "id" UUID NOT NULL,
    "trip_stop_id" UUID NOT NULL,
    "loader_user_id" UUID NOT NULL,
    "expected_units" INTEGER NOT NULL,
    "loaded_units" INTEGER NOT NULL,
    "shortfall_units" INTEGER,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "shortfall_reported_at" TIMESTAMPTZ(3),
    "details" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loading_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_records" (
    "id" UUID NOT NULL,
    "trip_stop_id" UUID NOT NULL,
    "driver_user_id" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "delivered_units" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs_of_delivery" (
    "id" UUID NOT NULL,
    "delivery_record_id" UUID NOT NULL,
    "evidence_reference" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "captured_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proofs_of_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loading_records_trip_stop_id_idx" ON "loading_records"("trip_stop_id");

-- CreateIndex
CREATE INDEX "loading_records_loader_user_id_idx" ON "loading_records"("loader_user_id");

-- CreateIndex
CREATE INDEX "delivery_records_trip_stop_id_idx" ON "delivery_records"("trip_stop_id");

-- CreateIndex
CREATE INDEX "delivery_records_driver_user_id_idx" ON "delivery_records"("driver_user_id");

-- CreateIndex
CREATE INDEX "proofs_of_delivery_delivery_record_id_idx" ON "proofs_of_delivery"("delivery_record_id");

-- CreateIndex
CREATE INDEX "proofs_of_delivery_captured_by_user_id_idx" ON "proofs_of_delivery"("captured_by_user_id");

-- AddForeignKey
ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_trip_stop_id_fkey" FOREIGN KEY ("trip_stop_id") REFERENCES "trip_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_loader_user_id_fkey" FOREIGN KEY ("loader_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_trip_stop_id_fkey" FOREIGN KEY ("trip_stop_id") REFERENCES "trip_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_driver_user_id_fkey" FOREIGN KEY ("driver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs_of_delivery" ADD CONSTRAINT "proofs_of_delivery_delivery_record_id_fkey" FOREIGN KEY ("delivery_record_id") REFERENCES "delivery_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs_of_delivery" ADD CONSTRAINT "proofs_of_delivery_captured_by_user_id_fkey" FOREIGN KEY ("captured_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_expected_units_non_negative" CHECK ("expected_units" >= 0);
ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_loaded_units_non_negative" CHECK ("loaded_units" >= 0);
ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_shortfall_units_non_negative" CHECK ("shortfall_units" IS NULL OR "shortfall_units" >= 0);
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_delivered_units_non_negative" CHECK ("delivered_units" IS NULL OR "delivered_units" >= 0);
ALTER TABLE "proofs_of_delivery" ADD CONSTRAINT "proofs_of_delivery_evidence_reference_non_empty" CHECK (btrim("evidence_reference") <> '');
