# TASK-13-06 — Offline Security Test

**Review result:** PASS

Web tests: 80 passed, including the offline suite.

IndexedDB stores the driver route cache and pending delivery events. The store rejects `sessionToken` and the other forbidden keys: password, password hash, CSRF token, cookie, and database URL. Logout does not delete pending events. A pending event is not a server confirmation.

Replay uses `client_event_id`. A repeat is `already applied`. An unauthorized or conflicting event is rejected and does not become the delivery. The server still checks the driver assignment.
