import type { Invoice, InvoiceBasis, TariffClass } from '@prisma/client';
import { db } from '../lib/db';
import { conflict, notFound, reference } from '../lib/http';
import { notifyCustomer } from './notify';
import { getSettings, type Settings } from './settings';
import { priceUsage, type Band, type Price } from './tariff';

export async function loadTariffs() {
  const rules = await db.tariffRule.findMany({ include: { bands: { orderBy: { fromM3: 'asc' } } } });
  return new Map(rules.map((r) => [r.tariffClass, r]));
}

export async function estimateBill(tariffClass: TariffClass, litres: number): Promise<Price> {
  const rule = (await loadTariffs()).get(tariffClass);
  if (!rule) throw notFound('That tariff is not configured.');
  return priceUsage(litres, rule.bands as Band[], rule.fixedChargeCents, rule.vatBps);
}

const invoiceStatus = (balance: number, paid: number, current: Invoice['status']): Invoice['status'] => {
  if (balance <= 0) return 'PAID';
  if (current === 'OVERDUE' || current === 'COLLECTIONS' || current === 'DISPUTED') return current;
  return paid > 0 ? 'PARTIAL' : 'ISSUED';
};
export { invoiceStatus };

function periodBounds(period: string) {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** Bill one customer for a period. Returns null if nothing should be billed. */
async function billCustomer(
  customerId: string,
  period: string,
  tariffs: Awaited<ReturnType<typeof loadTariffs>>,
  settings: Settings,
  billingRunId: string,
) {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId }, include: { meter: true } });
  const rule = tariffs.get(customer.tariffClass);
  if (!rule) return null;
  if (await db.invoice.findUnique({ where: { customerId_period: { customerId, period } } })) return null;

  const { end } = periodBounds(period);
  const meter = customer.meter;
  let basis: InvoiceBasis = 'FLAT';
  let opening = 0;
  let closing = 0;
  let usage = settings.flatRateLitres;

  if (meter) {
    const last = await db.invoice.findFirst({ where: { customerId, status: { not: 'VOID' } }, orderBy: { period: 'desc' } });
    opening = last?.closingLitres ?? meter.initialLitres;
    const reading = await db.meterReading.findFirst({
      where: { meterId: meter.id, status: 'ACCEPTED', readAt: { lt: end } },
      orderBy: { readAt: 'desc' },
    });

    if (reading && reading.totalLitres > opening) {
      basis = 'ACTUAL';
      closing = reading.totalLitres;
      usage = closing - opening;
    } else {
      // No fresh reading: estimate from recent real bills. The next actual
      // reading corrects any difference, because it bills from this closing index.
      const recent = await db.invoice.findMany({
        where: { customerId, basis: 'ACTUAL', status: { not: 'VOID' } },
        orderBy: { period: 'desc' },
        take: 3,
      });
      basis = 'ESTIMATED';
      usage = recent.length
        ? Math.round(recent.reduce((s, i) => s + i.usageLitres, 0) / recent.length)
        : settings.minEstimateLitres;
      closing = opening + usage;
    }
  }

  const price = priceUsage(usage, rule.bands as Band[], rule.fixedChargeCents, rule.vatBps);
  const feeCents = customer.pendingFeesCents;
  const totalCents = price.totalCents + feeCents;
  const lines = feeCents > 0 ? [...price.lines, { label: 'Reconnection fee', litres: 0, centsPerM3: 0, cents: feeCents }] : price.lines;
  const number = reference('INV');
  const dueAt = new Date(Date.now() + settings.dueDays * 864e5);

  const invoice = await db.$transaction(async (tx) => {
    // Unused account credit is applied to the new bill straight away.
    const credit = Math.min(customer.creditCents, totalCents);
    const balance = totalCents - credit;
    const created = await tx.invoice.create({
      data: {
        number, customerId, period, dueAt, basis, billingRunId,
        openingLitres: opening, closingLitres: closing, usageLitres: usage,
        usageCents: price.usageCents, fixedCents: price.fixedCents, vatCents: price.vatCents, feeCents,
        totalCents, paidCents: credit, balanceCents: balance,
        status: balance === 0 ? 'PAID' : credit > 0 ? 'PARTIAL' : 'ISSUED',
        lines: lines as object[],
      },
    });
    if (feeCents > 0) await tx.customer.update({ where: { id: customerId }, data: { pendingFeesCents: 0 } });
    if (credit > 0) {
      await tx.customer.update({ where: { id: customerId }, data: { creditCents: { decrement: credit } } });
      await tx.payment.create({
        data: {
          reference: reference('PAY', 10), customerId, invoiceId: created.id, amountCents: credit,
          channel: 'ACCOUNT_CREDIT', status: 'CONFIRMED', confirmedAt: new Date(),
        },
      });
    }
    return created;
  });

  await notifyCustomer(customerId, {
    title: 'Your water bill is ready',
    body: `Bill ${invoice.number} for ${period} is ready. Due ${dueAt.toISOString().slice(0, 10)}.`,
    kind: 'bill',
    link: `/portal/bills/${invoice.id}`,
    sms: 'optional',
  });
  return invoice;
}

/** Bill every active customer for a period. Safe to re-run only via a new period. */
export async function runBilling(period: string, createdById: string) {
  if (await db.billingRun.findUnique({ where: { period } })) throw conflict(`Billing for ${period} has already been run.`);
  const run = await db.billingRun.create({ data: { period, createdById } });
  const [tariffs, settings, customers] = await Promise.all([
    loadTariffs(),
    getSettings(),
    db.customer.findMany({ where: { status: { in: ['ACTIVE', 'SUSPENDED', 'DISCONNECTED'] }, review: 'APPROVED' }, select: { id: true } }),
  ]);

  let created = 0;
  let skipped = 0;
  let estimated = 0;
  let totalCents = 0;
  for (const { id } of customers) {
    const invoice = await billCustomer(id, period, tariffs, settings, run.id);
    if (!invoice) {
      skipped += 1;
      continue;
    }
    created += 1;
    totalCents += invoice.totalCents;
    if (invoice.basis === 'ESTIMATED') estimated += 1;
  }

  return db.billingRun.update({
    where: { id: run.id },
    data: { created, skipped, estimated, totalCents, finishedAt: new Date() },
  });
}

/**
 * Daily: mark bills overdue and add one late penalty per bill (after the grace
 * period), skipping bills covered by an active payment plan or under dispute.
 */
export async function applyOverdue(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.graceDays * 864e5);
  const late = await db.invoice.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIAL'] },
      dueAt: { lt: cutoff },
      balanceCents: { gt: 0 },
      plans: { none: { status: 'ACTIVE' } },
    },
  });

  for (const invoice of late) {
    const penalty = Math.round((invoice.balanceCents * settings.penaltyBps) / 10000);
    const updated = await db.invoice.updateMany({
      where: { id: invoice.id, status: invoice.status },
      data: { status: 'OVERDUE', penaltyCents: penalty, balanceCents: { increment: penalty } },
    });
    if (updated.count) {
      await notifyCustomer(invoice.customerId, {
        title: 'Your bill is overdue',
        body: `Bill ${invoice.number} is overdue and a late fee was added. Pay now or ask for a payment plan.`,
        kind: 'bill',
        link: `/portal/bills/${invoice.id}`,
        sms: 'optional',
      });
    }
  }
  return late.length;
}

/** Daily: remind customers whose bill falls due in three days. */
export async function sendDueReminders(): Promise<number> {
  const from = new Date(Date.now() + 2 * 864e5);
  const to = new Date(Date.now() + 3 * 864e5);
  const due = await db.invoice.findMany({ where: { status: { in: ['ISSUED', 'PARTIAL'] }, dueAt: { gte: from, lt: to } } });
  for (const invoice of due) {
    await notifyCustomer(invoice.customerId, {
      title: 'Payment reminder',
      body: `Bill ${invoice.number} is due in 3 days.`,
      kind: 'reminder',
      link: `/portal/bills/${invoice.id}`,
      sms: 'optional',
    });
  }
  return due.length;
}

/** Daily: open a disconnection work order for accounts seriously overdue. */
export async function queueDisconnections(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.disconnectAfterDays * 864e5);
  const candidates = await db.customer.findMany({
    where: {
      status: 'ACTIVE',
      invoices: { some: { status: 'OVERDUE', dueAt: { lt: cutoff }, plans: { none: { status: 'ACTIVE' } } } },
      workOrders: { none: { kind: 'DISCONNECTION', status: { notIn: ['DONE', 'CANCELLED'] } } },
    },
  });

  for (const c of candidates) {
    await db.workOrder.create({
      data: {
        number: reference('WO'), kind: 'DISCONNECTION', customerId: c.id, address: c.addressLine, lat: c.lat, lng: c.lng,
        description: `Disconnect account ${c.accountNumber}: bills unpaid for over ${settings.disconnectAfterDays} days.`,
      },
    });
    await notifyCustomer(c.id, {
      title: 'Disconnection notice',
      body: 'Your supply is scheduled for disconnection because of unpaid bills. Pay or request a payment plan to stop this.',
      kind: 'disconnection',
      link: '/portal/bills',
      sms: 'always',
    });
  }
  return candidates.length;
}
