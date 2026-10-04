# AI tool disclosure

WayLoom calls AI only through the server provider interface in `apps/api/src/ai/provider.ts`. The configured providers are `disabled`, `deterministic`, and `openrouter`. The deterministic provider restates approved input facts and does not call an external model vendor. The OpenRouter provider sends those facts to `https://openrouter.ai/api/v1/chat/completions` with model `google/gemini-2.5-flash-lite`, then passes the reply through the existing output schema. A failed call returns an existing unavailable or degraded result.

`AI_PROVIDER_API_KEY`, when present, is read from server configuration and is not returned to the browser, written to client storage, read by the web app, or included in the safe provider log. No provider key is committed. There is no `AI_MODEL` variable.
