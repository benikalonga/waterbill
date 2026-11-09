import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { db } from '../lib/db';

/** Record who did what. Never blocks the action it describes. */
export function audit(req: Request, action: string, entity: string, entityId?: string, detail?: Prisma.InputJsonValue) {
  if (!req.staff) return;
  db.auditEntry
    .create({ data: { staffId: req.staff.id, action, entity, entityId, detail } })
    .catch((err) => console.warn('[audit] failed:', err.message));
}
