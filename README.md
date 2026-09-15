# 10x Home Maintenance

![10x Home Maintenance logo](./public/logo.jpeg)

A web app for tracking cyclical home maintenance tasks — filter changes, inspections, battery swaps, and other
recurring chores — for a single homeowner or renter managing one property. Instead of relying on memory, notes, or
a generic calendar, the app automatically computes each task's next due date and status (**OK** / **DUE SOON** /
**OVERDUE**) from its frequency and last-completed date, and surfaces it on an urgency-sorted dashboard, so you
always know at a glance what in your home needs attention right now.

## Key Features

- Email/password authentication (register, sign in, sign out), with each user's data fully isolated from every
  other user's at the database level (Postgres Row-Level Security)
- Full CRUD on maintenance tasks: name, predefined category, importance, frequency (`frequency_value` +
  `frequency_unit`), and last-done date
- Automatic status calculation — no user ever sets a status directly. `next_due_date` is derived from frequency
  and last-done date; status is OVERDUE if it's in the past, DUE SOON if within the next 7 days, otherwise OK
- Urgency-sorted dashboard: tasks ordered by status first (OVERDUE → DUE SOON → OK), then by importance
  (HIGH → MEDIUM → LOW) within each status group
- A JSON API exposing the same task CRUD as the UI, authenticated via the same Supabase session cookie (see
  [API](#api))
- Self-service account deletion (RODO/GDPR right to erasure) — permanently removes the Supabase auth account and
  every task belonging to it

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v26.7.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone git@github.com-private:banan1988/10x-home-maintenance.git
cd 10x-home-maintenance
```

1. Install dependencies:

```bash
npm install
```

1. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

1. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

1. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run test:e2e` - Run Playwright end-to-end tests (requires `npx supabase start && npx supabase db reset` and `npm run dev` already running locally)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

1. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

1. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

1. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from CLI output>
```

1. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable                    | Description                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Project URL from Supabase dashboard → Settings → API                                          |
| `SUPABASE_KEY`              | `anon` public key from Supabase dashboard → Settings → API                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret key from Supabase dashboard → Settings → API — never expose client-side |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
1. Go to **Authentication → Email → Confirm email**
1. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## API

A JSON CRUD API for maintenance tasks is available under `/api/v1/tasks`. It reuses the existing Supabase
cookie session — there is no separate API key or bearer token. A caller signs in via `POST /api/auth/signin`
(see [Auth routes](#auth-routes)) and sends the resulting session cookie on every subsequent request.

Every response is JSON: `{ "data": ... }` on success, `{ "error": { "message": "...", "issues": [...] } }` on
failure (`issues` only present for validation errors), and `204 No Content` on a successful delete.

### Endpoints

| Method   | Path                | Description                                                                                                   |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/tasks`     | List the authenticated user's tasks                                                                           |
| `POST`   | `/api/v1/tasks`     | Create a task                                                                                                 |
| `GET`    | `/api/v1/tasks/:id` | Read a single task                                                                                            |
| `PATCH`  | `/api/v1/tasks/:id` | Partially update a task (at least one field)                                                                  |
| `DELETE` | `/api/v1/tasks/:id` | Delete a task                                                                                                 |
| `DELETE` | `/api/v1/account`   | Permanently delete the caller's own account and all their tasks (body: `{ "confirmEmail": "<their email>" }`) |

A task not owned by the caller returns the same `404` as a nonexistent id.

`DELETE /api/v1/account` requires the body's `confirmEmail` to match the caller's own signed-in email
(case/whitespace-insensitive) and returns `400` on mismatch, `502` if the underlying account deletion fails,
or `204` on success — which also clears the caller's session cookies.

> [!NOTE]
> Astro's built-in CSRF protection (`security.checkOrigin`, on by default) rejects any non-`GET` request that
> has no `Content-Type` header and no matching `Origin` header. A browser-based caller sends `Origin`
> automatically; a script/CLI client issuing a bodyless request (e.g. `DELETE`) must set `Content-Type` or pass
> a matching `Origin` header explicitly, as shown below.

### Example: full CRUD cycle via curl

```bash
# 1. Sign in and capture the session cookie
curl -i -c cookies.txt -X POST http://localhost:4321/api/auth/signin \
  -H "Origin: http://localhost:4321" \
  -d "email=you@example.com" \
  -d "password=your-password"

# 2. Create a task
curl -i -b cookies.txt -X POST http://localhost:4321/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"name":"Replace furnace filter","category":"hvac","importance":"medium","frequency_value":3,"frequency_unit":"month","last_done_date":"2026-08-01"}'

# 3. List tasks
curl -i -b cookies.txt http://localhost:4321/api/v1/tasks

# 4. Update a task (replace <id> with the id returned in step 2)
curl -i -b cookies.txt -X PATCH http://localhost:4321/api/v1/tasks/<id> \
  -H "Content-Type: application/json" \
  -d '{"name":"Replace furnace filter (updated)"}'

# 5. Delete a task
curl -i -b cookies.txt -X DELETE http://localhost:4321/api/v1/tasks/<id> \
  -H "Origin: http://localhost:4321"
```

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/) under the Worker name `10x-home-maintenance`.

- **Auto-deploy on merge**: pushes to `main` are automatically built and deployed by **Cloudflare Workers Builds** (Cloudflare's native Git integration, configured in the Cloudflare dashboard under the Worker's Settings → Builds) — not GitHub Actions. Other branches automatically get a 0%-traffic preview build (`wrangler versions upload`) instead of a production deploy.
- **Manual/local deploy**:

```bash
npm run deploy
```

This runs `astro build && wrangler deploy`, which promotes to 100% production traffic immediately (no gradual rollout).

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as secrets via `npx wrangler secret put` (or the Cloudflare dashboard) — these are runtime secrets, separate from `.env`/`.dev.vars`.

## CI

GitHub Actions runs lint + test + build on every push and PR to `main`. The repo also contains a `deploy` job wired to `wrangler-action`, but it is currently **parked** (`if: false`) since production auto-deploy is handled by Cloudflare Workers Builds instead — see `context/changes/deployment/deployment-plan.md` for the fallback re-enable steps if Workers Builds is ever disconnected.

## License

MIT
