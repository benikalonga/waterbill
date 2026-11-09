import compression from 'compression';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { requireStaff } from './lib/auth';
import { config } from './lib/config';
import { HttpError } from './lib/http';
import authRoutes from './routes/auth';
import fieldRoutes from './routes/field';
import portalRoutes from './routes/portal';
import { integrationRoutes, publicRoutes } from './routes/public';
import backoffice from './routes/ops/backoffice';
import customers from './routes/ops/customers';
import finance from './routes/ops/finance';
import operations from './routes/ops/operations';

const onError: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input.', fields: err.flatten().fieldErrors });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found.' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'That record already exists.' });
    if (err.code === 'P2003') return res.status(400).json({ error: 'A referenced record does not exist.' });
  }
  console.error(`[api] ${req.method} ${req.path}`, err);
  res.status(500).json({ error: config.isProd ? 'Something went wrong on our side.' : (err as Error).message });
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: config.webUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (config.nodeEnv !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

  const limit = (minutes: number, max: number) =>
    rateLimit({ windowMs: minutes * 6e4, max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'waterbill-api', time: new Date().toISOString() }));

  // Gateways post large volumes from few addresses, so they sit outside the general limit.
  app.use('/api/integrations', integrationRoutes);

  if (config.isProd) {
    app.use('/api', limit(15, 600));
    app.use('/api/auth', limit(15, 40));
    app.use('/api/auth/customer/forgot-pin', limit(60, 5));
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/portal', portalRoutes);
  app.use('/api/field', fieldRoutes);
  app.use('/api/ops', requireStaff, customers, finance, operations, backoffice);

  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));
  app.use(onError);
  return app;
}
