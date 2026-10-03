# packages/planning

Shared TypeScript planning contract, version `1`.

This package is not the planning engine. Python planning execution stays in `services/planning/`. The engine does not authenticate, authorize, read Prisma or PostgreSQL, or persist trips, stops, deferrals, or order status.

The input carries orders, outlets, vehicles, the planning-date calendar row, district-travel components, and service allowances. Traffic speed and road conditions are not consumed. `road_class` and `free_flow_kmh` are not planning inputs. Driver assignment is not a planning field.

Weight is kilograms, volume is cubic metres, distance is kilometres, time is minutes, and fuel is litres. Trip time uses `depot_to_district_freeflow_min + inter_stop_freeflow_min * (orders - 1) + sum(service_allowance_min(brand, dock_type))`. Fuel uses `trip_distance_km / km_per_l`. Trip distance is `depot_to_district_km + inter_stop_km * (number_of_stops - 1)`. Existing weekly fuel is a derived litre input. There is no approved sum of historical trips, and a missing value is invalid. The existing trip count is the count of committed Trip records for that vehicle and operational date. Zero uses trip 1, one uses trip 2, and two adds no candidate. A missing count is not zero.

The cutoff clock is `16:00:00` in `Asia/Colombo` (UTC+05:30). The official Challenge Booklet states that competition dates and times use Sri Lanka time. `classifyCutoff` compares `submitted_at` with that clock on the calendar day before the delivery day. `submitted_at < cutoff_at` is eligible for the next run, and `submitted_at >= cutoff_at` waits for the following run. The result is not stored and is not a deferral.

Deferral reasons stay `NO_CAPACITY`, `NO_REEFER`, `VAN_ACCESS`, `WINDOW_CONFLICT`, `DEPOT_MISMATCH`, and `TIME_BUDGET`. A weekly fuel failure is the `weekly_fuel` constraint with no deferral reason. The Dispatcher confirms a result. AI does not override a hard constraint.

Scenario fixtures in this package are test inputs. They are not production seed data. `validatePlanningInput` checks that payload and does not allocate orders or calculate fuel. `evaluateFeasibility` checks one supplied candidate against the hard constraints. `calculateTripTime` is the only trip-minute formula. No operational minute cap is applied, so feasibility still marks that constraint withheld. `validateWeeklyFuel` is the only fuel division. It still receives a trip distance and does not yet apply the approved distance formula. A division remainder is raised at six decimal places so fuel is not understated. Fuel has no deferral reason. `generateCandidates` builds feasible options from cutoff-eligible orders. It applies the approved trip distance before fuel validation and uses the supplied committed trip count. It does not choose the final plan.
