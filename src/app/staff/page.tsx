import type { Metadata } from 'next';
import { CheckInForm } from '@/components/checkin-form';

export const metadata: Metadata = { title: 'Staff check-in', robots: { index: false } };

export default function StaffPage() {
  return (
    <main className="px-5 py-16">
      <h1 className="mb-8 text-center font-display text-3xl font-bold">Front desk check-in</h1>
      <CheckInForm />
    </main>
  );
}
