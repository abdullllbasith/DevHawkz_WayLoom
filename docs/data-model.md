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
