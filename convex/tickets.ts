import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createTicket = mutation({
  args: {
    clientId: v.string(),
    locationId: v.id('locations'),
    ticketNumber: v.string(),
    vehicleType: v.union(v.literal('Car'), v.literal('Bike'), v.literal('Commercial Vehicle'), v.literal('Bus'), v.literal('Heavy Vehicle'), v.literal('Tractor')),
    vehicleNumber: v.string(),
    amount: v.number(),
    paymentStatus: v.union(v.literal('paid'), v.literal('void')),
    paymentMethod: v.literal('cash'),
    createdByUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('tickets')
      .withIndex('by_client_id', q => q.eq('clientId', args.clientId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert('tickets', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getTicketByClientId = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('tickets')
      .withIndex('by_client_id', q => q.eq('clientId', args.clientId))
      .first();
  },
});

export const listTodayTickets = query({
  args: {
    locationId: v.id('locations'),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('tickets')
      .withIndex('by_location_and_date', q => q.eq('locationId', args.locationId))
      .filter(q => q.and(q.gte(q.field('createdAt'), args.from), q.lt(q.field('createdAt'), args.to)))
      .collect();
  },
});

export const listReceipts = query({
  args: { locationId: v.id('locations') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('receipts')
      .withIndex('by_location_and_issued_at', q => q.eq('locationId', args.locationId))
      .order('desc')
      .take(50);
  },
});
