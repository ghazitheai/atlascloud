# API reference

All protected endpoints use the HttpOnly `atlas_session` cookie. JSON mutations require `Origin` exactly equal to `APP_URL` and `Content-Type: application/json`. Requests derive the tenant and actor from the session; IDs are checked against authorization. Do not supply a tenant/actor field.

Responses are JSON. Domain validation: 400; unauthenticated: 401; denied: 403; missing record: 404; duplicate: 409; schema errors: 422; rate limit: 429. Unexpected failures return a generic 500 message and emit a structured server log. ORM FK/check failures may currently surface as generic 500s; improve error categorization before broad onboarding.

| Method | Endpoint                       | Purpose                                                                       |
| ------ | ------------------------------ | ----------------------------------------------------------------------------- |
| GET    | `/api/health`                  | Database connectivity; public, no record details                              |
| POST   | `/api/auth/login`              | `{email,password}`; set 8-hour session                                        |
| POST   | `/api/auth/logout`             | Revoke session                                                                |
| POST   | `/api/onboarding/accept`       | `{token,name,password}`; one-use unexpired invitation, 14+ character password |
| GET    | `/api/workspace`               | Role-specific authorized workspace data                                       |
| POST   | `/api/requisitions`            | Create draft with lines                                                       |
| POST   | `/api/requisitions/:id/submit` | Stock check, budget check and approval request                                |
| POST   | `/api/requisitions/:id/revise` | New draft version; pending approvals superseded                               |
| POST   | `/api/approvals/:id/decide`    | `{decision,reason}`; separate actor approval                                  |
| POST   | `/api/rfqs`                    | `{requisitionId,title,deadline,sealed}` from approved requisition             |
| POST   | `/api/rfqs/:id/invite`         | `{vendorIds:[...]}`; queue invitations                                        |
| POST   | `/api/rfqs/:id/amend`          | `{deadline,terms,reason}`; increment RFQ version and queue notices            |
| POST   | `/api/rfqs/:id/acknowledge`    | Vendor acknowledges current RFQ version                                       |
| POST   | `/api/rfqs/:id/quotes`         | Submit immutable quotation version                                            |
| POST   | `/api/rfqs/:id/open`           | Close bidding and open evaluation; sealed deadline enforced                   |
| GET    | `/api/rfqs/:id/comparison`     | Eligible offers, normalized lines, costs, FX and scoring formulas             |
| POST   | `/api/rfqs/:id/award`          | `{reason,lines:[{quoteLineId,quantity}]}`; request award approval             |
| POST   | `/api/orders/:id/acknowledge`  | Vendor accepts own issued PO                                                  |
| GET    | `/api/orders/:id/document`     | Authorized PO data used by printable view                                     |
| POST   | `/api/orders/:id/receive`      | Accepted / rejected quantities; `Idempotency-Key` required                    |
| POST   | `/api/orders/:id/invoices`     | Invoice lines, explicit freight/charges; match or exception                   |
| POST   | `/api/invoices/:id/payments`   | Record confirmed manual payment                                               |
| POST   | `/api/stock`                   | Issue, reserve, release, positive admin adjustment or quarantine return       |
| POST   | `/api/vendors`                 | Create unqualified supplier                                                   |
| POST   | `/api/vendors/:id/qualify`     | `{status,reason}`; approve, suspend or block                                  |
| POST   | `/api/vendors/:id/invite`      | `{entityId}`; queue one-use portal onboarding link                            |
| POST   | `/api/supplier-items`          | Verify product/vendor/country mapping and snapshot old price                  |
| POST   | `/api/documents/upload`        | `{entityId,name,contentType,size}`; presign private upload, 5 minutes         |
| GET    | `/api/documents/:id/download`  | 60-second signed link only for authorized CLEAN documents                     |

## Request examples

All monetary fields accept decimal strings, up to 6 fractional places. Quantities are explicit base units except quote `offeredQuantity` and `moq`, which are offered purchasing units/packs. Dates include a timezone offset or `Z`.

Requisition:

```json
{
  "entityId": "...",
  "departmentId": "...",
  "warehouseId": "...",
  "budgetId": "...",
  "justification": "Quarterly replenishment",
  "requiredAt": "2026-11-01T09:00:00+02:00",
  "lines": [
    {
      "productId": "...",
      "quantity": "100",
      "estimatedUnitPrice": "12",
      "specifications": "A4 80gsm"
    }
  ]
}
```

Quotation:

```json
{
  "currency": "EGP",
  "fxRate": "1",
  "fxSource": "Entity base currency",
  "fxAt": "2026-10-11T15:00:00Z",
  "freight": "50",
  "otherCharges": "0",
  "paymentTerms": "Net 30",
  "validUntil": "2026-11-11T15:00:00Z",
  "leadDays": 3,
  "lines": [
    {
      "rfqLineId": "...",
      "offeredQuantity": "20",
      "packFactor": "5",
      "unitPrice": "60",
      "discountPercent": "0",
      "taxPercent": "14",
      "taxRecoverable": false,
      "moq": "1",
      "compliant": true,
      "deviation": ""
    }
  ]
}
```

Portal offers cannot specify foreign currency/FX or recoverable tax. Internal external offers additionally specify an invited `vendorId` and `source` `EMAIL` or `MANUAL`. Enter freight and other charges explicitly; omitted values fail validation. Original quote documents can be stored through the document boundary, but transaction-to-attachment linking is not yet implemented.

Receipt:

```json
{
  "lines": [
    {
      "purchaseOrderLineId": "...",
      "accepted": "30",
      "rejected": "5",
      "reason": "Five damaged units quarantined"
    }
  ]
}
```

Send `Idempotency-Key: receipt-unique-123`. A retry with the same actor/order/key returns the committed receipt. Keys are tenant-scoped and must have 8–100 alphanumeric, underscore or hyphen characters. Reusing a key for a changed payload currently returns the original receipt, so create a new key only for a genuinely new posting.

Invoice:

```json
{
  "number": "SUPPLIER-2026-001",
  "dueAt": "2026-11-11T15:00:00Z",
  "freight": "0",
  "otherCharges": "0",
  "lines": [
    { "purchaseOrderLineId": "...", "quantity": "20", "unitPrice": "12" }
  ]
}
```

Payment:

```json
{
  "amount": "273.60",
  "reference": "BANK-REF-UNIQUE",
  "source": "MANUAL_BANK_CONFIRMATION",
  "paidAt": "2026-10-11T15:00:00Z"
}
```

`ERP` source is rejected until an authorized adapter exists. This endpoint never initiates a bank transfer.

## External integrations

No ERP, identity, extraction or payment integrations are implemented. Odoo, SAP, Dynamics and Oracle are explicitly unimplemented. Future adapters should map canonical product IDs, legal-entity IDs, source transaction versions and external idempotency keys; they must authenticate and verify webhook signatures before posting through domain services. Never let an adapter directly edit stock balances or mark invoices paid without an authorized source.
