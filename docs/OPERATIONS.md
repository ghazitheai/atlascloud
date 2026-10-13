# Operations and security

## Access and secrets

Use HTTPS and a stable `APP_URL`. Production cookies are Secure, HttpOnly and SameSite=Lax with 8-hour expiration; only hashes of session tokens are stored. Passwords are bcrypt-hashed with cost 12. Invitation tokens are 256-bit random values and only hashes are stored in the invitation table. The queued onboarding email necessarily contains its URL token: protect database backups and job payloads; no payloads appear in ordinary delivery-log responses.

Database-backed login limiting is keyed by hashed account email (10 attempts per 15 minutes); mutation limits are per authenticated user (200 per 15 minutes). Add gateway/IP and organization abuse controls for an internet-facing pilot. Ordinary session cookies are the only supported API authentication; service-to-service auth and SSO remain future work.

Use separate schema-owner/migration and non-owner runtime credentials. The app and worker never need DDL privileges. Apply runtime-grants.sql after migrations. Keep direct migration credentials restricted to trusted operators or dedicated secret-scoped migration jobs. Never put secrets in GitHub, `NEXT_PUBLIC_*`, request URLs or browser storage. Source files and logs must not contain live database URLs.

Before live use, add enterprise SSO/MFA, an auth recovery workflow, per-field/department confidentiality as required, independent access/security testing, and the missing purchasing lifecycle controls identified in coverage. Local authentication is suitable for a protected pilot, not proof of enterprise readiness.

## Documents

S3-compatible private storage supports presigned uploads for PDF/PNG/JPEG declared types, up to 10 MiB, expiring after 5 minutes. The URL binds the expected type/length. Content sniffing, object-finalization verification and malware-scanner callbacks are not implemented. Documents remain PENDING and downloads stay blocked unless a trusted process changes the status to CLEAN after scanning and verifying the actual object. Do not expose a client-controlled “mark clean” endpoint.

A trusted scanner must verify actual object size, magic bytes/MIME, malware result and tenant/entity association, then record a scan decision and audit evidence. Only then should it set CLEAN. Download links last 60 seconds and require authorized internal entity access. Vendor attachment upload/download is not currently implemented. Do not use a public bucket or bypass the scan restriction.

## Backups and restore

Prefer managed PostgreSQL automated backups and point-in-time recovery, with a retention period and storage region approved by your organization. Define recovery point/time objectives. Protect S3 documents separately with bucket versioning and approved retention. A code rollback does not restore a database.

For operator-controlled logical backups using PostgreSQL client tools, set `PGSERVICE` to a protected service-file entry containing schema-owner connection settings. Keep the backup outside the Git checkout:

```bash
pg_dump --format=custom --no-owner --file=/secure-backups/atlas-backup.dump
```

Restore into an **empty isolated recovery database**, using a separate protected service entry:

```bash
pg_restore --no-owner --no-acl --dbname=service=atlas_restore /secure-backups/atlas-backup.dump
```

Use the native client version appropriate for your database. Reapply runtime roles/grants because `--no-acl` excludes grants. Verify user/entity scope, stock totals, invoice/payment links, commitments/actuals, quotation snapshots and audit history, then run a fictional workflow. Validate S3 object references and restore bucket data separately. Never point a restore test at production. Restoration has not been executed in this authoring environment.

## Queue and monitoring

Worker jobs are stored in PostgreSQL. Claiming jobs is transactional with SKIP LOCKED. A stuck job can be reclaimed after five minutes. Failure attempts use exponential backoff capped at one hour, stopping after five failures. Keep each send shorter than the lease; a long/hung send needs a configured timeout/lease heartbeat before high-volume production.

Monitor `/api/health`, web 500s, failed jobs, queue age, SMTP errors, PostgreSQL pool exhaustion, invoice exceptions and unusual auth activity. Application API failures and worker events emit JSON log messages. Integrate those logs with your existing alerting service; no hosted monitoring integration is bundled.

“DELIVERED” is SMTP acceptance only. There is no external bounce/open/receipt tracking. A process crash can duplicate email because delivery is at least once. Resubmitting procurement receipt operations with the same key is idempotent; other mutation classes use state/uniqueness invariants but do not provide a generic request-replay contract.

## Retention and jurisdiction

No automatic record-retention/deletion policy is implemented. Audit, stock, submitted quotes and payments are append-only. Country-specific privacy, tax, invoice numbering, procurement, contractual and record-retention requirements require local review. The system is not a general ledger and must not be represented as regulatory-certified.

## Incident response

Revoke affected user sessions and rotate credentials through trusted administration. Suspend supplier access when necessary. Preserve audit and job evidence. Rotate database/S3/SMTP credentials if exposed, redeploy with updated server secrets, and investigate the scope before resuming. Do not delete audit history to hide an error; implement correcting transactions and retain the event trail.
