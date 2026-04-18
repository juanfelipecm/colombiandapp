# E2E tests

Run with: `npm run test:e2e`

## Current state

- **`smoke.spec.ts`** — live, passes against any running dev server. No
  preconditions beyond `supabase start` + `.env.local`.
- **`wizard-happy-path.spec.ts`**, **`idempotency.spec.ts`**,
  **`backgrounding.spec.ts`**, **`admin-404.spec.ts`** — scaffolded with
  `test.skip(...)` until the two pieces of infrastructure below land.

## What's needed to un-skip the four scenario specs

### 1. Authenticated browser session

The app uses phone-OTP auth. Playwright cannot receive SMS codes, so we need a
programmatic sign-in. Options, from cheapest to most robust:

- **Service-role JWT injection.** Create a `tests/e2e/fixtures/auth.ts` helper
  that:
  1. Calls `supabase.auth.admin.createUser({ phone, phone_confirm: true })` via
     the service-role client to ensure a test teacher exists.
  2. Inserts a corresponding `teachers` / `schools` / `students` row if missing.
  3. Signs in via `supabase.auth.signInWithPassword` (for a passworded test
     user) or mints a session token directly through the admin API.
  4. Writes the resulting `sb-access-token` / `sb-refresh-token` cookies on
     Playwright's `context` via `context.addCookies(...)`.
- **Seeded auth JSON via `storageState`.** Save a logged-in state once, reuse
  across tests via `test.use({ storageState: 'tests/e2e/fixtures/auth.json' })`.

### 2. Anthropic mock

The POST `/api/proyectos/generate` route calls Anthropic server-side. For E2E we
need deterministic responses without network calls or credits.

Approach: run the dev server with a fake Anthropic endpoint. Add a
`PLAYWRIGHT_MODE=1` env that the route honors — when set, replace `new Anthropic(...)`
with a stub that returns canned JSON per fixture. The stub lives in a new
`lib/ai/test-anthropic.ts` module guarded by `process.env.NODE_ENV === 'test'`.

Canned responses should match the six eval fixtures so the happy-path test
exercises the same structure real teachers will see.

### 3. Test data lifecycle

Each spec that writes to the DB should run inside a transaction or have an
explicit cleanup hook. Currently `supabase test db` handles DB-level rollback;
Playwright does not. Recommended pattern: seed a dedicated `e2e-test@...` teacher
with a deterministic UUID, clear their `projects` + `project_generation_logs`
rows in `test.beforeEach`.

## Until then

The scaffolded specs describe the intent and Playwright selectors; anyone
completing the infrastructure only has to remove the `test.skip` gate and wire
in the two missing pieces.
