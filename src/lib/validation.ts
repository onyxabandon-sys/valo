export const isValidVehicleNumber = (value: string) => /^[A-Z0-9]{4,20}$/i.test(value.trim());
export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const isValidPassword = (value: string) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value);

