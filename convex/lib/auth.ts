import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { getSessionExpiresAt, isSessionExpired } from '../../shared/sessionPolicy';

type AuthCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
  }
  return identity;
}

async function requireApprovedDeviceSession(ctx: AuthCtx) {
  const identity = await requireIdentity(ctx);
  const sessionId = identity.sessionId;
  if (typeof sessionId !== 'string') {
    throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'Request approval for this sign-in session before using Valet POS.' });
  }
  const access = await ctx.db
    .query('deviceAccess')
    .withIndex('by_session_id', query => query.eq('sessionId', sessionId))
    .unique();
  if (!access || access.authTokenIdentifier !== identity.tokenIdentifier || access.status !== 'approved') {
    throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'This sign-in session is not approved. Complete device approval to continue.' });
  }
  const assignment = await ctx.db
    .query('deviceAssignments')
    .withIndex('by_session_id', query => query.eq('sessionId', sessionId))
    .unique();
  if (
    !assignment ||
    assignment.status !== 'active' ||
    assignment.deviceId !== access.deviceId ||
    isSessionExpired(assignment.sessionExpiresAt ?? getSessionExpiresAt(assignment.updatedAt), Date.now())
  ) {
    throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'This sign-in has not completed device and location approval, or its session has expired. Sign in again to continue.' });
  }
  return { identity, assignment };
}

export async function requireApprovedIdentity(ctx: AuthCtx) {
  return (await requireApprovedDeviceSession(ctx)).identity;
}

export async function requireAppUserWithAssignment(ctx: AuthCtx) {
  const { identity, assignment } = await requireApprovedDeviceSession(ctx);
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_token_identifier', query => query.eq('authTokenIdentifier', identity.tokenIdentifier))
    .unique();
  if (!user) {
    throw new ConvexError({ code: 'PROFILE_NOT_PROVISIONED', message: 'Your authenticated account has no Valet POS profile.' });
  }
  if (user.role !== 'attendant') {
    throw new ConvexError({ code: 'WEB_ONLY_ACCOUNT', message: 'Administrator accounts must use the operations dashboard.' });
  }
  if (user.isActive === false) {
    throw new ConvexError({ code: 'ACCOUNT_DISABLED', message: 'This account is disabled. Contact an administrator.' });
  }
  if (assignment.userId !== user._id) {
    throw new ConvexError({ code: 'DEVICE_ACCESS_REQUIRED', message: 'This device assignment does not belong to the authenticated account.' });
  }
  return { identity, user, assignment };
}

export async function requireAppUser(ctx: AuthCtx): Promise<Doc<'users'>> {
  return (await requireAppUserWithAssignment(ctx)).user;
}

export async function requireAdministrator(ctx: AuthCtx): Promise<Doc<'users'>> {
  const identity = await requireIdentity(ctx);
  if (identity.twoFactorEnabled !== true) {
    throw new ConvexError({ code: 'ADMIN_MFA_REQUIRED', message: 'Enable authenticator verification for this account, then sign in again.' });
  }
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_token_identifier', query => query.eq('authTokenIdentifier', identity.tokenIdentifier))
    .unique();
  if (!user || user.role !== 'admin' || user.isActive === false) {
    throw new ConvexError({ code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' });
  }
  return user;
}

export async function requireLocationUser(ctx: AuthCtx) {
  const { user, locationId } = await requireLocationUserWithAssignment(ctx);
  return { user, locationId };
}

export async function requireLocationUserWithAssignment(ctx: AuthCtx) {
  const { identity, user, assignment } = await requireAppUserWithAssignment(ctx);
  if (!user.locationId) {
    throw new ConvexError({ code: 'LOCATION_NOT_ASSIGNED', message: 'Your account is not assigned to a location.' });
  }
  if (assignment.locationId !== user.locationId) {
    throw new ConvexError({ code: 'DEVICE_LOCATION_MISMATCH', message: 'This device assignment does not match the account location. Contact an administrator.' });
  }
  return { identity, user, assignment, locationId: user.locationId };
}

export async function requireLocationAccess(ctx: AuthCtx, requestedLocationId: Doc<'users'>['locationId']) {
  const access = await requireLocationUser(ctx);
  if (!requestedLocationId || requestedLocationId !== access.locationId) {
    throw new ConvexError({ code: 'UNAUTHORIZED_LOCATION', message: 'You cannot access this location.' });
  }
  return access;
}
