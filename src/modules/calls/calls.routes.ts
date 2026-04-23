import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import prisma from '../../prisma/client';

const router = Router();

// GET /calls/history — история звонков текущего пользователя
router.get('/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user.userId;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const cursor = req.query.cursor as string | undefined;

  const calls = await prisma.callLog.findMany({
    where: {
      OR: [{ initiatorId: userId }, { targetId: userId }],
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      initiator: { select: { id: true, displayName: true, avatarUrl: true } },
      target:    { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  const hasMore = calls.length > limit;
  const items = hasMore ? calls.slice(0, limit) : calls;

  res.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

export default router;
