import { query } from './_generated/server';
import { v } from 'convex/values';
import { requireLocationAccess, requireLocationUser } from './lib/auth';

const locationValidator = v.object({
  _id: v.id('locations'),
  _creationTime: v.number(),
  name: v.string(),
  logoUrl: v.optional(v.string()),
  organizationCode: v.optional(v.string()),
  organizationName: v.optional(v.string()),
  gps: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  address: v.optional(v.string()),
  ownerUserId: v.optional(v.id('users')),
  createdAt: v.number(),
});

export const getCurrentLocation = query({
  args: {},
  returns: v.union(locationValidator, v.null()),
  handler: async ctx => {
    const { locationId } = await requireLocationUser(ctx);
    return await ctx.db.get('locations', locationId);
  },
});

export const getLocationById = query({
  args: { locationId: v.id('locations') },
  returns: v.union(locationValidator, v.null()),
  handler: async (ctx, args) => {
    await requireLocationAccess(ctx, args.locationId);
    return await ctx.db.get(args.locationId);
  },
});
