'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { open, session } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Card, FieldLabel, Input, Tabs } from '@/components/ui';
import Logo from '@/components/Logo';

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const [as, setAs] = useState(params.get('as') === 'staff' ? 'staff' : 'customer');
  const [form, setForm] = useState({ accountNumber: params.get('account') ?? '', pin: '', email: '', password: '' });
  const { busy, run } = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (session.get('customer')) router.replace('/portal');
  }, [router]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (as === 'customer') {
        const res = await open('/auth/customer/sign-in', { body: { accountNumber: form.accountNumber, pin: form.pin } });
        session.set('customer', { accessToken: res.accessToken, refreshToken: res.refreshToken, profile: res.customer });
        router.replace(res.customer.mustChangePin ? '/portal/account?setPin=1' : '/portal');
      } else {
        const res = await open('/auth/staff/sign-in', { body: { email: form.email, password: form.password } });
        session.set('staff', { accessToken: res.accessToken, refreshToken: res.refreshToken, profile: res.staff });
        router.replace(res.staff.role === 'FIELD_AGENT' ? '/field' : '/ops');
      }
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center"><Link href="/"><Logo size={42} /></Link></div>
        <Card className="p-6">
          <Tabs value={as} onChange={setAs} tabs={[{ value: 'customer', label: 'Customer' }, { value: 'staff', label: 'Staff' }]} />
          <form onSubmit={submit} className="space-y-3">
            {as === 'customer' ? (
              <>
                <FieldLabel text="Account number"><Input required autoComplete="username" className="uppercase" placeholder="WB-XXXXXXXX" value={form.accountNumber} onChange={set('accountNumber')} /></FieldLabel>
                <FieldLabel text="PIN or one-time code" hint="New here? Use the code we sent by SMS."><Input required type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={form.pin} onChange={set('pin')} /></FieldLabel>
              </>
            ) : (
              <>
                <FieldLabel text="Work email"><Input required type="email" autoComplete="username" value={form.email} onChange={set('email')} /></FieldLabel>
                <FieldLabel text="Password"><Input required type="password" autoComplete="current-password" value={form.password} onChange={set('password')} /></FieldLabel>
              </>
            )}
            <Button type="submit" busy={busy} className="w-full">Sign in</Button>
          </form>
          {as === 'customer' && (
            <div className="mt-4 flex justify-between text-sm">
              <Link href="/forgot-pin" className="text-tide-600 hover:underline">Forgot PIN?</Link>
              <Link href="/register" className="text-tide-600 hover:underline">Open an account</Link>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><SignIn /></Suspense>;
}
