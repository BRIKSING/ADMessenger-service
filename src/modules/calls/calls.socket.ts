import { Server } from 'socket.io';
import { AuthSocket } from '../../socket';
import prisma from '../../prisma/client';
import { CallType } from '@prisma/client';
import * as presence from '../presence/presence.service';
import * as notifications from '../notifications/notifications.service';

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

  socket.on('call:offer', async (payload: CallOfferPayload) => {
    const { targetUserId, sdp, type } = payload;

    const [target, caller] = await Promise.all([
      prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, displayName: true } }),
      prisma.user.findUnique({ where: { id: callerId },     select: { displayName: true } }),
    ]);

    if (!target) {
      socket.emit('call:error', { message: 'User not found' });
      return;
    }

    const callLog = await prisma.callLog.create({
      data: {
        initiatorId: callerId,
        targetId: targetUserId,
        type: type as CallType,
        status: 'MISSED',
      },
    });

    activeCalls.set(callLog.id, { initiatorId: callerId, targetId: targetUserId, startedAt: new Date() });

    io.to(targetUserId).emit('call:incoming', {
      callId: callLog.id,
      fromUserId: callerId,
      sdp,
      type,
    });

    // VoIP push если адресат офлайн
    const targetOnline = await presence.isOnline(targetUserId);
    if (!targetOnline && caller) {
      notifications
        .sendCallPush(targetUserId, callLog.id, callerId, caller.displayName, type)
        .catch((err) => console.error('[push] sendCallPush error:', err));
    }
  });

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

    activeCalls.set(callId, { ...call, startedAt: new Date() });

    io.to(targetUserId).emit('call:answered', { callId, sdp });
  });

  socket.on('call:ice-candidate', (payload: IceCandidatePayload) => {
    const { targetUserId, candidate, callId } = payload;
    io.to(targetUserId).emit('call:ice-candidate', { callId, candidate, fromUserId: callerId });
  });

  socket.on('call:hangup', async (payload: HangupPayload) => {
    const { callId, targetUserId } = payload;

    const call = activeCalls.get(callId);
    if (call) {
      await prisma.callLog.update({
        where: { id: callId },
        data: { endedAt: new Date() },
      });
      activeCalls.delete(callId);
    }

    io.to(targetUserId).emit('call:hangup', { callId });
  });

  socket.on('call:decline', async (payload: { callId: string; targetUserId: string }) => {
    const { callId, targetUserId } = payload;

    await prisma.callLog
      .update({ where: { id: callId }, data: { status: 'DECLINED' } })
      .catch(() => null);

    activeCalls.delete(callId);
    io.to(targetUserId).emit('call:declined', { callId });
  });
}
