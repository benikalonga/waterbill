import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  isProd: nodeEnv === 'production',
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID ?? '',
    token: process.env.TWILIO_AUTH_TOKEN ?? '',
    from: process.env.TWILIO_FROM ?? '',
  },
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
  meterGatewayKey: process.env.METER_GATEWAY_KEY ?? '',
};

/** Refuse to start with configuration that would make the API insecure. */
export function assertConfig(): void {
  const problems: string[] = [];
  if (config.accessSecret.length < 32) problems.push('JWT_ACCESS_SECRET must be at least 32 characters.');
  if (config.refreshSecret.length < 32) problems.push('JWT_REFRESH_SECRET must be at least 32 characters.');
  if (config.accessSecret === config.refreshSecret) problems.push('JWT secrets must be different.');
  if (config.isProd && !process.env.WEB_URL) problems.push('WEB_URL is required in production.');
  if (config.isProd && !config.paymentWebhookSecret) problems.push('PAYMENT_WEBHOOK_SECRET is required in production.');
  if (problems.length) {
    problems.forEach((p) => console.error(`✖ ${p}`));
    process.exit(1);
  }
}
