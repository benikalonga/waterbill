import { Router } from 'express';
import { z } from 'zod';
import { TariffClass } from '@prisma/client';
import { db } from '../lib/db';
import { h, secretMatches, forbidden, notFound } from '../lib/http';
import { config } from '../lib/config';
import { estimateBill } from '../domain/billing';
import { handleOperatorCallback } from '../domain/payments';
import { recordReading } from '../domain/readings';

export const publicRoutes = Router();

publicRoutes.get('/tariffs', h(async (_req, res) => {
  const rules = await db.tariffRule.findMany({ include: { bands: { orderBy: { fromM3: 'asc' } } } });
  res.json({ tariffs: rules });
}));

publicRoutes.post('/estimate', h(async (req, res) => {
  const { tariffClass, m3 } = z.object({ tariffClass: z.nativeEnum(TariffClass), m3: z.coerce.number().min(0).max(100000) }).parse(req.body);
  res.json(await estimateBill(tariffClass, Math.round(m3 * 1000)));
}));

publicRoutes.get('/outages', h(async (_req, res) => {
  const outages = await db.outage.findMany({
    where: { status: { in: ['SCHEDULED', 'ACTIVE'] } },
    include: { zone: { select: { name: true } } },
    orderBy: { startsAt: 'asc' },
    take: 50,
  });
  res.json({ outages });
}));

// ─── Machine-to-machine integrations ──────────────────────────────────────────

export const integrationRoutes = Router();

const CHANNELS = { mpesa: 'MPESA', airtel: 'AIRTEL_MONEY', orange: 'ORANGE_MONEY', mtn: 'MTN_MOMO' } as const;

integrationRoutes.post('/payments/:provider', h(async (req, res) => {
  if (!secretMatches(req.get('x-webhook-secret'), config.paymentWebhookSecret)) throw forbidden('Invalid webhook secret.');
  const channel = CHANNELS[req.params.provider as keyof typeof CHANNELS];
  if (!channel) throw notFound('Unknown provider.');
  const body = z.object({
    reference: z.string(),
    amountCents: z.number().int().positive(),
    status: z.string(),
    externalRef: z.string().optional(),
  }).parse(req.body);
  res.json({ received: true, ...(await handleOperatorCallback(channel, body)) });
}));

integrationRoutes.post('/meters/readings', h(async (req, res) => {
  if (!secretMatches(req.get('x-device-key'), config.meterGatewayKey)) throw forbidden('Invalid device key.');
  const body = z.object({
    serial: z.string(),
    totalLitres: z.number().int().nonnegative(),
    readAt: z.coerce.date(),
    batteryPct: z.number().int().min(0).max(100).optional(),
    rssi: z.number().int().optional(),
    tampered: z.boolean().optional(),
  }).parse(req.body);

  const meter = await db.meter.findUnique({ where: { serial: body.serial } });
  if (!meter) throw notFound('Unknown meter.');
  await db.meter.update({
    where: { id: meter.id },
    data: { lastSeenAt: new Date(), batteryPct: body.batteryPct, rssi: body.rssi, status: body.tampered ? 'TAMPERED' : undefined },
  });
  if (body.tampered) {
    await db.alert.create({
      data: { kind: 'METER_TAMPERED', severity: 'CRITICAL', title: 'Meter tampering detected', detail: `Meter ${meter.serial} reported a tamper event.`, meterId: meter.id, customerId: meter.customerId },
    });
  }
  const reading = await recordReading({ meter, totalLitres: body.totalLitres, readAt: body.readAt, source: 'SMART_METER' });
  res.status(201).json({ id: reading.id, status: reading.status });
}));
