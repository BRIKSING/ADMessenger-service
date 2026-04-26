import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { config } from '../../config';
import prisma from '../../prisma/client';

const router = Router();

// GET /calls/turn-credentials
// Генерирует временные HMAC-credentials для Coturn (REST API, RFC 5766).
// Coturn должен быть запущен с опциями: use-auth-secret, static-auth-secret=<TURN_SECRET>
router.get('/turn-credentials', requireAuth, (req: Request, res: Response): void => {
  const { server, secret, ttl } = config.turn;

  if (!server || !secret) {
    res.status(503).json({ error: 'TURN server not configured' });
    return;
  }

  const expiry   = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${req.user.userId}`;
  const password = crypto.createHmac('sha1', secret).update(username).digest('base64');

  res.json({
    username,
    password,
    ttl,
    uris: [
      `stun:${server}`,
      `turn:${server}?transport=udp`,
      `turn:${server}?transport=tcp`,
    ],
  });
});

// GET /calls/history
router.get('/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user.userId;
  const limit  = Math.min(Number(req.query.limit) || 20, 100);
  const cursor = req.query.cursor as string | undefined;

  const calls = await prisma.callLog.findMany({
    where: { OR: [{ initiatorId: userId }, { targetId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      initiator: { select: { id: true, displayName: true, avatarUrl: true } },
      target:    { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  const hasMore = calls.length > limit;
  const items   = hasMore ? calls.slice(0, limit) : calls;

  res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
});

export default router;
