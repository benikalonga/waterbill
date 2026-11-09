'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { ago, date, label } from '@/lib/format';
import AssetMap from '@/components/AssetMap';
import { Badge, Button, Card, Failed, FieldLabel, Input, Loading, Modal, PageTitle, Select, Stat, Table, Tabs } from '@/components/ui';

export default function NetworkPage() {
  const { data, error, reload } = useData((u) => ops(u), '/network');
  const leaks = useData((u) => ops(u), '/leaks?status=REPORTED&limit=100');
  const agents = useData((u) => ops(u), '/agents');
  const [tab, setTab] = useState('stations');
  const { busy, run } = useAction();
  const [branch, setBranch] = useState<any>(null);
  const [zone, setZone] = useState<any>(null);
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;

  const pins = [
    ...data.stations.map((s: any) => ({ lat: s.lat, lng: s.lng, color: '#0C776C', title: s.name })),
    ...(leaks.data?.items ?? []).filter((l: any) => l.lat != null).map((l: any) => ({ lat: l.lat, lng: l.lng, color: '#DC2626', title: `Leak: ${l.address}` })),
    ...(agents.data?.agents ?? []).filter((a: any) => a.lastLat != null).map((a: any) => ({ lat: a.lastLat, lng: a.lastLng, color: '#F2704D', title: a.fullName })),
  ];
  const quality = (s: any) => s.readings[0];
  const setStatus = (id: string, status: string) => run(async () => { await ops(`/network/stations/${id}`, { method: 'PATCH', body: { status } }); reload(); }, 'Station updated');

  return (
    <>
      <PageTitle title="Network assets" actions={<><Button variant="ghost" onClick={() => setBranch({ code: '', name: '', city: '', region: '', lat: '', lng: '' })}>Add branch</Button><Button variant="ghost" disabled={!data.branches.length} onClick={() => setZone({ code: '', name: '', branchId: data.branches[0]?.id })}>Add zone</Button></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat title="Branches" value={data.branches.length} /><Stat title="Zones" value={data.zones.length} /><Stat title="Pipelines" value={data.pipelines.length} />
        <Stat title="Stations running" value={`${data.stations.filter((s: any) => s.status === 'RUNNING').length} / ${data.stations.length}`} />
      </div>
      <Card className="mb-4 p-2"><AssetMap pins={pins} /></Card>
      <p className="-mt-2 mb-4 text-xs text-slate2-3">Green: stations. Red: reported leaks. Orange: field agents.</p>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stations', label: 'Pump stations' }, { value: 'pipelines', label: 'Pipelines' }, { value: 'zones', label: 'Zones' }, { value: 'agents', label: 'Field agents' }]} />
      {tab === 'stations' && <Table rows={data.stations} columns={[
        { key: 'name', title: 'Station', render: (r: any) => <div><b>{r.name}</b><p className="text-xs text-slate2-3">{r.code} · {r.branch.name}</p></div> },
        { key: 'cap', title: 'Capacity', render: (r: any) => `${r.capacityM3H} m³/h` },
        { key: 'quality', title: 'Latest quality', render: (r: any) => (quality(r) ? `pH ${quality(r).ph ?? '—'} · ${quality(r).turbidity ?? '—'} NTU · ${quality(r).pressureBar} bar` : 'No data') },
        { key: 'next', title: 'Next service', render: (r: any) => date(r.nextServiceAt) },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'set', title: '', render: (r: any) => <Select aria-label="Change status" className="w-36 py-1 text-xs" value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} options={['RUNNING', 'SCHEDULED_STOP', 'FAULT', 'MAINTENANCE']} /> },
      ]} />}
      {tab === 'pipelines' && <Table rows={data.pipelines} columns={[
        { key: 'code', title: 'Code', render: (r: any) => <b>{r.code}</b> },
        { key: 'tier', title: 'Tier', render: (r: any) => label(r.tier) },
        { key: 'material', title: 'Material' },
        { key: 'size', title: 'Size', render: (r: any) => `${r.diameterMm} mm · ${(r.lengthM / 1000).toFixed(1)} km` },
        { key: 'year', title: 'Installed', render: (r: any) => r.installedYear ?? '—' },
        { key: 'leaks', title: 'Leaks', render: (r: any) => r._count.leaks },
        { key: 'condition', title: 'Condition', render: (r: any) => <Badge value={r.condition} /> },
      ]} />}
      {tab === 'zones' && <Table rows={data.zones} columns={[
        { key: 'name', title: 'Zone', render: (r: any) => <div><b>{r.name}</b><p className="text-xs text-slate2-3">{r.code}</p></div> },
        { key: 'branch', title: 'Branch', render: (r: any) => r.branch.name },
        { key: 'customers', title: 'Customers', render: (r: any) => r._count.customers },
        { key: 'population', title: 'Population', render: (r: any) => r.population?.toLocaleString() ?? '—' },
        { key: 'risk', title: 'Fraud risk', render: (r: any) => <Badge value={r.risk} /> },
      ]} />}
      {tab === 'agents' && <Table rows={agents.data?.agents ?? []} empty="No field agents." columns={[
        { key: 'fullName', title: 'Agent', render: (r: any) => <b>{r.fullName}</b> },
        { key: 'trade', title: 'Trade', render: (r: any) => label(r.trade) },
        { key: 'branch', title: 'Branch', render: (r: any) => r.branch?.name ?? '—' },
        { key: 'jobs', title: 'Open jobs', render: (r: any) => r._count.workOrders },
        { key: 'seen', title: 'Last seen', render: (r: any) => ago(r.lastSeenAt) },
      ]} />}
      <Modal open={Boolean(branch)} onClose={() => setBranch(null)} title="Add branch">
        {branch && (
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops('/network/branches', { body: { ...branch, lat: Number(branch.lat), lng: Number(branch.lng) } }); setBranch(null); reload(); }, 'Branch added'); }}>
            {[['code', 'Code'], ['name', 'Name'], ['city', 'City'], ['region', 'Region'], ['lat', 'Latitude'], ['lng', 'Longitude']].map(([k, t]) => <FieldLabel key={k} text={t}><Input required type={k === 'lat' || k === 'lng' ? 'number' : 'text'} step="any" value={branch[k]} onChange={(e) => setBranch({ ...branch, [k]: e.target.value })} /></FieldLabel>)}
            <Button busy={busy} className="col-span-2">Save</Button>
          </form>
        )}
      </Modal>
      <Modal open={Boolean(zone)} onClose={() => setZone(null)} title="Add zone">
        {zone && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops('/network/zones', { body: zone }); setZone(null); reload(); }, 'Zone added'); }}>
            <FieldLabel text="Branch"><Select value={zone.branchId} onChange={(e) => setZone({ ...zone, branchId: e.target.value })} options={data.branches.map((b: any) => ({ value: b.id, label: b.name }))} /></FieldLabel>
            <FieldLabel text="Code"><Input required minLength={2} value={zone.code} onChange={(e) => setZone({ ...zone, code: e.target.value })} /></FieldLabel>
            <FieldLabel text="Name"><Input required minLength={2} value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} /></FieldLabel>
            <Button busy={busy} className="w-full">Save</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
