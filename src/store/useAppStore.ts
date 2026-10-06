import { create } from 'zustand';
import { adminSeed, VEHICLE_RATES } from '../data/seed';
import { localDatabase } from '../data/localDatabase';
import { Receipt, Ticket, User, PricedVehicleType } from '../types';

type AppState = {
  authenticated: boolean;
  user: User;
  tickets: Ticket[];
  selectedVehicle: PricedVehicleType;
  selectedAmount: string;
  vehicleNumber: string;
  generatedTicket: Ticket | null;
  generatedReceipt: Receipt | null;
  barcodeQuery: string;
  error: string;
  loginEmail: string;
  loginPassword: string;
  bootstrap: () => void;
  setAuthenticated: (value: boolean) => void;
  setUser: (value: User) => void;
  setTickets: (value: Ticket[]) => void;
  setSelectedVehicle: (value: PricedVehicleType) => void;
  setSelectedAmount: (value: string) => void;
  setVehicleNumber: (value: string) => void;
  setGeneratedTicket: (value: Ticket | null) => void;
  setGeneratedReceipt: (value: Receipt | null) => void;
  setBarcodeQuery: (value: string) => void;
  setError: (value: string) => void;
  setLoginEmail: (value: string) => void;
  setLoginPassword: (value: string) => void;
  refreshTickets: () => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  authenticated: false,
  user: adminSeed,
  tickets: [],
  selectedVehicle: 'Car',
  selectedAmount: '100.00',
  vehicleNumber: '',
  generatedTicket: null,
  generatedReceipt: null,
  barcodeQuery: '',
  error: '',
  loginEmail: '',
  loginPassword: '',
  bootstrap: () => {
    localDatabase.reset([]);
    set({
      tickets: localDatabase.listTickets(),
      authenticated: false,
      user: adminSeed,
      selectedVehicle: 'Car',
      selectedAmount: VEHICLE_RATES.Car.toFixed(2),
      vehicleNumber: '',
      generatedTicket: null,
      generatedReceipt: null,
      barcodeQuery: '',
      error: '',
    });
  },
  setAuthenticated: authenticated => set({ authenticated }),
  setUser: user => set({ user }),
  setTickets: tickets => set({ tickets }),
  setSelectedVehicle: selectedVehicle => set({ selectedVehicle }),
  setSelectedAmount: selectedAmount => set({ selectedAmount }),
  setVehicleNumber: vehicleNumber => set({ vehicleNumber }),
  setGeneratedTicket: generatedTicket => set({ generatedTicket }),
  setGeneratedReceipt: generatedReceipt => set({ generatedReceipt }),
  setBarcodeQuery: barcodeQuery => set({ barcodeQuery }),
  setError: error => set({ error }),
  setLoginEmail: loginEmail => set({ loginEmail }),
  setLoginPassword: loginPassword => set({ loginPassword }),
  refreshTickets: () => set({ tickets: localDatabase.listTickets() }),
}));
