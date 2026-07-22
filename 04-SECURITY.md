# Security Requirements (OWASP MASVS-Aligned)

## 1. Authentication (MASVS-AUTH)

- Passwords hashed server-side via Better Auth (bcrypt/argon2, never client-side hashing as a substitute for TLS).
- Min password policy enforced client + server: 8+ chars, 1 letter, 1 number.
- No password ever logged, cached in plaintext, or included in crash reports.
- Session tokens stored in MMKV with encryption enabled (`MMKV.initialize` with encryption key from Android Keystore).
- Logout clears session token fully — no residual auth state in memory or storage.
- Rate-limit login attempts server-side (Convex function) — lock after 5 failed attempts / 15 min window.

## 2. Network Communication (MASVS-NETWORK)

- All Convex traffic over HTTPS/TLS — enforced by Convex platform, no plaintext fallback.
- Certificate pinning: not required v1 (Convex-managed infra), revisit if compliance mandates it.
- No sensitive data (passwords, tokens) in URL query params — POST body / headers only.

## 3. Data Storage (MASVS-STORAGE)

- No plaintext PII in local SQLite beyond operational necessity (vehicle numbers are not PII-sensitive, but no customer names/phone numbers stored v1 — reduces exposure).
- MMKV encryption key derived from Android Keystore, not hardcoded.
- Logo images stored via Convex file storage (signed URLs), not embedded as base64 in local DB long-term.
- No sensitive data written to Android logcat in production builds (`console.log` stripped via Babel plugin in release builds).

## 4. Platform Interaction (MASVS-PLATFORM)

- GPS permission (`ACCESS_FINE_LOCATION`) requested only at signup point-of-use, with clear rationale shown before OS prompt.
- Camera/storage permission for logo upload requested only when user taps upload button, not on app launch.
- Native Sunmi module (Kotlin) validates all inputs from JS side before passing to hardware SDK — prevents malformed intent injection to printer/scanner broadcast receivers.

## 5. Code Quality (MASVS-CODE)

- TypeScript strict mode enabled (`strict: true` in `tsconfig.json`) — eliminates whole class of runtime type errors.
- No `eval`, no dynamic `require`, no unsanitized deep-linking handlers.
- Dependency audit: `npm audit` run pre-release; no known-critical-CVE packages shipped.
- ProGuard/R8 enabled on release builds — obfuscates + shrinks APK, raises reverse-engineering bar.

## 6. Resilience (MASVS-RESILIENCE)

- Root/emulator detection: not enforced v1 (low-risk cash-handling app, not a payment-credential app) — revisit if online payments added later.
- APK signed with release keystore; keystore file + passwords never committed to repo (stored in CI secrets / local `.env`, gitignored).

## 7. Input Validation (general, cross-cutting)

| Input | Rule |
|---|---|
| Vehicle Number | alphanumeric, max 20 chars, sanitized before SQLite/Convex write |
| Amount | numeric, > 0, max 6 digits (prevents fat-finger ₨100000000 entry) |
| Email | RFC 5322 pattern, server-revalidated (never trust client validation alone) |
| Location Name | 3-60 chars, stripped of leading/trailing whitespace |
| GPS coords | bounds-checked (valid lat/lng range) before storage |

## 8. Convex Function-Level Security

- Every mutation/query derives `locationId`/`userId` from **authenticated session context**, never from client-supplied payload — prevents IDOR (a malicious client can't read/write another location's tickets by guessing IDs).
- Convex functions validate `v.*` schema types at the boundary — malformed payloads rejected before reaching business logic.

## 9. Secrets Management

- No API keys/secrets embedded in RN bundle (bundle is trivially extractable from APK).
- Convex deployment URL is safe to embed (public, no secret); actual auth/session logic never trusts client without server-side verification.
- `.env` files gitignored; example `.env.example` committed with placeholder values only.

## 10. Release Checklist (security gate before shipping APK)

- [ ] `npm audit` clean (no high/critical)
- [ ] ProGuard/R8 enabled, release build tested
- [ ] No `console.log`/debug logging in release bundle
- [ ] Login rate-limiting verified functional
- [ ] MMKV encryption verified (inspect device storage, confirm non-plaintext)
- [ ] All Convex functions confirmed session-scoped (manual IDOR test: attempt cross-location read with valid-but-wrong session)
