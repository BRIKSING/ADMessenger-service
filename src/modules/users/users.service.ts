import crypto from 'crypto';
import prisma from '../../prisma/client';

const PUBLIC_USER_FIELDS = {
  id: true,
  displayName: true,
  username: true,
  avatarUrl: true,
  bio: true,
  lastSeen: true,
} as const;

export async function syncContacts(ownerId: string, phoneHashes: string[]): Promise<object[]> {
  // Получаем всех пользователей кроме себя
  const allUsers = await prisma.user.findMany({
    where: { id: { not: ownerId } },
    select: { ...PUBLIC_USER_FIELDS, phone: true },
  });

  // Находим пересечение: хэшируем телефоны со стороны сервера и сравниваем
  const matched = allUsers.filter((u) => {
    const hash = crypto.createHash('sha256').update(u.phone).digest('hex');
    return phoneHashes.includes(hash);
  });

  if (matched.length === 0) return [];

  // Upsert контактов в таблицу Contact
  await prisma.$transaction(
    matched.map((u) =>
      prisma.contact.upsert({
        where: { ownerId_contactId: { ownerId, contactId: u.id } },
        create: { ownerId, contactId: u.id },
        update: {},
      })
    )
  );

  // Возвращаем без поля phone
  return matched.map(({ phone: _phone, ...rest }) => rest);
}

export async function getContacts(ownerId: string): Promise<object[]> {
  const rows = await prisma.contact.findMany({
    where: { ownerId },
    include: { contact: { select: PUBLIC_USER_FIELDS } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.contact);
}

export async function searchUsers(query: string, requesterId: string): Promise<object[]> {
  const q = query.trim();
  if (!q) return [];

  return prisma.user.findMany({
    where: {
      id: { not: requesterId },
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: PUBLIC_USER_FIELDS,
    take: 20,
  });
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.block.delete({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  }).catch(() => null);
}

export async function getBlockedUsers(blockerId: string): Promise<object[]> {
  const rows = await prisma.block.findMany({
    where: { blockerId },
    include: { blocked: { select: PUBLIC_USER_FIELDS } },
  });
  return rows.map((r) => r.blocked);
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const row = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  return row !== null;
}

export async function updateProfile(
  userId: string,
  data: { displayName?: string; username?: string; bio?: string }
): Promise<object> {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: PUBLIC_USER_FIELDS,
  });
}
