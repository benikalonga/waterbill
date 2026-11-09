import type { Invoice, PaymentChannel } from '@prisma/client';
import { db, type Tx } from '../lib/db';
import { badRequest, conflict, notFound, reference } from '../lib/http';
import { toCustomer, toStaff } from '../lib/realtime';
import { invoiceStatus } from './billing';
import { notifyCustomer } from './notify';
import { getSettings } from './settings';

const MOBILE: PaymentChannel[] = ['MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY', 'MTN_MOMO'];

async function applyToInvoice(tx: Tx, invoice: Invoice, available: number): Promise<number> {
  const applied = Math.min(available, invoice.balanceCents);
  if (applied <= 0) return 0;
  const paid = invoice.paidCents + applied;
  const balance = invoice.balanceCents - applied;
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { paidCents: paid, balanceCents: balance, status: invoiceStatus(balance, paid, invoice.status) },
  });

  // Payments on a plan fill its instalments in order.
  const plan = await tx.paymentPlan.findFirst({ where: { invoiceId: invoice.id, status: 'ACTIVE' }, include: { installments: { orderBy: { seq: 'asc' } } } });
  if (plan) {
    let left = applied;
    for (const inst of plan.installments) {
      const room = inst.amountCents - inst.paidCents;
      if (room <= 0 || left <= 0) continue;
      const add = Math.min(room, left);
      left -= add;
      await tx.planInstallment.update({ where: { id: inst.id }, data: { paidCents: { increment: add } } });
    }
    if (balance <= 0) await tx.paymentPlan.update({ where: { id: plan.id }, data: { status: 'COMPLETED' } });
  }
  return applied;
}

/**
 * Confirm a payment and apply it: to its bill if it has one, otherwise to the
 * oldest open bills. Anything left becomes account credit. Idempotent: only the
 * first call for a payment has any effect.
 */
export async function confirmPayment(paymentId: string, externalRef?: string) {
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: 'PROCESSING' },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), externalRef },
    });
    if (!claimed.count) return null;

    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    let remaining = payment.amountCents;

    if (payment.invoiceId) {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
      remaining -= await applyToInvoice(tx, invoice, remaining);
    }
    if (remaining > 0) {
      const open = await tx.invoice.findMany({
        where: { customerId: payment.customerId, balanceCents: { gt: 0 }, status: { notIn: ['VOID', 'DISPUTED'] } },
        orderBy: { dueAt: 'asc' },
      });
      for (const invoice of open) {
        if (remaining <= 0) break;
        remaining -= await applyToInvoice(tx, invoice, remaining);
      }
    }
    if (remaining > 0) {
      await tx.customer.update({ where: { id: payment.customerId }, data: { creditCents: { increment: remaining } } });
    }
    return { payment, credited: remaining };
  });

  if (!result) return null;
  const { payment, credited } = result;
  toCustomer(payment.customerId, 'payment:confirmed', { paymentId, reference: payment.reference, amountCents: payment.amountCents });
  toStaff('payment:confirmed', { reference: payment.reference, amountCents: payment.amountCents, channel: payment.channel });
  await notifyCustomer(payment.customerId, {
    title: 'Payment received',
    body: `We received your payment, reference ${payment.reference}.${credited > 0 ? ' The extra amount was saved as account credit.' : ''}`,
    kind: 'payment',
    link: '/portal/payments',
    sms: 'optional',
  });
  await restoreIfCleared(payment.customerId);
  return payment;
}

/** Disconnected accounts with nothing overdue get a reconnection job; the fee goes on their next bill. */
async function restoreIfCleared(customerId: string) {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.status !== 'DISCONNECTED') return;
  const overdue = await db.invoice.count({
    where: { customerId, status: { in: ['OVERDUE', 'COLLECTIONS'] }, balanceCents: { gt: 0 }, plans: { none: { status: 'ACTIVE' } } },
  });
  if (overdue) return;
  const pending = await db.workOrder.count({ where: { customerId, kind: 'RECONNECTION', status: { notIn: ['DONE', 'CANCELLED'] } } });
  if (pending) return;

  const { reconnectionFeeCents } = await getSettings();
  await db.customer.update({ where: { id: customerId }, data: { pendingFeesCents: { increment: reconnectionFeeCents } } });
  await db.workOrder.create({
    data: {
      number: reference('WO'), kind: 'RECONNECTION', priority: 'HIGH', customerId,
      address: customer.addressLine, lat: customer.lat, lng: customer.lng,
      description: `Reconnect account ${customer.accountNumber}: arrears cleared.`,
    },
  });
  await notifyCustomer(customerId, {
    title: 'Reconnection scheduled',
    body: 'Thank you for clearing your balance. A technician will restore your supply soon.',
    kind: 'disconnection',
    sms: 'always',
  });
}

/** Start a payment from the portal. */
export async function startPayment(input: {
  customerId: string; invoiceId?: string; amountCents: number; channel: PaymentChannel; payerPhone?: string;
}) {
  if (input.amountCents < 1) throw badRequest('Enter an amount to pay.');
  if (input.invoiceId) {
    const invoice = await db.invoice.findFirst({ where: { id: input.invoiceId, customerId: input.customerId } });
    if (!invoice) throw notFound('Bill not found.');
    if (invoice.status === 'VOID') throw conflict('This bill was cancelled.');
    if (invoice.balanceCents <= 0) throw conflict('This bill is already paid.');
  }
  return db.payment.create({
    data: { ...input, reference: reference('PAY', 10), status: 'PROCESSING' },
  });
}

export const isMobileMoney = (c: PaymentChannel) => MOBILE.includes(c);

/** Handle an operator callback. Rejects amount mismatches; repeated callbacks are harmless. */
export async function handleOperatorCallback(
  channel: PaymentChannel,
  body: { reference: string; amountCents: number; status: string; externalRef?: string },
) {
  const payment = await db.payment.findFirst({ where: { reference: body.reference, channel } });
  if (!payment) throw notFound('Unknown payment reference.');
  if (body.status !== 'SUCCESS') {
    await db.payment.updateMany({ where: { id: payment.id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
    toCustomer(payment.customerId, 'payment:failed', { paymentId: payment.id });
    return { applied: false };
  }
  if (body.amountCents !== payment.amountCents) {
    await db.payment.updateMany({ where: { id: payment.id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
    throw badRequest('Amount does not match the payment.');
  }
  const confirmed = await confirmPayment(payment.id, body.externalRef ?? undefined);
  return { applied: Boolean(confirmed) };
}

/** Split an amount across months; the first instalment absorbs any remainder. */
export function splitInstallments(totalCents: number, months: number) {
  const each = Math.floor(totalCents / months);
  return Array.from({ length: months }, (_, i) => (i === 0 ? each + (totalCents - each * months) : each));
}

/** Daily: plans with an instalment more than 14 days late default, and the bill resumes normal collection. */
export async function checkPlanDefaults(): Promise<number> {
  const cutoff = new Date(Date.now() - 14 * 864e5);
  const plans = await db.paymentPlan.findMany({ where: { status: 'ACTIVE' }, include: { installments: true } });
  let defaulted = 0;
  for (const plan of plans) {
    if (!plan.installments.some((i) => i.dueAt < cutoff && i.paidCents < i.amountCents)) continue;
    await db.paymentPlan.update({ where: { id: plan.id }, data: { status: 'DEFAULTED' } });
    await db.invoice.update({ where: { id: plan.invoiceId }, data: { status: 'OVERDUE' } });
    await notifyCustomer(plan.customerId, {
      title: 'Payment plan cancelled',
      body: 'A plan instalment was missed for more than 14 days, so your plan has ended.',
      kind: 'bill',
      sms: 'always',
    });
    defaulted += 1;
  }
  return defaulted;
}
