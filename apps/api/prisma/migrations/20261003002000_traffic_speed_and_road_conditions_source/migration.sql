-- CreateTable
CREATE TABLE "traffic_speed_source" (
    "district" TEXT NOT NULL,
    "hour" TEXT NOT NULL,
    "monsoon" TEXT NOT NULL,
    "speed_index" TEXT NOT NULL,

    CONSTRAINT "traffic_speed_source_pkey" PRIMARY KEY ("district","hour","monsoon")
);

-- CreateTable
CREATE TABLE "road_conditions_source" (
    "district" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "disruption_index" TEXT NOT NULL,

    CONSTRAINT "road_conditions_source_pkey" PRIMARY KEY ("district","date")
);

ALTER TABLE "traffic_speed_source" ADD CONSTRAINT "traffic_speed_source_district_present" CHECK ("district" <> '');

ALTER TABLE "traffic_speed_source" ADD CONSTRAINT "traffic_speed_source_hour_present" CHECK ("hour" <> '');

ALTER TABLE "traffic_speed_source" ADD CONSTRAINT "traffic_speed_source_monsoon_present" CHECK ("monsoon" <> '');

ALTER TABLE "road_conditions_source" ADD CONSTRAINT "road_conditions_source_district_present" CHECK ("district" <> '');

ALTER TABLE "road_conditions_source" ADD CONSTRAINT "road_conditions_source_date_present" CHECK ("date" <> '');
