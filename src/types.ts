export type Screen =
  | 'login'
  | 'menu'
  | 'vehicleTypes'
  | 'vehicleForm'
  | 'slip'
  | 'lookup'
  | 'report'
  | 'profile';

export type PricedVehicleType = 'Bike' | 'Car';
export type VehicleType = PricedVehicleType | 'Commercial Vehicle' | 'Bus' | 'Heavy Vehicle' | 'Tractor';

export type Ticket = {
  id: string;
  ticketNumber: string;
  vehicleType: VehicleType;
  vehicleNumber: string;
  amount: number;
  createdAt: string;
  locationName: string;
  paymentStatus: 'paid';
  paymentMethod: 'cash';
};

export type BillableTicket = Omit<Ticket, 'vehicleType'> & { vehicleType: PricedVehicleType };

export type Receipt = {
  id: string;
  receiptNumber: string;
  barcodeValue: string;
  organizationCode: string;
  organizationName?: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleRate: number;
  issuedAt: string;
  printStatus: 'pending' | 'printed' | 'failed';
  reprintCount: number;
};

export type BillableReceipt = Omit<Receipt, 'vehicleType'> & { vehicleType: PricedVehicleType };

export type DeviceLocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  provider?: string;
  capturedAt: string;
};

export type ReportRow = {
  receiptNumber: string;
  barcodeValue: string;
  organizationCode: string;
  organizationName: string;
  locationName: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleRate: number;
  issuedAt: string;
  operatorName: string;
  paymentMethod: 'cash';
  paymentStatus: 'paid' | 'void';
  printStatus: Receipt['printStatus'];
  syncStatus: 'pending' | 'synced' | 'failed';
  reprintCount: number;
};

export type User = {
  name: string;
  email: string;
  role: string;
  locationId?: string;
  organizationCode: string;
  organizationName: string;
  locationName: string;
  locationAddress: string;
  employeeId: string;
  phone: string;
  joinedAt: string;
  gps: string;
  status: 'Active';
};
