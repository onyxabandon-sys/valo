import { mutation } from './_generated/server';
import { Id } from './_generated/dataModel';

export const seedDemoData = mutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();
    const reportDate = new Date(now).toISOString().slice(0, 10);

    const existingAdmin = await ctx.db
      .query('users')
      .withIndex('by_email', q => q.eq('email', 'arsalan.valet@demo.local'))
      .first();
    let locationId = existingAdmin?.locationId;

    if (!locationId) {
      locationId = await ctx.db.insert('locations', {
        name: 'Valet Parking - Main Gate',
        address: 'Mumbai, Maharashtra',
        createdAt: now,
      });
    }

    const users = [
      {
        email: 'arsalan.valet@demo.local',
        passwordHash: 'demo-arsalan-123',
        name: 'Arsalan Valet',
        role: 'admin' as const,
      },
      {
        email: 'ibrahim.valetparking@demo.local',
        passwordHash: 'demo-ibrahim-123',
        name: 'Ibrahim Valet Parking',
        role: 'admin' as const,
      },
      {
        email: 'rohit.attendant@demo.local',
        passwordHash: 'demo-rohit-123',
        name: 'Rohit Sharma',
        role: 'attendant' as const,
      },
      {
        email: 'sameer.attendant@demo.local',
        passwordHash: 'demo-sameer-123',
        name: 'Sameer Khan',
        role: 'attendant' as const,
      },
      {
        email: 'faizan.attendant@demo.local',
        passwordHash: 'demo-faizan-123',
        name: 'Faizan Ali',
        role: 'attendant' as const,
      },
    ];

    const userIds: Array<Id<'users'>> = [];
    for (const user of users) {
      const existingUser = await ctx.db
        .query('users')
        .withIndex('by_email', q => q.eq('email', user.email))
        .first();
      const userId =
        existingUser?._id ??
        (await ctx.db.insert('users', {
          ...user,
          locationId,
          createdAt: now,
        }));
      userIds.push(userId);
    }

    await ctx.db.patch(locationId, {
      ownerUserId: userIds[0],
    });

    const checkIns = [
      ['demo-ticket-001', '1-0001', 'Car', 'MH12AB1234', 50, userIds[2], 'Ali Merchant'],
      ['demo-ticket-002', '1-0002', 'Bike', 'MH01XY2026', 20, userIds[3], 'Priya Nair'],
      ['demo-ticket-003', '1-0003', 'Car', 'MH14CD7777', 50, userIds[4], 'Kabir Shaikh'],
      ['demo-ticket-004', '1-0004', 'Bike', 'MH02EF1111', 20, userIds[2], 'Neha Kapoor'],
      ['demo-ticket-005', '1-0005', 'Car', 'MH09GH9090', 50, userIds[3], 'Vikram Rao'],
    ] as const;

    const ticketIds: Array<Id<'tickets'>> = [];
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
