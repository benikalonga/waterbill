'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, CalendarClock, Clock3, CreditCard, Droplets, FileText, Gauge, Wrench } from 'lucide-react';
import { portal } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { liveSocket } from '@/lib/socket';
import { date, label, m3, money, period, shortPeriod } from '@/lib/format';
import { Badge, Bars, Card, Failed, Loading } from '@/components/ui';

const ACTIONS = [
  { href: '/portal/pay', label: 'Pay', icon: CreditCard },
  { href: '/portal/usage#reading', label: 'Send reading', icon: Gauge },
  { href: '/portal/report-leak', label: 'Report leak', icon: Droplets },
  { href: '/portal/plans', label: 'Payment plan', icon: CalendarClock },
];

export default function PortalHome() {
  const { data, loading, error, reload } = useData((u) => portal(u), '/summary');

  useEffect(() => {
    const socket = liveSocket('customer');
    const refresh = () => reload();
    socket?.on('payment:confirmed', refresh);
    return () => { socket?.off('payment:confirmed', refresh); };
  }, [reload]);

  if (error) return <Failed message={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data) return null;
  const { customer: c, balanceCents, nextDue, recentInvoices, usage30dLitres, outages, openTickets } = data;
  const overdue = nextDue && new Date(nextDue.dueAt) < new Date();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Hello, {c.firstName}</h1>
        <p className="text-sm text-slate2-3">Account {c.accountNumber} · {c.addressLine}</p>
      </div>

      {c.review === 'PENDING' && <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><Clock3 size={18} className="mt-0.5 flex-shrink-0" /> Your application is being reviewed. We will text you once your account is active.</div>}
      {c.status === 'DISCONNECTED' && <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={18} className="mt-0.5 flex-shrink-0" /> Your supply is disconnected. Clear your balance and we will reconnect you.</div>}
      {outages.map((o: any) => (
        <Link key={o.id} href="/portal/outages" className="flex items-start gap-3 rounded-xl bg-sky-50 p-4 text-sm text-sky-800">
          <Wrench size={18} className="mt-0.5 flex-shrink-0" />
          <span><b>{o.title}</b> · {o.status === 'ACTIVE' ? 'happening now' : `from ${date(o.startsAt)}`}</span>
        </Link>
      ))}

      <div className="rounded-2xl bg-tide-800 p-5 text-white">
        <p className="text-sm text-tide-100">Amount due</p>
        <p className="mt-1 text-4xl font-bold">{money(balanceCents)}</p>
        {nextDue ? (
          <p className={`mt-1 text-sm ${overdue ? 'text-orange-200' : 'text-tide-100'}`}>{overdue ? 'Overdue since' : 'Due by'} {date(nextDue.dueAt)}</p>
        ) : <p className="mt-1 text-sm text-tide-100">You are all paid up. Thank you!</p>}
        {c.creditCents > 0 && <p className="mt-1 text-sm text-tide-100">Account credit: {money(c.creditCents)}, applied to your next bill</p>}
        {balanceCents > 0 && <Link href="/portal/pay" className="btn mt-4 bg-coral text-white hover:bg-coral-dark">Pay now</Link>}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map(({ href, label: text, icon: Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-xl border border-edge bg-white p-3 text-center text-xs font-semibold hover:bg-tide-50">
            <Icon size={20} className="text-tide-600" />{text}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-baseline justify-between"><h2 className="font-bold">Recent usage</h2><Link href="/portal/usage" className="text-xs font-semibold text-tide-600">Details</Link></div>
          <p className="mb-3 text-sm text-slate2-3">{m3(usage30dLitres)} in the last 30 days</p>
          <Bars format={m3} height={120} data={[...recentInvoices].reverse().map((i: any) => ({ label: shortPeriod(i.period), value: i.usageLitres }))} />
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-bold">Latest bills</h2><Link href="/portal/bills" className="text-xs font-semibold text-tide-600">All bills</Link></div>
          <div className="divide-y divide-edge">
            {recentInvoices.slice(0, 4).map((i: any) => (
              <Link key={i.id} href={`/portal/bills/${i.id}`} className="flex items-center gap-3 py-2.5">
                <FileText size={16} className="text-slate2-4" />
                <span className="flex-1 text-sm font-semibold">{period(i.period)}</span>
                <Badge value={i.status} />
                <span className="w-16 text-right text-sm font-bold">{money(i.totalCents + i.penaltyCents)}</span>
              </Link>
            ))}
            {!recentInvoices.length && <p className="py-6 text-center text-sm text-slate2-3">Your first bill will appear here.</p>}
          </div>
        </Card>
      </div>
      {c.meter && <p className="text-center text-xs text-slate2-3">Meter {c.meter.serial} · {label(c.meter.kind)} · {openTickets} open support ticket{openTickets === 1 ? '' : 's'}</p>}
    </div>
  );
}
