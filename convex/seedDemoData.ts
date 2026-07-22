import { mutation } from './_generated/server';

export const seedDemoData = mutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();

    const locationId = await ctx.db.insert('locations', {
      name: 'Valet Parking - Main Gate',
      address: 'Mumbai, Maharashtra',
      createdAt: now,
    });

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

    const userIds: Array<any> = [];
    for (const user of users) {
      const userId = await ctx.db.insert('users', {
        ...user,
        locationId,
        createdAt: now,
      });
      userIds.push(userId);
    }

    await ctx.db.patch(locationId, {
      ownerUserId: userIds[0] as any,
    });

    const checkIns = [
      ['demo-ticket-001', '1-0001', 'Car', 'MH12AB1234', 50, userIds[2]],
      ['demo-ticket-002', '1-0002', 'Bike', 'MH01XY2026', 20, userIds[3]],
      ['demo-ticket-003', '1-0003', 'Car', 'MH14CD7777', 50, userIds[4]],
      ['demo-ticket-004', '1-0004', 'Bike', 'MH02EF1111', 20, userIds[2]],
      ['demo-ticket-005', '1-0005', 'Car', 'MH09GH9090', 50, userIds[3]],
    ] as const;

    for (const [clientId, ticketNumber, vehicleType, vehicleNumber, amount, createdByUserId] of checkIns) {
      await ctx.db.insert('tickets', {
        clientId,
        locationId,
        ticketNumber,
        vehicleType: vehicleType as 'Car' | 'Bike',
        vehicleNumber,
        amount,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdAt: now,
        createdByUserId: createdByUserId as any,
      });
    }

    return {
      locationId,
      userCount: userIds.length,
      ticketCount: checkIns.length,
    };
  },
});
