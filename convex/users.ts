import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireIdentity } from './lib/auth';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const getCurrentProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id('users'),
      name: v.string(),
      email: v.string(),
      phoneNumber: v.union(v.string(), v.null()),
      role: v.union(v.literal('admin'), v.literal('attendant')),
      createdAt: v.number(),
      locationId: v.union(v.id('locations'), v.null()),
      organizationCode: v.union(v.string(), v.null()),
      organizationName: v.union(v.string(), v.null()),
      locationName: v.union(v.string(), v.null()),
      locationAddress: v.union(v.string(), v.null()),
    }),
  ),
  handler: async ctx => {
    const identity = await requireIdentity(ctx);
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', identity.tokenIdentifier))
      .unique();
    if (!user) return null;
    const location = user.locationId ? await ctx.db.get('locations', user.locationId) : null;
    return {
      id: user._id,
      name: user.name,
      email: normalizeEmail(identity.email ?? user.email),
      phoneNumber: user.phoneNumber ?? null,
      role: user.role,
      createdAt: user.createdAt,
      locationId: user.locationId ?? null,
      organizationCode: location?.organizationCode ?? null,
      organizationName: location?.organizationName ?? location?.name ?? null,
      locationName: location?.name ?? null,
      locationAddress: location?.address ?? null,
    };
  },
});
