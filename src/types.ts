export type Screen =
  | 'login'
  | 'signup'
  | 'menu'
  | 'vehicleTypes'
  | 'vehicleForm'
  | 'slip'
  | 'lookup'
  | 'report'
  | 'profile';

export type VehicleType =
  | 'Car'
  | 'Bike'
  | 'Commercial Vehicle'
  | 'Bus'
  | 'Heavy Vehicle'
  | 'Tractor';

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

export type User = {
  name: string;
  email: string;
  role: string;
  locationId?: string;
  locationName: string;
  locationAddress: string;
  employeeId: string;
  phone: string;
  joinedAt: string;
  gps: string;
  status: 'Active';
};
