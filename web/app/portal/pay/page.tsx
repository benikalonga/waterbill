'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { portal, session } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { CHANNELS, date, money, period, toCents } from '@/lib/format';
import { Button, Card, Empty, Failed, FieldLabel, Input, Loading, PageTitle } from '@/components/ui';
import { CheckCircle2, PartyPopper } from 'lucide-react';

const METHODS = ['MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY', 'MTN_MOMO', 'CARD'];

function Pay() {
  const router = useRouter();
  const wanted = useSearchParams().get('invoice');
  const { data, error, reload } = useData((u) => portal(u), '/invoices?limit=50');
  const open = useMemo(() => (data?.items ?? []).filter((i: any) => i.balanceCents > 0).sort((a: any, b: any) => a.period.localeCompare(b.period)), [data]);
  const [invoiceId, setInvoiceId] = useState<string | null>(wanted);
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState('MPESA');
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState<any>(null);
  const { busy, run } = useAction();

  const invoice = open.find((i: any) => i.id === invoiceId) ?? open[0];
  useEffect(() => { if (invoice) setAmount((invoice.balanceCents / 100).toFixed(2)); }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  if (done) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <CheckCircle2 size={46} className="mx-auto text-tide-500" />
        <h1 className="mt-2 text-xl font-bold">{done.status === 'CONFIRMED' ? 'Payment received' : 'Check your phone'}</h1>
        <p className="mt-1 text-3xl font-bold">{money(done.amountCents)}</p>
        <p className="mt-1 text-sm text-slate2-3">Reference {done.reference}</p>
        {done.status !== 'CONFIRMED' && <p className="mt-2 text-sm text-slate2-2">Approve the request on your phone. We will let you know as soon as it arrives.</p>}
        <Button className="mt-4 w-full" onClick={() => router.push('/portal')}>Done</Button>
      </Card>
    );
  }
  if (!open.length) return <Card className="mx-auto max-w-md"><Empty icon={PartyPopper} title="Nothing to pay" hint="All your bills are settled." /></Card>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await portal('/payments', { body: { invoiceId: invoice.id, amountCents: toCents(amount), channel, payerPhone: phone || undefined } });
      setDone(res.payment);
    });
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Make a payment" />
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate2-2">Bill</p>
            <div className="space-y-2">
              {open.map((i: any) => (
                <button type="button" key={i.id} onClick={() => setInvoiceId(i.id)} className={clsx('flex w-full items-center justify-between rounded-xl border-2 p-3 text-left text-sm', invoice.id === i.id ? 'border-tide-500 bg-tide-50' : 'border-edge')}>
                  <span><b>{period(i.period)}</b><span className="block text-xs text-slate2-3">Due {date(i.dueAt)}</span></span>
                  <b>{money(i.balanceCents)}</b>
                </button>
              ))}
            </div>
          </div>
          <FieldLabel text="Amount" hint="You can pay part of a bill. Anything above the bill is saved as account credit."><Input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></FieldLabel>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate2-2">Pay with</p>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => <button type="button" key={m} onClick={() => setChannel(m)} className={clsx('rounded-lg border-2 py-2 text-sm font-semibold', channel === m ? 'border-tide-500 bg-tide-50 text-tide-700' : 'border-edge')}>{CHANNELS[m]}</button>)}
            </div>
          </div>
          {channel !== 'CARD' && <FieldLabel text="Paying from" hint={session.get('customer') ? 'Leave empty to use the number on your account.' : undefined}><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile money number" /></FieldLabel>}
          <Button busy={busy} className="w-full" disabled={!(Number(amount) > 0)}>Pay {Number(amount) > 0 ? money(toCents(amount)) : ''}</Button>
        </form>
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense><Pay /></Suspense>;
}
