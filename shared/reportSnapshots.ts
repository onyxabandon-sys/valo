export const REPORT_WINDOW_MS = 24 * 60 * 60_000;
export const LEGACY_REPORT_MAX_CANDIDATES = 2_000;
export const SNAPSHOT_PAGE_SIZE = 500;
export const SNAPSHOT_MAX_PAGES = 20;
export const SNAPSHOT_MAX_CANDIDATES = SNAPSHOT_PAGE_SIZE * SNAPSHOT_MAX_PAGES;

export type RollingReportWindow = {
  startAt: number;
  endAt: number;
};

export type ReportReceiptScope = RollingReportWindow & {
  userId: string;
  deviceId: string;
  locationId: string;
};

export type ReportReceiptCandidate = {
  issuedByUserId?: string;
  deviceId?: string;
  locationId: string;
  issuedAt: number;
  printStatus?: 'pending' | 'printed' | 'failed';
};

export type PrintedReceiptPageRow = {
  amount: number;
  printStatus: 'pending' | 'printed' | 'failed';
};

export type PrintedReceiptTotals = {
  count: number;
  revenueCents: number;
};

export function assertLegacyReportCandidateCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 0 || count > LEGACY_REPORT_MAX_CANDIDATES) {
    throw new RangeError('REPORT_TOO_LARGE');
  }
}

export function assertSnapshotPageLimit(pageCount: number, isDone: boolean) {
  if (
    !Number.isSafeInteger(pageCount) ||
    pageCount < 0 ||
    pageCount > SNAPSHOT_MAX_PAGES ||
    (pageCount === SNAPSHOT_MAX_PAGES && !isDone)
  ) {
    throw new RangeError('REPORT_TOO_LARGE');
  }
}

export function makeRollingReportWindow(endAt: number): RollingReportWindow {
  if (!Number.isSafeInteger(endAt)) throw new RangeError('INVALID_REPORT_END_TIME');
  return { startAt: endAt - REPORT_WINDOW_MS, endAt };
}

export function isWithinRollingReportWindow(issuedAt: number, window: RollingReportWindow) {
  return Number.isSafeInteger(issuedAt) && issuedAt >= window.startAt && issuedAt < window.endAt;
}

export function isReceiptInReportScope(receipt: ReportReceiptCandidate, scope: ReportReceiptScope) {
  return receipt.issuedByUserId === scope.userId &&
    receipt.deviceId === scope.deviceId &&
    receipt.locationId === scope.locationId &&
    receipt.printStatus === 'printed' &&
    isWithinRollingReportWindow(receipt.issuedAt, scope);
}

export function addPrintedReceiptPage(totals: PrintedReceiptTotals, rows: readonly PrintedReceiptPageRow[]): PrintedReceiptTotals {
  let count = totals.count;
  let revenueCents = totals.revenueCents;
  for (const row of rows) {
    if (row.printStatus !== 'printed') continue;
    const cents = Math.round(row.amount * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('INVALID_RECEIPT_AMOUNT');
    count += 1;
    revenueCents += cents;
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(revenueCents)) throw new RangeError('REPORT_TOO_LARGE');
  }
  return { count, revenueCents };
}
