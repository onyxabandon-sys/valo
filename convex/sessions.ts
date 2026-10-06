import { mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { matchesClaimedDeviceId } from '../shared/deviceAssignments';
import { requireAppUser, requireAppUserWithAssignment } from './lib/auth';

const sessionValidator = v.object({
  _id: v.id('userSessions'),
  _creationTime: v.number(),
  deviceId: v.string(),
  accountEmail: v.string(),
  authTokenIdentifier: v.string(),
  isLoggedIn: v.boolean(),
  lastActivityTimestamp: v.number(),
});

function validateDeviceId(deviceId: string) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(deviceId)) {
    throw new ConvexError({ code: 'INVALID_DEVICE_ID', message: 'Device identifier is invalid.' });
  }
}

export const recordActiveSession = mutation({
  args: { deviceId: v.string(), accountEmail: v.string(), lastActivityTimestamp: v.number() },
  returns: sessionValidator,
  handler: async (ctx, args) => {
    const { identity, assignment } = await requireAppUserWithAssignment(ctx);
    validateDeviceId(args.deviceId);
    if (!matchesClaimedDeviceId(args.deviceId, assignment.deviceId)) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'This session does not match the approved device.' });
    }
    if (identity.email?.trim().toLowerCase() !== args.accountEmail.trim().toLowerCase()) {
      throw new ConvexError({ code: 'SESSION_ACCOUNT_MISMATCH', message: 'Session account does not match the authenticated account.' });
    }
    if (!Number.isSafeInteger(args.lastActivityTimestamp)) {
      throw new ConvexError({ code: 'INVALID_SESSION_TIMESTAMP', message: 'Session timestamp is invalid.' });
    }
    const accountEmail = args.accountEmail.trim().toLowerCase();
    const existing = await ctx.db
      .query('userSessions')
      .withIndex('by_device_and_account', q => q.eq('deviceId', assignment.deviceId).eq('accountEmail', accountEmail))
      .unique();
    const values = {
      deviceId: assignment.deviceId,
      accountEmail,
      authTokenIdentifier: identity.tokenIdentifier,
      isLoggedIn: true,
      lastActivityTimestamp: args.lastActivityTimestamp,
    };
    if (existing) {
      await ctx.db.replace(existing._id, values);
      return { ...existing, ...values };
    }
    const id = await ctx.db.insert('userSessions', values);
    const created = await ctx.db.get(id);
    if (!created) throw new ConvexError({ code: 'SESSION_WRITE_FAILED', message: 'Could not persist the session.' });
    return created;
  },
});

export const listMySessions = query({
  args: {},
  returns: v.array(sessionValidator),
  handler: async ctx => {
    await requireAppUser(ctx);
    const authIdentity = await ctx.auth.getUserIdentity();
    if (!authIdentity) throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    return await ctx.db
      .query('userSessions')
      .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', authIdentity.tokenIdentifier))
      .take(20);
  },
});

export const markSessionLoggedOut = mutation({
  args: { deviceId: v.string(), accountEmail: v.string() },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const { identity, assignment } = await requireAppUserWithAssignment(ctx);
    validateDeviceId(args.deviceId);
    if (!matchesClaimedDeviceId(args.deviceId, assignment.deviceId)) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'This session does not match the approved device.' });
    }
    const accountEmail = args.accountEmail.trim().toLowerCase();
    const session = await ctx.db
      .query('userSessions')
      .withIndex('by_device_and_account', q => q.eq('deviceId', assignment.deviceId).eq('accountEmail', accountEmail))
      .unique();
    if (!session || session.authTokenIdentifier !== identity.tokenIdentifier) {
      throw new ConvexError({ code: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    }
    await ctx.db.patch(session._id, { isLoggedIn: false, lastActivityTimestamp: Date.now() });
    return { success: true as const };
  },
});
