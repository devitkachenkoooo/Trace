'use server';

import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/db';
import { chats, messages, users } from '@/db/schema';

export async function getFullChatAction(chatId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat) return { success: false, error: 'Chat not found' };

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
      orderBy: [desc(messages.createdAt)],
    });

    const otherUserId = chat.userId === session.user.id ? chat.recipientId : chat.userId;
    if (!otherUserId) return { success: true, data: { ...chat, messages: chatMessages, participants: [] } };

    const otherUser = await db.query.users.findFirst({
      where: eq(users.id, otherUserId),
    });

    return {
      success: true,
      data: {
        ...chat,
        messages: chatMessages,
        participants: otherUser ? [otherUser] : [],
      },
    };
  } catch (error) {
    console.error('Error fetching full chat:', error);
    return { success: false, error: 'Failed to fetch chat details' };
  }
}

export async function searchUsersAction(query: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const myId = session.user.id;

  try {
    if (!query) {
      // Find all chats where I am a participant
      const myChats = await db.query.chats.findMany({
        where: or(eq(chats.userId, myId), eq(chats.recipientId, myId)),
        with: {
          // This assumes you have relations defined in drizzle
          // If not, we'll need to fetch the user IDs and then the users
        },
      });

      // Get unique IDs of people I've chatted with
      const participantIds = myChats.map((c) => (c.userId === myId ? c.recipientId : c.userId)).filter(Boolean) as string[];

      if (participantIds.length === 0) {
        return { success: true, data: [] };
      }

      const results = await db.query.users.findMany({
        where: and(ne(users.id, myId), or(...participantIds.map((id) => eq(users.id, id)))),
      });

      return { success: true, data: results };
    }

    const results = await db.query.users.findMany({
      where: and(ne(users.id, myId), or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`))),
      limit: 10,
    });
    return { success: true, data: results };
  } catch (error) {
    console.error('Error searching users:', error);
    return { success: false, error: 'Failed to search users' };
  }
}

export async function getOrCreateChatAction(targetUserId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const myId = session.user.id;

  // Шукаємо існуючий чат 1-на-1
  const existingChat = await db.query.chats.findFirst({
    where: or(
      and(eq(chats.userId, myId), eq(chats.recipientId, targetUserId)),
      and(eq(chats.userId, targetUserId), eq(chats.recipientId, myId)),
    ),
  });

  if (existingChat) {
    redirect(`/chat/${existingChat.id}`);
  }

  // Отримуємо ім'я отримувача для заголовка чату (опційно)
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  });

  // Створюємо новий чат
  const [newChat] = await db
    .insert(chats)
    .values({
      userId: myId,
      recipientId: targetUserId,
      title: targetUser?.name || 'Приватний чат',
    })
    .returning();

  revalidatePath('/');
  redirect(`/chat/${newChat.id}`);
}
