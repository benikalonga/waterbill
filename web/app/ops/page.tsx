'use client';
import Link from 'next/link';
import { ops } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { ago, CHANNELS, money, shortPeriod } from '@/lib/format';
import { Bars, Card, Failed, Loading, PageTitle, Stat } from '@/components/ui';

export default function Dashboard() {
  const { data: d, error, reload } = useData((u) => ops(u), '/overview');
  if (error) return <Failed message={error} retry={reload} />;
  if (!d) return <Loading />;
  const q = d.queues;
  const QUEUES = [
    { href: '/ops/customers?review=PENDING', label: 'Applications to review', n: q.approvals },
    { href: '/ops/meters', label: 'Readings to check', n: q.readings },
    { href: '/ops/collections', label: 'Payment plans to decide', n: q.plans },
    { href: '/ops/tickets', label: 'Open support tickets', n: q.openTickets },
  ];
  return (
    <>
      <PageTitle title="Dashboard" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Collection rate" value={`${d.collectionRate}%`} tone={d.collectionRate >= 80 ? 'good' : 'danger'} />
        <Stat title="Collected today" value={money(d.collectedTodayCents)} />
        <Stat title="Overdue" value={money(q.overdueCents)} hint={`${q.overdueBills} bills`} tone="danger" />
        <Stat title="Active customers" value={d.activeCustomers.toLocaleString()} />
        <Stat title="Open alerts" value={d.activeAlerts} />
        <Stat title="Open leaks" value={d.openLeaks} />
        <Stat title="Tampered meters" value={d.tamperedMeters} tone={d.tamperedMeters ? 'danger' : undefined} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Billed and collected</h2>
            <span className="flex gap-3 text-xs text-slate2-3"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-tide-500" />Billed</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-coral" />Collected</span></span>
          </div>
          <Bars height={210} format={money} data={d.monthly.map((m: any) => ({ label: shortPeriod(m.period), value: m.billedCents, second: m.paidCents }))} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 font-bold">Waiting on you</h2>
          <div className="divide-y divide-edge">
            {QUEUES.map((x) => <Link key={x.label} href={x.href} className="flex items-center justify-between py-2.5 text-sm hover:text-tide-700"><span>{x.label}</span><b className={x.n ? 'text-coral-dark' : 'text-slate2-4'}>{x.n}</b></Link>)}
          </div>
        </Card>
      </div>
      <Card className="mt-4 p-5">
        <h2 className="mb-2 font-bold">Latest payments</h2>
        <div className="divide-y divide-edge text-sm">
          {d.recentPayments.map((p: any) => <div key={p.id} className="flex justify-between gap-3 py-2"><span>{p.customer.firstName} {p.customer.lastName} <span className="text-slate2-3">· {CHANNELS[p.channel]} · {ago(p.confirmedAt)}</span></span><b>{money(p.amountCents)}</b></div>)}
        </div>
      </Card>
    </>
  );
}
