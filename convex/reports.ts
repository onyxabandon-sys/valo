import { query } from './_generated/server';
import { v } from 'convex/values';

export const getDailyReport = query({
  args: {
    locationId: v.id('locations'),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const tickets = await ctx.db
      .query('tickets')
      .withIndex('by_location_and_date', q => q.eq('locationId', args.locationId))
      .filter(q => q.and(q.gte(q.field('createdAt'), args.from), q.lt(q.field('createdAt'), args.to)))
      .collect();

    return {
      count: tickets.length,
      revenue: tickets.reduce((sum, ticket) => sum + ticket.amount, 0),
      tickets,
    };
  },
});

export const listReportSnapshots = query({
  args: { locationId: v.id('locations') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('reportSnapshots')
      .withIndex('by_location_and_generated_at', q => q.eq('locationId', args.locationId))
      .order('desc')
      .take(30);
  },
});
