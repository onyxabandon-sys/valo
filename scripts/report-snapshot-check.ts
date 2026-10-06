import assert from 'node:assert/strict';
import { addPrintedReceiptPage, assertLegacyReportCandidateCount, assertSnapshotPageLimit, isReceiptInReportScope, isWithinRollingReportWindow, makeRollingReportWindow, REPORT_WINDOW_MS, SNAPSHOT_MAX_CANDIDATES, SNAPSHOT_MAX_PAGES } from '../shared/reportSnapshots';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function run() {
  const endAt = Date.UTC(2026, 9, 6, 10, 0, 0);
  const window = makeRollingReportWindow(endAt);
  assert.equal(window.endAt - window.startAt, REPORT_WINDOW_MS);
  assert.equal(window.startAt, Date.UTC(2026, 9, 5, 10, 0, 0));
  assert.equal(isWithinRollingReportWindow(window.startAt, window), true, 'the start is inclusive');
  assert.equal(isWithinRollingReportWindow(window.endAt - 1, window), true, 'the final millisecond is included');
  assert.equal(isWithinRollingReportWindow(window.endAt, window), false, 'the end is exclusive');
  assert.equal(isWithinRollingReportWindow(window.startAt - 1, window), false, 'receipts before the window are excluded');
  assert.throws(() => makeRollingReportWindow(1.5), /INVALID_REPORT_END_TIME/);
  assertLegacyReportCandidateCount(0);
  assertLegacyReportCandidateCount(2_000);
  assert.throws(() => assertLegacyReportCandidateCount(2_001), /REPORT_TOO_LARGE/);
  assert.throws(() => assertLegacyReportCandidateCount(-1), /REPORT_TOO_LARGE/);
  assert.throws(() => assertLegacyReportCandidateCount(1.5), /REPORT_TOO_LARGE/);
  assertSnapshotPageLimit(SNAPSHOT_MAX_PAGES - 1, false);
  assertSnapshotPageLimit(SNAPSHOT_MAX_PAGES, true);
  assert.throws(() => assertSnapshotPageLimit(SNAPSHOT_MAX_PAGES, false), /REPORT_TOO_LARGE/);
  assert.throws(() => assertSnapshotPageLimit(SNAPSHOT_MAX_PAGES + 1, true), /REPORT_TOO_LARGE/);
  assert.throws(() => assertSnapshotPageLimit(-1, true), /REPORT_TOO_LARGE/);
  assert.equal(SNAPSHOT_MAX_CANDIDATES, 10_000, 'the rolling report scan is bounded to 10,000 location receipts');

  const reportsBackend = readFileSync(path.join(process.cwd(), 'convex', 'reports.ts'), 'utf8');
  assert.match(reportsBackend, /assertSnapshotPageLimit\(pageCount, page\.isDone\)/, 'the action must stop before storing an incomplete report');
  assert.match(reportsBackend, /code: 'REPORT_TOO_LARGE'.*The report was not saved/s);

  const scope = { ...window, userId: 'user-a', deviceId: 'device-a', locationId: 'location-a' };
  const matchingReceipt = { issuedByUserId: 'user-a', deviceId: 'device-a', locationId: 'location-a', issuedAt: window.startAt, printStatus: 'printed' as const };
  assert.equal(isReceiptInReportScope(matchingReceipt, scope), true, 'only the matching user, device, location, time, and printed state are included');
  assert.equal(isReceiptInReportScope({ ...matchingReceipt, issuedByUserId: 'user-b' }, scope), false, 'another user is excluded');
  assert.equal(isReceiptInReportScope({ ...matchingReceipt, deviceId: 'device-b' }, scope), false, 'another device is excluded');
  assert.equal(isReceiptInReportScope({ ...matchingReceipt, locationId: 'location-b' }, scope), false, 'another location is excluded');
  assert.equal(isReceiptInReportScope({ ...matchingReceipt, printStatus: 'pending' }, scope), false, 'pending receipts are excluded');
  assert.equal(isReceiptInReportScope({ ...matchingReceipt, printStatus: 'failed' }, scope), false, 'failed receipts are excluded');
  assert.equal(isReceiptInReportScope({ ...matchingReceipt, issuedByUserId: undefined }, scope), false, 'anonymized receipts no longer map back to a deleted attendant');
  assert.equal(isReceiptInReportScope({ ...matchingReceipt, issuedAt: window.endAt }, scope), false, 'the exclusive end is excluded');

  const receipts = Array.from({ length: 501 }, (_, index) => ({
    amount: index === 500 ? 100 : 50,
    printStatus: 'printed' as const,
    reprintCount: index === 0 ? 12 : 0,
  }));
  const nonPrinted = [
    { amount: 900, printStatus: 'pending' as const },
    { amount: 800, printStatus: 'failed' as const },
  ];
  const pages = [receipts.slice(0, 250), receipts.slice(250, 500), [...receipts.slice(500), ...nonPrinted]];
  let totals = { count: 0, revenueCents: 0 };
  for (const page of pages) totals = addPrintedReceiptPage(totals, page);
  assert.equal(totals.count, 501, 'pagination over more than 500 receipts counts each printed receipt once');
  assert.equal(totals.revenueCents, 2_510_000, 'pending and failed rows do not add revenue');
  assert.equal(addPrintedReceiptPage({ count: 0, revenueCents: 0 }, [receipts[0]]).count, 1, 'reprints remain one receipt row');
  assert.throws(() => addPrintedReceiptPage({ count: 0, revenueCents: 0 }, [{ amount: -1, printStatus: 'printed' }]), /INVALID_RECEIPT_AMOUNT/);
  assert.throws(() => addPrintedReceiptPage({ count: Number.MAX_SAFE_INTEGER, revenueCents: 0 }, [{ amount: 1, printStatus: 'printed' }]), /REPORT_TOO_LARGE/);

  console.log('Rolling report snapshot checks passed.');
}

run();
