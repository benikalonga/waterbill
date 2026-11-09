import { Router } from 'express';
import { z } from 'zod';
import { InvoiceStatus, PaymentChannel, PaymentStatus, PlanStatus, TariffClass } from '@prisma/client';
import { allow, COLLECTIONS, COMMERCIAL, OFFICE } from '../../lib/auth';
import { db } from '../../lib/db';
import { badRequest, conflict, h, listOf, notFound, paging, periodOf, reference } from '../../lib/http';
import { audit } from '../../domain/audit';
import { invoiceStatus, runBilling } from '../../domain/billing';
import { notifyCustomer } from '../../domain/notify';
import { confirmPayment } from '../../domain/payments';
import { validateBands } from '../../domain/tariff';

const router = Router();

// ─── Tariffs ──────────────────────────────────────────────────────────────────

router.get('/tariffs', allow(...OFFICE), h(async (_req, res) => {
  res.json({ tariffs: await db.tariffRule.findMany({ include: { bands: { orderBy: { fromM3: 'asc' } } } }) });
}));

router.put('/tariffs/:tariffClass', allow('COMMERCIAL_MANAGER'), h(async (req, res) => {
  const tariffClass = z.nativeEnum(TariffClass).parse(req.params.tariffClass);
  const input = z.object({
    fixedChargeCents: z.number().int().nonnegative(),
    vatBps: z.number().int().min(0).max(5000),
    bands: z.array(z.object({ fromM3: z.number().int().nonnegative(), toM3: z.number().int().positive().nullable(), centsPerM3: z.number().int().nonnegative() })),
  }).parse(req.body);
  const problem = validateBands(input.bands);
  if (problem) throw badRequest(problem);

  await db.$transaction([
    db.tariffRule.upsert({
      where: { tariffClass },
      create: { tariffClass, fixedChargeCents: input.fixedChargeCents, vatBps: input.vatBps },
      update: { fixedChargeCents: input.fixedChargeCents, vatBps: input.vatBps },
    }),
    db.tariffBand.deleteMany({ where: { tariffClass } }),
    db.tariffBand.createMany({ data: input.bands.map((b) => ({ ...b, tariffClass })) }),
  ]);
  audit(req, 'tariff.update', 'TariffRule', tariffClass, input);
  res.json({ ok: true });
}));

// ─── Billing ──────────────────────────────────────────────────────────────────

router.get('/billing-runs', allow(...OFFICE), h(async (_req, res) => {
  res.json({ runs: await db.billingRun.findMany({ orderBy: { period: 'desc' }, take: 36 }) });
}));

router.post('/billing-runs', allow(...COMMERCIAL), h(async (req, res) => {
  const { period } = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM.') }).parse(req.body);
  if (period > periodOf(new Date())) throw badRequest('You cannot bill a future period.');
  const run = await runBilling(period, req.staff!.id);
  audit(req, 'billing.run', 'BillingRun', run.id, { period });
  res.status(201).json({ run });
}));

router.get('/invoices', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = {
    ...(req.query.status ? { status: z.nativeEnum(InvoiceStatus).parse(req.query.status) } : {}),
    ...(typeof req.query.period === 'string' && req.query.period ? { period: req.query.period } : {}),
    ...(q ? { OR: [{ number: { contains: q } }, { customer: { accountNumber: { contains: q } } }, { customer: { lastName: { contains: q } } }] } : {}),
  };
  const [items, total, sums] = await Promise.all([
    db.invoice.findMany({ where, skip: p.skip, take: p.take, orderBy: { issuedAt: 'desc' }, include: { customer: { select: { accountNumber: true, firstName: true, lastName: true } } } }),
    db.invoice.count({ where }),
    db.invoice.aggregate({ where, _sum: { totalCents: true, paidCents: true, balanceCents: true } }),
  ]);
  res.json({ ...listOf(items, total, p), sums: sums._sum });
}));

router.get('/invoices/:id', allow(...OFFICE), h(async (req, res) => {
  const invoice = await db.invoice.findUnique({
    where: { id: req.params.id },
    include: { customer: { select: { id: true, accountNumber: true, firstName: true, lastName: true, addressLine: true } }, payments: true, tickets: true, plans: true },
  });
  if (!invoice) throw notFound('Invoice not found.');
  res.json({ invoice });
}));

router.post('/invoices/:id/void', allow('COMMERCIAL_MANAGER'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3).max(255) }).parse(req.body);
  const invoice = await db.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status === 'VOID') throw conflict('This invoice is already void.');

  await db.$transaction([
    db.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID', balanceCents: 0, note: reason } }),
    // Anything already paid must not be lost.
    db.customer.update({ where: { id: invoice.customerId }, data: { creditCents: { increment: invoice.paidCents } } }),
  ]);
  audit(req, 'invoice.void', 'Invoice', invoice.id, { reason, refundedToCredit: invoice.paidCents });
  res.json({ ok: true, creditedCents: invoice.paidCents });
}));

// Reduce what is owed on a bill, for example after a dispute is upheld.
router.post('/invoices/:id/adjust', allow('COMMERCIAL_MANAGER', 'BILLING_CLERK'), h(async (req, res) => {
  const { amountCents, reason } = z.object({ amountCents: z.number().int().positive(), reason: z.string().trim().min(3).max(255) }).parse(req.body);
  const invoice = await db.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) throw notFound('Invoice not found.');
  if (amountCents > invoice.balanceCents) throw badRequest('The adjustment is larger than the balance.');
  const balance = invoice.balanceCents - amountCents;
  await db.invoice.update({
    where: { id: invoice.id },
    data: { balanceCents: balance, note: reason, status: invoiceStatus(balance, invoice.paidCents, invoice.status === 'DISPUTED' ? 'ISSUED' : invoice.status) },
  });
  audit(req, 'invoice.adjust', 'Invoice', invoice.id, { amountCents, reason });
  res.json({ ok: true, balanceCents: balance });
}));

// ─── Payments ─────────────────────────────────────────────────────────────────

router.get('/payments', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = {
    ...(req.query.status ? { status: z.nativeEnum(PaymentStatus).parse(req.query.status) } : {}),
    ...(req.query.channel ? { channel: z.nativeEnum(PaymentChannel).parse(req.query.channel) } : {}),
    ...(q ? { OR: [{ reference: { contains: q } }, { customer: { accountNumber: { contains: q } } }, { customer: { lastName: { contains: q } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.payment.findMany({ where, skip: p.skip, take: p.take, orderBy: { initiatedAt: 'desc' }, include: { customer: { select: { accountNumber: true, firstName: true, lastName: true } }, invoice: { select: { number: true } } } }),
    db.payment.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

// Cash or bank money taken at a counter.
router.post('/payments/counter', allow('BILLING_CLERK', 'COLLECTIONS_OFFICER', 'COMMERCIAL_MANAGER'), h(async (req, res) => {
  const input = z.object({
    accountNumber: z.string().trim(),
    invoiceId: z.string().optional(),
    amountCents: z.number().int().positive().max(100_000_000),
    channel: z.enum(['COUNTER', 'BANK_TRANSFER', 'KIOSK']).default('COUNTER'),
  }).parse(req.body);
  const customer = await db.customer.findUnique({ where: { accountNumber: input.accountNumber.toUpperCase() } });
  if (!customer) throw notFound('No customer has that account number.');
  if (input.invoiceId && !(await db.invoice.findFirst({ where: { id: input.invoiceId, customerId: customer.id } }))) throw notFound('Bill not found on this account.');
  const payment = await db.payment.create({
    data: { reference: reference('PAY', 10), customerId: customer.id, invoiceId: input.invoiceId, amountCents: input.amountCents, channel: input.channel, recordedById: req.staff!.id },
  });
  await confirmPayment(payment.id);
  audit(req, 'payment.counter', 'Payment', payment.id, { amountCents: input.amountCents });
  res.status(201).json({ payment: await db.payment.findUniqueOrThrow({ where: { id: payment.id } }) });
}));

router.get('/payments-reconciliation', allow('COMMERCIAL_MANAGER', 'EXECUTIVE', 'AUDITOR'), h(async (_req, res) => {
  res.json({ rows: await db.payment.groupBy({ by: ['channel', 'status'], _sum: { amountCents: true }, _count: true }) });
}));

// ─── Collections ──────────────────────────────────────────────────────────────

router.get('/collections/aging', allow(...OFFICE), h(async (_req, res) => {
  const open = await db.invoice.findMany({
    where: { balanceCents: { gt: 0 }, status: { notIn: ['VOID', 'PAID'] } },
    select: { dueAt: true, balanceCents: true, customerId: true },
  });
  const buckets = [
    { label: 'Not yet due', cents: 0, bills: 0 }, { label: '1–30 days', cents: 0, bills: 0 }, { label: '31–60 days', cents: 0, bills: 0 },
    { label: '61–90 days', cents: 0, bills: 0 }, { label: 'Over 90 days', cents: 0, bills: 0 },
  ];
  const debtors = new Map<string, number>();
  for (const i of open) {
    const late = Math.floor((Date.now() - i.dueAt.getTime()) / 864e5);
    const b = buckets[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4];
    b.cents += i.balanceCents;
    b.bills += 1;
    debtors.set(i.customerId, (debtors.get(i.customerId) ?? 0) + i.balanceCents);
  }
  const top = [...debtors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const people = await db.customer.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: { id: true, accountNumber: true, firstName: true, lastName: true, phone: true, status: true },
  });
  res.json({
    buckets,
    totalCents: open.reduce((s, i) => s + i.balanceCents, 0),
    topDebtors: top.map(([id, cents]) => ({ ...people.find((c) => c.id === id), cents })),
  });
}));

router.get('/plans', allow(...OFFICE), h(async (req, res) => {
  const where = req.query.status ? { status: z.nativeEnum(PlanStatus).parse(req.query.status) } : {};
  res.json({
    plans: await db.paymentPlan.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
      include: { customer: { select: { accountNumber: true, firstName: true, lastName: true } }, invoice: { select: { number: true, period: true } }, installments: { orderBy: { seq: 'asc' } } },
    }),
  });
}));

router.post('/plans/:id/decide', allow(...COLLECTIONS), h(async (req, res) => {
  const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
  const updated = await db.paymentPlan.updateMany({
    where: { id: req.params.id, status: 'REQUESTED' },
    data: { status: approve ? 'ACTIVE' : 'DECLINED', decidedById: req.staff!.id, decidedAt: new Date() },
  });
  if (!updated.count) throw conflict('This plan has already been decided.');
  const plan = await db.paymentPlan.findUniqueOrThrow({ where: { id: req.params.id } });
  await notifyCustomer(plan.customerId, {
    title: approve ? 'Payment plan approved' : 'Payment plan declined',
    body: approve ? `Your ${plan.months}-month plan is active. No late fees apply while you keep to it.` : 'Your payment plan request was declined. Please contact us.',
    kind: 'bill', link: '/portal/plans', sms: 'always',
  });
  audit(req, approve ? 'plan.approve' : 'plan.decline', 'PaymentPlan', plan.id);
  res.json({ status: approve ? 'ACTIVE' : 'DECLINED' });
}));

export default router;
