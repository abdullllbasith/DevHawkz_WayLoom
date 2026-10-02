-- CreateTable
CREATE TABLE "service_allowance_source" (
    "brand" TEXT NOT NULL,
    "dock_type" TEXT NOT NULL,
    "service_allowance_min" TEXT NOT NULL,

    CONSTRAINT "service_allowance_source_pkey" PRIMARY KEY ("brand","dock_type")
);

ALTER TABLE "service_allowance_source" ADD CONSTRAINT "service_allowance_source_brand_present" CHECK ("brand" <> '');

ALTER TABLE "service_allowance_source" ADD CONSTRAINT "service_allowance_source_dock_type_present" CHECK ("dock_type" <> '');
