import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../middleware/auth';
import { registerCallHandlers } from '../modules/calls/calls.socket';
import { registerChatHandlers } from '../modules/chats/chats.socket';
import * as presence from '../modules/presence/presence.service';

export interface AuthSocket extends Socket {
  user: JwtPayload;
}

// userId → количество активных сокетов (поддержка нескольких устройств)
const connectionCount = new Map<string, number>();

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as Record<string, string>).token ||
      (socket.handshake.headers.authorization as string | undefined)?.replace('Bearer ', '');

    if (!token) return next(new Error('Unauthorized'));

    try {
      (socket as AuthSocket).user = jwt.verify(token, config.jwt.secret) as JwtPayload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const authSocket = socket as AuthSocket;
    const { userId } = authSocket.user;

    socket.join(userId);

    // --- presence: подключение ---
    const prev = connectionCount.get(userId) ?? 0;
    connectionCount.set(userId, prev + 1);

    await presence.setOnline(userId);

    // Новый клиент получает снимок онлайн-пользователей
    const onlineIds = [...connectionCount.entries()]
      .filter(([id, count]) => count > 0 && id !== userId)
      .map(([id]) => id);
    socket.emit('presence:snapshot', { onlineUserIds: onlineIds });

    // Остальные узнают, что пользователь вышел онлайн (только при первом устройстве)
    if (prev === 0) {
      socket.broadcast.emit('presence:update', { userId, online: true });
    }

    // --- отключение ---
    socket.on('disconnect', async () => {
      socket.leave(userId);

      const remaining = (connectionCount.get(userId) ?? 1) - 1;
      if (remaining <= 0) {
        connectionCount.delete(userId);
        await presence.setOffline(userId); // del Redis + lastSeen в БД
        io.emit('presence:update', { userId, online: false, lastSeen: new Date() });
      } else {
        connectionCount.set(userId, remaining);
      }
    });

    registerCallHandlers(io, authSocket);
    registerChatHandlers(io, authSocket);
  });

  return io;
}
