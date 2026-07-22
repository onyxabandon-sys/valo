import { NativeModules } from 'react-native';

export type PrinterStatus = 'ready' | 'no_paper' | 'error';

export type SlipPrintPayload = {
  ticketId: string;
  ticketNumber: string;
  vehicleNumber: string;
  vehicleType: string;
  locationName: string;
  amount: number;
  paymentStatus: string;
  createdAt: string;
  barcodeValue: string;
};

export interface SunmiBridge {
  printSlip(payload: SlipPrintPayload): Promise<{ success: boolean }>;
  scanBarcode(): Promise<{ code: string }>;
  getPrinterStatus(): Promise<PrinterStatus>;
}

const nativeModule = NativeModules.SunmiBridge as
  | {
      printSlip?: (payload: SlipPrintPayload) => Promise<{ success: boolean }>;
      scanBarcode?: () => Promise<{ code: string }>;
      getPrinterStatus?: () => Promise<PrinterStatus>;
    }
  | undefined;

const fallbackBridge: SunmiBridge = {
  async printSlip() {
    return { success: false };
  },
  async scanBarcode() {
    return { code: '' };
  },
  async getPrinterStatus() {
    return 'error';
  },
};

export const SunmiNative: SunmiBridge = nativeModule
  ? {
      printSlip: payload => nativeModule.printSlip?.(payload) ?? Promise.resolve({ success: false }),
      scanBarcode: () => nativeModule.scanBarcode?.() ?? Promise.resolve({ code: '' }),
      getPrinterStatus: () => nativeModule.getPrinterStatus?.() ?? Promise.resolve('error'),
    }
  : fallbackBridge;
