# database/seed

Development and test seed only. It does not run against production.

`npm run seed:scenario --workspace @wayloom/api` creates four active users and one submitted order after competition outlets, vehicles, and calendar rows are already imported.

Development login identifiers:

- `seed.dispatcher`
- `seed.loader`
- `seed.driver`
- `seed.store-manager`

The development password for each of those users is `wayloom-dev-only`. The database stores an Argon2id hash. The password is not a production credential.

The seed assigns application driver `seed.driver` to competition vehicle `VEH001`. It does not change vehicle source fields. The order uses competition outlet `OUT001`, operating calendar date `2026-06-02`, and delivery identifier `SEED-2026-06-02-OUT001`. That delivery identifier is a development seed identifier. It does not define the production delivery-id format.

Trips, loading, delivery, proof of delivery, receipts, deferrals, and exceptions are not seeded. The planning engine is not implemented, so those records are not invented here.

A repeated run does not insert duplicates. A conflicting existing user, driver assignment, or order stops the seed without writing.
