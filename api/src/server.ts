import http from 'http';
import { assertConfig, config } from './lib/config';
import { db } from './lib/db';
import { startRealtime } from './lib/realtime';
import { createApp } from './app';
import { startJobs } from './jobs';

async function main() {
  assertConfig();
  await db.$connect();
  const server = http.createServer(createApp());
  startRealtime(server);
  startJobs();
  server.listen(config.port, () => console.log(`▶ WaterBill API on http://localhost:${config.port} (${config.nodeEnv})`));

  const stop = () => server.close(() => db.$disconnect().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('✖ failed to start:', err.message);
  process.exit(1);
});
