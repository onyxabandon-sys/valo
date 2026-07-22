import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    email: v.string(),
    emailNormalized: v.optional(v.string()),
    passwordHash: v.string(),
    name: v.string(),
    role: v.union(v.literal('admin'), v.literal('attendant')),
    locationId: v.optional(v.id('locations')),
    createdAt: v.number(),
  })
    .index('by_email', ['email'])
    .index('by_email_normalized', ['emailNormalized'])
    .index('by_location', ['locationId']),

  locations: defineTable({
    name: v.string(),
    logoUrl: v.optional(v.string()),
    organizationCode: v.optional(v.string()),
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
    vehicleType: v.union(v.literal('Car'), v.literal('Bike'), v.literal('Commercial Vehicle'), v.literal('Bus'), v.literal('Heavy Vehicle'), v.literal('Tractor')),
    vehicleNumber: v.string(),
    amount: v.number(),
    paymentStatus: v.union(v.literal('paid'), v.literal('void')),
    paymentMethod: v.literal('cash'),
    createdAt: v.number(),
    createdByUserId: v.id('users'),
  })
    .index('by_location', ['locationId'])
    .index('by_location_and_date', ['locationId', 'createdAt'])
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
    issuedAt: v.number(),
    issuedByUserId: v.id('users'),
  })
    .index('by_ticket', ['ticketId'])
    .index('by_location_and_issued_at', ['locationId', 'issuedAt'])
    .index('by_receipt_number', ['receiptNumber']),

  reportSnapshots: defineTable({
    locationId: v.id('locations'),
    reportDate: v.string(),
    ticketCount: v.number(),
    receiptCount: v.number(),
    cashRevenue: v.number(),
    generatedAt: v.number(),
    generatedByUserId: v.id('users'),
  })
    .index('by_location_and_report_date', ['locationId', 'reportDate'])
    .index('by_location_and_generated_at', ['locationId', 'generatedAt']),
});
