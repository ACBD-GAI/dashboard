# Local setup, Supabase setup, and deployment

## Prerequisites

- A supported Node.js LTS release and npm
- Docker Desktop or another Docker runtime for Supabase local development
- Supabase CLI
- A Supabase project for hosted environments

Use the package manager and engine versions committed by the repository when
they are present.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit `.env.local`.

| Variable | Used by | Secret? | Purpose |
| --- | --- | :---: | --- |
| `VITE_SUPABASE_URL` | Browser | No | Project API URL |
| `VITE_SUPABASE_ANON_KEY` | Browser | Public key | RLS-protected browser API access |
| `SUPABASE_URL` | Edge Functions / server tools | No | Server-side project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions / controlled tools | **Yes** | Privileged server operations |
| `SUPABASE_MIGRATION_ACCESS_TOKEN` | Legacy migration CLI write mode | **Yes** | Short-lived authenticated user token accepted by the migration function |

All `VITE_` values are bundled into client JavaScript and must be safe to
publish. Never create a `VITE_SUPABASE_SERVICE_ROLE_KEY`.

For local Supabase, obtain the URL and anon key from `supabase status`. Configure
Edge Function secrets through the Supabase CLI or dashboard, not source files.

## Local development

From the repository root:

```sh
npm install
npm run supabase:start
npm run supabase:reset
npm run dev
```

`supabase db reset` is destructive to the **local** database and reapplies
migrations and seed data. Confirm `supabase status` points to the local stack
before running it. Do not run reset against a linked production project.

Useful commands, when corresponding scripts exist:

```sh
npm run typecheck
npm run lint
npm test
npm run build
supabase db lint
npm run supabase:types
supabase functions serve --env-file supabase/.env.local
```

Keep generated database types in the repository location chosen by the
implementation and regenerate them after every schema change. Do not manually
edit generated types.

Seed data must be fictional. Auth users cannot be safely represented as
hardcoded production identities; create local Auth users through Studio or the
documented local seed helper, then assign test roles/branches locally.

## Hosted Supabase setup

1. Create separate development/staging and production projects. Do not test
   destructive behavior in production.
2. Record project references securely and link the CLI only to the intended
   non-production project first:

   ```sh
   supabase login
   supabase link --project-ref YOUR_NON_PRODUCTION_PROJECT_REF
   supabase db push
   ```

3. Review the migration diff and RLS policies before applying them.
4. Verify the seeded branches are `GAI`, `CAS`, and `BAC`.
5. Create the private `inventory-imports` and `inventory-exports` buckets via
   migration where supported, and verify neither is public.
6. Deploy `process-import`, `process-export`, and `clear-report`. Deploy
   `migrate-legacy-inventory` only in environments where the controlled
   migration workflow is required.
7. Set server secrets:

   ```sh
   supabase secrets set \
     SUPABASE_URL="https://PROJECT_REF.supabase.co" \
     SUPABASE_SERVICE_ROLE_KEY="REDACTED"
   ```

8. Configure Auth site URL and allowed redirects for the exact staging web
   origins and localhost development origin.
9. Configure an approved SMTP provider and email template. Test expired,
   consumed, and unauthorized sign-in paths.
10. Disable public sign-ups or enforce invite-only onboarding. Database profile
    defaults must still be least-privileged.
11. Review JWT expiry, refresh-token reuse protection, rate limits, CAPTCHA
    needs, log retention, and database/Storage quotas.
12. Run the verification matrix in staging before production approval.

Project URLs and anon keys may be deployment environment variables. Service
keys must exist only in the Supabase secret store or a tightly controlled
server/migration environment.

## First administrator

There is no hardcoded administrator and no self-promotion path.

1. Invite the designated administrator through Supabase Auth and have them
   complete sign-in once so the profile trigger runs.
2. Confirm their exact Auth user ID and email in the Supabase dashboard.
3. Using the SQL Editor as the project owner, or another audited privileged
   database session, update exactly that profile:

   ```sql
   begin;

   select id, email, role, active
   from public.profiles
   where lower(email) = lower('ADMIN_EMAIL_HERE')
   for update;

   update public.profiles
   set role = 'admin',
       active = true,
       updated_at = now()
   where id = 'AUTH_USER_UUID_HERE'
     and lower(email) = lower('ADMIN_EMAIL_HERE');

   commit;
   ```

4. Confirm exactly one row was updated and test access in staging.
5. Record the provisioning in the organization's change log. If schema tooling
   provides a dedicated bootstrap function, prefer it and follow its exact
   signature instead of adapting this illustrative SQL.

Do not put a real admin email or UUID in seeds or migrations. Subsequent role
and branch assignment changes should use the audited admin workflow.

## Web application deployment

1. Build from a reviewed commit with staging public environment values.
2. Run the verification matrix and smoke test against staging.
3. Build the production artifact with production URL and anon key only.
4. Deploy the static `dist` output to the chosen HTTPS host.
5. Configure SPA fallback so application routes serve `index.html`.
6. Add the exact host URL to Supabase Auth redirect allowlists.
7. Apply security headers at the host: a restrictive Content Security Policy,
   HSTS after HTTPS is proven, `X-Content-Type-Options: nosniff`, an appropriate
   `Referrer-Policy`, and frame restrictions.
8. Verify source maps and logs do not expose secrets or private data.
9. Perform read-only smoke tests first. Import, archival, and clear require a
   planned staging test or explicit production change approval.

Database migrations, Edge Functions, and web deployment should be versioned
together. Prefer expand-then-contract database changes so the previous web
version remains compatible during rollout.
