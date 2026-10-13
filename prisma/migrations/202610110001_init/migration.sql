-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "policy" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costCenter" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "vendorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEntity" (
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "UserEntity_pkey" PRIMARY KEY ("userId","entityId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradingName" TEXT,
    "email" TEXT NOT NULL,
    "taxId" TEXT,
    "registrationId" TEXT,
    "countries" TEXT[],
    "currencies" TEXT[],
    "deliveryAreas" TEXT[],
    "categories" TEXT[],
    "paymentTerms" TEXT NOT NULL DEFAULT 'Net 30',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "qualification" TEXT NOT NULL DEFAULT 'Unverified vendor claims',
    "verifiedAt" TIMESTAMP(3),
    "reason" TEXT,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "score" DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'QUEUED',

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "manufacturer" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'GOODS',
    "baseUnit" TEXT NOT NULL DEFAULT 'piece',
    "purchaseUnit" TEXT NOT NULL DEFAULT 'piece',
    "packFactor" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "specifications" TEXT NOT NULL DEFAULT '',
    "reorderPoint" DECIMAL(18,6) NOT NULL DEFAULT 10,
    "targetStock" DECIMAL(18,6) NOT NULL DEFAULT 100,
    "stockTracked" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorSku" TEXT NOT NULL,
    "manufacturerRef" TEXT,
    "unit" TEXT NOT NULL,
    "packFactor" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "moq" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "leadDays" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "contractId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "priceHistory" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "allocated" DECIMAL(18,6) NOT NULL,
    "committed" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "actual" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "budgetId" TEXT,
    "justification" TEXT NOT NULL,
    "requiredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "singleSource" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "estimatedUnitPrice" DECIMAL(18,6) NOT NULL,
    "specifications" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetVersion" INTEGER NOT NULL,
    "requesterId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'APPROVER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "policySnapshot" JSONB NOT NULL,
    "decidedBy" TEXT,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "requisitionId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "budgetId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deadline" TIMESTAMP(3) NOT NULL,
    "sealed" BOOLEAN NOT NULL DEFAULT true,
    "openedAt" TIMESTAMP(3),
    "latePolicy" TEXT NOT NULL DEFAULT 'REJECT',
    "terms" TEXT NOT NULL DEFAULT 'Net 30; delivery to requested warehouse',
    "weights" JSONB NOT NULL DEFAULT '{"price":60,"lead":20,"performance":20}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqLine" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "specifications" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RfqLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqVendor" (
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "acknowledgedVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RfqVendor_pkey" PRIMARY KEY ("rfqId","vendorId")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rfqVersion" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8) NOT NULL,
    "fxSource" TEXT NOT NULL,
    "fxAt" TIMESTAMP(3) NOT NULL,
    "freight" DECIMAL(18,6) NOT NULL,
    "otherCharges" DECIMAL(18,6) NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "source" TEXT NOT NULL DEFAULT 'PORTAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rfqLineId" TEXT NOT NULL,
    "offeredQuantity" DECIMAL(18,6) NOT NULL,
    "packFactor" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "discountPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxRecoverable" BOOLEAN NOT NULL DEFAULT false,
    "moq" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "compliant" BOOLEAN NOT NULL DEFAULT true,
    "deviation" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "evaluationSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardLine" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "quoteLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "AwardLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "budgetId" TEXT,
    "currency" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "fxRate" DECIMAL(18,8) NOT NULL,
    "freight" DECIMAL(18,6) NOT NULL,
    "otherCharges" DECIMAL(18,6) NOT NULL,
    "total" DECIMAL(18,6) NOT NULL,
    "baseTotal" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quoteLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "packFactor" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "taxPercent" DECIMAL(6,3) NOT NULL,
    "received" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rejected" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "postedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "accepted" DECIMAL(18,6) NOT NULL,
    "rejected" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reservedDelta" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quarantineDelta" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "reference" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "total" DECIMAL(18,6) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXCEPTION',
    "exceptions" JSONB NOT NULL,
    "matchSnapshot" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "reference" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "ceiling" DECIMAL(18,6) NOT NULL,
    "categories" TEXT[],

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vendorId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idempotency" (
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("tenantId","key")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Entity_tenantId_idx" ON "Entity"("tenantId");

-- CreateIndex
CREATE INDEX "Department_tenantId_entityId_idx" ON "Department"("tenantId", "entityId");

-- CreateIndex
CREATE INDEX "Warehouse_tenantId_entityId_idx" ON "Warehouse"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_status_idx" ON "Vendor"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_tenantId_email_key" ON "Vendor"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_entityId_idx" ON "Invitation"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "SupplierItem_tenantId_productId_idx" ON "SupplierItem"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItem_vendorId_productId_country_key" ON "SupplierItem"("vendorId", "productId", "country");

-- CreateIndex
CREATE INDEX "Budget_tenantId_entityId_idx" ON "Budget"("tenantId", "entityId");

-- CreateIndex
CREATE INDEX "Requisition_tenantId_entityId_status_idx" ON "Requisition"("tenantId", "entityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_tenantId_reference_key" ON "Requisition"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "Approval_tenantId_entityId_status_idx" ON "Approval"("tenantId", "entityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_targetType_targetId_targetVersion_key" ON "Approval"("targetType", "targetId", "targetVersion");

-- CreateIndex
CREATE INDEX "Rfq_tenantId_entityId_idx" ON "Rfq"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_tenantId_reference_key" ON "Rfq"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "Quote_tenantId_entityId_idx" ON "Quote"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_rfqId_vendorId_version_key" ON "Quote"("rfqId", "vendorId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteLine_quoteId_rfqLineId_key" ON "QuoteLine"("quoteId", "rfqLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Award_rfqId_key" ON "Award"("rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "AwardLine_awardId_quoteLineId_key" ON "AwardLine"("awardId", "quoteLineId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_entityId_idx" ON "PurchaseOrder"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_reference_key" ON "PurchaseOrder"("tenantId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_awardId_vendorId_key" ON "PurchaseOrder"("awardId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_tenantId_idempotencyKey_key" ON "Receipt"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_entityId_warehouseId_productId_idx" ON "StockMovement"("tenantId", "entityId", "warehouseId", "productId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_entityId_idx" ON "Invoice"("tenantId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_vendorId_number_key" ON "Invoice"("tenantId", "vendorId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_purchaseOrderLineId_key" ON "InvoiceLine"("invoiceId", "purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_reference_key" ON "Payment"("tenantId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_tenantId_reference_key" ON "Contract"("tenantId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Document_key_key" ON "Document"("key");

-- CreateIndex
CREATE INDEX "Audit_tenantId_entityId_createdAt_idx" ON "Audit"("tenantId", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_availableAt_idx" ON "Job"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "UserEntity" ADD CONSTRAINT "UserEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqVendor" ADD CONSTRAINT "RfqVendor_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardLine" ADD CONSTRAINT "AwardLine_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tenant ownership and relational integrity supplement Prisma's scalar scope columns.
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_id_tenant_unique" UNIQUE ("id","tenantId");
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_id_tenant_unique" UNIQUE ("id","tenantId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
ALTER TABLE "Product" ADD CONSTRAINT "Product_id_tenant_unique" UNIQUE ("id","tenantId");
ALTER TABLE "User" ADD CONSTRAINT "User_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
ALTER TABLE "User" ADD CONSTRAINT "User_vendor_scope_fk" FOREIGN KEY ("vendorId","tenantId") REFERENCES "Vendor"("id","tenantId");
ALTER TABLE "UserEntity" ADD CONSTRAINT "UserEntity_entity_fk" FOREIGN KEY ("entityId") REFERENCES "Entity"("id");
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['Department','Warehouse','Budget','Requisition','Approval','Rfq','Quote','Award','PurchaseOrder','Receipt','StockMovement','Invoice','Payment','Contract','Document','Job','Invitation'] LOOP
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("entityId","tenantId") REFERENCES "Entity"("id","tenantId")',tbl,tbl||'_entity_scope_fk');
 END LOOP;
END $$;
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_vendor_fk" FOREIGN KEY ("vendorId","tenantId") REFERENCES "Vendor"("id","tenantId");
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_product_fk" FOREIGN KEY ("productId","tenantId") REFERENCES "Product"("id","tenantId");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_vendor_fk" FOREIGN KEY ("vendorId","tenantId") REFERENCES "Vendor"("id","tenantId");
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendor_fk" FOREIGN KEY ("vendorId","tenantId") REFERENCES "Vendor"("id","tenantId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_vendor_fk" FOREIGN KEY ("vendorId","tenantId") REFERENCES "Vendor"("id","tenantId");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_vendor_fk" FOREIGN KEY ("vendorId","tenantId") REFERENCES "Vendor"("id","tenantId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_pack_positive" CHECK ("packFactor">0);
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_valid_amounts" CHECK ("packFactor">0 AND "price">=0 AND "moq">0 AND "leadDays">=0);
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_valid_amounts" CHECK ("quantity">0 AND "estimatedUnitPrice">=0);
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_valid_amounts" CHECK ("offeredQuantity">0 AND "packFactor">0 AND "unitPrice">=0 AND "moq">0 AND "discountPercent" BETWEEN 0 AND 100 AND "taxPercent" BETWEEN 0 AND 100);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_valid_amounts" CHECK ("fxRate">0 AND "freight">=0 AND "otherCharges">=0 AND "leadDays">=0);
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_valid_quantities" CHECK ("quantity">0 AND "received">=0 AND "received"<="quantity" AND "rejected">=0);
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_valid_quantities" CHECK ("accepted">=0 AND "rejected">=0 AND "accepted"+"rejected">0);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_valid_amounts" CHECK ("allocated">=0 AND "committed">=0 AND "actual">=0);
CREATE FUNCTION atlas_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only; post a correcting transaction instead', TG_TABLE_NAME; END $$;
CREATE TRIGGER "Audit_immutable" BEFORE UPDATE OR DELETE ON "Audit" FOR EACH ROW EXECUTE FUNCTION atlas_immutable_record();
CREATE TRIGGER "StockMovement_immutable" BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION atlas_immutable_record();
CREATE TRIGGER "Receipt_immutable" BEFORE UPDATE OR DELETE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION atlas_immutable_record();
CREATE TRIGGER "ReceiptLine_immutable" BEFORE UPDATE OR DELETE ON "ReceiptLine" FOR EACH ROW EXECUTE FUNCTION atlas_immutable_record();
CREATE TRIGGER "Quote_immutable" BEFORE UPDATE OR DELETE ON "Quote" FOR EACH ROW EXECUTE FUNCTION atlas_immutable_record();
CREATE TRIGGER "QuoteLine_immutable" BEFORE UPDATE OR DELETE ON "QuoteLine" FOR EACH ROW EXECUTE FUNCTION atlas_immutable_record();
CREATE TRIGGER "Payment_immutable" BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION atlas_immutable_record();
