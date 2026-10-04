# AI governance

These rules apply before any provider is called. They do not add a role, a permission, or an API.

## Authority

Hard planning constraints and order transitions stay in the deterministic planning and domain modules. AI output is advisory. A recommendation is applied only when an existing role uses an existing workflow. Authorization is not delegated to the model.

Forbidden model actions:

- override a hard constraint or invent a deferral reason
- write or reassign an order, trip, vehicle, load, delivery, proof, or receipt
- bypass an authorization check
- invent an operational fact
- block a core transaction when the provider is down

## Data

Send the versioned input contract only. Do not send credentials, session cookies, CSRF tokens, or provider secrets. Prompt text and provider configuration stay in version control without a secret. The browser never receives a provider key.

## Validation and fallback

Every model response passes the output contract before display. Unknown fields, instructions, and malformed output are rejected. Provider unavailable, timeout, rate limit, and invalid output fall back to the supplied facts. The fallback does not change business state.

## Audit

A material recommendation records the actor, time, use case, provider reference, contract version, validation result, and a safe summary. It does not record secrets. A human acceptance, rejection, or ignore stays a separate decision. An audit write failure is not reported as a successful assisted action, and it does not mutate a protected record.

Human-readable text is not a verified fact. Source facts in the input remain the verified part.
