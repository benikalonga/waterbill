import { config } from '../lib/config';

/** Send a text message. Failures are logged, never thrown: SMS must not break a transaction. */
export async function sendSms(to: string, body: string): Promise<void> {
  const { sid, token, from } = config.twilio;
  if (!sid || !token || !from) {
    if (!config.isProd) console.log(`\n✉  SMS → ${to}\n   ${body}\n`);
    else console.warn('[sms] gateway not configured; message dropped');
    return;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) console.warn(`[sms] gateway responded ${res.status}`);
  } catch (err) {
    console.warn('[sms] failed:', (err as Error).message);
  }
}
