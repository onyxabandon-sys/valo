import { NativeModules } from 'react-native';

export type PrinterStatus =
  | 'ready'
  | 'initializing'
  | 'hardware_error'
  | 'out_of_paper'
  | 'overheated'
  | 'cover_open'
  | 'cutter_error'
  | 'cutter_recovered'
  | 'black_mark_missing'
  | 'not_found'
  | 'unknown_error'
  | 'disconnected';

export type PrinterStatusResult = { status: PrinterStatus; code?: number };

export type SlipPrintPayload = {
  receiptId: string;
  receiptNumber: string;
  organizationCode: string;
  organizationName?: string;
  vehicleNumber: string;
  vehicleType: string;
  vehicleRate: number;
  issuedAt: string;
  barcodeValue: string;
};

export interface SunmiBridge {
  printSlip(payload: SlipPrintPayload): Promise<{ success: boolean; receiptId?: string; durationMs?: number }>;
  scanBarcode(): Promise<{ code: string }>;
  getPrinterStatus(): Promise<PrinterStatusResult>;
}

const nativeModule = NativeModules.SunmiBridge as
  | {
      printSlip?: (payload: SlipPrintPayload) => Promise<{ success: boolean; receiptId?: string; durationMs?: number }>;
      scanBarcode?: () => Promise<{ code: string }>;
      getPrinterStatus?: () => Promise<PrinterStatusResult>;
    }
  | undefined;

const fallbackBridge: SunmiBridge = {
  async printSlip() {
    return { success: false };
  },
  async scanBarcode() {
    throw new Error('BARCODE_SCANNER_UNAVAILABLE');
  },
  async getPrinterStatus() {
    return { status: 'disconnected' };
  },
};

export const SunmiNative: SunmiBridge = nativeModule
  ? {
      printSlip: payload => nativeModule.printSlip?.(payload) ?? Promise.resolve({ success: false }),
      scanBarcode: () => nativeModule.scanBarcode?.() ?? Promise.reject(new Error('BARCODE_SCANNER_UNAVAILABLE')),
      getPrinterStatus: () => nativeModule.getPrinterStatus?.() ?? Promise.resolve({ status: 'disconnected' }),
    }
  : fallbackBridge;
