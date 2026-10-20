# Implementation plan

1. Reuse tested money engine and offline repository, isolated database. Verify existing tests.
2. New Today/dashboard, navigation, setup and quick log; persistence and undo tests.
3. In parallel: money planning screens, Worker/free AI and security, Android/Cloudflare delivery.
4. Integrate coaching, settings, reminders, backup and offline shell.
5. Browser flows, accessibility, phone/tablet screenshots, Worker tests, Android build; resolve defects.
6. Document verified commands, deployment prerequisites, build artifacts and external blockers.

Risks: consumer subscriptions lack general API access (MCP/copy context as supported paths); free AI quota (opt-in, cap and graceful local fallback); deployment credentials (do all local work before reporting blocker); native Android is a Capacitor app with native integrations, not a Kotlin rewrite.
