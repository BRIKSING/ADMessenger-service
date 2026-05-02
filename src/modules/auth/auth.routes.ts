import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { requireAuth, signAccessToken } from '../../middleware/auth';

const router = Router();

const loginSchema = z.object({
  phone: z.string().regex(/^\+7\d{10}$/, 'Phone must be in format +7XXXXXXXXXX'),
  displayName: z.string().min(1).max(64).optional(),
});

// POST /auth/login — тестовая авторизация по телефону без OTP
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { phone, displayName } = parsed.data;

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: { phone, displayName: displayName ?? phone },
    });
    console.log(`[auth] new user registered: ${user.id} (${phone})`);
  } else {
    console.log(`[auth] login: ${user.id} (${phone})`);
  }

  const accessToken = signAccessToken({ userId: user.id, phone: user.phone });

  res.json({ accessToken, user: { id: user.id, phone: user.phone, displayName: user.displayName } });
});

// GET /auth/me
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

export default router;
