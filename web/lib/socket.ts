'use client';
import { io, type Socket } from 'socket.io-client';
import { API_URL, session, type Audience } from './api';

const sockets: Partial<Record<Audience, Socket>> = {};

export function liveSocket(a: Audience): Socket | null {
  if (sockets[a]) return sockets[a]!;
  if (!session.get(a)) return null;
  const socket = io(API_URL, {
    // Read the token on every connection attempt, so a refreshed one is used.
    auth: (cb) => cb({ token: session.get(a)?.accessToken }),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 30000,
  });
  sockets[a] = socket;
  return socket;
}

export function closeSocket(a: Audience) {
  sockets[a]?.disconnect();
  delete sockets[a];
}
