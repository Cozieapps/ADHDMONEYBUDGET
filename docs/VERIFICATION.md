# Sori Bloom verification

Sori Bloom lives in `Cozieapps/ADHDMONEYBUDGET`. The original `ADHDBUDGET` and `Agent-Skills` checkouts were left unchanged.

## Verified in the development environment

- Node 24.19.0, npm 11.9.0; the repository supports Node22+.
- Frozen installation, local D1 migrations, production web build, strict TypeScript checks and ESLint passed. The combined reusable installation script was executed successfully for both app repositories.
- **170 unit/integration/security tests passed**: 112 core, 23 web/platform, 35 Worker. Tests cover integer-cent arithmetic, recurring dates, forecasting, goal/debt operations, AI/auth request caps, record validation, preview isolation, sync failures and backups.
- **18 Playwright tests passed** across phone and tablet, with no skips, flaky passes or unexpected failures. Critical flows include onboarding, exact daily-number updates, save/undo/remove/reload, envelopes, paid bills, goals, pause list, debt, forecast scenarios, local companion, backup restore/rejection and privacy preferences.
- **20 axe screen scans passed** with zero violations in the selected checks and zero uncaught page errors. Layouts were checked at 320, 768, 1024 and 1440px without horizontal overflow. Closed mobile navigation is excluded from keyboard focus, dialogs support Escape, and the open drawer traps focus.
- Real service-worker offline reload and expense logging passed on phone and tablet. Only public app assets are cached; API responses are excluded.
- Live local Worker requests passed D1 health, passphrase sign-in, authenticated sync, OAuth discovery, MCP authentication guard and explicit AI-disabled response.
- Android debug APK compiled, passed Android signature verification and exposes package `app.sori.bloom`, label `Sori Bloom`, minAPI29/Android10 and targetAPI36. System backup is disabled. The APK embeds the same hashed web assets used by the final browser tests.

## Review artifacts

- `artifacts/sori-bloom-debug.apk`:signed installable personal-test Android package.
- `artifacts/sori-bloom-debug.apk.sha256`:checksum of the current package.
- `artifacts/sori-bloom-web.zip`:static web bundle, with files at ZIP root for Cloudflare Pages direct upload. This contains the local-first app; deploy the separate Worker for sync/MCP/AI.
- `artifacts/sori-dashboard-tablet.png` and `sori-dashboard-phone.png`:full sample-budget screenshots. Viewport-only variants and onboarding screenshots are also included. Sample data never enters a new personal budget.
- `artifacts/browser-results.json` and `browser-audit.json`:machine-readable final browser results.
- `artifacts/npm-audit.json`:zero high/critical findings; three moderate findings in the Capacitor CLI’s transitive iOS/Xcode/uuid toolchain, with no upstream fix reported. They are not browser runtime dependencies. No verification was disabled.

## What still requires an external account or device

No public Cloudflare URL has been deployed. The machine has no authenticated Cloudflare account. Deployment prerequisites are saved in environment settings: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and `SORI_PASSPHRASE`. The draft includes `api.cloudflare.com`; enter credentials securely, review/save settings and publish the environment. See [DEPLOY.md](DEPLOY.md) for scoped permissions and the prepared deployment workflow. Saving configuration does not run deployment.

Generative Workers AI and a consumer Claude/ChatGPT connector session have not been exercised against a live account. AI is off by default; local guidance and calculations require no paid API. The opt-in AI endpoint has a global daily cap and small fixed model/output limit, but an app cannot enforce account-wide Cloudflare billing controls. Use the Workers Free plan and do not enable paid upgrades.

The APK was compiled and inspected, not installed on a physical tablet. Notification timing, OS battery restrictions, haptics and native share-sheet behavior need review on that tablet. Debug signing is for personal testing; use a stable private release key for long-term update signing, as described in [ANDROID.md](ANDROID.md).

The initial web bundle triggers a nonblocking size notice. It remains usable offline after the initial load; all code/fonts are served locally. The app does not connect to banks or move real money. Records and forecasts reflect what the owner enters.
