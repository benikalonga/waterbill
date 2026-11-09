'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { portal, request, session } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { closeSocket } from '@/lib/socket';
import { date, label } from '@/lib/format';
import { Badge, Button, Card, Failed, FieldLabel, Input, Loading, PageTitle } from '@/components/ui';

function Toggle({ label: text, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-2.5 text-sm font-medium">
      {text}
      <input type="checkbox" className="h-5 w-5 accent-[#0C776C]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Account() {
  const router = useRouter();
  const forced = useSearchParams().get('setPin') === '1';
  const { data, error, reload } = useData((u) => portal(u), '/summary');
  const [pin, setPin] = useState({ a: '', b: '' });
  const { busy, run } = useAction();

  const changePin = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (pin.a !== pin.b) throw new Error('The two PINs do not match.');
      await request('customer', '/auth/customer/change-pin', { body: { newPin: pin.a } });
      const s = session.get('customer')!;
      session.set('customer', { ...s, profile: { ...s.profile, mustChangePin: false } });
      setPin({ a: '', b: '' });
      if (forced) window.location.href = '/portal';
    }, 'Your PIN has been updated');
  };

  const signOut = async () => {
    const s = session.get('customer');
    if (s) await request(null, '/auth/sign-out', { body: { refreshToken: s.refreshToken } }).catch(() => undefined);
    closeSocket('customer');
    session.clear('customer');
    router.replace('/');
  };

  const setPref = (body: object) => run(async () => { await portal('/profile', { method: 'PATCH', body }); reload(); });

  const pinForm = (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-bold"><KeyRound size={16} /> {forced ? 'Choose your PIN to continue' : 'Change PIN'}</h2>
      <form className="mt-3 space-y-3" onSubmit={changePin}>
        <FieldLabel text="New PIN (4 to 6 digits)"><Input required type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,6}" maxLength={6} value={pin.a} onChange={(e) => setPin({ ...pin, a: e.target.value })} /></FieldLabel>
        <FieldLabel text="Repeat PIN"><Input required type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin.b} onChange={(e) => setPin({ ...pin, b: e.target.value })} /></FieldLabel>
        <Button busy={busy} className="w-full">Save PIN</Button>
      </form>
    </Card>
  );

  if (forced) return <div className="mx-auto max-w-sm">{pinForm}</div>;
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  const c = data.customer;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageTitle title="My account" />
      <Card className="p-5 text-sm">
        <div className="flex items-start justify-between"><p className="text-lg font-bold">{c.firstName} {c.lastName}</p><Badge value={c.status} /></div>
        <p className="text-slate2-2">{c.accountNumber} · {label(c.type)} · {label(c.tariffClass)} tariff</p>
        <p className="mt-2 text-slate2-2">{c.addressLine}, {c.neighborhood}, {c.city}</p>
        <p className="text-slate2-2">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
        <p className="mt-2 text-xs text-slate2-3">Customer since {date(c.createdAt)}. To change your name or address, please open a support ticket.</p>
      </Card>
      <Card className="divide-y divide-edge px-5 py-2">
        <Toggle label="Text me reminders" checked={c.smsReminders} onChange={(v) => setPref({ smsReminders: v })} />
        <Toggle label="Paperless bills" checked={c.paperless} onChange={(v) => setPref({ paperless: v })} />
      </Card>
      {pinForm}
      <Button variant="ghost" className="w-full text-red-600" onClick={signOut}><LogOut size={15} /> Sign out</Button>
    </div>
  );
}

export default function Page() {
  return <Suspense><Account /></Suspense>;
}
