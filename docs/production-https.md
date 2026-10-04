# Production transport and browser security

The API keeps server-managed sessions. Production cookies are `HttpOnly`, `SameSite=Strict`, and `Secure`. Development and test cookies stay `HttpOnly` and `SameSite=Strict` without `Secure`, because local HTTP cannot carry a Secure cookie. There is no JWT and no session token in `localStorage` or IndexedDB.

CSRF stays on cookie-authenticated state changes through `x-wayloom-csrf`. Authorization stays on the server. Production `WEB_ORIGIN` must be one HTTPS origin and cannot be a loopback address. An omitted origin sends no CORS headers. The API does not copy the request `Origin`.

`WEB_HTTPS=true` adds `Strict-Transport-Security` in production only, without `includeSubDomains` or `preload`. The application does not redirect HTTP to HTTPS. TLS termination is a deployment responsibility in front of the published ports. Setting `WEB_HTTPS` is how that deployment tells the API that the browser origin is HTTPS. An HTTP production origin is rejected rather than accepted as a fallback.

Every API response sets `nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, a closed permissions policy, and a document policy of `default-src 'none'`. Responses other than `GET /health` use `Cache-Control: no-store`. The frontend production CSP does not include `unsafe-eval`. Health responses do not include credentials, connection strings, or stack traces.
