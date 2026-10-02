-- CreateTable
CREATE TABLE "district_travel_source" (
    "depot" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "road_class" TEXT NOT NULL,
    "free_flow_kmh" TEXT NOT NULL,
    "depot_to_district_km" TEXT NOT NULL,
    "depot_to_district_freeflow_min" TEXT NOT NULL,
    "inter_stop_km" TEXT NOT NULL,
    "inter_stop_freeflow_min" TEXT NOT NULL,

    CONSTRAINT "district_travel_source_pkey" PRIMARY KEY ("depot","district")
);

ALTER TABLE "district_travel_source" ADD CONSTRAINT "district_travel_source_depot_present" CHECK ("depot" <> '');

ALTER TABLE "district_travel_source" ADD CONSTRAINT "district_travel_source_district_present" CHECK ("district" <> '');
