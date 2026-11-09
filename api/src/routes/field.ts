import { Router } from 'express';
import { z } from 'zod';
import { allow, requireStaff } from '../lib/auth';
import { db } from '../lib/db';
import { conflict, h, notFound, periodOf } from '../lib/http';
import { toStaff } from '../lib/realtime';
import { notifyCustomer } from '../domain/notify';
import { recordReading } from '../domain/readings';

/** The mobile app used by meter readers and technicians. */
const router = Router();
router.use(requireStaff, allow('FIELD_AGENT', 'BRANCH_MANAGER'));

const job = (id: string, staffId: string) => db.workOrder.findFirst({ where: { id, assigneeId: staffId } });

router.get('/jobs', h(async (req, res) => {
  const jobs = await db.workOrder.findMany({
    where: { assigneeId: req.staff!.id, status: { in: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'] } },
    include: { customer: { select: { accountNumber: true, firstName: true, lastName: true, phone: true } } },
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ jobs });
}));

router.get('/jobs/history', h(async (req, res) => {
  res.json({
    jobs: await db.workOrder.findMany({ where: { assigneeId: req.staff!.id, status: 'DONE' }, orderBy: { finishedAt: 'desc' }, take: 50 }),
  });
}));

const STEPS = {
  accept: { from: 'ASSIGNED', to: 'ACCEPTED' },
  start: { from: 'ACCEPTED', to: 'IN_PROGRESS' },
} as const;

router.post('/jobs/:id/:step(accept|start)', h(async (req, res) => {
  const step = STEPS[req.params.step as keyof typeof STEPS];
  const updated = await db.workOrder.updateMany({
    where: { id: req.params.id, assigneeId: req.staff!.id, status: step.from },
    data: { status: step.to, startedAt: step.to === 'IN_PROGRESS' ? new Date() : undefined },
  });
  if (!updated.count) throw conflict('This job cannot move to that step.');
  res.json({ status: step.to });
}));

router.post('/jobs/:id/complete', h(async (req, res) => {
  const { report, parts } = z.object({
    report: z.string().trim().min(3).max(4000),
    parts: z.array(z.object({ itemId: z.string(), quantity: z.number().int().positive() })).optional(),
  }).parse(req.body);
  const order = await job(req.params.id, req.staff!.id);
  if (!order) throw notFound('Job not found.');
  if (order.status !== 'IN_PROGRESS') throw conflict('Start the job before completing it.');

  await db.$transaction(async (tx) => {
    await tx.workOrder.update({ where: { id: order.id }, data: { status: 'DONE', finishedAt: new Date(), report } });
    for (const part of parts ?? []) {
      await tx.stockItem.update({ where: { id: part.itemId }, data: { onHand: { decrement: part.quantity } } });
      await tx.stockMovement.create({ data: { itemId: part.itemId, kind: 'ISSUE', quantity: part.quantity, reason: `Used on ${order.number}`, workOrderId: order.id, staffId: req.staff!.id } });
    }
    if (order.kind === 'LEAK_REPAIR') {
      await tx.leak.updateMany({ where: { workOrderId: order.id }, data: { status: 'REPAIRED', repairedAt: new Date() } });
    }
    if (order.customerId && order.kind === 'DISCONNECTION') {
      await tx.customer.update({ where: { id: order.customerId }, data: { status: 'DISCONNECTED' } });
    }
    if (order.customerId && order.kind === 'RECONNECTION') {
      await tx.customer.update({ where: { id: order.customerId }, data: { status: 'ACTIVE' } });
    }
  });

  if (order.customerId && order.kind === 'RECONNECTION') {
    await notifyCustomer(order.customerId, { title: 'Your water is back on', body: 'Your supply has been restored.', kind: 'disconnection', sms: 'always' });
  }
  if (order.customerId && order.kind === 'DISCONNECTION') {
    await notifyCustomer(order.customerId, { title: 'Supply disconnected', body: 'Your supply was disconnected for non-payment. Clear your balance to restore it.', kind: 'disconnection', sms: 'always' });
  }
  toStaff('job:done', { id: order.id, number: order.number });
  res.json({ status: 'DONE' });
}));

// Meters in the agent's branch that still need a reading this month.
router.get('/route', h(async (req, res) => {
  const [y, m] = periodOf(new Date()).split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const meters = await db.meter.findMany({
    where: {
      kind: { not: 'SMART' },
      status: 'ACTIVE',
      customerId: { not: null },
      customer: { status: 'ACTIVE', zone: req.staff!.branchId ? { branchId: req.staff!.branchId } : undefined },
      readings: { none: { readAt: { gte: start }, status: { not: 'REJECTED' } } },
    },
    include: { customer: { select: { accountNumber: true, firstName: true, lastName: true, addressLine: true, neighborhood: true } } },
    orderBy: { customer: { neighborhood: 'asc' } },
    take: 100,
  });
  res.json({ meters });
}));

router.post('/readings', h(async (req, res) => {
  const input = z.object({
    meterId: z.string(),
    totalLitres: z.number().int().nonnegative(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    photoUrl: z.string().url().max(500).optional(),
  }).parse(req.body);
  const meter = await db.meter.findUnique({ where: { id: input.meterId } });
  if (!meter) throw notFound('Meter not found.');
  const reading = await recordReading({ ...input, meter, source: 'FIELD_AGENT', agentId: req.staff!.id });
  res.status(201).json({ reading });
}));

router.post('/position', h(async (req, res) => {
  const { lat, lng } = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);
  await db.staff.update({ where: { id: req.staff!.id }, data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() } });
  toStaff('agent:position', { staffId: req.staff!.id, lat, lng });
  res.json({ ok: true });
}));

const report = z.object({
  address: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.post('/leaks', h(async (req, res) => {
  const leak = await db.leak.create({ data: { ...report.parse(req.body), source: 'FIELD_AGENT' } });
  toStaff('leak:new', { id: leak.id, address: leak.address });
  res.status(201).json({ id: leak.id });
}));

router.post('/illegal-connections', h(async (req, res) => {
  const { description, ...rest } = report.parse(req.body);
  const found = await db.illegalConnection.create({ data: { ...rest, notes: description, source: 'FIELD_AGENT', reportedById: req.staff!.id } });
  res.status(201).json({ id: found.id });
}));

export default router;
