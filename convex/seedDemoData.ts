import { internalMutation, type MutationCtx } from './_generated/server';
import { Id } from './_generated/dataModel';
import { v } from 'convex/values';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function findUserByEmail(ctx: MutationCtx, email: string) {
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

  for await (const user of ctx.db.query('users')) {
    if (normalizeEmail(user.email) === normalizedEmail) {
      return user;
    }
  }

  return null;
}

export const seedDemoData = internalMutation({
  args: {},
  returns: v.object({
    locationId: v.id('locations'),
    userCount: v.number(),
    ticketCount: v.number(),
    receiptCount: v.number(),
    reportCount: v.number(),
  }),
  handler: async ctx => {
    const now = Date.now();
    const reportDate = new Date(now).toISOString().slice(0, 10);

    const existingAdmin = await findUserByEmail(ctx, 'arsalan.valet@demo.local');
    let locationId = existingAdmin?.locationId;

    if (!locationId) {
      locationId = await ctx.db.insert('locations', {
        name: 'Valet Parking - Main Gate',
        organizationName: 'Arsalan Valet parking',
        address: 'Mumbai, Maharashtra',
        organizationCode: 'demo-org',
        createdAt: now,
      });
    }

    const users = [
      {
        email: 'arsalan.valet@demo.local',
        name: 'Arsalan Valet',
        role: 'admin' as const,
      },
      {
        email: 'ibrahim.valetparking@demo.local',
        name: 'Ibrahim Valet Parking',
        role: 'admin' as const,
      },
      {
        email: 'rohit.attendant@demo.local',
        name: 'Rohit Sharma',
        role: 'attendant' as const,
      },
      {
        email: 'sameer.attendant@demo.local',
        name: 'Sameer Khan',
        role: 'attendant' as const,
      },
      {
        email: 'faizan.attendant@demo.local',
        name: 'Faizan Ali',
        role: 'attendant' as const,
      },
    ];

    const userIds: Array<Id<'users'>> = [];
    for (const user of users) {
      const email = normalizeEmail(user.email);
      const existingUser = await findUserByEmail(ctx, user.email);

      if (existingUser && (existingUser.emailNormalized !== email || !existingUser.locationId)) {
        await ctx.db.patch(existingUser._id, {
          emailNormalized: email,
          locationId: existingUser.locationId ?? locationId,
        });
      }

      const userId =
        existingUser?._id ??
        (await ctx.db.insert('users', {
          ...user,
          email,
          emailNormalized: email,
          locationId,
          createdAt: now,
        }));
      userIds.push(userId);
    }

    await ctx.db.patch(locationId, {
      ownerUserId: userIds[0],
      organizationCode: 'demo-org',
      organizationName: 'Arsalan Valet parking',
    });

    const checkIns = [
      ['demo-ticket-001', '1-0001', 'Car', 'MH12AB1234', 100, userIds[2], 'Ali Merchant'],
      ['demo-ticket-002', '1-0002', 'Bike', 'MH01XY2026', 50, userIds[3], 'Priya Nair'],
      ['demo-ticket-003', '1-0003', 'Car', 'MH14CD7777', 100, userIds[4], 'Kabir Shaikh'],
      ['demo-ticket-004', '1-0004', 'Bike', 'MH02EF1111', 50, userIds[2], 'Neha Kapoor'],
      ['demo-ticket-005', '1-0005', 'Car', 'MH09GH9090', 100, userIds[3], 'Vikram Rao'],
    ] as const;

    const ticketIds: Array<Id<'tickets'>> = [];
    const operatorNames = new Map(userIds.map((userId, index) => [userId, users[index].name]));
    for (const [clientId, ticketNumber, vehicleType, vehicleNumber, amount, createdByUserId, customerName] of checkIns) {
      const existingTicket = await ctx.db
        .query('tickets')
        .withIndex('by_client_id', q => q.eq('clientId', clientId))
        .first();
      const ticketId =
        existingTicket?._id ??
        (await ctx.db.insert('tickets', {
          clientId,
          locationId,
          ticketNumber,
          vehicleType,
          vehicleNumber,
          amount,
          paymentStatus: 'paid',
          paymentMethod: 'cash',
          createdAt: now,
          createdByUserId,
        }));
      ticketIds.push(ticketId);

      const existingReceipt = await ctx.db
        .query('receipts')
        .withIndex('by_ticket', q => q.eq('ticketId', ticketId))
        .first();

      if (!existingReceipt) {
        await ctx.db.insert('receipts', {
          ticketId,
          locationId,
          receiptNumber: `RCPT-${ticketNumber}`,
          organizationCode: 'DEMO-ORG',
          organizationName: 'Arsalan Valet parking',
          locationName: 'Valet Parking - Main Gate',
          barcodeValue: `RCPT-${ticketNumber}`,
          vehicleType,
          printStatus: 'pending',
          reprintCount: 0,
          operatorName: operatorNames.get(createdByUserId) ?? 'Unknown operator',
          paymentStatus: 'paid',
          customerName,
          vehicleNumber,
          amount,
          paymentMethod: 'cash',
          issuedAt: now,
          issuedByUserId: createdByUserId,
        });
      }
    }

    const existingReport = await ctx.db
      .query('reportSnapshots')
      .withIndex('by_location_and_report_date', q => q.eq('locationId', locationId).eq('reportDate', reportDate))
      .first();

    if (!existingReport) {
      await ctx.db.insert('reportSnapshots', {
        locationId,
        reportDate,
        ticketCount: ticketIds.length,
        receiptCount: checkIns.length,
        cashRevenue: checkIns.reduce((sum, checkIn) => sum + checkIn[4], 0),
        generatedAt: now,
        generatedByUserId: userIds[0],
      });
    }

    return {
      locationId,
      userCount: userIds.length,
      ticketCount: checkIns.length,
      receiptCount: checkIns.length,
      reportCount: 1,
    };
  },
});
