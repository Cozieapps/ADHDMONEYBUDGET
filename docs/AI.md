# Sori's companion: free choices and their limits

Sori's calculations, reminders, charts, pattern observations and quick logging run without an AI service or an API key. Those deterministic features keep working offline. Local coaching is labelled as local; it is not presented as generated AI.

## Optional chat inside Sori: Cloudflare Workers AI

The `POST /api/coach` endpoint accepts an authenticated device token, a question and a small summary of the current budget. It is disabled by default. To enable it in production:

1. Keep the Cloudflare account on **Workers Free**. Cloudflare documents 10,000 free neurons per day; exceeding the allocation on Workers Free fails instead of continuing with paid usage. Upgrading the account changes that billing behavior. Sori cannot inspect or enforce your account plan.
2. Apply all D1 migrations, including `0002_coach_usage.sql` and `0003_auth_attempts.sql`.
3. Add `"ai": { "binding": "AI" }` to the deployment's Wrangler configuration and set the nonsecret Worker variable `SORI_AI_ENABLED` to the string `"true"`. The separate opt-in switch is required even with a binding present. Local Wrangler configuration intentionally omits the AI binding, because Workers AI inference uses Cloudflare's service rather than a local model.
4. Deploy, connect the app to the Worker in Settings, and explicitly select cloud AI in the companion. `/api/health` reports `aiAvailable: true` only when both server requirements are present.

The app pins `@cf/meta/llama-3.2-3b-instruct` (listed by Cloudflare as free-allocation eligible), 384 output tokens per question, a 600-character question, a strictly shaped financial summary and an 8 KiB request limit. It has no paid-model selector, external API key, background AI polling, or automatic retry.

A per-device local attempt counter prevents repeated network calls after ten attempts. An atomic D1 statement enforces **10 attempted cloud questions per UTC day for the entire deployment**, shared across devices. D1 is used because KV is eventually consistent and cannot enforce a strict concurrent budget. Errors after the reservation count as attempts, since the model may have consumed resources. The next reset is midnight UTC. Only anonymous daily counts are retained in this table; count rows older than two days are deleted on the next valid question (the short overlap protects requests in flight at midnight). This is an application safeguard, not a Cloudflare account-wide spending control; other applications on your account consume their own allowance.

### What is sent

After explicit opt-in, the helper sends your question and these numeric values: available balance, safe-to-spend estimate, bills/debt due before payday, safety buffer, days until payday, whether a payday is known, current-month spending/income, total goal savings and total debt. The summary includes the currency. It excludes your name, account names, merchant descriptions, transaction notes and the full ledger. Your question may itself contain personal information, so keep it to what you want Cloudflare's model to process.

Sori's Worker does not save chat content or generated replies. Cloudflare processes inference according to its service terms. The normal passphrase/sync setup remains a separate opt-in that stores your ledger in your own D1 database.

### What it can do

The cloud endpoint can reply with budgeting suggestions. It cannot write records, execute commands, move money, browse your bank, send notifications, or schedule jobs. Its output is untrusted plain text and must be rendered as text, never HTML. A request like “log 12 for lunch” gets advice to use the app's Log action; the owner saves and can undo the entry. Model wording is not proof that an action happened.

Authentication is checked before input handling, quota use and model invocation. Invalid requests do not consume a call. Invalid external model responses, missing bindings, the daily limit and provider errors produce explicit errors and leave local coaching available. Vendor error details are not exposed in responses or logs.

## Using an existing Claude or ChatGPT subscription

A consumer subscription is **not** an API key and does not fund arbitrary in-app API calls. Sori never asks you to paste a Claude/ChatGPT API key or subscription session cookie.

The existing authenticated remote MCP endpoint is `/mcp`, with OAuth discovery, dynamic client registration and owner-passphrase consent. Add it as a connector only in a host and plan that currently support custom remote MCP connectors. Feature availability and host permissions can change; connection from a particular ChatGPT/Claude plan has not been tested here. The MCP tools can read your budget and, after the host grants permission and you ask it to, log/update records. Such writes are marked `source: claude` for attribution and can be removed in the app. They are separate from the chat-only cloud endpoint.

If custom connectors are unavailable on your subscription, copy your budget summary from Sori and discuss it in your normal chat. This does not create automatic sync or background monitoring; save any resulting plan changes explicitly in Sori.

## Verification

Worker integration tests exercise the real local D1 database and stub only the external model binding. They cover unauthorized calls, disabled cloud AI, malformed/oversized input, concurrent requests (exactly ten accepted), fixed model/token cap, absence of ledger writes, malformed model output and redacted provider failures. Live inference requires the deployment account and was not claimed as validated by these tests.

## Official sources checked

Cloudflare's official documentation source was read from its public repository:

- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) — Free versus Paid allocation and current model pricing. [Source](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers-ai/platform/pricing.mdx)
- [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/) — `ai.binding` and `env.AI.run(model, input)`. [Source](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers-ai/configuration/bindings.mdx)

Recheck pricing and your account plan before changing the fixed model, output cap, daily limit or deployment billing plan.

## Record and preview safety

Sample previews use a separate IndexedDB database and cannot connect sync, use a personal cloud token, call cloud AI or change the personal server URL. Connection storage uses `sori.bloom.*` names to stay separate from the original app. Sync validates real dates, integer-cent amounts, metadata identities and complete record shapes before accepting data, and keeps pending local edits if a response is malformed. Responses arriving after a disconnect are discarded. Backup restores validate every record before replacing local data; CSV exports neutralize formula-leading user text.

Sign-in attempts share an atomic D1 budget of ten attempts per fixed 15-minute window across devices/isolates for each hashed client address. Raw IP addresses are not stored in that table; expired windows are pruned on subsequent attempts. The sign-in budget is separate from the cloud-chat budget.
