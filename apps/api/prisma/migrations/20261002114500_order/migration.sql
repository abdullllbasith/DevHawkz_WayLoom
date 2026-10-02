-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('Draft', 'Submitted', 'Confirmed', 'Deferred', 'Planned / Allocated', 'Loading', 'Exception Reported', 'Loaded', 'Dispatched', 'Delivered', 'Receipt Confirmed');

-- CreateEnum
CREATE TYPE "order_temperature_requirement" AS ENUM ('chilled', 'ambient');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "outlet_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "status" "order_status" NOT NULL,
    "temp_requirement" "order_temperature_requirement" NOT NULL,
    "order_units" INTEGER NOT NULL,
    "order_weight_kg" DECIMAL(65,30) NOT NULL,
    "order_volume_m3" DECIMAL(65,30) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_delivery_id_key" ON "orders"("delivery_id");

-- CreateIndex
CREATE INDEX "orders_outlet_id_idx" ON "orders"("outlet_id");

-- CreateIndex
CREATE INDEX "orders_created_by_user_id_idx" ON "orders"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quantity, weight, and volume stay separate and must be positive.
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_units_positive" CHECK ("order_units" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_weight_kg_positive" CHECK ("order_weight_kg" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_volume_m3_positive" CHECK ("order_volume_m3" > 0);
