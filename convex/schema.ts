import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    role: v.union(v.literal('admin'), v.literal('attendant')),
    locationId: v.optional(v.id('locations')),
    createdAt: v.number(),
  }).index('by_email', ['email']).index('by_location', ['locationId']),

  locations: defineTable({
    name: v.string(),
    logoUrl: v.optional(v.string()),
    gps: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    address: v.optional(v.string()),
    ownerUserId: v.optional(v.id('users')),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),

  tickets: defineTable({
    clientId: v.string(),
    locationId: v.id('locations'),
    ticketNumber: v.string(),
    vehicleType: v.union(v.literal('Car'), v.literal('Bike')),
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
});
