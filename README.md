# Sori Bloom

A gentler way to be with your money. Built for adults with ADHD: one clear daily spending number, a little less mental bookkeeping, and room to begin again.

Sori Bloom is a distinct app in `Cozieapps/ADHDMONEYBUDGET`. It leaves the original Sori in `ADHDBUDGET` intact and reuses its tested money engine and sync protocol. The new interface, workflows, Android identity and Cloudflare resource names are separate.

## What it does

- **Today:** understandable safe-to-spend maths, upcoming commitments and a daily check-in.
- **Spending:** quick expense/income logging, categories, budgets and undo.
- **Plan ahead:** recurring bills and paydays, calendar, forecast and purchase scenarios.
- **Goals and debt:** savings progress, contributions, debt payoff strategies and a 48-hour pause list.
- **Companion:** private local pattern suggestions, optional free-tier Workers AI, and a passphrase/OAuth-protected MCP connector for compatible subscription clients.
- **Your pace:** pastel interface, reduced motion, hidden amounts, optional sound/haptics, quiet hours and opt-in notifications.
- **Your data:** offline local storage, explicit cloud sync, JSON backup and CSV export. A fresh personal setup starts empty; sample preview is clearly labelled.

ChatGPT and Claude subscriptions do not include general API credits. Sori does not pretend otherwise or turn on a paid API. Read [AI setup and limits](docs/AI.md) before enabling remote generation.

## Run locally

Use Node 22+ and npm 11+.

```bash
npm ci
npm run dev
```

For optional local sync:

```bash
# Put a unique development-only SORI_PASSPHRASE in apps/worker/.dev.vars.
# Never commit that file or use your production passphrase here.
npm -w apps/worker run db:migrate:local
npm run dev:worker
```

In managed cloud workspaces set writable Wrangler paths before local Worker commands:

```bash
export XDG_CONFIG_HOME=/workspace/.cloud-setup/config
export WRANGLER_LOG_PATH=/workspace/.cloud-setup/wrangler-logs
export WRANGLER_SEND_METRICS=false
mkdir -p "$XDG_CONFIG_HOME" "$WRANGLER_LOG_PATH"
```

The browser uses a separate `sori-bloom` IndexedDB database, not the original Sori's local data. To test against the local API, use the local API URL in Settings; production builds accept only HTTPS API addresses apart from loopback development.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm -w apps/web run test:e2e -- --workers=2
# Managed environment with an installed browser:
PW_CHROMIUM_PATH=/usr/bin/chromium npm -w apps/web run test:e2e -- --workers=2
```

## Install and deploy

- [Android tablet build and installation](docs/ANDROID.md)
- [Cloudflare Pages + Worker deployment](docs/DEPLOY.md)
- [AI modes, privacy and free allowances](docs/AI.md)

The Android app is a Capacitor Android package with a native shell, notifications, file sharing and haptics around the shared interface. Android local reminders can work while closed; browser notifications need the app open. OS restrictions can affect timing. This is a budgeting aid, not bank automation, a bank-balance guarantee or professional financial advice.

## Repository

```text
apps/web/       React interface, local IndexedDB and native integrations
apps/worker/    Personal sync API, D1/KV, optional AI and MCP
apps/android/   Android application (app.sori.bloom)
packages/core/  Pure TypeScript integer-cent budgeting engine and tests
scripts/        Reproducible Android and Cloudflare deployment commands
.github/        Verification, APK artifact and explicit deployment workflows
```

Start with [SPEC.md](SPEC.md), [CAPABILITIES.md](CAPABILITIES.md) and [tasks/plan.md](tasks/plan.md) for design choices and implementation scope.

## Review this build

The compiled Android APK, static Pages ZIP, screenshots and test reports are in `artifacts/`. [Verification and remaining prerequisites](docs/VERIFICATION.md) records exactly what was tested. Source changes have not been pushed to GitHub and no production Cloudflare resources were created. Repository files, local artifacts and saved environment setup are ready for review.
