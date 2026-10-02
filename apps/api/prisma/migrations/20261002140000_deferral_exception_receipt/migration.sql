-- CreateEnum
CREATE TYPE "deferral_reason" AS ENUM ('NO_CAPACITY', 'NO_REEFER', 'VAN_ACCESS', 'WINDOW_CONFLICT', 'DEPOT_MISMATCH', 'TIME_BUDGET');

-- CreateTable
CREATE TABLE "deferrals" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reason" "deferral_reason" NOT NULL,
    "reported_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deferrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptions" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "reported_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "delivery_record_id" UUID NOT NULL,
    "store_manager_user_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "result" TEXT NOT NULL,
    "issue_details" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deferrals_order_id_idx" ON "deferrals"("order_id");

-- CreateIndex
CREATE INDEX "exceptions_reported_by_user_id_idx" ON "exceptions"("reported_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_delivery_record_id_key" ON "receipts"("delivery_record_id");

-- CreateIndex
CREATE INDEX "receipts_store_manager_user_id_idx" ON "receipts"("store_manager_user_id");

-- AddForeignKey
ALTER TABLE "deferrals" ADD CONSTRAINT "deferrals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_delivery_record_id_fkey" FOREIGN KEY ("delivery_record_id") REFERENCES "delivery_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_store_manager_user_id_fkey" FOREIGN KEY ("store_manager_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
