/** Pure price calculation, kept free of database access so it is easy to test. */

export interface Band {
  fromM3: number;
  toM3: number | null;
  centsPerM3: number;
}

export interface Line {
  label: string;
  litres: number;
  centsPerM3: number;
  cents: number;
}

export interface Price {
  lines: Line[];
  usageCents: number;
  fixedCents: number;
  vatCents: number;
  totalCents: number;
}

export function priceUsage(litres: number, bands: Band[], fixedCents: number, vatBps: number): Price {
  const ordered = [...bands].sort((a, b) => a.fromM3 - b.fromM3);
  const lines: Line[] = [];
  let usageCents = 0;

  for (const band of ordered) {
    const start = band.fromM3 * 1000;
    const end = band.toM3 == null ? Infinity : band.toM3 * 1000;
    const inBand = Math.max(0, Math.min(litres, end) - start);
    if (inBand === 0) continue;
    const cents = Math.round((inBand * band.centsPerM3) / 1000);
    usageCents += cents;
    lines.push({
      label: band.toM3 == null ? `Over ${band.fromM3} m³` : `${band.fromM3}–${band.toM3} m³`,
      litres: inBand,
      centsPerM3: band.centsPerM3,
      cents,
    });
  }

  const vatCents = Math.round(((usageCents + fixedCents) * vatBps) / 10000);
  return { lines, usageCents, fixedCents, vatCents, totalCents: usageCents + fixedCents + vatCents };
}

/** Bands must start at 0 and follow each other with no gaps; only the last may be open-ended. */
export function validateBands(bands: Band[]): string | null {
  const ordered = [...bands].sort((a, b) => a.fromM3 - b.fromM3);
  if (!ordered.length) return 'Add at least one band.';
  if (ordered[0].fromM3 !== 0) return 'The first band must start at 0 m³.';
  for (let i = 0; i < ordered.length; i++) {
    const b = ordered[i];
    if (b.centsPerM3 < 0) return 'Prices cannot be negative.';
    if (b.toM3 != null && b.toM3 <= b.fromM3) return `Band starting at ${b.fromM3} m³ must end after it starts.`;
    const next = ordered[i + 1];
    if (next && b.toM3 !== next.fromM3) return `Band ending at ${b.toM3 ?? '∞'} m³ must meet the next band at ${next.fromM3} m³.`;
  }
  return null;
}

/** Standard z-score of `value` against a history (0 when the history has no spread). */
export function zScore(value: number, history: number[]): number {
  if (history.length < 2) return 0;
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const variance = history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
  return variance === 0 ? 0 : (value - mean) / Math.sqrt(variance);
}
