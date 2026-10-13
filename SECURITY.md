# Security

This release is a core pilot; see docs/COVERAGE.md and docs/OPERATIONS.md for gaps and deployment requirements. Do not store production procurement records until the relevant identity, lifecycle, access and operational requirements are validated.

Report potential security issues privately to the repository owner using the repository's private security advisory feature when enabled. Do not put credentials, customer/vendor details or working exploitation payloads in public issues.

Use a non-owner runtime database role, HTTPS, environment-specific secrets and separate staging/production resources. Run the automated verification and review dependency advisories before deployment. No independent penetration test or external compliance certification has been performed.
