import crypto from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = 'Please sign in again.') => new HttpError(401, m);
export const forbidden = (m = 'You do not have access to this.') => new HttpError(403, m);
export const notFound = (m = 'Not found.') => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

/** Forward rejected promises from async handlers to the error middleware. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function paging(query: Request['query'], defaultLimit = 25) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export const listOf = <T>(items: T[], total: number, p: { page: number; limit: number }) => ({
  items,
  total,
  page: p.page,
  pages: Math.max(1, Math.ceil(total / p.limit)),
});

/** Human-friendly unique reference, e.g. "INV-7KQ2M9XA". */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function reference(prefix: string, length = 8): string {
  let out = '';
  for (const byte of crypto.randomBytes(length)) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${out}`;
}

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Constant-time comparison for shared secrets. */
export function secretMatches(received: string | undefined, expected: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(sha256(received));
  const b = Buffer.from(sha256(expected));
  return crypto.timingSafeEqual(a, b);
}

/** Current billing period as YYYY-MM. */
export const periodOf = (d: Date) => d.toISOString().slice(0, 7);

export const round = (n: number) => Math.round(n);
