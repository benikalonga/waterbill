'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { date, label, m3, money, period } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Pager, SearchBox, Select, Table } from '@/components/ui';

const EMPTY = { firstName: '', lastName: '', phone: '', email: '', type: 'HOUSEHOLD', tariffClass: 'STANDARD', addressLine: '', neighborhood: '', district: '', city: '', region: '' };

function Detail({ id, onClose, onChange }: { id: string | null; onClose: () => void; onChange: () => void }) {
  const { data, reload } = useData((u) => ops(u), id ? `/customers/${id}` : null);
  const [checks, setChecks] = useState({ meterVerified: false, identityVerified: false, addressVerified: false, documentsProvided: false });
  const [code, setCode] = useState<string | null>(null);
  const refs = useData((u) => ops(u), id ? '/branches' : null);
  const { busy, run } = useAction();
  const c = data?.customer?.id === id ? data.customer : null;
  const act = (path: string, msg: string, body?: object) => run(async () => { const r = await ops(`/customers/${id}/${path}`, { method: 'POST', body }); reload(); onChange(); return r; }, msg);

  return (
    <Modal open={Boolean(id)} onClose={() => { setCode(null); onClose(); }} title={c ? `${c.firstName} ${c.lastName}` : 'Customer'} wide>
      {c && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-1.5"><Badge value={c.status} /><Badge tone="teal">{label(c.tariffClass)}</Badge><Badge tone="gray">{label(c.type)}</Badge>{c.selfRegistered && <Badge tone="blue">Self-registered</Badge>}</div>
          <div className="grid gap-1 sm:grid-cols-2">
            <p><span className="text-slate2-3">Account</span> {c.accountNumber}</p><p><span className="text-slate2-3">Phone</span> {c.phone}</p>
            <p className="sm:col-span-2"><span className="text-slate2-3">Address</span> {c.addressLine}, {c.neighborhood}, {c.district}, {c.city}, {c.region}</p>
            <p><span className="text-slate2-3">Meter</span> {c.meter ? `${c.meter.serial} · ${m3(c.meter.lastLitres)}` : 'None'}</p><p><span className="text-slate2-3">Credit</span> {money(c.creditCents)}</p>
            <div className="sm:col-span-2"><FieldLabel text="Service zone" hint="Decides which outage notices and reading route apply."><Select value={c.zoneId ?? ''} onChange={(e) => run(async () => { await ops(`/customers/${id}`, { method: 'PATCH', body: { zoneId: e.target.value || null } }); reload(); onChange(); }, 'Zone updated')} options={[{ value: '', label: 'Not assigned' }, ...(refs.data?.zones ?? []).map((z: any) => ({ value: z.id, label: z.name }))]} /></FieldLabel></div>
          </div>

          {c.review === 'PENDING' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 font-bold">Review this application</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(Object.keys(checks) as (keyof typeof checks)[]).map((k) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />{label(k.replace(/([A-Z])/g, '_$1').toUpperCase())}</label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button busy={busy} onClick={() => act('approve', 'Application approved', checks)}>Approve</Button>
                <Button variant="ghost" busy={busy} onClick={() => { const reason = window.prompt('Reason for declining?'); if (reason) act('reject', 'Application declined', { reason }); }}>Decline</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {c.status === 'ACTIVE' && <Button variant="ghost" busy={busy} onClick={() => act('disconnect', 'Disconnection job created')}>Disconnect</Button>}
            {c.status === 'DISCONNECTED' && <Button variant="ghost" busy={busy} onClick={() => act('reconnect', 'Reconnection job created')}>Reconnect</Button>}
            <Button variant="ghost" busy={busy} onClick={async () => { const r = await act('reset-pin', 'New code sent by SMS'); if (r) setCode(r.oneTimeCode); }}>Reset PIN</Button>
          </div>
          {code && <p className="rounded-lg bg-tide-50 p-3">One-time code: <b className="tracking-widest">{code}</b>. Only share it with the verified customer.</p>}

          <div>
            <p className="mb-1 font-bold">Bills</p>
            <div className="divide-y divide-edge rounded-xl border border-edge">
              {c.invoices.map((i: any) => <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2"><span>{period(i.period)}</span><Badge value={i.status} /><span className="font-semibold">{money(i.balanceCents)} due</span></div>)}
              {!c.invoices.length && <p className="p-3 text-slate2-3">No bills yet.</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Customers() {
  const params = useSearchParams();
  const list = usePaged('/customers', { q: '', status: '', review: params.get('review') ?? '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [created, setCreated] = useState<any>(null);
  const { busy, run } = useAction();
  const f = (k: keyof typeof EMPTY) => ({ value: form?.[k] ?? '', onChange: (e: React.ChangeEvent<any>) => setForm({ ...form!, [k]: e.target.value }) });

  return (
    <>
      <PageTitle title="Customers" actions={<Button onClick={() => setForm(EMPTY)}>New customer</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox value={list.filters.q} onChange={(v) => list.setFilter('q', v)} placeholder="Name, account or phone" />
        <Select className="w-auto" aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'CLOSED'].map((s) => ({ value: s, label: label(s) }))]} />
        <Select className="w-auto" aria-label="Review" value={list.filters.review} onChange={(e) => list.setFilter('review', e.target.value)} options={[{ value: '', label: 'Any review' }, { value: 'PENDING', label: 'Needs review' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Declined' }]} />
      </div>
      <Table loading={list.loading} rows={list.items} onRow={(r: any) => setOpenId(r.id)} columns={[
        { key: 'name', title: 'Customer', render: (r: any) => <div><b>{r.firstName} {r.lastName}</b><p className="text-xs text-slate2-3">{r.accountNumber}</p></div> },
        { key: 'phone', title: 'Phone' },
        { key: 'place', title: 'Area', render: (r: any) => r.zone?.name ?? r.neighborhood },
        { key: 'tariff', title: 'Tariff', render: (r: any) => label(r.tariffClass) },
        { key: 'meter', title: 'Meter', render: (r: any) => r.meter?.serial ?? '—' },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.review === 'PENDING' ? 'PENDING' : r.status} /> },
        { key: 'since', title: 'Since', render: (r: any) => date(r.createdAt) },
      ]} />
      {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
      <Detail id={openId} onClose={() => setOpenId(null)} onChange={list.reload} />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="New customer" wide>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await ops('/customers', { body: { ...form, email: form!.email || null } }); setForm(null); setCreated(r); list.reload(); }); }}>
          <FieldLabel text="First name"><Input required {...f('firstName')} /></FieldLabel>
          <FieldLabel text="Last name"><Input required {...f('lastName')} /></FieldLabel>
          <FieldLabel text="Phone"><Input required {...f('phone')} /></FieldLabel>
          <FieldLabel text="Email"><Input type="email" {...f('email')} /></FieldLabel>
          <FieldLabel text="Type"><Select {...f('type')} options={['HOUSEHOLD', 'BUSINESS', 'INDUSTRY', 'INSTITUTION', 'GOVERNMENT', 'NGO', 'PUBLIC_STANDPIPE']} /></FieldLabel>
          <FieldLabel text="Tariff"><Select {...f('tariffClass')} options={['LIFELINE', 'STANDARD', 'COMMERCIAL', 'INDUSTRIAL']} /></FieldLabel>
          <div className="sm:col-span-2"><FieldLabel text="Address"><Input required {...f('addressLine')} /></FieldLabel></div>
          <FieldLabel text="Neighborhood"><Input required {...f('neighborhood')} /></FieldLabel>
          <FieldLabel text="District"><Input required {...f('district')} /></FieldLabel>
          <FieldLabel text="City"><Input required {...f('city')} /></FieldLabel>
          <FieldLabel text="Region"><Input required {...f('region')} /></FieldLabel>
          <Button busy={busy} className="sm:col-span-2">Create account</Button>
        </form>
      </Modal>
      <Modal open={Boolean(created)} onClose={() => setCreated(null)} title="Account created">
        {created && <div className="space-y-2 text-sm"><p>Account number: <b>{created.customer.accountNumber}</b></p><p>One-time code: <b className="tracking-widest">{created.oneTimeCode}</b></p><p className="text-slate2-3">The code was also sent by SMS. It works once and lasts 24 hours.</p></div>}
      </Modal>
    </>
  );
}

export default function Page() {
  return <Suspense><Customers /></Suspense>;
}
