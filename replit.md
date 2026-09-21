# Mitzy

Mitzy is a calm ISL glove companion that turns recognized hand gestures into readable text and spoken language.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mitzy/app/index.tsx` — the mobile recognition experience, settings sheet, and calibration flow
- `artifacts/mitzy/constants/colors.ts` — Mitzy's semantic color tokens
- `artifacts/mitzy/assets/images/mitzy-icon.png` — app icon
- `artifacts/api-server` — shared API scaffold, currently not required by the mobile first build

## Architecture decisions

- The first build is frontend-only and keeps session preferences on-device with AsyncStorage; no account or backend is needed for the core glove flow.
- The mobile preview uses a simulated glove connection and gesture trigger so the recognition experience is testable before firmware UUIDs and BLE characteristics are finalized.
- Mitzy uses a single-screen experience with modal settings and calibration flows instead of tab navigation to keep the signer/listener interaction focused.

## Product

- Shows a persistent glove connection state with connect/disconnect behavior.
- Presents the latest recognized sign with confidence feedback and an auto-speak state.
- Includes a recent signs log, speech settings, and a three-step calibration flow.
- Uses a soft cobalt, cream, and mint visual system inspired by the provided reference screens.

## User preferences

- App name: Mitzy.

## Gotchas

- Final BLE service and characteristic UUIDs are intentionally not hardcoded until the glove firmware contract is finalized.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
