import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'WaterBill', template: '%s · WaterBill' },
  description: 'Your water bills, usage and service in one place.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0C776C' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="font-sans">
        {children}
        <Toaster position="top-center" toastOptions={{ style: { fontSize: 14, borderRadius: 10, background: '#14272B', color: '#fff' } }} />
      </body>
    </html>
  );
}
