import { db } from '../lib/db';

export const SETTING_DEFAULTS = {
  dueDays: 21,
  graceDays: 5,
  penaltyBps: 200,
  reconnectionFeeCents: 500,
  disconnectAfterDays: 45,
  minEstimateLitres: 10000,
  flatRateLitres: 15000,
  ticketSlaHours: 72,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, number>;

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const out = { ...SETTING_DEFAULTS } as Settings;
  for (const row of rows) {
    const n = Number(row.value);
    if (row.key in out && Number.isFinite(n)) out[row.key as SettingKey] = n;
  }
  return out;
}
