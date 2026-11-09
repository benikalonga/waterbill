'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { portal } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { date, money, period } from '@/lib/format';
import { Badge, Button, Card, Empty, Failed, FieldLabel, Input, Loading, PageTitle, Select } from '@/components/ui';
import { CalendarClock } from 'lucide-react';

function Plans() {
  const params = useSearchParams();
  const plans = useData((u) => portal(u), '/plans');
  const invoices = useData((u) => portal(u), '/invoices?limit=50');
  const [invoiceId, setInvoice] = useState(params.get('invoice') ?? '');
  const [months, setMonths] = useState('3');
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  if (plans.error) return <Failed message={plans.error} retry={plans.reload} />;
  if (!plans.data) return <Loading />;

  const taken = new Set(plans.data.plans.filter((p: any) => ['REQUESTED', 'ACTIVE'].includes(p.status)).map((p: any) => p.invoiceId));
  const open = (invoices.data?.items ?? []).filter((i: any) => i.balanceCents > 0 && !taken.has(i.id));
  const selected = open.find((i: any) => i.id === invoiceId) ?? open[0];

  return (
    <div className="space-y-4">
      <PageTitle title="Payment plans" hint="Spread a bill over several months. No late fees or disconnection while you keep to the plan." />
      {selected && (
        <Card className="p-5">
          <h2 className="font-bold">Request a plan</h2>
          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await portal('/plans', { body: { invoiceId: selected.id, months: Number(months), reason: reason || undefined } }); setReason(''); plans.reload(); invoices.reload(); }, 'Request sent. We will text you with our decision.'); }}>
            <FieldLabel text="Bill"><Select value={selected.id} onChange={(e) => setInvoice(e.target.value)} options={open.map((i: any) => ({ value: i.id, label: `${period(i.period)} · ${money(i.balanceCents)}` }))} /></FieldLabel>
            <FieldLabel text="Over" hint={`About ${money(Math.ceil(selected.balanceCents / Number(months)))} a month`}><Select value={months} onChange={(e) => setMonths(e.target.value)} options={[2, 3, 4, 6, 9, 12].map((m) => ({ value: String(m), label: `${m} months` }))} /></FieldLabel>
            <div className="sm:col-span-2"><FieldLabel text="Why do you need a plan? (optional)"><Input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} /></FieldLabel></div>
            <Button busy={busy} className="sm:col-span-2">Send request</Button>
          </form>
        </Card>
      )}
      {plans.data.plans.map((p: any) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-center justify-between gap-2"><p className="font-bold">{period(p.invoice.period)} · {money(p.totalCents)}</p><Badge value={p.status} /></div>
          <div className="mt-2 divide-y divide-edge text-sm">
            {p.installments.map((n: any) => (
              <div key={n.seq} className="flex justify-between py-1.5"><span>#{n.seq} · due {date(n.dueAt)}</span><span className={n.paidCents >= n.amountCents ? 'font-semibold text-tide-600' : ''}>{n.paidCents >= n.amountCents ? 'Paid' : money(n.amountCents - n.paidCents)}</span></div>
            ))}
          </div>
        </Card>
      ))}
      {!plans.data.plans.length && !selected && <Card><Empty icon={CalendarClock} title="No plans" hint="You have no unpaid bills to spread out." /></Card>}
    </div>
  );
}

export default function Page() {
  return <Suspense><Plans /></Suspense>;
}
