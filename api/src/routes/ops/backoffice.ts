import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { AgentTrade, EmploymentStatus, MovementKind, StaffRole, StockCategory } from '@prisma/client';
import { allow, OFFICE } from '../../lib/auth';
import { db } from '../../lib/db';
import { badRequest, conflict, h, listOf, notFound, paging, periodOf } from '../../lib/http';
import { audit } from '../../domain/audit';
import { getSettings, SETTING_DEFAULTS, type SettingKey } from '../../domain/settings';

const router = Router();
const HR = ['EXECUTIVE'] as const;
const STORES = ['TECHNICAL_MANAGER', 'BRANCH_MANAGER'] as const;

// ─── Reports ──────────────────────────────────────────────────────────────────

router.get('/overview', allow(...OFFICE), h(async (_req, res) => {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const months = [...Array(6)].map((_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (5 - i), 1));
    return periodOf(d);
  });
  const [billed, paidToday, activeAlerts, openLeaks, activeCustomers, tampered, recent, monthly, approvals, overdue, openTickets, plans, readings] = await Promise.all([
    db.invoice.aggregate({ where: { status: { not: 'VOID' } }, _sum: { totalCents: true, penaltyCents: true, paidCents: true } }),
    db.payment.aggregate({ where: { status: 'CONFIRMED', confirmedAt: { gte: today } }, _sum: { amountCents: true } }),
    db.alert.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }),
    db.leak.count({ where: { status: { in: ['REPORTED', 'CONFIRMED', 'IN_REPAIR'] } } }),
    db.customer.count({ where: { status: 'ACTIVE' } }),
    db.meter.count({ where: { status: 'TAMPERED' } }),
    db.payment.findMany({ where: { status: 'CONFIRMED' }, take: 8, orderBy: { confirmedAt: 'desc' }, include: { customer: { select: { firstName: true, lastName: true } } } }),
    db.invoice.groupBy({ by: ['period'], where: { period: { in: months }, status: { not: 'VOID' } }, _sum: { totalCents: true, paidCents: true, usageLitres: true } }),
    db.customer.count({ where: { review: 'PENDING' } }),
    db.invoice.aggregate({ where: { status: { in: ['OVERDUE', 'COLLECTIONS'] } }, _sum: { balanceCents: true }, _count: true }),
    db.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.paymentPlan.count({ where: { status: 'REQUESTED' } }),
    db.meterReading.count({ where: { status: 'PENDING_REVIEW' } }),
  ]);
  const billedCents = (billed._sum.totalCents ?? 0) + (billed._sum.penaltyCents ?? 0);
  res.json({
    collectionRate: billedCents ? Math.round(((billed._sum.paidCents ?? 0) / billedCents) * 1000) / 10 : 0,
    collectedTodayCents: paidToday._sum.amountCents ?? 0,
    activeAlerts, openLeaks, activeCustomers, tamperedMeters: tampered, recentPayments: recent,
    monthly: months.map((period) => {
      const row = monthly.find((m) => m.period === period);
      return { period, billedCents: row?._sum.totalCents ?? 0, paidCents: row?._sum.paidCents ?? 0, litres: row?._sum.usageLitres ?? 0 };
    }),
    queues: { approvals, plans, readings, openTickets, overdueBills: overdue._count, overdueCents: overdue._sum.balanceCents ?? 0 },
  });
}));

// Non-revenue water: what was produced but never billed.
router.get('/reports/water-balance', allow('EXECUTIVE', 'TECHNICAL_MANAGER', 'COMMERCIAL_MANAGER', 'AUDITOR', 'BRANCH_MANAGER'), h(async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 864e5);
  const [produced, billed, leaks, illegal] = await Promise.all([
    db.stationReading.aggregate({ where: { recordedAt: { gte: since } }, _sum: { producedM3: true } }),
    db.meterReading.aggregate({ where: { status: 'ACCEPTED', readAt: { gte: since } }, _sum: { usageLitres: true } }),
    db.leak.aggregate({ where: { status: { in: ['REPORTED', 'CONFIRMED', 'IN_REPAIR'] } }, _sum: { lossM3H: true } }),
    db.illegalConnection.aggregate({ where: { status: { in: ['DETECTED', 'VERIFYING', 'CONFIRMED'] } }, _sum: { lossM3H: true } }),
  ]);
  const producedM3 = produced._sum.producedM3 ?? 0;
  const consumedM3 = Math.round((billed._sum.usageLitres ?? 0) / 1000);
  const nonRevenueM3 = Math.max(0, producedM3 - consumedM3);
  const hours = days * 24;
  res.json({
    days, producedM3, consumedM3, nonRevenueM3,
    nonRevenuePct: producedM3 ? Math.round((nonRevenueM3 / producedM3) * 1000) / 10 : 0,
    knownLeakLossM3: Math.round((leaks._sum.lossM3H ?? 0) * hours),
    knownIllegalLossM3: Math.round((illegal._sum.lossM3H ?? 0) * hours),
  });
}));

// ─── Human resources ──────────────────────────────────────────────────────────

const employee = z.object({
  code: z.string().trim().min(2).max(20), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  birthDate: z.coerce.date().nullable().optional(), hiredAt: z.coerce.date(), jobTitle: z.string().trim().min(2).max(120), department: z.string().trim().min(2).max(120),
  branchId: z.string().nullable().optional(), salaryCents: z.number().int().nonnegative(), status: z.nativeEnum(EmploymentStatus).default('ACTIVE'),
});

router.get('/employees', allow(...HR), h(async (req, res) => {
  const p = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { code: { contains: q } }] } : {};
  const [items, total] = await Promise.all([db.employee.findMany({ where, skip: p.skip, take: p.take, orderBy: { lastName: 'asc' } }), db.employee.count({ where })]);
  res.json(listOf(items, total, p));
}));

router.post('/employees', allow(...HR), h(async (req, res) => {
  const created = await db.employee.create({ data: employee.parse(req.body) });
  audit(req, 'employee.create', 'Employee', created.id);
  res.status(201).json({ employee: created });
}));

router.patch('/employees/:id', allow(...HR), h(async (req, res) => {
  const data = employee.partial().parse(req.body);
  const updated = await db.employee.update({ where: { id: req.params.id }, data });
  audit(req, 'employee.update', 'Employee', updated.id, Object.keys(data));
  res.json({ employee: updated });
}));

router.delete('/employees/:id', allow(...HR), h(async (req, res) => {
  await db.employee.delete({ where: { id: req.params.id } });
  audit(req, 'employee.delete', 'Employee', req.params.id);
  res.json({ ok: true });
}));

router.get('/payslips', allow(...HR), h(async (req, res) => {
  const period = typeof req.query.period === 'string' ? req.query.period : periodOf(new Date());
  res.json({ period, payslips: await db.payslip.findMany({ where: { period }, include: { employee: { select: { code: true, firstName: true, lastName: true, department: true } } }, orderBy: { employee: { lastName: 'asc' } } }) });
}));

router.post('/payslips/generate', allow(...HR), h(async (req, res) => {
  const { period } = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).parse(req.body);
  const staff = await db.employee.findMany({ where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } } });
  const result = await db.payslip.createMany({
    data: staff.map((e) => ({ employeeId: e.id, period, grossCents: e.salaryCents, netCents: e.salaryCents })),
    skipDuplicates: true,
  });
  audit(req, 'payslip.generate', 'Payslip', undefined, { period, created: result.count });
  res.status(201).json({ created: result.count });
}));

router.patch('/payslips/:id', allow(...HR), h(async (req, res) => {
  const data = z.object({ bonusCents: z.number().int().nonnegative().optional(), deductionCents: z.number().int().nonnegative().optional(), status: z.enum(['DRAFT', 'APPROVED', 'PAID']).optional() }).parse(req.body);
  const slip = await db.payslip.findUnique({ where: { id: req.params.id } });
  if (!slip) throw notFound('Payslip not found.');
  if (slip.status === 'PAID') throw conflict('Paid payslips cannot be changed.');
  const bonus = data.bonusCents ?? slip.bonusCents;
  const deduction = data.deductionCents ?? slip.deductionCents;
  const updated = await db.payslip.update({ where: { id: slip.id }, data: { ...data, netCents: slip.grossCents + bonus - deduction } });
  audit(req, 'payslip.update', 'Payslip', slip.id, data);
  res.json({ payslip: updated });
}));

router.get('/leave', allow(...HR), h(async (_req, res) => {
  res.json({ requests: await db.leaveRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { employee: { select: { code: true, firstName: true, lastName: true } } } }) });
}));

router.post('/leave', allow(...HR), h(async (req, res) => {
  const data = z.object({ employeeId: z.string(), kind: z.enum(['ANNUAL', 'SICK', 'MATERNITY', 'SPECIAL', 'UNPAID']), startsOn: z.coerce.date(), endsOn: z.coerce.date(), reason: z.string().max(255).optional() }).parse(req.body);
  if (data.endsOn < data.startsOn) throw badRequest('Leave cannot end before it starts.');
  res.status(201).json({ request: await db.leaveRequest.create({ data }) });
}));

router.post('/leave/:id/decide', allow(...HR), h(async (req, res) => {
  const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
  const updated = await db.leaveRequest.updateMany({ where: { id: req.params.id, status: 'PENDING' }, data: { status: approve ? 'APPROVED' : 'DECLINED' } });
  if (!updated.count) throw conflict('This request has already been decided.');
  audit(req, approve ? 'leave.approve' : 'leave.decline', 'LeaveRequest', req.params.id);
  res.json({ ok: true });
}));

// ─── Inventory ────────────────────────────────────────────────────────────────

router.get('/stock', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query, 50);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {};
  const [items, total, all] = await Promise.all([
    db.stockItem.findMany({ where, skip: p.skip, take: p.take, orderBy: { name: 'asc' } }),
    db.stockItem.count({ where }),
    db.stockItem.findMany({ select: { onHand: true, minLevel: true, unitCents: true } }),
  ]);
  res.json({
    ...listOf(items, total, p),
    lowCount: all.filter((i) => i.onHand <= i.minLevel).length,
    valueCents: all.reduce((s, i) => s + i.onHand * i.unitCents, 0),
  });
}));

router.post('/stock', allow(...STORES), h(async (req, res) => {
  const data = z.object({
    sku: z.string().trim().min(2).max(40), name: z.string().trim().min(2).max(160), category: z.nativeEnum(StockCategory), unit: z.string().trim().min(1).max(20),
    onHand: z.number().int().nonnegative().default(0), minLevel: z.number().int().nonnegative().default(0), unitCents: z.number().int().nonnegative(), supplier: z.string().max(120).optional(),
  }).parse(req.body);
  const item = await db.stockItem.create({ data });
  audit(req, 'stock.create', 'StockItem', item.id);
  res.status(201).json({ item });
}));

router.post('/stock/:id/movements', allow(...STORES), h(async (req, res) => {
  const { kind, quantity, reason } = z.object({ kind: z.nativeEnum(MovementKind), quantity: z.number().int().refine((n) => n !== 0), reason: z.string().trim().min(2).max(255) }).parse(req.body);
  const delta = kind === 'ISSUE' ? -Math.abs(quantity) : kind === 'ADJUSTMENT' ? quantity : Math.abs(quantity);
  const item = await db.$transaction(async (tx) => {
    const current = await tx.stockItem.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound('Item not found.');
    if (current.onHand + delta < 0) throw badRequest(`Only ${current.onHand} ${current.unit} in stock.`);
    await tx.stockMovement.create({ data: { itemId: current.id, kind, quantity: delta, reason, staffId: req.staff!.id } });
    return tx.stockItem.update({ where: { id: current.id }, data: { onHand: { increment: delta } } });
  });
  audit(req, 'stock.move', 'StockItem', item.id, { kind, delta });
  res.status(201).json({ item });
}));

router.get('/stock/:id/movements', allow(...OFFICE), h(async (req, res) => {
  res.json({ movements: await db.stockMovement.findMany({ where: { itemId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 50 }) });
}));

// ─── Administration ───────────────────────────────────────────────────────────

router.get('/settings', allow(...OFFICE), h(async (_req, res) => {
  res.json({ settings: await getSettings() });
}));

router.put('/settings', allow('COMMERCIAL_MANAGER'), h(async (req, res) => {
  const body = z.record(z.number().int().nonnegative()).parse(req.body);
  const entries = Object.entries(body).filter(([k]) => k in SETTING_DEFAULTS) as [SettingKey, number][];
  await db.$transaction(entries.map(([key, v]) => db.setting.upsert({ where: { key }, create: { key, value: String(v) }, update: { value: String(v) } })));
  audit(req, 'settings.update', 'Setting', undefined, body);
  res.json({ settings: await getSettings() });
}));

router.get('/branches', allow(...OFFICE), h(async (_req, res) => {
  res.json({ branches: await db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }), zones: await db.zone.findMany({ select: { id: true, name: true } }) });
}));

const member = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()), fullName: z.string().trim().min(2).max(120), phone: z.string().max(30).optional(),
  role: z.nativeEnum(StaffRole), trade: z.nativeEnum(AgentTrade).nullable().optional(), branchId: z.string().nullable().optional(),
});
const adminOnly = allow();

router.get('/team', adminOnly, h(async (_req, res) => {
  res.json({
    team: await db.staff.findMany({
      orderBy: { fullName: 'asc' },
      select: { id: true, email: true, fullName: true, phone: true, role: true, trade: true, isActive: true, lastLoginAt: true, branch: { select: { name: true } } },
    }),
  });
}));

router.post('/team', adminOnly, h(async (req, res) => {
  const { password, ...data } = member.extend({ password: z.string().min(10, 'Use at least 10 characters.') }).parse(req.body);
  const created = await db.staff.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) } });
  audit(req, 'staff.create', 'Staff', created.id, { role: created.role });
  res.status(201).json({ id: created.id });
}));

router.patch('/team/:id', adminOnly, h(async (req, res) => {
  const data = member.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
  if (req.params.id === req.staff!.id && (data.isActive === false || (data.role && data.role !== 'ADMIN'))) throw badRequest('You cannot remove your own admin access.');
  await db.staff.update({ where: { id: req.params.id }, data });
  if (data.isActive === false) await db.refreshSession.deleteMany({ where: { staffId: req.params.id } });
  audit(req, 'staff.update', 'Staff', req.params.id, Object.keys(data));
  res.json({ ok: true });
}));

router.get('/audit', allow('AUDITOR'), h(async (req, res) => {
  const p = paging(req.query, 50);
  const where = typeof req.query.entity === 'string' && req.query.entity ? { entity: req.query.entity } : {};
  const [items, total] = await Promise.all([
    db.auditEntry.findMany({ where, skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' }, include: { staff: { select: { fullName: true, role: true } } } }),
    db.auditEntry.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.get('/notifications', h(async (req, res) => {
  const where = { staffId: req.staff!.id };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 40 }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  res.json({ items, unread });
}));

router.post('/notifications/read', h(async (req, res) => {
  await db.notification.updateMany({ where: { staffId: req.staff!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

export default router;
