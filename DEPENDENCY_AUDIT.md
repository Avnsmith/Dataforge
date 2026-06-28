# DEPENDENCY_AUDIT.md — Dependency Vulnerability Audit

This document reviews the security vulnerabilities in project dependencies and details a remediation plan.

---

## 1. Vulnerability Classifications

The `npm audit` command reported 46 vulnerabilities (3 low, 35 moderate, 8 high).

### Dev Dependencies (Non-blocking for production runtime)
These dependencies are used only during build or testing stages and do not affect runtime production safety:
- **`picomatch`** (High): ReDoS via extglob quantifiers. Used by `@nestjs/cli`.
- **`tmp`** (High): Arbitrary write / path traversal via symlinks. Used by `inquirer` and `@angular-devkit`.
- **`webpack`** (High): AllowedUris allowlist bypass. Used by CLI build tools.

### Production Dependencies (Vulnerable at runtime)
These dependencies are part of the compiled application and executed in production:
- **`lodash`** (High): Prototype pollution / code injection via `_.template`. Sub-dependency of `@nestjs/config`.
- **`multer`** (High): Denial of Service via incomplete upload cleanup / deeply nested field names. Sub-dependency of NestJS file uploads.
- **`next`** (High): DoS/XSS/SSRF in App Router CSP nonces / image optimizer. Next.js framework in `apps/web`.
- **`qs`** (Moderate): DoS crash with TypeError on null/undefined comma-format arrays. Sub-dependency of express/body-parser.
- **`postcss`** (Moderate): XSS via unescaped CSS stringify output. Sub-dependency of `next`.

---

## 2. Remediation Plan

We did *not* run `npm audit fix --force` automatically because it would install breaking changes (e.g., upgrading `@nestjs/config` to 4.0.4, upgrading `@nestjs/platform-express` to 11.x, and upgrading Next.js to 16.2.9), which could break compatibility.

### Recommended Upgrade Strategy

1. **Next.js & PostCSS Upgrade:**
   - Upgrade Next.js to the latest stable v14/v15 release that fixes the vulnerabilities without major breaking changes:
     ```bash
     npm install --workspace=apps/web next@latest
     ```
2. **Multer & NestJS uploads:**
   - Clean up temporary files on upload failures inside code hooks, rather than relying solely on Multer's automatic file garbage collection.
   - Restrict incoming files and field counts using NestJS ValidationPipe and Multer options (e.g. limiting files size and field names length).
3. **Lodash and Config package:**
   - Update `@nestjs/config` manually to the latest patch version of the same major branch to get the lodash resolution update:
     ```bash
     npm update @nestjs/config
     ```
4. **Qs package:**
   - Ensure express/body-parser query parsing uses secure defaults (NestJS parses parameters carefully, and we have custom DTO validation Pipes to filter input types).
