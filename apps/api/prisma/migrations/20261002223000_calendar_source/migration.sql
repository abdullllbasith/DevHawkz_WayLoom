-- CreateTable
CREATE TABLE "calendar_source" (
    "date" DATE NOT NULL,
    "dow" INTEGER NOT NULL,
    "dow_name" TEXT NOT NULL,
    "is_weekend" INTEGER NOT NULL,
    "iso_year" INTEGER NOT NULL,
    "iso_week" INTEGER NOT NULL,
    "is_payday" INTEGER NOT NULL,
    "festival" TEXT NOT NULL,
    "festival_ramp" TEXT NOT NULL,
    "is_holiday" INTEGER NOT NULL,
    "monsoon" INTEGER NOT NULL,
    "is_operating" INTEGER NOT NULL,

    CONSTRAINT "calendar_source_pkey" PRIMARY KEY ("date")
);

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_dow_allowed" CHECK ("dow" BETWEEN 0 AND 6);

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_dow_name_allowed" CHECK ("dow_name" IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'));

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_is_weekend_flag" CHECK ("is_weekend" IN (0, 1));

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_is_payday_flag" CHECK ("is_payday" IN (0, 1));

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_festival_allowed" CHECK ("festival" IN ('', 'christmas', 'deepavali', 'esala', 'new_year', 'poson', 'thai_pongal', 'vesak'));

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_festival_ramp_allowed" CHECK ("festival_ramp" IN ('0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0'));

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_is_holiday_flag" CHECK ("is_holiday" IN (0, 1));

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_monsoon_flag" CHECK ("monsoon" IN (0, 1));

ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_is_operating_flag" CHECK ("is_operating" IN (0, 1));
