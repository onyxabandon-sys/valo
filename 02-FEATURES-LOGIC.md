# Features & Functional Logic

## 1. Authentication & Registration

### 1.1 Sign Up
**Fields:**
- Location Name (replaces username) — `string`, required, 3-60 chars
- Logo / Profile Picture — `image upload`, optional, max 2MB, resized to 256x256 client-side before upload
- Email — `string`, required, RFC 5322 validated
- Password — `string`, required, min 8 chars, 1 number, 1 letter
- Confirm Password — must match Password
- Precise Location — captured via GPS on radio-button toggle; on enable, request `ACCESS_FINE_LOCATION` permission, store `{lat, lng}`

**Logic:**
1. Client-side validation (all fields) before submit.
2. On submit → Better Auth `signUp` call → Convex `users` record created, linked `locations` record created with `locationName`, `logoUrl`, `gps`.
3. Password hashed server-side (Better Auth handles this — never store plaintext, never log password field).
4. On success → session token stored in MMKV (encrypted) → navigate to Main Menu.
5. On failure → inline field errors, no generic "something went wrong" — specific: "Email already registered", "Passwords don't match", etc.

### 1.2 Login
- Email + Password → Better Auth `signIn`.
- Multi-user support: session scoped per device install; multiple accounts can log in sequentially (not simultaneously) on same device — logout required to switch.
- Session persists until explicit logout (no auto-expiry for v1, since device is shared/stand-based).

### 1.3 Logout
- Clears MMKV session token, Zustand store reset, navigates to Login.
- Does NOT clear local SQLite offline queue — unsynced tickets persist and sync once any authorized user logs back in and connectivity resumes.

## 2. Main Interface

Four centrally-aligned actions:
1. **Check-In** — primary action, opens vehicle type choice
2. **Report** — today's ticket count + revenue total
3. **Profile** — read-only account details
4. **Logout** — ends session

Menu screen also displays: location name, logo (avatar), registered address — pulled from session-cached `locations` record (no network call needed for display).

## 3. Check-In Flow

### 3.1 Vehicle Type Choice
Two cards: **Bike Parking (₨50)**, **Car Parking (₨100)**. Selecting either opens the same form component parameterized by `vehicleType` and `defaultAmount`.

### 3.2 Vehicle Form
**Fields:**
- Vehicle Number — manual text input, required, alphanumeric, max 20 chars
- Location — auto-filled from logged-in account's `locationName`, read-only display
- Amount — pre-filled with default (₨50 bike / ₨100 car), editable numeric input, min ₨0, no upper cap (attendant discretion)

**Submit logic:**
1. Validate: Vehicle Number non-empty, Amount is valid positive number.
2. Generate ticket object client-side:
   ```ts
   {
     id: uuid(),
     vehicleType: 'Car' | 'Bike',
     vehicleNumber: string,
     locationId: currentLocation.id,
     amount: number,
     paymentStatus: 'paid',        // v1: cash-only, always paid at check-in
     paymentMethod: 'cash',
     createdAt: ISO timestamp,
     syncStatus: 'pending',
     ticketNumber: nextSequentialId(locationId), // e.g. #1-0005
   }
   ```
3. Write to local SQLite immediately (offline-first — see `01-ARCHITECTURE.md` §5).
4. Encode barcode payload: ticket `id` (UUID) — barcode scan later resolves full record via lookup, not embedded JSON (keeps barcode short/scannable).
5. Trigger native print job via `SunmiBridge.printSlip()`.
6. Navigate to Slip screen showing generated ticket.
7. Fire-and-forget background sync attempt to Convex.

## 4. Slip Generation

**Printed/displayed slip contains:**
- Location name + logo
- Ticket title: "CAR PARKING TICKET" / "BIKE PARKING TICKET"
- Vehicle Number
- Vehicle Type
- Location (registered stand name)
- Amount
- Payment status badge ("PAID — CASH")
- Timestamp
- Barcode (scannable, encodes ticket UUID)
- Ticket sequence number (e.g. `#1-0005`)
- Instructions (static text, configurable per location in future — hardcoded v1: "Present this ticket at pickup. Not responsible for items left in vehicle. Lost ticket fee applies.")

**Actions on Slip screen:**
- **Print** — re-triggers `SunmiBridge.printSlip()` (idempotent, allows reprint if paper jam)
- **New Sale** — returns to Main Menu, ready for next check-in

## 5. Barcode Scan / Retrieval

- Scanning a printed ticket's barcode (via device scanner) triggers `SunmiBridge.scanBarcode()` → returns UUID.
- App queries local SQLite first (offline-capable lookup); falls back to Convex query if not found locally (e.g. synced-and-purged old ticket).
- Displays full ticket detail read-only (same fields as slip) — used for pickup verification / dispute resolution.

## 6. Report Screen

- Query: today's tickets for `locationId` where `createdAt` within local device's current calendar day.
- Displays: ticket count, revenue total (sum of `amount` where `paymentStatus = 'paid'`), breakdown by vehicle type (optional v1.1).
- Data source: local SQLite (fast, offline) merged with Convex if online (ensures cross-device consistency if location ever adds 2nd device).

## 7. Profile Screen

- Read-only display: Location Name, Email, Registered GPS location (reverse-geocoded to address string if online, raw coords if offline).
- Edit capability: out of scope v1 (future: allow logo/name update via Convex mutation).

## 8. Multi-User / Multi-Location Support

- Each `locations` record is independent; `users` can be linked 1:1 or 1:many to `locations` (schema supports future team members per stand).
- No cross-location data visibility — all queries scoped by `locationId`, enforced server-side in Convex functions (never trust client-supplied `locationId` — derive from authenticated session).
