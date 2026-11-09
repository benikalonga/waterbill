import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <Logo size={44} />
      <h1 className="text-2xl font-bold">This page has run dry</h1>
      <p className="text-slate2-3">We could not find what you were looking for.</p>
      <Link href="/" className="btn btn-primary">Back to WaterBill</Link>
    </main>
  );
}
