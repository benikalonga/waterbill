'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { CHANNELS, dateTime, money, toCents, label } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Pager, SearchBox, Select, Table } from '@/components/ui';

export default function Payments() {
  const list = usePaged('/payments', { q: '', status: '', channel: '' });
  const [form, setForm] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <>
      <PageTitle title="Payments" actions={<Button onClick={() => setForm({ accountNumber: '', amount: '', channel: 'COUNTER' })}>Record payment</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox value={list.filters.q} onChange={(v) => list.setFilter('q', v)} placeholder="Reference, account or name" />
        <Select className="w-auto" aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['PROCESSING', 'CONFIRMED', 'FAILED', 'REFUNDED'].map((v) => ({ value: v, label: label(v) }))]} />
        <Select className="w-auto" aria-label="Method" value={list.filters.channel} onChange={(e) => list.setFilter('channel', e.target.value)} options={[{ value: '', label: 'Any method' }, ...Object.entries(CHANNELS).map(([value, l]) => ({ value, label: l }))]} />
      </div>
      <Table loading={list.loading} rows={list.items} columns={[
        { key: 'reference', title: 'Reference', render: (r: any) => <code className="text-xs">{r.reference}</code> },
        { key: 'customer', title: 'Customer', render: (r: any) => <div>{r.customer.firstName} {r.customer.lastName}<p className="text-xs text-slate2-3">{r.customer.accountNumber}</p></div> },
        { key: 'bill', title: 'Bill', render: (r: any) => r.invoice?.number ?? 'Account' },
        { key: 'channel', title: 'Method', render: (r: any) => CHANNELS[r.channel] },
        { key: 'date', title: 'Date', render: (r: any) => dateTime(r.confirmedAt ?? r.initiatedAt) },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'amount', title: 'Amount', right: true, render: (r: any) => <b>{money(r.amountCents)}</b> },
      ]} />
      {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Record a payment">
        {form && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops('/payments/counter', { body: { accountNumber: form.accountNumber, amountCents: toCents(form.amount), channel: form.channel } }); setForm(null); list.reload(); }, 'Payment recorded'); }}>
            <FieldLabel text="Account number"><Input required className="uppercase" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></FieldLabel>
            <FieldLabel text="Amount" hint="Applied to the oldest unpaid bills. Any extra becomes account credit."><Input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FieldLabel>
            <FieldLabel text="Received by"><Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} options={['COUNTER', 'BANK_TRANSFER', 'KIOSK'].map((c) => ({ value: c, label: CHANNELS[c] }))} /></FieldLabel>
            <Button busy={busy} className="w-full">Confirm</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
