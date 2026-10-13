-- Run as the schema owner/migration role after provisioning a distinct atlas_runtime login.
-- Create that login and password through your database provider, never source-control a password.
GRANT USAGE ON SCHEMA public TO atlas_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atlas_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON "Audit", "StockMovement", "Receipt", "ReceiptLine", "Quote", "QuoteLine", "Payment" FROM atlas_runtime;
REVOKE ALL ON "_prisma_migrations" FROM atlas_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM atlas_runtime;
-- Apply after each future migration to cover newly created tables. No default DDL grants.
