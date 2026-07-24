# Mileage Tracker Pro (FleetLog)

Fleet mileage tracking: pulls GPS movement from One-Step GPS, lets drivers log sessions, managers annotate/finalize monthly periods, and emails daily accountability alerts when a truck moves without a complete log.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

### Environment variables

Required:
- `DATABASE_URL` — Postgres connection string
- `ONESTEP_GPS_API_KEY` — One-Step GPS API key
- `MANAGER_PASSWORD` — manager unlock password

Strongly recommended in production:
- `MANAGER_TOKEN_SECRET` — high-entropy HMAC key for manager unlock tokens (falls back to `MANAGER_PASSWORD` if unset)
- `CORS_ORIGINS` — comma-separated allowed origins (unset = allow-all with a startup warning)
- `APP_API_KEY` — when set, all `/api` routes except `/api/health` require an `x-api-key` header; clients must send it
- `SCHEDULER_TZ` — IANA timezone for the daily check cron (e.g. `America/New_York`); unset = server-local (UTC on Replit)

Optional:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (or `SENDGRID_API_KEY`), `SMTP_FROM` — alert emails (skipped with a warning if unset)
- `APP_URL` — link used in alert emails
- `PG_POOL_MAX` — max DB connections for the shared pool (default 10)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/` — Express API. Shared DB pool in `src/lib/db.ts`; auth/rate-limit/header middleware in `src/lib/security.ts`; manager unlock tokens in `src/managerToken.ts`; startup migrations in `src/migrate.ts`; daily accountability cron in `src/scheduler.ts`.
- `artifacts/mileage-log/` — React web app (manager-facing reports, settings, period annotation).
- `artifacts/driver-app/` — Expo driver app.
- `artifacts/mockup-sandbox/` — Replit design-preview scaffold (not production code).
- `lib/` — OpenAPI spec + generated Zod schemas and React Query client.

## Architecture decisions

- Manager auth is a shared password that mints short-lived (1 h) HMAC "unlock tokens" scoped to a period; finalized-period writes (annotation create/update/delete) require a valid token.
- One shared pg `Pool` for the whole server (`src/lib/db.ts`) — do not create per-file pools.
- GPS data is cached into `gps_cache` per device/day; reports UNION annotated rows with GPS-only rows.
- Migrations are idempotent SQL run on every boot (`migrate.ts`), not versioned files.

## Gotchas

- Adding a `sort` param to One-Step GPS `device-point` calls causes 502s (see `scheduler.ts`).
- pg DATE columns must be formatted with `lib/dates.ts#toDateOnly` (or `::TEXT` in SQL) — `toISOString().slice(0,10)` shifts a day on UTC+ servers.
- After changing the alert `check_time`, the cron is rescheduled live via `updateSchedulerTime`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
