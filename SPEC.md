# Sori Bloom

## Objective

A calm budget companion for adult women with ADHD. One useful next step, no guilt, transparent maths, private local-first data. Fresh installations start empty. An explicitly labelled sample preview is separate from personal data.

## Design contract

Warm ivory canvas, ink-green typography, mint primary controls, blush/peach/lilac accents. Editorial serif headings paired with a legible sans. Tablet-first side rail, mobile bottom navigation. Today prioritises a safe daily allowance, one gentle next step, upcoming commitments and an actionable balance forecast. Never substitute a static marketing screenshot for working UI. Optional simple mode, reduced motion, hidden amounts, sound off by default. Accessible forms, native focus-trapped dialogs, 44px targets, keyboard access, readable contrast.

## Stack and structure

React/TypeScript + Vite in apps/web; tested integer-cent calculations in packages/core; Dexie IndexedDB; Cloudflare Worker/D1/KV plus MCP in apps/worker; Capacitor Android shell in apps/android. Reuse existing tested domain logic from the sibling repository while creating new product UI. Local app data uses a distinct database.

## Commands

npm ci; npm run dev; npm run dev:worker; npm test; npm run typecheck; npm run lint; npm run build; npm -w apps/web run test:e2e -- --workers=2; npm run android:apk.

## Success criteria

- Fresh onboarding records name, currency, available balance and optional payday; no sample data silently enters the personal ledger.
- Create, undo and remove spending/income; choose accounts and categories. Reopening retains data. Money arithmetic uses cents.
- Set recurring bills/paychecks, mark paid, inspect calendar and 30/60/90 day forecasts with purchase scenario.
- Set category budgets, savings goals, contributions, debt strategy/extra payments and 48-hour pause list. Data drives charts.
- Local coaching explains observed patterns; AI mode clearly distinguishes remote generation. Free AI quota is capped locally and server-side; no paid API keys. Any AI suggested write requires an explicit user save. MCP exposes controlled tools via OAuth/passphrase.
- Quiet hours and reminder preferences; native Android local notifications while closed, browser notifications only while open. User-initiated permission requests. Free synthesised sounds.
- Offline app shell and local data. JSON backup and CSV export. Explicit sync connection and visible failures.
- Build web bundle, run relevant unit/integration/browser/accessibility checks, attempt Android APK build and Cloudflare connectivity; report external blockers honestly.

## Tests and style

Vitest for calculations and Worker security, Playwright/axe for critical browser flows and tablet/phone layouts. Strict TypeScript, named React components, semantic tokens, small composable components. Example: const safe = safeToSpend(snapshot, today); display integer-cent values using Intl.NumberFormat.

## Boundaries

Always validate monetary and date inputs; preserve original app; show AI/service errors; maintain free-tier safeguards. User authorized schemas, dependencies, CI and implementation decisions for this new repository. Never commit secrets, disable verification, claim subscription API access, deploy using invented credentials or silently mutate records from AI text. No bank integration or payment execution.

## External prerequisites

Cloudflare deployment needs account authentication not currently configured. Android SDK availability will be investigated. Publishing and device install can only be claimed after actual completion.
