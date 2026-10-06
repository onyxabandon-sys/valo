import { ConvexError, v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { isDeviceReservedForAnotherUser } from '../shared/deviceAssignments';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { createCredentialAccount, deleteCredentialAccount, deleteCredentialAccountByEmail, setCredentialPassword } from './auth';
import { requireAdministrator } from './lib/auth';

type ReadCtx = QueryCtx | MutationCtx;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{7,14}$/;
const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

const dashboardLocation = v.object({
  id: v.id('locations'),
  name: v.string(),
  organizationName: v.union(v.string(), v.null()),
  organizationCode: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
});

const dashboardUser = v.object({
  id: v.id('users'),
  name: v.string(),
  email: v.string(),
  phoneNumber: v.union(v.string(), v.null()),
  role: v.union(v.literal('admin'), v.literal('attendant')),
  isActive: v.boolean(),
  locationId: v.union(v.id('locations'), v.null()),
  locationName: v.union(v.string(), v.null()),
  createdAt: v.number(),
  deviceId: v.union(v.string(), v.null()),
  deviceStatus: v.union(v.literal('active'), v.literal('pending'), v.literal('revoked'), v.null()),
});

const dashboardDevice = v.object({
  id: v.id('deviceAssignments'),
  userId: v.id('users'),
  userName: v.string(),
  userEmail: v.string(),
  deviceId: v.string(),
  status: v.union(v.literal('active'), v.literal('pending'), v.literal('revoked')),
  locationId: v.id('locations'),
  locationName: v.union(v.string(), v.null()),
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  accuracy: v.union(v.number(), v.null()),
  capturedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

const auditEntry = v.object({
  id: v.id('adminAuditLogs'),
  actorName: v.string(),
  action: v.string(),
  entityType: v.string(),
  entityId: v.string(),
  summary: v.string(),
  changedAt: v.number(),
});

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    throw new ConvexError({ code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
  }
  return email;
}

function normalizePhone(value: string) {
  const phoneNumber = value.trim();
  if (!PHONE.test(phoneNumber)) {
    throw new ConvexError({ code: 'INVALID_PHONE', message: 'Enter the WhatsApp number in international format.' });
  }
  return phoneNumber;
}

function normalizeName(value: string, label: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    throw new ConvexError({ code: 'INVALID_NAME', message: `${label} must contain 2–80 characters.` });
  }
  return name;
}

function validatePassword(value: string) {
  if (value.length < 8 || value.length > 128) {
    throw new ConvexError({ code: 'INVALID_PASSWORD', message: 'Password must contain 8–128 characters.' });
  }
  return value;
}

function tokenIdentifierForAuthUser(authUserId: string) {
  const issuer = process.env.CONVEX_SITE_URL?.trim();
  if (!issuer) {
    throw new ConvexError({ code: 'AUTH_SERVER_NOT_CONFIGURED', message: 'Secure sign-in is not configured on the server.' });
  }
  try {
    new URL(issuer);
  } catch {
    throw new ConvexError({ code: 'AUTH_SERVER_NOT_CONFIGURED', message: 'Secure sign-in is not configured on the server.' });
  }
  return `${issuer}|${authUserId}`;
}

function safeSecretEquals(actual: string, expected: string) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

async function writeAudit(
  ctx: MutationCtx,
  actorUserId: Id<'users'>,
  action: 'admin_bootstrap' | 'user_created' | 'user_updated' | 'user_disabled' | 'user_enabled' | 'user_deleted' | 'user_password_reset' | 'location_created' | 'location_updated' | 'device_reassigned' | 'device_released' | 'device_revoked',
  entityType: 'user' | 'location' | 'device' | 'admin',
  entityId: string,
  summary: string,
) {
  await ctx.db.insert('adminAuditLogs', { actorUserId, action, entityType, entityId, summary, changedAt: Date.now() });
}

async function findUserByEmail(ctx: ReadCtx, email: string) {
  const normalized = await ctx.db.query('users').withIndex('by_email_normalized', q => q.eq('emailNormalized', email)).unique();
  if (normalized) return normalized;
  return await ctx.db.query('users').withIndex('by_email', q => q.eq('email', email)).first();
}

async function canBootstrapFirstAdministrator(ctx: ReadCtx) {
  const setup = await ctx.db.query('adminSetup').withIndex('by_key', q => q.eq('key', 'firstAdmin')).unique();
  if (setup) return false;

  const admins = await ctx.db.query('users').withIndex('by_role', q => q.eq('role', 'admin')).take(1001);
  if (admins.length > 1000) return false;
  return !admins.some(admin => admin.authUserId !== undefined || admin.authTokenIdentifier !== undefined);
}

async function invalidateUserSessions(
  ctx: MutationCtx,
  user: Doc<'users'>,
  now: number,
  assignmentStatus: 'pending' | 'revoked',
) {
  const assignment = await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', user._id)).unique();
  if (assignment) {
    if (assignment.sessionId) {
      const activeAccess = await ctx.db.query('deviceAccess').withIndex('by_session_id', q => q.eq('sessionId', assignment.sessionId!)).unique();
      if (activeAccess && activeAccess.status !== 'revoked') {
        await ctx.db.patch('deviceAccess', activeAccess._id, { status: 'revoked', codeHash: '', expiresAt: now });
      }
    }
    await ctx.db.patch('deviceAssignments', assignment._id, {
      status: assignmentStatus,
      sessionId: undefined,
      sessionExpiresAt: undefined,
      updatedAt: now,
      revokedAt: assignmentStatus === 'revoked' ? now : undefined,
    });
  }

  const sessions = await ctx.db
    .query('userSessions')
    .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', user.authTokenIdentifier ?? ''))
    .take(100);
  for (const session of sessions) {
    if (session.isLoggedIn) await ctx.db.patch('userSessions', session._id, { isLoggedIn: false, lastActivityTimestamp: now });
  }

  const accessRecords = await ctx.db
    .query('deviceAccess')
    .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', user.authTokenIdentifier ?? ''))
    .take(100);
  for (const record of accessRecords) {
    if (record.status !== 'revoked') await ctx.db.patch('deviceAccess', record._id, { status: 'revoked', codeHash: '', expiresAt: now });
  }
  return assignment;
}

export const getMyAdminStatus = query({
  args: {},
  returns: v.object({ isAdmin: v.boolean(), isActive: v.boolean(), twoFactorEnabled: v.boolean() }),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { isAdmin: false, isActive: false, twoFactorEnabled: false };
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_token_identifier', q => q.eq('authTokenIdentifier', identity.tokenIdentifier))
      .unique();
    return {
      isAdmin: user?.role === 'admin',
      isActive: user?.isActive !== false,
      twoFactorEnabled: identity.twoFactorEnabled === true,
    };
  },
});

export const isFirstAdminBootstrapAvailable = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async ctx => await canBootstrapFirstAdministrator(ctx),
});

export const getBootstrapAvailable = query({
  args: {},
  returns: v.boolean(),
  handler: async ctx => await canBootstrapFirstAdministrator(ctx),
});

export const finishFirstAdminBootstrap = internalMutation({
  args: { authUserId: v.string(), email: v.string(), name: v.string() },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    if (!await canBootstrapFirstAdministrator(ctx)) {
      throw new ConvexError({ code: 'ADMIN_ALREADY_INITIALIZED', message: 'Administrator setup has already been completed.' });
    }

    const email = normalizeEmail(args.email);
    const existingProfile = await findUserByEmail(ctx, email);
    if (existingProfile && (
      existingProfile.role !== 'admin' ||
      existingProfile.authUserId !== undefined ||
      existingProfile.authTokenIdentifier !== undefined ||
      existingProfile.isActive === false ||
      existingProfile.deletionPending
    )) {
      throw new ConvexError({ code: 'ADMIN_PROFILE_EXISTS', message: 'An account profile already exists for the configured administrator email.' });
    }

    const name = normalizeName(args.name, 'Name');
    const now = Date.now();
    const authTokenIdentifier = tokenIdentifierForAuthUser(args.authUserId);
    const userId = existingProfile
      ? existingProfile._id
      : await ctx.db.insert('users', {
          email,
          emailNormalized: email,
          name,
          authUserId: args.authUserId,
          authTokenIdentifier,
          role: 'admin',
          isActive: true,
          createdAt: now,
        });
    if (existingProfile) {
      await ctx.db.patch('users', existingProfile._id, {
        email,
        emailNormalized: email,
        name,
        authUserId: args.authUserId,
        authTokenIdentifier,
        isActive: true,
      });
    }
    await ctx.db.insert('adminSetup', { key: 'firstAdmin', userId, completedAt: now });
    await writeAudit(ctx, userId, 'admin_bootstrap', 'admin', userId, 'Created or linked the first administrator account. Authenticator verification is required before management access.');
    return userId;
  },
});

export const bootstrapFirstAdmin = action({
  args: { setupSecret: v.string(), email: v.string(), name: v.string(), password: v.string() },
  returns: v.object({ created: v.literal(true) }),
  handler: async (ctx, args) => {
    const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET?.trim();
    const configuredEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    if (!configuredSecret || configuredSecret.length < 32 || !configuredEmail || !EMAIL.test(configuredEmail)) {
      throw new ConvexError({ code: 'ADMIN_BOOTSTRAP_NOT_CONFIGURED', message: 'Secure administrator setup is not configured on the server.' });
    }
    if (args.setupSecret.length > 256 || !safeSecretEquals(args.setupSecret, configuredSecret)) {
      throw new ConvexError({ code: 'ADMIN_BOOTSTRAP_INVALID', message: 'The administrator setup code is invalid.' });
    }

    const email = normalizeEmail(args.email);
    if (email !== configuredEmail) {
      throw new ConvexError({ code: 'ADMIN_BOOTSTRAP_EMAIL_MISMATCH', message: 'Use the administrator email configured for one-time setup.' });
    }
    const name = normalizeName(args.name, 'Name');
    const password = validatePassword(args.password);
    const available = await ctx.runQuery(internal.admin.isFirstAdminBootstrapAvailable, {});
    if (!available) {
      throw new ConvexError({ code: 'ADMIN_ALREADY_INITIALIZED', message: 'Administrator setup has already been completed.' });
    }

    let authUserId: string | undefined;
    try {
      const account = await createCredentialAccount(ctx, { email, name, password });
      authUserId = account.id;
      await ctx.runMutation(internal.admin.finishFirstAdminBootstrap, { authUserId: account.id, email, name });
      return { created: true as const };
    } catch (error) {
      if (authUserId) {
        try {
          await deleteCredentialAccount(ctx, authUserId);
        } catch {
          // The account stays blocked without a matching administrator profile; the setup can be repaired by the owner.
        }
      }
      if (error instanceof ConvexError) throw error;
      if (error instanceof Error && error.message === 'AUTH_ACCOUNT_EXISTS') {
        throw new ConvexError({ code: 'ADMIN_AUTH_ACCOUNT_EXISTS', message: 'An authentication account already exists for this email. Ask the app owner to repair the one-time setup.' });
      }
      throw new ConvexError({ code: 'ADMIN_BOOTSTRAP_FAILED', message: 'Could not create the administrator account. Check the server setup and try again.' });
    }
  },
});

export const getDashboard = query({
  args: {},
  returns: v.object({
    counts: v.object({ users: v.number(), attendants: v.number(), locations: v.number(), activeDevices: v.number() }),
    locations: v.array(dashboardLocation),
    users: v.array(dashboardUser),
    devices: v.array(dashboardDevice),
    audit: v.array(auditEntry),
    hasMoreAttendants: v.boolean(),
    hasMoreActiveDevices: v.boolean(),
    hasMoreLocations: v.boolean(),
    hasMoreUsers: v.boolean(),
    hasMoreDevices: v.boolean(),
    hasMoreAudit: v.boolean(),
  }),
  handler: async ctx => {
    await requireAdministrator(ctx);
    const [locationRows, userRows, attendantRows, deviceRows, activeDeviceRows, auditRows] = await Promise.all([
      ctx.db.query('locations').order('desc').take(201),
      ctx.db.query('users').order('desc').take(201),
      ctx.db.query('users').withIndex('by_role', q => q.eq('role', 'attendant')).take(201),
      ctx.db.query('deviceAssignments').order('desc').take(201),
      ctx.db.query('deviceAssignments').withIndex('by_status_and_device', q => q.eq('status', 'active')).take(201),
      ctx.db.query('adminAuditLogs').withIndex('by_changed_at').order('desc').take(101),
    ]);
    const locations = locationRows.slice(0, 200);
    const users = userRows.slice(0, 200);
    const devices = deviceRows.slice(0, 200);
    const attendants = attendantRows.slice(0, 200);
    const activeDevices = activeDeviceRows.slice(0, 200);
    const audit = auditRows.slice(0, 100);
    const [dashboardLocations, dashboardUsers, dashboardDevices, dashboardAudit] = await Promise.all([
      Promise.all(locations.map(location => ({
        id: location._id,
        name: location.name,
        organizationName: location.organizationName ?? null,
        organizationCode: location.organizationCode ?? null,
        address: location.address ?? null,
      }))),
      Promise.all(users.map(async user => {
        const [location, assignment] = await Promise.all([
          user.locationId ? ctx.db.get('locations', user.locationId) : Promise.resolve(null),
          ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', user._id)).unique(),
        ]);
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber ?? null,
          role: user.role,
          isActive: user.isActive !== false,
          locationId: user.locationId ?? null,
          locationName: location?.name ?? null,
          createdAt: user.createdAt,
          deviceId: assignment?.deviceId ?? null,
          deviceStatus: assignment?.status ?? null,
        };
      })),
      Promise.all(devices.map(async assignment => {
        const user = await ctx.db.get('users', assignment.userId);
        const location = await ctx.db.get('locations', assignment.locationId);
        return {
          id: assignment._id,
          userId: assignment.userId,
          userName: user?.name ?? 'Removed account',
          userEmail: user?.email ?? '',
          deviceId: assignment.deviceId,
          status: assignment.status,
          locationId: assignment.locationId,
          locationName: location?.name ?? null,
          latitude: assignment.latitude ?? null,
          longitude: assignment.longitude ?? null,
          accuracy: assignment.accuracy ?? null,
          capturedAt: assignment.capturedAt ?? null,
          updatedAt: assignment.updatedAt,
        };
      })),
      Promise.all(audit.map(async entry => {
        const actor = await ctx.db.get('users', entry.actorUserId);
        return {
          id: entry._id,
          actorName: actor?.name ?? 'Former administrator',
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: entry.summary,
          changedAt: entry.changedAt,
        };
      })),
    ]);
    return {
      counts: { users: users.length, attendants: attendants.length, locations: locations.length, activeDevices: activeDevices.length },
      locations: dashboardLocations,
      users: dashboardUsers,
      devices: dashboardDevices,
      audit: dashboardAudit,
      hasMoreLocations: locationRows.length > 200,
      hasMoreUsers: userRows.length > 200,
      hasMoreDevices: deviceRows.length > 200,
      hasMoreAudit: auditRows.length > 100,
      hasMoreAttendants: attendantRows.length > 200,
      hasMoreActiveDevices: activeDeviceRows.length > 200,
    };
  },
});

export const listDashboardLocations = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(dashboardLocation),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const page = await ctx.db.query('locations').order('desc').paginate(args.paginationOpts);
    return { ...page, page: page.page.map(location => ({
      id: location._id,
      name: location.name,
      organizationName: location.organizationName ?? null,
      organizationCode: location.organizationCode ?? null,
      address: location.address ?? null,
    })) };
  },
});

export const listDashboardUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(dashboardUser),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const page = await ctx.db.query('users').order('desc').paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map(async user => {
        const [location, assignment] = await Promise.all([
          user.locationId ? ctx.db.get('locations', user.locationId) : Promise.resolve(null),
          ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', user._id)).unique(),
        ]);
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber ?? null,
          role: user.role,
          isActive: user.isActive !== false,
          locationId: user.locationId ?? null,
          locationName: location?.name ?? null,
          createdAt: user.createdAt,
          deviceId: assignment?.deviceId ?? null,
          deviceStatus: assignment?.status ?? null,
        };
      })),
    };
  },
});

export const listDashboardDevices = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(dashboardDevice),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const page = await ctx.db.query('deviceAssignments').order('desc').paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map(async assignment => {
        const [user, location] = await Promise.all([
          ctx.db.get('users', assignment.userId),
          ctx.db.get('locations', assignment.locationId),
        ]);
        return {
          id: assignment._id,
          userId: assignment.userId,
          userName: user?.name ?? 'Removed account',
          userEmail: user?.email ?? '',
          deviceId: assignment.deviceId,
          status: assignment.status,
          locationId: assignment.locationId,
          locationName: location?.name ?? null,
          latitude: assignment.latitude ?? null,
          longitude: assignment.longitude ?? null,
          accuracy: assignment.accuracy ?? null,
          capturedAt: assignment.capturedAt ?? null,
          updatedAt: assignment.updatedAt,
        };
      })),
    };
  },
});

export const listDashboardAudit = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(auditEntry),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const page = await ctx.db.query('adminAuditLogs').withIndex('by_changed_at').order('desc').paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map(async entry => {
        const actor = await ctx.db.get('users', entry.actorUserId);
        return {
          id: entry._id,
          actorName: actor?.name ?? 'Former administrator',
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: entry.summary,
          changedAt: entry.changedAt,
        };
      })),
    };
  },
});

export const assertCurrentAdministrator = internalQuery({
  args: {},
  returns: v.id('users'),
  handler: async ctx => (await requireAdministrator(ctx))._id,
});

export const listAttendantLoginLocations = query({
  args: { userId: v.id('users'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    id: v.id('loginLocationHistory'),
    deviceId: v.string(),
    locationName: v.union(v.string(), v.null()),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.number(),
    capturedAt: v.number(),
    loggedInAt: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant') {
      throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'Attendant profile was not found.' });
    }
    const page = await ctx.db.query('loginLocationHistory')
      .withIndex('by_user_and_logged_in_at', q => q.eq('userId', args.userId))
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map(async entry => ({
        id: entry._id,
        deviceId: entry.deviceId,
        locationName: (await ctx.db.get('locations', entry.locationId))?.name ?? null,
        latitude: entry.latitude,
        longitude: entry.longitude,
        accuracy: entry.accuracy,
        capturedAt: entry.capturedAt,
        loggedInAt: entry.loggedInAt,
      }))),
    };
  },
});

export const persistProvisionedAttendant = internalMutation({
  args: {
    actorUserId: v.id('users'),
    authUserId: v.string(),
    name: v.string(),
    email: v.string(),
    phoneNumber: v.string(),
    locationId: v.id('locations'),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const currentAdmin = await requireAdministrator(ctx);
    if (currentAdmin._id !== args.actorUserId) {
      throw new ConvexError({ code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' });
    }
    const actor = await ctx.db.get('users', args.actorUserId);
    if (!actor || actor.role !== 'admin' || actor.isActive === false) {
      throw new ConvexError({ code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' });
    }
    const email = normalizeEmail(args.email);
    const name = normalizeName(args.name, 'Name');
    const phoneNumber = normalizePhone(args.phoneNumber);
    if (!await ctx.db.get('locations', args.locationId)) {
      throw new ConvexError({ code: 'LOCATION_NOT_FOUND', message: 'Choose an existing location.' });
    }
    if (await findUserByEmail(ctx, email)) {
      throw new ConvexError({ code: 'EMAIL_ALREADY_EXISTS', message: 'An account already exists for this email.' });
    }

    const now = Date.now();
    const userId = await ctx.db.insert('users', {
      name,
      email,
      emailNormalized: email,
      authUserId: args.authUserId,
      authTokenIdentifier: tokenIdentifierForAuthUser(args.authUserId),
      phoneNumber,
      role: 'attendant',
      isActive: true,
      locationId: args.locationId,
      createdAt: now,
    });
    await writeAudit(ctx, actor._id, 'user_created', 'user', userId, 'Created an active attendant login and profile.');
    return userId;
  },
});

export const createAttendant = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    phoneNumber: v.string(),
    locationId: v.id('locations'),
  },
  returns: v.id('users'),
  handler: async (ctx, args): Promise<Id<'users'>> => {
    const actorUserId: Id<'users'> = await ctx.runQuery(internal.admin.assertCurrentAdministrator, {});
    const email = normalizeEmail(args.email);
    const name = normalizeName(args.name, 'Name');
    const password = validatePassword(args.password);
    const phoneNumber = normalizePhone(args.phoneNumber);

    let authUserId: string | undefined;
    try {
      const authUser = await createCredentialAccount(ctx, { email, name, password });
      authUserId = authUser.id;
      return await ctx.runMutation(internal.admin.persistProvisionedAttendant, {
        actorUserId,
        authUserId: authUser.id,
        name,
        email,
        phoneNumber,
        locationId: args.locationId,
      });
    } catch (error) {
      if (authUserId) {
        try {
          await deleteCredentialAccount(ctx, authUserId);
        } catch {
          // Without a matching attendant profile, the account cannot pass the app's server-side access gate.
        }
      }
      if (error instanceof ConvexError) throw error;
      if (error instanceof Error && error.message === 'AUTH_ACCOUNT_EXISTS') {
        throw new ConvexError({ code: 'EMAIL_ALREADY_EXISTS', message: 'An account already exists for this email.' });
      }
      throw new ConvexError({ code: 'ATTENDANT_CREATE_FAILED', message: 'Could not create the attendant login. Check the details and try again.' });
    }
  },
});

export const setAttendantPassword = action({
  args: { userId: v.id('users'), password: v.string() },
  returns: v.object({ updated: v.literal(true) }),
  handler: async (ctx, args): Promise<{ updated: true }> => {
    const actorUserId: Id<'users'> = await ctx.runQuery(internal.admin.assertCurrentAdministrator, {});
    const target = await ctx.runQuery(internal.admin.getAttendantCredentialTarget, { userId: args.userId });
    if (!target) throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'Attendant profile was not found.' });
    const password = validatePassword(args.password);
    if (!target.authUserId) {
      throw new ConvexError({ code: 'ATTENDANT_AUTH_NOT_LINKED', message: 'This attendant login is not linked to a managed account. Ask the system owner to repair it.' });
    }
    try {
      await setCredentialPassword(ctx, { authUserId: target.authUserId, password });
      await ctx.runMutation(internal.admin.recordAttendantPasswordReset, { actorUserId, userId: args.userId });
      return { updated: true as const };
    } catch {
      throw new ConvexError({ code: 'PASSWORD_RESET_FAILED', message: 'The password could not be changed. Retry or contact the system owner.' });
    }
  },
});

export const getAttendantCredentialTarget = internalQuery({
  args: { userId: v.id('users') },
  returns: v.union(v.null(), v.object({ authUserId: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant' || user.deletionPending) return null;
    return { authUserId: user.authUserId ?? null };
  },
});

export const recordAttendantPasswordReset = internalMutation({
  args: { actorUserId: v.id('users'), userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdministrator(ctx);
    if (actor._id !== args.actorUserId) throw new ConvexError({ code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' });
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant' || user.isActive === false || user.deletionPending) {
      throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'An active attendant profile was not found.' });
    }
    await writeAudit(ctx, actor._id, 'user_password_reset', 'user', user._id, 'Set a new attendant password.');
    return null;
  },
});

export const prepareAttendantDeletion = internalMutation({
  args: { userId: v.id('users') },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant') {
      throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'Attendant profile was not found.' });
    }
    const now = Date.now();
    await ctx.db.patch(user._id, { isActive: false, disabledAt: user.disabledAt ?? now, deletionPending: true });
    const assignment = await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', user._id)).unique();
    if (assignment) await ctx.db.delete(assignment._id);
    await writeAudit(ctx, admin._id, 'user_disabled', 'user', user._id, 'Blocked attendant sign-in and released the assigned device before account removal.');
    return { email: user.email.trim().toLowerCase() };
  },
});

export const purgeAttendantDataChunk = internalMutation({
  args: { userId: v.id('users') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant' || !user.deletionPending) {
      throw new ConvexError({ code: 'DELETION_NOT_PREPARED', message: 'Prepare account removal before cleaning its records.' });
    }
    const email = user.email.trim().toLowerCase();
    const [receipts, tickets, snapshots, locations, sessions, accessRecords, pendingMetadata, syncedMetadata] = await Promise.all([
      ctx.db.query('receipts').withIndex('by_issued_by_user', q => q.eq('issuedByUserId', user._id)).take(50),
      ctx.db.query('tickets').withIndex('by_created_by_user', q => q.eq('createdByUserId', user._id)).take(50),
      ctx.db.query('reportSnapshots').withIndex('by_user_device_location_and_generated_at', q => q.eq('generatedByUserId', user._id)).take(50),
      ctx.db.query('loginLocationHistory').withIndex('by_user_and_logged_in_at', q => q.eq('userId', user._id)).take(50),
      ctx.db.query('userSessions').withIndex('by_account_email', q => q.eq('accountEmail', email)).take(50),
      ctx.db.query('deviceAccess').withIndex('by_account_email', q => q.eq('accountEmail', email)).take(50),
      ctx.db.query('receiptMetadata').withIndex('by_account_and_sync', q => q.eq('accountEmail', email).eq('isSynced', false)).take(50),
      ctx.db.query('receiptMetadata').withIndex('by_account_and_sync', q => q.eq('accountEmail', email).eq('isSynced', true)).take(50),
    ]);

    await Promise.all([
      ...receipts.map(receipt => ctx.db.patch(receipt._id, {
        issuedByUserId: undefined,
        accountEmail: undefined,
        operatorName: undefined,
        deviceId: undefined,
        deviceLocation: undefined,
      })),
      ...tickets.map(ticket => ctx.db.patch(ticket._id, { createdByUserId: undefined })),
      ...snapshots.map(snapshot => ctx.db.patch(snapshot._id, {
        generatedByUserId: undefined,
        deviceId: undefined,
        requestId: undefined,
      })),
      ...locations.map(location => ctx.db.delete(location._id)),
      ...sessions.map(session => ctx.db.delete(session._id)),
      ...accessRecords.map(access => ctx.db.delete(access._id)),
      ...pendingMetadata.map(metadata => ctx.db.delete(metadata._id)),
      ...syncedMetadata.map(metadata => ctx.db.delete(metadata._id)),
    ]);
    return [receipts, tickets, snapshots, locations, sessions, accessRecords, pendingMetadata, syncedMetadata]
      .some(rows => rows.length === 50);
  },
});

export const finalizeAttendantDeletion = internalMutation({
  args: { userId: v.id('users') },
  returns: v.object({ deleted: v.literal(true) }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant' || !user.deletionPending) {
      throw new ConvexError({ code: 'DELETION_NOT_PREPARED', message: 'This attendant is not ready for removal.' });
    }
    const email = user.email.trim().toLowerCase();
    const [receipts, tickets, snapshots, locations, sessions, accessRecords, pendingMetadata, syncedMetadata] = await Promise.all([
      ctx.db.query('receipts').withIndex('by_issued_by_user', q => q.eq('issuedByUserId', user._id)).take(1),
      ctx.db.query('tickets').withIndex('by_created_by_user', q => q.eq('createdByUserId', user._id)).take(1),
      ctx.db.query('reportSnapshots').withIndex('by_user_device_location_and_generated_at', q => q.eq('generatedByUserId', user._id)).take(1),
      ctx.db.query('loginLocationHistory').withIndex('by_user_and_logged_in_at', q => q.eq('userId', user._id)).take(1),
      ctx.db.query('userSessions').withIndex('by_account_email', q => q.eq('accountEmail', email)).take(1),
      ctx.db.query('deviceAccess').withIndex('by_account_email', q => q.eq('accountEmail', email)).take(1),
      ctx.db.query('receiptMetadata').withIndex('by_account_and_sync', q => q.eq('accountEmail', email).eq('isSynced', false)).take(1),
      ctx.db.query('receiptMetadata').withIndex('by_account_and_sync', q => q.eq('accountEmail', email).eq('isSynced', true)).take(1),
    ]);
    if ([receipts, tickets, snapshots, locations, sessions, accessRecords, pendingMetadata, syncedMetadata].some(rows => rows.length > 0)) {
      throw new ConvexError({ code: 'DELETION_CLEANUP_PENDING', message: 'Account history cleanup is not complete. Retry Delete to continue.' });
    }

    await writeAudit(ctx, admin._id, 'user_deleted', 'user', user._id, 'Removed an attendant login and profile; preserved operational rows with attendant identity and exact GPS removed.');
    await ctx.db.delete(user._id);
    return { deleted: true as const };
  },
});

export const deleteAttendant = action({
  args: { userId: v.id('users') },
  returns: v.object({ deleted: v.boolean(), cleanupPending: v.boolean() }),
  handler: async (ctx, args): Promise<{ deleted: boolean; cleanupPending: boolean }> => {
    await ctx.runQuery(internal.admin.assertCurrentAdministrator, {});
    const { email } = await ctx.runMutation(internal.admin.prepareAttendantDeletion, { userId: args.userId });
    try {
      await deleteCredentialAccountByEmail(ctx, email);
    } catch {
      throw new ConvexError({ code: 'ACCOUNT_BLOCKED_CLEANUP_PENDING', message: 'Sign-in is blocked and the device is released, but account cleanup could not finish. Retry Delete.' });
    }
    for (let round = 0; round < 20; round += 1) {
      const more: boolean = await ctx.runMutation(internal.admin.purgeAttendantDataChunk, { userId: args.userId });
      if (!more) {
        await ctx.runMutation(internal.admin.finalizeAttendantDeletion, { userId: args.userId });
        return { deleted: true, cleanupPending: false };
      }
    }
    return { deleted: false, cleanupPending: true };
  },
});

export const updateAttendant = mutation({
  args: { userId: v.id('users'), name: v.string(), phoneNumber: v.string(), locationId: v.id('locations') },
  returns: v.object({ updated: v.literal(true), requiresSignInAgain: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant') throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'Attendant profile was not found.' });
    if (!await ctx.db.get('locations', args.locationId)) throw new ConvexError({ code: 'LOCATION_NOT_FOUND', message: 'Choose an existing location.' });
    const name = normalizeName(args.name, 'Name');
    const phoneNumber = normalizePhone(args.phoneNumber);
    const locationChanged = user.locationId !== args.locationId;
    await ctx.db.patch('users', user._id, { name, phoneNumber, locationId: args.locationId });
    if (locationChanged) await invalidateUserSessions(ctx, user, Date.now(), 'pending');
    await writeAudit(ctx, admin._id, 'user_updated', 'user', user._id, locationChanged
      ? 'Updated attendant details and location; revoked the old session pending a fresh device approval.'
      : 'Updated attendant name and WhatsApp number.');
    return { updated: true as const, requiresSignInAgain: locationChanged };
  },
});

export const setAttendantActive = mutation({
  args: { userId: v.id('users'), isActive: v.boolean() },
  returns: v.object({ updated: v.literal(true), revoked: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant') throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'Attendant profile was not found.' });
    const now = Date.now();
    await ctx.db.patch('users', user._id, { isActive: args.isActive, disabledAt: args.isActive ? undefined : now });
    if (!args.isActive) {
      await invalidateUserSessions(ctx, user, now, 'revoked');
    } else {
      const assignment = await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', user._id)).unique();
      if (assignment?.status === 'revoked') {
        await ctx.db.patch('deviceAssignments', assignment._id, {
          status: 'pending',
          sessionId: undefined,
          sessionExpiresAt: undefined,
          revokedAt: undefined,
          latitude: undefined,
          longitude: undefined,
          accuracy: undefined,
          capturedAt: undefined,
          updatedAt: now,
        });
      }
    }
    await writeAudit(ctx, admin._id, args.isActive ? 'user_enabled' : 'user_disabled', 'user', user._id,
      args.isActive ? 'Re-enabled attendant sign-in.' : 'Disabled attendant sign-in and revoked the active device assignment and sessions.');
    return { updated: true as const, revoked: !args.isActive };
  },
});

export const assignDevice = mutation({
  args: { userId: v.id('users'), deviceId: v.string() },
  returns: v.object({ assigned: v.literal(true), requiresFreshApproval: v.literal(true) }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    if (!DEVICE_ID.test(args.deviceId)) throw new ConvexError({ code: 'INVALID_DEVICE_ID', message: 'Enter a valid device identifier.' });
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant' || user.isActive === false || !user.locationId) {
      throw new ConvexError({ code: 'ATTENDANT_NOT_READY', message: 'Choose an active attendant with an assigned location.' });
    }
    // Read both reservation ranges in the same transaction as the assignment write.
    // Convex serializable mutations retry a concurrent claim after either range changes.
    const deviceOwners = await Promise.all((['active', 'pending'] as const).map(status =>
      ctx.db.query('deviceAssignments')
        .withIndex('by_status_and_device', q => q.eq('status', status).eq('deviceId', args.deviceId))
        .unique(),
    ));
    if (isDeviceReservedForAnotherUser(deviceOwners.filter(owner => owner !== null), user._id, args.deviceId)) {
      throw new ConvexError({ code: 'DEVICE_ALREADY_ASSIGNED', message: 'That device is assigned to another account.' });
    }
    const now = Date.now();
    const existing = await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', user._id)).unique();
    if (existing?.sessionId) await invalidateUserSessions(ctx, user, now, 'pending');
    if (existing) {
      await ctx.db.patch('deviceAssignments', existing._id, {
        deviceId: args.deviceId,
        locationId: user.locationId,
        status: 'pending',
        sessionId: undefined,
        sessionExpiresAt: undefined,
        latitude: undefined,
        longitude: undefined,
        accuracy: undefined,
        capturedAt: undefined,
        updatedAt: now,
        revokedAt: undefined,
        changedByAdminId: admin._id,
      });
    } else {
      await ctx.db.insert('deviceAssignments', {
        userId: user._id,
        deviceId: args.deviceId,
        locationId: user.locationId,
        status: 'pending',
        assignedAt: now,
        updatedAt: now,
        changedByAdminId: admin._id,
      });
    }
    await writeAudit(ctx, admin._id, 'device_reassigned', 'device', user._id, 'Assigned a device to the attendant; fresh code approval and location capture are required.');
    return { assigned: true as const, requiresFreshApproval: true as const };
  },
});

export const revokeDevice = mutation({
  args: { userId: v.id('users') },
  returns: v.object({ revoked: v.literal(true) }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant') throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'Attendant profile was not found.' });
    await invalidateUserSessions(ctx, user, Date.now(), 'revoked');
    await writeAudit(ctx, admin._id, 'device_revoked', 'device', user._id, 'Revoked the attendant device assignment and sign-in sessions.');
    return { revoked: true as const };
  },
});

export const releaseDevice = mutation({
  args: { userId: v.id('users') },
  returns: v.object({ released: v.literal(true) }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const user = await ctx.db.get('users', args.userId);
    if (!user || user.role !== 'attendant') throw new ConvexError({ code: 'ATTENDANT_NOT_FOUND', message: 'Attendant profile was not found.' });
    const now = Date.now();
    await invalidateUserSessions(ctx, user, now, 'pending');
    const assignment = await ctx.db.query('deviceAssignments').withIndex('by_user', q => q.eq('userId', user._id)).unique();
    if (assignment) await ctx.db.delete('deviceAssignments', assignment._id);
    await writeAudit(ctx, admin._id, 'device_released', 'device', user._id, 'Released the device binding and revoked its sessions; the attendant must request approval on the replacement device.');
    return { released: true as const };
  },
});

export const createLocation = mutation({
  args: { name: v.string(), organizationName: v.string(), organizationCode: v.string(), address: v.string() },
  returns: v.id('locations'),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const name = normalizeName(args.name, 'Location name');
    const organizationName = normalizeName(args.organizationName, 'Organization name');
    const organizationCode = args.organizationCode.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,32}$/.test(organizationCode)) throw new ConvexError({ code: 'INVALID_ORGANIZATION_CODE', message: 'Use 2–32 letters, numbers, or hyphens for the organization code.' });
    const duplicate = await ctx.db.query('locations').withIndex('by_organization_code', q => q.eq('organizationCode', organizationCode)).first();
    if (duplicate) throw new ConvexError({ code: 'ORGANIZATION_CODE_EXISTS', message: 'That organization code is already in use.' });
    const locationId = await ctx.db.insert('locations', {
      name,
      organizationName,
      organizationCode,
      address: args.address.trim() || undefined,
      ownerUserId: admin._id,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, admin._id, 'location_created', 'location', locationId, 'Created a location.');
    return locationId;
  },
});

export const updateLocation = mutation({
  args: { locationId: v.id('locations'), name: v.string(), organizationName: v.string(), address: v.string() },
  returns: v.object({ updated: v.literal(true) }),
  handler: async (ctx, args) => {
    const admin = await requireAdministrator(ctx);
    const location = await ctx.db.get('locations', args.locationId);
    if (!location) throw new ConvexError({ code: 'LOCATION_NOT_FOUND', message: 'Location was not found.' });
    const name = normalizeName(args.name, 'Location name');
    const organizationName = normalizeName(args.organizationName, 'Organization name');
    await ctx.db.patch('locations', location._id, { name, organizationName, address: args.address.trim() || undefined });
    await writeAudit(ctx, admin._id, 'location_updated', 'location', location._id, 'Updated location details.');
    return { updated: true as const };
  },
});
