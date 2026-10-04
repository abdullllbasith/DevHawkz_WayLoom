# AI tool disclosure

WayLoom calls AI only through the server provider interface in `apps/api/src/ai/provider.ts`. The configured providers are `disabled` and `deterministic`. The deterministic provider restates approved input facts. It does not call an external model vendor.

`AI_PROVIDER_API_KEY`, when present, is read from server configuration and is not returned to the browser, written to client storage, or included in the safe provider log. No provider key is committed.
