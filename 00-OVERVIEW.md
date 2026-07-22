# Valet POS — Product Overview

## 1. Product Definition

Mobile Android app for valet parking stands, deployed on **Sunmi handheld POS terminals** (1GB RAM / 8GB storage, built-in thermal printer, barcode/QR scanner, WiFi + 4G, Type-C). Replaces manual paper ticketing with digital check-in, fixed-fee billing, and instant printed slips.

## 2. Target Users

- **Primary**: Valet attendants / parking stand owners operating a single Sunmi device per location.
- **Scale unit**: one "Location" account = one physical stand, one or more attendants sharing login.

## 3. Core Value Proposition

| Problem | Solution |
|---|---|
| Manual paper tickets, no record | Digital check-in, printed slip w/ barcode |
| No sales visibility | Report screen — daily totals, ticket count |
| Ambiguous vehicle fees | Fixed-fee logic (Bike ₨50 / Car ₨100), editable override |
| No proof of payment | Slip shows payment status, timestamp, location, logo |

## 4. Scope (v1)

**In scope:**
- Manual registration/login, multi-account support
- Check-in flow: Bike / Car → form → slip generation
- Slip: vehicle no., type, location, logo, barcode, payment status, instructions
- Report: daily ticket count + revenue total
- Profile: view registered account details
- Native Sunmi printer + scanner integration
- Offline-first check-in (queued sync)

**Out of scope (v1):**
- Multi-device sync across multiple stands under one owner
- Online payment gateways (cash-only v1)
- Customer-facing app / SMS notifications
- Multi-language UI (English only v1)

## 5. Non-Functional Requirements

- Runs acceptably on 1GB RAM / 8GB storage Android device
- Cold start < 3s, check-in-to-slip flow < 5s end-to-end
- Functions with zero/poor connectivity (offline queue)
- APK installable without Play Store (sideload)

## 6. Document Set

| File | Purpose |
|---|---|
| `00-OVERVIEW.md` | This file — scope, goals |
| `01-ARCHITECTURE.md` | System architecture, tech stack, folder structure |
| `02-FEATURES-LOGIC.md` | Full feature-by-feature functional logic |
| `03-DATA-SCHEMA.md` | Convex schema, entities, relations, indexes |
| `04-SECURITY.md` | OWASP MASVS-aligned security requirements |
| `05-DEV-ROADMAP-BENCHMARKS.md` | Build phases, performance benchmarks, QA criteria |
