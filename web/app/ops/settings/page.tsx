'use client';
import { useEffect, useState } from 'react';
import { ops, request } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { useStaff } from '@/components/OpsShell';
import { Button, Card, Failed, FieldLabel, Input, Loading, PageTitle } from '@/components/ui';

/** Stored unit → the unit people think in. */
const FIELDS: { key: string; label: string; factor: number; hint?: string }[] = [
  { key: 'dueDays', label: 'Days to pay a bill', factor: 1 },
  { key: 'graceDays', label: 'Grace period before a late fee (days)', factor: 1 },
  { key: 'penaltyBps', label: 'Late fee (%)', factor: 100 },
  { key: 'reconnectionFeeCents', label: 'Reconnection fee', factor: 100 },
  { key: 'disconnectAfterDays', label: 'Disconnect after (days overdue)', factor: 1 },
  { key: 'minEstimateLitres', label: 'First estimated bill (m³)', factor: 1000, hint: 'Used when a customer has no billing history.' },
  { key: 'flatRateLitres', label: 'Flat-rate usage, no meter (m³)', factor: 1000 },
  { key: 'ticketSlaHours', label: 'Support response target (hours)', factor: 1 },
];

export default function SettingsPage() {
  const staff = useStaff();
  const { data, error, reload } = useData((u) => ops(u), '/settings');
  const [values, setValues] = useState<Record<string, string>>({});
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const { busy, run } = useAction();
  const canEdit = ['ADMIN', 'COMMERCIAL_MANAGER'].includes(staff.role);

  useEffect(() => {
    if (data) setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(data.settings[f.key] / f.factor)])));
  }, [data]);

  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;

  return (
    <>
      <PageTitle title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">Billing rules</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops('/settings', { method: 'PUT', body: Object.fromEntries(FIELDS.map((f) => [f.key, Math.round(Number(values[f.key]) * f.factor)])) }); reload(); }, 'Settings saved'); }}>
            {FIELDS.map((f) => <FieldLabel key={f.key} text={f.label} hint={f.hint}><Input required disabled={!canEdit} type="number" min="0" step="any" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} /></FieldLabel>)}
            {canEdit && <Button busy={busy} className="sm:col-span-2">Save rules</Button>}
          </form>
        </Card>
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-bold">Change my password</h2>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await request('staff', '/auth/staff/change-password', { body: pw }); setPw({ currentPassword: '', newPassword: '' }); }, 'Password changed'); }}>
            <FieldLabel text="Current password"><Input required type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></FieldLabel>
            <FieldLabel text="New password" hint="At least 10 characters."><Input required minLength={10} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></FieldLabel>
            <Button busy={busy} className="w-full">Update password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
