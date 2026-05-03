import apn from 'apn';
import { config } from '../../config';
import prisma from '../../prisma/client';
import type { MessageView } from '../chats/chats.service';
import * as logger from '../../logger';

// @types/apn 2.1.x не включает pushType, добавляем вручную
type ApnNotification = apn.Notification & { pushType?: string };

let _provider: apn.Provider | null = null;

function getProvider(): apn.Provider | null {
  if (_provider) return _provider;

  const { keyPath, keyId, teamId, bundleId } = config.apns;
  if (!keyPath || !keyId || !teamId || !bundleId) {
    logger.warn('[APNs] not configured — push notifications disabled');
    return null;
  }

  try {
    _provider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production: config.apns.production,
    });
    logger.log(`[APNs] provider initialized (production=${config.apns.production})`);
  } catch (err) {
    logger.error('[APNs] provider init failed:', err);
  }
  return _provider;
}

async function removeInvalidTokens(failed: apn.ResponseFailure[]): Promise<void> {
  const stale = failed
    .filter((f) => ['BadDeviceToken', 'Unregistered'].includes(f.response?.reason ?? ''))
    .map((f) => f.device);

  if (stale.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: stale } } });
  }
}

// Обычный APNs — новое сообщение в чате
export async function sendMessagePush(
  targetUserId: string,
  message: MessageView
): Promise<void> {
  const provider = getProvider();
  if (!provider) return;

  const rows = await prisma.deviceToken.findMany({
    where: { userId: targetUserId, type: 'APNS' },
    select: { token: true },
  });
  if (rows.length === 0) {
    logger.log(`[APNs] no APNS tokens for user ${targetUserId} — skipping`);
    return;
  }

  logger.log(`[APNs] sending message push to ${targetUserId} (${rows.length} token(s))`);
  const note = new apn.Notification() as ApnNotification;
  note.topic    = config.apns.bundleId;
  note.pushType = 'alert';
  note.expiry   = Math.floor(Date.now() / 1000) + 3600;
  note.badge    = 1;
  note.sound    = 'default';
  note.alert    = {
    title: message.sender.displayName,
    body:  message.content ?? '📎 Вложение',
  };
  note.payload = { chatId: message.chatId, messageId: message.id };

  const result = await provider.send(note, rows.map((r: { token: string }) => r.token));
  logger.log(`[APNs] message push result — sent: ${result.sent.length}, failed: ${result.failed.length}`);
  if (result.failed.length > 0) logger.error('[APNs] failed:', JSON.stringify(result.failed));
  await removeInvalidTokens(result.failed);
}

// PushKit VoIP Push — входящий звонок
export async function sendCallPush(
  targetUserId: string,
  callId: string,
  fromUserId: string,
  callerName: string,
  callType: 'VOICE' | 'VIDEO'
): Promise<void> {
  const provider = getProvider();
  if (!provider) return;

  const rows = await prisma.deviceToken.findMany({
    where: { userId: targetUserId, type: 'APNS_VOIP' },
    select: { token: true },
  });
  if (rows.length === 0) return;

  const note = new apn.Notification() as ApnNotification;
  note.topic    = `${config.apns.bundleId}.voip`;
  note.pushType = 'voip';
  note.priority = 10;
  note.expiry   = Math.floor(Date.now() / 1000) + 30;
  note.payload  = { callId, fromUserId, callerName, callType };

  const result = await provider.send(note, rows.map((r: { token: string }) => r.token));
  await removeInvalidTokens(result.failed);
}

// FCM — заглушка, реализовать при добавлении Android
export async function sendFcmPush(
  _targetUserId: string,
  _payload: object
): Promise<void> {
  logger.warn('[FCM] not yet implemented');
}
