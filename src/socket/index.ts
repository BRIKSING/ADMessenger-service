import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../middleware/auth';
import { registerCallHandlers } from '../modules/calls/calls.socket';
import { registerChatHandlers } from '../modules/chats/chats.socket';

export interface AuthSocket extends Socket {
  user: JwtPayload;
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // JWT авторизация при handshake
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

  io.on('connection', (socket) => {
    const authSocket = socket as AuthSocket;
    const { userId } = authSocket.user;

    // Каждый пользователь присоединяется к своей персональной комнате
    socket.join(userId);

    socket.on('disconnect', () => {
      socket.leave(userId);
    });

    registerCallHandlers(io, authSocket);
    registerChatHandlers(io, authSocket);
  });

  return io;
}
