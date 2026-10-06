export type ReceiptPrintStatus = 'pending' | 'printed' | 'failed';

export function shouldIgnorePrintStatusUpdate(stored: ReceiptPrintStatus | undefined, requested: ReceiptPrintStatus) {
  return stored === 'printed' && requested !== 'printed';
}
