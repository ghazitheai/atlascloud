# Safe deployment on Vercel

This project supports Vercel's **Node.js** runtime. It requires external PostgreSQL; the worker remains a separate container/process. The repository includes `vercel.json`, a pinned lockfile and GitHub Actions verification. These files do not create accounts, resources or a running deployment automatically.

## 1. Upload to a private GitHub repository

Follow the commands in the README. Turn on GitHub two-factor authentication, restrict collaborator access, and protect `main`. Require the `verify` CI job to pass before merging. Restrict fork-preview access to secrets and prohibit untrusted contributors from running code with live credentials.

## 2. Create an isolated staging database

Use a managed PostgreSQL service that offers TLS, connection pooling and backups. Create a **staging database** containing fictional data only. Separately create production later. Keep staging and production credentials and storage buckets distinct. Never attach both environments to the same database.

- `DATABASE_URL`: pooled runtime connection using a non-owner runtime login, supporting interactive transactions.
- `DIRECT_URL`: direct schema-owner connection for migrations. The Prisma migration CLI uses this value.
- Runtime connections must validate the provider's TLS certificate. Avoid `rejectUnauthorized=false`; use the provider's documented CA configuration when needed.
- Connection limits: the app pool uses at most 5 connections per function instance. Use the provider's supported pooling solution and size limits for expected concurrency.

Apply the migration **before** testing the app, from a trusted workstation or a separate CI migration job:

```bash
npm ci
npm run db:generate
npm run db:migrate
```

These commands require local environment variables with staging credentials. Prisma reads `.env`; do not commit that file. The deployment build only generates Prisma and builds Next.js; it deliberately does not mutate a database.

For the staging demo, set `ALLOW_DEMO_SEED=true` and a strong `DEMO_PASSWORD` locally. Seed using a trusted schema-owner connection if necessary. If `DATABASE_URL` already uses the runtime role with immutable-table restrictions, seed still inserts records but the owner is recommended for provisioning.

```bash
node --env-file=.env --import tsx prisma/seed.ts
```

Create a distinct database login named `atlas_runtime` through your database provider, then apply `scripts/runtime-grants.sql` as the schema owner. Switch the Vercel runtime `DATABASE_URL` to that login. The runtime must not own the database, have DDL privileges or have permission to bypass immutable triggers.

## 3. Import a dedicated staging Vercel project

In Vercel: **Add New → Project → Import your GitHub repository**.

- Project name: `atlas-procurement-staging` (or a name you choose).
- Framework: **Next.js**.
- Root directory: repository root. If your repo contains the whole extracted parent folder, select `procurement-platform` instead.
- Node.js: **22.x**.
- Install command: `npm ci`.
- Build command: `npm run build`.
- Output directory: framework default; do not choose a static export.

The **first deployment of a Vercel project is a Production deployment even if the Git branch has another name**. A separate staging project prevents that label from accidentally connecting to live resources. Every environment in this staging project must use staging resources. Keep deployment protection enabled where your plan supports it.

## 4. Configure environment variables

Add variables in Vercel project settings, scoped to the intended environments:

| Variable                                     | Staging value                                                                          | Production value                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `DATABASE_URL`                               | Staging pooled, restricted runtime login                                               | Production pooled, restricted runtime login           |
| `DIRECT_URL`                                 | Staging direct migration URL; preferably available only in trusted migration jobs      | Production direct URL only in trusted migration jobs  |
| `APP_URL`                                    | Exact stable staging HTTPS origin, e.g. `https://atlas-procurement-staging.vercel.app` | Exact production HTTPS origin                         |
| `EMAIL_MODE`                                 | `disabled`                                                                             | `smtp` on the worker once real delivery is authorized |
| `EMAIL_FROM`                                 | No real sender needed                                                                  | Verified organization sender                          |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`      | Separate staging private bucket, if enabled                                            | Private production bucket                             |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Bucket-limited staging credentials                                                     | Bucket-limited production credentials                 |
| `NEXT_TELEMETRY_DISABLED`                    | `1`                                                                                    | `1`                                                   |

Do not use `NEXT_PUBLIC_` for any secret. Do not set `ALLOW_DEMO_SEED`, `DEMO_PASSWORD` or bootstrap passwords on the production web deployment. Never set `COOKIE_SECURE=false` on Vercel.

`APP_URL` must have **no trailing slash**. Browser writes require that exact origin; a URL mismatch causes “Request origin denied.” Use a stable staging project/domain rather than changing random preview URLs. For branch previews, set a branch-specific `APP_URL`, or access through an assigned staging domain. A preview must never inherit production database credentials. If preview infrastructure is not configured, disable deployments for those branches until it is.

You can omit `DIRECT_URL` from the runtime project if generation/build succeeds without it (as verified for this code); it is required by migration commands. Keep migration credentials out of serverless runtime wherever possible.

## 5. Deploy and test staging

Click Deploy. Confirm `/api/health` returns `{"status":"ok"}` and sign in at `/login` using your staging demo accounts. The app only returns a database health response, never secrets.

Test the full workflow with **different** requester, buyer, approver, receiving and finance accounts. Test vendor1 and vendor2 separately. Verify vendor1 cannot see vendor2 offers or orders. Verify a second-tenant account sees only its own records. The coverage matrix contains known limitations to review before proceeding.

GitHub Actions tests native PostgreSQL and builds the app. Its CI database is disposable and is not your staging or production database. Vercel may deploy a push before CI finishes; use protected branches and manual production promotion rather than treating automatic deployment as evidence of successful CI.

## 6. Run the durable worker separately

Vercel does not run `npm run worker` as an always-on service. Deploy the `tools` Docker target to an environment supporting a persistent worker process (your existing server or a container host). Run:

```bash
node --import tsx src/worker.ts
```

Give it the same appropriate tenant database, `APP_URL` and server-only email settings. For production SMTP configure `EMAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` and a verified `EMAIL_FROM`.

The queue lives in PostgreSQL and uses `FOR UPDATE SKIP LOCKED`, transaction locking, a 5-minute lease, exponential retry and a 5-attempt terminal failure. Email delivery is **at least once**: a crash after SMTP acceptance but before marking the job delivered can produce a duplicate email. “DELIVERED” means accepted by the configured SMTP server, not verified delivery to a mailbox. Failed jobs are visible in administration. No delivery/bounce webhook is implemented.

Use `EMAIL_MODE=disabled` until you intentionally enable real invitations. Without the worker, purchasing remains usable but queued invitations/reminders do not send. In the core worker, scheduled reminders cover RFQ deadlines and session/rate-limit cleanup only; contract-expiry notifications remain unimplemented.

## 7. Create production only after the pilot passes

Create a separate production database and private bucket. Apply migrations with the schema-owner credential and runtime grants. Start a separate production Vercel project with the same verified source and **production-only** credentials. Set your production domain and matching `APP_URL`.

Bootstrap your real tenant locally with server-only environment variables:

```text
ADMIN_EMAIL=<your administrator email>
ADMIN_PASSWORD=<unique password, 18+ characters>
TENANT_NAME=<corporate group>
ENTITY_NAME=<initial legal entity>
ENTITY_COUNTRY=EG
ENTITY_CURRENCY=EGP
```

Run `node --env-file=.env --import tsx scripts/bootstrap.ts` against the empty production database. Remove bootstrap variables afterward. Provision master data and unique user passwords via the administration scripts; see the guide. MFA and federated SSO are not implemented here: keep the pilot behind access protection while those controls are added.

Take a database backup and successfully restore it into a disposable database before onboarding real vendors. Run an independent security review and your organization's access/data-residency review. Review the explicitly incomplete financial, approvals and lifecycle behavior in `COVERAGE.md` for your purchasing policy.

Use staged production deployments/manual promotion rather than assigning live domains before validation. Do not promote a preview artifact expecting its database configuration to magically change; verify the deployment was built with the correct environment.

## 8. Updating and rollback

1. Work on a branch; run CI.
2. Apply additive migrations in staging and test against staging data.
3. Back up production before schema changes.
4. Run production migrations using the migration role from a trusted job.
5. Deploy the verified version, perform a smoke test, then assign the production domain.

Code rollback does not reverse database migrations. Use expand/contract schema changes and avoid destructive migrations until all old deployments are retired. Restoring a database can lose recent transactions; agree on recovery objectives and rehearse restoration.

Official deployment references (checked 2026-10-11):

- https://vercel.com/docs/deployments/environments
- https://vercel.com/docs/environment-variables/manage-across-environments
- https://vercel.com/docs/functions/limitations
- https://www.prisma.io/docs/orm/v6/prisma-client/deployment/serverless/deploy-to-vercel
