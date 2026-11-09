import { Router } from 'express';
import { z } from 'zod';
import {
  AlertStatus, Condition, DetectionSource, EquipmentStatus, IllegalStatus, LeakStatus, OutageKind, OutageStatus,
  PipeTier, Priority, RiskLevel, Severity, TicketStatus, WorkKind, WorkStatus,
} from '@prisma/client';
import { allow, COMMERCIAL, OFFICE, TECHNICAL } from '../../lib/auth';
import { db } from '../../lib/db';
import { conflict, h, listOf, notFound, paging, reference } from '../../lib/http';
import { toCustomer, toStaffMember } from '../../lib/realtime';
import { audit } from '../../domain/audit';
import { notifyCustomer, notifyStaff } from '../../domain/notify';

const router = Router();
const SUPPORT = [...COMMERCIAL, 'COLLECTIONS_OFFICER', 'BRANCH_MANAGER'] as const;

// ─── Support tickets ──────────────────────────────────────────────────────────

router.get('/tickets', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const where = req.query.status ? { status: z.nativeEnum(TicketStatus).parse(req.query.status) } : {};
  const [items, total] = await Promise.all([
    db.ticket.findMany({
      where, skip: p.skip, take: p.take, orderBy: [{ slaDueAt: 'asc' }],
      include: { customer: { select: { accountNumber: true, firstName: true, lastName: true } }, assignee: { select: { fullName: true } } },
    }),
    db.ticket.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.get('/tickets/:id', allow(...OFFICE), h(async (req, res) => {
  const ticket = await db.ticket.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } }, customer: { select: { id: true, accountNumber: true, firstName: true, lastName: true, phone: true } }, invoice: true, assignee: { select: { id: true, fullName: true } } },
  });
  if (!ticket) throw notFound('Ticket not found.');
  res.json({ ticket });
}));

router.post('/tickets/:id/messages', allow(...SUPPORT), h(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const ticket = await db.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw notFound('Ticket not found.');
  const message = await db.ticketMessage.create({ data: { ticketId: ticket.id, fromStaff: true, authorName: req.staff!.fullName, body } });
  await db.ticket.update({
    where: { id: ticket.id },
    data: { status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : undefined, assigneeId: ticket.assigneeId ?? req.staff!.id },
  });
  toCustomer(ticket.customerId, 'ticket:message', { ticketId: ticket.id });
  await notifyCustomer(ticket.customerId, { title: `Reply on ${ticket.number}`, body: 'Our team replied to your support ticket.', kind: 'ticket', link: `/portal/support/${ticket.id}` });
  res.status(201).json({ message });
}));

router.patch('/tickets/:id', allow(...SUPPORT), h(async (req, res) => {
  const data = z.object({
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(Priority).optional(),
    assigneeId: z.string().nullable().optional(),
    resolution: z.string().max(4000).optional(),
  }).parse(req.body);
  const before = await db.ticket.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound('Ticket not found.');
  const finishing = data.status === 'RESOLVED' || data.status === 'REJECTED';
  await db.ticket.update({ where: { id: before.id }, data: { ...data, resolvedAt: finishing ? new Date() : undefined } });

  // Closing a dispute releases the bill back to normal collection.
  if (finishing && before.topic === 'BILL_DISPUTE' && before.invoiceId) {
    await db.invoice.updateMany({ where: { id: before.invoiceId, status: 'DISPUTED' }, data: { status: 'ISSUED' } });
  }
  if (finishing) {
    await notifyCustomer(before.customerId, { title: `Ticket ${before.number} ${data.status === 'RESOLVED' ? 'resolved' : 'closed'}`, body: data.resolution ?? 'Your ticket has been updated.', kind: 'ticket', link: `/portal/support/${before.id}`, sms: 'optional' });
  }
  audit(req, 'ticket.update', 'Ticket', before.id, data);
  res.json({ ok: true });
}));

// ─── Alerts ───────────────────────────────────────────────────────────────────

router.get('/alerts', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const where = {
    ...(req.query.status ? { status: z.nativeEnum(AlertStatus).parse(req.query.status) } : {}),
    ...(req.query.severity ? { severity: z.nativeEnum(Severity).parse(req.query.severity) } : {}),
  };
  const [items, total] = await Promise.all([
    db.alert.findMany({ where, skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { accountNumber: true, firstName: true, lastName: true } }, meter: { select: { serial: true } } } }),
    db.alert.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.patch('/alerts/:id', allow(...OFFICE), h(async (req, res) => {
  const { status, resolution } = z.object({ status: z.enum(['IN_PROGRESS', 'RESOLVED', 'DISMISSED']), resolution: z.string().max(2000).optional() }).parse(req.body);
  const alert = await db.alert.update({
    where: { id: req.params.id },
    data: {
      status, resolution,
      ...(status === 'IN_PROGRESS' ? { ackAt: new Date(), assigneeId: req.staff!.id } : { resolvedAt: new Date() }),
    },
  });
  audit(req, 'alert.update', 'Alert', alert.id, { status });
  res.json({ alert });
}));

// ─── Network ──────────────────────────────────────────────────────────────────

router.get('/network', allow(...OFFICE), h(async (_req, res) => {
  const since = new Date(Date.now() - 864e5);
  const [branches, zones, pipelines, stations] = await Promise.all([
    db.branch.findMany({ where: { isActive: true }, include: { _count: { select: { zones: true, pipelines: true, stations: true, staff: true } } } }),
    db.zone.findMany({ include: { branch: { select: { name: true } }, _count: { select: { customers: true } } }, orderBy: { name: 'asc' } }),
    db.pipeline.findMany({ include: { branch: { select: { name: true } }, _count: { select: { leaks: true } } }, orderBy: { code: 'asc' } }),
    db.pumpStation.findMany({ include: { branch: { select: { name: true } }, readings: { where: { recordedAt: { gte: since } }, orderBy: { recordedAt: 'desc' }, take: 24 } }, orderBy: { name: 'asc' } }),
  ]);
  res.json({ branches, zones, pipelines, stations });
}));

router.post('/network/branches', allow('TECHNICAL_MANAGER'), h(async (req, res) => {
  const data = z.object({
    code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(120), city: z.string().trim().min(1).max(100), region: z.string().trim().min(1).max(100),
    lat: z.number(), lng: z.number(), capacityM3: z.number().int().nonnegative().default(0),
  }).parse(req.body);
  const branch = await db.branch.create({ data });
  audit(req, 'branch.create', 'Branch', branch.id);
  res.status(201).json({ branch });
}));

router.post('/network/zones', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({ branchId: z.string(), code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(120), population: z.number().int().optional(), risk: z.nativeEnum(RiskLevel).default('LOW') }).parse(req.body);
  res.status(201).json({ zone: await db.zone.create({ data }) });
}));

router.post('/network/pipelines', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({
    branchId: z.string(), code: z.string().trim().min(2).max(20), tier: z.nativeEnum(PipeTier), material: z.string().trim().min(2).max(60),
    diameterMm: z.number().int().positive(), lengthM: z.number().int().positive(), installedYear: z.number().int().optional(), condition: z.nativeEnum(Condition).default('GOOD'),
  }).parse(req.body);
  res.status(201).json({ pipeline: await db.pipeline.create({ data }) });
}));

router.patch('/network/stations/:id', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({ status: z.nativeEnum(EquipmentStatus).optional(), lastServiceAt: z.coerce.date().optional(), nextServiceAt: z.coerce.date().optional() }).parse(req.body);
  const station = await db.pumpStation.update({ where: { id: req.params.id }, data });
  audit(req, 'station.update', 'PumpStation', station.id, data);
  res.json({ station });
}));

router.post('/network/stations/:id/readings', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({
    recordedAt: z.coerce.date().optional(), producedM3: z.number().int().nonnegative(), pressureBar: z.number().nonnegative(),
    reservoirPct: z.number().min(0).max(100).optional(), energyKwh: z.number().optional(), ph: z.number().min(0).max(14).optional(), turbidity: z.number().nonnegative().optional(),
  }).parse(req.body);
  res.status(201).json({ reading: await db.stationReading.create({ data: { ...data, stationId: req.params.id, recordedAt: data.recordedAt ?? new Date() } }) });
}));

// ─── Leaks and illegal connections ────────────────────────────────────────────

router.get('/leaks', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const where = req.query.status ? { status: z.nativeEnum(LeakStatus).parse(req.query.status) } : {};
  const [items, total] = await Promise.all([
    db.leak.findMany({ where, skip: p.skip, take: p.take, orderBy: { reportedAt: 'desc' }, include: { pipeline: { select: { code: true } }, workOrder: { select: { number: true, status: true } } } }),
    db.leak.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.post('/leaks', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({
    address: z.string().trim().min(3).max(255), pipelineId: z.string().optional(), source: z.nativeEnum(DetectionSource).default('INSPECTION'),
    priority: z.nativeEnum(Priority).default('HIGH'), lossM3H: z.number().nonnegative().optional(), description: z.string().max(2000).optional(), lat: z.number().optional(), lng: z.number().optional(),
  }).parse(req.body);
  res.status(201).json({ leak: await db.leak.create({ data }) });
}));

router.patch('/leaks/:id', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({ status: z.nativeEnum(LeakStatus).optional(), priority: z.nativeEnum(Priority).optional(), lossM3H: z.number().nonnegative().optional(), pipelineId: z.string().optional() }).parse(req.body);
  const leak = await db.leak.update({ where: { id: req.params.id }, data: { ...data, repairedAt: data.status === 'REPAIRED' ? new Date() : undefined } });
  audit(req, 'leak.update', 'Leak', leak.id, data);
  res.json({ leak });
}));

router.post('/leaks/:id/dispatch', allow(...TECHNICAL), h(async (req, res) => {
  const { assigneeId } = z.object({ assigneeId: z.string().optional() }).parse(req.body);
  const leak = await db.leak.findUnique({ where: { id: req.params.id } });
  if (!leak) throw notFound('Leak not found.');
  if (leak.workOrderId) throw conflict('A repair job already exists for this leak.');
  const order = await db.workOrder.create({
    data: {
      number: reference('WO'), kind: 'LEAK_REPAIR', priority: leak.priority, address: leak.address, lat: leak.lat, lng: leak.lng,
      description: leak.description ?? `Repair leak at ${leak.address}`, assigneeId, status: assigneeId ? 'ASSIGNED' : 'OPEN',
    },
  });
  await db.leak.update({ where: { id: leak.id }, data: { workOrderId: order.id, status: 'IN_REPAIR' } });
  if (assigneeId) await announceJob(assigneeId, order.id, order.number, order.address);
  audit(req, 'leak.dispatch', 'Leak', leak.id, { workOrder: order.number });
  res.status(201).json({ workOrder: order });
}));

const illegal = z.object({
  address: z.string().trim().min(3).max(255), zoneId: z.string().optional(), source: z.nativeEnum(DetectionSource).default('INSPECTION'),
  lossM3H: z.number().nonnegative().optional(), estimatedLossCents: z.number().int().nonnegative().optional(), notes: z.string().max(4000).optional(),
  lat: z.number().optional(), lng: z.number().optional(),
});

router.get('/illegal-connections', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const where = req.query.status ? { status: z.nativeEnum(IllegalStatus).parse(req.query.status) } : {};
  const [items, total] = await Promise.all([
    db.illegalConnection.findMany({ where, skip: p.skip, take: p.take, orderBy: { detectedAt: 'desc' } }),
    db.illegalConnection.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.post('/illegal-connections', allow(...TECHNICAL), h(async (req, res) => {
  const found = await db.illegalConnection.create({ data: { ...illegal.parse(req.body), reportedById: req.staff!.id } });
  audit(req, 'illegal.create', 'IllegalConnection', found.id);
  res.status(201).json({ connection: found });
}));

router.patch('/illegal-connections/:id', allow(...TECHNICAL), h(async (req, res) => {
  const data = illegal.partial().extend({ status: z.nativeEnum(IllegalStatus).optional(), caseFile: z.string().max(120).optional() }).parse(req.body);
  const closing = data.status === 'REGULARIZED';
  const found = await db.illegalConnection.update({ where: { id: req.params.id }, data: { ...data, resolvedAt: closing ? new Date() : undefined } });
  audit(req, 'illegal.update', 'IllegalConnection', found.id, { status: data.status ?? null });
  res.json({ connection: found });
}));

// ─── Outage notices ───────────────────────────────────────────────────────────

router.get('/outages', allow(...OFFICE), h(async (_req, res) => {
  res.json({ outages: await db.outage.findMany({ orderBy: { startsAt: 'desc' }, take: 100, include: { zone: { select: { name: true } } } }) });
}));

router.post('/outages', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({
    zoneId: z.string().nullable().optional(), kind: z.nativeEnum(OutageKind), title: z.string().trim().min(3).max(160), message: z.string().trim().min(3).max(1000),
    startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable().optional(),
  }).parse(req.body);
  const outage = await db.outage.create({ data: { ...data, createdById: req.staff!.id, status: data.startsAt <= new Date() ? 'ACTIVE' : 'SCHEDULED' } });

  const customers = await db.customer.findMany({ where: { status: 'ACTIVE', ...(data.zoneId ? { zoneId: data.zoneId } : {}) }, select: { id: true } });
  // Reply first; a large zone can take a while to text.
  res.status(201).json({ outage, customersNotified: customers.length });
  audit(req, 'outage.create', 'Outage', outage.id, { customers: customers.length });
  for (const c of customers) {
    await notifyCustomer(c.id, { title: data.title, body: data.message, kind: 'outage', link: '/portal/outages', sms: data.kind === 'PLANNED' ? 'optional' : 'always' });
  }
}));

router.patch('/outages/:id', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({ status: z.nativeEnum(OutageStatus).optional(), endsAt: z.coerce.date().nullable().optional(), message: z.string().max(1000).optional() }).parse(req.body);
  res.json({ outage: await db.outage.update({ where: { id: req.params.id }, data }) });
}));

// ─── Work orders ──────────────────────────────────────────────────────────────

async function announceJob(staffId: string, id: string, number: string, address: string) {
  toStaffMember(staffId, 'job:assigned', { id, number });
  await notifyStaff(staffId, { title: `New job ${number}`, body: address, kind: 'job', link: '/field' });
}

router.get('/agents', allow(...OFFICE), h(async (_req, res) => {
  const agents = await db.staff.findMany({
    where: { role: 'FIELD_AGENT', isActive: true },
    select: {
      id: true, fullName: true, phone: true, trade: true, lastLat: true, lastLng: true, lastSeenAt: true,
      branch: { select: { name: true } },
      _count: { select: { workOrders: { where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'] } } } } },
    },
    orderBy: { fullName: 'asc' },
  });
  res.json({ agents });
}));

router.get('/work-orders', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const where = {
    ...(req.query.status ? { status: z.nativeEnum(WorkStatus).parse(req.query.status) } : {}),
    ...(req.query.kind ? { kind: z.nativeEnum(WorkKind).parse(req.query.kind) } : {}),
  };
  const [items, total] = await Promise.all([
    db.workOrder.findMany({ where, skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' }, include: { assignee: { select: { fullName: true } }, customer: { select: { accountNumber: true } } } }),
    db.workOrder.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.post('/work-orders', allow(...TECHNICAL, 'COMMERCIAL_MANAGER'), h(async (req, res) => {
  const data = z.object({
    kind: z.nativeEnum(WorkKind), priority: z.nativeEnum(Priority).default('NORMAL'), assigneeId: z.string().optional(), address: z.string().trim().min(3).max(255),
    description: z.string().trim().min(3).max(4000), scheduledFor: z.coerce.date().optional(), lat: z.number().optional(), lng: z.number().optional(),
  }).parse(req.body);
  const order = await db.workOrder.create({ data: { ...data, number: reference('WO'), status: data.assigneeId ? 'ASSIGNED' : 'OPEN' } });
  if (data.assigneeId) await announceJob(data.assigneeId, order.id, order.number, order.address);
  audit(req, 'work.create', 'WorkOrder', order.id);
  res.status(201).json({ workOrder: order });
}));

router.post('/work-orders/:id/assign', allow(...TECHNICAL, 'COMMERCIAL_MANAGER', 'COLLECTIONS_OFFICER'), h(async (req, res) => {
  const { assigneeId } = z.object({ assigneeId: z.string() }).parse(req.body);
  const agent = await db.staff.findFirst({ where: { id: assigneeId, role: 'FIELD_AGENT', isActive: true } });
  if (!agent) throw notFound('Field agent not found.');
  const updated = await db.workOrder.updateMany({ where: { id: req.params.id, status: { in: ['OPEN', 'ASSIGNED'] } }, data: { assigneeId, status: 'ASSIGNED' } });
  if (!updated.count) throw conflict('This job can no longer be reassigned.');
  const order = await db.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
  await announceJob(assigneeId, order.id, order.number, order.address);
  audit(req, 'work.assign', 'WorkOrder', order.id, { assigneeId });
  res.json({ workOrder: order });
}));

router.post('/work-orders/:id/cancel', allow(...TECHNICAL, 'COMMERCIAL_MANAGER'), h(async (req, res) => {
  const updated = await db.workOrder.updateMany({ where: { id: req.params.id, status: { notIn: ['DONE', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
  if (!updated.count) throw conflict('This job is already finished.');
  audit(req, 'work.cancel', 'WorkOrder', req.params.id);
  res.json({ ok: true });
}));

export default router;
