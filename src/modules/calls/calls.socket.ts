import { Server } from 'socket.io';
import { AuthSocket } from '../../socket';
import prisma from '../../prisma/client';
import { CallType } from '@prisma/client';

interface CallOfferPayload {
  targetUserId: string;
  sdp: string;
  type: 'VOICE' | 'VIDEO';
}

interface CallAnswerPayload {
  callId: string;
  targetUserId: string;
  sdp: string;
}

interface IceCandidatePayload {
  callId: string;
  targetUserId: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

interface HangupPayload {
  callId: string;
  targetUserId: string;
}

// callId → { initiatorId, targetId, startedAt }
const activeCalls = new Map<string, { initiatorId: string; targetId: string; startedAt: Date }>();

export function registerCallHandlers(io: Server, socket: AuthSocket): void {
  const callerId = socket.user.userId;

  // Инициатор отправляет оффер
  socket.on('call:offer', async (payload: CallOfferPayload) => {
    const { targetUserId, sdp, type } = payload;

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      socket.emit('call:error', { message: 'User not found' });
      return;
    }

    const callLog = await prisma.callLog.create({
      data: {
        initiatorId: callerId,
        targetId: targetUserId,
        type: type as CallType,
        status: 'MISSED', // будет обновлено при ответе или отклонении
      },
    });

    activeCalls.set(callLog.id, { initiatorId: callerId, targetId: targetUserId, startedAt: new Date() });

    // Пересылаем оффер адресату
    io.to(targetUserId).emit('call:incoming', {
      callId: callLog.id,
      fromUserId: callerId,
      sdp,
      type,
    });
  });

  // Адресат принимает звонок
  socket.on('call:answer', async (payload: CallAnswerPayload) => {
    const { callId, targetUserId, sdp } = payload;

    const call = activeCalls.get(callId);
    if (!call) {
      socket.emit('call:error', { message: 'Call not found' });
      return;
    }

    await prisma.callLog.update({
      where: { id: callId },
      data: { status: 'ACCEPTED', startedAt: new Date() },
    });

    if (call.startedAt) {
      activeCalls.set(callId, { ...call, startedAt: new Date() });
    }

    io.to(targetUserId).emit('call:answered', { callId, sdp });
  });

  // ICE-кандидат (от обоих участников)
  socket.on('call:ice-candidate', (payload: IceCandidatePayload) => {
    const { targetUserId, candidate, callId } = payload;
    io.to(targetUserId).emit('call:ice-candidate', { callId, candidate, fromUserId: callerId });
  });

  // Завершение звонка
  socket.on('call:hangup', async (payload: HangupPayload) => {
    const { callId, targetUserId } = payload;

    const call = activeCalls.get(callId);
    if (call) {
      const endedAt = new Date();
      await prisma.callLog.update({
        where: { id: callId },
        data: { endedAt },
      });
      activeCalls.delete(callId);
    }

    io.to(targetUserId).emit('call:hangup', { callId });
  });

  // Адресат отклоняет звонок
  socket.on('call:decline', async (payload: { callId: string; targetUserId: string }) => {
    const { callId, targetUserId } = payload;

    await prisma.callLog.update({
      where: { id: callId },
      data: { status: 'DECLINED' },
    }).catch(() => null);

    activeCalls.delete(callId);
    io.to(targetUserId).emit('call:declined', { callId });
  });
}
