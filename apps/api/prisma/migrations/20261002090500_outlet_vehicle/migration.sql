-- CreateEnum
CREATE TYPE "depot" AS ENUM ('Peliyagoda', 'Kandy');

-- CreateEnum
CREATE TYPE "outlet_brand" AS ENUM ('Fresh', 'Style', 'Tech');

-- CreateEnum
CREATE TYPE "dock_type" AS ENUM ('rear_dock', 'street', 'mall_bay');

-- CreateEnum
CREATE TYPE "parking_constraint" AS ENUM ('normal', 'van_only', 'mall_dock');

-- CreateEnum
CREATE TYPE "vehicle_type" AS ENUM ('truck', 'van');

-- CreateEnum
CREATE TYPE "vehicle_temperature_capability" AS ENUM ('reefer', 'ambient');

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "brand" "outlet_brand" NOT NULL,
    "district" TEXT NOT NULL,
    "depot" "depot" NOT NULL,
    "dock_type" "dock_type" NOT NULL,
    "parking_constraint" "parking_constraint" NOT NULL,
    "mall_window" TEXT,
    "window_open_time" TIME(0),
    "window_close_time" TIME(0),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "type" "vehicle_type" NOT NULL,
    "temp" "vehicle_temperature_capability" NOT NULL,
    "weight_cap_kg" DECIMAL(65,30) NOT NULL,
    "volume_cap_m3" DECIMAL(65,30) NOT NULL,
    "fuel_type" TEXT NOT NULL,
    "km_per_l" DECIMAL(65,30) NOT NULL,
    "weekly_fuel_quota_l" DECIMAL(65,30) NOT NULL,
    "depot" "depot" NOT NULL,
    "driver_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outlets_outlet_id_key" ON "outlets"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vehicle_id_key" ON "vehicles"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicles_driver_user_id_idx" ON "vehicles"("driver_user_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_user_id_fkey" FOREIGN KEY ("driver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Capacity must stay positive. Weight and volume remain separate.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_weight_cap_kg_positive" CHECK ("weight_cap_kg" > 0);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_volume_cap_m3_positive" CHECK ("volume_cap_m3" > 0);
