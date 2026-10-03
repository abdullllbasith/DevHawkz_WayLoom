# packages/planning

Shared TypeScript planning contract, version `1`.

This package is not the planning engine. Python planning execution stays in `services/planning/`. The engine does not authenticate, authorize, read Prisma or PostgreSQL, or persist trips, stops, deferrals, or order status.

The input carries orders, outlets, vehicles, the planning-date calendar row, district-travel components, and service allowances. Traffic speed and road conditions are not consumed. `road_class` and `free_flow_kmh` are not planning inputs. Driver assignment is not a planning field.

Weight is kilograms, volume is cubic metres, distance is kilometres, time is minutes, and fuel is litres. Trip time uses `depot_to_district_freeflow_min + inter_stop_freeflow_min * (orders - 1) + sum(service_allowance_min(brand, dock_type))`. Fuel uses `trip_distance_km / km_per_l`. The composition of `trip_distance_km` from `depot_to_district_km` and `inter_stop_km` is not approved, so a result omits fuel until a distance is supplied. Existing weekly fuel is a derived litre input. There is no approved sum of historical trips, and a missing value is invalid.

The cutoff clock is `16:00:00`. `submitted_at < cutoff_at` is eligible for the next run, and `submitted_at >= cutoff_at` waits for the following run. The operational timezone is not approved, so the contract stores `timeZone: null` and does not classify eligibility.

Deferral reasons stay `NO_CAPACITY`, `NO_REEFER`, `VAN_ACCESS`, `WINDOW_CONFLICT`, `DEPOT_MISMATCH`, and `TIME_BUDGET`. A weekly fuel failure is the `weekly_fuel` constraint with no deferral reason. The Dispatcher confirms a result. AI does not override a hard constraint.

Scenario fixtures in this package are test inputs. They are not production seed data. `validatePlanningInput` checks that payload and does not allocate orders or calculate fuel. `evaluateFeasibility` checks one supplied candidate against the hard constraints. `calculateTripTime` is the only trip-minute formula. No operational minute cap is applied, so feasibility still marks that constraint withheld.
