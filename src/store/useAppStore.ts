import { create } from 'zustand';
import { adminSeed, initialTickets, userSeed } from '../data/seed';
import { localDatabase } from '../data/localDatabase';
import { Ticket, User, VehicleType } from '../types';

type AppState = {
  authenticated: boolean;
  user: User;
  tickets: Ticket[];
  selectedVehicle: VehicleType;
  selectedAmount: string;
  vehicleNumber: string;
  generatedTicket: Ticket | null;
  barcodeQuery: string;
  error: string;
  loginEmail: string;
  loginPassword: string;
  signupEmail: string;
  signupPassword: string;
  signupConfirm: string;
  signupLocation: string;
  signupCode: string;
  bootstrap: () => void;
  setAuthenticated: (value: boolean) => void;
  setUser: (value: User) => void;
  setTickets: (value: Ticket[]) => void;
  setSelectedVehicle: (value: VehicleType) => void;
  setSelectedAmount: (value: string) => void;
  setVehicleNumber: (value: string) => void;
  setGeneratedTicket: (value: Ticket | null) => void;
  setBarcodeQuery: (value: string) => void;
  setError: (value: string) => void;
  setLoginEmail: (value: string) => void;
  setLoginPassword: (value: string) => void;
  setSignupEmail: (value: string) => void;
  setSignupPassword: (value: string) => void;
  setSignupConfirm: (value: string) => void;
  setSignupLocation: (value: string) => void;
  setSignupCode: (value: string) => void;
  refreshTickets: () => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  authenticated: false,
  user: adminSeed,
  tickets: initialTickets,
  selectedVehicle: 'Car',
  selectedAmount: '50.00',
  vehicleNumber: 'MH12AB1234',
  generatedTicket: null,
  barcodeQuery: '',
  error: '',
  loginEmail: adminSeed.email,
  loginPassword: 'demo-arsalan-123',
  signupEmail: '',
  signupPassword: '',
  signupConfirm: '',
  signupLocation: '',
  signupCode: '',
  bootstrap: () => {
    localDatabase.reset(initialTickets);
    set({ tickets: localDatabase.listTickets(), authenticated: false, user: adminSeed });
  },
  setAuthenticated: authenticated => set({ authenticated }),
  setUser: user => set({ user }),
  setTickets: tickets => set({ tickets }),
  setSelectedVehicle: selectedVehicle => set({ selectedVehicle }),
  setSelectedAmount: selectedAmount => set({ selectedAmount }),
  setVehicleNumber: vehicleNumber => set({ vehicleNumber }),
  setGeneratedTicket: generatedTicket => set({ generatedTicket }),
  setBarcodeQuery: barcodeQuery => set({ barcodeQuery }),
  setError: error => set({ error }),
  setLoginEmail: loginEmail => set({ loginEmail }),
  setLoginPassword: loginPassword => set({ loginPassword }),
  setSignupEmail: signupEmail => set({ signupEmail }),
  setSignupPassword: signupPassword => set({ signupPassword }),
  setSignupConfirm: signupConfirm => set({ signupConfirm }),
  setSignupLocation: signupLocation => set({ signupLocation }),
  setSignupCode: signupCode => set({ signupCode }),
  refreshTickets: () => set({ tickets: localDatabase.listTickets() }),
}));
