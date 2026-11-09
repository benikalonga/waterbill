'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { label, money, toCents } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Pager, SearchBox, Select, Stat, Table } from '@/components/ui';

const EMPTY = { sku: '', name: '', category: 'SPARE_PART', unit: 'pcs', onHand: '0', minLevel: '0', price: '', supplier: '' };

export default function Inventory() {
  const list = usePaged('/stock', { q: '' });
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [move, setMove] = useState<any>(null);
  const { busy, run } = useAction();
  const f = (k: keyof typeof EMPTY) => ({ value: form?.[k] ?? '', onChange: (e: React.ChangeEvent<any>) => setForm({ ...form!, [k]: e.target.value }) });
  return (
    <>
      <PageTitle title="Inventory" actions={<Button onClick={() => setForm(EMPTY)}>Add item</Button>} />
      {list.data && <div className="mb-3 grid gap-3 sm:grid-cols-3"><Stat title="Items" value={list.data.total} /><Stat title="Stock value" value={money(list.data.valueCents)} /><Stat title="Low stock" value={list.data.lowCount} tone={list.data.lowCount ? 'danger' : undefined} /></div>}
      <div className="mb-3"><SearchBox value={list.filters.q} onChange={(v) => list.setFilter('q', v)} placeholder="Name or SKU" /></div>
      <Table loading={list.loading} rows={list.items} columns={[
        { key: 'name', title: 'Item', render: (r: any) => <div><b>{r.name}</b><p className="text-xs text-slate2-3">{r.sku}</p></div> },
        { key: 'category', title: 'Category', render: (r: any) => label(r.category) },
        { key: 'onHand', title: 'On hand', render: (r: any) => <span>{r.onHand} {r.unit} {r.onHand <= r.minLevel && <Badge tone="red">Low</Badge>}</span> },
        { key: 'minLevel', title: 'Minimum' },
        { key: 'unit', title: 'Unit price', right: true, render: (r: any) => money(r.unitCents) },
        { key: 'act', title: '', right: true, render: (r: any) => <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setMove({ item: r, kind: 'RECEIPT', quantity: '', reason: '' })}>Move stock</Button> },
      ]} />
      {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Add item">
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const { price, onHand, minLevel, ...rest } = form!; await ops('/stock', { body: { ...rest, supplier: rest.supplier || undefined, onHand: Number(onHand), minLevel: Number(minLevel), unitCents: toCents(price) } }); setForm(null); list.reload(); }, 'Item added'); }}>
          <div className="col-span-2"><FieldLabel text="Name"><Input required minLength={2} {...f('name')} /></FieldLabel></div>
          <FieldLabel text="SKU"><Input required minLength={2} {...f('sku')} /></FieldLabel>
          <FieldLabel text="Category"><Select {...f('category')} options={['SPARE_PART', 'METER', 'CHEMICAL', 'SAFETY_GEAR', 'CONSUMABLE']} /></FieldLabel>
          <FieldLabel text="Unit"><Input required {...f('unit')} /></FieldLabel>
          <FieldLabel text="Unit price"><Input required type="number" min="0" step="0.01" {...f('price')} /></FieldLabel>
          <FieldLabel text="On hand"><Input type="number" min="0" {...f('onHand')} /></FieldLabel>
          <FieldLabel text="Minimum"><Input type="number" min="0" {...f('minLevel')} /></FieldLabel>
          <Button busy={busy} className="col-span-2">Save</Button>
        </form>
      </Modal>
      <Modal open={Boolean(move)} onClose={() => setMove(null)} title={move ? `Move stock: ${move.item.name}` : ''}>
        {move && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops(`/stock/${move.item.id}/movements`, { body: { kind: move.kind, quantity: Number(move.quantity), reason: move.reason } }); setMove(null); list.reload(); }, 'Stock updated'); }}>
            <p className="text-sm text-slate2-3">{move.item.onHand} {move.item.unit} on hand</p>
            <FieldLabel text="Movement"><Select value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value })} options={['RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT']} /></FieldLabel>
            <FieldLabel text="Quantity" hint={move.kind === 'ADJUSTMENT' ? 'Use a negative number to reduce stock.' : undefined}><Input required type="number" value={move.quantity} onChange={(e) => setMove({ ...move, quantity: e.target.value })} /></FieldLabel>
            <FieldLabel text="Reason"><Input required minLength={2} value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} /></FieldLabel>
            <Button busy={busy} className="w-full">Save</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
