import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', axes: ['opsz'] });
const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm' });

export const metadata: Metadata = {
  title: 'Open Play Court: pickleball, padel and tennis',
  description: 'Rent a court by the hour or drop into open play. See live availability and book in seconds.',
};
export const viewport: Viewport = { themeColor: '#07130f' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
