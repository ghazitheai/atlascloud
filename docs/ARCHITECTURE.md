# Architecture and permissions

## Modular monolith

- `src/lib/services.ts`: transactional domain operations for requisitions, approvals, RFQs, offers, awards, orders, receiving, stock, invoices, payments and suppliers.
- `src/lib/queries.ts`: entity-scoped internal read model and restricted vendor read model.
- `src/lib/auth.ts`: local password session authentication, role/entity enforcement, origin validation and database-backed rate limiting.
- `src/lib/money.ts`: decimal arithmetic for unit normalization, tax and FX.
- `src/lib/storage.ts`: S3 presigned upload/download boundary. Documents remain quarantined unless a trusted scanner marks them clean.
- `src/worker.ts`: leased PostgreSQL queue, SMTP delivery and RFQ-deadline reminders.
- `src/app/api`: authenticated Node.js JSON API.
- `src/components/Workspace.tsx`: responsive internal and vendor UI.
- `prisma/schema.prisma`: data model; the SQL migration additionally implements constraints and append-only triggers.

No runtime state relies on process memory: sessions, rate limits, invitations, commitments, ledger transactions and jobs are persistent. PostgreSQL interactive transactions use SERIALIZABLE isolation and up to four attempts for Prisma P2034 conflicts. Durable queue locking uses SKIP LOCKED. Money calculations use decimal.js and PostgreSQL DECIMAL columns, not JS floating-point calculations. Dashboard formatting/charts use JS numbers for display, not accounting postings.

Pooled PostgreSQL runtime connections use Prisma's official pg driver adapter and the JavaScript query compiler. This avoids shipping native query-engine binaries on Vercel. The Prisma migration CLI uses a separate direct connection; it is not run during the web build.

## Identity and scope

Every request derives actor, tenant, role and entity membership from a hashed persistent session. Clients cannot submit their own tenant or actor. Group administrators can access all entities in their own tenant. Other internal roles are limited to `UserEntity` membership. Vendors use a separate query branch bound to the actor's `vendorId`; they cannot choose another vendor for portal submissions.

The tenant-wide vendor and product directory is shared across authorized internal entities. Vendor qualification is tenant-wide; entity administrators can qualify tenant-wide vendors, so restrict that role accordingly. Inventory, transactions, finance and budgets remain entity-scoped. No bank detail model is included in this release, so restricted bank-change approval is unimplemented.

| Role                            | Read access                                       | Mutations                                                                             |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Group administrator             | Own tenant, all entities                          | All implemented internal actions, except self-approval                                |
| Entity administrator            | Assigned entities + tenant directory              | Implemented internal actions in assigned entities; tenant-wide supplier qualification |
| Buyer                           | Assigned entities + tenant directory              | Requisitions, RFQs, invites, external offers, mappings, award proposals               |
| Requester                       | Assigned entities + tenant directory              | Create, submit and revise own requisitions                                            |
| Approver                        | Assigned entities + tenant directory              | Decide requisition and award approvals requested by another actor                     |
| Warehouse                       | Assigned entities + tenant directory              | Receive, issue, reserve, release, return quarantine                                   |
| Finance                         | Assigned entities + tenant directory              | Capture/match invoices and record confirmed payments                                  |
| Auditor                         | Assigned entities + tenant directory              | None                                                                                  |
| Vendor administrator / employee | Own invited RFQs, own quote snapshots and own POs | Acknowledge RFQ amendments, submit own offers, acknowledge own orders                 |

Department-level read restriction is not yet implemented: internal users see transactions throughout their assigned legal entities. Assigned users can see entity budgets, invoices and audit summaries. If your policy requires finer confidentiality, add department/field-level restrictions before use.

## Invariants

- Submission snapshots never update in place; a revised quote creates a new version.
- Vendor FX rates cannot influence comparisons: the portal currently supports the entity base currency only; buyers enter externally received foreign-currency offers with rate/source/time snapshots.
- Tax recovery flags can only be set by buyers under an entity policy allowing recovery.
- RFQ amendments increment the version and require vendor acknowledgement. Line amendments are not implemented; issue a new RFQ for changed quantities/items.
- Sealed offers cannot be compared before the deadline and bid opening. Internal workspace audit summaries exclude before/after values to avoid a sealed-offer leak.
- Whole-basket eligibility checks compliance, completeness, expiry, current RFQ version, approved vendor, capacity, MOQ and integral offered packs. Split awards validate each allocated line and exact total quantity.
- Weighted scores use price 60%, lead 20%, verified performance 20% by default. Zero evaluation cost gets price score 100. Zero lead time gets 100; when an alternative is zero, a positive lead gets 0. Weights must total 100.
- Award reasons and comparison snapshots are stored for review. The server never automatically approves a recommendation.
- PO generation happens inside the award-approval transaction and charges full freight/other charges once per chosen supplier.
- Commitments are recorded at PO issuance only. Requisition submission and approvals check budgets but do not reserve them. At award approval the budget check and commitment posting are atomic.
- Matched invoices release the corresponding commitment into actual expenditure. Exception invoices do not consume budget. Payments do not consume budget again.
- Accepted receipt units cannot exceed ordered balance. Rejected attempts enter quarantine separately and do not reduce the accepted outstanding balance. Replacement receipt inspection is therefore possible.
- Inventory is an append-only ledger. Available = accepted on-hand − reserved. Quarantine is held separately and excluded from accepted on-hand.
- Perpetual moving weighted-average valuation snapshots receipt cost, allocated freight and nonrecoverable tax. Outgoing accepted issues use the current average value. Adjustments in this release are positive, administrator-only and use current average cost; they are not a substitute for an approved count-adjustment workflow.
- Invoice goods quantities match cumulative accepted balances, less prior matched invoices; service quantities match ordered balances. Cumulative invoice totals cannot exceed the approved PO. Price tolerance is configurable, defaults to zero. Quantity tolerance is zero.
- Payments require a unique bank reference, a matched invoice, no future date and no overpayment. Manual recording is not proof independently verified by a bank integration.
- Receipt idempotency keys prevent double posting. Natural uniqueness and state checks protect invoice numbers, payment references, quote versions, award orders and approval decisions. General mutation idempotency is not implemented.

## Defense limits

SQL foreign keys/checks reinforce selected tenant/entity ownership, quantities and conversion validity. Immutable triggers prohibit ordinary audit, quotation, payment and posted-stock changes. Runtime grants must use a non-owner role. There is no database row-level security: isolation is enforced in service/query code and tested. A compromised schema-owner credential or arbitrary runtime SQL access is outside that isolation boundary. Never use owner credentials for the deployed app.

SSO/MFA, session management UI, account recovery, comprehensive malware-scanning lifecycle, signed ERP webhooks and field encryption for bank details remain unimplemented. Uploaded documents are never downloadable until externally verified clean. No universal regulatory compliance is claimed.
