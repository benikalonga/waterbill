import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import type { StaffRole } from '@prisma/client';
import { config } from './config';
import { db } from './db';
import { forbidden, sha256, unauthorized } from './http';

export interface Claims {
  sub: string;
  kind: 'staff' | 'customer';
  role?: StaffRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: { id: string; role: StaffRole; fullName: string; branchId: string | null };
      customer?: { id: string; accountNumber: string; firstName: string; lastName: string };
    }
  }
}

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 14;

export const verifyAccess = (token?: string): Claims | null => {
  try {
    return token ? (jwt.verify(token, config.accessSecret) as Claims) : null;
  } catch {
    return null;
  }
};

const bearer = (header?: string) => (header?.startsWith('Bearer ') ? header.slice(7) : undefined);

export async function issueTokens(claims: Claims) {
  const accessToken = jwt.sign(claims, config.accessSecret, { expiresIn: ACCESS_TTL });
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await db.refreshSession.create({
    data: {
      tokenHash: sha256(refreshToken),
      staffId: claims.kind === 'staff' ? claims.sub : null,
      customerId: claims.kind === 'customer' ? claims.sub : null,
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5),
    },
  });
  return { accessToken, refreshToken };
}

/** Exchange a refresh token for a new pair. Each token can only be used once. */
export async function rotateTokens(refreshToken: string) {
  const session = await db.refreshSession.findUnique({ where: { tokenHash: sha256(refreshToken) } });
  if (!session || session.expiresAt < new Date()) throw unauthorized('Your session has expired.');
  await db.refreshSession.delete({ where: { id: session.id } });

  if (session.staffId) {
    const staff = await db.staff.findUnique({ where: { id: session.staffId } });
    if (!staff?.isActive) throw unauthorized();
    return issueTokens({ sub: staff.id, kind: 'staff', role: staff.role });
  }
  const customer = await db.customer.findUnique({ where: { id: session.customerId! } });
  if (!customer || customer.status === 'CLOSED') throw unauthorized();
  return issueTokens({ sub: customer.id, kind: 'customer' });
}

export const revokeToken = (refreshToken: string) =>
  db.refreshSession.deleteMany({ where: { tokenHash: sha256(refreshToken) } });

export const requireCustomer: RequestHandler = async (req, _res, next) => {
  try {
    const claims = verifyAccess(bearer(req.headers.authorization));
    if (claims?.kind !== 'customer') throw unauthorized();
    const customer = await db.customer.findUnique({
      where: { id: claims.sub },
      select: { id: true, accountNumber: true, firstName: true, lastName: true, status: true },
    });
    if (!customer || customer.status === 'CLOSED') throw unauthorized();
    req.customer = customer;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireStaff: RequestHandler = async (req, _res, next) => {
  try {
    const claims = verifyAccess(bearer(req.headers.authorization));
    if (claims?.kind !== 'staff') throw unauthorized();
    // Loaded on every request so deactivation and role changes apply immediately.
    const staff = await db.staff.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, fullName: true, branchId: true, isActive: true },
    });
    if (!staff?.isActive) throw unauthorized();
    req.staff = staff;
    next();
  } catch (err) {
    next(err);
  }
};

export const allow =
  (...roles: StaffRole[]): RequestHandler =>
  (req, _res, next) => {
    // Admins can do everything.
    next(req.staff && (req.staff.role === 'ADMIN' || roles.includes(req.staff.role)) ? undefined : forbidden());
  };

/** Everyone in the office. Field agents use the /field API instead. */
export const OFFICE: StaffRole[] = [
  'EXECUTIVE', 'COMMERCIAL_MANAGER', 'TECHNICAL_MANAGER', 'BRANCH_MANAGER',
  'BILLING_CLERK', 'COLLECTIONS_OFFICER', 'AUDITOR',
];
export const COMMERCIAL: StaffRole[] = ['COMMERCIAL_MANAGER', 'BILLING_CLERK'];
export const COLLECTIONS: StaffRole[] = ['COMMERCIAL_MANAGER', 'COLLECTIONS_OFFICER'];
export const TECHNICAL: StaffRole[] = ['TECHNICAL_MANAGER', 'BRANCH_MANAGER'];
