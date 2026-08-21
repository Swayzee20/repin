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

### Supabase Auth

Copy the environment examples and add the project URL and publishable key from
your Supabase project's Connect panel:

```bash
cp apps/mobile/.env.example apps/mobile/.env
cp apps/api/.env.example apps/api/.env.local
```

The mobile app uses `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for email/password authentication. The
API uses the equivalent server-scoped `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` values to verify bearer tokens. Never place a
Supabase secret or service-role key in an `EXPO_PUBLIC_` variable.

Authenticated requests send `Authorization: Bearer <access-token>` to
`GET /api/me`. The route returns HTTP 401 for an absent or invalid token. On a
user's first authenticated request, the API creates an application user whose
primary key is the verified Supabase Auth user ID and returns that application
record. Supabase remains the source of truth for authentication credentials;
the application table stores only application profile data.

### Groups

Authenticated users can create and access groups through these bearer-token
protected routes:

- `POST /api/groups` with `{ "name": "Group name" }`
- `GET /api/groups` to list the current user's memberships
- `GET /api/groups/:id` to fetch a group only when the current user is a member
- `GET /api/groups/search?q=<name>` to search by name (minimum 2 characters)
- `GET /api/groups/invite/:code` to resolve an invite code to a safe preview
- `POST /api/groups/join` to join a group directly with an invite code
- `POST /api/groups/:id/join` to idempotently join as a `member`

Creating a group atomically adds its creator to `group_members` with the
`owner` role. Membership checks are performed in the API's database queries;
non-members receive HTTP 404 for individual groups.

Each group receives a random, non-sequential eight-character invite code at creation. Codes use an unambiguous uppercase alphabet, and creation retries safely if a database uniqueness conflict occurs. Codes are
stored and matched in uppercase, accepted case-insensitively, and returned only
from the membership-protected group detail route—not from name search. The
current first version uses permanent codes; rotation and expiry are not yet
implemented.

### Workouts and Community Board

Group members can use `GET /api/groups/:id/workouts` to load the newest
workouts and `POST /api/groups/:id/workouts` to log a workout. Both operations
verify group membership in the database. Feed responses include the posting
application user's display name.

The mobile group detail screen renders this workout feed and links to a minimal
workout form. Returning after a successful submission refreshes the board
immediately.

### Home

`GET /api/home?timezoneOffsetMinutes=<offset>&groupId=<optional-id>` returns the
authenticated user's daily and Monday-based weekly workout snapshot, group
memberships, and one membership-authorized Community Board feed. The mobile
Home Screen refreshes this aggregation when focused and lets users with multiple
groups switch the selected community.

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
