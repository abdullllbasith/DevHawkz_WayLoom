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
