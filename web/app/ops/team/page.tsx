'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { ago, label } from '@/lib/format';
import { useStaff } from '@/components/OpsShell';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Select, Table } from '@/components/ui';

const ROLES = ['ADMIN', 'EXECUTIVE', 'COMMERCIAL_MANAGER', 'TECHNICAL_MANAGER', 'BRANCH_MANAGER', 'BILLING_CLERK', 'COLLECTIONS_OFFICER', 'FIELD_AGENT', 'AUDITOR'];
const TRADES = ['METER_READER', 'COLLECTOR', 'INSPECTOR', 'NETWORK_TECHNICIAN', 'SUPERVISOR'];
const EMPTY = { fullName: '', email: '', phone: '', role: 'BILLING_CLERK', trade: 'METER_READER', branchId: '', password: '' };

export default function Team() {
  const me = useStaff();
  const { data, loading, reload } = useData((u) => ops(u), '/team');
  const refs = useData((u) => ops(u), '/branches');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const { busy, run } = useAction();
  const f = (k: keyof typeof EMPTY) => ({ value: form?.[k] ?? '', onChange: (e: React.ChangeEvent<any>) => setForm({ ...form!, [k]: e.target.value }) });
  const patch = (id: string, body: object) => run(async () => { await ops(`/team/${id}`, { method: 'PATCH', body }); reload(); }, 'Updated');

  return (
    <>
      <PageTitle title="Team" actions={<Button onClick={() => setForm(EMPTY)}>Add staff member</Button>} />
      <Table loading={loading} rows={data?.team ?? []} columns={[
        { key: 'name', title: 'Name', render: (r: any) => <div><b>{r.fullName}</b><p className="text-xs text-slate2-3">{r.email}</p></div> },
        { key: 'role', title: 'Role', render: (r: any) => <Select aria-label="Role" className="w-44 py-1 text-xs" disabled={r.id === me.id} value={r.role} onChange={(e) => patch(r.id, { role: e.target.value })} options={ROLES} /> },
        { key: 'branch', title: 'Branch', render: (r: any) => r.branch?.name ?? '—' },
        { key: 'login', title: 'Last sign-in', render: (r: any) => ago(r.lastLoginAt) },
        { key: 'state', title: 'Access', render: (r: any) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Disabled'}</Badge> },
        { key: 'act', title: '', right: true, render: (r: any) => r.id !== me.id && <Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => patch(r.id, { isActive: !r.isActive })}>{r.isActive ? 'Disable' : 'Enable'}</Button> },
      ]} />
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Add staff member">
        {form && (
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops('/team', { body: { ...form, phone: form.phone || undefined, branchId: form.branchId || null, trade: form.role === 'FIELD_AGENT' ? form.trade : null } }); setForm(null); reload(); }, 'Staff member added'); }}>
            <div className="col-span-2"><FieldLabel text="Full name"><Input required minLength={2} {...f('fullName')} /></FieldLabel></div>
            <FieldLabel text="Email"><Input required type="email" {...f('email')} /></FieldLabel>
            <FieldLabel text="Phone"><Input {...f('phone')} /></FieldLabel>
            <FieldLabel text="Role"><Select {...f('role')} options={ROLES} /></FieldLabel>
            <FieldLabel text="Branch"><Select {...f('branchId')} options={[{ value: '', label: 'None' }, ...(refs.data?.branches ?? []).map((b: any) => ({ value: b.id, label: b.name }))]} /></FieldLabel>
            {form.role === 'FIELD_AGENT' && <div className="col-span-2"><FieldLabel text="Trade"><Select {...f('trade')} options={TRADES.map((t) => ({ value: t, label: label(t) }))} /></FieldLabel></div>}
            <div className="col-span-2"><FieldLabel text="Temporary password" hint="At least 10 characters."><Input required minLength={10} type="password" autoComplete="new-password" {...f('password')} /></FieldLabel></div>
            <Button busy={busy} className="col-span-2">Create</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
