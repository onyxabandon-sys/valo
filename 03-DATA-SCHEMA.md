# Data Schema (Convex)

## 1. Entities

### `users`
```ts
users: defineTable({
  email: v.string(),
  passwordHash: v.string(),        // managed by Better Auth, never touched directly
  locationId: v.id("locations"),
  createdAt: v.number(),
})
  .index("by_email", ["email"])
  .index("by_location", ["locationId"])
```

### `locations`
```ts
locations: defineTable({
  name: v.string(),                // "location name" replaces username
  logoUrl: v.optional(v.string()),
  gps: v.optional(v.object({
    lat: v.number(),
    lng: v.number(),
  })),
  address: v.optional(v.string()), // reverse-geocoded, cached
  ownerUserId: v.id("users"),
  createdAt: v.number(),
})
  .index("by_owner", ["ownerUserId"])
```

### `tickets`
```ts
tickets: defineTable({
  clientId: v.string(),            // UUID generated on-device, idempotency key
  locationId: v.id("locations"),
  ticketNumber: v.string(),        // e.g. "1-0005", sequential per location
  vehicleType: v.union(v.literal("Car"), v.literal("Bike")),
  vehicleNumber: v.string(),
  amount: v.number(),
  paymentStatus: v.union(v.literal("paid"), v.literal("void")),
  paymentMethod: v.literal("cash"),
  createdAt: v.number(),
  createdByUserId: v.id("users"),
})
  .index("by_location", ["locationId"])
  .index("by_location_and_date", ["locationId", "createdAt"])
  .index("by_client_id", ["clientId"])   // enforce idempotent sync
  .index("by_ticket_number", ["locationId", "ticketNumber"])
```

## 2. Relations

```
users (1) ──── (1) locations     [owner relationship]
locations (1) ──── (many) tickets
users (1) ──── (many) tickets     [attendant who created it]
```

## 3. Indexing Rationale

- `by_location_and_date` — powers Report screen's "today's tickets" query without full table scan.
- `by_client_id` — sync mutation checks this index first; if `clientId` exists, no-op (prevents duplicate tickets from retried offline sync).
- `by_ticket_number` — supports barcode-scan lookup fallback + human-readable ticket display.

## 4. Sequential Ticket Numbering

- Format: `{posNumber}-{sequence}` e.g. `1-0005` (matches observed physical receipt format).
- `sequence` generated server-side on sync via Convex mutation (atomic counter per `locationId`) to avoid collision between concurrent offline devices at same location.
- Client displays a **provisional** local sequence at print time (from local SQLite counter); reconciled with server sequence post-sync if it differs (rare — single-device-per-location v1 makes this a non-issue in practice).

## 5. Local SQLite Mirror (offline queue)

```sql
CREATE TABLE tickets_local (
  client_id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  ticket_number TEXT,
  vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('Car','Bike')),
  vehicle_number TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  created_at INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','error'))
);

CREATE INDEX idx_local_date ON tickets_local(created_at);
CREATE INDEX idx_local_sync ON tickets_local(sync_status);
```

## 6. Data Retention

- Local SQLite: retain 90 days rolling, auto-purge older synced records (device storage constrained at 8GB).
- Convex: retain indefinitely v1 (revisit if storage cost becomes concern at scale).
