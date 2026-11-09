'use client';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { label, toneOf } from '@/lib/format';

export const Spinner = ({ size = 20, className }: { size?: number; className?: string }) => <Loader2 size={size} className={clsx('animate-spin text-tide-500', className)} />;
export const Loading = () => <div className="flex justify-center py-16"><Spinner size={28} /></div>;

type Variant = 'primary' | 'ghost' | 'dark' | 'danger' | 'soft';
export function Button({ variant = 'primary', busy, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...p} disabled={busy || p.disabled} className={clsx(`btn btn-${variant}`, className)}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}

const TONE = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600', blue: 'bg-sky-50 text-sky-700', gray: 'bg-mist text-slate2-2', teal: 'bg-tide-50 text-tide-700' };
export const Badge = ({ value, tone, children }: { value?: string | null; tone?: keyof typeof TONE; children?: ReactNode }) => (
  <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE[tone ?? toneOf(value)])}>{children ?? label(value)}</span>
);

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => <div className={clsx('rounded-2xl border border-edge bg-white', className)}>{children}</div>;

export function Stat({ title, value, hint, tone }: { title: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'good' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate2-3">{title}</p>
      <p className={clsx('mt-1.5 text-2xl font-bold', tone === 'danger' && 'text-red-600', tone === 'good' && 'text-tide-600')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate2-3">{hint}</p>}
    </Card>
  );
}

export const FieldLabel = ({ text, children, hint }: { text: string; children: ReactNode; hint?: string }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-slate2-2">{text}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate2-3">{hint}</span>}
  </label>
);
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx('input', p.className)} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={clsx('input', p.className)} />;
export function Select({ options, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string; label: string })[] }) {
  return (
    <select {...p} className={clsx('input', p.className)}>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{label(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex min-w-[220px] items-center gap-2 rounded-lg border border-edge bg-white px-3">
      <Search size={15} className="text-slate2-4" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent py-2 text-sm outline-none" />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate2/50 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={(e) => e.stopPropagation()} className={clsx('max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-mist"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Empty = ({ title, hint, icon: Icon }: { title: string; hint?: string; icon?: any }) => (
  <div className="px-6 py-14 text-center">
    {Icon && <Icon size={30} className="mx-auto mb-3 text-tide-300" />}
    <p className="font-semibold">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate2-3">{hint}</p>}
  </div>
);
export const Failed = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
    {message} {retry && <button onClick={retry} className="ml-1 font-semibold underline">Try again</button>}
  </div>
);

export interface Column<T> {
  key: string;
  title: string;
  render?: (row: T) => ReactNode;
  right?: boolean;
}
export function Table<T extends { id?: string }>({ columns, rows, loading, empty = 'Nothing to show.', onRow, rowKey }: { columns: Column<T>[]; rows: T[]; loading?: boolean; empty?: string; onRow?: (r: T) => void; rowKey?: (r: T) => string }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge bg-mist/70 text-left text-[11px] uppercase tracking-wider text-slate2-3">
              {columns.map((c) => <th key={c.key} className={clsx('whitespace-nowrap px-4 py-2.5 font-semibold', c.right && 'text-right')}>{c.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey?.(r) ?? r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} className={clsx('border-b border-edge/70 last:border-0', onRow && 'cursor-pointer hover:bg-mist/60')}>
                {columns.map((c) => <td key={c.key} className={clsx('px-4 py-2.5 align-middle', c.right && 'text-right')}>{c.render ? c.render(r) : (r as any)[c.key] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && !rows.length && <Loading />}
      {!loading && !rows.length && <p className="py-10 text-center text-sm text-slate2-3">{empty}</p>}
    </Card>
  );
}

export function Pager({ page, pages, total, onChange }: { page: number; pages: number; total?: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-slate2-3">
      <span>Page {page} of {pages}{total != null ? ` · ${total} total` : ''}</span>
      <button aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn btn-ghost px-2 py-1.5"><ChevronLeft size={15} /></button>
      <button aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)} className="btn btn-ghost px-2 py-1.5"><ChevronRight size={15} /></button>
    </div>
  );
}

export const PageTitle = ({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{hint && <p className="text-sm text-slate2-3">{hint}</p>}</div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export function Tabs({ value, onChange, tabs }: { value: string; onChange: (v: string) => void; tabs: { value: string; label: string }[] }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-edge">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={clsx('-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-semibold', value === t.value ? 'border-tide-500 text-tide-700' : 'border-transparent text-slate2-3 hover:text-slate2')}>{t.label}</button>
      ))}
    </div>
  );
}

/** Small dependency-free bar chart. */
export function Bars({ data, height = 150, format }: { data: { label: string; value: number; muted?: boolean; second?: number }[]; height?: number; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.second ?? 0)));
  const chart = height - 20;
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
          <div className="flex items-end justify-center gap-0.5">
            <div title={format(d.value)} className={clsx('w-full max-w-9 rounded-t', d.muted ? 'bg-tide-200' : 'bg-tide-500')} style={{ height: Math.max(2, (d.value / max) * chart) }} />
            {d.second != null && <div title={format(d.second)} className="w-full max-w-9 rounded-t bg-coral" style={{ height: Math.max(2, (d.second / max) * chart) }} />}
          </div>
          <span className="mt-1 truncate text-center text-[10px] text-slate2-3">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
