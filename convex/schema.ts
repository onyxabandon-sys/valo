import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    email: v.string(),
    emailNormalized: v.optional(v.string()),
    // Kept optional so existing profiles remain valid after Better Auth takes over sign-in.
    passwordHash: v.optional(v.string()),
    authUserId: v.optional(v.string()),
    authTokenIdentifier: v.optional(v.string()),
    name: v.string(),
    phoneNumber: v.optional(v.string()),
    role: v.union(v.literal('admin'), v.literal('attendant')),
    isActive: v.optional(v.boolean()),
    disabledAt: v.optional(v.number()),
    deletionPending: v.optional(v.boolean()),
    locationId: v.optional(v.id('locations')),
    createdAt: v.number(),
  })
    .index('by_email', ['email'])
    .index('by_email_normalized', ['emailNormalized'])
    .index('by_auth_token_identifier', ['authTokenIdentifier'])
    .index('by_role', ['role'])
    .index('by_location', ['locationId']),

  locations: defineTable({
    name: v.string(),
    logoUrl: v.optional(v.string()),
    organizationCode: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    gps: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    address: v.optional(v.string()),
    ownerUserId: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_organization_code', ['organizationCode']),

  tickets: defineTable({
    clientId: v.string(),
    locationId: v.id('locations'),
    ticketNumber: v.string(),
    vehicleType: v.union(
      v.literal('Bike'),
      v.literal('Car'),
      v.literal('Commercial Vehicle'),
      v.literal('Bus'),
      v.literal('Heavy Vehicle'),
      v.literal('Tractor'),
    ),
    vehicleNumber: v.string(),
    amount: v.number(),
    paymentStatus: v.union(v.literal('paid'), v.literal('void')),
    paymentMethod: v.literal('cash'),
    createdAt: v.number(),
    createdByUserId: v.optional(v.id('users')),
  })
    .index('by_location', ['locationId'])
    .index('by_location_and_date', ['locationId', 'createdAt'])
    .index('by_created_by_user', ['createdByUserId'])
    .index('by_client_id', ['clientId'])
    .index('by_ticket_number', ['locationId', 'ticketNumber']),

  receipts: defineTable({
    ticketId: v.id('tickets'),
    locationId: v.id('locations'),
    receiptNumber: v.string(),
    customerName: v.optional(v.string()),
    vehicleNumber: v.string(),
    amount: v.number(),
    paymentMethod: v.literal('cash'),
    organizationCode: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    locationName: v.optional(v.string()),
    barcodeValue: v.optional(v.string()),
    vehicleType: v.optional(v.union(v.literal('Bike'), v.literal('Car'))),
    printStatus: v.optional(v.union(v.literal('pending'), v.literal('printed'), v.literal('failed'))),
    reprintCount: v.optional(v.number()),
    operatorName: v.optional(v.string()),
    paymentStatus: v.optional(v.union(v.literal('paid'), v.literal('void'))),
    deviceLocation: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracy: v.optional(v.number()),
        provider: v.optional(v.string()),
        capturedAt: v.number(),
      }),
    ),
    issuedAt: v.number(),
    issuedByUserId: v.optional(v.id('users')),
    deviceId: v.optional(v.string()),
    accountEmail: v.optional(v.string()),
  })
    .index('by_ticket', ['ticketId'])
    .index('by_location_and_issued_at', ['locationId', 'issuedAt'])
    .index('by_issued_by_user', ['issuedByUserId']),

  userSessions: defineTable({
    deviceId: v.string(),
    accountEmail: v.string(),
    authTokenIdentifier: v.string(),
    isLoggedIn: v.boolean(),
    lastActivityTimestamp: v.number(),
  })
    .index('by_device_and_account', ['deviceId', 'accountEmail'])
    .index('by_auth_token_identifier', ['authTokenIdentifier'])
    .index('by_account_email', ['accountEmail']),

  deviceAccess: defineTable({
    sessionId: v.string(),
    authTokenIdentifier: v.string(),
    accountEmail: v.string(),
    deviceId: v.string(),
    codeHash: v.string(),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('revoked'), v.literal('failed')),
    requestedAt: v.number(),
    expiresAt: v.number(),
    attempts: v.number(),
    requestWindowAt: v.number(),
    requestCount: v.number(),
    lastSentAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    deliveryChannel: v.optional(v.union(v.literal('whatsapp'), v.literal('email-manual-whatsapp-fallback'))),
  })
    .index('by_session_id', ['sessionId'])
    .index('by_auth_token_identifier', ['authTokenIdentifier'])
    .index('by_account_email', ['accountEmail']),

  deviceAssignments: defineTable({
    userId: v.id('users'),
    deviceId: v.string(),
    sessionId: v.optional(v.string()),
    locationId: v.id('locations'),
    status: v.union(v.literal('active'), v.literal('pending'), v.literal('revoked')),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    capturedAt: v.optional(v.number()),
    sessionExpiresAt: v.optional(v.number()),
    assignedAt: v.number(),
    updatedAt: v.number(),
    changedByAdminId: v.optional(v.id('users')),
    revokedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_device', ['deviceId'])
    .index('by_session_id', ['sessionId'])
    .index('by_status_and_device', ['status', 'deviceId']),

  loginLocationHistory: defineTable({
    userId: v.id('users'),
    locationId: v.id('locations'),
    deviceId: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.number(),
    capturedAt: v.number(),
    loggedInAt: v.number(),
  })
    .index('by_user_and_logged_in_at', ['userId', 'loggedInAt'])
    .index('by_location_and_logged_in_at', ['locationId', 'loggedInAt']),

  adminSetup: defineTable({
    key: v.literal('firstAdmin'),
    userId: v.id('users'),
    completedAt: v.number(),
  }).index('by_key', ['key']),

  adminAuditLogs: defineTable({
    actorUserId: v.id('users'),
    action: v.union(
      v.literal('admin_bootstrap'),
      v.literal('user_created'),
      v.literal('user_updated'),
      v.literal('user_disabled'),
      v.literal('user_enabled'),
      v.literal('user_deleted'),
      v.literal('user_password_reset'),
      v.literal('location_created'),
      v.literal('location_updated'),
      v.literal('device_reassigned'),
      v.literal('device_released'),
      v.literal('device_revoked'),
    ),
    entityType: v.union(v.literal('user'), v.literal('location'), v.literal('device'), v.literal('admin')),
    entityId: v.string(),
    changedAt: v.number(),
    summary: v.string(),
  })
    .index('by_changed_at', ['changedAt'])
    .index('by_entity', ['entityType', 'entityId']),

  deviceAccessLimits: defineTable({
    key: v.literal('ownerInbox'),
    windowStartAt: v.number(),
    requestCount: v.number(),
  }).index('by_key', ['key']),

  receiptMetadata: defineTable({
    receiptId: v.string(),
    deviceId: v.string(),
    accountEmail: v.string(),
    timestamp: v.number(),
    isSynced: v.boolean(),
    lamportClock: v.number(),
    lastMutationId: v.string(),
  })
    .index('by_receipt_id', ['receiptId'])
    .index('by_account_and_sync', ['accountEmail', 'isSynced', 'timestamp']),

  reportSnapshots: defineTable({
    locationId: v.id('locations'),
    reportDate: v.string(),
    ticketCount: v.number(),
    receiptCount: v.number(),
    cashRevenue: v.number(),
    generatedAt: v.number(),
    generatedByUserId: v.optional(v.id('users')),
    deviceId: v.optional(v.string()),
    requestId: v.optional(v.string()),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    printedReceiptCount: v.optional(v.number()),
    snapshotStatus: v.optional(v.union(v.literal('building'), v.literal('complete'), v.literal('failed'))),
  })
    .index('by_location_and_report_date', ['locationId', 'reportDate'])
    .index('by_location_and_generated_at', ['locationId', 'generatedAt'])
    .index('by_user_device_location_and_generated_at', ['generatedByUserId', 'deviceId', 'locationId', 'generatedAt'])
    .index('by_user_device_and_request_id', ['generatedByUserId', 'deviceId', 'requestId']),
});
