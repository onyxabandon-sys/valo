import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createLocation = mutation({
  args: {
    name: v.string(),
    logoUrl: v.optional(v.string()),
    gps: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    address: v.optional(v.string()),
    ownerUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('locations', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getLocationByOwner = query({
  args: { ownerUserId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('locations')
      .withIndex('by_owner', q => q.eq('ownerUserId', args.ownerUserId))
      .first();
  },
});

export const getLocationById = query({
  args: { locationId: v.id('locations') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.locationId);
  },
});
