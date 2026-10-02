# apps/web

WayLoom Next.js + TypeScript frontend.

This task initializes the application foundation only. Role screens, navigation, authentication, and API calls are not implemented.

## Routing

The App Router (`app/`) is the routing convention. The repository had no earlier Next.js router. Role routes are not part of this foundation.

## Commands

From the repository root:

```text
npm run dev --workspace @wayloom/web
npm run typecheck --workspace @wayloom/web
npm run build --workspace @wayloom/web
```

`npm run dev` at the repository root starts this frontend only. The API and planning service are not started.

## Configuration

Environment values come from the repository root `.env` / `.env.example`. Do not hard-code an API address in this application. No API client is configured.

Document responses get a per-request Content-Security-Policy nonce through `proxy.ts`. Next.js requires that nonce, and dynamic rendering, for its inline bootstrap script. `unsafe-eval` is present only while `NODE_ENV` is `development` or `test`, because the Next.js development server uses it. Production CSP does not include `unsafe-eval`, `blob:`, or `data:`. `API_ORIGIN` is added to `connect-src` when set; development and test default that value to `http://127.0.0.1:4000`. HSTS is added only when `NODE_ENV` is `production` and `WEB_HTTPS` is `true`. Static responses receive `nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, and a closed camera, microphone, geolocation, and payment policy. `X-Powered-By` is disabled. No production domain is hard-coded.
