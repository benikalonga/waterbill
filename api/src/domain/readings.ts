import type { AlertKind, Meter, ReadingSource, Severity } from '@prisma/client';
import { db } from '../lib/db';
import { badRequest } from '../lib/http';
import { toStaff } from '../lib/realtime';
import { notifyCustomer } from './notify';
import { zScore } from './tariff';

const Z_THRESHOLD = 2.5;
const SAME_READINGS = 3;
const LOW_BATTERY_PCT = 15;

async function raise(meter: Meter, kind: AlertKind, severity: Severity, title: string, detail: string, metric?: number, threshold?: number) {
  // One open alert per meter and kind is enough.
  const open = await db.alert.findFirst({ where: { meterId: meter.id, kind, status: { in: ['NEW', 'IN_PROGRESS'] } } });
  if (open) return;
  const alert = await db.alert.create({
    data: { kind, severity, title, detail, meterId: meter.id, customerId: meter.customerId, metric, threshold },
  });
  toStaff('alert:new', alert);
}

/** Look for tampering, leaks and faults after a reading has been stored. */
export async function assessReading(meter: Meter, usage: number, readAt: Date) {
  const history = await db.meterReading.findMany({
    where: { meterId: meter.id, status: 'ACCEPTED', readAt: { lt: readAt } },
    orderBy: { readAt: 'desc' },
    take: 30,
  });
  const usages = history.map((r) => r.usageLitres);

  if (usages.length >= 5) {
    const z = zScore(usage, usages);
    if (z > Z_THRESHOLD) {
      await raise(meter, 'HIGH_USAGE', 'MEDIUM', 'Unusually high consumption', `Meter ${meter.serial} used ${usage} L, far above its normal pattern.`, z, Z_THRESHOLD);
      if (meter.customerId) {
        await notifyCustomer(meter.customerId, {
          title: 'Possible leak on your property',
          body: 'Your water use is much higher than usual. Please check taps, tanks and pipes.',
          kind: 'usage',
          link: '/portal/usage',
          sms: 'optional',
        });
      }
    } else if (z < -Z_THRESHOLD) {
      await raise(meter, 'LOW_USAGE', 'MEDIUM', 'Unusually low consumption', `Meter ${meter.serial} used ${usage} L, far below its normal pattern. Check for bypass or a faulty meter.`, z, -Z_THRESHOLD);
    }
  }

  if (usage === 0 && usages.slice(0, SAME_READINGS - 1).length === SAME_READINGS - 1 && usages.slice(0, SAME_READINGS - 1).every((u) => u === 0)) {
    await raise(meter, 'METER_STOPPED', 'HIGH', 'Meter appears to have stopped', `Meter ${meter.serial} has reported no change ${SAME_READINGS} times in a row.`);
  }

  // Water flowing during the small hours on several nights suggests a leak.
  const hour = readAt.getUTCHours();
  if (meter.kind === 'SMART' && hour >= 1 && hour < 5 && usage > 0) {
    const nightly = history.filter((r) => {
      const h = r.readAt.getUTCHours();
      return h >= 1 && h < 5 && r.usageLitres > 0;
    });
    const nights = new Set(nightly.map((r) => r.readAt.toISOString().slice(0, 10)));
    nights.delete(readAt.toISOString().slice(0, 10));
    if (nights.size >= 2) {
      await raise(meter, 'NIGHT_FLOW', 'MEDIUM', 'Continuous night-time flow', `Meter ${meter.serial} shows flow between 01:00 and 05:00 on ${nights.size + 1} nights.`, nights.size + 1, 3);
    }
  }

  if (meter.customerId) await checkMonthlyLimit(meter.customerId, meter.id);
}

/** Tell a customer once a month when they pass the limit they set for themselves. */
async function checkMonthlyLimit(customerId: string, meterId: string) {
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { monthlyLimitLitres: true } });
  if (!customer?.monthlyLimitLitres) return;
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const used = await db.meterReading.aggregate({ where: { meterId, status: 'ACCEPTED', readAt: { gte: start } }, _sum: { usageLitres: true } });
  if ((used._sum.usageLitres ?? 0) < customer.monthlyLimitLitres) return;
  const already = await db.notification.count({ where: { customerId, kind: 'usage-limit', createdAt: { gte: start } } });
  if (already) return;
  await notifyCustomer(customerId, {
    title: 'Monthly usage limit reached',
    body: 'You have passed the monthly water limit you set.',
    kind: 'usage-limit',
    link: '/portal/usage',
    sms: 'optional',
  });
}

export async function recordReading(input: {
  meter: Meter;
  totalLitres: number;
  readAt?: Date;
  source: ReadingSource;
  agentId?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  needsReview?: boolean;
}) {
  const { meter, totalLitres, source } = input;
  if (!Number.isInteger(totalLitres) || totalLitres < 0) throw badRequest('Enter a valid meter index.');
  const readAt = input.readAt ?? new Date();
  const usage = totalLitres - meter.lastLitres;

  // A lower index than last time is reverse flow or a misread: keep it, but flag it.
  const reversed = usage < 0;
  const status = input.needsReview || reversed ? 'PENDING_REVIEW' : 'ACCEPTED';

  const reading = await db.meterReading.create({
    data: {
      meterId: meter.id, totalLitres, usageLitres: Math.max(0, usage), readAt, source, status,
      agentId: input.agentId, lat: input.lat, lng: input.lng, photoUrl: input.photoUrl,
      flagged: reversed, flagReason: reversed ? 'Index is lower than the previous reading' : null,
    },
  });

  if (reversed) {
    await raise(meter, 'REVERSE_FLOW', 'HIGH', 'Meter index went backwards', `Meter ${meter.serial} moved from ${meter.lastLitres} L to ${totalLitres} L.`);
  }
  if (status === 'ACCEPTED') {
    await db.meter.update({ where: { id: meter.id }, data: { lastLitres: totalLitres } });
    await assessReading(meter, usage, readAt);
  }
  return reading;
}

/** Staff decision on a reading waiting for review. */
export async function reviewReading(readingId: string, accept: boolean) {
  const reading = await db.meterReading.findUniqueOrThrow({ where: { id: readingId }, include: { meter: true } });
  if (reading.status !== 'PENDING_REVIEW') throw badRequest('This reading has already been reviewed.');
  if (!accept) return db.meterReading.update({ where: { id: readingId }, data: { status: 'REJECTED' } });

  const usage = Math.max(0, reading.totalLitres - reading.meter.lastLitres);
  const updated = await db.meterReading.update({ where: { id: readingId }, data: { status: 'ACCEPTED', usageLitres: usage } });
  await db.meter.update({ where: { id: reading.meterId }, data: { lastLitres: reading.totalLitres } });
  await assessReading(reading.meter, usage, reading.readAt);
  return updated;
}

/** Hourly: smart meters silent for 48 hours, and batteries about to die. */
export async function scanMeterHealth(): Promise<number> {
  const silentSince = new Date(Date.now() - 48 * 36e5);
  const meters = await db.meter.findMany({
    where: { kind: 'SMART', status: 'ACTIVE', OR: [{ lastSeenAt: { lt: silentSince } }, { batteryPct: { lt: LOW_BATTERY_PCT } }] },
  });
  for (const m of meters) {
    if (m.lastSeenAt && m.lastSeenAt < silentSince) await raise(m, 'SIGNAL_LOST', 'MEDIUM', 'Smart meter offline', `Meter ${m.serial} has not reported for over 48 hours.`);
    if (m.batteryPct != null && m.batteryPct < LOW_BATTERY_PCT) await raise(m, 'LOW_BATTERY', 'LOW', 'Meter battery low', `Meter ${m.serial} battery is at ${m.batteryPct}%.`, m.batteryPct, LOW_BATTERY_PCT);
  }
  return meters.length;
}
