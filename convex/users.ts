import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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
    const email = normalizeEmail(args.email);

    return await ctx.db.insert('users', {
      email,
      emailNormalized: email,
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
    const normalizedEmail = normalizeEmail(args.email);
    const candidates = Array.from(new Set([normalizedEmail, args.email.trim(), args.email]));

    const normalizedUser = await ctx.db
      .query('users')
      .withIndex('by_email_normalized', q => q.eq('emailNormalized', normalizedEmail))
      .first();
    if (normalizedUser) {
      return normalizedUser;
    }

    for (const email of candidates) {
      const user = await ctx.db
        .query('users')
        .withIndex('by_email', q => q.eq('email', email))
        .first();
      if (user) {
        return user;
      }
    }

    for await (const user of ctx.db.query('users')) {
      if (normalizeEmail(user.email) === normalizedEmail) {
        return user;
      }
    }

    return null;
  },
});
