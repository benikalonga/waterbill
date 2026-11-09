'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { date, dateTime, label, m3, money, period, toCents } from '@/lib/format';
import { Badge, Button, Card, FieldLabel, Input, Modal, PageTitle, Pager, SearchBox, Select, Stat, Table, Tabs } from '@/components/ui';

const STATUSES = ['ISSUED', 'PARTIAL', 'PAID', 'OVERDUE', 'DISPUTED', 'VOID', 'COLLECTIONS'];

export default function Billing() {
  const [tab, setTab] = useState('invoices');
  const list = usePaged('/invoices', { q: '', status: '', period: '' });
  const runs = useData((u) => ops(u), '/billing-runs');
  const [newPeriod, setNewPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<any>(null);
  const [adjust, setAdjust] = useState({ amount: '', reason: '' });
  const { busy, run } = useAction();
  const refresh = () => { list.reload(); runs.reload(); setSelected(null); setAdjust({ amount: '', reason: '' }); };
  const s = list.data?.sums;

  return (
    <>
      <PageTitle title="Billing" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'invoices', label: 'Invoices' }, { value: 'runs', label: 'Billing runs' }]} />
      {tab === 'invoices' ? (
        <>
          {s && <div className="mb-3 grid gap-3 sm:grid-cols-3"><Stat title="Billed" value={money(s.totalCents)} /><Stat title="Paid" value={money(s.paidCents)} tone="good" /><Stat title="Outstanding" value={money(s.balanceCents)} tone="danger" /></div>}
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchBox value={list.filters.q} onChange={(v) => list.setFilter('q', v)} placeholder="Bill, account or name" />
            <Select className="w-auto" aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...STATUSES.map((v) => ({ value: v, label: label(v) }))]} />
            <Input type="month" aria-label="Period" className="w-auto" value={list.filters.period} onChange={(e) => list.setFilter('period', e.target.value)} />
          </div>
          <Table loading={list.loading} rows={list.items} onRow={setSelected} columns={[
            { key: 'number', title: 'Bill', render: (r: any) => <div><b>{r.number}</b><p className="text-xs text-slate2-3">{period(r.period)}</p></div> },
            { key: 'customer', title: 'Customer', render: (r: any) => <div>{r.customer.firstName} {r.customer.lastName}<p className="text-xs text-slate2-3">{r.customer.accountNumber}</p></div> },
            { key: 'usage', title: 'Used', render: (r: any) => m3(r.usageLitres) },
            { key: 'basis', title: 'Basis', render: (r: any) => label(r.basis) },
            { key: 'due', title: 'Due', render: (r: any) => date(r.dueAt) },
            { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
            { key: 'total', title: 'Total', right: true, render: (r: any) => money(r.totalCents + r.penaltyCents) },
            { key: 'balance', title: 'Balance', right: true, render: (r: any) => <b>{money(r.balanceCents)}</b> },
          ]} />
          {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
        </>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (window.confirm(`Bill every active customer for ${period(newPeriod)}? This cannot be repeated for the same month.`)) run(async () => { const r = await ops('/billing-runs', { body: { period: newPeriod } }); refresh(); return r; }, 'Billing run finished'); }}>
              <FieldLabel text="Period to bill"><Input type="month" required value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} /></FieldLabel>
              <Button busy={busy}>Run billing</Button>
              <p className="text-xs text-slate2-3">Meters with no new reading are billed an estimate, corrected by the next real reading.</p>
            </form>
          </Card>
          <Table loading={runs.loading} rows={runs.data?.runs ?? []} empty="No billing runs yet." columns={[
            { key: 'period', title: 'Period', render: (r: any) => <b>{period(r.period)}</b> },
            { key: 'created', title: 'Bills' },
            { key: 'estimated', title: 'Estimated' },
            { key: 'skipped', title: 'Skipped' },
            { key: 'total', title: 'Total', right: true, render: (r: any) => money(r.totalCents) },
            { key: 'when', title: 'Finished', render: (r: any) => dateTime(r.finishedAt) },
          ]} />
        </>
      )}
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Bill ${selected.number}` : ''}>
        {selected && (
          <div className="space-y-3 text-sm">
            <p>{selected.customer.firstName} {selected.customer.lastName} · {period(selected.period)} · <Badge value={selected.status} /></p>
            <p>Balance: <b>{money(selected.balanceCents)}</b> of {money(selected.totalCents + selected.penaltyCents)}</p>
            {selected.note && <p className="text-slate2-3">Note: {selected.note}</p>}
            {selected.status !== 'VOID' && selected.balanceCents > 0 && (
              <form className="space-y-2 rounded-xl bg-mist p-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops(`/invoices/${selected.id}/adjust`, { body: { amountCents: toCents(adjust.amount), reason: adjust.reason } }); refresh(); }, 'Bill adjusted'); }}>
                <p className="font-bold">Reduce this bill</p>
                <Input required type="number" min="0.01" step="0.01" placeholder="Amount" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
                <Input required minLength={3} placeholder="Reason" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
                <Button busy={busy} variant="dark" className="w-full">Apply adjustment</Button>
              </form>
            )}
            {selected.status !== 'VOID' && <Button variant="ghost" className="w-full text-red-600" busy={busy} onClick={() => { const reason = window.prompt('Why is this bill being cancelled? Any amount paid returns as account credit.'); if (reason) run(async () => { await ops(`/invoices/${selected.id}/void`, { body: { reason } }); refresh(); }, 'Bill cancelled'); }}>Cancel this bill</Button>}
          </div>
        )}
      </Modal>
    </>
  );
}
