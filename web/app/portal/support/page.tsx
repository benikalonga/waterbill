'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { portal } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { ago, label } from '@/lib/format';
import { Badge, Button, Failed, FieldLabel, Input, Modal, PageTitle, Select, Table, TextArea } from '@/components/ui';

const TOPICS = ['BILL_DISPUTE', 'WRONGFUL_DISCONNECTION', 'LEAK', 'WATER_QUALITY', 'NEW_CONNECTION', 'OTHER'];

function Support() {
  const router = useRouter();
  const invoiceId = useSearchParams().get('invoice');
  const { data, loading, error, reload } = useData((u) => portal(u), '/tickets');
  const [open, setOpen] = useState(Boolean(invoiceId));
  const [form, setForm] = useState({ topic: invoiceId ? 'BILL_DISPUTE' : 'OTHER', subject: '', message: '' });
  const { busy, run } = useAction();
  if (error) return <Failed message={error} retry={reload} />;

  return (
    <>
      <PageTitle title="Support" hint="Ask a question or tell us about a problem." actions={<Button onClick={() => setOpen(true)}>New ticket</Button>} />
      <Table loading={loading} rows={data?.tickets ?? []} empty="You have no support tickets." onRow={(r: any) => router.push(`/portal/support/${r.id}`)} columns={[
        { key: 'subject', title: 'Subject', render: (r: any) => <b>{r.subject}</b> },
        { key: 'topic', title: 'Topic', render: (r: any) => label(r.topic) },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'updated', title: 'Updated', render: (r: any) => ago(r.updatedAt) },
      ]} />
      <Modal open={open} onClose={() => setOpen(false)} title="New ticket">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const { ticket } = await portal('/tickets', { body: { ...form, invoiceId: invoiceId ?? undefined } }); router.push(`/portal/support/${ticket.id}`); }, 'Ticket created'); }}>
          {invoiceId && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">Disputing a bill pauses late fees on it until we have reviewed it.</p>}
          <FieldLabel text="Topic"><Select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} options={TOPICS} /></FieldLabel>
          <FieldLabel text="Subject"><Input required minLength={3} maxLength={160} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></FieldLabel>
          <FieldLabel text="Details"><TextArea required minLength={3} rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></FieldLabel>
          <Button busy={busy} className="w-full">Send</Button>
        </form>
      </Modal>
    </>
  );
}

export default function Page() {
  return <Suspense><Support /></Suspense>;
}
