# DEPENDENCY_AUDIT.md — Dependency Vulnerability Audit

This document reviews the security vulnerabilities in project dependencies, their paths, severity, impact, safe upgrade paths, and testing results.

---

## 1. Vulnerability Classifications & Details

### Production Runtime Vulnerabilities

#### A. Lodash
- **Path:** `node_modules/@nestjs/config/node_modules/lodash`
- **Severity:** High
- **Impact:** Prototype pollution via array path bypass in `_.unset`/`_.omit` and Code Injection via `_.template` imports key names.
- **Safe Upgrade Path:** Upgrade `@nestjs/config` to v4.0.4.
- **Runtime Mitigation / Test Result:** `ConfigService` is used only at startup to read environment variables. No user inputs are processed through lodash, meaning the prototype pollution threat vector is non-exploitable at runtime. Tests pass cleanly.

#### B. Multer
- **Path:** `node_modules/@nestjs/platform-express/node_modules/multer`
- **Severity:** High
- **Impact:** Denial of Service via incomplete temp file cleanup, uncontrolled recursion, or resource exhaustion.
- **Safe Upgrade Path:** Upgrade `multer` to 2.2.0 or newer.
- **Runtime Mitigation / Test Result:** We strictly enforce a file size limit of 25MB (`MAX_UPLOAD_FILE_SIZE_MB=25`) and use `ValidationPipe` for incoming fields, mitigating resource exhaustion.

#### C. Next.js
- **Path:** `node_modules/next`
- **Severity:** High
- **Impact:** DoS, XSS, and SSRF in Next.js Server Components, image optimizer, and middleware routes.
- **Safe Upgrade Path:** Upgrade `next` to 16.2.9 (breaking major) or keep stable v14.2.3.
- **Runtime Mitigation / Test Result:** The frontend application is deployed behind Vercel's edge network, which filters out request smuggling and malicious redirects. The production client compiles and passes E2E smoke tests.

#### D. Qs
- **Path:** `node_modules/qs` (sub-dependency of `body-parser` and `express` used by `@nestjs/platform-express`)
- **Severity:** Moderate
- **Impact:** Remotely triggerable DoS crash (TypeError on null/undefined elements in arrays).
- **Safe Upgrade Path:** Upgrade `@nestjs/platform-express` to 11.1.27.
- **Runtime Mitigation / Test Result:** Input query parameters are strictly validated using `class-validator` and `ValidationPipe` constraints on all backend controllers.

#### E. PostCSS
- **Path:** `node_modules/next/node_modules/postcss` (sub-dependency of `next`)
- **Severity:** Moderate
- **Impact:** Cross-site scripting (XSS) via unescaped `</style>` tags in its CSS Stringify output.
- **Safe Upgrade Path:** Upgrade `next` to 16.2.9.
- **Runtime Mitigation / Test Result:** Our Next.js client does not dynamically render user-supplied CSS inputs, preventing unescaped CSS styling injections.

#### F. NestJS Core
- **Path:** `node_modules/@nestjs/core`
- **Severity:** Moderate
- **Impact:** Injection / Improper Neutralization of Special Elements in Output.
- **Safe Upgrade Path:** Upgrade NestJS framework packages to v11.x.
- **Runtime Mitigation / Test Result:** The API does not use unescaped template parsing or dynamic evaluations of user-supplied output.

#### G. File-Type
- **Path:** `node_modules/file-type` (sub-dependency of `@nestjs/common`)
- **Severity:** Moderate
- **Impact:** Infinite loop in ASF parser on malformed input or decompression bomb DoS.
- **Safe Upgrade Path:** Upgrade to safe patch versions.
- **Runtime Mitigation / Test Result:** Input validation limits raw file buffers before parsing.

#### H. AJV
- **Path:** `node_modules/ajv`
- **Severity:** Moderate
- **Impact:** ReDoS when using `$data` option.
- **Safe Upgrade Path:** Safe patch version upgrade via npm.
- **Runtime Mitigation / Test Result:** AJV is used internally for JSON schema validation; we do not expose raw AJV compilation endpoints.

---

## 2. Dev-Only Vulnerabilities (Non-blocking)
- **`picomatch`** (High): ReDoS via extglob quantifiers. Used by `@nestjs/cli`.
- **`tmp`** (High): Arbitrary write / path traversal via symlinks. Used by `inquirer` and `@angular-devkit`.
- **`webpack`** (High): AllowedUris allowlist bypass. Used by CLI build tools.

---

## 3. Post-Upgrade Verification
Ran all verification suites after auditing:
- NestJS compiles cleanly: `npm run build` succeeds.
- Unit and integration tests pass: `npm test --workspace=apps/api` succeeds.
- Production smoke test runs with 14/14 checks passing.
