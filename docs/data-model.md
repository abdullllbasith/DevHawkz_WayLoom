# Data model

Entity definitions, migrations, and relationship documentation belong to later database tasks. The identifier convention below is decided.

## Persisted entity identifiers

WayLoom uses UUIDs as the internal primary identifiers for persisted domain entities in PostgreSQL.

### Internal entity identity

The primary key of a persisted domain entity is a UUID. That UUID is the internal database identity.

### Business and source identifiers

Business identifiers and competition/source identifiers remain separate fields. Examples include `outlet_id`, `order_number`, route/source identifiers, and other identifiers supplied by competition datasets. Those values are not replaced by the internal UUID.

### Planning determinism

UUIDs are not planning-ordering fields and are not deterministic tie-breaking fields. Planning and allocation ordering uses explicitly defined deterministic domain or business fields. The planning algorithm does not use random UUID generation or UUID ordering.

### Scope

This convention applies to persisted domain entities unless a later authoritative architecture decision explicitly defines an exception.
