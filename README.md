# Atlas Procurement

A working procurement core built for a GitHub repository and Vercel or Docker deployment. Next.js 16, TypeScript, PostgreSQL 17, Prisma 6, decimal-safe calculations, a PostgreSQL-backed durable email queue, and an internal workspace plus restricted supplier portal.

**Release status:** verified core pilot. This is not a completed enterprise suite or a claim of country-specific legal compliance. Read [coverage](docs/COVERAGE.md) before introducing real procurement data. The application source is included directly in this repository. Deployment still requires your own database and environment settings.

## Start here

- [Safe Vercel deployment, step by step](docs/DEPLOY_VERCEL.md)
- [Docker deployment](docs/DEPLOY_DOCKER.md)
- [Administrator and vendor guide](docs/USER_GUIDE.md)
- [Architecture and permissions](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Requirements coverage and remaining work](docs/COVERAGE.md)
- [Verification results](docs/VERIFICATION.md)
- [Production security and restore procedures](docs/OPERATIONS.md)

## What works

Requisition → separate approval → RFQ → queued vendor invitation → authenticated immutable quotation → normalized comparison → split award → separate award approval → purchase orders → partial receiving / quarantine → inventory ledger → invoice matching → manually confirmed payments.

The responsive interface includes dashboard, supplier directory, product/supplier mappings, requisition forms, approval inbox, sourcing workspace, vendor quote forms, comparison matrix, purchase order print/PDF view, receiving, inventory, invoice matching, contracts, reports, delivery logs and audit history. CSV exports can be opened in Excel. Arabic navigation and RTL are included; full Arabic translation remains incomplete.

## Local development with Docker

Prerequisites: Git, Node.js 22, and Docker with Compose.

1. Copy `.env.example` to `.env`. Set your own database password in **all three** database variables (`POSTGRES_PASSWORD`, `DATABASE_URL`, `DIRECT_URL`).
2. Set `ALLOW_DEMO_SEED=true` and choose a `DEMO_PASSWORD` with at least 14 characters. Use fictional data only.
3. Run:

```bash
docker compose up --build -d
docker compose run --rm migrate node --import tsx prisma/seed.ts
```

Open `http://localhost:3000`. Local email inbox: `http://localhost:8025`. Compose binds both interfaces to localhost and does not expose PostgreSQL. Use the same seed password for the following fictional accounts:

| Account                                           | Role                                    |
| ------------------------------------------------- | --------------------------------------- |
| `admin@atlas.example`                             | Group administrator                     |
| `buyer@atlas.example`                             | Buyer                                   |
| `requester@atlas.example`                         | Department requester                    |
| `approver@atlas.example`                          | Separate approver                       |
| `warehouse@atlas.example`                         | Receiving and inventory                 |
| `finance@atlas.example`                           | Invoice matching and confirmed payments |
| `auditor@atlas.example`                           | Read-only internal workspace            |
| `vendor1@atlas.example` … `vendor8@atlas.example` | Separate vendor organizations           |
| `other@atlas.example`                             | Second tenant isolation demonstration   |

`.example` addresses are fictional. Development emails are delivered to Mailpit only. Do not configure real SMTP for seeded vendors.

## Development without Docker

Provide a PostgreSQL database. Set `DATABASE_URL` and `DIRECT_URL`, and `APP_URL=http://localhost:3000` in `.env`. Prisma loads `.env`; Next.js loads `.env`/`.env.local`. Node administration and worker commands use `node --env-file=.env --import tsx ...` when you want them to load that file directly.

```bash
npm ci
npm run db:generate
npm run db:migrate
node --env-file=.env --import tsx prisma/seed.ts
npm run dev
```

Optional email worker: `node --env-file=.env --import tsx src/worker.ts`. Development email transport expects the `mailpit` hostname from Compose; outside Compose use the full stack or configure a local transport explicitly.

## Tests

```bash
npm run db:generate
npm run typecheck
npm test
npm run build
```

Without `TEST_DATABASE_URL`, tests use the real PostgreSQL engine compiled to WebAssembly (PGlite), applying the SQL migration and executing Prisma-backed services. That adapter serializes access to its single connection; it cannot demonstrate native multiconnection contention. GitHub Actions applies the migration and reruns the suite against a fresh native PostgreSQL 17 `atlas_test` database. Native test database names must end in `_test`. Never point tests at a live or valuable database.

## Repository and deployment

Clone this repository to work with the application; no ZIP extraction is required:

```bash
git clone https://github.com/ghazitheai/Atlas-Procurement-System.git
cd Atlas-Procurement-System
npm ci
```

The application, Prisma schema and migration, administration scripts, documentation and tests live at the repository root. GitHub Actions verifies migrations, types, tests and the build against PostgreSQL 17. In Vercel, import this repository with the root directory set to `.` and configure the environment variables described in [the deployment guide](docs/DEPLOY_VERCEL.md).

No secrets, uploads, demo passwords, runtime database directories, build artifacts or `node_modules` belong in the repository. The `.gitignore` covers these. GitHub Pages cannot host the authenticated backend or PostgreSQL; use Vercel for the app and a managed database.

## Production provisioning

Do not seed production. Apply migrations using a schema-owner credential, then bootstrap a real organization via `scripts/bootstrap.ts`, with settings documented in the deployment guide. Provision departments, warehouses, users and catalog items through the trusted administration CLI (`scripts/provision.ts`). Provisioning and password rotation are intentionally operator tasks in this core release; a complete administration UI, password-reset emails and SSO are remaining work.
