# Deploy on Cloudflare's free plan

There are two distinct services: a static web app on **Pages**, and a **Worker** for optional personal sync, MCP and opt-in AI. You can use the app locally with no account, bank connection or AI key. Deployment requires your own Cloudflare authorization. This development machine currently has no Cloudflare authentication, so no production URL has been created or verified.

## Recommended full deployment

1. In Cloudflare choose the **Workers Free** plan. Choose a workers.dev subdomain if Cloudflare asks. Do not enable paid plans or automatic upgrades. Other services on your account share the free allowances; the application cannot enforce an account-wide bill limit.
2. Create an API token scoped to your account with Workers Scripts edit, Workers KV edit, D1 edit, Pages edit, and the account read access Wrangler needs. The **Edit Cloudflare Workers** template plus D1 and Pages permissions is a useful starting point.
3. In this GitHub repository, securely add Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `SORI_PASSPHRASE` (a long unique passphrase, at least 16 characters). Never paste these into source files or public build variables.
4. Run **Deploy Sori Bloom** in GitHub Actions. Leave cloud AI disabled unless you have reviewed [AI.md](AI.md). The workflow tests first, creates separate `sori-bloom` D1 and `sori-bloom-oauth` KV resources, applies migrations, deploys `sori-bloom-api`, sets the passphrase and deploys Pages project `sori-bloom`.
5. The workflow summary prints the web, API and MCP addresses. In Sori's Settings connect the device with the passphrase. The API address is already included in this deployed web build.

The script preserves the original Sori's resources. If `sori-bloom` is already used for another Pages app in your account, set GitHub variable `SORI_PAGES_PROJECT` to an unused name. `SORI_API_URL` optionally supplies the HTTPS custom API address if Wrangler cannot determine it.

For a local authenticated deployment, export the same three secrets into the process through your secure environment, then run `npm run deploy`. The script rejects missing credentials before creating anything. Never put credentials on command lines or commit `.dev.vars`.

## If using the Cloudflare repository screen in your reference

For the screenshot's **Workers** repository import, use build command `npm run build` and deploy command `npx wrangler deploy`. The root `wrangler.jsonc` serves the compiled static app with SPA routing. This is a web-only option; personal budgeting and local suggestions work, and you can connect a separately deployed API in Settings. Do not use `wrangler preview`: use `npm run dev` locally or Cloudflare's deployment preview.

For **Pages** repository import, use build command `npm run build`, build output `apps/web/dist`, and repository root `/`. Pages does not need a deploy command. Connecting the API requires a separately deployed Worker; the full deployment workflow above handles both services for you.

## Offline and privacy

The public shell service worker caches static assets and the latest navigation document; private API responses are excluded. Financial records stay in IndexedDB until you deliberately enable sync. The app uses no advertising or analytics. Its static security headers restrict framing, scripts, devices and data sources. Offline edits are queued and synced after reconnecting. Backup files contain personal financial data; store them privately.

## Free AI

Consumer ChatGPT/Claude subscriptions are not API credits. The default app uses deterministic local suggestions without any AI bill. Optional remote MCP allows compatible subscription clients to use the personal Worker. Optional Workers AI is explicitly enabled by a separate deployment switch, restricted to a small model, response budget and global daily request cap; see [AI.md](AI.md). No feature turns on paid APIs automatically.

## Updates and rollback

Run verification before deploying updates. Rerunning the deployment script reuses the named resources and applies pending migrations without clearing data. Pages keeps previous deployments, which can be promoted in its dashboard; Worker versions can be rolled back in Cloudflare's dashboard. Schema rollback must be considered separately; export data before database changes. Updating a deployed API does not update an APK: rebuild and install the Android app for interface changes.
