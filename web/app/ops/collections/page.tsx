'use client';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { money, period } from '@/lib/format';
import { Badge, Bars, Button, Card, Failed, Loading, PageTitle, Stat, Table } from '@/components/ui';

export default function Collections() {
  const aging = useData((u) => ops(u), '/collections/aging');
  const plans = useData((u) => ops(u), '/plans');
  const { busy, run } = useAction();
  if (aging.error) return <Failed message={aging.error} retry={aging.reload} />;
  if (!aging.data) return <Loading />;
  const decide = (id: string, approve: boolean) => run(async () => { await ops(`/plans/${id}/decide`, { body: { approve } }); plans.reload(); }, approve ? 'Plan approved' : 'Plan declined');

  return (
    <>
      <PageTitle title="Collections" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Stat title="Total outstanding" value={money(aging.data.totalCents)} tone="danger" />
        <Card className="p-5 lg:col-span-2"><h2 className="mb-3 font-bold">Debt by age</h2><Bars height={130} format={money} data={aging.data.buckets.map((b: any) => ({ label: b.label, value: b.cents }))} /></Card>
      </div>
      <h2 className="mb-2 mt-5 font-bold">Payment plans</h2>
      <Table loading={plans.loading} rows={plans.data?.plans ?? []} empty="No payment plans." columns={[
        { key: 'customer', title: 'Customer', render: (r: any) => <div><b>{r.customer.firstName} {r.customer.lastName}</b><p className="text-xs text-slate2-3">{r.customer.accountNumber}</p></div> },
        { key: 'bill', title: 'Bill', render: (r: any) => period(r.invoice.period) },
        { key: 'total', title: 'Amount', render: (r: any) => money(r.totalCents) },
        { key: 'months', title: 'Months' },
        { key: 'reason', title: 'Reason' },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'act', title: '', right: true, render: (r: any) => r.status === 'REQUESTED' && <div className="flex justify-end gap-1.5"><Button className="px-2.5 py-1 text-xs" busy={busy} onClick={() => decide(r.id, true)}>Approve</Button><Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => decide(r.id, false)}>Decline</Button></div> },
      ]} />
      <h2 className="mb-2 mt-5 font-bold">Largest debtors</h2>
      <Table rows={aging.data.topDebtors} empty="Nobody owes anything." columns={[
        { key: 'name', title: 'Customer', render: (r: any) => <div><b>{r.firstName} {r.lastName}</b><p className="text-xs text-slate2-3">{r.accountNumber}</p></div> },
        { key: 'phone', title: 'Phone' },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'cents', title: 'Owes', right: true, render: (r: any) => <b>{money(r.cents)}</b> },
      ]} />
    </>
  );
}
