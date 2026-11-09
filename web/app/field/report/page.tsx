'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { LocateFixed } from 'lucide-react';
import { field } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Card, FieldLabel, Input, PageTitle, Tabs, TextArea } from '@/components/ui';

export default function Report() {
  const [kind, setKind] = useState('leaks');
  const [form, setForm] = useState({ address: '', description: '' });
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const { busy, run } = useAction();
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error('Could not get your location.'));

  return (
    <div className="space-y-3">
      <PageTitle title="Report from the field" />
      <Tabs value={kind} onChange={setKind} tabs={[{ value: 'leaks', label: 'Leak' }, { value: 'illegal-connections', label: 'Illegal connection' }]} />
      <Card className="p-4">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await field(`/${kind}`, { body: { ...form, ...pos } }); setForm({ address: '', description: '' }); setPos(null); }, 'Report sent'); }}>
          <FieldLabel text="Location"><Input required minLength={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FieldLabel>
          <FieldLabel text="Details"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FieldLabel>
          <Button type="button" variant="ghost" className="w-full" onClick={locate}><LocateFixed size={15} /> {pos ? 'GPS position added' : 'Add GPS position'}</Button>
          <Button busy={busy} className="w-full">Send</Button>
        </form>
      </Card>
    </div>
  );
}
