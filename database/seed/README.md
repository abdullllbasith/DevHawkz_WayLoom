# database/seed

Development and test seed only. It does not run against production.

`npm run seed:scenario --workspace @wayloom/api` creates four active users and one submitted order after competition outlets, vehicles, and calendar rows are already imported.

Development login identifiers:

- `seed.dispatcher`
- `seed.loader`
- `seed.driver`
- `seed.store-manager`

The development password for each of those users is `wayloom-dev-only`. The database stores an Argon2id hash produced by the server password module. Each new hash has its own salt. The password is not a production credential.

The seed assigns application driver `seed.driver` to competition vehicles `VEH001` and `VEH035`. The same driver may be assigned to more than one vehicle. An existing assignment to `seed.driver` is left as it is. A different driver on either vehicle stops the seed. The seed does not change vehicle source fields. It also assigns `seed.store-manager` to competition outlet `OUT001` through one `user_outlets` row. That row is the Store Manager outlet scope. The order actor field does not replace it. No other outlet is assigned. The order uses competition outlet `OUT001`, operating calendar date `2026-06-02`, and delivery identifier `SEED-2026-06-02-OUT001`. That delivery identifier is a development seed identifier. It does not define the production delivery-id format.

Trips, loading, delivery, proof of delivery, receipts, deferrals, and exceptions are not seeded. The seed does not invent those records.

A repeated run does not insert duplicates. An existing `user_outlets` pair for `seed.store-manager` and `OUT001` is left as it is. The seeded order is left as it is when its delivery identity still matches and its status is `SUBMITTED` or a later approved status. The seed does not change that status. A different outlet, creator, quantity, date, or submission time still stops the seed without writing, as does a conflicting user or driver assignment.
