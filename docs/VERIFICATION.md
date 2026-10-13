# Verification report

Verified in the authoring workspace on 2026-10-11. This report describes actual executed checks, not proposed checks.

| Check                                       | Actual result                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma generate`                           | Passed; Prisma 6.19 JavaScript query compiler with pg adapter                                                                                   |
| `npm run typecheck`                         | Passed                                                                                                                                          |
| `npm test`                                  | 17 tests passed, 1 file; Vitest 4.1.11                                                                                                          |
| `npm run build`                             | Passed; optimized Next.js 16.4 production build                                                                                                 |
| `npm audit --json`                          | 0 reported vulnerabilities across the installed dependency graph at verification time                                                           |
| Native PostgreSQL 17 server test            | Not executed here; process/user constraints prevented launching a native server. CI is configured to run the suite against native PostgreSQL 17 |
| Docker build / Compose launch               | Not executed; Docker unavailable                                                                                                                |
| Browser layout / accessibility / acceptance | Not executed; no browser verification claimed                                                                                                   |
| GitHub push / Vercel deployment             | Not performed; no account credentials/repository target provided                                                                                |
| SMTP / S3 / scanner / ERP / SSO             | External integration tests not performed; unconfigured and incomplete integration states explicitly documented                                  |

## Database test method

The authoring suite applies the complete SQL migration to PGlite, the actual PostgreSQL engine compiled to WebAssembly, and executes the real Prisma-backed services. An in-process pg-compatible transport supports the official Prisma pg adapter. It is not an array-backed or mock SQL implementation.

PGlite has one connection: the test transport serializes transactions. The concurrent duplicate-receipt test demonstrates retry/idempotency behavior under overlapping promises but is not proof of native PostgreSQL multiconnection conflict handling. GitHub Actions uses a separate native PostgreSQL 17 service and reruns the same test, migrations, type checks and build; that workflow has been prepared but not run in your GitHub account.

The native-test database must have a name ending in `_test`. CI uses a fresh ephemeral database and fictional seed only. Schema immutability triggers are exercised directly in both configurations.

## Executed test cases

1. Fictional tenant/entity/vendor/product seed, split award, partial receipt and invoice exception.
2. Tenant isolation and refusal of cross-tenant product references.
3. Vendor-specific quotation/order access and refusal of internal comparison access.
4. Cross-entity denial and read-only auditor mutation denial.
5. Self-approval block and material-change reapproval.
6. Decimal pack normalization, discounts, tax recovery, FX and invalid conversion handling.
7. Cheapest unit price versus lowest compliant delivered cost.
8. Idempotent concurrent duplicate partial receipt (single-connection limitation above).
9. Over-receiving and insufficient-stock prevention.
10. Duplicate invoice and exception-payment prevention.
11. Database-level immutability of audit, stock ledger and submitted quote versions.
12. Full requisition → approval → RFQ → vendor quote → award → order → partial receipt → invoice → confirmed payment, including over-award rejection and budget reconciliation.
13. Sealed-bid visibility, late-offer rejection and buyer-only FX verification.
14. API sign-in requirement and cross-origin authentication denial.
15. Hashed persistent sessions, vendor-scoped API data and logout revocation.
16. One-use vendor onboarding invitation and replay denial.
17. Expired session denial.

## Dependency changes

The initial dependency review flagged advisories. Updated AWS S3 packages to 3.1149.0, Nodemailer to 10.1.0 and Vitest to 4.1.11. Explicit dependency overrides pin patched `deepmerge-ts` 8.0.2, `effect` 3.22.2 and `tinypool` 2.1.2. Generation, tests, type checking and production build pass with those resolutions. This is an advisory scan at one point in time, not a vulnerability-free guarantee. Review updates and rerun checks before deployment.
