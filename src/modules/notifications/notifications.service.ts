import apn from 'apn';
import { config } from '../../config';
import prisma from '../../prisma/client';
import type { MessageView } from '../chats/chats.service';

let _provider: apn.Provider | null = null;

function getProvider(): apn.Provider | null {
  if (_provider) return _provider;

  const { keyPath, keyId, teamId, bundleId } = config.apns;
  if (!keyPath || !keyId || !teamId || !bundleId) return null;

  try {
    _provider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production: config.apns.production,
    });
  } catch (err) {
    console.error('[APNs] provider init failed:', err);
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
  if (rows.length === 0) return;

  const note = new apn.Notification();
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

  const result = await provider.send(note, rows.map((r) => r.token));
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

  const note = new apn.Notification();
  note.topic    = `${config.apns.bundleId}.voip`;
  note.pushType = 'voip';
  note.priority = 10;
  note.expiry   = Math.floor(Date.now() / 1000) + 30;
  note.payload  = { callId, fromUserId, callerName, callType };

  const result = await provider.send(note, rows.map((r) => r.token));
  await removeInvalidTokens(result.failed);
}

// FCM — заглушка, реализовать при добавлении Android
export async function sendFcmPush(
  _targetUserId: string,
  _payload: object
): Promise<void> {
  console.warn('[FCM] not yet implemented');
}
