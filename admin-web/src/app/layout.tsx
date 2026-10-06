import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Valet Operations',
  description: 'Private operations dashboard for locations, users, and devices.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
