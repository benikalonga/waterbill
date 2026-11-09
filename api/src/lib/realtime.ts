import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { verifyAccess } from './auth';
import { db } from './db';

let io: Server | null = null;

/** Rooms: "staff" (all staff), "staff:<id>", "customer:<id>". */
export function startRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: config.webUrl, credentials: true },
    pingInterval: 25000,
    pingTimeout: 60000, // patient on weak mobile networks
  });

  io.use((socket, next) => {
    const claims = verifyAccess(socket.handshake.auth?.token as string | undefined);
    if (!claims) return next(new Error('unauthorized'));
    socket.data.claims = claims;
    next();
  });

  io.on('connection', (socket) => {
    const { sub, kind } = socket.data.claims as { sub: string; kind: string };
    if (kind === 'customer') {
      socket.join(`customer:${sub}`);
      return;
    }
    socket.join(['staff', `staff:${sub}`]);

    let last = 0;
    socket.on('agent:position', async (p: { lat?: unknown; lng?: unknown }) => {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Date.now() - last < 5000) return;
      last = Date.now();
      await db.staff.update({ where: { id: sub }, data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() } }).catch(() => undefined);
      toStaff('agent:position', { staffId: sub, lat, lng });
    });
  });
  return io;
}

export const toCustomer = (id: string, event: string, payload: unknown) => io?.to(`customer:${id}`).emit(event, payload);
export const toStaffMember = (id: string, event: string, payload: unknown) => io?.to(`staff:${id}`).emit(event, payload);
export const toStaff = (event: string, payload: unknown) => io?.to('staff').emit(event, payload);
