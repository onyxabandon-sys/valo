export { isValidVehicleNumber, normalizeVehicleNumber } from '../../shared/vehicleNumber';
export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const isValidPassword = (value: string) => /^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(value);
