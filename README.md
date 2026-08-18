# RepIn

Minimal pnpm/Turborepo monorepo containing an Expo mobile app, a Next.js API, and shared TypeScript packages.

## Requirements

- Node.js 22.13 or newer
- Corepack (included with Node.js)

## Getting started

```bash
corepack enable
pnpm install
pnpm dev
```

The API runs at `http://localhost:3000` and its health check is available at `GET /api/health`. Expo starts separately and displays a reachable/unreachable API status.

### PostgreSQL

Configure the API with a PostgreSQL connection string:

```bash
cp apps/api/.env.example apps/api/.env.local
```

`DATABASE_URL` is server-only and must never use the `EXPO_PUBLIC_` prefix. The database connection check is available at `GET /api/db-health`; it returns HTTP 503 when PostgreSQL is unavailable.

Run the checked-in migrations by exporting the same connection string in your shell:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repin
pnpm --filter @repin/db db:migrate
```

After changing the schema, generate a migration with `pnpm --filter @repin/db db:generate`.

The mobile app defaults to `http://localhost:3000`. Set `EXPO_PUBLIC_API_URL` when the API is available elsewhere:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000 pnpm dev:mobile
```

Use your computer's LAN address for a physical device. An Android emulator commonly reaches the host at `http://10.0.2.2:3000`.

## Commands

- `pnpm dev` starts all development servers
- `pnpm dev:api` starts only the API
- `pnpm dev:mobile` starts only Expo
- `pnpm build` builds production-capable workspaces
- `pnpm typecheck` type-checks every workspace
- `pnpm lint` lints the repository
