import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createUser = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    role: v.union(v.literal('admin'), v.literal('attendant')),
    locationId: v.optional(v.id('locations')),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert('users', {
      email: args.email,
      passwordHash: args.passwordHash,
      name: args.name,
      role: args.role,
      locationId: args.locationId,
      createdAt: now,
    });
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_email', q => q.eq('email', args.email))
      .first();
  },
});
