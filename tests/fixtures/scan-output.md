# Security Scan Results

**Scan Date:** 2026-01-08
**Tool:** security-scanning:sast v1.0.0
**Files Scanned:** 42
**Lines Scanned:** 5,820

---

## Critical Issues (1)

- [critical] src/database/query.js:42 - Potential SQL injection vulnerability: User input directly concatenated into SQL query

## High Severity Issues (2)

- [high] src/views/profile.ejs:28 - Unescaped user input in HTML template may lead to XSS attack
- [high] src/middleware/auth.js:15 - Authentication bypass: Missing token validation in protected route

## Medium Severity Issues (2)

- [medium] src/utils/crypto.js:10 - Weak cryptographic algorithm: MD5 should not be used for password hashing
- [medium] src/config/database.js:5 - Hardcoded database password found in source code

## Low Severity Issues (1)

- [low] src/utils/token.js:22 - Using Math.random() for security-sensitive operations is not recommended

---

## Summary

- **Total Issues:** 6
- **Critical:** 1
- **High:** 2
- **Medium:** 2
- **Low:** 1

**Recommendation:** Address critical and high severity issues immediately before deploying to production.
