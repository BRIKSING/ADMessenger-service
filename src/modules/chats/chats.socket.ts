import { Server } from 'socket.io';
import { AuthSocket } from '../../socket';
import * as ChatsService from './chats.service';
import * as presence from '../presence/presence.service';
import * as notifications from '../notifications/notifications.service';

interface SendPayload {
  chatId: string;
  content: string;
  replyToId?: string;
}

interface ReadPayload {
  chatId: string;
  messageId: string;
}

interface TypingPayload {
  chatId: string;
}

type Ack = (res: object) => void;

export function registerChatHandlers(io: Server, socket: AuthSocket): void {
  const userId = socket.user.userId;

  socket.on('message:send', async (payload: SendPayload, ack?: Ack) => {
    const { chatId, content, replyToId } = payload ?? {};

    if (
      !chatId ||
      typeof content !== 'string' ||
      content.trim().length === 0 ||
      content.length > 4096
    ) {
      ack?.({ error: 'Invalid payload' });
      return;
    }

    if (!(await ChatsService.isMember(chatId, userId))) {
      ack?.({ error: 'Forbidden' });
      return;
    }

    const message = await ChatsService.createMessage(chatId, userId, content.trim(), replyToId);
    console.log(`[chat] message sent: ${message.id} in chat ${chatId} by ${userId}`);

    const members = await ChatsService.getChatMembers(chatId);
    for (const memberId of members) {
      if (memberId !== userId) {
        io.to(memberId).emit('message:new', message);

        const online = await presence.isOnline(memberId);
        if (!online) {
          notifications.sendMessagePush(memberId, message).catch((err) =>
            console.error('[push] sendMessagePush error:', err)
          );
        }
      }
    }

    socket.emit('message:ack', { messageId: message.id, chatId });
    ack?.({ ok: true, message });
  });

  socket.on('message:read', async (payload: ReadPayload) => {
    const { chatId, messageId } = payload ?? {};
    if (!chatId || !messageId) return;

    if (!(await ChatsService.isMember(chatId, userId))) return;

    await ChatsService.markRead(chatId, userId, messageId);
    console.log(`[chat] messages read up to ${messageId} in chat ${chatId} by ${userId}`);

    const members = await ChatsService.getChatMembers(chatId);
    for (const memberId of members) {
      if (memberId !== userId) {
        io.to(memberId).emit('message:read', { chatId, messageId, userId, readAt: new Date() });
      }
    }
  });

  socket.on('typing:start', async (payload: TypingPayload) => {
    const { chatId } = payload ?? {};
    if (!chatId) return;

    if (!(await ChatsService.isMember(chatId, userId))) return;

    const members = await ChatsService.getChatMembers(chatId);
    for (const memberId of members) {
      if (memberId !== userId) {
        io.to(memberId).emit('typing:start', { chatId, userId });
      }
    }
  });

  socket.on('typing:stop', async (payload: TypingPayload) => {
    const { chatId } = payload ?? {};
    if (!chatId) return;

    if (!(await ChatsService.isMember(chatId, userId))) return;

    const members = await ChatsService.getChatMembers(chatId);
    for (const memberId of members) {
      if (memberId !== userId) {
        io.to(memberId).emit('typing:stop', { chatId, userId });
      }
    }
  });
}
