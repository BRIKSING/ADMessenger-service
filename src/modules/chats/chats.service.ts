import prisma from '../../prisma/client';

const MESSAGE_SELECT = {
  id: true,
  chatId: true,
  senderId: true,
  type: true,
  content: true,
  replyToId: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  sender: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  replyTo: {
    select: { id: true, senderId: true, content: true, type: true, deletedAt: true },
  },
} as const;

export type MessageView = Awaited<ReturnType<typeof createMessage>>;

export async function getChats(userId: string) {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    include: {
      chat: {
        include: {
          members: {
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true, lastSeen: true } },
            },
          },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: MESSAGE_SELECT,
          },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });

  return Promise.all(
    memberships.map(async (m) => {
      const unreadCount = await prisma.message.count({
        where: {
          chatId: m.chatId,
          senderId: { not: userId },
          deletedAt: null,
          reads: { none: { userId } },
        },
      });
      return {
        ...m.chat,
        lastMessage: m.chat.messages[0] ?? null,
        unreadCount,
      };
    })
  );
}

export async function createDirectChat(creatorId: string, targetUserId: string) {
  const existing = await prisma.chat.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId: creatorId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
    include: {
      members: {
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
    },
  });

  if (existing) return existing;

  return prisma.chat.create({
    data: {
      type: 'DIRECT',
      members: { create: [{ userId: creatorId }, { userId: targetUserId }] },
    },
    include: {
      members: {
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
    },
  });
}

export async function createGroupChat(creatorId: string, name: string, memberIds: string[]) {
  const allMembers = Array.from(new Set([creatorId, ...memberIds]));

  return prisma.chat.create({
    data: {
      type: 'GROUP',
      name,
      members: { create: allMembers.map((userId) => ({ userId })) },
    },
    include: {
      members: {
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
    },
  });
}

export async function isMember(chatId: string, userId: string): Promise<boolean> {
  const row = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  return row !== null;
}

export async function getChatMembers(chatId: string): Promise<string[]> {
  const rows = await prisma.chatMember.findMany({
    where: { chatId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function getMessages(chatId: string, limit: number, cursor?: string) {
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: MESSAGE_SELECT,
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, limit) : messages;

  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function createMessage(
  chatId: string,
  senderId: string,
  content: string,
  replyToId?: string
) {
  return prisma.message.create({
    data: { chatId, senderId, type: 'TEXT', content, replyToId: replyToId ?? null },
    select: MESSAGE_SELECT,
  });
}

export async function editMessage(messageId: string, senderId: string, content: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.senderId !== senderId || msg.deletedAt) return null;

  return prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    select: MESSAGE_SELECT,
  });
}

export async function deleteMessage(messageId: string, senderId: string, forAll: boolean) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.deletedAt) return null;
  if (forAll && msg.senderId !== senderId) return null;

  if (forAll && Date.now() - msg.createdAt.getTime() > 48 * 60 * 60 * 1000) return null;

  return prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), ...(forAll ? { content: null } : {}) },
    select: { id: true, chatId: true, deletedAt: true, senderId: true },
  });
}

export async function markRead(chatId: string, userId: string, messageId: string) {
  const pivot = await prisma.message.findUnique({ where: { id: messageId } });
  if (!pivot || pivot.chatId !== chatId) return;

  const unread = await prisma.message.findMany({
    where: {
      chatId,
      senderId: { not: userId },
      createdAt: { lte: pivot.createdAt },
      deletedAt: null,
      reads: { none: { userId } },
    },
    select: { id: true },
  });

  if (unread.length === 0) return;

  await prisma.messageRead.createMany({
    data: unread.map((m) => ({ messageId: m.id, userId })),
    skipDuplicates: true,
  });
}
