'use client';
import { useState } from 'react';
import { LocateFixed } from 'lucide-react';
import toast from 'react-hot-toast';
import { portal } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { Badge, Button, Card, FieldLabel, Input, PageTitle, TextArea } from '@/components/ui';

export default function ReportLeak() {
  const history = useData((u) => portal(u), '/leaks');
  const [form, setForm] = useState({ address: '', description: '' });
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const { busy, run } = useAction();

  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.success('Location added'); },
    () => toast.error('We could not get your location.'),
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageTitle title="Report a leak" hint="Seen water running in the street? Let us know." />
      <Card className="p-5">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await portal('/leaks', { body: { ...form, ...pos } }); setForm({ address: '', description: '' }); setPos(null); history.reload(); }, 'Thank you. Our team has been told.'); }}>
          <FieldLabel text="Where is it?"><Input required minLength={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, landmark" /></FieldLabel>
          <FieldLabel text="What do you see? (optional)"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FieldLabel>
          <Button type="button" variant="ghost" className="w-full" onClick={locate}><LocateFixed size={15} /> {pos ? 'Location added' : 'Add my location'}</Button>
          <Button busy={busy} className="w-full">Send report</Button>
        </form>
      </Card>
      {history.data?.leaks?.length > 0 && (
        <Card className="divide-y divide-edge">
          {history.data.leaks.map((l: any) => <div key={l.id} className="flex items-center justify-between gap-2 p-3 text-sm"><span><b>{l.address}</b><span className="block text-xs text-slate2-3">{dateTime(l.reportedAt)}</span></span><Badge value={l.status} /></div>)}
        </Card>
      )}
    </div>
  );
}
