# Sori Bloom capability map

| Module           | Responsibility                                                                       | Depends on                  |
| ---------------- | ------------------------------------------------------------------------------------ | --------------------------- |
| money-engine     | Integer-cent arithmetic, recurring dates, balances, safe to spend, forecasting, debt | —                           |
| local-store      | IndexedDB records, undo, personal settings, backups                                  | money-engine                |
| daily-experience | Setup, Today, logging, spending, calendar, goals, debt, insights                     | local-store                 |
| companion        | Local pattern coaching, opt-in free Workers AI, subscription MCP                     | local-store                 |
| delivery         | Offline web, Android shell, native reminders, Cloudflare deployment                  | daily-experience, companion |

Build order: money-engine → local-store → daily-experience / companion → delivery.
The user explicitly authorized every phase without approval gates. Keep the previous ADHDBUDGET app unchanged. All original calculations are reused with their tests; the product interface is newly designed.
