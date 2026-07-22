import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function findUserByEmail(ctx: QueryCtx | MutationCtx, email: string) {
  const normalizedEmail = normalizeEmail(email);
  const candidates = Array.from(new Set([normalizedEmail, email.trim(), email]));

  const normalizedUser = await ctx.db
    .query('users')
    .withIndex('by_email_normalized', q => q.eq('emailNormalized', normalizedEmail))
    .first();
  if (normalizedUser) {
    return normalizedUser;
  }

  for (const candidate of candidates) {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', q => q.eq('email', candidate))
      .first();
    if (user) {
      return user;
    }
  }

  return null;
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
    const existingUser = await findUserByEmail(ctx, args.email);

    if (existingUser) {
      throw new Error('An account already exists for that email.');
    }

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

export const createOrganization = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    locationName: v.string(),
    organizationCode: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = normalizeEmail(args.email);
    const organizationCode = args.organizationCode.trim().toLowerCase();
    const existingUser = await findUserByEmail(ctx, args.email);

    if (existingUser) {
      throw new Error('An account already exists for that email.');
    }

    const existingLocation = await ctx.db
      .query('locations')
      .withIndex('by_organization_code', q => q.eq('organizationCode', organizationCode))
      .first();

    if (existingLocation) {
      throw new Error('An organization already exists for that code.');
    }

    const name = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'Organization Admin';
    const userId = await ctx.db.insert('users', {
      email,
      emailNormalized: email,
      passwordHash: args.passwordHash,
      name,
      role: 'admin',
      createdAt: now,
    });
    const locationId = await ctx.db.insert('locations', {
      name: args.locationName.trim(),
      organizationCode,
      address: organizationCode,
      ownerUserId: userId,
      createdAt: now,
    });

    await ctx.db.patch(userId, { locationId });

    return {
      user: await ctx.db.get(userId),
      location: await ctx.db.get(locationId),
    };
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await findUserByEmail(ctx, args.email);
  },
});
