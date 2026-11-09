import cron from 'node-cron';
import { db } from './lib/db';
import { toStaff } from './lib/realtime';
import { applyOverdue, queueDisconnections, sendDueReminders } from './domain/billing';
import { checkPlanDefaults } from './domain/payments';
import { scanMeterHealth } from './domain/readings';

async function openStockAlerts() {
  const items = await db.stockItem.findMany();
  let raised = 0;
  for (const item of items.filter((i) => i.onHand <= i.minLevel)) {
    const title = `Low stock: ${item.name}`;
    if (await db.alert.findFirst({ where: { kind: 'LOW_STOCK', title, status: { in: ['NEW', 'IN_PROGRESS'] } } })) continue;
    toStaff('alert:new', await db.alert.create({ data: { kind: 'LOW_STOCK', severity: 'LOW', title, detail: `${item.onHand} ${item.unit} left (minimum ${item.minLevel}).` } }));
    raised += 1;
  }
  return raised;
}

async function syncOutages() {
  const now = new Date();
  const started = await db.outage.updateMany({ where: { status: 'SCHEDULED', startsAt: { lte: now } }, data: { status: 'ACTIVE' } });
  const ended = await db.outage.updateMany({ where: { status: 'ACTIVE', endsAt: { lte: now } }, data: { status: 'RESOLVED' } });
  return started.count + ended.count;
}

const purgeSessions = async () => (await db.refreshSession.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count;

const TASKS: [string, string, () => Promise<number>][] = [
  ['outage status', '* * * * *', syncOutages],
  ['meter health', '0 * * * *', scanMeterHealth],
  ['overdue bills', '0 1 * * *', applyOverdue],
  ['plan defaults', '10 1 * * *', checkPlanDefaults],
  ['disconnection queue', '20 1 * * *', queueDisconnections],
  ['low stock', '30 1 * * *', openStockAlerts],
  ['session cleanup', '40 1 * * *', purgeSessions],
  ['due reminders', '0 8 * * *', sendDueReminders],
];

export function startJobs() {
  for (const [name, schedule, run] of TASKS) {
    let busy = false;
    cron.schedule(schedule, async () => {
      if (busy) return;
      busy = true;
      try {
        const n = await run();
        if (n) console.log(`[jobs] ${name}: ${n}`);
      } catch (err) {
        console.warn(`[jobs] ${name} failed:`, (err as Error).message);
      } finally {
        busy = false;
      }
    }, { timezone: 'UTC' });
  }
}
