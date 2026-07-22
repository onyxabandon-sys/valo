# Architecture & Tech Stack

## 1. Stack Summary

| Layer | Choice | Reason |
|---|---|---|
| App framework | React Native (bare workflow) | Custom native module required for Sunmi SDK — Expo managed unsupported |
| Language | TypeScript | Type safety, matches existing project conventions |
| Styling | NativeWind | Tailwind syntax on RN, matches design tokens directly |
| Backend | Convex | Realtime sync, serverless functions, generous free tier |
| Auth | Better Auth | Self-hosted, free, session-based |
| Local storage | MMKV + SQLite (op-sqlite) | MMKV for fast KV (session, prefs); SQLite for offline ticket queue |
| State mgmt | Zustand | Low overhead, fits 1GB RAM device |
| Native bridge | Kotlin (Sunmi Printer SDK / Scanner SDK) | Required — no official RN wrapper |
| Build | Gradle (bare RN) | Direct APK output, no Expo Go dependency |
| JS engine | Hermes | Enabled — reduces memory + startup cost |

**Rejected/why:** Expo managed workflow (no native module support without prebuild); Tailwind CSS raw (web-only, use NativeWind instead); React Query (Convex ships its own reactive hooks — redundant layer).

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────┐
│              Sunmi Handheld (Android)         │
│                                                │
│  ┌──────────────┐   ┌────────────────────┐   │
│  │  RN App (JS)  │──▶│ Native Module (Kt)  │   │
│  │  UI + Logic   │   │ Printer / Scanner   │   │
│  └──────┬───────┘   └─────────┬──────────┘   │
│         │                     │               │
│  ┌──────▼───────┐    ┌────────▼─────────┐    │
│  │ Local SQLite  │    │  Sunmi Hardware   │    │
│  │ (offline queue)│    │ (thermal printer, │    │
│  │ + MMKV (cache)│    │  barcode scanner) │    │
│  └──────┬───────┘    └───────────────────┘    │
└─────────┼──────────────────────────────────────┘
          │  (sync when online)
          ▼
┌─────────────────────────────────────────────┐
│                 Convex Backend                │
│  ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │  Auth       │ │  Mutations  │ │  Queries  │ │
│  │ (Better     │ │ (checkin,   │ │ (reports, │ │
│  │  Auth)      │ │  register)  │ │  slips)   │ │
│  └────────────┘ └────────────┘ └───────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │  Convex DB (locations, tickets, users)     │ │
│  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## 3. Folder Structure

```
valet-app/
├── android/                     # bare RN native project
│   └── app/src/main/java/.../SunmiModule.kt
├── src/
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── SignupScreen.tsx
│   │   ├── MenuScreen.tsx
│   │   ├── checkin/
│   │   │   ├── ChooseVehicleScreen.tsx
│   │   │   ├── VehicleFormScreen.tsx
│   │   │   └── SlipScreen.tsx
│   │   ├── ReportScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── native/
│   │   └── SunmiBridge.ts       # JS interface to Kotlin native module
│   ├── store/
│   │   └── useAppStore.ts       # Zustand store
│   ├── db/
│   │   ├── sqlite.ts            # offline queue schema + helpers
│   │   └── mmkv.ts              # session/prefs cache
│   ├── convex/
│   │   ├── schema.ts
│   │   ├── auth.ts
│   │   ├── tickets.ts
│   │   ├── locations.ts
│   │   └── reports.ts
│   ├── lib/
│   │   ├── sync.ts              # offline→online sync engine
│   │   ├── barcode.ts           # barcode payload encode/decode
│   │   └── validation.ts
│   └── App.tsx
├── app.json
├── package.json
└── tsconfig.json
```

## 4. Sunmi Native Module Contract

```ts
// src/native/SunmiBridge.ts
interface SunmiBridge {
  printSlip(payload: SlipPrintPayload): Promise<{ success: boolean }>;
  scanBarcode(): Promise<{ code: string }>;
  getPrinterStatus(): Promise<'ready' | 'no_paper' | 'error'>;
}
```

Kotlin side wraps `InnerPrinterManager` (Sunmi Printer SDK) + broadcast-intent scanner listener, exposed via `ReactContextBaseJavaModule`.

## 5. Offline-First Sync Model

1. Check-in always writes to local SQLite first (`status: 'pending_sync'`).
2. Slip prints immediately from local data — printer never blocked by network.
3. Background sync worker (on connectivity restore) pushes queued tickets to Convex mutation `tickets.create`.
4. Convex assigns canonical ticket ID; local record updated `status: 'synced'`.
5. Conflict policy: local ticket IDs are UUID-generated client-side — no collision risk, last-write-wins not needed since tickets are append-only.

## 6. Scalability Notes

- Convex scales per-function automatically; free tier covers ~1 location at moderate volume (est. <500 tickets/day).
- Multi-location support (future): add `locationId` partition key to all queries — already modeled in schema (see `03-DATA-SCHEMA.md`) to avoid future migration.
- If RAM becomes bottleneck: disable animations, lazy-load report/profile screens, keep bundle under ~15MB.
