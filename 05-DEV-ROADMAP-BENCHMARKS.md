# Development Roadmap & Benchmarks

## 1. Build Phases

### Phase 1 — Foundation (Day 1)
- RN bare workflow init, TypeScript, NativeWind config
- Navigation skeleton (all screens stubbed, matches prototype flow)
- Zustand store scaffold
- Deliverable: navigable app shell, no backend yet

### Phase 2 — Backend & Auth (Day 2)
- Convex project setup, schema deployed (`03-DATA-SCHEMA.md`)
- Better Auth integration (signup/login/logout wired end-to-end)
- Deliverable: functional auth flow against real Convex backend

### Phase 3 — Sunmi Native Integration (Day 3-4)
- Kotlin native module: printer bridge (`InnerPrinterManager`)
- Kotlin native module: scanner bridge (broadcast intent listener)
- On-device testing on actual Sunmi terminal (bottleneck step — no emulator equivalent)
- Deliverable: `SunmiBridge.printSlip()` + `scanBarcode()` working on hardware

### Phase 4 — Core Flow Logic (Day 4-5)
- Check-in form → local SQLite write → print → Convex sync
- Offline queue + background sync engine
- Report screen (local + Convex merged query)
- Deliverable: full check-in-to-slip-to-sync flow functional offline and online

### Phase 5 — Polish & Hardening (Day 5-6)
- Error states, edge cases (no paper, scan fail, no connectivity)
- Security checklist pass (`04-SECURITY.md` §10)
- ProGuard/R8 release build, APK signing
- Deliverable: shippable signed APK

## 2. Performance Benchmarks (target, 1GB RAM device)

| Metric | Target | Notes |
|---|---|---|
| Cold start | < 3.0s | Hermes + minimal bundle |
| Check-in → slip printed | < 5.0s | includes native print call |
| Barcode scan → lookup result | < 1.5s | local SQLite lookup, no network dependency |
| APK size | < 25MB | keep deps lean, avoid heavy image libs |
| Memory footprint (idle) | < 150MB | monitor via `adb shell dumpsys meminfo` |
| Memory footprint (peak, printing) | < 250MB | avoid OOM kill risk on 1GB device |
| Offline queue capacity | 500+ tickets | before sync required, local SQLite handles easily |
| Sync latency (on reconnect) | < 2s per ticket | batched where possible |

## 3. Testing Strategy

- **Unit tests**: validation logic (amount, plate number, email) — Jest.
- **Integration tests**: Convex functions (mutation/query correctness, session scoping/IDOR checks).
- **Manual on-device QA**: printer/scanner (no reliable emulator path) — required before every release.
- **Offline simulation**: airplane mode toggle test — verify check-in still completes, slip still prints, sync recovers correctly on reconnect.

## 4. Definition of Done (v1 MVP)

- [ ] All 8 features in `02-FEATURES-LOGIC.md` implemented and manually verified on physical Sunmi device
- [ ] Offline check-in + delayed sync verified with zero data loss across 3 consecutive offline/online cycles
- [ ] Security checklist (`04-SECURITY.md` §10) fully passed
- [ ] Performance benchmarks (§2 above) met on target device
- [ ] Signed release APK installs cleanly via sideload on clean Sunmi device

## 5. Post-MVP Backlog (v1.1+)

- Multi-device sync per location (2nd Sunmi unit at same stand)
- Editable location profile (logo/name update)
- Revenue breakdown by vehicle type on Report screen
- Configurable instructions text per location
- Root/jailbreak detection if online payments introduced
- Multi-language support (Urdu UI)
