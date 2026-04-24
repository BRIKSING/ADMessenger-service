import redis from '../../redis/client';
import prisma from '../../prisma/client';

// TTL — страховка на случай падения сервера без корректного disconnect
const PRESENCE_TTL_SEC = 60;

export async function setOnline(userId: string): Promise<void> {
  await redis.set(`presence:${userId}`, '1', 'EX', PRESENCE_TTL_SEC);
}

export async function setOffline(userId: string): Promise<void> {
  const now = new Date();
  await Promise.all([
    redis.del(`presence:${userId}`),
    prisma.user.update({ where: { id: userId }, data: { lastSeen: now } }),
  ]);
}

export async function isOnline(userId: string): Promise<boolean> {
  return (await redis.exists(`presence:${userId}`)) === 1;
}
