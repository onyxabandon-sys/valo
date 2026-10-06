import { mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { matchesClaimedDeviceId } from '../shared/deviceAssignments';
import { requireAppUserWithAssignment, requireApprovedIdentity } from './lib/auth';

const metadataValidator = v.object({
  _id: v.id('receiptMetadata'),
  _creationTime: v.number(),
  receiptId: v.string(),
  deviceId: v.string(),
  accountEmail: v.string(),
  timestamp: v.number(),
  isSynced: v.boolean(),
  lamportClock: v.number(),
  lastMutationId: v.string(),
});

export const upsert = mutation({
  args: {
    receiptId: v.string(),
    deviceId: v.string(),
    accountEmail: v.string(),
    timestamp: v.number(),
    lamportClock: v.number(),
    lastMutationId: v.string(),
  },
  returns: metadataValidator,
  handler: async (ctx, args) => {
    const { identity, assignment } = await requireAppUserWithAssignment(ctx);
    const accountEmail = args.accountEmail.trim().toLowerCase();
    if (identity.email?.trim().toLowerCase() !== accountEmail) {
      throw new ConvexError({ code: 'METADATA_ACCOUNT_MISMATCH', message: 'Receipt metadata account does not match the authenticated account.' });
    }
    if (!matchesClaimedDeviceId(args.deviceId, assignment.deviceId)) {
      throw new ConvexError({ code: 'UNAUTHORIZED_DEVICE', message: 'Receipt metadata does not match the approved device.' });
    }
    const existing = await ctx.db.query('receiptMetadata').withIndex('by_receipt_id', q => q.eq('receiptId', args.receiptId)).unique();
    if (existing && (existing.deviceId !== assignment.deviceId || existing.accountEmail !== accountEmail)) {
      throw new ConvexError({ code: 'METADATA_SCOPE_MISMATCH', message: 'Receipt metadata belongs to another account or device.' });
    }
    if (existing && existing.lamportClock > args.lamportClock) return existing;
    const values = {
      receiptId: args.receiptId,
      deviceId: assignment.deviceId,
      accountEmail,
      timestamp: args.timestamp,
      isSynced: true,
      lamportClock: args.lamportClock,
      lastMutationId: args.lastMutationId,
    };
    if (existing) {
      await ctx.db.replace(existing._id, values);
      return { ...existing, ...values };
    }
    const id = await ctx.db.insert('receiptMetadata', values);
    const created = await ctx.db.get(id);
    if (!created) throw new ConvexError({ code: 'METADATA_WRITE_FAILED', message: 'Could not persist receipt metadata.' });
    return created;
  },
});

export const listPending = query({
  args: { accountEmail: v.string(), limit: v.number() },
  returns: v.array(metadataValidator),
  handler: async (ctx, args) => {
    const identity = await requireApprovedIdentity(ctx);
    const accountEmail = args.accountEmail.trim().toLowerCase();
    if (identity.email?.trim().toLowerCase() !== accountEmail) throw new ConvexError({ code: 'METADATA_ACCOUNT_MISMATCH', message: 'Account mismatch.' });
    return await ctx.db.query('receiptMetadata')
      .withIndex('by_account_and_sync', q => q.eq('accountEmail', accountEmail).eq('isSynced', false))
      .order('asc')
      .take(Math.max(1, Math.min(args.limit, 100)));
  },
});
