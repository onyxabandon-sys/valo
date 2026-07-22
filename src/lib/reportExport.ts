import { Ticket } from '../types';

type ReportLike = {
  count: number;
  revenue: number;
} | null;

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildReportExport(params: {
  locationName: string;
  tickets: Ticket[];
  report: ReportLike;
  generatedAt: string;
}) {
  const lines = [
    ['Generated At', params.generatedAt],
    ['Location', params.locationName],
    ['Tickets', String(params.report?.count ?? params.tickets.length)],
    ['Revenue', String(params.report?.revenue ?? params.tickets.reduce((sum, ticket) => sum + ticket.amount, 0))],
    [],
    ['Ticket Number', 'Vehicle Number', 'Vehicle Type', 'Amount', 'Created At', 'Payment Status', 'Payment Method'],
    ...params.tickets.map(ticket => [
      ticket.ticketNumber,
      ticket.vehicleNumber,
      ticket.vehicleType,
      ticket.amount.toFixed(2),
      ticket.createdAt,
      ticket.paymentStatus,
      ticket.paymentMethod,
    ]),
  ];

  const csv = lines
    .map(row => row.map(cell => csvEscape(String(cell ?? ''))).join(','))
    .join('\n');

  return {
    fileName: `report-${params.generatedAt.slice(0, 10)}.csv`,
    csv,
  };
}
