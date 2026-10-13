# Administrator and vendor guide

## Fictional demo walkthrough

1. Sign in as `requester@atlas.example`. Create a request under an entity, department, budget and warehouse. Select products, base quantities, estimated prices, justification and required date. Submit it. Inventory availability is checked when submitted and recorded in audit evidence.
2. Sign in as `approver@atlas.example`. Open Approvals and approve the request with a reason. The requester cannot approve their own request even if their role changes.
3. Sign in as `buyer@atlas.example`. Open Requisitions and create an RFQ from the approved request. For a quick demonstration choose **unsealed** bidding; sealed bidding requires waiting until the deadline before opening bids.
4. Open Sourcing & RFQs and invite eligible suppliers. The queue worker delivers development notices to Mailpit; the status indicates SMTP acceptance, not actual vendor mailbox delivery.
5. Sign in as the invited `vendorN@atlas.example`. In Invitations & Quotes, enter an offer: purchasing packs, explicit units per pack, pack price, freight/other charges, tax, delivery time and terms. Portal offers use entity currency. Submit; each revision creates a preserved version.
6. As buyer, open bidding and Compare offers. Inspect normalized base price, payable total, evaluation cost, eligibility and FX evidence. For the seeded Cairo RFQ, Cedar quotes 10 EGP per base unit plus 700 EGP freight; Northstar quotes 12 EGP plus 50 EGP freight. On 100 units of each of two lines, recoverable-tax evaluation costs are **2,700 EGP** and **2,450 EGP** respectively. Lower unit price does not guarantee lower delivered cost.
7. Propose an award, allocating every requested unit. Use “Split allocation” for more than one supplier. Quantities must comply with each supplier's pack conversion, MOQ and capacity. Record why you selected the suppliers. Partial basket awards still incur that supplier's full freight.
8. As a separate approver, approve the award. Purchase orders are created and budget commitment is posted within the same transaction.
9. As warehouse staff, open a PO and Receive. Post accepted and rejected base units. Accepted goods become available; rejected attempts enter quarantine. Repeated submission with the same posting key cannot double-post. Inventory shows accepted on-hand, reserved, available, quarantine and incoming PO balance.
10. As finance, capture an invoice from the PO. Invoiced goods quantities cannot exceed accepted balances, less previous matched invoices. Services match ordered quantity. Freight and charges cannot exceed the remaining approved allowance. Exceptions stay unpaid and do not consume budget.
11. Record a confirmed bank payment only after a real payment occurred. Enter its unique bank reference and actual date. The platform records payment status; it does not transfer money.

The seed already contains a split award, two supplier POs, a partial receipt with 5 rejected units per line, one matched invoice and one invoice exception.

## Supplier onboarding

A buyer creates a supplier profile, initially pending. A group/entity administrator verifies qualification with a recorded reason. Buyers can invite the supplier to the portal with a selected legal entity. The email contains a seven-day, one-use token. The supplier accepts it, creates a 14+ character password and then signs in. Accounts have no access to other suppliers' records.

Seed vendors already have portal accounts; inviting the same primary contact again is intentionally rejected. Use a new fictional supplier to test onboarding.

When an RFQ is amended, the supplier must acknowledge the new version before submitting again. Previous offer versions remain visible to that supplier. A buyer evaluates only the latest quote on the current RFQ version. Late offers are rejected.

## Master-data administration

Group and entity administrators can use **Master data** to add products and services, entity departments and cost centers, delivery warehouses, and entity budgets. Products are tenant-wide; the other records are restricted to the selected legal entity. Budget currency must match the entity currency, and a budget must belong to a department in that entity. New records are audit logged.

- `scripts/bootstrap.ts`: initializes an empty production database and one group administrator.
- `scripts/provision.ts`: bulk-adds departments, warehouses, entity users and products from a validated local JSON file. Set `PROVISION_FILE` to its absolute path and `PROVISION_PASSWORD` only when creating users. Supply `tenantId`, `entityId`, and a valid group administrator `operatorId`. All changes are audited.
- `scripts/password.ts`: rotates a user's password and revokes their sessions. Set `RESET_EMAIL` and `RESET_PASSWORD` in a secure local environment.

Example provisioning configuration (IDs come from your database/authorized workspace, never guess them):

```json
{
  "tenantId": "YOUR_TENANT_ID",
  "entityId": "YOUR_ENTITY_ID",
  "operatorId": "YOUR_GROUP_ADMIN_ID",
  "departments": [{ "name": "Operations", "costCenter": "OPS-01" }],
  "warehouses": [
    {
      "name": "Cairo central warehouse",
      "location": "Approved delivery address"
    }
  ],
  "users": [
    {
      "name": "Procurement Buyer",
      "email": "buyer@yourcompany.com",
      "role": "BUYER"
    }
  ],
  "products": [
    {
      "sku": "PAPER-A4-80",
      "name": "A4 paper 80gsm",
      "category": "Paper",
      "baseUnit": "ream",
      "purchaseUnit": "box",
      "packFactor": 5,
      "kind": "GOODS",
      "reorderPoint": 20,
      "targetStock": 200
    }
  ]
}
```

Prefer provisioning one user per run with a unique password. If a shared temporary provisioning password is used, rotate every account separately before granting live access. There is no forced password-change screen in this release. Keep provisioning config/passwords outside the repository. Additional legal entities and users are currently provisioned through trusted operator scripts or reviewed database administration.

## UI and exports

The entity selector filters authorized records; it never grants extra access. Search applies to the current page/workspace data. CSV exports preserve text safety for spreadsheet formula injection and can be opened in Excel. Purchase order “Print / Save PDF” uses the browser print dialog; a server-generated PDF endpoint is not implemented.

Arabic toggles navigation and layout direction; record text remains as entered and most form labels remain English. “All legal entities” is a group view that preserves entity currencies, not a currency-consolidated accounting report.

## Known operational limits

Review COVERAGE.md. This release supports a single separate approver, not advanced approval chains. POs cannot yet be cancelled/amended, and invoice exception remediation/voids/credits are not complete. Do not work around those limits by directly changing posted stock, quotation versions or audit records. Add the correct correcting-transaction workflows before applying them to live procurement operations.
