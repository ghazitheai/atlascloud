# Docker deployment

Compose is a development deployment. It starts PostgreSQL, a migration job, the Next.js server, a queue worker and Mailpit. It binds app/inbox ports to localhost and keeps PostgreSQL on the internal Compose network.

```bash
cp .env.example .env
# Edit .env: unique database password and matching DATABASE_URL / DIRECT_URL
# For a fictional demo only: ALLOW_DEMO_SEED=true and your own DEMO_PASSWORD

docker compose up --build -d
docker compose run --rm migrate node --import tsx prisma/seed.ts
docker compose logs web worker
```

Open http://localhost:3000 and http://localhost:8025. Both are local-only interfaces. The Compose web service explicitly allows a non-Secure cookie only with `APP_URL` beginning `http://localhost`; this exception is for local HTTP. Remove that setting for a reverse-proxied HTTPS deployment.

For a server deployment, use a TLS reverse proxy, configure the exact HTTPS `APP_URL`, remove the localhost-only cookie override and expose only the proxy to your users. Prefer managed PostgreSQL or a maintained PostgreSQL instance with backups and a distinct schema-owner versus runtime role. Replace the development database credentials, disable demo seeding, and exclude Mailpit from your production topology. Configure production SMTP only on the worker when invitations are authorized.

The Dockerfile `runtime` target uses Next.js standalone output and an unprivileged node user. The `tools` target contains administration/migration/worker dependencies and is currently a build-stage image: harden and run it as an unprivileged user in your production worker setup. Migration and runtime access should use separate environment configurations rather than the single development `.env`.

Compose images have not been built or executed in the authoring environment; Docker was unavailable. The Next.js production build and database service tests were run directly. Test the full Compose topology in staging before use.

To stop without deleting data: `docker compose down`. `docker compose down -v` deletes the database volume; do not use it on a valuable database.
