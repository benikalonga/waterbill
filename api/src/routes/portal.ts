import { Router } from 'express';
import { z } from 'zod';
import { PaymentChannel, TicketTopic } from '@prisma/client';
import { requireCustomer } from '../lib/auth';
import { config } from '../lib/config';
import { db } from '../lib/db';
import { badRequest, conflict, h, listOf, notFound, paging, reference } from '../lib/http';
import { toStaff } from '../lib/realtime';
import { confirmPayment, isMobileMoney, splitInstallments, startPayment } from '../domain/payments';
import { recordReading } from '../domain/readings';
import { getSettings } from '../domain/settings';

/** Everything here is scoped to the signed-in customer: other accounts are unreachable. */
const router = Router();
router.use(requireCustomer);

const OPEN = ['ISSUED', 'PARTIAL', 'OVERDUE', 'COLLECTIONS', 'DISPUTED'] as const;

router.get('/summary', h(async (req, res) => {
  const id = req.customer!.id;
  const since = new Date(Date.now() - 30 * 864e5);
  const [customer, open, recent, usage, outages, unread, tickets] = await Promise.all([
    db.customer.findUniqueOrThrow({ where: { id }, include: { meter: true, zone: { select: { id: true, name: true } } } }),
    db.invoice.findMany({ where: { customerId: id, status: { in: [...OPEN] }, balanceCents: { gt: 0 } }, orderBy: { dueAt: 'asc' } }),
    db.invoice.findMany({ where: { customerId: id, status: { not: 'VOID' } }, orderBy: { period: 'desc' }, take: 6 }),
    db.meterReading.aggregate({ where: { meter: { customerId: id }, status: 'ACCEPTED', readAt: { gte: since } }, _sum: { usageLitres: true } }),
    db.outage.findMany({ where: { status: { in: ['SCHEDULED', 'ACTIVE'] } }, orderBy: { startsAt: 'asc' }, take: 10 }),
    db.notification.count({ where: { customerId: id, readAt: null } }),
    db.ticket.count({ where: { customerId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ]);
  const { pinHash: _p, failedPins: _f, lockedUntil: _l, reviewNotes: _r, ...profile } = customer;
  res.json({
    customer: profile,
    balanceCents: open.reduce((s, i) => s + i.balanceCents, 0),
    nextDue: open[0] ?? null,
    recentInvoices: recent,
    usage30dLitres: usage._sum.usageLitres ?? 0,
    outages: outages.filter((o) => !o.zoneId || o.zoneId === customer.zoneId),
    unread,
    openTickets: tickets,
  });
}));

router.patch('/profile', h(async (req, res) => {
  const data = z.object({
    email: z.string().email().nullable().optional(),
    smsReminders: z.boolean().optional(),
    paperless: z.boolean().optional(),
    monthlyLimitLitres: z.number().int().positive().max(100_000_000).nullable().optional(),
  }).parse(req.body);
  await db.customer.update({ where: { id: req.customer!.id }, data });
  res.json({ ok: true });
}));

// ─── Bills ────────────────────────────────────────────────────────────────────

router.get('/invoices', h(async (req, res) => {
  const p = paging(req.query, 20);
  const where = { customerId: req.customer!.id, status: { not: 'VOID' as const } };
  const [items, total] = await Promise.all([
    db.invoice.findMany({ where, orderBy: { period: 'desc' }, skip: p.skip, take: p.take }),
    db.invoice.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.get('/invoices/:id', h(async (req, res) => {
  const invoice = await db.invoice.findFirst({
    where: { id: req.params.id, customerId: req.customer!.id },
    include: {
      payments: { where: { status: 'CONFIRMED' }, orderBy: { confirmedAt: 'desc' } },
      plans: { where: { status: { in: ['REQUESTED', 'ACTIVE'] } }, include: { installments: { orderBy: { seq: 'asc' } } } },
      customer: { select: { accountNumber: true, firstName: true, lastName: true, addressLine: true, city: true, tariffClass: true } },
    },
  });
  if (!invoice) throw notFound('Bill not found.');
  res.json({ invoice });
}));

// ─── Usage ────────────────────────────────────────────────────────────────────

router.get('/usage', h(async (req, res) => {
  const id = req.customer!.id;
  const [meter, invoices, customer, network] = await Promise.all([
    db.meter.findUnique({ where: { customerId: id } }),
    db.invoice.findMany({ where: { customerId: id, status: { not: 'VOID' } }, orderBy: { period: 'desc' }, take: 12 }),
    db.customer.findUniqueOrThrow({ where: { id }, select: { monthlyLimitLitres: true, type: true, tariffClass: true } }),
    db.invoice.aggregate({ where: { status: { not: 'VOID' }, period: { gte: new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 7) } }, _avg: { usageLitres: true } }),
  ]);
  const readings = meter
    ? await db.meterReading.findMany({ where: { meterId: meter.id, status: { not: 'REJECTED' } }, orderBy: { readAt: 'desc' }, take: 60 })
    : [];
  res.json({
    meter,
    monthly: [...invoices].reverse().map((i) => ({ period: i.period, litres: i.usageLitres, basis: i.basis, totalCents: i.totalCents })),
    readings,
    monthlyLimitLitres: customer.monthlyLimitLitres,
    networkAverageLitres: Math.round(network._avg.usageLitres ?? 0),
  });
}));

// Customers can send in their own reading; staff check it before it counts.
router.post('/readings', h(async (req, res) => {
  const { totalLitres, photoUrl } = z.object({ totalLitres: z.number().int().nonnegative(), photoUrl: z.string().url().max(500).optional() }).parse(req.body);
  const meter = await db.meter.findUnique({ where: { customerId: req.customer!.id } });
  if (!meter) throw conflict('No meter is linked to your account yet.');
  const pending = await db.meterReading.count({ where: { meterId: meter.id, status: 'PENDING_REVIEW', source: 'CUSTOMER' } });
  if (pending) throw conflict('Your previous reading is still being checked.');
  const reading = await recordReading({ meter, totalLitres, source: 'CUSTOMER', photoUrl, needsReview: true });
  res.status(201).json({ reading });
}));

// ─── Payments ─────────────────────────────────────────────────────────────────

router.get('/payments', h(async (req, res) => {
  const p = paging(req.query, 20);
  const where = { customerId: req.customer!.id };
  const [items, total] = await Promise.all([
    db.payment.findMany({ where, orderBy: { initiatedAt: 'desc' }, skip: p.skip, take: p.take, include: { invoice: { select: { number: true, period: true } } } }),
    db.payment.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.post('/payments', h(async (req, res) => {
  const input = z.object({
    invoiceId: z.string().optional(),
    amountCents: z.number().int().positive().max(100_000_000),
    channel: z.nativeEnum(PaymentChannel).refine((c) => isMobileMoney(c) || c === 'CARD' || c === 'BANK_TRANSFER', 'Choose an online payment method.'),
    payerPhone: z.string().optional(),
  }).parse(req.body);

  const payment = await startPayment({ ...input, customerId: req.customer!.id });

  // Outside production no operator exists to call back, so settle immediately.
  if (!config.isProd) {
    await confirmPayment(payment.id);
    return res.status(201).json({ payment: await db.payment.findUniqueOrThrow({ where: { id: payment.id } }), simulated: true });
  }
  res.status(202).json({ payment, instructions: 'Approve the payment request on your phone. We will confirm as soon as it arrives.' });
}));

// ─── Payment plans ────────────────────────────────────────────────────────────

router.get('/plans', h(async (req, res) => {
  res.json({
    plans: await db.paymentPlan.findMany({
      where: { customerId: req.customer!.id },
      include: { installments: { orderBy: { seq: 'asc' } }, invoice: { select: { number: true, period: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  });
}));

router.post('/plans', h(async (req, res) => {
  const { invoiceId, months, reason } = z.object({
    invoiceId: z.string(), months: z.number().int().min(2).max(12), reason: z.string().max(255).optional(),
  }).parse(req.body);
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, customerId: req.customer!.id, balanceCents: { gt: 0 }, status: { not: 'VOID' } } });
  if (!invoice) throw notFound('Bill not found.');
  const existing = await db.paymentPlan.count({ where: { invoiceId, status: { in: ['REQUESTED', 'ACTIVE'] } } });
  if (existing) throw conflict('This bill already has a payment plan.');

  const plan = await db.paymentPlan.create({
    data: {
      customerId: req.customer!.id, invoiceId, months, reason, totalCents: invoice.balanceCents,
      installments: {
        create: splitInstallments(invoice.balanceCents, months).map((amountCents, i) => ({
          seq: i + 1, amountCents, dueAt: new Date(Date.now() + (i + 1) * 30 * 864e5),
        })),
      },
    },
    include: { installments: true },
  });
  toStaff('plan:requested', { id: plan.id });
  res.status(201).json({ plan });
}));

// ─── Support ──────────────────────────────────────────────────────────────────

router.get('/tickets', h(async (req, res) => {
  res.json({ tickets: await db.ticket.findMany({ where: { customerId: req.customer!.id }, orderBy: { createdAt: 'desc' }, take: 100 }) });
}));

router.post('/tickets', h(async (req, res) => {
  const input = z.object({
    topic: z.nativeEnum(TicketTopic),
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(3).max(4000),
    invoiceId: z.string().optional(),
  }).parse(req.body);
  const id = req.customer!.id;
  if (input.invoiceId && !(await db.invoice.findFirst({ where: { id: input.invoiceId, customerId: id } }))) throw notFound('Bill not found.');
  const { ticketSlaHours } = await getSettings();
  const name = `${req.customer!.firstName} ${req.customer!.lastName}`;

  const ticket = await db.ticket.create({
    data: {
      number: reference('TK'), customerId: id, invoiceId: input.invoiceId, topic: input.topic, subject: input.subject,
      slaDueAt: new Date(Date.now() + ticketSlaHours * 36e5),
      messages: { create: { fromStaff: false, authorName: name, body: input.message } },
    },
  });
  // A disputed bill is paused until the ticket is settled.
  if (input.topic === 'BILL_DISPUTE' && input.invoiceId) {
    await db.invoice.update({ where: { id: input.invoiceId }, data: { status: 'DISPUTED' } });
  }
  toStaff('ticket:new', { id: ticket.id, number: ticket.number });
  res.status(201).json({ ticket });
}));

const ownTicket = async (id: string, customerId: string) => {
  const ticket = await db.ticket.findFirst({ where: { id, customerId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!ticket) throw notFound('Ticket not found.');
  return ticket;
};

router.get('/tickets/:id', h(async (req, res) => {
  res.json({ ticket: await ownTicket(req.params.id, req.customer!.id) });
}));

router.post('/tickets/:id/messages', h(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const ticket = await ownTicket(req.params.id, req.customer!.id);
  if (['CLOSED', 'REJECTED'].includes(ticket.status)) throw conflict('This ticket is closed.');
  const message = await db.ticketMessage.create({
    data: { ticketId: ticket.id, fromStaff: false, authorName: `${req.customer!.firstName} ${req.customer!.lastName}`, body },
  });
  toStaff('ticket:message', { ticketId: ticket.id });
  res.status(201).json({ message });
}));

router.post('/tickets/:id/rating', h(async (req, res) => {
  const { rating } = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body);
  const ticket = await ownTicket(req.params.id, req.customer!.id);
  if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') throw badRequest('You can rate a ticket once it is resolved.');
  await db.ticket.update({ where: { id: ticket.id }, data: { rating } });
  res.json({ ok: true });
}));

// ─── Report a leak ────────────────────────────────────────────────────────────

router.post('/leaks', h(async (req, res) => {
  const input = z.object({
    address: z.string().trim().min(3).max(255),
    description: z.string().trim().max(2000).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }).parse(req.body);
  const leak = await db.leak.create({ data: { ...input, source: 'CUSTOMER_REPORT', reportedByCustomerId: req.customer!.id } });
  toStaff('leak:new', { id: leak.id, address: leak.address });
  res.status(201).json({ leak: { id: leak.id, status: leak.status } });
}));

router.get('/leaks', h(async (req, res) => {
  res.json({ leaks: await db.leak.findMany({ where: { reportedByCustomerId: req.customer!.id }, orderBy: { reportedAt: 'desc' }, take: 50 }) });
}));

// ─── Notifications ────────────────────────────────────────────────────────────

router.get('/notifications', h(async (req, res) => {
  const where = { customerId: req.customer!.id };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  res.json({ items, unread });
}));

router.post('/notifications/read', h(async (req, res) => {
  await db.notification.updateMany({ where: { customerId: req.customer!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

export default router;
