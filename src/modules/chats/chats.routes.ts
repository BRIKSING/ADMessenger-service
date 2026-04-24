import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import * as ChatsService from './chats.service';

const router = Router();
router.use(requireAuth);

// GET /chats
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const chats = await ChatsService.getChats(req.user.userId);
  res.json({ chats });
});

// POST /chats
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const schema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('DIRECT'),
      targetUserId: z.string().uuid(),
    }),
    z.object({
      type: z.literal('GROUP'),
      name: z.string().min(1).max(64),
      memberIds: z.array(z.string().uuid()).min(1).max(19),
    }),
  ]);

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = req.user.userId;

  if (parsed.data.type === 'DIRECT') {
    if (parsed.data.targetUserId === userId) {
      res.status(400).json({ error: 'Cannot create chat with yourself' });
      return;
    }
    const chat = await ChatsService.createDirectChat(userId, parsed.data.targetUserId);
    res.status(201).json(chat);
  } else {
    const chat = await ChatsService.createGroupChat(userId, parsed.data.name, parsed.data.memberIds);
    res.status(201).json(chat);
  }
});

// GET /chats/:id/messages
router.get('/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!(await ChatsService.isMember(id, req.user.userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const cursor = req.query.cursor as string | undefined;

  const result = await ChatsService.getMessages(id, limit, cursor);
  res.json(result);
});

// PATCH /chats/:id/messages/:msgId  — редактирование
router.patch('/:id/messages/:msgId', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ content: z.string().min(1).max(4096) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!(await ChatsService.isMember(req.params.id, req.user.userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const msg = await ChatsService.editMessage(req.params.msgId, req.user.userId, parsed.data.content);
  if (!msg) {
    res.status(404).json({ error: 'Message not found or not editable' });
    return;
  }

  res.json(msg);
});

// DELETE /chats/:id/messages/:msgId  — удаление
router.delete('/:id/messages/:msgId', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ forAll: z.boolean().default(false) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!(await ChatsService.isMember(req.params.id, req.user.userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const result = await ChatsService.deleteMessage(
    req.params.msgId,
    req.user.userId,
    parsed.data.forAll
  );

  if (!result) {
    res.status(404).json({ error: 'Message not found or cannot be deleted' });
    return;
  }

  res.json({ ok: true });
});

export default router;
