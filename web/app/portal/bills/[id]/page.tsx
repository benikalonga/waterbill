'use client';
import Link from 'next/link';
import { CalendarClock, MessageSquareWarning, Printer } from 'lucide-react';
import { portal } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { CHANNELS, date, dateTime, label, m3, money, period } from '@/lib/format';
import { Badge, Button, Card, Failed, Loading } from '@/components/ui';
import Logo from '@/components/Logo';

const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <div className={`flex justify-between py-1 text-sm ${bold ? 'font-bold' : 'text-slate2-2'}`}><span>{k}</span><span>{v}</span></div>
);

export default function Bill({ params }: { params: { id: string } }) {
  const { data, error, reload } = useData((u) => portal(u), `/invoices/${params.id}`);
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  const i = data.invoice;
  const c = i.customer;
  const plan = i.plans[0];
  const open = i.balanceCents > 0 && i.status !== 'VOID';
  const fees = (i.lines as any[]).filter((l) => l.litres === 0);
  const usage = (i.lines as any[]).filter((l) => l.litres > 0);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div><Logo size={30} /><p className="mt-3 text-xl font-bold">{period(i.period)}</p><p className="text-sm text-slate2-3">Bill {i.number}</p></div>
          <Badge value={i.status} />
        </div>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><p className="font-semibold">{c.firstName} {c.lastName}</p><p className="text-slate2-2">{c.addressLine}, {c.city}</p><p className="text-slate2-2">Account {c.accountNumber} · {label(c.tariffClass)} tariff</p></div>
          <div className="sm:text-right"><p className="text-slate2-2">Issued {date(i.issuedAt)}</p><p className="font-semibold">Due {date(i.dueAt)}</p></div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-mist p-3 text-center text-sm">
          <div><p className="text-xs text-slate2-3">Previous index</p><p className="font-semibold">{m3(i.openingLitres)}</p></div>
          <div><p className="text-xs text-slate2-3">Current index</p><p className="font-semibold">{m3(i.closingLitres)}</p></div>
          <div><p className="text-xs text-slate2-3">Used</p><p className="font-bold text-tide-700">{m3(i.usageLitres)}</p></div>
        </div>
        {i.basis !== 'ACTUAL' && <p className="mt-2 text-xs text-amber-700">This bill is {i.basis === 'ESTIMATED' ? 'estimated from your recent use, because we had no new reading. Your next actual reading corrects any difference.' : 'a flat charge, because no meter is linked to your account.'}</p>}

        <div className="mt-4">
          {usage.map((l) => <Row key={l.label} k={`${l.label} · ${m3(l.litres)} at ${money(l.centsPerM3)}/m³`} v={money(l.cents)} />)}
          <Row k="Fixed charge" v={money(i.fixedCents)} />
          <Row k="VAT" v={money(i.vatCents)} />
          {fees.map((l) => <Row key={l.label} k={l.label} v={money(l.cents)} />)}
          {i.penaltyCents > 0 && <Row k="Late payment fee" v={money(i.penaltyCents)} />}
          <div className="my-1 border-t border-edge" />
          <Row k="Total" v={money(i.totalCents + i.penaltyCents)} bold />
          <Row k="Paid" v={money(i.paidCents)} />
          <Row k="Still to pay" v={money(i.balanceCents)} bold />
        </div>
        {i.note && <p className="mt-2 text-xs text-slate2-3">Note: {i.note}</p>}
      </Card>

      {i.payments.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 font-bold">Payments</h2>
          {i.payments.map((p: any) => <Row key={p.id} k={`${CHANNELS[p.channel]} · ${dateTime(p.confirmedAt)} · ${p.reference}`} v={money(p.amountCents)} />)}
        </Card>
      )}

      {plan && (
        <Card className="p-4">
          <h2 className="font-bold">Payment plan <Badge value={plan.status} /></h2>
          {plan.installments.map((n: any) => <Row key={n.seq} k={`Instalment ${n.seq} · due ${date(n.dueAt)}`} v={`${money(n.paidCents)} of ${money(n.amountCents)}`} />)}
        </Card>
      )}

      <div className="no-print flex flex-wrap gap-2">
        {open && <Link href={`/portal/pay?invoice=${i.id}`} className="btn btn-primary">Pay {money(i.balanceCents)}</Link>}
        {open && !plan && <Link href={`/portal/plans?invoice=${i.id}`} className="btn btn-ghost"><CalendarClock size={15} /> Request a plan</Link>}
        {i.status !== 'DISPUTED' && i.status !== 'VOID' && <Link href={`/portal/support?invoice=${i.id}`} className="btn btn-ghost"><MessageSquareWarning size={15} /> Dispute this bill</Link>}
        <Button variant="ghost" onClick={() => window.print()}><Printer size={15} /> Print</Button>
      </div>
    </div>
  );
}
