/**
 * Demo data so every screen has something to show.
 * Passwords and PINs come from the environment; nothing is hard-coded:
 *   SEED_STAFF_PASSWORD='YOUR_PASSWORD' SEED_CUSTOMER_PIN='YOUR_PIN' npm run db:seed
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { CustomerType, StaffRole, TariffClass } from '@prisma/client';
import { db } from './lib/db';
import { periodOf, reference } from './lib/http';
import { priceUsage } from './domain/tariff';

const TARIFFS: { c: TariffClass; fixed: number; bands: [number, number | null, number][] }[] = [
  { c: 'LIFELINE', fixed: 200, bands: [[0, 6, 8], [6, null, 25]] },
  { c: 'STANDARD', fixed: 350, bands: [[0, 20, 25], [20, null, 35]] },
  { c: 'COMMERCIAL', fixed: 1000, bands: [[0, null, 50]] },
  { c: 'INDUSTRIAL', fixed: 2500, bands: [[0, null, 65]] },
];

const FIRST = Array.from({ length: 12 }, (_, i) => `YOUR_FIRST_NAME_${i + 1}`);
const LAST = Array.from({ length: 12 }, (_, i) => `YOUR_LAST_NAME_${i + 1}`);
const demoEmail = (name: string) => `YOUR_${name}_EMAIL@fakeemail.com`.toLowerCase();

const monthsAgo = (n: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 15, 9));
};

async function main() {
  const staffPassword = process.env.SEED_STAFF_PASSWORD;
  const customerPin = process.env.SEED_CUSTOMER_PIN;
  if (!staffPassword || staffPassword.length < 10 || !customerPin || !/^\d{4,6}$/.test(customerPin)) {
    console.error('Set SEED_STAFF_PASSWORD (10+ characters) and SEED_CUSTOMER_PIN (4-6 digits).');
    process.exit(1);
  }
  if (await db.staff.count()) {
    console.log('Database already has data; nothing to do.');
    return;
  }

  for (const t of TARIFFS) {
    await db.tariffRule.create({
      data: { tariffClass: t.c, fixedChargeCents: t.fixed, bands: { create: t.bands.map(([fromM3, toM3, centsPerM3]) => ({ fromM3, toM3, centsPerM3 })) } },
    });
  }

  const branch = await db.branch.create({ data: { code: 'NTH', name: 'Northern Branch', city: 'YOUR_CITY', region: 'YOUR_REGION', lat: 0.29, lng: 0.82, capacityM3: 120000 } });
  const second = await db.branch.create({ data: { code: 'EST', name: 'Eastern Branch', city: 'YOUR_CITY', region: 'YOUR_REGION', lat: 0.33, lng: 0.89, capacityM3: 80000 } });
  const zones = await Promise.all(
    [['Z-HIL', 'YOUR_ZONE_1', branch.id, 'LOW'], ['Z-MKT', 'YOUR_ZONE_2', branch.id, 'HIGH'], ['Z-LAK', 'YOUR_ZONE_3', second.id, 'MEDIUM']].map(([code, name, branchId, risk]) =>
      db.zone.create({ data: { code, name, branchId, risk: risk as 'LOW', population: 25000 } })),
  );

  const hash = await bcrypt.hash(staffPassword, 12);
  const STAFF: [string, string, StaffRole][] = [
    [demoEmail('ADMIN'), 'YOUR_ADMIN_NAME', 'ADMIN'],
    [demoEmail('CEO'), 'YOUR_CEO_NAME', 'EXECUTIVE'],
    [demoEmail('COMMERCIAL'), 'YOUR_COMMERCIAL_NAME', 'COMMERCIAL_MANAGER'],
    [demoEmail('TECHNICAL'), 'YOUR_TECHNICAL_NAME', 'TECHNICAL_MANAGER'],
    [demoEmail('BRANCH'), 'YOUR_BRANCH_NAME', 'BRANCH_MANAGER'],
    [demoEmail('BILLING'), 'YOUR_BILLING_NAME', 'BILLING_CLERK'],
    [demoEmail('COLLECTIONS'), 'YOUR_COLLECTIONS_NAME', 'COLLECTIONS_OFFICER'],
    [demoEmail('AUDIT'), 'YOUR_AUDIT_NAME', 'AUDITOR'],
  ];
  for (const [email, fullName, role] of STAFF) await db.staff.create({ data: { email, fullName, role, passwordHash: hash, branchId: branch.id } });
  const agent = await db.staff.create({ data: { email: demoEmail('AGENT'), fullName: 'YOUR_AGENT_NAME', role: 'FIELD_AGENT', trade: 'METER_READER', passwordHash: hash, branchId: branch.id, phone: '+15550100100' } });

  const pinHash = await bcrypt.hash(customerPin, 10);
  const rules = await db.tariffRule.findMany({ include: { bands: true } });
  const owner = await db.staff.findFirstOrThrow({ where: { role: 'ADMIN' } });
  const periods = [5, 4, 3, 2, 1].map((n) => periodOf(monthsAgo(n)));
  const runs = await Promise.all(periods.map((period) => db.billingRun.create({ data: { period, createdById: owner.id, finishedAt: new Date() } })));

  for (let i = 0; i < FIRST.length; i++) {
    const tariffClass: TariffClass = i % 5 === 4 ? 'COMMERCIAL' : i % 4 === 3 ? 'LIFELINE' : 'STANDARD';
    const type: CustomerType = tariffClass === 'COMMERCIAL' ? 'BUSINESS' : 'HOUSEHOLD';
    const zone = zones[i % zones.length];
    const customer = await db.customer.create({
      data: {
        accountNumber: i === 0 ? 'WB-DEMO0001' : reference('WB'),
        firstName: FIRST[i], lastName: LAST[i], phone: `YOUR_PHONE_NUMBER_${i + 1}`, type, tariffClass,
        addressLine: `YOUR_ADDRESS_${i + 1}`, neighborhood: zone.name, district: 'YOUR_DISTRICT', city: 'YOUR_CITY', region: 'YOUR_REGION',
        lat: 0.29 + i * 0.004, lng: 0.82 + i * 0.003, zoneId: zone.id, pinHash, mustChangePin: false, status: 'ACTIVE', review: 'APPROVED',
      },
    });
    const meter = await db.meter.create({
      data: {
        serial: `MTR-${String(10000 + i)}`, customerId: customer.id, kind: i % 3 === 0 ? 'SMART' : 'MECHANICAL', link: i % 3 === 0 ? 'GSM' : 'MANUAL',
        brand: 'AquaFlow', model: 'AF-15', installedAt: monthsAgo(14), lastSeenAt: new Date(), batteryPct: i % 3 === 0 ? 80 - i : null,
      },
    });

    let total = 0;
    const rule = rules.find((r) => r.tariffClass === tariffClass)!;
    for (let m = 0; m < periods.length; m++) {
      const usage = 8000 + ((i * 1700 + m * 900) % 19000);
      const opening = total;
      total += usage;
      const readAt = monthsAgo(5 - m);
      await db.meterReading.create({ data: { meterId: meter.id, totalLitres: total, usageLitres: usage, readAt, source: meter.kind === 'SMART' ? 'SMART_METER' : 'FIELD_AGENT', agentId: meter.kind === 'SMART' ? null : agent.id } });

      const price = priceUsage(usage, rule.bands, rule.fixedChargeCents, rule.vatBps);
      const newest = m === periods.length - 1;
      // The newest bill is left open; every third customer also falls behind.
      const paid = newest || (i % 3 === 2 && m === periods.length - 2) ? 0 : price.totalCents;
      const dueAt = new Date(readAt.getTime() + 21 * 864e5);
      const invoice = await db.invoice.create({
        data: {
          number: reference('INV'), customerId: customer.id, period: periods[m], billingRunId: runs[m].id, issuedAt: readAt, dueAt,
          openingLitres: opening, closingLitres: total, usageLitres: usage, basis: 'ACTUAL',
          usageCents: price.usageCents, fixedCents: price.fixedCents, vatCents: price.vatCents, totalCents: price.totalCents,
          paidCents: paid, balanceCents: price.totalCents - paid, lines: price.lines as object[],
          status: paid ? 'PAID' : dueAt < new Date() ? 'OVERDUE' : 'ISSUED',
        },
      });
      if (paid) {
        await db.payment.create({
          data: {
            reference: reference('PAY', 10), customerId: customer.id, invoiceId: invoice.id, amountCents: paid,
            channel: (['MPESA', 'AIRTEL_MONEY', 'COUNTER', 'ORANGE_MONEY'] as const)[(i + m) % 4], status: 'CONFIRMED',
            initiatedAt: new Date(readAt.getTime() + 5 * 864e5), confirmedAt: new Date(readAt.getTime() + 5 * 864e5),
          },
        });
      }
    }
    await db.meter.update({ where: { id: meter.id }, data: { lastLitres: total } });
  }

  await db.customer.create({
    data: {
      accountNumber: reference('WB'), firstName: 'YOUR_FIRST_NAME', lastName: 'YOUR_LAST_NAME', phone: 'YOUR_PHONE_NUMBER', type: 'HOUSEHOLD', tariffClass: 'STANDARD',
      addressLine: 'YOUR_ADDRESS', neighborhood: 'YOUR_NEIGHBORHOOD', district: 'YOUR_DISTRICT', city: 'YOUR_CITY', region: 'YOUR_REGION', selfRegistered: true,
    },
  });

  const pipe = await db.pipeline.create({ data: { branchId: branch.id, code: 'PL-001', tier: 'DISTRIBUTION', material: 'HDPE', diameterMm: 200, lengthM: 3400, installedYear: 2011, condition: 'FAIR' } });
  await db.pipeline.create({ data: { branchId: second.id, code: 'PL-002', tier: 'TRANSMISSION', material: 'Ductile iron', diameterMm: 600, lengthM: 12800, installedYear: 1998, condition: 'POOR' } });
  const station = await db.pumpStation.create({ data: { branchId: branch.id, code: 'PS-01', name: 'Riverside Pumping Station', capacityM3H: 900, powerKw: 240, lat: 0.28, lng: 0.8, lastServiceAt: monthsAgo(2), nextServiceAt: new Date(Date.now() + 40 * 864e5) } });
  for (let h = 0; h < 24 * 30; h += 6) {
    await db.stationReading.create({ data: { stationId: station.id, recordedAt: new Date(Date.now() - h * 36e5), producedM3: 2 + (h % 18 === 0 ? 1 : 0), pressureBar: 4.2, reservoirPct: 70, energyKwh: 900, ph: 7.2, turbidity: 0.6 } });
  }

  await db.leak.create({ data: { pipelineId: pipe.id, source: 'FIELD_AGENT', address: 'YOUR_ADDRESS', lat: 0.295, lng: 0.825, lossM3H: 3.5, priority: 'URGENT', description: 'Water surfacing through the road.' } });
  await db.illegalConnection.create({ data: { zoneId: zones[1].id, source: 'INSPECTION', address: 'YOUR_ADDRESS', lossM3H: 0.8, estimatedLossCents: 42000, reportedById: agent.id } });
  await db.alert.create({ data: { kind: 'STATION_FAULT', severity: 'HIGH', title: 'Pressure drop at Riverside', detail: 'Pressure fell below 3 bar for 20 minutes.' } });
  await db.workOrder.create({ data: { number: reference('WO'), kind: 'METER_REPLACEMENT', status: 'ASSIGNED', priority: 'HIGH', assigneeId: agent.id, address: 'YOUR_ADDRESS', description: 'Replace faulty meter.' } });
  await db.outage.create({ data: { zoneId: zones[0].id, kind: 'PLANNED', title: 'Planned maintenance in YOUR_ZONE', message: 'Supply will be interrupted while we replace a valve.', startsAt: new Date(Date.now() + 2 * 864e5), endsAt: new Date(Date.now() + 2.3 * 864e5), createdById: owner.id } });

  const employee = await db.employee.create({ data: { code: 'EMP-001', firstName: 'YOUR_EMPLOYEE_FIRST_NAME', lastName: 'YOUR_EMPLOYEE_LAST_NAME', hiredAt: monthsAgo(40), jobTitle: 'Network Engineer', department: 'Technical', branchId: branch.id, salaryCents: 95000 } });
  await db.employee.create({ data: { code: 'EMP-002', firstName: 'YOUR_EMPLOYEE_FIRST_NAME_2', lastName: 'YOUR_EMPLOYEE_LAST_NAME_2', hiredAt: monthsAgo(22), jobTitle: 'Billing Officer', department: 'Commercial', branchId: branch.id, salaryCents: 72000 } });
  await db.leaveRequest.create({ data: { employeeId: employee.id, kind: 'ANNUAL', startsOn: new Date(Date.now() + 10 * 864e5), endsOn: new Date(Date.now() + 15 * 864e5), reason: 'Family visit' } });
  await db.stockItem.createMany({
    data: [
      { sku: 'MTR-15', name: '15 mm water meter', category: 'METER', unit: 'pcs', onHand: 120, minLevel: 30, unitCents: 3200, supplier: 'AquaFlow Ltd' },
      { sku: 'PIP-110', name: '110 mm HDPE pipe', category: 'SPARE_PART', unit: 'm', onHand: 18, minLevel: 50, unitCents: 1450 },
      { sku: 'CHL-25', name: 'Chlorine, 25 kg', category: 'CHEMICAL', unit: 'drum', onHand: 40, minLevel: 12, unitCents: 6100 },
      { sku: 'GLV-01', name: 'Safety gloves', category: 'SAFETY_GEAR', unit: 'pair', onHand: 75, minLevel: 20, unitCents: 450 },
    ],
  });

  console.log('✓ Demo data created.');
  console.log('  Staff: your_admin_email@fakeemail.com and the other your_*_email@fakeemail.com accounts (password from SEED_STAFF_PASSWORD)');
  console.log('  Customer: WB-DEMO0001 (PIN from SEED_CUSTOMER_PIN)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => db.$disconnect());
