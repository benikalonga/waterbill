'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { qs, useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { date, label, money, toCents } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Pager, SearchBox, Table, Tabs } from '@/components/ui';

const EMPTY = { code: '', firstName: '', lastName: '', hiredAt: new Date().toISOString().slice(0, 10), jobTitle: '', department: '', salary: '' };

export default function People() {
  const [tab, setTab] = useState('staff');
  const list = usePaged('/employees', { q: '' });
  const [slipPeriod, setSlipPeriod] = useState(new Date().toISOString().slice(0, 7));
  const slips = useData((u) => ops(u), `/payslips${qs({ period: slipPeriod })}`);
  const leave = useData((u) => ops(u), '/leave');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const { busy, run } = useAction();
  const f = (k: keyof typeof EMPTY) => ({ value: form?.[k] ?? '', onChange: (e: React.ChangeEvent<any>) => setForm({ ...form!, [k]: e.target.value }) });
  const slipStatus = (id: string, status: string) => run(async () => { await ops(`/payslips/${id}`, { method: 'PATCH', body: { status } }); slips.reload(); });
  const decide = (id: string, approve: boolean) => run(async () => { await ops(`/leave/${id}/decide`, { body: { approve } }); leave.reload(); }, approve ? 'Leave approved' : 'Leave declined');

  return (
    <>
      <PageTitle title="HR & payroll" actions={tab === 'staff' && <Button onClick={() => setForm(EMPTY)}>Add employee</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'staff', label: 'Employees' }, { value: 'pay', label: 'Payroll' }, { value: 'leave', label: 'Leave' }]} />
      {tab === 'staff' && (
        <>
          <div className="mb-3"><SearchBox value={list.filters.q} onChange={(v) => list.setFilter('q', v)} placeholder="Name or code" /></div>
          <Table loading={list.loading} rows={list.items} columns={[
            { key: 'name', title: 'Employee', render: (r: any) => <div><b>{r.firstName} {r.lastName}</b><p className="text-xs text-slate2-3">{r.code}</p></div> },
            { key: 'jobTitle', title: 'Role' }, { key: 'department', title: 'Department' },
            { key: 'hiredAt', title: 'Hired', render: (r: any) => date(r.hiredAt) },
            { key: 'salary', title: 'Salary', right: true, render: (r: any) => money(r.salaryCents) },
            { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
          ]} />
          {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
        </>
      )}
      {tab === 'pay' && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Input type="month" aria-label="Period" className="w-auto" value={slipPeriod} onChange={(e) => setSlipPeriod(e.target.value)} />
            <Button busy={busy} onClick={() => run(async () => { await ops('/payslips/generate', { body: { period: slipPeriod } }); slips.reload(); }, 'Payslips generated')}>Generate payslips</Button>
          </div>
          <Table loading={slips.loading} rows={slips.data?.payslips ?? []} empty="No payslips for this month yet." columns={[
            { key: 'name', title: 'Employee', render: (r: any) => `${r.employee.firstName} ${r.employee.lastName}` },
            { key: 'gross', title: 'Gross', right: true, render: (r: any) => money(r.grossCents) },
            { key: 'bonus', title: 'Bonus', right: true, render: (r: any) => money(r.bonusCents) },
            { key: 'ded', title: 'Deductions', right: true, render: (r: any) => money(r.deductionCents) },
            { key: 'net', title: 'Net', right: true, render: (r: any) => <b>{money(r.netCents)}</b> },
            { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
            { key: 'act', title: '', right: true, render: (r: any) => (r.status === 'DRAFT' ? <Button variant="soft" className="px-2.5 py-1 text-xs" onClick={() => slipStatus(r.id, 'APPROVED')}>Approve</Button> : r.status === 'APPROVED' ? <Button variant="soft" className="px-2.5 py-1 text-xs" onClick={() => slipStatus(r.id, 'PAID')}>Mark paid</Button> : null) },
          ]} />
        </>
      )}
      {tab === 'leave' && (
        <Table loading={leave.loading} rows={leave.data?.requests ?? []} empty="No leave requests." columns={[
          { key: 'name', title: 'Employee', render: (r: any) => `${r.employee.firstName} ${r.employee.lastName}` },
          { key: 'kind', title: 'Type', render: (r: any) => label(r.kind) },
          { key: 'dates', title: 'Dates', render: (r: any) => `${date(r.startsOn)} to ${date(r.endsOn)}` },
          { key: 'reason', title: 'Reason' },
          { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
          { key: 'act', title: '', right: true, render: (r: any) => r.status === 'PENDING' && <div className="flex justify-end gap-1.5"><Button className="px-2.5 py-1 text-xs" busy={busy} onClick={() => decide(r.id, true)}>Approve</Button><Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => decide(r.id, false)}>Decline</Button></div> },
        ]} />
      )}
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Add employee">
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const { salary, ...rest } = form!; await ops('/employees', { body: { ...rest, salaryCents: toCents(salary) } }); setForm(null); list.reload(); }, 'Employee added'); }}>
          <FieldLabel text="First name"><Input required {...f('firstName')} /></FieldLabel>
          <FieldLabel text="Last name"><Input required {...f('lastName')} /></FieldLabel>
          <FieldLabel text="Employee code"><Input required minLength={2} {...f('code')} /></FieldLabel>
          <FieldLabel text="Hired on"><Input required type="date" {...f('hiredAt')} /></FieldLabel>
          <FieldLabel text="Job title"><Input required minLength={2} {...f('jobTitle')} /></FieldLabel>
          <FieldLabel text="Department"><Input required minLength={2} {...f('department')} /></FieldLabel>
          <div className="col-span-2"><FieldLabel text="Monthly salary"><Input required type="number" min="0" step="0.01" {...f('salary')} /></FieldLabel></div>
          <Button busy={busy} className="col-span-2">Save</Button>
        </form>
      </Modal>
    </>
  );
}
