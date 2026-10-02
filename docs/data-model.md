# Data model

Entity definitions, migrations, and relationship documentation belong to later database tasks. The identifier convention below is decided.

## Persisted entity identifiers

WayLoom uses UUIDs as the internal primary identifiers for persisted domain entities in PostgreSQL.

### Internal entity identity

The primary key of a persisted domain entity is a UUID. That UUID is the internal database identity. Prisma models use `@id @default(uuid()) @db.Uuid`, so PostgreSQL stores the value as `uuid` and Prisma's `uuid()` default generates it.

### Business and source identifiers

Business identifiers and competition/source identifiers remain separate fields. Examples include `outlet_id`, `order_number`, route/source identifiers, and other identifiers supplied by competition datasets. Those values are not replaced by the internal UUID.

### Planning determinism

UUIDs are not planning-ordering fields and are not deterministic tie-breaking fields. Planning and allocation ordering uses explicitly defined deterministic domain or business fields. The planning algorithm does not use random UUID generation or UUID ordering.

### Scope

This convention applies to persisted application-domain entities unless a later authoritative architecture decision explicitly defines an exception.

Calendar source rows are that exception. They are persisted competition/master data. The decision is recorded in Calendar source data below.

## Calendar source data

This section records an explicit resolution of an architecture gap. It is not claimed to have been specified by Blueprint v1.4.

Blueprint v1.4 requires `calendar.csv` as a Hackathon import dataset used by the operational model and planning engine. Blueprint v1.4 does not define a Calendar database entity, a destination table, a JSON or config representation, a calendar identity, or the exact planning-service calendar fields.

`calendar.csv` is source-backed competition/master data. The supplied calendar fields remain source-backed and must be preserved faithfully.

Calendar data must be persisted in PostgreSQL so it is available to the operational model and planning engine.

Calendar is not added to the application-domain entity inventory. A later explicit architecture decision is required before Calendar is added to that inventory.

The planning service receives calendar context for the selected operating date through the approved planning input contract. Calendar context is not planning output. This does not create a second planning workflow.

Do not invent quantitative demand or travel effects from calendar fields. Do not invent additional calendar fields.

The source date is the natural source identity for calendar context, subject to validation of uniqueness in the supplied dataset.

The UUID convention applies to persisted application-domain entities. Do not introduce a UUID identity for calendar source rows merely to satisfy that convention.

### Persisted source table

TASK-02-14 persists this decision in PostgreSQL table `calendar_source`. That table is competition/master source data. It is not an application-domain entity, and it is not part of the application-domain entity inventory.

The primary key is `date`, the source date. There is no UUID column. The columns are the supplied `calendar.csv` fields: `date`, `dow`, `dow_name`, `is_weekend`, `iso_year`, `iso_week`, `is_payday`, `festival`, `festival_ramp`, `is_holiday`, `monsoon`, and `is_operating`. A blank `festival` stays an empty string. No demand, travel, or planning field is added.

## District travel source data

This section records an explicit resolution of an architecture gap. It is not claimed to have been specified by Blueprint v1.4.

Blueprint v1.4 requires `district_travel.csv` as a Hackathon competition dataset and requires its travel information for trip-time and fuel calculations. Blueprint v1.4 does not define a database table, a source-data identity, a storage mechanism, a normalized travel representation, or the exact Phase 5 travel input structure. Its application-domain entity inventory does not include a travel entity. Phase 5 consumes an approved normalized planning representation rather than raw CSV rows.

`district_travel.csv` is source-backed competition data. Its supplied source values must remain distinguishable from derived trip and route calculations.

An explicit source-data representation must exist and be available to the system before Phase 5 consumes district travel. That source representation preserves the supplied fields:

- `district`
- `depot`
- `road_class`
- `free_flow_kmh`
- `depot_to_district_km`
- `depot_to_district_freeflow_min`
- `inter_stop_km`
- `inter_stop_freeflow_min`

The source identity of a district-travel record is the composite `(depot, district)`. Depot and district remain separate source fields. District alone is not the source identity, and no fabricated source-id column is introduced.

### Approved source table

PostgreSQL persistence of this source representation is approved. The table is `district_travel_source`. The primary key is `(depot, district)`. This resolves the storage-representation gap. It is an explicit architecture-gap resolution and was not specified by Blueprint v1.4.

`district_travel_source` is source-backed competition data. It is not an application-domain entity, and it is not part of the application-domain entity inventory. A later explicit architecture decision is required before DistrictTravel is added to that inventory.

All eight physical columns are `TEXT`. No numeric precision or scale is imposed. The application `Depot` enum is not reused. No `road_class` enum, foreign key, UUID, or fabricated source id is added. Source tokens are preserved as supplied. Persistence does not convert units, derive travel values, or copy travel values onto Outlet, Vehicle, Order, Trip, or Route. No planning-specific field is added to the source table.

| Column | Type |
|---|---|
| `depot` | `TEXT` |
| `district` | `TEXT` |
| `road_class` | `TEXT` |
| `free_flow_kmh` | `TEXT` |
| `depot_to_district_km` | `TEXT` |
| `depot_to_district_freeflow_min` | `TEXT` |
| `inter_stop_km` | `TEXT` |
| `inter_stop_freeflow_min` | `TEXT` |

Travel values are not copied onto Trip or Route for convenience. This decision does not infer additional travel rules and does not implement Phase 5.

TASK-02-15 may later import this table through the existing TASK-02-11 importer. That is not a second CSV framework. `district_travel.csv` stays outside the normal three-file Hackathon runtime import path unless that path is separately approved. TASK-02-15 implements this destination and does not redefine it.

Phase 5 consumes a normalized planning representation derived from that approved source representation. It does not consume raw CSV rows or the Prisma source entity directly. The normalized planning object is not defined here. This does not create a second planning workflow, and this decision does not implement Phase 5.

The normalized planning representation exposes these calculation inputs:

- `depot_to_district_freeflow_min`
- `inter_stop_freeflow_min`
- `depot_to_district_km`
- `inter_stop_km`

No additional planning fields are created. Travel time and distance are not calculated from district names. Unit conversions that are not defined by the source or an approved task are not introduced. `road_class` and `free_flow_kmh` remain source fields. They are not planning inputs unless a later authoritative planning requirement explicitly requires them.
