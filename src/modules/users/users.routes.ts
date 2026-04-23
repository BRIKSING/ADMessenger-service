import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import * as UsersService from './users.service';

const router = Router();
router.use(requireAuth);

// POST /users/contacts/sync
// Тело: { hashes: ["sha256...", ...] }  — хэши телефонов из телефонной книги устройства
router.post('/contacts/sync', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ hashes: z.array(z.string().length(64)).min(1).max(5000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const contacts = await UsersService.syncContacts(req.user.userId, parsed.data.hashes);
  res.json({ contacts });
});

// GET /users/contacts — список сохранённых контактов
router.get('/contacts', async (req: Request, res: Response): Promise<void> => {
  const contacts = await UsersService.getContacts(req.user.userId);
  res.json({ contacts });
});

// GET /users/search?q=...
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q ?? '').slice(0, 64);
  if (!q) { res.status(400).json({ error: 'Query is required' }); return; }

  const users = await UsersService.searchUsers(q, req.user.userId);
  res.json({ users });
});

// POST /users/:id/block
router.post('/:id/block', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (id === req.user.userId) { res.status(400).json({ error: 'Cannot block yourself' }); return; }

  await UsersService.blockUser(req.user.userId, id);
  res.json({ ok: true });
});

// DELETE /users/:id/block
router.delete('/:id/block', async (req: Request, res: Response): Promise<void> => {
  await UsersService.unblockUser(req.user.userId, req.params.id);
  res.json({ ok: true });
});

// GET /users/blocked — список заблокированных
router.get('/blocked', async (req: Request, res: Response): Promise<void> => {
  const users = await UsersService.getBlockedUsers(req.user.userId);
  res.json({ users });
});

// PATCH /users/me — обновить профиль
router.patch('/me', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    displayName: z.string().min(1).max(64).optional(),
    username:    z.string().min(3).max(32).regex(/^[a-z0-9_]+$/).optional(),
    bio:         z.string().max(256).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const user = await UsersService.updateProfile(req.user.userId, parsed.data);
  res.json(user);
});

export default router;
