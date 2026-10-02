-- CreateEnum
CREATE TYPE "trip_allocation_status" AS ENUM ('PLANNED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "route_id" TEXT,
    "operational_date" DATE NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "depot" "depot" NOT NULL,
    "trip_number" INTEGER NOT NULL,
    "status" "trip_allocation_status" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stops" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "seq_in_route" INTEGER NOT NULL,
    "planned_arrival" TIME(0),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trips_route_id_key" ON "trips"("route_id");

-- CreateIndex
CREATE INDEX "trips_vehicle_id_idx" ON "trips"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_vehicle_id_operational_date_trip_number_key" ON "trips"("vehicle_id", "operational_date", "trip_number");

-- CreateIndex
CREATE INDEX "trip_stops_trip_id_idx" ON "trip_stops"("trip_id");

-- CreateIndex
CREATE INDEX "trip_stops_order_id_idx" ON "trip_stops"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_stops_trip_id_seq_in_route_key" ON "trip_stops"("trip_id", "seq_in_route");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A vehicle day has only trip numbers 1 and 2. Stop sequence is 0-based.
ALTER TABLE "trips" ADD CONSTRAINT "trips_trip_number_allowed" CHECK ("trip_number" IN (1, 2));
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_seq_in_route_non_negative" CHECK ("seq_in_route" >= 0);
