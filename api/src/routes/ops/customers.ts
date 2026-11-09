import { Router } from 'express';
import { z } from 'zod';
import { AccountStatus, CustomerType, MeterKind, MeterLink, MeterStatus, ReviewStatus, TariffClass } from '@prisma/client';
import { allow, COLLECTIONS, COMMERCIAL, OFFICE, TECHNICAL } from '../../lib/auth';
import { db } from '../../lib/db';
import { badRequest, conflict, h, listOf, notFound, paging, reference } from '../../lib/http';
import { audit } from '../../domain/audit';
import { notifyCustomer } from '../../domain/notify';
import { recordReading, reviewReading } from '../../domain/readings';
import { sendSms } from '../../domain/sms';
import { issueCode, newAccountNumber } from '../auth';

const router = Router();

const details = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(30),
  email: z.string().email().nullable().optional(),
  type: z.nativeEnum(CustomerType),
  tariffClass: z.nativeEnum(TariffClass),
  addressLine: z.string().trim().min(3).max(255),
  neighborhood: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  zoneId: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

router.get('/customers', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = {
    ...(req.query.status ? { status: z.nativeEnum(AccountStatus).parse(req.query.status) } : {}),
    ...(req.query.review ? { review: z.nativeEnum(ReviewStatus).parse(req.query.review) } : {}),
    ...(q ? { OR: [{ accountNumber: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }, { phone: { contains: q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.customer.findMany({
      where, skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' },
      select: {
        id: true, accountNumber: true, firstName: true, lastName: true, phone: true, type: true, tariffClass: true, status: true, review: true,
        selfRegistered: true, addressLine: true, neighborhood: true, district: true, city: true, creditCents: true, createdAt: true,
        zone: { select: { name: true } }, meter: { select: { serial: true, status: true } },
      },
    }),
    db.customer.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.post('/customers', allow(...COMMERCIAL), h(async (req, res) => {
  const input = details.parse(req.body);
  const customer = await db.customer.create({
    data: { ...input, accountNumber: newAccountNumber(), status: 'ACTIVE', review: 'APPROVED', reviewedById: req.staff!.id, reviewedAt: new Date() },
  });
  const code = await issueCode(customer.id, 'first-login');
  await sendSms(customer.phone, `WaterBill: welcome. Account ${customer.accountNumber}, one-time code ${code}.`);
  audit(req, 'customer.create', 'Customer', customer.id);
  // The clerk may need to hand this over in person if the phone cannot receive SMS.
  res.status(201).json({ customer, oneTimeCode: code });
}));

router.get('/customers/:id', allow(...OFFICE), h(async (req, res) => {
  const customer = await db.customer.findUnique({
    where: { id: req.params.id },
    include: {
      meter: true,
      zone: true,
      invoices: { orderBy: { period: 'desc' }, take: 12 },
      payments: { orderBy: { initiatedAt: 'desc' }, take: 12 },
      tickets: { orderBy: { createdAt: 'desc' }, take: 10 },
      plans: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!customer) throw notFound('Customer not found.');
  const { pinHash: _pin, ...safe } = customer;
  res.json({ customer: safe });
}));

router.patch('/customers/:id', allow(...COMMERCIAL), h(async (req, res) => {
  const data = details.partial().parse(req.body);
  const customer = await db.customer.update({ where: { id: req.params.id }, data });
  audit(req, 'customer.update', 'Customer', customer.id, Object.keys(data));
  res.json({ customer: { id: customer.id } });
}));

router.post('/customers/:id/approve', allow('COMMERCIAL_MANAGER', 'BRANCH_MANAGER'), h(async (req, res) => {
  const checks = z.object({
    meterVerified: z.boolean(), identityVerified: z.boolean(), addressVerified: z.boolean(), documentsProvided: z.boolean(), comment: z.string().max(500).optional(),
  }).parse(req.body);
  if (!checks.identityVerified || !checks.addressVerified) throw badRequest('Identity and address must be verified before approval.');
  const updated = await db.customer.updateMany({
    where: { id: req.params.id, review: 'PENDING' },
    data: { review: 'APPROVED', status: 'ACTIVE', reviewNotes: checks, reviewedById: req.staff!.id, reviewedAt: new Date() },
  });
  if (!updated.count) throw conflict('This application has already been reviewed.');
  await notifyCustomer(req.params.id, { title: 'Your account is approved', body: 'Your WaterBill account is now active.', kind: 'account', sms: 'always' });
  audit(req, 'customer.approve', 'Customer', req.params.id);
  res.json({ ok: true });
}));

router.post('/customers/:id/reject', allow('COMMERCIAL_MANAGER', 'BRANCH_MANAGER'), h(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  const updated = await db.customer.updateMany({
    where: { id: req.params.id, review: 'PENDING' },
    data: { review: 'REJECTED', status: 'CLOSED', reviewNotes: { reason }, reviewedById: req.staff!.id, reviewedAt: new Date() },
  });
  if (!updated.count) throw conflict('This application has already been reviewed.');
  await notifyCustomer(req.params.id, { title: 'Application declined', body: `Your application was declined: ${reason}`, kind: 'account', sms: 'always' });
  audit(req, 'customer.reject', 'Customer', req.params.id, { reason });
  res.json({ ok: true });
}));

const serviceJob = (kind: 'DISCONNECTION' | 'RECONNECTION') => h(async (req, res) => {
  const customer = await db.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw notFound('Customer not found.');
  const open = await db.workOrder.count({ where: { customerId: customer.id, kind, status: { notIn: ['DONE', 'CANCELLED'] } } });
  if (open) throw conflict('A job of this type is already open for this customer.');
  const order = await db.workOrder.create({
    data: {
      number: reference('WO'), kind, customerId: customer.id, address: customer.addressLine, lat: customer.lat, lng: customer.lng,
      description: `${kind === 'DISCONNECTION' ? 'Disconnect' : 'Reconnect'} account ${customer.accountNumber}. Requested by ${req.staff!.fullName}.`,
    },
  });
  audit(req, `customer.${kind.toLowerCase()}`, 'Customer', customer.id);
  res.status(201).json({ workOrder: order });
});

router.post('/customers/:id/disconnect', allow(...COLLECTIONS), serviceJob('DISCONNECTION'));
router.post('/customers/:id/reconnect', allow(...COLLECTIONS), serviceJob('RECONNECTION'));

router.post('/customers/:id/reset-pin', allow(...COMMERCIAL), h(async (req, res) => {
  const customer = await db.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw notFound('Customer not found.');
  const code = await issueCode(customer.id, 'pin-reset');
  await sendSms(customer.phone, `WaterBill: your PIN reset code is ${code}.`);
  audit(req, 'customer.reset-pin', 'Customer', customer.id);
  res.json({ oneTimeCode: code });
}));

// ─── Meters ───────────────────────────────────────────────────────────────────

const meterInput = z.object({
  serial: z.string().trim().min(3).max(60),
  customerId: z.string().nullable().optional(),
  kind: z.nativeEnum(MeterKind),
  link: z.nativeEnum(MeterLink).default('MANUAL'),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  diameterMm: z.number().int().positive().default(15),
  installedAt: z.coerce.date(),
  calibrationDueAt: z.coerce.date().nullable().optional(),
  initialLitres: z.number().int().nonnegative().default(0),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

router.get('/meters', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = {
    ...(req.query.status ? { status: z.nativeEnum(MeterStatus).parse(req.query.status) } : {}),
    ...(q ? { OR: [{ serial: { contains: q } }, { customer: { accountNumber: { contains: q } } }, { customer: { lastName: { contains: q } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.meter.findMany({ where, skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' }, include: { customer: { select: { accountNumber: true, firstName: true, lastName: true } } } }),
    db.meter.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.post('/meters', allow(...TECHNICAL), h(async (req, res) => {
  const { accountNumber, ...input } = meterInput.extend({ accountNumber: z.string().trim().optional() }).parse(req.body);
  let customerId = input.customerId ?? null;
  if (accountNumber) {
    const owner = await db.customer.findUnique({ where: { accountNumber: accountNumber.toUpperCase() }, include: { meter: { select: { id: true } } } });
    if (!owner) throw notFound('No customer has that account number.');
    if (owner.meter) throw conflict('That customer already has a meter.');
    customerId = owner.id;
  }
  const meter = await db.meter.create({ data: { ...input, customerId, lastLitres: input.initialLitres } });
  audit(req, 'meter.create', 'Meter', meter.id);
  res.status(201).json({ meter });
}));

router.patch('/meters/:id', allow(...TECHNICAL), h(async (req, res) => {
  const data = z.object({ status: z.nativeEnum(MeterStatus).optional(), customerId: z.string().nullable().optional(), calibratedAt: z.coerce.date().optional(), calibrationDueAt: z.coerce.date().optional() }).parse(req.body);
  const meter = await db.meter.update({ where: { id: req.params.id }, data });
  audit(req, 'meter.update', 'Meter', meter.id, Object.keys(data));
  res.json({ meter });
}));

router.get('/meters/:id', allow(...OFFICE), h(async (req, res) => {
  const meter = await db.meter.findUnique({
    where: { id: req.params.id },
    include: { customer: true, readings: { orderBy: { readAt: 'desc' }, take: 30 }, alerts: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!meter) throw notFound('Meter not found.');
  if (meter.customer) meter.customer.pinHash = null;
  res.json({ meter });
}));

router.post('/meters/:id/readings', allow(...COMMERCIAL, ...TECHNICAL), h(async (req, res) => {
  const { totalLitres, readAt } = z.object({ totalLitres: z.number().int().nonnegative(), readAt: z.coerce.date().optional() }).parse(req.body);
  const meter = await db.meter.findUnique({ where: { id: req.params.id } });
  if (!meter) throw notFound('Meter not found.');
  const reading = await recordReading({ meter, totalLitres, readAt, source: 'FIELD_AGENT', agentId: req.staff!.id });
  audit(req, 'reading.manual', 'Meter', meter.id, { totalLitres });
  res.status(201).json({ reading });
}));

router.get('/readings/pending', allow(...OFFICE), h(async (req, res) => {
  const p = paging(req.query);
  const where = { status: 'PENDING_REVIEW' as const };
  const [items, total] = await Promise.all([
    db.meterReading.findMany({
      where, skip: p.skip, take: p.take, orderBy: { createdAt: 'asc' },
      include: { meter: { select: { serial: true, lastLitres: true, customer: { select: { accountNumber: true, firstName: true, lastName: true } } } } },
    }),
    db.meterReading.count({ where }),
  ]);
  res.json(listOf(items, total, p));
}));

router.post('/readings/:id/review', allow(...COMMERCIAL, ...TECHNICAL), h(async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  const reading = await reviewReading(req.params.id, accept);
  audit(req, accept ? 'reading.accept' : 'reading.reject', 'MeterReading', reading.id);
  res.json({ reading });
}));

export default router;
