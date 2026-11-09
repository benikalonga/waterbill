import { db } from '../lib/db';
import { toCustomer, toStaffMember } from '../lib/realtime';
import { sendSms } from './sms';

interface Message {
  title: string;
  body: string;
  kind: string;
  link?: string;
  /** Also send a text message (respects the customer's reminder preference when optional). */
  sms?: 'always' | 'optional';
}

export async function notifyCustomer(customerId: string, m: Message): Promise<void> {
  try {
    const n = await db.notification.create({
      data: { customerId, title: m.title, body: m.body, kind: m.kind, link: m.link },
    });
    toCustomer(customerId, 'notification', n);
    if (m.sms) {
      const c = await db.customer.findUnique({ where: { id: customerId }, select: { phone: true, smsReminders: true } });
      if (c && (m.sms === 'always' || c.smsReminders)) await sendSms(c.phone, `WaterBill: ${m.body}`);
    }
  } catch (err) {
    console.warn('[notify] failed:', (err as Error).message);
  }
}

export async function notifyStaff(staffId: string, m: Message): Promise<void> {
  try {
    const n = await db.notification.create({
      data: { staffId, title: m.title, body: m.body, kind: m.kind, link: m.link },
    });
    toStaffMember(staffId, 'notification', n);
  } catch (err) {
    console.warn('[notify] failed:', (err as Error).message);
  }
}
