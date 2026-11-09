const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || 'USD';
const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY });

export const money = (cents?: number | null) => moneyFmt.format((cents ?? 0) / 100);
export const m3 = (litres?: number | null) => `${((litres ?? 0) / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} m³`;
export const toCents = (value: string | number) => Math.round(Number(value) * 100);

export const date = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (v?: string | Date | null) => (v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const period = (p?: string | null) => (p ? new Date(`${p}-15`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—');
export const shortPeriod = (p: string) => new Date(`${p}-15`).toLocaleDateString('en-GB', { month: 'short' });

export function ago(v?: string | Date | null) {
  if (!v) return 'never';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return date(v);
}

/** "IN_PROGRESS" → "In progress" */
export const label = (v?: string | null) => (v ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

export const CHANNELS: Record<string, string> = {
  MPESA: 'M-Pesa', AIRTEL_MONEY: 'Airtel Money', ORANGE_MONEY: 'Orange Money', MTN_MOMO: 'MTN MoMo',
  BANK_TRANSFER: 'Bank transfer', CARD: 'Card', KIOSK: 'Kiosk', COUNTER: 'Counter', ACCOUNT_CREDIT: 'Account credit',
};

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'teal';
const TONES: Record<string, Tone> = {
  PAID: 'green', CONFIRMED: 'green', ACTIVE: 'green', APPROVED: 'green', RESOLVED: 'green', DONE: 'green', COMPLETED: 'green', REPAIRED: 'green', RUNNING: 'green', GOOD: 'green', ACCEPTED: 'green', REGULARIZED: 'green', LOW: 'gray',
  ISSUED: 'blue', OPEN: 'blue', NEW: 'blue', SCHEDULED: 'blue', ASSIGNED: 'blue', REPORTED: 'blue', DETECTED: 'blue', INFO: 'gray',
  PARTIAL: 'amber', PENDING: 'amber', REQUESTED: 'amber', PROCESSING: 'amber', IN_PROGRESS: 'amber', ACCEPTED_JOB: 'amber', PENDING_REVIEW: 'amber', DISPUTED: 'amber', SUSPENDED: 'amber', MAINTENANCE: 'amber', VERIFYING: 'amber', IN_REPAIR: 'amber', CONFIRMED_LEAK: 'amber', MEDIUM: 'amber', FAIR: 'amber', NORMAL: 'gray', DRAFT: 'gray',
  OVERDUE: 'red', FAILED: 'red', REJECTED: 'red', DISCONNECTED: 'red', COLLECTIONS: 'red', DEFAULTED: 'red', DECLINED: 'red', CRITICAL: 'red', HIGH: 'red', URGENT: 'red', FAULT: 'red', TAMPERED: 'red', FAULTY: 'red', POOR: 'red', PENALIZED: 'red',
  VOID: 'gray', CLOSED: 'gray', CANCELLED: 'gray', DISMISSED: 'gray', INACTIVE: 'gray', REPLACED: 'gray',
};
export const toneOf = (v?: string | null): Tone => TONES[v ?? ''] ?? 'gray';
