import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { adminSeed, initialTickets, userSeed } from '../src/data/seed';
import { localDatabase } from '../src/data/localDatabase';
import { buildReportExport } from '../src/lib/reportExport';
import { createTicket } from '../src/lib/appFlows';

function main() {
  localDatabase.reset(initialTickets);

  assert.equal(adminSeed.email, 'arsalan.valet@demo.local');
  assert.equal(adminSeed.role, 'Admin');
  assert.equal(userSeed.role, 'Attendant');

  const before = localDatabase.getDailyReport();
  const attendantTicket = createTicket({
    vehicleType: 'Bike',
    vehicleNumber: 'MH12ZZ9999',
    existingCount: localDatabase.listTickets().length,
  });
  localDatabase.addTicket(attendantTicket);

  const after = localDatabase.getDailyReport();
  assert.equal(after.count, before.count + 1);
  assert.equal(after.total, before.total + attendantTicket.amount);

  const exportPayload = buildReportExport({
    locationName: adminSeed.locationName,
    tickets: localDatabase.listTickets(),
    report: after,
    generatedAt: '2026-07-17T00:00:00.000Z',
  });

  assert.ok(exportPayload.fileName.endsWith('.xlsx'));
  const workbookFiles = unzipSync(exportPayload.bytes);
  const receiptsSheet = strFromU8(workbookFiles['xl/worksheets/sheet2.xml']);
  const summarySheet = strFromU8(workbookFiles['xl/worksheets/sheet1.xml']);
  assert.ok(receiptsSheet.includes('Receipt Number'));
  assert.ok(receiptsSheet.includes(attendantTicket.ticketNumber));
  assert.doesNotMatch(receiptsSheet, /Latitude|Longitude|GPS/);
  assert.ok(summarySheet.includes(`<c r="B4"><v>${after.count}</v></c>`));

  console.log('E2E flow check passed');
}

main();
