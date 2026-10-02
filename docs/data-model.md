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

## Phase 2 competition-data representations

This section records the approved representation of every competition dataset inspected under `data/competition-import/`. Already implemented decisions stay in force. New table approvals below are explicit architecture-gap resolutions. Blueprint v1.4 did not specify these tables, identities, or `TEXT` columns. No Phase 5 normalized planning object is defined here.

Shared rules for every source table approved in this section:

- The table is source-backed competition data and is not an application-domain entity.
- Source tokens are stored as `TEXT`. No numeric precision or scale is imposed.
- No application enum is reused. No new enum, foreign key, UUID, or fabricated source-id column is added.
- Empty identity fields are not a source identity.
- Import uses the existing TASK-02-11 importer as a separate dataset command. That is not a second CSV framework.
- Phase 5 does not read raw CSV rows or the Prisma source entity. It later reads a normalized planning representation that this section does not define.

### Already implemented

| Dataset | Category | Identity | Destination | Runtime path |
|---|---|---|---|---|
| `outlets.csv` | Application-domain master data | `outlet_id` | `outlets` | Normal three-file Hackathon runtime import |
| `vehicles.csv` | Application-domain master data | `vehicle_id` | `vehicles` | Normal three-file Hackathon runtime import |
| `calendar.csv` | Source-backed competition data | `date` | `calendar_source` | Normal three-file Hackathon runtime import |
| `district_travel.csv` | Source-backed competition data | `(depot, district)` | `district_travel_source` | Separate import. Not on the three-file runtime path |

Outlet and vehicle column types remain the types already implemented for those domain tables. Calendar remains as already implemented, including `date` as a date. Those implemented types are not rewritten by the `TEXT` rule above.

### Service allowance source data

The supplied `service_allowance.csv` has 9 rows and the headers `brand`, `dock_type`, `service_allowance_min`. It has no identifier column. Each `(brand, dock_type)` pair appears once. No identity cell is blank. The approved trip-time formula addresses service allowance as `service_allowance_min(brand, dock_type)`.

The source identity is `(brand, dock_type)`. Brand alone is not the identity.

PostgreSQL table `service_allowance_source`. Primary key `(brand, dock_type)`. Columns, all `TEXT`:

- `brand`
- `dock_type`
- `service_allowance_min`

The application brand and dock enums are not reused. No foreign key is added to Outlet. The minute token stays text. No unit conversion is approved.

`service_allowance.csv` stays off the normal three-file Hackathon runtime import path unless that path is separately approved. TASK-02-16 implements this destination and does not redefine it.

Phase 5 trip time uses `service_allowance_min` for a brand and dock type through the later normalized planning representation. This section does not define that object.

### Traffic speed source data

The supplied `traffic_speed.csv` has 576 rows and the headers `district`, `hour`, `monsoon`, `speed_index`. It has no identifier column. Each `(district, hour, monsoon)` triple appears once. No cell is blank. Blueprint v1.4 keeps this file available for later or advanced planning and says the Hackathon MVP must not depend on it. The approved trip-time formula does not use it.

The source identity is `(district, hour, monsoon)`. That identity is an architecture-gap resolution from the supplied file. It was not specified by Blueprint v1.4. No foreign key is added to Outlet, calendar, or district travel. A matching district name or monsoon token does not approve a relationship.

PostgreSQL table `traffic_speed_source`. Primary key `(district, hour, monsoon)`. Columns, all `TEXT`:

- `district`
- `hour`
- `monsoon`
- `speed_index`

`traffic_speed.csv` is optional. It is not a normal Hackathon runtime import and not an MVP planning dependency. TASK-02-17 may import it through the existing importer when the file is present and this destination exists. A missing file does not fail Hackathon startup.

Phase 5 does not consume `speed_index` under the current approved formulas. Promoting it to a planning input remains deferred.

### Road conditions source data

The supplied `road_conditions.csv` has 10920 rows and the headers `district`, `date`, `disruption_index`. It has no identifier column. Each `(district, date)` pair appears once. No cell is blank. The date tokens run from `2024-01-01` through `2026-06-28`. That span matches the supplied calendar file. The match does not approve a foreign key to `calendar_source` or to Outlet. Blueprint v1.4 keeps this file available for later or advanced planning and says the Hackathon MVP must not depend on it. The approved trip-time formula does not use it.

The source identity is `(district, date)`. That identity is an architecture-gap resolution from the supplied file. It was not specified by Blueprint v1.4.

PostgreSQL table `road_conditions_source`. Primary key `(district, date)`. Columns, all `TEXT`:

- `district`
- `date`
- `disruption_index`

`road_conditions.csv` is optional. It is not a normal Hackathon runtime import and not an MVP planning dependency. TASK-02-17 may import it through the existing importer when the file is present and this destination exists. A missing file does not fail Hackathon startup.

Phase 5 does not consume `disruption_index` under the current approved formulas. Promoting it to a planning input remains deferred.

When `traffic_speed.csv` or `road_conditions.csv` is absent, Hackathon startup and the three-file runtime import continue and the optional import reports it skipped; when that dataset's own import runs, a malformed file, a duplicate source identity, or a conflict with an existing source row is reported, writes nothing, exits non-zero, is not treated as absence, and creates no fallback planning data.

### Deferred

The Phase 5 normalized planning object remains undefined. No unit conversion is approved for service allowance, traffic speed, or road conditions. Datathon training, test, and submission files stay isolated and are not given Hackathon source tables by this section.

## Data lineage

Competition CSV values are source inputs. A stored source-backed row represents those values. A derived value is calculated later from source data or application state. An operational row is created by a WayLoom workflow. A derived or operational value does not replace the stored source value.

Planning may read source-backed data later. A planning run does not update Outlet, Vehicle, `calendar_source`, `district_travel_source`, `service_allowance_source`, `traffic_speed_source`, or `road_conditions_source`. Planning outputs stay on operational records. The planning engine is not implemented in this section.

Imported competition source records are read-only through the WayLoom application unless a future approved requirement explicitly authorizes editing. Corrections to source values occur through the authoritative source dataset and import process. Imports must not silently overwrite conflicting persisted source values.

### Competition datasets

| Dataset | Destination | Role | Runtime |
|---|---|---|---|
| `outlets.csv` | `outlets` | Source-backed application master data | Three-file Hackathon runtime import |
| `vehicles.csv` | `vehicles` | Source-backed application master data | Three-file Hackathon runtime import |
| `calendar.csv` | `calendar_source` | Source-backed competition data | Three-file Hackathon runtime import |
| `district_travel.csv` | `district_travel_source` | Source-backed additional competition data | Separate import |
| `service_allowance.csv` | `service_allowance_source` | Source-backed additional competition data | Separate import |
| `traffic_speed.csv` | `traffic_speed_source` | Optional source-backed competition data | Separate import. Absence does not fail startup |
| `road_conditions.csv` | `road_conditions_source` | Optional source-backed competition data | Separate import. Absence does not fail startup |

Datathon training, test, and submission files have no destination table and are not on any import path.

Outlet import stores the supplied outlet fields. The internal `id` is a generated UUID and is not a source identifier. `created_at` and `updated_at` are application timestamps. Clock times are stored as time values. Enum tokens must match the approved outlet enums. No derived outlet field is created.

Vehicle import stores the supplied vehicle fields, including `fuel_type`, `km_per_l`, and `weekly_fuel_quota_l`. Those are source properties. Calculated fuel use is not a vehicle column and is not written by import. `driver_user_id` is an application assignment. It is not a `vehicles.csv` column, and import leaves it empty. The internal `id` is a generated UUID.

Calendar import stores the supplied calendar fields on `calendar_source`. `date` is a date. Flag and calendar-number fields are stored as integers. `festival` and `festival_ramp` stay text. The row is not a demand forecast or a planning result.

District-travel, service-allowance, traffic-speed, and road-conditions imports store the supplied tokens as text. They do not copy those values onto Outlet, Vehicle, Order, Trip, or TripStop. `service_allowance_min` stays the source allowance. It is not an observed execution time. `depot_to_district_km`, `inter_stop_km`, and the freeflow minute fields stay source inputs. They are not calculated trip distance or trip duration.

A repeated import of the same source values inserts nothing. A conflicting source value is reported and does not overwrite the stored row.

### Domain records

| Record | Lineage |
|---|---|
| User | Application identity. Not a competition-dataset identity. |
| Outlet | Source-backed master data from `outlets.csv`. |
| Vehicle | Source-backed master data from `vehicles.csv`. Driver assignment is application-owned. |
| Order | Operational. Master-data import does not create orders. |
| Trip and TripStop | Planning and allocation results. Not source CSV rows. |
| LoadingRecord | Loading execution. |
| DeliveryRecord | Delivery execution. |
| ProofOfDelivery | Delivery evidence. |
| Deferral | Planning or business outcome. |
| Exception | Operational issue. |
| Receipt | Store Manager receipt confirmation. |
| SyncEvent | Synchronization processing. Not the source of the business record. |
| AuditEvent | Selected system, security, or domain history. Not a copy of the database. |

### Derived values

These values are calculated later. They are not competition source fields, and they are not stored as source columns:

- planning eligibility from submission time and cutoff;
- trip duration from the approved travel and service-allowance inputs;
- fuel use from trip distance and `km_per_l`;
- capacity utilization from assigned orders;
- a deferral reason from planning feasibility;
- operational status from the domain workflow.

The Phase 5 normalized planning object that would carry the travel and service inputs is still undefined. Traffic speed and road conditions are not inputs to the current trip-time or fuel formulas.

## Server-managed sessions

Authentication stays server-managed. The browser receives only an opaque session identifier in the server-managed authentication cookie. That raw identifier is not stored in PostgreSQL. The database stores only a cryptographic hash of it. Authentication tokens are not stored in `localStorage` or `IndexedDB`. JWT and localStorage authentication are not used.

This representation is implemented by the server session module. Login and logout use it. They do not define middleware or role checks.

PostgreSQL table `sessions`:

| Column | Representation |
|---|---|
| `id` | UUID primary key |
| `user_id` | UUID foreign key to `users` |
| `session_token_hash` | Cryptographic hash of the opaque session identifier |
| `expires_at` | Session expiry |
| `created_at` | Creation time |
| `revoked_at` | Nullable. Set when the session is revoked |
| `last_seen_at` | Last time the session was seen |

A session with `revoked_at` set, or a session past `expires_at`, must not authenticate a request. Revocation is recorded in `revoked_at`.

The server session lifetime is exactly 12 hours from `created_at`. `expires_at` is `created_at` plus 12 hours. `last_seen_at` does not extend `expires_at`. The session cookie `Max-Age` is 43200 seconds, the same 12 hours. After `expires_at`, the server rejects the session even if the browser still sends the cookie.

The session cookie name is `wayloom_session`. It is `HttpOnly`, `Path=/`, and `Secure` when the API runs in production. The cookie value is the opaque session identifier. The server stores only the SHA-256 hash of that identifier. The session cookie `SameSite` value is `Strict`. `SameSite=Strict` does not replace the later CSRF protection for cookie-authenticated state-changing requests.

## Store Manager outlet authorization

A Store Manager's outlet scope is the dedicated assignment table `user_outlets`. One Store Manager may be assigned to one or more outlets. The table and the object checks exist. They do not add order, trip, loading, or receipt APIs.

PostgreSQL table `user_outlets`:

| Column | Representation |
|---|---|
| `id` | UUID primary key |
| `user_id` | UUID foreign key to `users` |
| `outlet_id` | UUID foreign key to `outlets` |

`user_id` and `outlet_id` are required. Both foreign keys use `ON DELETE RESTRICT`, the same referential action as the other application foreign keys. The pair `(user_id, outlet_id)` is unique, so the same user and outlet cannot be assigned twice.

Store Manager object authorization must use this assignment. `orders.created_by_user_id` remains the actor who created the order. `receipts.store_manager_user_id` remains the actor who confirmed the receipt. Neither field authorizes a Store Manager for an outlet. `loading_records.loader_user_id`, `vehicles.driver_user_id`, and `delivery_records.driver_user_id` stay the loader and driver assignment fields.
