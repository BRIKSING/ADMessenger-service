import 'dotenv/config';
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 30;
import http from 'http';
import express from 'express';
import { config } from './config';
import { createSocketServer } from './socket';
import authRoutes from './modules/auth/auth.routes';
import callsRoutes from './modules/calls/calls.routes';
import usersRoutes from './modules/users/users.routes';
import chatsRoutes from './modules/chats/chats.routes';
import * as logger from './logger';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/calls', callsRoutes);
app.use('/users', usersRoutes);
app.use('/chats', chatsRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
createSocketServer(httpServer);

httpServer.listen(config.port, () => {
  logger.log(`Server running on port ${config.port}`);
});
