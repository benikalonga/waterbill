'use client';
import Link from 'next/link';
import { useState } from 'react';
import { open } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Card, FieldLabel, Input } from '@/components/ui';
import Logo from '@/components/Logo';

export default function ForgotPin() {
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const { busy, run } = useAction();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center"><Link href="/"><Logo size={42} /></Link></div>
        <Card className="p-6">
          <h1 className="text-lg font-bold">Reset your PIN</h1>
          {sent ? (
            <>
              <p className="mt-2 text-sm text-slate2-2">{sent} Sign in with that code in place of your PIN, then choose a new one.</p>
              <Link href="/sign-in" className="btn btn-primary mt-4 w-full">Go to sign in</Link>
            </>
          ) : (
            <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => setSent((await open('/auth/customer/forgot-pin', { body: { phone } })).message)); }}>
              <FieldLabel text="Phone number on your account"><Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Include your country code" /></FieldLabel>
              <Button type="submit" busy={busy} className="w-full">Send me a code</Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
