import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { CustomerType, TariffClass } from '@prisma/client';
import { issueTokens, requireCustomer, requireStaff, revokeToken, rotateTokens } from '../lib/auth';
import { db } from '../lib/db';
import { badRequest, forbidden, h, HttpError, reference, sha256, unauthorized } from '../lib/http';
import { sendSms } from '../domain/sms';

const router = Router();

const MAX_PIN_FAILURES = 5;
const LOCK_MINUTES = 15;
const CODE_TTL_HOURS = 24;
const PIN = z.string().regex(/^\d{4,6}$/, 'Your PIN must be 4 to 6 digits.');
// Compared against when an account does not exist, so response time reveals nothing.
const DUMMY_HASH = bcrypt.hashSync('timing-placeholder', 12);

const publicStaff = (s: { id: string; email: string; fullName: string; role: string; trade: string | null; branchId: string | null }) => ({
  id: s.id, email: s.email, fullName: s.fullName, role: s.role, trade: s.trade, branchId: s.branchId,
});
const publicCustomer = (c: { id: string; accountNumber: string; firstName: string; lastName: string; status: string; review: string; mustChangePin: boolean }) => ({
  id: c.id, accountNumber: c.accountNumber, firstName: c.firstName, lastName: c.lastName, status: c.status, review: c.review, mustChangePin: c.mustChangePin,
});

/** Create a one-time code, store only its hash, and return the plain value. */
export async function issueCode(customerId: string, purpose: 'first-login' | 'pin-reset') {
  const code = String(crypto.randomInt(100000, 1000000));
  await db.oneTimeCode.updateMany({ where: { customerId, usedAt: null }, data: { usedAt: new Date() } });
  await db.oneTimeCode.create({
    data: { customerId, purpose, codeHash: sha256(`${customerId}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_HOURS * 36e5) },
  });
  return code;
}

async function consumeCode(customerId: string, code: string): Promise<boolean> {
  const row = await db.oneTimeCode.findFirst({
    where: { customerId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return false;
  if (row.codeHash !== sha256(`${customerId}:${code}`)) {
    const attempts = row.attempts + 1;
    await db.oneTimeCode.update({ where: { id: row.id }, data: { attempts, usedAt: attempts >= MAX_PIN_FAILURES ? new Date() : undefined } });
    return false;
  }
  await db.oneTimeCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return true;
}

export const newAccountNumber = () => reference('WB', 8);

router.post('/staff/sign-in', h(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const staff = await db.staff.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, staff?.passwordHash ?? DUMMY_HASH);
  if (!staff || !ok || !staff.isActive) throw unauthorized('Wrong email or password.');
  await db.staff.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
  res.json({ ...(await issueTokens({ sub: staff.id, kind: 'staff', role: staff.role })), staff: publicStaff(staff) });
}));

router.post('/customer/sign-in', h(async (req, res) => {
  const { accountNumber, pin } = z.object({ accountNumber: z.string().min(1), pin: z.string().min(4).max(6) }).parse(req.body);
  const customer = await db.customer.findUnique({ where: { accountNumber: accountNumber.trim().toUpperCase() } });
  const invalid = unauthorized('Wrong account number or PIN.');
  if (!customer) {
    await bcrypt.compare(pin, DUMMY_HASH);
    throw invalid;
  }
  if (customer.status === 'CLOSED') throw invalid;
  if (customer.lockedUntil && customer.lockedUntil > new Date()) {
    throw new HttpError(429, `Too many wrong attempts. Try again after ${LOCK_MINUTES} minutes.`);
  }

  const pinOk = customer.pinHash ? await bcrypt.compare(pin, customer.pinHash) : false;
  const usedCode = !pinOk && (await consumeCode(customer.id, pin));
  if (!pinOk && !usedCode) {
    const failed = customer.failedPins + 1;
    await db.customer.update({
      where: { id: customer.id },
      data: failed >= MAX_PIN_FAILURES
        ? { failedPins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 6e4) }
        : { failedPins: failed },
    });
    throw invalid;
  }

  const updated = await db.customer.update({
    where: { id: customer.id },
    data: { failedPins: 0, lockedUntil: null, mustChangePin: usedCode ? true : customer.mustChangePin },
  });
  res.json({ ...(await issueTokens({ sub: customer.id, kind: 'customer' })), customer: publicCustomer(updated) });
}));

router.post('/refresh', h(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  res.json(await rotateTokens(refreshToken));
}));

router.post('/sign-out', h(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  await revokeToken(refreshToken);
  res.json({ ok: true });
}));

router.post('/customer/register', h(async (req, res) => {
  const input = z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().regex(/^\+?[0-9 ]{8,20}$/, 'Enter a valid phone number.'),
    email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
    type: z.nativeEnum(CustomerType),
    tariffClass: z.nativeEnum(TariffClass).refine((t) => t !== 'INDUSTRIAL', 'Industrial accounts are opened by our team.'),
    addressLine: z.string().trim().min(3).max(255),
    neighborhood: z.string().trim().min(1).max(100),
    district: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
  }).parse(req.body);

  const customer = await db.customer.create({
    data: { ...input, phone: input.phone.replace(/\s/g, ''), accountNumber: newAccountNumber(), selfRegistered: true, status: 'PENDING', review: 'PENDING' },
  });
  // The code goes only to the phone number, so holding it proves ownership.
  const code = await issueCode(customer.id, 'first-login');
  await sendSms(customer.phone, `WaterBill: account ${customer.accountNumber}. Your one-time code is ${code}. It expires in ${CODE_TTL_HOURS} hours.`);
  res.status(201).json({ accountNumber: customer.accountNumber, status: customer.status });
}));

router.post('/customer/forgot-pin', h(async (req, res) => {
  const { phone } = z.object({ phone: z.string().min(1) }).parse(req.body);
  const customer = await db.customer.findFirst({ where: { phone: phone.replace(/\s/g, ''), status: { not: 'CLOSED' } } });
  if (customer) {
    const code = await issueCode(customer.id, 'pin-reset');
    await sendSms(customer.phone, `WaterBill: account ${customer.accountNumber}. Your PIN reset code is ${code}.`);
  }
  // Same answer either way, so this cannot be used to discover customers.
  res.json({ message: 'If that number is registered, a code is on its way.' });
}));

router.get('/customer/me', requireCustomer, h(async (req, res) => {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: req.customer!.id } });
  res.json({ customer: publicCustomer(customer) });
}));

router.post('/customer/change-pin', requireCustomer, h(async (req, res) => {
  const { newPin } = z.object({ newPin: PIN }).parse(req.body);
  if (/^(\d)\1+$/.test(newPin) || '0123456789'.includes(newPin)) throw badRequest('Choose a PIN that is harder to guess.');
  await db.customer.update({
    where: { id: req.customer!.id },
    data: { pinHash: await bcrypt.hash(newPin, 10), mustChangePin: false },
  });
  res.json({ ok: true });
}));

router.get('/staff/me', requireStaff, h(async (req, res) => {
  const staff = await db.staff.findUniqueOrThrow({ where: { id: req.staff!.id } });
  res.json({ staff: publicStaff(staff) });
}));

router.post('/staff/change-password', requireStaff, h(async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: z.string().min(10, 'Use at least 10 characters.') }).parse(req.body);
  const staff = await db.staff.findUniqueOrThrow({ where: { id: req.staff!.id } });
  if (!(await bcrypt.compare(currentPassword, staff.passwordHash))) throw forbidden('Your current password is incorrect.');
  await db.staff.update({ where: { id: staff.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await db.refreshSession.deleteMany({ where: { staffId: staff.id } });
  res.json({ ok: true });
}));

export default router;
